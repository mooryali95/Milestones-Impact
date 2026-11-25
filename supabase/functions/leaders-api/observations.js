// ════════════════════════════════════════════════════════════════
// ملف المشارك: الملاحظات، وملخص الأعلام، والخط الزمني (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// الملاحظة تُكتب في participant_observations وحده. الأعلام لا تُخزَّن: تُشتق عند العرض من مصادرها (مؤشر الجهد من
// القياس، والتأخر من المعالم، والغياب من الجلسات…)، فلا تختلف عن شاشاتها. والخط الزمني يجمع سجل التدقيق والملاحظات
// بتسمية عربية واحدة لكل فعل.
import { COACH_STATUS_ADMIN, PARTICIPANT_STATUS } from './labels.js';

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
  'mail.unsubscribe': 'أوقف فئة من بريده بنقرة',
  'participant.edit': 'عُدّلت بياناته', 'participant.status': 'تغيّرت حالته', 'participant.remind': 'ذُكِّر بإكمال التسجيل', 'participant.org': 'تغيّرت جهته',
  'participant.export': 'حمّل نسخة بياناته', 'participant.consent': 'وافق على سياسة الخصوصية', 'participant.erase-request': 'طلب حذف بياناته',
  'participant.erase-cancel': 'سحب طلب حذف بياناته', 'participant.name-confirm': 'أكّد اسمه للشهادة',
  // حساب واحد بأكثر من بريد (20261128190000)
  'participant.link': 'رُبط به حساب آخر له', 'participant.merged': 'دُمج حسابه الثاني في حسابه هذا', 'participant.unmerged': 'أُرجع دمج حسابه الثاني',
  'participant.email-primary': 'تغيّر بريده الأساسي', 'participant.email-remove': 'حُذف بريد بديل من حسابه',
  'placement.approve': 'اعتُمد مستواه', 'assessment.submit': 'سلّم القياس', 'assessment.reset': 'طُلبت إعادة القياس',
  'requirement.review': 'روجع متطلب في رحلته', 'requirement.file-replace': 'استبدل ملف بند في رحلته', 'milestone.participant': 'عُدّل معلم في رحلته', 'workshop.mark': 'سُجّل حضوره في ورشة', 'workshop.unmark': 'أُلغي حضوره في ورشة', 'workshop.checkin': 'سجّل حضوره في ورشة',
  'cohort.enroll': 'سُجّل في دفعة', 'cohort.place-failed': 'تعذّر إلحاقه بدفعة تلقائيًا', 'hall.assign': 'وُزّع على طاولة في القاعة', 'admin.file-open': 'فُتحت سيرته الذاتية', 'admin.answers-view': 'فُتحت إجابات قياسه',
  'capstone.submit': 'سلّم وثيقة المبادرة', 'capstone.return': 'أُعيدت وثيقة المبادرة للتعديل', 'capstone.accept': 'قُبلت وثيقة المبادرة',
  'handbook.export': 'صدّر الكتاب', 'handbook.quiz-retry': 'أعاد اختبار باب في الكتاب', 'payment.checkout': 'فتح صفحة الدفع', 'payment.paid': 'دفع', 'payment.refunded': 'استُرد دفعه', 'payment.reminder': 'ذُكِّر بالدفع',
  'entitlement.grant': 'مُنح حقًا', 'entitlement.revoke': 'سُحب منه حق', 'certificate.issue': 'صدرت شهادته', 'certificate.revoke': 'أُلغيت شهادته',
  'observation.add': 'أُضيفت ملاحظة إلى ملفه', 'observation.remove': 'حُذفت ملاحظة من ملفه', 'observation.ack': 'اطّلع على تنبيه',
  'expert.rated-participant': 'قيّمه خبير',
  // ما يُسجَّل على المشارك من الخادم (P8): كل فعل كيانه participants له تسمية، ويحرسه اختبار يقرأ الشيفرة
  'participant.create': 'أُنشئ حسابه', 'participant.register': 'سجّل في المنصة', 'participant.delete': 'حُذف حسابه', 'participants.import': 'أُضيف باستيراد قائمة',
  'participant.nudge': 'ذُكِّر بمتابعة رحلته', 'nudge.seen': 'رأى تذكيرًا في رحلته', 'mail.login-link': 'أُرسل إليه رابط دخول',
  'placement.approve-bulk': 'اعتُمد مستواه في اعتماد جماعي', 'final.reopen': 'أُعيد فتح تقييمه الختامي', 'group.assign': 'وُزّع على مجموعة',
  'coaching.group-add': 'دُعي إلى جلسة جماعية مع المستشار', 'coaching.group-exception': 'دُعي إلى جلسة جماعية استثناءً', 'coaching.group-remove': 'أُزيل من جلسة جماعية', 'coaching.group-resend': 'أُعيد إرسال دعوة جلسته الجماعية',
  'coaching.group-cancelled': 'أُلغيت جلسة جماعية دُعي إليها', 'coaching.group-mark': 'سُجّل حضوره في جلسة جماعية',
  'coaching.add': 'أُضيفت له جلسة توجيه', 'coaching.booked': 'حجز جلسة توجيه', 'coaching.instant': 'طلب اتصالًا فوريًا',
  'certificate.awaiting-name': 'شهادته تنتظر تأكيد اسمه', 'certificate.skipped-disabled': 'لم تصدر شهادته لأن الإصدار موقوف',
  'certificate.skipped-demo': 'لا تصدر شهادة للحساب التجريبي',
  'sponsor.approve': 'قُبلت رعايته', 'sponsor.hold': 'عُلّقت رعايته حتى يتوفر مقعد', 'sponsor.reject': 'رُفضت رعايته',
  'admin.preview-as': 'عُرض ملفه كما يراه خبيره', 'expert.capstone-view': 'اطّلع خبير على وثيقة مبادرته', 'guide.transcript-read': 'قُرئت محادثته في التوجيه والإرشاد',
  // تدخل الإدارة في مراحل رحلته (admin.stage-override وadmin.stage-move)
  'stage.open': 'فُتحت له مرحلة يدويًا', 'stage.complete': 'اعتُمد اكتمال مرحلة له', 'stage.skip': 'أُعفي من مرحلة', 'stage.reset': 'أُلغي تدخل في مرحلة', 'stage.move': 'نُقل إلى مرحلة',
  'demo.open': 'فُتح الحساب التجريبي', 'demo.reset': 'أُعيد ضبط الحساب التجريبي',
  'demo.stage-skip': 'تُخطيت مرحلة في الحساب التجريبي', 'demo.open-all': 'فُتحت كل مراحل الحساب التجريبي', 'demo.restart': 'أُعيد الحساب التجريبي إلى البداية من شريطه',
  // ما يفعله المشارك نفسه (السجل يُقرأ أيضًا بمعرّفه فاعلًا)
  'assessment.submit-post': 'سلّم القياس البعدي', 'sponsor.request': 'طلب رعاية جهته', 'participant.sponsor': 'انضم إلى جهته', 'rater.invite': 'دعا مقيّمًا',
  'f360.start': 'بدأ تقييم 360', 'f360.self': 'أكمل تقييمه الذاتي في 360', 'f360.nominate': 'رشّح مقيّمًا في 360', 'f360.submit': 'أرسل مقيّميه في 360 للاعتماد', 'f360.plan': 'حفظ خطته من تقرير 360',
  'expert-request.create': 'طلب خبيرًا', 'expert-request.cancel': 'ألغى طلب خبير', 'expert-request.chosen': 'اختار خبيرًا', 'expert.rated': 'قيّم خبيرًا',
  'peer.ask': 'سأل الأقران', 'peer.answer': 'أجاب سؤال زميل', 'peer.close': 'أغلق سؤاله للأقران', 'sus.submit': 'أجاب استبيان سهولة الاستخدام',
  'capstone.share-create': 'شارك وثيقة مبادرته', 'capstone.share-revoke': 'أوقف مشاركة وثيقة مبادرته', 'capstone.sponsor-invite': 'دعا راعي مبادرته',
  'workshop.join': 'انضم إلى ورشة عن بعد', 'guide.clear': 'حذف محادثته في التوجيه والإرشاد', 'passkey.register': 'أضاف مفتاح مرور', 'passkey.remove': 'حذف مفتاح مرور',
};
export const auditAr = (action) => AUDIT_AR[action] || action;
// في ملف المشارك لا يظهر رمز خام (P8): فعل لم يُسمَّ بعد يُعرض بوصف عام، ويسقط اختبار التسمية حين يُضاف فعل على المشارك بلا اسم
export const auditLabel = (action) => AUDIT_AR[action] || 'إجراء في السجل';
const statusAr = (s) => PARTICIPANT_STATUS[s] || 'حالة أخرى';
const ACTOR_AR = { admin: 'الإدارة', participant: 'المشارك', system: 'النظام', coordinator: 'منسق الجهة', expert: 'خبير' };

