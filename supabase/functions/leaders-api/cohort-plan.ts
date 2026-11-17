// ════════════════════════════════════════════════════════════════
// admin.cohort-plan: كاتب خطة الدفعة الوحيد (R2a في تصور محرر رحلة الدفعة، القرار 23)
// ════════════════════════════════════════════════════════════════
// op: preview (الافتراضي في القراءة) | save | undo | history
//   preview: الخطة الجديدة محسوبة وأثرها (planImpact) بلا حفظ، لكل مدير ولو للقراءة فقط
//   save:    يكتب cohorts.schedule بعد الحراس، وصفًا في leaders.audit_log (cohort.plan) بقيمته قبل وبعد وملخص الأثر
//   undo:    يعيد قيمة before من آخر حفظ لهذه الدفعة إن لم تتغير الخطة بعده، بالحراس نفسها (cohort.plan-undo)
//   history: آخر الحفظات والتراجعات لهذه الدفعة
// الجسم: { cohort_id, op, days: { مفتاح: عدد أو null }, follow: true، base_updated_at }. الحفظ والتراجع للكاتب وحده
// (index.ts يلفهما بـA.writer كما admin.cohort-save)، والمعاينة والسجل لكل مدير. لا ترحيل: الخطة في cohorts.schedule،
// والسجل في leaders.audit_log القائم.
import { audit, db, Fail, must } from './core.ts';
import type { Admin } from './admin.ts';
import { cohortDefinition, inProgram } from './logic.js';
import { cleanScheduleReport, cutoffFrom } from './milestones.js';
import { cohortMemberIds, defOf } from './programs.ts';
import { journeyFor } from './participant.ts';
import { positionOf } from './journey-map.js';
import { cohortPlan } from './stage-windows.js';
import { impactSummary, PLAN_ACTIONS, planEdit, planImpact, planLock, sameSchedule } from './cohort-plan.js';

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
  return { stages, keys, titles, milestones: ms as any[] };
}

// رحلة كل عضو كما يراها: موضعه الآن، وما أكمل من مراحل، وسجل معالمه (الإنجاز والتمديد)، فيُعاد حساب حالتها بالخطة الجديدة
async function peopleOf(c: any) {
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
      out.push({
        id: p.id, at: idx >= 0 ? j.journey[idx].key : null,
        stagesDone: (j.journey || []).filter((s: any) => s.status === 'done').map((s: any) => s.key),
        records: Object.fromEntries((j.milestones || []).map((x: any) => [x.id, { done_at: x.done_at || null, due_override: x.extended ? x.due : null, note: x.note || null }])),
      });
    }
  }));
  return out;
}

// الخطة الجديدة نظيفة بمفاتيح التعريف (cleanScheduleReport بالصيغة الموسعة)، أو رفض بالسبب
function nextSchedule(c: any, base: any, b: Body, target?: any) {
  if (target !== undefined) {
    try { return cleanScheduleReport(target, base.keys, base.titles).schedule; }
    catch (err) { throw new Fail(`لا يُعاد الحفظ السابق: ${(err as Error).message}`, 409, 'undo_invalid'); }
  }
  // R2a: المدة و«حرّر التواريخ لتتبع المدد» وحدهما. الإيقاف والتوازي للدفعة في مراحل لاحقة، فلا يُقبلان بصمت
  for (const k of ['off', 'with', 'offset', 'start', 'end', 'schedule']) {
    if (k in b) throw new Fail('في هذه المرحلة تُعدَّل مدة كل مرحلة وحدها من تبويب «الرحلة». الإيقاف والتوازي والتاريخ المثبت للدفعة في مراحل لاحقة.', 400, 'plan_field');
  }
  const r = planEdit({ stages: base.stages, schedule: c.schedule || {}, edit: { days: b.days || {}, follow: b.follow === true }, cohort: c });
  if (r.errors.length) throw new Fail(r.errors.map((e: any) => e.msg).join('، '), 400, 'plan_invalid', { errors: r.errors });
  try { return cleanScheduleReport(r.schedule, base.keys, base.titles).schedule; }
  catch (err) { throw new Fail((err as Error).message, 400, 'plan_invalid'); }
}

async function impactOf(c: any, base: any, after: any) {
  const people = await peopleOf(c);
  return planImpact({ stages: base.stages, before: c.schedule || {}, after, cohort: c, milestones: base.milestones, people,
    today: new Date(), cutoff: cutoffFrom(Deno.env.get('MILESTONE_R0_CUTOFF')) });
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

async function write(a: Admin, c: any, base: any, after: any, action: 'cohort.plan' | 'cohort.plan-undo', extra: Body = {}) {
  const impact = await impactOf(c, base, after);
  const before = JSON.parse(JSON.stringify(c.schedule || {}));
  const updated_at = new Date().toISOString();
  const saved = must(await db.from('cohorts').update({ schedule: after, updated_at }).eq('id', c.id).select('*').single()) as any;
  await audit('admin', a.email, action, 'cohorts', c.id, { schedule: before }, { schedule: after, summary: impactSummary(impact), ...extra });
  return { success: true, saved: true, cohort: { id: saved.id, schedule: saved.schedule || after, updated_at: saved.updated_at || updated_at },
    plan: planOut(base, c, after), impact };
}

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
    const impact = await impactOf(c, base, after);
    return { success: true, preview: true, locked: lock, changed: !sameSchedule(c.schedule || {}, after), plan: planOut(base, c, after), impact };
  }
  // الحفظ والتراجع: الدفعة المغلقة والمفتوحة غير المثبتة للقراءة (planLock)، وحفظ من خطة أقدم من الحالية يُرفض
  if (lock) throw new Fail(lock.msg, 409, lock.code);
  if (b.base_updated_at && c.updated_at && String(b.base_updated_at) !== String(c.updated_at)) {
    throw new Fail('تغيّرت الدفعة بعد أن فتحت التبويب. أعد فتحه لترى الخطة الحالية ثم عدّل.', 409, 'stale');
  }
  if (op === 'undo') {
    const [last] = await lastRow(c.id);
    if (!last || last.action !== 'cohort.plan') throw new Fail('لا حفظ للخطة يُتراجع عنه.', 409, 'nothing_to_undo');
    if (!sameSchedule(last.after?.schedule, c.schedule || {})) throw new Fail('تغيّرت خطة الدفعة بعد آخر حفظ (ترقية نسخة أو تعديل آخر)، فلا يُتراجع عنه تلقائيًا.', 409, 'plan_changed');
    const after = nextSchedule(c, base, b, last.before?.schedule || {});
    return write(a, c, base, after, 'cohort.plan-undo', { undoes: last.id });
  }
  const after = nextSchedule(c, base, b);
  if (sameSchedule(c.schedule || {}, after)) return { success: true, unchanged: true, plan: planOut(base, c, after) };
  return write(a, c, base, after, 'cohort.plan', b.follow === true ? { follow: true } : {});
}
