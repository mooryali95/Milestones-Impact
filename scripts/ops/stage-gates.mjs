#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// بوابات المراحل الخمس إلى الاحترافية الكاملة
// ════════════════════════════════════════════════════════════════
// المرجع: docs/audit/2026-11-09-خريطة-الطريق-إلى-الاحترافية-الكاملة-v1.md
// كل نقطة تحقق إما آلية تُقرأ من الإنتاج وGitHub قراءة فقط، أو إقرار بشري موثّق
// في docs/ops/stage-gates.attest.json باسم المقرّ وتاريخه. لا تُعبر مرحلة إلا إن
// نجحت نقاطها كلها، ولا يُحسب مكسبها بالنقاط قبل عبورها كاملة.
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/ops/stage-gates.mjs            الجدول كاملًا
//   ... node scripts/ops/stage-gates.mjs --stage=1                       مرحلة واحدة، رمز 1 إن لم تُعبر
//   ... node scripts/ops/stage-gates.mjs --md=<ملف>                       ويكتب التقرير Markdown
//
// قراءة GitHub بـ GITHUB_TOKEN إن وُجد، وإلا بأداة gh، وإلا تُعلَن النقطة «تعذّر الفحص».
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BASE_SCORE = 7.5;
export const TARGET_SCORE = 9.5;

