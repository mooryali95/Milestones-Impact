// ════════════════════════════════════════════════════════════════
// «أين هو الآن»: أربع حقائق عن المشارك في سطر واحد، لملفه في الإدارة ولعمود «بانتظار» في قائمة المشاركين
// ════════════════════════════════════════════════════════════════
// دالة نقية واحدة (المرحلة 2 من تصور ملف المشارك، 2026-11-24): الخادم يمرر ما قرأه، والواجهة تعرض ولا تحسب.
// المرحلة من currentStages (ما يراه المشارك في رحلته)، والانتظار من حالات التسليم في جداولها، وآخر نشاط من
// last_active_at، والتالي من أقرب جلسة توجيه محجوزة وإلا أقرب معلم مستحق. لا يُخزَّن شيء.
import { currentStages } from './journey-map.js';

const DAY = 864e5;
export const IDLE_WARN_DAYS = 10;
// قبل الاعتماد: القرار عند الإدارة (حالات المشارك في labels.js)
const BEFORE_APPROVAL = ['registered', 'profiled', 'assessing'];

const n = (xs, st, pick = () => true) => (xs || []).filter((x) => x?.status === st && pick(x)).length;
const chapter = (m) => m?.learning_models?.capstone_sort != null || m?.chapter === true;
const plural = (k, one, two, many) => (k === 1 ? one : k === 2 ? two : `${k} ${many}`);

/** ما ينتظر من، من حالات التسليم في جداولها. المصدر نفسه للملف وللقائمة
 * @param {{ status?: string, requirements?: {status:string}[], models?: any[], capstone?: {status?:string}|null }} x */
export function waitingCounts({ status = null, requirements = [], models = [], capstone = null } = {}) {
  const admin = {
    decision: status === 'pending_approval' ? 1 : 0,
    journey: n(requirements, 'submitted'),
    learning: n(models, 'submitted', (m) => !chapter(m)),
    initiative: n(models, 'submitted', chapter) + (capstone?.status === 'submitted' ? 1 : 0),
  };
  const participant = {
    journey: n(requirements, 'returned'),
    learning: n(models, 'returned', (m) => !chapter(m)),
    initiative: n(models, 'returned', chapter) + (capstone?.status === 'returned' ? 1 : 0),
  };
  return { admin, participant };
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const firstTab = (o) => Object.entries(o).find(([, v]) => v > 0)?.[0] || null;

/** الأسبوع الحالي من عدد أسابيع الدفعة، إن كان لها تاريخ بدء وبدأت. الدفعة المفتوحة بلا أسابيع */
export function weekOf(cohort, now = Date.now()) {
  if (!cohort?.starts_on || cohort.is_default) return null;
  const start = Date.parse(cohort.starts_on);
  if (!Number.isFinite(start) || now < start) return null;
  const end = cohort.ends_on ? Date.parse(cohort.ends_on) : NaN;
  const of = Number.isFinite(end) && end > start ? Math.ceil((end - start + DAY) / (7 * DAY)) : null;
  const week = Math.floor((now - start) / (7 * DAY)) + 1;
  return { week: of ? Math.min(week, of) : week, of };
}

/**
 * @param {{ participant: any, journey?: any[], cohort?: any, waiting: ReturnType<typeof waitingCounts>, sessions?: any[], milestones?: any[] }} x
 * @returns {{ stage: {text:string, week:number|null, of:number|null, tab:string}, waiting_on: {who:'admin'|'participant'|null, n:number, text:string, tab:string|null},
 *   last_activity: {at:string|null, days:number|null, tone:'warn'|null, text:string, tab:string}, next: {text:string, at:string|null, tab:string|null} }}
 */
export function whereNow({ participant: p = {}, journey = [], cohort = null, waiting, sessions = [], milestones = [] }, now = Date.now()) {
  // المرحلة
  const cur = currentStages(journey);
  const done = journey.length > 0 && journey.every((s) => s.status === 'done' || s.status === 'skipped');
  const names = cur.stage?.status === 'active' ? cur.stages.map((s) => s.title_ar).join(' و') : null;
  const w = weekOf(cohort, now);
  const stageText = p.status === 'pending_approval' ? 'بانتظار اعتماد المسار'
    : BEFORE_APPROVAL.includes(p.status) ? 'لم يكمل التسجيل والقياس'
    : names || (done ? 'أتم الرحلة' : journey.length ? 'لم تُفتح مرحلة بعد' : 'بلا رحلة بعد');
  const stage = { text: stageText, week: w?.week ?? null, of: w?.of ?? null, tab: BEFORE_APPROVAL.includes(p.status) || p.status === 'pending_approval' ? 'decision' : 'journey' };

  // بانتظار من: الإدارة أولًا (ما ينتظر قرارها يوقفه)، ثم المشارك (ما أُعيد له)
  const wa = waiting || waitingCounts({});
  const na = sum(wa.admin), np = sum(wa.participant);
  const waiting_on = na ? { who: 'admin', n: na, text: wa.admin.decision ? 'قرارك: اعتماد المسار' : `مراجعتك: ${plural(na, 'بند واحد', 'بندان', 'بنود')}`, tab: firstTab(wa.admin) }
    : np ? { who: 'participant', n: np, text: `المشارك: ${plural(np, 'بند أُعيد له', 'بندان أُعيدا له', 'بنود أُعيدت له')}`, tab: firstTab(wa.participant) }
    : { who: null, n: 0, text: 'لا شيء معلق', tab: null };

  // آخر نشاط
  const at = p.last_active_at || p.last_login_at || null;
  const t = at ? Date.parse(at) : NaN;
  const days = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
  const active = !['withdrawn', 'suspended', 'completed', 'graduated'].includes(p.status);
  const last_activity = {
    at, days, tab: 'log',
    tone: active && (days == null || days > IDLE_WARN_DAYS) ? 'warn' : null,
    text: days == null ? 'لم يدخل بعد' : days === 0 ? 'اليوم' : days === 1 ? 'أمس' : `قبل ${plural(days, 'يوم', 'يومين', days <= 10 ? 'أيام' : 'يومًا')}`,
  };

  // التالي: أقرب جلسة محجوزة لم تبدأ، وإلا أقرب معلم لم يتم
  const iso = new Date(now).toISOString();
  const s = (sessions || []).filter((x) => x?.status === 'booked' && String(x.starts_at || '') > iso).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0];
  const m = (milestones || []).filter((x) => x && !x.done && x.due).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const next = s ? { text: `جلسة توجيه${s.expert ? ` مع ${s.expert}` : ''}`, at: s.starts_at, tab: 'initiative' }
    : m ? { text: `${String(m.due) < iso.slice(0, 10) ? 'متأخر: ' : ''}${m.title_ar || m.title || 'معلم'}`, at: m.due, tab: 'journey' }
    : { text: 'لا موعد قادم', at: null, tab: null };

  return { stage, waiting_on, last_activity, next };
}
