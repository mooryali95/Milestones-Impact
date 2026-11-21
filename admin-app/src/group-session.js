// ════════════════════════════════════════════════════════════════
// الجلسة الجماعية مع المستشار في لوحة الإدارة (تصور تشغيل الدفعة 2026-11-19، 4.4، المرحلة 5): نموذج العرض، بلا واجهة ليُختبر وحده
// ════════════════════════════════════════════════════════════════
// المعاينة من الخادم (admin.coaching-group-preview) بحكمه لكل مختار، والحفظ يعيد الحكم نفسه (admin.coaching-group-save). هنا:
// تجميع المعاينة في أقسامها، وجملتها، وجسم الحفظ، ونص نتيجته. لا حكم هنا على أحد.
import { countAr, GROUP_STATE_AR } from '../../supabase/functions/leaders-api/labels.js';

export { GROUP_STATE_AR };
export const MODE_OPTIONS = { online: 'عن بعد برابط', in_person: 'حضوري بمكان' };
const peopleAr = (n) => countAr(n, 'مشارك واحد', 'مشاركان', 'مشاركين', 'مشاركًا');

/** أقسام المعاينة: يُدعون، استنفدوا رصيدهم، لم تُفتح لهم الخدمة، لا يُضافون */
export function previewGroups(members) {
  const of = (c) => (members || []).filter((m) => m.category === c);
  return { ok: of('ok'), at_max: of('at_max'), locked: of('locked'), ineligible: of('ineligible') };
}
/** من سيُدعى فعلًا: الأهل، ومن اختير استثناءً من القسمين القابلين للاستثناء */
export function invited(members, exceptions) {
  const ex = exceptions instanceof Set ? exceptions : new Set(exceptions || []);
  return (members || []).filter((m) => m.category === 'ok' || ((m.category === 'at_max' || m.category === 'locked') && ex.has(m.id)));
}
/** جملة المعاينة كما في التصور: «6 سيُدعون. 1 استنفد رصيده. 1 الخدمة غير متاحة له بعد. 2 لا يُضافون.» */
export function previewLine(members, exceptions) {
  const g = previewGroups(members);
  const ex = exceptions instanceof Set ? exceptions : new Set(exceptions || []);
  const n = invited(members, ex).length;
  const added = [...g.at_max, ...g.locked].filter((m) => ex.has(m.id)).length;
  const left = (list) => list.filter((m) => !ex.has(m.id)).length;
  return [
    n ? `${n === 1 ? 'واحد سيُدعى' : `${n} سيُدعون`}${added ? ` (منهم ${added} استثناءً)` : ''}.` : 'لا أحد سيُدعى.',
    left(g.at_max) ? `${left(g.at_max)} استنفد رصيده ويُتخطى.` : '',
    left(g.locked) ? `${left(g.locked)} لم تُفتح له الخدمة ويُتخطى.` : '',
    g.ineligible.length ? `${g.ineligible.length} لا يُضاف.` : '',
  ].filter(Boolean).join(' ');
}
/** موعد التعارض جملة: «جلسة فردية الأحد 10:00» */
export const conflictAr = (c, when) => `${c.kind === 'workshop' ? `ورشة «${c.title || ''}»` : c.kind === 'group' ? 'جلسة جماعية أخرى' : 'جلسة فردية'} ${when(c.starts_at)}`;

