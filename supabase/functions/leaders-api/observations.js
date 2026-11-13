// ════════════════════════════════════════════════════════════════
// ملف المشارك: الملاحظات، وملخص الأعلام، والخط الزمني (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// الملاحظة تُكتب في participant_observations وحده. الأعلام لا تُخزَّن: تُشتق عند العرض من مصادرها (مؤشر الجهد من
// القياس، والتأخر من المعالم، والغياب من الجلسات…)، فلا تختلف عن شاشاتها. والخط الزمني يجمع سجل التدقيق والملاحظات
// بتسمية عربية واحدة لكل فعل.
export const OBS_KINDS = ['note', 'warning', 'commendation'];
export const OBS_KIND_AR = { note: 'ملاحظة', warning: 'تنبيه', commendation: 'إشادة' };
export const OBS_SOURCE_AR = { admin: 'الإدارة', advisor: 'المستشار', system: 'النظام' };
export const OBS_BODY_MIN = 3, OBS_BODY_MAX = 2000;

/** تنظيف ملاحظة يدوية. يعيد { error } أو الحقول الصالحة للحفظ */
export function cleanObservation(b) {
  const kind = OBS_KINDS.includes(b?.kind) ? b.kind : 'note';
  const body = String(b?.body ?? '').replace(/[ \t]+\n/g, '\n').trim();
  if (body.length < OBS_BODY_MIN) return { error: 'اكتب نص الملاحظة' };
  if (body.length > OBS_BODY_MAX) return { error: `الملاحظة أطول من ${OBS_BODY_MAX} حرف` };
  const title = String(b?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  return { kind, body, title, visible: b?.visible === true };
}

const DAY = 864e5;
/**
 * ملخص الأعلام أعلى الملف: ما يستحق نظر المراجع الآن، بجملة تُقرأ ونبرة (bad أو warn أو info).
 * @param {any} f ملف المشارك كما يبنيه الخادم (participant, effort, retake, onboarding, milestone_summary, sessions, models, continuous, observations)
 * @param {number} [now]
 */
export function flagsOf(f, now = Date.now()) {
  const out = [];
  const add = (key, tone, label, detail = '') => out.push({ key, tone, label, detail });
  const p = f?.participant || {};
  if (p.status === 'suspended') add('suspended', 'bad', 'موقوف');
  if (p.status === 'withdrawn') add('withdrawn', 'bad', 'منسحب');
  if (f?.retake) add('retake', 'warn', 'طُلبت إعادة القياس', 'لم يسلّم قياسًا جديدًا بعد');
  if (f?.effort?.level === 'low') add('effort', 'bad', 'أجاب القياس باستعجال', f.effort.note || '');
  else if (f?.effort?.level === 'watch') add('effort', 'warn', 'جدية الإجابة تُراجع', f.effort.note || '');
  const step = f?.onboarding?.step;
  if (['profile', 'assessment_todo', 'assessment_doing'].includes(step)) add('onboarding', 'warn', f.onboarding.label, f.onboarding.remaining || '');
  const late = Number(f?.milestone_summary?.late) || 0;
  if (late) add('late', late > 1 ? 'bad' : 'warn', late === 1 ? 'معلم متأخر' : `${late} معالم متأخرة`, f.milestone_summary.max_late ? `أقصاها ${f.milestone_summary.max_late} يومًا` : '');
  const noShow = (f?.sessions || []).filter((s) => s.status === 'no_show').length;
  if (noShow) add('no_show', noShow > 1 ? 'bad' : 'warn', noShow === 1 ? 'غاب عن جلسة توجيه' : `غاب عن ${noShow} جلسات توجيه`);
  const returned = (f?.models || []).filter((m) => m.status === 'returned').length;
  if (returned) add('returned', 'warn', returned === 1 ? 'نموذج معاد ينتظر تعديله' : `${returned} نماذج معادة تنتظر تعديلها`);
  for (const x of f?.continuous?.flags || []) add('continuous', 'warn', typeof x === 'string' ? x : x?.label || 'مؤشر مستمر منخفض');
  const seen = p.last_login_at ? Date.parse(p.last_login_at) : null;
  if (['placed', 'enrolled'].includes(p.status) && (!seen || now - seen > 14 * DAY)) add('idle', 'warn', 'متوقف منذ 14 يومًا أو أكثر', seen ? '' : 'لم يدخل بعد التسجيل');
  const warns = (f?.observations || []).filter((o) => o.kind === 'warning').length;
  if (warns) add('warnings', warns > 2 ? 'bad' : 'warn', warns === 1 ? 'تنبيه واحد في سجله' : `${warns} تنبيهات في سجله`);
  const praise = (f?.observations || []).filter((o) => o.kind === 'commendation').length;
  if (praise) add('praise', 'info', praise === 1 ? 'إشادة واحدة في سجله' : `${praise} إشادات في سجله`);
  return out;
}

// تسمية أفعال سجل التدقيق كما تُقرأ في الخط الزمني. ما لا تسمية له يظهر برمزه حتى يُسمّى
export const AUDIT_AR = {
  'participant.edit': 'عُدّلت بياناته', 'participant.status': 'تغيّرت حالته', 'participant.remind': 'ذُكِّر بإكمال التسجيل', 'participant.org': 'تغيّرت جهته',
  'participant.export': 'حمّل نسخة بياناته', 'participant.consent': 'وافق على سياسة الخصوصية', 'participant.erase-request': 'طلب حذف بياناته',
  'participant.erase-cancel': 'سحب طلب حذف بياناته', 'participant.name-confirm': 'أكّد اسمه للشهادة',
  'placement.approve': 'اعتُمد مستواه', 'assessment.submit': 'سلّم القياس', 'assessment.reset': 'طُلبت إعادة القياس',
  'requirement.review': 'روجع متطلب في رحلته', 'milestone.participant': 'عُدّل معلم في رحلته', 'workshop.mark': 'سُجّل حضوره في ورشة', 'workshop.checkin': 'سجّل حضوره في ورشة',
  'cohort.enroll': 'سُجّل في دفعة', 'hall.assign': 'وُزّع على طاولة في القاعة', 'admin.file-open': 'فُتحت سيرته الذاتية', 'admin.answers-view': 'فُتحت إجابات قياسه',
  'capstone.submit': 'سلّم وثيقة المبادرة', 'capstone.return': 'أُعيدت وثيقة المبادرة للتعديل', 'capstone.accept': 'قُبلت وثيقة المبادرة',
  'handbook.export': 'صدّر الكتيب', 'payment.checkout': 'فتح صفحة الدفع', 'payment.paid': 'دفع', 'payment.refunded': 'استُرد دفعه', 'payment.reminder': 'ذُكِّر بالدفع',
  'entitlement.grant': 'مُنح حقًا', 'entitlement.revoke': 'سُحب منه حق', 'certificate.issue': 'صدرت شهادته', 'certificate.revoke': 'أُلغيت شهادته',
  'observation.add': 'أُضيفت ملاحظة إلى ملفه', 'observation.remove': 'حُذفت ملاحظة من ملفه', 'observation.ack': 'اطّلع على تنبيه',
  'expert.rated-participant': 'قيّمه خبير',
};
export const auditAr = (action) => AUDIT_AR[action] || action;
const ACTOR_AR = { admin: 'الإدارة', participant: 'المشارك', system: 'النظام', coordinator: 'منسق الجهة' };

/**
 * الخط الزمني: سجل التدقيق والملاحظات في ترتيب واحد، الأحدث أولًا.
 * @param {{ history?: any[], observations?: any[] }} d
 */
export function timelineOf({ history = [], observations = [] }) {
  const rows = [
    ...history.map((h) => ({ at: h.created_at, kind: 'event', tone: 'info', text: auditAr(h.action), by: ACTOR_AR[h.actor_type] || h.actor_type || '', detail: h.action === 'participant.status' && h.after?.status ? `الحالة: ${h.after.status}${h.after.reason ? `، السبب: ${h.after.reason}` : ''}` : '' })),
    ...observations.map((o) => ({ at: o.created_at, kind: o.kind, tone: o.kind === 'warning' ? 'warn' : o.kind === 'commendation' ? 'ok' : 'info',
      text: `${OBS_KIND_AR[o.kind] || o.kind}${o.title ? `: ${o.title}` : ''}`, by: OBS_SOURCE_AR[o.source] || o.source, detail: o.body })),
  ];
  return rows.filter((r) => r.at).sort((x, y) => String(y.at).localeCompare(String(x.at)));
}
