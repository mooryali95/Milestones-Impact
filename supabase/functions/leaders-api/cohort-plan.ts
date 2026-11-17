// ════════════════════════════════════════════════════════════════
// admin.cohort-plan: كاتب خطة الدفعة الوحيد (R2a في تصور محرر رحلة الدفعة، القرار 23)
// ════════════════════════════════════════════════════════════════
// op: preview (الافتراضي في القراءة) | save | undo | history
//   preview: الخطة الجديدة محسوبة وأثرها (planImpact) بلا حفظ، لكل مدير ولو للقراءة فقط
//   save:    يكتب cohorts.schedule بعد الحراس، وصفًا في leaders.audit_log (cohort.plan) بقيمته قبل وبعد وملخص الأثر
//   undo:    يعيد قيمة before من آخر حفظ لهذه الدفعة إن لم تتغير الخطة بعده، بالحراس نفسها (cohort.plan-undo)
//   history: آخر الحفظات والتراجعات لهذه الدفعة
// الجسم: { cohort_id, op, days: { مفتاح: عدد أو null }, off: { مفتاح: true أو false } (R2b)،
// with: { مفتاح: مفتاح مرجع أو false لـ«لا شيء» أو null لقاعدة البرنامج } وoffset: { مفتاح: أيام أو null } (R3a)، follow: true، base_updated_at (مطلوب للحفظ
// والتراجع)، reenable: 'exempt' (الافتراضي) أو 'apply' لمن تجاوز مرحلة تعود (القرار 12)، notify: true لـ«أبلغ المشاركين» (القرار 13) }.
// الحفظ والتراجع للكاتب وحده
// (index.ts يلفهما بـA.writer كما admin.cohort-save)، والمعاينة والسجل لكل مدير. لا ترحيل: الخطة في cohorts.schedule،
// والسجل في leaders.audit_log القائم.
import { audit, db, Fail, must } from './core.ts';
import * as OB from './observations.ts';
import type { Admin } from './admin.ts';
import { cohortDefinition, inProgram } from './logic.js';
import { cleanScheduleReport, cutoffFrom } from './milestones.js';
import { cohortMemberIds, defOf } from './programs.ts';
import { journeyFor } from './participant.ts';
import { positionOf } from './journey-map.js';
import { cohortPlan, planOffKeys } from './stage-windows.js';
import { impactSummary, PLAN_ACTIONS, planEdit, planImpact, planLock, planNotice, planRestartBlock, planWithIssues, sameSchedule } from './cohort-plan.js';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));
// أثر كل عضو يُحسب من رحلته كما يراها (journeyFor)، فلدفعة أكبر من هذا يُحسب أثر المواعيد وحده بلا أعداد الناس
export const PLAN_PEOPLE_MAX = 1500;

async function loadCohort(b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('حدد الدفعة', 400);
  const c = must(await db.from('cohorts').select('*').eq('id', String(b.cohort_id)).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  return c as any;
}

// تعريف الدفعة بمدد نسختها (بلا خطتها)، والمعالم: ما تُحسب عليه الخطة قبل التعديل وبعده
async function baseOf(c: any) {
  const raw = await defOf(c.program_version_id, c.program_id);
  const def = cohortDefinition({ live: raw, version: null, cohort: null });
  const stages = [...(def.stages || [])].sort((x: any, y: any) => (x.sort ?? 0) - (y.sort ?? 0));
  // كل مفاتيح التعريف ومنها الموقوفة في النسخة: مدخل مرحلة موقوفة يبقى ولا يُعد مُسقطًا، كما في الجدول من قبل
  const keys = (raw.stages || []).map((s: any) => s.key);
  const titles = Object.fromEntries((raw.stages || []).map((s: any) => [s.key, s.title_ar]));
  const ms = must(await db.from('program_milestones').select('*').eq('program_id', c.program_id).eq('active', true)) || [];
  // البنود تعرّف المراحل المحمية من الإيقاف (planOffBlock) وجلسات التوجيه في المرحلة الموقوفة
  return { stages, keys, titles, milestones: ms as any[], requirements: (def.requirements || []) as any[] };
}

// رحلة كل عضو كما يراها: موضعه الآن، وما أكمل من مراحل، وسجل معالمه (الإنجاز والتمديد)، فيُعاد حساب حالتها بالخطة الجديدة.
// وما ليس مقفلًا عليه (open). afterSchedule: حين تعود مرحلة موقوفة تُحسب رحلته بالخطة الجديدة أيضًا (after، حالة كل مرحلة)،
// فيُعرف من تجاوزها وهي موقوفة وتصير نشطة عليه (القرار 12)
async function peopleOf(c: any, afterSchedule: any = null) {
  const m = await cohortMemberIds(c.id);
  if (!m || m.ids.length > PLAN_PEOPLE_MAX) return null;
  if (!m.ids.length) return [];
  const rows: any[] = [];
  for (let i = 0; i < m.ids.length; i += 150) {
    rows.push(...(must(await db.from('participants').select('*').in('id', m.ids.slice(i, i + 150))) || []));
  }
  const live = rows.filter((p) => inProgram(p.status));
  const out: any[] = [];
  const queue = [...live];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const j: any = await journeyFor(p, { lite: true }).catch(() => null);
      if (!j) continue;
      const idx = positionOf(j.journey || []);
      const row: any = {
        id: p.id, at: idx >= 0 ? j.journey[idx].key : null,
        stagesDone: (j.journey || []).filter((s: any) => s.status === 'done').map((s: any) => s.key),
        open: (j.journey || []).filter((s: any) => s.status !== 'locked').map((s: any) => s.key),
        records: Object.fromEntries((j.milestones || []).map((x: any) => [x.id, { done_at: x.done_at || null, due_override: x.extended ? x.due : null, note: x.note || null }])),
      };
      if (afterSchedule) {
        const k: any = await journeyFor(p, { lite: true, cohort: { ...c, schedule: afterSchedule } }).catch(() => null);
        if (k) row.after = Object.fromEntries((k.journey || []).map((s: any) => [s.key, s.status]));
      }
      out.push(row);
    }
  }));
  return out;
}