/**
 * الخط الزمني: سجل التدقيق والملاحظات في ترتيب واحد، الأحدث أولًا.
 * @param {{ history?: any[], observations?: any[] }} d
 */
export function timelineOf({ history = [], observations = [] }) {
  const rows = [
    ...history.map((h) => ({ at: h.created_at, kind: 'event', tone: 'info', text: auditLabel(h.action), by: (h.after?.by === 'expert' ? ACTOR_AR.expert : ACTOR_AR[h.actor_type]) || '', detail: h.action === 'participant.status' && h.after?.status ? `الحالة: ${statusAr(h.after.status)}${h.after.reason ? `، السبب: ${h.after.reason}` : ''}` : '' })),
    ...observations.map((o) => ({ at: o.created_at, kind: o.kind, tone: o.kind === 'warning' ? 'warn' : o.kind === 'commendation' ? 'ok' : 'info',
      text: `${OBS_KIND_AR[o.kind] || o.kind}${o.title ? `: ${o.title}` : ''}`, by: OBS_SOURCE_AR[o.source] || o.source, detail: o.body })),
  ];
  return rows.filter((r) => r.at).sort((x, y) => String(y.at).localeCompare(String(x.at)));
}

// ════════════════════════════════════════════════════════════════
// السجل الكامل (تبويب «السجل» في ملف المشارك، تصور 2026-11-23): كل ما جرى له من تسجيله، بترتيب واحد
// ════════════════════════════════════════════════════════════════
// يُشتق من مصادره كما هي (الحساب، القياس، الاعتماد، النماذج، الحضور، الجلسات، المبادرة، السجل، الملاحظات) ولا يُخزَّن.
// ما له مصدر صريح لا يُكرَّر من سجل التدقيق (تسليم القياس مثلًا)، والسجل يُقرأ صفحة صفحة بمؤشر زمني (before).
export const TIMELINE_TYPES = ['account', 'assessment', 'learning', 'attendance', 'initiative', 'decision', 'note'];
export const TIMELINE_TYPE_AR = { account: 'الحساب', assessment: 'القياس والمستوى', learning: 'النماذج', attendance: 'الحضور والجلسات', initiative: 'المبادرة', decision: 'قرارات الإدارة', note: 'الملاحظات' };
export const TIMELINE_PAGE = 50;
// أفعال في سجل التدقيق لها مصدر صريح في السجل الكامل، فلا تظهر مرتين
export const TIMELINE_DERIVED = new Set(['assessment.submit', 'assessment.submit-post', 'capstone.submit', 'workshop.checkin', 'workshop.mark', 'observation.add', 'participant.register']);