// تعريف المراحل ونقاطها: kind = auto (من الحقائق) أو attest (إقرار موثّق)
// maxAgeDays للإقرار الذي يتقادم (تمرين الاستعادة شهري مثلًا)
export const STAGES = [
  {
    id: 1, title: 'الصلابة التشغيلية', gain: 0.4,
    checks: [
      { id: 'm1.migrations', title: 'لا ترحيل معلّق على الإنتاج', kind: 'auto' },
      { id: 'm1.secrets', title: 'أسرار الدوال بلا افتراضي مضبوطة: مفتاح توقيع الشهادات وقناة التنبيه', kind: 'auto' },
      { id: 'm1.ci-main', title: 'آخر CI على main أخضر', kind: 'auto' },
      { id: 'm1.probe', title: 'المسبار الساعي أخضر في آخر 3 ساعات', kind: 'auto' },
      { id: 'm1.backup-nightly', title: 'نسخة ليلية ناجحة خارج GitHub في آخر 30 ساعة', kind: 'auto' },
      { id: 'm1.supabase-backups', title: 'نسخ Supabase اليومية مفعّلة (خطة مدفوعة)', kind: 'auto' },
      { id: 'm1.resend-plan', title: 'خطة Resend تكفي ضعف الدفعة يوميًا، وSPF وDKIM وDMARC سليمة', kind: 'attest' },
      { id: 'm1.restore-drill', title: 'تمرين استعادة ناجح في آخر 35 يومًا', kind: 'attest', maxAgeDays: 35 },
      { id: 'm1.external-monitor', title: 'مراقب خارجي كل 5 دقائق ومراقب حداثة النسخ منشوران', kind: 'attest' },
      { id: 'm1.cloudflare', title: 'mi-home يبني من release، وmi-sspdf موقوف', kind: 'attest' },
    ],
  },
  {
    id: 2, title: 'الإطلاق التجريبي', gain: 0.4,
    checks: [
      { id: 'm2.cohort-per-org', title: 'لكل جهة فعّالة دفعة مفتوحة أو جارية', kind: 'auto' },
      { id: 'm2.advisor', title: 'لكل دفعة جهة مستشار أساسي', kind: 'auto' },
      { id: 'm2.sessions', title: 'لكل دفعة جارية مواعيد أيام تدريبية أو صيغة الكتيب', kind: 'auto' },
      { id: 'm2.final-eval', title: 'إعداد التقييم الختامي محفوظ للبرنامج الافتراضي', kind: 'auto' },
      { id: 'm2.release-pinned', title: 'إصدار محتوى مثبّت على كل دفعة جارية', kind: 'auto' },
      { id: 'm2.golden-paths', title: 'المسارات الذهبية خضراء على main', kind: 'auto' },
      { id: 'm2.thresholds-signed', title: 'توقيع الحدود المؤقتة للدفعة الأولى', kind: 'attest' },
      { id: 'm2.dpa', title: 'اتفاقيات معالجة البيانات مقبولة لدى المعالجين الأربعة', kind: 'attest' },
    ],
  },
  {
    id: 3, title: 'صدق المحتوى', gain: 0.6,
    checks: [
      { id: 'm3.labs-coverage', title: 'لكل باب من الأبواب الـ27 مختبر واحد على الأقل', kind: 'auto' },
      { id: 'm3.baseline-coverage', title: 'لكل باب فقرة في أداة القياس المبدئي المفعّلة', kind: 'auto' },
      { id: 'm3.foundation-access', title: 'لا فقرة قياس للتأسيسي على باب محجوب عنه', kind: 'auto' },
      { id: 'm3.public-sector', title: 'لا «مانح» في متن إطار الأثر (تسييق القطاع العام)', kind: 'auto' },
      { id: 'm3.concepts', title: 'سجل المفاهيم يجتاز حارسه', kind: 'auto' },
      { id: 'm3.signoff-milestone', title: 'توقيع لجنة المحتوى على إطار المعالم', kind: 'attest' },
      { id: 'm3.signoff-impact', title: 'توقيع لجنة المحتوى على إطار الأثر', kind: 'attest' },
      { id: 'm3.signoff-leadership', title: 'توقيع لجنة المحتوى على إطار القيادة', kind: 'attest' },
    ],
  },
  {
    id: 4, title: 'التوسع', gain: 0.3,
    checks: [
      { id: 'm4.katon-coverage', title: 'كاتون بثلاثة موضوعات منشورة على الأقل في كل إطار', kind: 'auto' },
      { id: 'm4.dsar', title: 'خدمة ذاتية لتصدير المشارك بياناته وطلب حذفها', kind: 'auto' },
      { id: 'm4.hall-load', title: 'اختبار حمل القاعة بمئة جهاز ناجح', kind: 'attest' },
      { id: 'm4.wcag', title: 'تدقيق WCAG 2.2 AA بلا خلل حرج', kind: 'attest' },
      { id: 'm4.sus', title: 'SUS لخمسة مستخدمين لكل دور فوق 75', kind: 'attest' },
    ],
  },
  {
    id: 5, title: 'التميّز', gain: 0.3,
    checks: [
      { id: 'm5.cohorts-data', title: 'دفعتان على الأقل أتمّ فيهما 20 مشاركًا القياس البعدي', kind: 'auto' },
      { id: 'm5.irt', title: 'تقرير معايرة الأداة (IRT) معتمد', kind: 'attest' },
      { id: 'm5.impact-6m', title: 'قراءة الأثر بعد ستة أشهر لدفعة كاملة', kind: 'attest' },
      { id: 'm5.external-review', title: 'مراجعة خارجية مستقلة أمنية وقياسية', kind: 'attest' },
    ],
  },
];

// ما لا قيمة افتراضية له: مفتاح التوقيع (لا شهادة بدونه)، وقناة التنبيه (لا إنذار بغير البريد). البقية لها افتراضي آمن في docs/SECRETS.md
export const REQUIRED_SECRETS = ['LEADERS_CERT_SIGNING_KEY', 'LEADERS_ALERT_WEBHOOK'];

// الحكم على نقطة: pass أو fail أو unknown (تعذّر الفحص)، مع سبب بجملة
export function judge(check, facts, attest, now = Date.now()) {
  if (check.kind === 'attest') {
    const a = attest?.[check.id];
    if (!a?.by || !a?.at) return { status: 'fail', reason: 'بلا إقرار موثّق' };
    const age = (now - Date.parse(a.at)) / 864e5;
    if (!Number.isFinite(age)) return { status: 'fail', reason: 'تاريخ الإقرار غير صالح' };
    if (check.maxAgeDays && age > check.maxAgeDays) return { status: 'fail', reason: `إقرار ${a.by} تقادم (${Math.floor(age)} يومًا)` };
    return { status: 'pass', reason: `أقرّه ${a.by} في ${a.at.slice(0, 10)}` };
  }
  const f = facts[check.id];
  if (!f || f.status === 'unknown') return { status: 'unknown', reason: f?.reason || 'تعذّر الفحص' };
  return { status: f.ok ? 'pass' : 'fail', reason: f.reason };
}