// الخطة الجديدة نظيفة بمفاتيح التعريف (cleanScheduleReport بالصيغة الموسعة)، أو رفض بالسبب
function nextSchedule(c: any, base: any, b: Body, target?: any) {
  if (target !== undefined) {
    let out: any;
    try { out = cleanScheduleReport(target, base.keys, base.titles).schedule; }
    catch (err) { throw new Fail(`لا يُعاد الحفظ السابق: ${(err as Error).message}`, 409, 'undo_invalid'); }
    // التراجع لا يمر بplanEdit، فيُفحص فيه حارس الإعادة نفسه: مرحلة تعود وهي «تبدأ مع» مرجع يبقى موقوفًا (القرار 22)
    const was = planOffKeys(c.schedule || {}), now = planOffKeys(out);
    const blocks = base.stages.filter((s: any) => was.has(s.key) && !now.has(s.key))
      .map((s: any) => planRestartBlock(s, { stages: base.stages, schedule: out })).filter(Boolean);
    if (blocks.length) throw new Fail(`لا يُعاد الحفظ السابق: ${blocks.map((x: any) => x.msg).join('، ')}`, 409, 'undo_invalid');
    // وحارس التوازي (R3a): مرجع صار بعدها أو موقوفًا أو إزاحة تجاوزت مدته منذ ذلك الحفظ
    const par = planWithIssues({ stages: base.stages, schedule: out, before: c.schedule || {}, cohort: c });
    if (par.length) throw new Fail(`لا يُعاد الحفظ السابق: ${par.map((x: any) => x.msg).join('، ')}`, 409, 'undo_invalid');
    return out;
  }
  // المدة (R2a) والإيقاف (R2b) والتوازي (R3a) و«حرّر التواريخ لتتبع المدد». التاريخ المثبت للدفعة في مرحلة لاحقة، فلا يُقبل بصمت
  for (const k of ['start', 'end', 'schedule']) {
    if (k in b) throw new Fail('تُعدَّل من تبويب «الرحلة» مدة كل مرحلة وإيقافها وتوازيها لهذه الدفعة. التاريخ المثبت للدفعة في مرحلة لاحقة.', 400, 'plan_field');
  }
  const isMap = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if ('off' in b && !isMap(b.off)) throw new Fail('الإيقاف: { مفتاح المرحلة: نعم أو لا }', 400, 'plan_invalid');
  if ('with' in b && !isMap(b.with)) throw new Fail('«تسير مع»: { مفتاح المرحلة: مفتاح مرجعها أو لا شيء }', 400, 'plan_invalid');
  if ('offset' in b && !isMap(b.offset)) throw new Fail('الإزاحة: { مفتاح المرحلة: عدد أيام }', 400, 'plan_invalid');
  const r = planEdit({
    stages: base.stages, schedule: c.schedule || {}, cohort: c, requirements: base.requirements,
    edit: { days: b.days || {}, follow: b.follow === true, off: b.off || {}, with: b.with || {}, offset: b.offset || {} },
  });
  if (r.errors.length) throw new Fail(r.errors.map((e: any) => e.msg).join('، '), 400, 'plan_invalid', { errors: r.errors });
  try { return cleanScheduleReport(r.schedule, base.keys, base.titles).schedule; }
  catch (err) { throw new Fail((err as Error).message, 400, 'plan_invalid'); }
}

