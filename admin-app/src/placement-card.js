// ════════════════════════════════════════════════════════════════
// بطاقة «المستوى في الأبعاد الثلاثة» في ملف المشارك: حالة كل صف ومقياس المؤشر
// ════════════════════════════════════════════════════════════════
// العرض وحده: المستوى والأعلام من evaluatePlacement في الخادم، وشرط التعليل من overrideNeedsReason
// نفسها التي يرفض بها الخادم، وحدود المقياس من نموذج التسكين (placement_model). لا قرار هنا.
// (تصور بطاقة المستوى وإجابات القياس، المرحلة 1، 2026-11-11)
import { DEFAULT_MODEL, OVERRIDE_REASON_MIN, overrideNeedsReason } from '../../supabase/functions/leaders-api/logic.js';

// ما يستحق انتباه المدير في الصف: الحالة الحدّية وكل علم معلوماتي
export const attentionCount = (ev) => (ev?.borderline ? 1 : 0) + (ev?.flags || []).length;

// حالة صف البُعد: هل يخالف المستوى القائم، وهل ينقصه التعليل، وهل يُفتح تلقائيًا
// current: المستوى القائم (المعتمد أو المحسوب) · chosen: ما في القائمة الآن · note: التعليل المكتوب
export function rowState({ ev, current, chosen, note, canWrite = true }) {
  const override = !!canWrite && !!chosen && !!current && chosen !== current;
  const needsReason = !!canWrite && overrideNeedsReason(current, chosen, note);
  const attention = attentionCount(ev);
  return { override, needsReason, attention, open: attention > 0 || needsReason };
}

// أول بُعد يمنع الاعتماد وسببه بنص يظهر تحت الزر، أو null حين يكتمل كل شيء
export function approveBlocker(dims, { levels, notes, currentLevel, dimName }) {
  const empty = dims.find((d) => !levels?.[d]);
  if (empty) return { dim: empty, field: 'level', text: `حدّد مستوى ${dimName(empty)}` };
  const bare = dims.find((d) => overrideNeedsReason(currentLevel(d), levels[d], notes?.[d]));
  if (bare) return { dim: bare, field: 'note', text: `اكتب سبب مخالفة المستوى المحسوب في ${dimName(bare)} (${OVERRIDE_REASON_MIN} أحرف على الأقل)` };
  return null;
}

// حدود مقياس المؤشر من النموذج: حد المتوسط وحد الاحترافي، ومنطقة الحدّية قبل كل حد بعرض الهامش
export function compositeScale(model) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const cut = (v) => Math.max(0, Math.min(100, Number(v)));
  const marks = [
    { key: 'intermediate', at: cut(m.min_intermediate) },
    { key: 'advanced', at: cut(m.min_advanced) },
  ];
  const band = Number(m.borderline) || 0;
  return { marks, zones: marks.map((x) => ({ key: x.key, from: cut(x.at - band), to: x.at })), floor: cut(m.floor_intermediate) };
}
