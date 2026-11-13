// ════════════════════════════════════════════════════════════════
// الرؤية الشاملة للإدارة: أين توقف المشاركون، ومقارنة الدفعات، وحِمل الخبراء، وماذا تغيّر (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// لا تعريف جديد لأي حالة: خطوة ما قبل الاعتماد من onboardingOf (onboarding.js)، ودفعة المشارك من pickCohort (logic.js)،
// وحِمل الخبير بالعدّ نفسه الذي يرتّب به الترشيح (طلبات قائمة + جلسات قادمة)، ونص الحدث من auditAr (observations.js).
import { ONBOARDING_AR } from './onboarding.js';
import { auditAr } from './observations.js';

// ── مراحل الخط كله بترتيبها: أربع قبل الاعتماد (من onboarding.js) ثم حالات البرنامج ──
export const PIPELINE = ['profile', 'assessment_todo', 'assessment_doing', 'approval', 'placed', 'enrolled', 'completed', 'out'];
export const PIPELINE_AR = {
  profile: ONBOARDING_AR.profile, assessment_todo: ONBOARDING_AR.assessment_todo, assessment_doing: ONBOARDING_AR.assessment_doing, approval: ONBOARDING_AR.approval,
  placed: 'اعتُمد ولم يبدأ', enrolled: 'في البرنامج', completed: 'أتمّ البرنامج', out: 'موقوف أو منسحب',
};
/** المتعثر: من لم يبلغ الاعتماد بعد، وهو ما يذكّره admin.remind-stuck */
export const STUCK_STAGES = ['profile', 'assessment_todo', 'assessment_doing'];
/** ما ينتظر الإدارة لا المشارك */
export const WAITING_STAGES = ['approval', 'placed'];

/** @param {{ status?: string, onboarding?: { step?: string } }} p صف المشارك وعليه onboarding من onboardingOf */
export function pipelineStage(p) {
  const s = p?.status;
  if (s === 'withdrawn' || s === 'suspended') return 'out';
  if (s === 'completed' || s === 'enrolled' || s === 'placed') return s;
  const step = p?.onboarding?.step;
  return step && step !== 'done' && PIPELINE.includes(step) ? step : 'placed';
}

/** فلتر قائمة المشاركين المقابل لخانة في الجدول: خطوة ما قبل الاعتماد بفلتر «أين توقف»، وما بعدها بفلتر الحالة */
export function stageFilter(stage) {
  if (STUCK_STAGES.includes(stage)) return { step: stage };
  if (stage === 'approval') return { status: 'pending_approval' };
  if (stage === 'out') return { view: 'out' };
  return { status: stage };
}

const DAY = 864e5;
const empty = () => Object.fromEntries(PIPELINE.map((k) => [k, 0]));
/**
 * توزيع المشاركين على مراحل الخط مجمّعين (بالجهة أو بالدفعة).
 * @param {any[]} rows المشاركون وعلى كل واحد onboarding
 * @param {(p: any) => { key: string, name: string }|null} groupOf مجموعة المشارك، أو null ليُستثنى
 * @param {number} [now]
 */
export function pipelineBy(rows, groupOf, now = Date.now()) {
  const groups = new Map();
  const total = { key: 'all', name: 'الإجمالي', total: 0, stages: empty(), stuck: 0, waiting: 0, active_week: 0 };
  for (const p of rows || []) {
    const g = groupOf(p);
    if (!g) continue;
    if (!groups.has(g.key)) groups.set(g.key, { key: g.key, name: g.name, total: 0, stages: empty(), stuck: 0, waiting: 0, active_week: 0 });
    const stage = pipelineStage(p);
    const active = p.last_login_at && now - Date.parse(p.last_login_at) <= 7 * DAY;
    for (const t of [groups.get(g.key), total]) {
      t.total += 1; t.stages[stage] += 1;
      if (STUCK_STAGES.includes(stage)) t.stuck += 1;
      if (WAITING_STAGES.includes(stage)) t.waiting += 1;
      if (active) t.active_week += 1;
    }
  }
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const rate = (t) => {
    const live = t.total - t.stages.out;   // النسب من القائمين، فالمنسحب لا يخفض نسبة من بقي
    return { ...t, approved_pct: pct(t.stages.placed + t.stages.enrolled + t.stages.completed, live), completed_pct: pct(t.stages.completed, live), active_pct: pct(t.active_week, live) };
  };
  return { groups: [...groups.values()].map(rate).sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'ar')), total: rate(total) };
}

// ── حِمل الخبراء ──
export const LOAD_AR = { over: 'فوق طاقته', busy: 'مشغول', free: 'لديه متسع', idle: 'بلا إسناد', none: 'لم تُحدَّد طاقته' };
export const LOAD_TONE = { over: 'bad', busy: 'warn', free: 'ok', idle: '', none: '' };
export const BUSY_SHARE = 0.75;   // من هذه النسبة من ساعاته الأسبوعية يُعدّ مشغولًا
/**
 * @param {any[]} experts الخبراء النشطون
 * @param {{ requests?: Record<string, number>, upcoming?: Record<string, number>, people?: Record<string, number> }} [counts]
 */
export function expertLoad(experts, { requests = {}, upcoming = {}, people = {} } = {}) {
  return (experts || []).map((e) => {
    const demand = (requests[e.id] || 0) + (upcoming[e.id] || 0);
    const hours = e.weekly_hours == null ? null : Number(e.weekly_hours);
    const state = !demand ? 'idle' : hours == null || hours <= 0 ? 'none' : demand > hours ? 'over' : demand >= hours * BUSY_SHARE ? 'busy' : 'free';
    return { id: e.id, name: e.full_name, title: e.title || '', roles: e.roles || [], hours, requests: requests[e.id] || 0, upcoming: upcoming[e.id] || 0, people: people[e.id] || 0, demand, state, share: hours ? Math.round((demand / hours) * 100) : null };
  }).sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.demand - a.demand || String(a.name).localeCompare(String(b.name), 'ar'));
}

// ── ماذا تغيّر: سجل التدقيق كله بنص يُقرأ ──
export const ACTOR_AR = { admin: 'الإدارة', participant: 'مشارك', system: 'النظام', coordinator: 'منسق جهة', expert: 'خبير' };
export const CHANGE_AREAS = {
  participant: 'المشاركون', placement: 'المستويات', assessment: 'القياس', requirement: 'المتطلبات', submission: 'الأعمال', capstone: 'مشاريع التخرج',
  cohort: 'الدفعات', program: 'البرامج', expert: 'الخبراء', certificate: 'الشهادات', payment: 'الدفع', sponsor: 'الرعاية', settings: 'الإعدادات', system: 'النظام',
};
export const areaOf = (action) => String(action || '').split('.')[0];
/**
 * @param {any} h صف من audit_log
 * @param {Record<string, string>} [names] أسماء المشاركين بمعرّفاتهم
 */
export function changeRow(h, names = {}) {
  const area = areaOf(h.action);
  const isPerson = h.entity === 'participants' && h.entity_id;
  return {
    id: h.id, at: h.created_at, area, area_ar: CHANGE_AREAS[area] || area, text: auditAr(h.action), known: auditAr(h.action) !== h.action,
    actor_type: h.actor_type, by: h.actor_type === 'admin' ? h.actor : ACTOR_AR[h.actor_type] || h.actor_type || '',
    participant_id: isPerson ? h.entity_id : null, who: isPerson ? names[h.entity_id] || '' : '',
    detail: h.after?.reason ? String(h.after.reason) : h.action === 'participant.status' && h.after?.status ? String(h.after.status) : '',
  };
}