// جلسات التوجيه المحجوزة القادمة في المراحل التي تُوقف: تحذير لا منع (البند 4.6)، لأن حجزها يُحجب ما دامت موقوفة
async function bookedIn(c: any, base: any, keys: string[]) {
  if (!keys.length) return {};
  const reqs = base.requirements.filter((r: any) => r.kind === 'coaching' && keys.includes(r.stage_key));
  if (!reqs.length) return {};
  const m = await cohortMemberIds(c.id);
  const members = new Set(m?.ids || []);
  const now = new Date().toISOString();
  const rows = must(await db.from('coaching_sessions').select('participant_id, requirement_id, status, starts_at').in('requirement_id', reqs.map((r: any) => r.id))
    .in('status', ['requested', 'booked'])) || [];
  const stageOf = new Map(reqs.map((r: any) => [r.id, r.stage_key]));
  const out: Record<string, number> = {};
  for (const x of rows as any[]) {
    if (!members.has(x.participant_id) || (x.starts_at && String(x.starts_at) < now)) continue;
    const k = stageOf.get(x.requirement_id) as string;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

async function impactOf(c: any, base: any, after: any) {
  const offOf = (sch: any) => Object.keys(sch || {}).filter((k) => sch[k]?.off === true);
  const was = new Set(offOf(c.schedule || {})), now = new Set(offOf(after));
  // حين تعود مرحلة موقوفة وحده تُحسب الرحلة بالخطة الجديدة لكل عضو، فيُعرف من تجاوزها
  const restarts = [...was].some((k) => !now.has(k));
  const people = await peopleOf(c, restarts ? after : null);
  const booked = await bookedIn(c, base, [...now].filter((k) => !was.has(k)));
  const impact = planImpact({ stages: base.stages, before: c.schedule || {}, after, cohort: c, milestones: base.milestones, people,
    today: new Date(), cutoff: cutoffFrom(Deno.env.get('MILESTONE_R0_CUTOFF')), booked });
  return { impact, people };
}

// إعادة التشغيل بعد التجاوز (القرار 12): الافتراضي «اعفِ من تجاوزها»، فيُكتب skip في participant_stage_overrides لمن تجاوزها
// وهي موقوفة ولا تدخل له فيها، ويُحفظ في السجل ليحذفه التراجع. و«أعدها عليهم» لا يكتب شيئًا.
// out: ما كُتب يُضاف إليه دفعة دفعة، فإن تعذّر شيء في منتصفه عرف المستدعي ما كُتب فيحذفه. والقراءة والكتابة على دفعات
// من 150 كما في peopleOf: قائمة معرفات كاملة في .in تتجاوز طول الرابط
const SKIP_CHUNK = 150;
async function exemptPassed(a: Admin, c: any, impact: any, mode: string, out: { participant_id: string; stage_key: string }[]) {
  if (mode === 'apply') return out;
  for (const r of impact.reenabled || []) {
    const all: string[] = r.ids || [];
    for (let i = 0; i < all.length; i += SKIP_CHUNK) {
      const ids = all.slice(i, i + SKIP_CHUNK);
      const have = must(await db.from('participant_stage_overrides').select('participant_id').eq('program_id', c.program_id).eq('stage_key', r.key).in('participant_id', ids)) || [];
      const taken = new Set((have as any[]).map((x) => x.participant_id));
      const fresh = ids.filter((x) => !taken.has(x));
      if (!fresh.length) continue;
      const at = new Date().toISOString();
      must(await db.from('participant_stage_overrides').upsert(fresh.map((id) => ({ participant_id: id, program_id: c.program_id, stage_key: r.key, action: 'skip',
        note: 'أُعفي من مرحلة تجاوزها وهي موقوفة لدفعته (خطة الدفعة)', by_email: a.email, created_at: at }))));
      out.push(...fresh.map((id) => ({ participant_id: id, stage_key: r.key })));
    }
  }
  return out;
}
// التراجع يحذف الإعفاءات التي كتبها الحفظ المتراجع عنه، ما بقيت إعفاءً
async function unexempt(c: any, skips: any[]) {
  for (const x of skips || []) {
    must(await db.from('participant_stage_overrides').delete().eq('participant_id', x.participant_id).eq('program_id', c.program_id).eq('stage_key', x.stage_key).eq('action', 'skip'));
  }
}

// «أبلغ المشاركين» (القرار 13): ملاحظة في ملف كل من في الرحلة ولم ينهها، تصله ببريد بقالب الملاحظات القائم (bulk: يدخل الطابور
// إن بلغت الحصة سقفها ولا يزاحم رموز الدخول). مرة واحدة لكل حفظ (المفتاح cohort_plan ومرجع الحفظ)، وتعذّرها لا يُسقط الحفظ
async function notifyMembers(c: any, impact: any, people: any[] | null, ref: string) {
  if (!Array.isArray(people)) return null;
  const ids = people.filter((p) => p.at).map((p) => p.id);
  const n = planNotice(impact);
  let sent = 0;
  const queue = [...ids];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const saved = await OB.record(id, { code: 'cohort_plan', ref, kind: 'note', title: n.title, body: n.body });
      if (saved) sent += 1;
    }
  }));
  return sent;
}

