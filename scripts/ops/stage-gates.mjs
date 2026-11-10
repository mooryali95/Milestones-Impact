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
    // إقرار بتاريخ مستقبلي لا يُقبل، وإلا تجاوز التقادم
    if (age < -1) return { status: 'fail', reason: `تاريخ إقرار ${a.by} في المستقبل` };
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
    const effective = crossed && open;
    if (effective) score += s.gain; else open = false;
    // crossed: نقاطها كلها نجحت. effective: عُبرت وما قبلها، فيُحتسب مكسبها
    return { ...s, checks, passed, total: checks.length, crossed, effective };
  });
  return { stages, score: Math.round(score * 10) / 10, target: TARGET_SCORE };
}

export const stateOf = (s) => (s.effective ? 'عُبرت' : s.crossed ? 'مكتملة بانتظار ما قبلها' : 'مفتوحة');

// خلية جدول Markdown: لا عمود زائد ولا سطر مكسور من قيمة في القاعدة
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function toMarkdown(r, at) {
  const icon = { pass: '✅', fail: '❌', unknown: '⚪' };
  const out = [`# تقرير بوابات المراحل`, '', `**وقت الفحص:** ${at}`, '', `**الدرجة المحتسبة بالبوابات:** ${r.score} من 10، والهدف ${r.target}. لا يُحتسب مكسب مرحلة قبل عبورها وما قبلها.`, ''];
  out.push('| المرحلة | العابر | الحالة |', '|---|---|---|');
  const unknown = r.stages.flatMap((s) => s.checks).filter((c) => c.status === 'unknown').length;
  if (unknown) out.push(`> ⚠️ ${unknown} نقطة تعذّر فحصها (رمز منتهٍ أو خدمة لا تجيب)، فلا يُعتمد هذا التقرير حتى تُفحص.`, '');
  for (const s of r.stages) out.push(`| م${s.id} ${s.title} (+${s.gain}) | ${s.passed} من ${s.total} | ${stateOf(s)} |`);
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

// آخر تشغيل حاسم لسير بعينه على main (دفع أو جدولة، لا طلب دمج من فرع باسم main)،
// متخطيًا الملغى والمتخطى (cancel-in-progress)، وحديث بما يكفي إن طُلب
async function lastRunOf(workflow, events) {
  const d = await gh(`/actions/workflows/${workflow}/runs?branch=main&status=completed&per_page=15`);
  return (d.workflow_runs || []).find((r) => events.includes(r.event) && !['cancelled', 'skipped'].includes(r.conclusion)) || null;
}
async function lastRun(workflow, maxHours, events = ['push', 'schedule', 'workflow_dispatch']) {
  const run = await lastRunOf(workflow, events);
  if (!run) return { ok: false, reason: 'لا تشغيل حاسم على main' };
  const hours = (Date.now() - Date.parse(run.run_started_at || run.created_at)) / 36e5;
  const fresh = !maxHours || hours <= maxHours;
  return { ok: run.conclusion === 'success' && fresh, reason: `آخر تشغيل ${run.conclusion} قبل ${hours.toFixed(1)} ساعة${fresh ? '' : ' (متقادم)'}`, run };
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
  f['m1.ci-main'] = await safe(() => lastRun('ci.yml', null, ['push']));
  f['m1.probe'] = await safe(() => lastRun('probe.yml', 3));
  // النجاح وحده لا يكفي: السير يتخطى النسخ إن غابت الأسرار وينتهي «ناجحًا»
  f['m1.backup-nightly'] = await safe(async () => {
    const r = await lastRun('backup.yml', 30, ['schedule', 'workflow_dispatch']);
    if (!r.ok) return r;
    const jobs = (await gh(`/actions/runs/${r.run.id}/jobs`)).jobs || [];
    const dump = jobs.flatMap((j) => j.steps || []).find((st) => /^Dump, encrypt/.test(st.name));
    return dump?.conclusion === 'success' ? { ok: true, reason: `${r.reason}، والنسخ إلى R2 تمّ` } : { ok: false, reason: `${r.reason} لكن خطوة النسخ ${dump?.conclusion || 'غائبة'} (أسرار R2 أو المفتاح ناقصة)` };
  });
  f['m1.supabase-backups'] = await safe(async () => {
    const b = await supa('/database/backups');
    if (b.pitr_enabled) return { ok: true, reason: 'PITR مفعّل' };
    const done = (b.backups || []).filter((x) => x.status === 'COMPLETED').map((x) => Date.parse(x.inserted_at)).filter(Number.isFinite).sort((x, y) => y - x);
    if (!done.length) return { ok: false, reason: 'لا نسخ يومية مكتملة (خطة مجانية؟)' };
    const hours = (Date.now() - done[0]) / 36e5;
    return { ok: hours <= 30, reason: `آخر نسخة مكتملة قبل ${hours.toFixed(1)} ساعة` };
  });
  f['m2.golden-paths'] = await safe(() => lastRun('integration.yml', 24 * 7, ['push', 'schedule', 'workflow_dispatch']));
  const q = async (id, query, fn) => { f[id] = await safe(async () => fn(await sql(query))); };
  // لا عبور بالفراغ: يلزم جهة فعّالة واحدة على الأقل، ولكلٍّ دفعة مفتوحة أو جارية
  await q('m2.cohort-per-org', `select o.name, exists (select 1 from leaders.cohorts c where c.organization_id = o.id and c.status in ('open','running')) has
      from leaders.organizations o where o.status = 'active'`,
    (rows) => {
      const missing = rows.filter((r) => !r.has);
      if (!rows.length) return { ok: false, reason: 'لا جهة فعّالة بعد' };
      return { ok: !missing.length, reason: missing.length ? `بلا دفعة: ${missing.map((r) => r.name).join('، ')}` : `${rows.length} جهة، ولكلٍّ دفعة` };
    });
  await q('m2.advisor', `select name, advisor_expert_id is not null has from leaders.cohorts where organization_id is not null and status in ('open','running')`,
    (rows) => {
      const missing = rows.filter((r) => !r.has);
      if (!rows.length) return { ok: false, reason: 'لا دفعة جهة مفتوحة أو جارية بعد' };
      return { ok: !missing.length, reason: missing.length ? `بلا مستشار: ${missing.map((r) => r.name).join('، ')}` : `${rows.length} دفعة جهة، ولكلٍّ مستشار` };
    });
  // الدفعات المفتوحة والجارية للجهات: موعد قادم أو حديث (الجلسة بلا دفعة تعمّ الدفعات)، أو صيغة الكتيب لبند حضور
  await q('m2.sessions', `select c.name, (exists (select 1 from leaders.workshop_sessions w where w.active and (w.cohort_id = c.id or w.cohort_id is null)
        and coalesce(w.ends_at, w.starts_at) >= now() - interval '14 days')
      or exists (select 1 from jsonb_each(c.delivery) d where d.value ->> 'format' = 'handbook')) has
      from leaders.cohorts c where c.organization_id is not null and c.status in ('open','running')`,
    (rows) => {
      const missing = rows.filter((r) => !r.has);
      if (!rows.length) return { ok: false, reason: 'لا دفعة جهة مفتوحة أو جارية بعد' };
      return { ok: !missing.length, reason: missing.length ? `بلا مواعيد قادمة: ${missing.map((r) => r.name).join('، ')}` : 'لكل دفعة مواعيد قادمة أو صيغة الكتيب' };
    });
  await q('m2.final-eval', `select final_eval is not null and final_eval <> '{}'::jsonb as ok from leaders.programs where is_default`,
    (rows) => ({ ok: !!rows[0]?.ok, reason: rows[0]?.ok ? 'محفوظ' : 'لم يُحفظ بعد من اللوحة' }));
  await q('m2.release-pinned', `select name, content_release is not null has from leaders.cohorts where status = 'running'`,
    (rows) => {
      const missing = rows.filter((r) => !r.has);
      if (!rows.length) return { ok: false, reason: 'لا دفعة جارية بعد' };
      return { ok: !missing.length, reason: missing.length ? `بلا إصدار: ${missing.map((r) => r.name).join('، ')}` : 'كل دفعة جارية بإصدار مثبّت' };
    });
  await q('m3.labs-coverage', `select count(*) total, count(*) filter (where exists (select 1 from leaders.lab_items l where l.active and l.dimension = m.dimension and l.chapter_key = m.chapter_key)) covered
      from (select distinct dimension, chapter_key from leaders.handbook_modules) m`,
    ([r]) => ({ ok: +r.total >= 27 && +r.covered === +r.total, reason: `${r.covered} من ${r.total} بابًا لها مختبر` }));
  await q('m3.baseline-coverage', `select count(*) total, count(*) filter (where exists (select 1 from leaders.questions q join leaders.instruments i on i.id = q.instrument_id
      where i.kind = 'baseline' and i.active and q.active and q.dimension = m.dimension and q.chapter_key = m.chapter_key)) covered
      from (select distinct dimension, chapter_key from leaders.handbook_modules) m`,
    ([r]) => ({ ok: +r.total >= 27 && +r.covered === +r.total, reason: `${r.covered} من ${r.total} بابًا لها فقرة مبدئية` }));
  await q('m3.foundation-access', `select distinct q.code from leaders.questions q join leaders.instruments i on i.id = q.instrument_id
      join leaders.handbook_modules m on m.dimension = q.dimension and m.chapter_key = q.chapter_key
      where i.active and q.active and coalesce(q.min_level, 'beginner') = 'beginner' and coalesce(m.min_level, 'beginner') <> 'beginner'`,
    (rows) => ({ ok: !rows.length, reason: rows.length ? `${rows.length} فقرة على باب محجوب: ${rows.slice(0, 6).map((r) => r.code).join('، ')}` : 'لا فقرة على باب محجوب' }));
  await q('m3.public-sector', `select count(*) n from leaders.handbook_modules where dimension = 'impact'
      and regexp_replace(concat_ws(' ', title_ar, body_md, quiz_md, reflection_ar), '[ًٌٍَُِّْـ]', '', 'g') like '%مانح%'`,
    ([r]) => ({ ok: +r.n === 0, reason: +r.n ? `«مانح» في ${r.n} بابًا من إطار الأثر` : 'لا «مانح» في المتن' }));
  f['m3.concepts'] = await safe(async () => {
    // بلا الرمزين: الحارس لا يحتاج الإنتاج ولا GitHub
    const { SUPABASE_ACCESS_TOKEN: _s, GITHUB_TOKEN: _g, ...env } = process.env;
    const script = fileURLToPath(new URL('../concepts/registry.mjs', import.meta.url));
    try { execFileSync('node', [script, '--check'], { stdio: 'ignore', env }); return { ok: true, reason: 'الحارس يجتاز' }; }
    catch (e) { return typeof e.status === 'number' ? { ok: false, reason: 'الحارس يفشل' } : { status: 'unknown', reason: 'تعذّر تشغيل الحارس' }; }
  });
  await q('m4.katon-coverage', `select d, count(t.id) n from unnest(array['milestone','impact','leadership']) d
      left join leaders.katon_topics t on t.dimension = d and t.status = 'published' group by d order by d`,
    (rows) => ({ ok: rows.every((r) => +r.n >= 3), reason: rows.map((r) => `${r.d} ${r.n}`).join('، ') }));
  // على الدالة المنشورة لا على المصدر: الإجراء المعروف يرد بطلب جلسة، والمجهول بـ unknown_action
  f['m4.dsar'] = await safe(async () => {
    const anon = readFileSync(new URL('../../.github/workflows/probe.yml', import.meta.url), 'utf8').match(/SUPABASE_ANON:\s*(\S+)/)?.[1];
    if (!anon) return { status: 'unknown', reason: 'لا مفتاح anon العام في probe.yml' };
    const known = async (action) => {
      const r = await fetch(`https://${REF}.supabase.co/functions/v1/leaders-api`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}`, Origin: 'https://leaders.sunkvalue.com' }, body: JSON.stringify({ action }) });
      return (await r.json().catch(() => ({}))).code !== 'unknown_action';
    };
    const [ex, er] = [await known('me.export'), await known('me.erase-request')];
    return { ok: ex && er, reason: ex && er ? 'مسارا التصدير وطلب الحذف منشوران' : `غير منشور: ${[!ex && 'me.export', !er && 'me.erase-request'].filter(Boolean).join('، ')}` };
  });
  // دفعات جهات حقيقية (لا الافتراضية)، وتسجيل غير منسحب، وقياس بعدي بعد التسجيل
  await q('m5.cohorts-data', `select count(*) n from (select e.cohort_id from leaders.enrollments e
      join leaders.cohorts c on c.id = e.cohort_id and not c.is_default
      join leaders.assessments a on a.participant_id = e.participant_id and a.status = 'submitted' and a.submitted_at >= e.created_at
      join leaders.instruments i on i.id = a.instrument_id and i.kind = 'post'
      where e.status <> 'withdrawn' group by e.cohort_id having count(distinct e.participant_id) >= 20) x`,
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
    console.log(`\nم${s.id} ${s.title} (+${s.gain}): ${s.passed} من ${s.total} — ${stateOf(s)}`);
    for (const c of s.checks) console.log(`  ${icon[c.status]} ${c.title}: ${c.reason}`);
  }
  console.log(`\nالدرجة المحتسبة بالبوابات: ${r.score} من 10 (الهدف ${r.target})`);
  const md = process.argv.find((a) => a.startsWith('--md='))?.slice(5);
  if (md) writeFileSync(md, toMarkdown(r, at));
  // --stage=N ينجح فقط إن عُبرت المرحلة وما قبلها
  if (only && !r.stages.find((x) => x.id === only)?.effective) process.exit(1);
  const unknown = r.stages.flatMap((s) => s.checks).filter((c) => c.status === 'unknown').length;
  if (unknown && process.env.GITHUB_ACTIONS) console.log(`::warning::${unknown} نقطة تعذّر فحصها؛ التقرير غير معتمد`);
}
