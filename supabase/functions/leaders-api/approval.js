// ════════════════════════════════════════════════════════════════
// الاعتماد الجماعي: من يُعتمد بمستواه المحسوب ومن يُستبقى للمراجعة، ولماذا (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// الإدارة بالاستثناء: الآلة تعتمد الواضح، والإنسان يقرر في الاستثناء. الإشارات نفسها التي يراها المدير في ملف
// المشارك (evaluatePlacement: الحدّية والأعلام، وجدية الإجابة، وطلب الإعادة)، فلا يحكم الاعتماد الجماعي بغير ما في الملف.
// الحالة الحدّية تُستبقى (قرار المالك 2026-11-15): المستوى التالي في متناول هامش صغير، فيقرره إنسان.
import { DIMENSIONS, LEVELS } from './logic.js';
import { DIM_AR, LEVEL_AR } from './labels.js';

// حد الطلب الواحد، كالإجراءات الجماعية الأخرى (BULK_MAX في admin.ts)
export const BULK_APPROVE_MAX = 50;

/** أسباب استبقاء مشارك عن الاعتماد الجماعي بمستواه المحسوب. فارغة = يُعتمد
 * @param {{ status?: string, placements?: { dimension: string, level: string }[], evaluations?: Record<string, any>, effort?: { level?: string } | null, retake?: any }} d
 *   placements: المستوى المحفوظ لكل بُعد (يُعتمد كما هو) · evaluations: evaluatePlacement لكل بُعد من آخر قياس مسلَّم */
export function approvalHolds({ status, placements = [], evaluations = {}, effort = null, retake = null }) {
  const out = [];
  if (status !== 'pending_approval') return [{ key: 'status', text: 'ليس بانتظار الاعتماد' }];
  if (retake) out.push({ key: 'retake', text: 'طُلبت إعادة قياسه ولم يسلّم قياسًا جديدًا' });
  if (effort?.level === 'low') out.push({ key: 'effort', text: 'أجاب باستعجال' });
  else if (effort?.level === 'watch') out.push({ key: 'effort', text: 'جدية إجابته تحت المراجعة' });
  const byDim = Object.fromEntries((placements || []).map((x) => [x.dimension, x.level]));
  for (const d of DIMENSIONS) {
    const name = DIM_AR[d] || d;
    const ev = evaluations[d];
    if (!LEVELS.includes(byDim[d]) || !ev) { out.push({ key: 'missing', dim: d, text: `لا مستوى محسوب في ${name}` }); continue; }
    if (ev.level && ev.level !== byDim[d]) out.push({ key: 'drift', dim: d, text: `المستوى المحفوظ في ${name} (${LEVEL_AR[byDim[d]]}) يخالف المحسوب الآن (${LEVEL_AR[ev.level]})` });
    if (ev.borderline) out.push({ key: 'borderline', dim: d, text: `حالة حدّية في ${name}: المستوى التالي في متناول هامش صغير` });
    for (const f of ev.flags || []) out.push({ key: f.key, dim: d, text: `${f.reason_ar} في ${name}` });
  }
  return out;
}

// تقسيم المحددين: من يُعتمد ومن يُستبقى بأسبابه. rows: { id, full_name, ...مدخل approvalHolds }
export function splitForApproval(rows = []) {
  const ready = [], held = [];
  for (const r of rows) {
    const holds = approvalHolds(r);
    const levels = Object.fromEntries((r.placements || []).map((x) => [x.dimension, x.level]));
    (holds.length ? held : ready).push({ id: r.id, full_name: r.full_name, levels, ...(holds.length ? { holds } : {}) });
  }
  return { ready, held };
}

// أثر البريد قبل التنفيذ: كم يُرسل الآن وكم يدخل الطابور (السقف اليومي يصفّ الزائد ولا يُسقطه)
export function mailPlan(count, { used = 0, cap = 80 } = {}) {
  const room = Math.max(0, Number(cap) - Number(used || 0));
  return { now: Math.min(count, room), queued: Math.max(0, count - room) };
}
