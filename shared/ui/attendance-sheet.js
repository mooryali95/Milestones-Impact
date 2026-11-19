// ════════════════════════════════════════════════════════════════
// حالة ورقة الحضور (تصور تشغيل الدفعة 2026-11-19، 4.2): منطق خالص بلا واجهة
// ════════════════════════════════════════════════════════════════
// الورقة مسودة فوق قائمة الخادم: مربع لكل متوقع، المعلَّم «حاضر». الحفظ يرسل الفرق وحده (من يُسجَّل ومن يُلغى) في طلب واحد
// بسبب واحد (admin.workshop-mark-bulk أو xp.workshop-mark-bulk)، والخادم هو الحكم لكل مشارك. هنا: ما المسموح تغييره لكل دور،
// وما الفرق، وما الذي يمنع الحفظ، ونص النتيجة. يقرؤه AttendanceSheet.jsx في لوحة الإدارة وبوابة الخبير.
import { ATTEND_METHOD_AR, countAr, MARK_REASON_MAX } from '../../supabase/functions/leaders-api/labels.js';
import { foldText } from '../../supabase/functions/leaders-api/search-text.js';

/** سجّل حضوره بنفسه (رمز، أرقام، انضمام، قاعة): أي طريقة غير «يدوي» */
export const selfMarked = (attendance) => !!attendance && attendance.method !== 'manual';

/**
 * هل يُسمح لهذا الدور بتغيير مربع هذا الشخص؟ الغائب يُعلَّم دائمًا. والحاضر: المدير يلغي أي حضور (وما سجّله المشارك بنفسه
 * بسبب مكتوب)، والمدرب يلغي ما سجّله هو بيده وحده.
 */
export function canToggle(person, role) {
  const a = person?.attendance;
  if (!a) return true;
  if (role === 'trainer') return a.method === 'manual' && a.mine === true;
  return true;
}
export const lockedWhy = (person, role) => (canToggle(person, role) ? ''
  : selfMarked(person.attendance) ? 'سجّل حضوره بنفسه، وإلغاؤه للإدارة' : 'سجّله غيرك، وإلغاؤه لمن سجّله أو للإدارة');

/** المسودة الأولى: الحاضرون كما في الخادم، ومعهم من اختيروا مسبقًا (من جدول الأعضاء) إن كانوا في القائمة */
export function initialChecked(people, preselect = []) {
  const pre = new Set(preselect);
  return new Set((people || []).filter((p) => p.attendance || pre.has(p.id)).map((p) => p.id));
}
/** من اختيروا مسبقًا وليسوا في قائمة هذه الجلسة: لا يُرسلون، ويُذكر عددهم */
export const notListed = (people, preselect = []) => { const ids = new Set((people || []).map((p) => p.id)); return preselect.filter((id) => !ids.has(id)); };