/** نوع سطر سجل التدقيق في السجل الكامل: قرار إدارة، أو ما يخص بابه، وإلا الحساب */
export function auditType(h) {
  const a = String(h?.action || '');
  if (/^(assessment|placement)\./.test(a)) return 'assessment';
  if (/^(capstone|tracking)\./.test(a)) return 'initiative';
  if (/^(workshop|coaching)\./.test(a)) return 'attendance';
  if (/^observation\./.test(a)) return 'note';
  return h?.actor_type === 'admin' ? 'decision' : 'account';
}

// مؤشر الصفحة: الوقت ثم المفتاح الثابت للسطر (TIMELINE_CURSOR_SEP بينهما). مفاتيح سجل التدقيق «a:» ومعرّفه مبطَّنًا، فتأتي
// بعد مفاتيح المصادر الأخرى في الترتيب التنازلي (يبدأ نوعها بحرف، و«:» قبل الحروف)، ويقرأ الخادم ما بقي منها بالمعرّف (participantTimeline).
// مؤشر قديم بالوقت وحده يُقرأ كما كان: ما قبل وقته تمامًا
export const TIMELINE_CURSOR_SEP = '|';
export const auditKey = (id) => `a:${String(id).padStart(20, '0')}`;
export function timelineCursor(r) { return `${r.at}${TIMELINE_CURSOR_SEP}${r.key}`; }
export function parseTimelineCursor(c) {
  if (typeof c !== 'string' || !c) return null;
  const i = c.indexOf(TIMELINE_CURSOR_SEP);
  const at = i < 0 ? c : c.slice(0, i);
  if (Number.isNaN(Date.parse(at))) return null;
  return { at, key: i < 0 ? null : c.slice(i + 1) };
}
/** هل السطر بعد المؤشر في الترتيب التنازلي (الوقت ثم المفتاح) */
export function timelineBefore(r, cur) {
  const at = String(r.at);
  if (at !== cur.at) return at < cur.at;
  return cur.key != null && r.key < cur.key;
}
/** معرّف سطر سجل التدقيق في المؤشر إن كان مفتاحه منه، وإلا null */
export function cursorAuditId(cur) {
  const m = cur?.key && /^a:0*(\d+)$/.exec(cur.key);
  return m ? m[1] : null;
}

/**
 * السجل الكامل من مصادره. كل مصدر قائمة صفوفه كما تُقرأ، والناتج الأحدث أولًا، بنوع لكل سطر (TIMELINE_TYPES).
 * @param {{ participant?: any, firstLogin?: string | null, assessments?: any[], placements?: any[], models?: any[], attendance?: any[], sessions?: any[], capstone?: any, history?: any[], observations?: any[] }} src
 * @param {{ before?: string | null, types?: string[] | null, limit?: number }} [opt]
 * @returns {{ rows: any[], next: string | null }}
 */
