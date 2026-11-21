// ════════════════════════════════════════════════════════════════
// ورقة حضور الجلسة الجماعية مع المستشار (تصور تشغيل الدفعة 2026-11-19، 4.4، المرحلة 5): المنطق، بلا واجهة ليُختبر وحده
// ════════════════════════════════════════════════════════════════
// لكل مدعو حالة واحدة: حضر، لم يحضر، اعتذر، أو لم يُؤكَّد بعد. المسودة تحمل ما تغيّر وحده، والحفظ واحد (admin.coaching-group-mark
// أو xp.coaching-group-mark)، والخادم هو الحكم لكل مدعو (coaching-groups.ts: markGroup). role: المدير يغيّر أي حالة، والمستشار
// لا يغيّر ما أكّده غيره (locked من الخادم).
import { GROUP_STATE_AR } from '../../supabase/functions/leaders-api/labels.js';
import { foldText } from '../../supabase/functions/leaders-api/search-text.js';

export { GROUP_STATE_AR };
export const GROUP_CHOICES = ['attended', 'no_show', 'excused'];
export const GROUP_NOTE_MAX = 300;

/** حالة المدعو كما تُعرض: ما في المسودة إن وُجد، وإلا المحفوظ */
export const stateOf = (p, draft) => draft?.[p.id] ?? p.state;
export const canEdit = (p, role) => !(role === 'expert' && p.locked);
/** يضع حالة في المسودة، وإعادتها إلى المحفوظ تخرجها منها */
export function withState(people, draft, id, state) {
  const p = (people || []).find((x) => x.id === id);
  if (!p) return draft;
  const next = { ...draft };
  if (p.state === state) delete next[id]; else next[id] = state;
  return next;
}
/** «الكل حضر»: من لم يُؤكَّد بعد ممن يُعدَّل، ولا يمس من سُجّل غيابه أو اعتذاره */
export function allAttended(people, draft, role) {
  const next = { ...draft };
  for (const p of people || []) if (canEdit(p, role) && stateOf(p, draft) === 'booked') next[p.id] = 'attended';
  return next;
}
/** ما يُرسل: [{ id, state }] لمن تغيّرت حالته وحده */
export const groupMarks = (people, draft) => (people || []).filter((p) => draft?.[p.id] && draft[p.id] !== p.state).map((p) => ({ id: p.id, state: draft[p.id] }));
/** أعداد الورقة بالمسودة */
export function groupCounts(people, draft) {
  const n = (s) => (people || []).filter((p) => stateOf(p, draft) === s).length;
  return { total: (people || []).length, attended: n('attended'), no_show: n('no_show'), excused: n('excused'), pending: n('booked') };
}
export const countsAr = (c) => [`حضر ${c.attended} من ${c.total}`, c.no_show ? `لم يحضر ${c.no_show}` : '', c.excused ? `اعتذر ${c.excused}` : '', c.pending ? `لم يُؤكَّد ${c.pending}` : ''].filter(Boolean).join(' · ');
/** سطر ما سيُحفظ: «حضر 3، لم يحضر 1» */
export function draftAr(marks) {
  const n = (s) => marks.filter((m) => m.state === s).length;
  return [n('attended') && `حضر ${n('attended')}`, n('no_show') && `لم يحضر ${n('no_show')}`, n('excused') && `اعتذر ${n('excused')}`, n('booked') && `تراجع ${n('booked')}`].filter(Boolean).join('، ');
}
/** رد الحفظ جملة، ومعه من رُفض بسببه */
export function savedAr(r, nameOf = () => '') {
  const refused = (r?.refused || []).map((x) => ({ id: x.id, name: nameOf(x.id) || 'مدعو', message: x.message || 'لم يُسجَّل' }));
  const parts = [r?.marked ? `سُجّل ${r.marked}` : '', r?.already ? `كما هو ${r.already}` : '', refused.length ? `لم يُسجَّل ${refused.length}` : ''].filter(Boolean);
  return { tone: refused.length ? 'warn' : 'ok', text: parts.join('، ') || 'لا تغيير', refused, left: r?.pending ?? null };
}
export const filterPeople = (people, q) => { const t = foldText(q || ''); return t ? (people || []).filter((p) => foldText(p.full_name || '').includes(t)) : people || []; };
