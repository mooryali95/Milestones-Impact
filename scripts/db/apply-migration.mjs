#!/usr/bin/env node
// يطبّق ترحيلات مسمّاة على القاعدة الحية بالترتيب عبر Management API (الطريقة الموثقة في RUNBOOK.md §1)،
// ويتحقق بعد كل ترحيل (منذ سجل 20261105110000) أنه سجّل نفسه في leaders.schema_migrations.
// لا يُشغَّل إلا بقرار المالك الذي يسمّي الترحيل (سير migrate.yml أو يدويًا):
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/apply-migration.mjs <name> [<name> ...]
// المسجّل سلفًا في السجل يُتخطى، وأول فشل يوقف السلسلة برمز خروج 1، وتعذّر قراءة السجل (غير «غير موجود») يوقفها كذلك.
// كل ترحيل يُلف في معاملة صريحة بمهلة أقفال 3 ثوانٍ ومهلة تنفيذ 60 ثانية، ويُعاد بتراجع عند فشل القفل وحده
// (scripts/db/migration-tx.mjs، تصور تحديث المنصة بلا أثر، المرحلة 6).
// الوضع --check قراءة فقط: الامتدادات، الجدولة cron.job وآخر 10 تشغيلات، أسماء أسرار Vault (بلا قيم)، والسجل.
// يخرج برمز 1 إن غابت مهمة متوقعة أو سرّ الجدولة أو امتداد.
// الوضع --verify <ملف> قراءة فقط: يشغّل فحوص ملف في scripts/db (verify-*.sql) كلًا في معاملة للقراءة فقط،
// ويطبع لكل فحص صفه (ok، detail)، ويخرج برمز 1 إن كان أي ok = false.
import { existsSync, readFileSync } from 'node:fs';
import { applyPlan, applyWithRetry, inLedger as ledgerHas } from './migration-tx.mjs';

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const LEDGER_FROM = '20261105110000';
const NAME_RE = /^\d{14}_[a-z0-9_]+$/;

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب'); process.exit(2); }
const CHECK = process.argv.includes('--check');
const VERIFY = process.argv.includes('--verify') ? process.argv[process.argv.indexOf('--verify') + 1] : null;
const names = VERIFY ? [] : process.argv.slice(2).filter((a) => a !== '--check').map((n) => n.trim().replace(/\.sql$/, '')).filter(Boolean);
if (!CHECK && !VERIFY && !names.length) { console.error('سمِّ ترحيلًا واحدًا على الأقل، أو --check للقراءة فقط'); process.exit(2); }
for (const n of names) if (!NAME_RE.test(n)) { console.error(`اسم ترحيل غير صالح: ${n}`); process.exit(2); }

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 1200)}`);
  try { return text ? JSON.parse(text) : []; } catch { return []; }
}
// السجل غير موجود (قبل 20261105110000) يعني غير مطبّق، وأي خطأ آخر يرمي فيوقف السلسلة (migration-tx.mjs)
const inLedger = (name) => ledgerHas(query, name);

// ── verify: فحوص قراءة فقط من ملف verify-*.sql، كل فحص في معاملة للقراءة فقط ──
if (VERIFY) {
  if (!/^scripts\/db\/verify-[a-z0-9-]+\.sql$/.test(VERIFY) || !existsSync(VERIFY)) { console.error(`ملف تحقق غير صالح: ${VERIFY}`); process.exit(2); }
  // الفحوص مفصولة بسطر تعليق «-- n) العنوان»، وكل فحص استعلام select واحد
  const checks = readFileSync(VERIFY, 'utf8').split(/^(?=-- \d+\) )/m).filter((c) => /^-- \d+\) /.test(c))
    .map((c) => ({ title: c.split('\n')[0].slice(3).trim(), sql: c.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim().replace(/;\s*$/, '') }));
  let bad = 0;
  for (const c of checks) {
    if (!/^(select|with)\b/i.test(c.sql) || /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(c.sql)) { console.error(`✗ ${c.title}: ليس استعلام قراءة`); bad++; continue; }
    try {
      // المعاملة للقراءة فقط: أي كتابة تُرفض من القاعدة نفسها
      const rows = await query(`set transaction read only; ${c.sql}`);
      const r = rows[0] || {};
      console.log(`${r.ok ? '✓' : '✗'} ${c.title}\n    ${r.detail ?? '(لا تفاصيل)'}`);
      if (!r.ok) bad++;
    } catch (e) { console.error(`✗ ${c.title}: ${e.message}`); bad++; }
  }
  console.log(bad ? `${bad} من ${checks.length} فحوص لم تجتز` : `اجتازت الفحوص ${checks.length} كلها`);
  process.exit(bad ? 1 : 0);
}

// ── check: ما تنتظره الجدولة الحية (20261029140000_leaders_cron.sql ومتابعاته) ──
const EXPECTED_JOBS = ['leaders-weekly-reminders', 'leaders-expert-offers'];
const EXPECTED_SECRETS = ['leaders_cron_secret'];
if (CHECK) {
  let bad = 0;
  const fail = (m) => { console.error(`✗ ${m}`); bad++; };
  const ext = await query("select extname, extversion from pg_extension where extname in ('pg_cron','pg_net','supabase_vault') order by 1");
  for (const e of ['pg_cron', 'pg_net', 'supabase_vault']) {
    const row = ext.find((x) => x.extname === e);
    row ? console.log(`✓ الامتداد ${e} ${row.extversion}`) : fail(`الامتداد ${e} غير مفعّل`);
  }
  const jobs = await query('select jobid, jobname, schedule, active from cron.job order by jobid').catch(() => []);
  for (const j of jobs) console.log(`${j.active ? '✓' : '✗'} مهمة ${j.jobname} (${j.jobid}) على «${j.schedule}»${j.active ? '' : ' معطّلة'}`);
  for (const name of EXPECTED_JOBS) {
    const j = jobs.find((x) => x.jobname === name);
    if (!j) fail(`المهمة ${name} غير موجودة في cron.job`); else if (!j.active) fail(`المهمة ${name} معطّلة`);
  }
  const runs = await query(`select j.jobname, r.status, r.start_time, round(extract(epoch from (r.end_time - r.start_time))::numeric, 1) as secs,
      left(coalesce(r.return_message, ''), 160) as msg
    from cron.job_run_details r left join cron.job j on j.jobid = r.jobid order by r.start_time desc limit 10`).catch(() => []);
  console.log(runs.length ? 'آخر 10 تشغيلات:' : 'لا تشغيلات مسجّلة بعد (cron.job_run_details فارغ)');
  for (const r of runs) {
    const line = `  ${r.status === 'succeeded' ? '✓' : '✗'} ${r.jobname || '?'} ${r.start_time} (${r.secs ?? '?'}ث) ${r.msg}`;
    r.status === 'succeeded' ? console.log(line) : console.log(`::warning::${line}`);
  }
  // الأسماء فقط من vault.secrets؛ لا تُقرأ القيم المفكوكة ولا أي قيمة
  const secrets = await query('select name from vault.secrets order by name').catch(() => []);
  console.log(`أسرار Vault (أسماء فقط): ${secrets.map((s) => s.name).join('، ') || 'لا شيء'}`);
  for (const s of EXPECTED_SECRETS) if (!secrets.some((x) => x.name === s)) fail(`السر ${s} غير موجود في Vault`);
  const all = await query('select name from leaders.schema_migrations order by name').catch(() => []);
  console.log(`السجل: ${all.length} ترحيلًا، آخره ${all.at(-1)?.name || '—'}`);
  process.exit(bad ? 1 : 0);
}

for (const name of names) {
  const path = `supabase/migrations/${name}.sql`;
  if (!existsSync(path)) { console.error(`✗ ${name}: لا ملف له في supabase/migrations`); process.exit(1); }
  try {
    if (await inLedger(name)) { console.log(`• ${name}: مسجّل سلفًا، تُخطّى`); continue; }
    const plan = applyPlan(readFileSync(path, 'utf8'));
    console.log(`→ ${name} (${plan.mode})`);
    const r = await applyWithRetry({ query, plan, log: (m) => console.log(`::warning::${name}: ${m}`) });
    if (name >= LEDGER_FROM && !(await inLedger(name))) { console.error(`✗ ${name}: طُبّق لكنه لم يُسجَّل في leaders.schema_migrations`); process.exit(1); }
    console.log(`✓ ${name}${r.attempts > 1 ? ` بعد ${r.attempts} محاولات` : ''}`);
  } catch (e) { console.error(`✗ ${name}: ${e.message}`); process.exit(1); }
}
const all = await query('select name from leaders.schema_migrations order by name').catch(() => []);
console.log(`السجل: ${all.length} ترحيلًا، آخره ${all.at(-1)?.name || '—'}`);