export function fullTimelineOf(src, { before = null, types = null, limit = TIMELINE_PAGE } = {}) {
  const out = [];
  const add = (at, type, text, extra = {}) => { if (at) out.push({ at, type, text, tone: 'info', by: '', detail: '', ...extra }); };
  const p = src.participant || {};
  add(p.created_at, 'account', 'سجّل في المنصة');
  add(src.firstLogin, 'account', 'أول دخول');
  add(p.profile_completed_at, 'account', 'أكمل ملفه الشخصي');
  for (const a of src.assessments || []) {
    const post = a.instruments?.kind === 'post';
    add(a.started_at, 'assessment', post ? 'بدأ القياس البعدي' : 'بدأ القياس');
    add(a.submitted_at, 'assessment', post ? 'سلّم القياس البعدي' : 'سلّم القياس', { tone: 'ok' });
  }
  const approved = (src.placements || []).map((x) => x.approved_at).filter(Boolean).sort()[0];
  add(approved, 'assessment', 'اعتُمد مستواه', { tone: 'ok' });
  for (const m of src.models || []) {
    const t = m.learning_models?.title_ar || 'نموذج';
    add(m.submitted_at, 'learning', `سلّم «${t}»`);
    if (m.reviewed_at) add(m.reviewed_at, 'learning', m.status === 'returned' ? `أُعيد «${t}» للتعديل` : `قُرئ «${t}»`, { tone: m.status === 'returned' ? 'warn' : 'ok' });
  }
  for (const w of src.attendance || []) add(w.at, 'attendance', w.title ? `حضر «${w.title}»` : 'حضر ورشة', { tone: 'ok' });
  for (const s of src.sessions || []) add(s.starts_at, 'attendance', COACH_STATUS_ADMIN[s.status] ? `جلسة توجيه: ${COACH_STATUS_ADMIN[s.status]}` : 'جلسة توجيه', { tone: s.status === 'no_show' ? 'warn' : s.status === 'attended' ? 'ok' : 'info', by: s.expert || '' });
  const c = src.capstone;
  if (c) {
    add(c.submitted_at, 'initiative', 'سلّم وثيقة المبادرة');
    add(c.approved_at, 'initiative', 'اعتُمدت وثيقة المبادرة', { tone: 'ok' });
  }
  // كل سطر من سجل التدقيق يُحوَّل وحده، فلا يُخلط سطران في الوقت نفسه، ويحمل معرّفه مفتاحًا ثابتًا للمؤشر
  for (const h of (src.history || []).filter((x) => !TIMELINE_DERIVED.has(x.action))) {
    for (const r of timelineOf({ history: [h], observations: [] })) {
      const why = h?.after?.reason || h?.after?.note || '';
      out.push({ ...r, type: auditType(h), detail: r.detail || (why ? `السبب: ${why}` : ''), key: h.id != null ? auditKey(h.id) : null });
    }
  }
  for (const o of src.observations || []) add(o.created_at, 'note', `${OBS_KIND_AR[o.kind] || o.kind}${o.title ? `: ${o.title}` : ''}`, { tone: o.kind === 'warning' ? 'warn' : o.kind === 'commendation' ? 'ok' : 'info', by: OBS_SOURCE_AR[o.source] || o.source || '', detail: o.body || '' });
  // مفتاح ثابت لكل سطر بعد وقته: معرّف سطر السجل، وإلا نوعه ونصه وفاعله وترتيبه بين أمثاله، فلا يسقط سطر يشارك آخر وقته
  // بين صفحتين ولا يتكرر (كان المؤشر وقتًا وحده بـ <، فيسقط ما شارك آخر سطر في الصفحة وقته)
  const seen = new Map();
  for (const r of out) {
    if (r.key) continue;
    const base = `${r.type}\u0001${r.text}\u0001${r.by || ''}\u0001${r.detail || ''}`;
    const n = (seen.get(`${r.at}\u0001${base}`) || 0) + 1;
    seen.set(`${r.at}\u0001${base}`, n);
    r.key = `${base}\u0001${n}`;
  }
  const cur = parseTimelineCursor(before);
  const want = types?.length ? new Set(types) : null;
  const rows = out.filter((r) => (!cur || timelineBefore(r, cur)) && (!want || want.has(r.type)))
    .sort((x, y) => String(y.at).localeCompare(String(x.at)) || (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page.map(({ kind: _k, key: _key, ...r }) => r), next: rows.length > limit ? timelineCursor(last) : null };
}