const planOut = (base: any, c: any, schedule: any) => {
  const p = cohortPlan(base.stages, { ...c, schedule });
  return { schedule, start: p.start, end: p.end, total_days: p.total_days, stages: p.stages, issues: p.issues };
};

async function lastRow(cohortId: string) {
  const rows = must(await db.from('audit_log').select('id, action, actor, created_at, before, after').eq('entity_id', cohortId)
    .in('action', [...PLAN_ACTIONS]).order('created_at', { ascending: false }).limit(10)) || [];
  // الترتيب في الذاكرة أيضًا: لا يُتكل على ترتيب القراءة في الاختبار والإنتاج
  return (rows as any[]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function write(a: Admin, c: any, base: any, after: any, action: 'cohort.plan' | 'cohort.plan-undo', extra: Body = {}, opts: { reenable?: string; notify?: boolean; unskip?: any[] } = {}) {
  const { impact, people } = await impactOf(c, base, after);
  const before = JSON.parse(JSON.stringify(c.schedule || {}));
  const updated_at = new Date().toISOString();
  const prevAt = c.updated_at ?? null;
  // الكتابة مشروطة بأن الصف لم يتغير منذ قُرئ (والأثر قد يأخذ ثواني): كاتبان معًا لا يكتب أحدهما فوق الآخر بصمت
  const q = db.from('cohorts').update({ schedule: after, updated_at }).eq('id', c.id);
  const saved = must(await (prevAt ? q.eq('updated_at', prevAt) : q.is('updated_at', null)).select('*').maybeSingle()) as any;
  if (!saved) throw new Fail('تغيّرت الدفعة أثناء الحفظ. أعد فتح التبويب لترى الخطة الحالية ثم عدّل.', 409, 'stale');
  // المعالم التي حرّك الحفظ موعدها: حارس البريد يحجب ما صار متأخرًا منها وحدها (lateMilestoneNotices)، لا كل معالم الدفعة.
  // ومعها معالم المراحل المعادة (R2b): تعود بمواعيد قد تكون في الماضي، فلا يُرسل عما صار متأخرًا بالإعادة
  const moved_ids = [...impact.milestones, ...(impact.restored || [])].map((m: any) => String(m.id));
  // الإعفاءات والسجل معًا تحت الحارس نفسه: إن تعذّر أحدهما تُعاد الخطة كما كانت ويُحذف ما كُتب من الإعفاءات
  const skips: { participant_id: string; stage_key: string }[] = [];
  try {
    await exemptPassed(a, c, impact, opts.reenable || 'exempt', skips);
    await audit('admin', a.email, action, 'cohorts', c.id, { schedule: before }, { schedule: after, summary: impactSummary(impact), moved_ids,
      ...(skips.length ? { skips } : {}), ...(opts.notify ? { notify: true } : {}), ...extra });
  } catch (err) {
    // بلا سطر في السجل لا تراجع ولا حارس بريد للحفظ: تُعاد الخطة كما كانت ويُحذف ما كُتب من الإعفاءات، ويفشل الطلب
    const { error } = await db.from('cohorts').update({ schedule: before, updated_at: prevAt }).eq('id', c.id).eq('updated_at', saved.updated_at || updated_at);
    if (error) console.error('cohort-plan: restore after write failure', error.message);
    await unexempt(c, skips).catch((e) => console.error('cohort-plan: unexempt after write failure', e));
    throw err;
  }
  // التراجع يحذف إعفاءات الحفظ الذي يتراجع عنه بعد أن سُجّل
  if (opts.unskip?.length) await unexempt(c, opts.unskip).catch((e) => console.error('cohort-plan: unexempt on undo', e));
  // البلاغ بعد السجل: الحفظ تم، وتعذّر البلاغ يُقال في الرد ولا يُسقطه
  let notified: number | null = null;
  if (opts.notify) notified = await notifyMembers(c, impact, people, `${c.id}:${saved.updated_at || updated_at}`).catch((e) => { console.error('cohort-plan: notify', e); return null; });
  return { success: true, saved: true, cohort: { id: saved.id, schedule: saved.schedule || after, updated_at: saved.updated_at || updated_at },
    plan: planOut(base, c, after), impact, exempted: skips.length, notified };
}

// إعادة التشغيل بعد التجاوز: «اعفِ من تجاوزها» افتراضيًا، و«أعدها عليهم» باختيار صريح
const reenableOf = (b: Body) => (b.reenable === 'apply' ? 'apply' : 'exempt');

export async function cohortPlanAction(a: Admin, b: Body) {
  const op = ['preview', 'save', 'undo', 'history'].includes(b.op) ? b.op : 'preview';
  const c = await loadCohort(b);
  if (op === 'history') {
    const rows = await lastRow(c.id);
    return { success: true, history: rows.map((r: any) => ({ id: r.id, action: r.action, actor: r.actor, at: r.created_at, summary: r.after?.summary || null })),
      can_undo: rows[0]?.action === 'cohort.plan' && sameSchedule(rows[0]?.after?.schedule, c.schedule || {}) };
  }
  const base = await baseOf(c);
  const lock = planLock(c);
  if (op === 'preview') {
    const after = nextSchedule(c, base, b);
    const { impact } = await impactOf(c, base, after);
    return { success: true, preview: true, locked: lock, changed: !sameSchedule(c.schedule || {}, after), plan: planOut(base, c, after), impact };
  }
  // الحفظ والتراجع: الدفعة المغلقة والمفتوحة غير المثبتة للقراءة (planLock)، وحفظ من خطة أقدم من الحالية يُرفض
  if (lock) throw new Fail(lock.msg, 409, lock.code);
  // ما بُنيت عليه المسودة مطلوب في الحفظ والتراجع (اللوحة ترسله دائمًا)، فلا يمر حفظ بلا فحص النسخة
  if (c.updated_at && (b.base_updated_at === undefined || b.base_updated_at === null || b.base_updated_at === '')) {
    throw new Fail('أعد فتح التبويب ثم احفظ: لم يُعرف على أي نسخة من الخطة بُني التعديل.', 400, 'base_required');
  }
  if (b.base_updated_at && c.updated_at && String(b.base_updated_at) !== String(c.updated_at)) {
    throw new Fail('تغيّرت الدفعة بعد أن فتحت التبويب. أعد فتحه لترى الخطة الحالية ثم عدّل.', 409, 'stale');
  }
  if (op === 'undo') {
    const [last] = await lastRow(c.id);
    if (!last || last.action !== 'cohort.plan') throw new Fail('لا حفظ للخطة يُتراجع عنه.', 409, 'nothing_to_undo');
    if (!sameSchedule(last.after?.schedule, c.schedule || {})) throw new Fail('تغيّرت خطة الدفعة بعد آخر حفظ (ترقية نسخة أو تعديل آخر)، فلا يُتراجع عنه تلقائيًا.', 409, 'plan_changed');
    const after = nextSchedule(c, base, b, last.before?.schedule || {});
    // التراجع عن إيقاف يعيد المرحلة، فيُعفى من تجاوزها كما في الحفظ (الافتراضي)، ويحذف إعفاءات الحفظ الذي يتراجع عنه
    return write(a, c, base, after, 'cohort.plan-undo', { undoes: last.id }, { reenable: reenableOf(b), unskip: last.after?.skips || [] });
  }
  const after = nextSchedule(c, base, b);
  if (sameSchedule(c.schedule || {}, after)) return { success: true, unchanged: true, plan: planOut(base, c, after) };
  return write(a, c, base, after, 'cohort.plan', b.follow === true ? { follow: true } : {}, { reenable: reenableOf(b), notify: b.notify === true });
}
