// ════════════════════════════════════════════════════════════════
// أيام الورشة في بطاقة المرحلة (W3، تصور الرحلة بالسحب والورش والحضور 2026-11-18، ب5.4)
// ════════════════════════════════════════════════════════════════
// نموذج عرض نقي لقسم «أيام التدريب: 2 من 4 محددة» في بطاقة المرحلة بتبويب «الرحلة»، ولشاشة «الحضور والجلسات».
// المصادر: الجلسات من admin.cohort-workshops (الطريقة الفعلية والمتوقع والحاضر من الخادم)، و«خارج النافذة» من نموذج الخط
// الزمني نفسه (journeyTimeline يحسبه لكل جلسة بتوقيت الرياض)، فلا يُحسب تاريخ هنا. والكتابة كلها بـadmin.workshop-save.
import { countAr, SESSION_MODE_AR } from '../../supabase/functions/leaders-api/labels.js';
import { isUndated, renderJourneyText, SESSION_DEFAULTS, SESSION_LINK_LATER_AR, SESSION_TBD_AR } from '../../supabase/functions/leaders-api/logic.js';
import { timeOnly, weekTime } from './dates.js';
import { outsideSessions } from '../../supabase/functions/leaders-api/journey-timeline.js';

// طريقة توثيق الحضور بكلمات المدير: مصدر واحد للوحة (شاشة الحضور والجلسات وبطاقة المرحلة)
export const VERIFY_AR = Object.freeze({ qr: 'التوثيق برمز QR', join: 'التوثيق بالانضمام من التطبيق', manual: 'التوثيق يدويًا', auto: 'التوثيق آلي بانتهاء الجلسة' });
// حد السعة كقيد القاعدة (workshop_sessions_capacity_check) ورسالة الخادم (cleanCapacity في activities.ts)
export const CAPACITY_MAX = 10000;
// حقل السعة في نموذج الجلسة نفسه، ويظهر بعد ترحيل عمودها وحده (capacity_ready من الخادم)
export const CAPACITY_FIELD = Object.freeze({
  name: 'capacity', label: 'السعة (اختياري)', type: 'number',
  help: `عدد المقاعد في القاعة أو الحد للجلسة عن بعد، من 1 إلى ${CAPACITY_MAX}. للعرض والتنبيه فقط: لا يُمنع أحد من الحضور إن زاد المتوقع عليها.`,
});
// حقول الجلسة مع السعة إن رُحّلت: قبل «مفعّلة» آخر النموذج
export const withCapacity = (fields, ready) => {
  if (!ready) return fields;
  const at = fields.findIndex((f) => f.name === 'active');
  return at < 0 ? [...fields, CAPACITY_FIELD] : [...fields.slice(0, at), CAPACITY_FIELD, ...fields.slice(at)];
};

const daysAr = (n) => countAr(n, 'يوم واحد', 'يومان', 'أيام', 'يومًا');
// «18 من السعة 20»، وتنبيه لا منع إن زاد المتوقع على السعة (أ8: السعة عرض وتنبيه فقط)
export const capacityAr = (expected, capacity) => (capacity ? `${expected ?? 0} من السعة ${capacity}` : '');
export const capacityOver = (expected, capacity) => !!capacity && Number(expected) > Number(capacity);
export const capacityOverAr = (expected, capacity) => (capacityOver(expected, capacity)
  ? `المتوقع (${expected}) أكثر مما تسعه (${capacity}). الحضور لا يُمنع، فراجع المكان أو أضف يومًا آخر.` : '');

/** متطلبات الحضور في المرحلة: الجلسات الجماعية الظاهرة العاملة، بعدد أيامها المطلوب
 * @param {any} def تعريف الدفعة (admin.cohort-definition) @param {string} key مفتاح المرحلة */