export function toggled(people, checked, id, role) {
  const p = (people || []).find((x) => x.id === id);
  if (!p || !canToggle(p, role)) return checked;
  const next = new Set(checked);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
/** «علّم الكل حاضرًا»: كل من في القائمة (أو المعروضين بالبحث وحدهم)، ولا يمس من هو حاضر */
export function allChecked(checked, shown) {
  const next = new Set(checked);
  for (const p of shown || []) next.add(p.id);
  return next;
}

/** الفرق بين المسودة والخادم: add يُسجَّلون، وmanual يُلغى حضورهم اليدوي، وself يُلغى حضور سجّلوه بأنفسهم (بسبب) */
export function sheetDiff(people, checked) {
  const add = [], manual = [], self = [];
  for (const p of people || []) {
    const on = checked.has(p.id);
    if (on && !p.attendance) add.push(p.id);
    else if (!on && p.attendance) (selfMarked(p.attendance) ? self : manual).push(p.id);
  }
  return { add, manual, self, changed: add.length + manual.length + self.length > 0 };
}

/** السبب المختار: من القائمة القصيرة، أو النص الحر مع «سبب آخر» */
export const reasonOf = (why, other) => String(why === 'other' ? other : why || '').trim().slice(0, MARK_REASON_MAX);

/**
 * ما يمنع الحفظ، أو null. المدرب يكتب سبب التسجيل دائمًا (القرار 3)، وإلغاء حضور سجّله المشارك بنفسه بسبب مكتوب (القرار 4).
 * @returns {{ field: 'reason' | 'unmark', message: string } | null}
 */
export function sheetBlock({ diff, reason, unmarkReason, role }) {
  if (!diff.changed) return { field: 'reason', message: 'لا تغيير للحفظ' };
  if (role === 'trainer' && diff.add.length && !reason) return { field: 'reason', message: 'اختر سبب التسجيل اليدوي أو اكتبه' };
  if (diff.self.length && !String(unmarkReason || '').trim()) return { field: 'unmark', message: 'اكتب سبب إلغاء حضور من سجّل نفسه' };
  return null;
}

/** جسم الطلب الواحد. سبب الإلغاء يُرسل حين يُلغى حضور سجّله صاحبه وحده */
export function sheetPayload({ sessionId, diff, reason, unmarkReason }) {
  const absent = [...diff.manual, ...diff.self];
  const un = String(unmarkReason || '').trim().slice(0, MARK_REASON_MAX);
  return {
    session_id: sessionId,
    ...(diff.add.length ? { present: diff.add } : {}),
    ...(absent.length ? { absent } : {}),
    ...(diff.add.length && reason ? { reason } : {}),
    ...(diff.self.length && un ? { unmark_reason: un } : {}),
  };
}

const marksAr = (n) => countAr(n, 'حضور واحد', 'حضوران', 'حضور', 'حضورًا');
// مضاف إليه بعد «حضور»: المثنى بالياء
const peopleAr = (n) => countAr(n, 'مشارك واحد', 'مشاركَين', 'مشاركين', 'مشاركًا');

/** سطور التأكيد قبل الحفظ: ماذا سيُكتب وبأي سبب */
export function confirmLines({ diff, reason, unmarkReason }) {
  const out = [];
  if (diff.add.length) out.push(`يُسجَّل يدويًا حضور ${peopleAr(diff.add.length)}${reason ? `، والسبب: ${reason}` : '، بلا سبب مكتوب'}.`);
  if (diff.manual.length) out.push(`يُلغى ${marksAr(diff.manual.length)} سُجّل يدويًا.`);
  if (diff.self.length) out.push(`يُلغى ${marksAr(diff.self.length)} سجّله صاحبه بنفسه${String(unmarkReason || '').trim() ? `، والسبب: ${String(unmarkReason).trim()}` : ''}.`);
  return out;
}

/**
 * نتيجة الحفظ كما يعيدها الخادم: «سُجّل 17 · تُخطي 1 (مسجل أصلًا) · رُفض 1»، ومع كل مرفوض اسمه وسببه.
 * @param {any} r رد الخادم
 * @param {(id: string) => string} nameOf اسم صاحب المعرّف مما في الشاشة (القائمة أو المحددون)، فالرد بلا أسماء
 */
export function savedAr(r, nameOf = () => '') {
  const parts = [];
  if (r.marked) parts.push(`سُجّل ${r.marked}`);
  if (r.unmarked) parts.push(`أُلغي ${r.unmarked}`);
  if (r.already) parts.push(`تُخطي ${r.already} (مسجل أصلًا)`);
  const refused = (r.refused || []).map((x) => ({ id: x.id, name: nameOf(x.id) || 'مشارك', message: x.message || 'رُفض' }));
  if (refused.length) parts.push(`رُفض ${refused.length}`);
  return { text: parts.length ? parts.join(' · ') : 'لا تغيير', refused, tone: refused.length ? 'warn' : 'ok' };
}

/** بحث بالاسم داخل الورقة، بتوحيد الحروف العربية كما في بقية اللوحة */
export function filterPeople(people, q) {
  const needle = foldText(q || '');
  return needle ? (people || []).filter((p) => foldText(p.full_name || '').includes(needle)) : people || [];
}

/**
 * حالة الصف كما تُقرأ: «رمز QR · الأحد 10:05»، «يدوي · سجّله a@x · السبب: تعطل الرمز»، وللمدرب «يدوي · سجّلته أنت».
 * @param {any} attendance
 * @param {{ when?: (iso: string) => string }} [o]
 */
export function stateAr(attendance, { when = () => '' } = {}) {
  if (!attendance) return { label: 'غائب', detail: '' };
  const method = ATTEND_METHOD_AR[attendance.method] || ATTEND_METHOD_AR.manual;
  const detail = [
    attendance.checked_in_at ? when(attendance.checked_in_at) : '',
    attendance.method === 'manual' && attendance.mine ? 'سجّلته أنت' : '',
    attendance.method === 'manual' && attendance.recorded_by ? `سجّله ${attendance.recorded_by}` : '',
    attendance.note ? `السبب: ${attendance.note}` : '',
  ].filter(Boolean).join(' · ');
  return { label: `حاضر · ${method}`, detail };
}

/** «14 من 18 حضروا» */
export const presentCount = (people) => (people || []).filter((p) => p.attendance).length;