/** ما يمنع الحفظ قبل إرساله، أو فارغ. الخادم يعيد الفحص كله */
export function formBlock(v, members, exceptions) {
  if (!v.requirement_id) return 'اختر نشاط الاستشارة';
  if (!v.expert_id) return 'اختر المستشار';
  if (!v.starts_at) return 'حدد موعد الجلسة';
  const m = Number(v.minutes);
  if (!(m >= 15 && m <= 480)) return 'المدة من 15 إلى 480 دقيقة';
  if (v.mode === 'in_person' && !String(v.location_ar || '').trim()) return 'اكتب مكان الجلسة الحضورية';
  if (v.mode === 'online' && v.join_url && !/^https:\/\/\S+$/i.test(String(v.join_url).trim())) return 'رابط الجلسة يبدأ بـhttps://';
  if (!invited(members, exceptions).length) return 'لا أحد من المختارين يُدعى إلى هذه الجلسة';
  return '';
}
/** جسم الحفظ. starts_at قيمة حقل datetime-local بتوقيت المتصفح فتُحوَّل ISO */
export function saveBody(cohortId, ids, v, exceptions, confirmConflict = false) {
  return {
    cohort_id: cohortId, participant_ids: ids, requirement_id: v.requirement_id, expert_id: v.expert_id, title_ar: String(v.title_ar || '').trim(),
    starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : null, minutes: Number(v.minutes) || 60, mode: v.mode === 'in_person' ? 'in_person' : 'online',
    join_url: v.mode === 'in_person' ? '' : String(v.join_url || '').trim(), location_ar: v.mode === 'in_person' ? String(v.location_ar || '').trim() : '',
    counts: !v.off, exceptions: [...(exceptions || [])], ...(confirmConflict ? { confirm_conflict: true } : {}),
  };
}
/** ما يُرسل للمعاينة: المختارون، والنشاط والمستشار والموعد إن اختيرت (للتعارض وللرصيد بحسب الخانة) */
export function previewBody(cohortId, ids, v) {
  return { cohort_id: cohortId, participant_ids: ids, ...(v.requirement_id ? { requirement_id: v.requirement_id } : {}), ...(v.expert_id ? { expert_id: v.expert_id } : {}),
    ...(v.starts_at ? { starts_at: new Date(v.starts_at).toISOString(), minutes: Number(v.minutes) || 60 } : {}), counts: !v.off };
}
/** سطر البريد في نتيجة الحفظ: أُرسل كذا، وكذا ينتظر في الطابور، وكذا تعذّر */
export function mailAr(mail, expertMail) {
  const m = mail || {};
  const parts = [m.sent ? `أُرسلت ${m.sent === 1 ? 'دعوة واحدة' : `${m.sent} دعوات`}` : '', m.queued ? `${m.queued} تنتظر في صندوق «لم يُرسل» وتخرج حين تتسع حصة اليوم` : '', m.failed ? `تعذّرت ${m.failed}` : '',
    m.skipped ? `${m.skipped} بلا بريد (حساب اختبار)` : ''].filter(Boolean);
  const ex = { sent: 'وأُبلغ المستشار', queued: 'وبريد المستشار ينتظر في الطابور', failed: 'وتعذّر بريد المستشار' }[expertMail] || '';
  return [parts.join('، '), ex].filter(Boolean).join('، ');
}
/** نتيجة الحفظ جملة */
export function savedAr(r) {
  if (!r?.success) return '';
  const head = `حُفظت الجلسة ودُعي ${peopleAr(r.added)}${r.exceptions ? ` (${r.exceptions} استثناءً)` : ''}.`;
  if (r.past) return `${head} موعدها مضى، فلا بريد. سجّل حضورها من ورقتها.`;
  const mail = mailAr(r.mail, r.expert_mail);
  return mail ? `${head} ${mail}.` : head;
}
/** سطر أعداد الجلسة في القائمة: «6 مدعوين · حضر 4 · لم يحضر 1 · لم يُؤكَّد 1» */
export function groupCountsAr(g) {
  return [countAr(g.count, 'مدعو واحد', 'مدعوان', 'مدعوين', 'مدعوًا'), g.attended ? `حضر ${g.attended}` : '', g.no_show ? `لم يحضر ${g.no_show}` : '', g.excused ? `اعتذر ${g.excused}` : '',
    g.ended && g.pending ? `لم يُؤكَّد ${g.pending}` : ''].filter(Boolean).join(' · ');
}
/** أقسام قائمة الجلسات: ما ينتظر تأكيد الحضور، والقادمة، والمنعقدة، والملغاة */
export function groupSections(groups) {
  const live = (groups || []).filter((g) => g.status === 'scheduled');
  return {
    awaiting: live.filter((g) => g.awaiting).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    upcoming: live.filter((g) => !g.ended).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    done: live.filter((g) => g.ended && !g.awaiting).slice(0, 15),
    cancelled: (groups || []).filter((g) => g.status === 'cancelled').slice(0, 5),
  };
}