export function stageWorkshopReqs(def, key) {
  const reqs = def?.requirements || [];
  return reqs.filter((r) => r.stage_key === key && r.kind === 'workshop' && r.active !== false && !r.hidden && r.id)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((r) => ({ id: r.id, title: renderJourneyText(r.title_ar || '', { reqs }), need: Number(r.config?.sessions_required) || SESSION_DEFAULTS.sessions_required, verify: r.config?.verify || 'qr' }));
}

/** قسم الأيام في بطاقة مرحلة: العنوان والعدّاد، وصف لكل يوم بموعده ومكانه وطريقته وحضوره وسعته وتنبيهاته
 * @param {{ def: any, stage: { key: string, title: string }, sessions?: any[] | null, model?: any, cohortId?: string, now?: number }} o
 * sessions: من admin.cohort-workshops، أو null قبل قراءتها (فتُقرأ من جلسات التعريف بلا أعداد) */
export function workshopDays({ def, stage, sessions = null, model = null, cohortId = '', now = Date.now() }) {
  const reqs = stageWorkshopReqs(def, stage.key);
  if (!reqs.length) return null;
  const ids = new Set(reqs.map((r) => r.id));
  const list = (sessions ?? def?.sessions ?? []).filter((s) => ids.has(s.requirement_id) && (!s.cohort_id || !cohortId || s.cohort_id === cohortId));
  // «خارج نافذة المرحلة» من الخط نفسه: كل جلسة مؤرخة لها نقطة بعلامة outside
  const outside = new Set(outsideSessions(model).map((x) => x.session));
  const reqTitle = new Map(reqs.map((r) => [r.id, r.title]));
  const rows = list.map((s) => {
    const undated = isUndated(s);
    const started = !undated && Date.parse(s.starts_at) <= now;
    const held = !undated && Date.parse(s.ends_at) < now;
    const online = s.mode === 'online';
    const known = s.expected != null;
    const verify = s.verify || reqs.find((r) => r.id === s.requirement_id)?.verify || 'qr';
    return {
      id: s.id, req_id: s.requirement_id, req_title: reqTitle.get(s.requirement_id) || '', title: s.title_ar, active: s.active !== false, general: !s.cohort_id,
      undated, held, started, upcoming: !undated && !held,
      when_ar: undated ? SESSION_TBD_AR : `${weekTime(s.starts_at)} إلى ${timeOnly(s.ends_at)}`,
      mode: online ? 'online' : 'in_person', place_ar: online ? `${SESSION_MODE_AR.online}${s.join_url ? '' : `، ${SESSION_LINK_LATER_AR}`}` : s.location_ar || `${SESSION_MODE_AR.in_person}، المكان لم يُحدد بعد`,
      verify, verify_ar: VERIFY_AR[verify] || verify, qr: verify === 'qr',
      expected: known ? s.expected : null, attended: known ? s.attended : null,
      // المتوقع دائمًا، والحاضر بعد البدء (من يوم انعقد أو بدأ)
      counts_ar: !known ? '' : started ? `حضر ${s.attended} من ${s.expected}` : `المتوقع ${s.expected}`,
      capacity: s.capacity ?? null, capacity_ar: capacityAr(known ? s.expected : 0, s.capacity),
      over: known && capacityOver(s.expected, s.capacity), over_ar: known ? capacityOverAr(s.expected, s.capacity) : '',
      outside: outside.has(s.id), invited: !!s.invited_at, can_invite: !!s.cohort_id && !undated && !held && s.active !== false,
      raw: s,
    };
  });
  const need = reqs.reduce((n, r) => n + r.need, 0);
  const set = rows.filter((r) => r.active && !r.undated).length;
  const head = `أيام ${stage.title}`;
  return {
    reqs, rows, need, set,
    head_ar: head,
    count_ar: set > need ? `${daysAr(set)} محددة، والمطلوب حضور ${need}` : `${set} من ${need} محددة`,
    tone: set < need ? 'warn' : 'ok',
    empty_ar: 'لا أيام بعد. أضف أول يوم أو ورشة ليظهر للمشاركين في رحلتهم بموعده ومكانه.',
  };
}