export function evaluate(facts, attest, now = Date.now()) {
  let score = BASE_SCORE, open = true;
  const stages = STAGES.map((s) => {
    const checks = s.checks.map((c) => ({ ...c, ...judge(c, facts, attest, now) }));
    const passed = checks.filter((c) => c.status === 'pass').length;
    const crossed = passed === checks.length;
    // المكسب لا يُحسب إلا بعبور المرحلة وما قبلها: البوابات متسلسلة
    if (crossed && open) score += s.gain; else open = false;
    return { ...s, checks, passed, total: checks.length, crossed };
  });
  return { stages, score: Math.round(score * 10) / 10, target: TARGET_SCORE };
}

// خلية جدول Markdown: لا عمود زائد ولا سطر مكسور من قيمة في القاعدة
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function toMarkdown(r, at) {
  const icon = { pass: '✅', fail: '❌', unknown: '⚪' };
  const out = [`# تقرير بوابات المراحل`, '', `**وقت الفحص:** ${at}`, '', `**الدرجة المحتسبة بالبوابات:** ${r.score} من 10، والهدف ${r.target}. لا يُحتسب مكسب مرحلة قبل عبورها وما قبلها.`, ''];
  out.push('| المرحلة | العابر | الحالة |', '|---|---|---|');
  for (const s of r.stages) out.push(`| م${s.id} ${s.title} (+${s.gain}) | ${s.passed} من ${s.total} | ${s.crossed ? 'عُبرت' : 'مفتوحة'} |`);
  for (const s of r.stages) {
    out.push('', `## م${s.id} ${s.title}`, '', '| النقطة | النوع | الحالة | السبب |', '|---|---|---|---|');
    for (const c of s.checks) out.push(`| ${cell(c.title)} | ${c.kind === 'auto' ? 'آلية' : 'إقرار'} | ${icon[c.status]} | ${cell(c.reason)} |`);
  }
  return out.join('\n') + '\n';
}

// ── جمع الحقائق (قراءة فقط) ──
const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const REPO = process.env.GITHUB_REPOSITORY || 'mooryali95/Milestones-Impact';

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    // read_only: معاملة للقراءة وحدها، فلا يكتب استعلام هنا في الإنتاج ولو عُدّل خطأً
    body: JSON.stringify({ query: q, read_only: true }),
  });
  if (!r.ok) throw new Error(`SQL ${r.status}`);
  return r.json();
}

async function supa(path) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function gh(path) {
  if (process.env.GITHUB_TOKEN) {
    const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
    if (r.ok) return r.json();
    if (r.status !== 401 && r.status !== 403) throw new Error(`GitHub ${r.status}`);
  }
  return JSON.parse(execFileSync('gh', ['api', `repos/${REPO}${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}

// آخر تشغيل لسير بعينه على main: ناجح وحديث بما يكفي
async function lastRun(workflow, maxHours) {
  const d = await gh(`/actions/workflows/${workflow}/runs?branch=main&status=completed&per_page=1`);
  const run = d.workflow_runs?.[0];
  if (!run) return { ok: false, reason: 'لا تشغيل مكتمل على main' };
  const hours = (Date.now() - Date.parse(run.updated_at)) / 36e5;
  const fresh = !maxHours || hours <= maxHours;
  return { ok: run.conclusion === 'success' && fresh, reason: `آخر تشغيل ${run.conclusion} قبل ${hours.toFixed(1)} ساعة` };
}

async function safe(fn) {
  try { return await fn(); } catch (e) { return { status: 'unknown', reason: `تعذّر الفحص: ${e.message}` }; }
}

export async function collect() {
  const f = {};
  const repoMigrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((n) => n.endsWith('.sql')).map((n) => n.slice(0, -4));
  f['m1.migrations'] = await safe(async () => {
    const applied = new Set((await sql('select name from leaders.schema_migrations')).map((r) => r.name));
    const pending = repoMigrations.filter((n) => !applied.has(n));
    return { ok: !pending.length, reason: pending.length ? `معلّق: ${pending.join('، ')}` : `${applied.size} مطبّقًا، لا معلّق` };
  });
  f['m1.secrets'] = await safe(async () => {
    const names = new Set((await supa('/secrets')).map((s) => String(s.name)));
    const missing = REQUIRED_SECRETS.filter((n) => !names.has(n));
    return { ok: !missing.length, reason: missing.length ? `ناقص: ${missing.join('، ')}` : 'كلها مضبوطة (أسماء فقط)' };
  });
  f['m1.ci-main'] = await safe(() => lastRun('ci.yml'));
  f['m1.probe'] = await safe(() => lastRun('probe.yml', 3));
  f['m1.backup-nightly'] = await safe(() => lastRun('backup.yml', 30));
  f['m1.supabase-backups'] = await safe(async () => {
    const b = await supa('/database/backups');
    const ok = !!b.pitr_enabled || (b.backups || []).length > 0;
    return { ok, reason: ok ? `${(b.backups || []).length} نسخة${b.pitr_enabled ? ' وPITR' : ''}` : 'لا نسخ يومية (خطة مجانية)' };
  });
  f['m2.golden-paths'] = await safe(() => lastRun('integration.yml'));
  const q = async (id, query, fn) => { f[id] = await safe(async () => fn(await sql(query))); };
  await q('m2.cohort-per-org', `select o.name from leaders.organizations o where o.status = 'active'
      and not exists (select 1 from leaders.cohorts c where c.organization_id = o.id and c.status in ('open','running'))`,
    (rows) => ({ ok: !rows.length, reason: rows.length ? `بلا دفعة: ${rows.map((r) => r.name).join('، ')}` : 'كل الجهات لها دفعة' }));
  await q('m2.advisor', `select name from leaders.cohorts where organization_id is not null and status in ('open','running') and advisor_expert_id is null`,
    (rows) => ({ ok: !rows.length, reason: rows.length ? `بلا مستشار: ${rows.map((r) => r.name).join('، ')}` : 'كل دفعات الجهات لها مستشار' }));
  await q('m2.sessions', `select c.name from leaders.cohorts c where c.status = 'running' and not c.is_default
      and not exists (select 1 from leaders.workshop_sessions w where w.cohort_id = c.id and w.active)
      and coalesce(c.delivery -> 'T-ATTEND' ->> 'format', '') <> 'handbook'`,
    (rows) => ({ ok: !rows.length, reason: rows.length ? `بلا مواعيد: ${rows.map((r) => r.name).join('، ')}` : 'كل دفعة جارية لها مواعيد أو صيغة الكتيب' }));
  await q('m2.final-eval', `select final_eval is not null and final_eval <> '{}'::jsonb as ok from leaders.programs where is_default`,
    (rows) => ({ ok: !!rows[0]?.ok, reason: rows[0]?.ok ? 'محفوظ' : 'لم يُحفظ بعد من اللوحة' }));
  await q('m2.release-pinned', `select name from leaders.cohorts where status = 'running' and content_release is null`,
    (rows) => ({ ok: !rows.length, reason: rows.length ? `بلا إصدار: ${rows.map((r) => r.name).join('، ')}` : 'كل دفعة جارية بإصدار مثبّت' }));
  await q('m3.labs-coverage', `select count(*) total, count(*) filter (where exists (select 1 from leaders.lab_items l where l.active and l.dimension = m.dimension and l.chapter_key = m.chapter_key)) covered
      from (select distinct dimension, chapter_key from leaders.handbook_modules) m`,
    ([r]) => ({ ok: +r.covered === +r.total, reason: `${r.covered} من ${r.total} بابًا لها مختبر` }));
  await q('m3.baseline-coverage', `select count(*) total, count(*) filter (where exists (select 1 from leaders.questions q join leaders.instruments i on i.id = q.instrument_id
      where i.kind = 'baseline' and i.active and q.active and q.dimension = m.dimension and q.chapter_key = m.chapter_key)) covered
      from (select distinct dimension, chapter_key from leaders.handbook_modules) m`,
    ([r]) => ({ ok: +r.covered === +r.total, reason: `${r.covered} من ${r.total} بابًا لها فقرة مبدئية` }));
  await q('m3.foundation-access', `select distinct q.code from leaders.questions q join leaders.instruments i on i.id = q.instrument_id
      join leaders.handbook_modules m on m.dimension = q.dimension and m.chapter_key = q.chapter_key
      where i.active and q.active and coalesce(q.min_level, 'beginner') = 'beginner' and coalesce(m.min_level, 'beginner') <> 'beginner'`,
    (rows) => ({ ok: !rows.length, reason: rows.length ? `${rows.length} فقرة على باب محجوب: ${rows.slice(0, 6).map((r) => r.code).join('، ')}` : 'لا فقرة على باب محجوب' }));
  await q('m3.public-sector', `select count(*) n from leaders.handbook_modules where dimension = 'impact' and body_md like '%مانح%'`,
    ([r]) => ({ ok: +r.n === 0, reason: +r.n ? `«مانح» في ${r.n} بابًا من إطار الأثر` : 'لا «مانح» في المتن' }));
  f['m3.concepts'] = await safe(async () => {
    // بلا الرمزين: الحارس لا يحتاج الإنتاج ولا GitHub
    const { SUPABASE_ACCESS_TOKEN: _s, GITHUB_TOKEN: _g, ...env } = process.env;
    const script = fileURLToPath(new URL('../concepts/registry.mjs', import.meta.url));
    try { execFileSync('node', [script, '--check'], { stdio: 'ignore', env }); return { ok: true, reason: 'الحارس يجتاز' }; }
    catch { return { ok: false, reason: 'الحارس يفشل' }; }
  });
  await q('m4.katon-coverage', `select d, count(t.id) n from unnest(array['milestone','impact','leadership']) d
      left join leaders.katon_topics t on t.dimension = d and t.status = 'published' group by d order by d`,
    (rows) => ({ ok: rows.every((r) => +r.n >= 3), reason: rows.map((r) => `${r.d} ${r.n}`).join('، ') }));
  f['m4.dsar'] = await safe(async () => {
    const idx = readFileSync(new URL('../../supabase/functions/leaders-api/index.ts', import.meta.url), 'utf8');
    const ok = /'me\.export'/.test(idx) && /'me\.erase-request'/.test(idx);
    return { ok, reason: ok ? 'مساران للتصدير وطلب الحذف' : 'لا مسار ذاتي للتصدير وطلب الحذف بعد' };
  });
  await q('m5.cohorts-data', `select count(*) n from (select e.cohort_id from leaders.enrollments e
      join leaders.assessments a on a.participant_id = e.participant_id and a.status = 'submitted'
      join leaders.instruments i on i.id = a.instrument_id and i.kind = 'post' group by e.cohort_id having count(distinct e.participant_id) >= 20) c`,
    ([r]) => ({ ok: +r.n >= 2, reason: `${r.n} دفعة ببيانات بعدية كافية` }));
  return f;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.SUPABASE_ACCESS_TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب للقراءة من الإنتاج'); process.exit(2); }
  const attestFile = new URL('../../docs/ops/stage-gates.attest.json', import.meta.url);
  const attest = existsSync(attestFile) ? JSON.parse(readFileSync(attestFile, 'utf8')) : {};
  const r = evaluate(await collect(), attest);
  const at = new Date().toISOString();
  const only = Number(process.argv.find((a) => a.startsWith('--stage='))?.slice(8)) || null;
  const icon = { pass: '✓', fail: '✗', unknown: '?' };
  for (const s of r.stages.filter((x) => !only || x.id === only)) {
    console.log(`\nم${s.id} ${s.title} (+${s.gain}): ${s.passed} من ${s.total}${s.crossed ? ' — عُبرت' : ''}`);
    for (const c of s.checks) console.log(`  ${icon[c.status]} ${c.title}: ${c.reason}`);
  }
  console.log(`\nالدرجة المحتسبة بالبوابات: ${r.score} من 10 (الهدف ${r.target})`);
  const md = process.argv.find((a) => a.startsWith('--md='))?.slice(5);
  if (md) writeFileSync(md, toMarkdown(r, at));
  if (only && !r.stages.find((x) => x.id === only)?.crossed) process.exit(1);
}
