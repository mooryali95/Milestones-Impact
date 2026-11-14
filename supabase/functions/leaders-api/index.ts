// ════════════════════════════════════════════════════════════════
// leaders-api — دالة الحافة لتطبيق القادة (leaders.sunkvalue.com)
// ════════════════════════════════════════════════════════════════
// نفس منهجية user-api في المصفوفة: كل الطلبات POST بجسم JSON فيه
// action، والجلسة توكن داخل الجسم يُتحقق منه على الخادم. لا وصول
// مباشر للجداول من المتصفح؛ مخطط leaders مغلق إلا لـ service_role.
//
// الإجراءات:
//   مفتوحة:   cert.verify · rater.get · rater.submit (برابط المقيّم) · sponsor.get · sponsor.submit (برابط الراعي) · outcome.get · outcome.submit (تأكيد الراعي لأثر المبادرة) · expert.apply (طلب انضمام خبير) · offer.get · offer.respond (برابط عرض الخبير) · cron.expert-offers (بسرّ المجدول) · auth.start · auth.verify · auth.google · org.info · cron.reminders (بسرّ المجدول) · passkey.auth-options · passkey.auth-verify
//   للمشارك:  me · org.logo · logout · sessions.list · sessions.revoke · profile.save · upload.url · cv.attach
//             assessment.get · assessment.answer · assessment.submit
//             requirement.update · passkey.register-options · passkey.register-verify · passkey.list · passkey.remove · passkey.dismiss
//             handbook.toc · handbook.chapter · handbook.complete · handbook.export · models.list · models.get · models.save · lab.list · lab.start · lab.answer · lab.draft · lab.hint · lab.check · achievements · certificate
//             handbook.ping · video.ping · content.ping · content.open · workshop.checkin · workshop.join · coaching.instant (الأنشطة الموثقة)
//             impact.mine · rater.invite · rater.revoke (القياس البعدي ومقيّموه)
//             f360.mine · f360.start · f360.self · f360.nominate · f360.remove · f360.submit · f360.report · f360.plan (تقييم 360 للتطوير)
//             capstone.get · capstone.summary · capstone.submit · capstone.doc (مشروع التخرج)
//             tracking.get · tracking.save (متابعة تنفيذ المبادرة وأثرها بعد اعتمادها)
//   للمنسق:   coord.me · coord.dashboard · coord.capstone · coord.logout (والدخول: coord.auth-start · coord.auth-verify)
//   للإدارة:  admin.* بتوكن جلسة لوحة الإدارة نفسها (admin-api)
import { alertOps, clientIp, drainMailQueue, Fail, preflight, reply } from './core.ts';
import { CONSENT_GATED, consentState } from './labels.js';
import * as P from './participant.ts';
import * as K from './passkeys.ts';
import * as A from './admin.ts';
import * as C from './coordinator.ts';
import * as Z from './certificates.ts';
import * as V from './activities.ts';
import * as I from './impact.ts';
import * as G from './programs.ts';
import * as F from './final.ts';
import * as KT from './katon.ts';
import * as H from './hall.ts';
import * as D from './demo.ts';
import * as S from './system.ts';
import * as L from './lab.ts';
import * as X from './capstone.ts';
import * as T from './tracking.ts';
import * as E from './experts.ts';
import * as Y from './payments.ts';
import * as R from './sponsor.ts';
import { switchTo } from './switch.ts';
import * as V2 from './advisor.ts';
import * as PR from './peer.ts';
import * as FL from './file.ts';
import * as SU from './sus.ts';
import * as PV from './privacy.ts';
import * as TM from './team.ts';
import * as ST from './settings.ts';
import * as FB from './feedback360.ts';
import * as OB from './observations.ts';
import * as IN from './insight.ts';
import * as VS from './visibility.ts';

type Body = Record<string, any>;

const open: Record<string, (b: Body, ctx: any) => Promise<unknown>> = {
  'auth.start': P.authStart,
  'auth.verify': P.authVerify,
  'auth.google': P.authGoogle,
  'org.info': (b, ctx) => P.orgInfo(b, ctx),
  // مسبار المراقبة وفحص ما بعد النشر: طلب حقيقي يمر بالقاعدة
  'system.ping': () => S.ping(),
  // التذكير الأسبوعي للمشاركين، ثم ملخص الجهات لمنسقيها، ثم تقرير الصحة للمالك، في التشغيلة نفسها
  'cron.reminders': async (b) => {
    const r: any = await A.reminders(b);
    return { ...r, tracking: await T.reminders().catch((e) => ({ sent: 0, error: String(e?.message || e) })), coordinator_reports: await C.weeklyReports(), health: await S.weeklyHealth().catch((e) => ({ sent: false, reason: String(e?.message || e) })),
      // تنظيف دوري: رموز الدخول والجلسات المنتهية وسجلات التحقق وعناوين IP بعد 90 يومًا
      purge: await S.purge().catch((e) => ({ error: String(e?.message || e) })) };
  },
  'coord.auth-start': C.authStart,
  'coord.auth-verify': C.authVerify,
  'passkey.auth-options': () => K.authOptions(),
  'passkey.auth-verify': K.authVerify,
  'cert.verify': Z.verify,
  'rater.get': I.raterGet,
  'rater.submit': I.raterSubmit,
  'sponsor.get': X.sponsorGet,
  'sponsor.submit': X.sponsorSubmit,
  'outcome.get': T.verifyGet,
  'outcome.submit': T.verifySubmit,
  'expert.apply': E.apply,
  'offer.get': E.offerGet,
  'offer.respond': E.offerRespond,
  // كل ساعة: العروض المنتهية تنتقل للتالي، ثم تذكير جلسات الغد
  // sweepOffers يتحقق من سر المجدول أولًا، ثم يُفرغ طابور البريد الجماعي ضمن الحصة (D15)
  'cron.expert-offers': async (b) => ({ ...(await E.sweepOffers(b)), session_reminders: await V.sessionReminders(), workshop_reminders: await V.workshopReminders().catch((e) => ({ error: String(e?.message || e) })),
    pay_reminders: await Y.payReminders().catch((e) => ({ sent: 0, error: String(e?.message || e) })),
    pay_expired: await Y.expireAbandoned().catch((e) => ({ expired: 0, error: String(e?.message || e) })),
    policy_notice: await P.policyNotify().catch((e) => ({ queued: 0, error: String(e?.message || e) })),   // D18: مرة لكل نسخة جوهرية
    // تقييم 360: التذكير في أيامه المضبوطة، والإغلاق عند انقضاء النافذة وإبلاغ المستشار (قبل تفريغ طابور البريد)
    feedback360: await FB.sweep().catch((e) => ({ reminded: 0, closed: 0, error: String(e?.message || e) })),
    mail_queue: await drainMailQueue().catch((e) => ({ sent: 0, error: String(e?.message || e) })) }),
  'xp.auth-start': E.portalStart,
  'xp.auth-verify': E.portalVerify,
  'xp.auth-google': E.portalGoogle,
};

// ما لا يحتاج حقًا: الحساب والملف والدفع نفسه. القياس المبدئي بحقه، وكل ما سواه بحق البرنامج
const PAY_FREE = new Set(['me', 'org.logo', 'me.sponsor-code', 'org.visibility', 'logout', 'sessions.list', 'sessions.revoke', 'profile.save', 'profile.confirm-name',
  'me.privacy', 'me.notice-ack', 'me.export', 'me.erase-request', 'upload.url', 'cv.attach', 'passkey.register-options', 'passkey.register-verify', 'passkey.list', 'passkey.remove', 'passkey.dismiss', 'pay.access', 'pay.checkout', 'sponsor.request', 'sponsor.cancel', 'me.switch',
  'sus.state', 'sus.submit', 'demo.fill-profile', 'demo.fill-assessment', 'ratings.pending', 'consent.accept', 'org.share-consent']);
// حساب العرض لا يُرسل بريدًا لأحد ولا يشغل خبيرًا حقيقيًا ولا يفتح دفعًا: هذه الإجراءات له مغلقة
// ورابطه يُعرض على شاشة: لا يدخل القاعة الحية الحقيقية، ولا يرفع ملفات، ولا يسجّل مفتاح مرور، ولا يبدّل إلى دور آخر (M5)
const DEMO_BLOCKED = new Set(['experts.choose', 'rater.invite', 'f360.nominate', 'f360.submit', 'coaching.instant', 'sponsor.request', 'pay.checkout',
  'hall.join', 'hall.hand', 'hall.pick', 'upload.url', 'cv.attach', 'passkey.register-options', 'passkey.register-verify', 'passkey.remove', 'me.switch', 'me.erase-request']);
function payGate(action: string, b: Body): 'assessment' | 'program' | null {
  if (PAY_FREE.has(action)) return null;
  if (action.startsWith('assessment.')) return b.kind === 'post' ? 'program' : 'assessment';
  return 'program';
}

// فعل مشارك ببواباته كلها (حساب العرض، والدفع، وتجديد الموافقة) كما في معالج الطلب، لاستعماله داخل طلب مجمّع
async function asAction(action: string, p: any, b: Body, sid: string, ctx: any) {
  if (p.is_demo && DEMO_BLOCKED.has(action)) throw new Fail('هذا غير متاح لحساب العرض', 403, 'demo');
  const need = payGate(action, b);
  if (need) await Y.requireAccess(p, need);
  if (CONSENT_GATED.includes(action) && 'consented_at' in p && consentState(p.consent_version, p.consented_at).needed) {
    throw new Fail('جدّد موافقتك على سياسة الخصوصية المحدّثة أولًا، من الشريط أعلى رحلتك', 428, 'consent_renew');
  }
  return participant[action](p, b, sid, ctx);
}

const participant: Record<string, (p: any, b: Body, sessionId: string, ctx: any) => Promise<unknown>> = {
  // with_home: رئيسية المشارك في رحلة واحدة (البند 7.5): الحساب ثم المختبر وتقييم الخبير واستبيان السهولة كانت طلبًا
  // ثم ثلاثة بعده. كل جزء يمر بالبوابات نفسها التي يمر بها لو طُلب وحده (asAction)، ونتيجته كما لو طُلب وحده
  'me': async (p, b, sid, ctx) => {
    const m: any = await P.me(p);
    if (b.with_home !== true || !m?.success) return m;
    const [lab, ratings, sus] = await Promise.all(['lab.list', 'ratings.pending', 'sus.state'].map((a) => settle(a, asAction(a, p, {}, sid, ctx))));
    return { ...m, preload: { lab, ratings, sus } };
  },
  'sus.state': (p) => SU.state('participant', p),
  'sus.submit': (p, b) => SU.submit('participant', p, b),
  'org.logo': (p) => P.orgLogo(p),
  'me.sponsor-code': (p, b) => P.sponsorCode(p, b),
  'me.privacy': (p) => PV.state(p),
  'me.notice-ack': (p, b) => OB.ack(p, b),
  'me.export': (p) => PV.exportData(p),
  'me.erase-request': (p, b) => PV.eraseRequest(p, b),
  'pay.access': async (p) => ({ success: true, access: await Y.access(p) }),
  'pay.checkout': (p, b) => Y.checkout(p, b),
  'sponsor.request': (p, b) => R.request(p, b),
  'sponsor.cancel': (p) => R.cancel(p),
  'me.switch': (p, b, _s, ctx) => switchTo(p.email, 'participant', b.to, ctx),
  'org.visibility': (p) => P.orgVisibilityFor(p),
  'consent.accept': (p) => P.consentAccept(p),
  'org.share-consent': (p, b) => P.orgShareConsent(p, b),
  'ratings.pending': (p) => E.pendingRatings(p),
  'experts.suggest': (p, b) => E.mySuggestions(p, b),
  'experts.choose': (p, b) => E.myChoose(p, b),
  'ratings.submit': (p, b) => E.rateExpert(p, b),
  'katon.mine': (p) => KT.mine(p),
  'katon.answer': (p, b) => KT.answer(p, b),
  'hall.state': (p, b) => H.state(p, b),
  'peer.list': (p) => PR.list(p),
  'peer.ask': (p, b) => PR.ask(p, b),
  'peer.answer': (p, b) => PR.answer(p, b),
  'peer.close': (p, b) => PR.close(p, b),
  'demo.fill-profile': (p) => D.fillProfile(p),
  'demo.fill-assessment': (p) => D.fillAssessment(p),
  'hall.join': (p) => H.join(p),
  'hall.hand': (p, b) => H.hand(p, b),
  'hall.pick': (p, b) => H.pick(p, b),
  'logout': (_p, _b, sid) => P.logout(sid),
  'sessions.list': (p, _b, sid) => P.sessionsList(p, sid),
  'sessions.revoke': (p, b, sid) => P.sessionsRevoke(p, b, sid),
  'profile.save': P.profileSave,
  // «هكذا يظهر اسمك»: تأكيد الاسم كما سيُطبع على الشهادة، فتصدر إن كان التقييم الختامي معتمدًا (7.3)
  'profile.confirm-name': async (p) => {
    const r: any = await P.confirmName(p);
    const certificate = await Z.issueAfterNameConfirm(p.id);
    // الصادرة وحدها (برقمها)؛ الانتظار والحجب ليسا شهادة
    return { ...r, certificate: (certificate as any)?.serial ? certificate : null };
  },
  'upload.url': P.uploadUrl,
  'cv.attach': P.cvAttach,
  'assessment.get': (p, b) => P.assessmentGet(p, b),
  'assessment.answer': P.assessmentAnswer,
  'assessment.submit': P.assessmentSubmit,
  'requirement.update': P.requirementUpdate,
  'passkey.register-options': (p, _b, sid) => K.registerOptions(p, sid),
  'passkey.register-verify': (p, b, sid, ctx) => K.registerVerify(p, b, sid, ctx),
  'passkey.list': (p) => K.list(p),
  'passkey.remove': (p, b, sid) => K.remove(p, b, sid),
  'passkey.dismiss': (p) => P.passkeyDismiss(p),
  'handbook.toc': (p) => P.handbookToc(p),
  'handbook.chapter': (p, b, _s, ctx) => P.handbookChapter(p, b, ctx),
  'handbook.complete': (p, b) => P.handbookComplete(p, b),
  'handbook.export': (p, _b, _s, ctx) => P.handbookExport(p, ctx),
  'models.list': (p) => P.modelsList(p),
  'models.get': (p, b) => P.modelGet(p, b),
  'models.save': (p, b) => P.modelSave(p, b),
  'lab.list': (p) => L.list(p),
  'lab.start': (p, b) => L.start(p, b),
  'lab.answer': (p, b) => L.answer(p, b),
  'lab.draft': (p, b) => L.draft(p, b),
  'lab.hint': (p, b) => L.hint(p, b),
  'lab.check': (p, b) => L.check(p, b),
  'achievements': (p) => P.achievements(p),
  'certificate': (p) => Z.mine(p),
  'handbook.ping': (p, b) => V.readingPing(p, b),
  'video.ping': (p, b) => V.videoPing(p, b),
  'content.ping': (p, b) => V.contentPing(p, b),
  'content.open': (p, b) => V.contentOpen(p, b),
  'workshop.checkin': (p, b, _s, ctx) => V.workshopCheckin(p, b, ctx),
  'workshop.join': (p, b, _s, ctx) => V.workshopJoin(p, b, ctx),
  'coaching.instant': (p, b) => V.coachingInstant(p, b),
  'impact.mine': (p) => I.mine(p),
  'rater.invite': (p, b) => I.invite(p, b),
  'rater.revoke': (p, b) => I.revoke(p, b),
  // تقييم 360 للتطوير (feedback360.ts): الدورة والتقدير الذاتي والترشيح بالمجموعات والإرسال إلى المستشار
  'f360.mine': (p) => FB.mine(p),
  'f360.start': (p) => FB.start(p),
  'f360.self': (p, b) => FB.saveSelf(p, b),
  'f360.nominate': (p, b) => FB.nominate(p, b),
  'f360.remove': (p, b) => FB.removeNominee(p, b),
  'f360.submit': (p, b) => FB.submitList(p, b),
  'f360.report': (p, b) => FB.participantReport(p, b),
  'f360.plan': (p, b) => FB.savePlan(p, b),
  'capstone.get': (p) => X.get(p),
  'capstone.summary': (p, b) => X.saveSummary(p, b),
  'capstone.submit': (p) => X.submit(p),
  'capstone.doc': (p) => X.doc(p),
  'tracking.get': (p) => T.mine(p),
  'tracking.save': (p, b) => T.save(p, b),
};

// نتيجة فعل داخل طلب مجمّع بالشكل نفسه الذي يرده الفعل وحده، فخطؤه يبقى له ولا يُفشل الطلب كله
async function settle(action: string, p: Promise<unknown>) {
  try { return await p; } catch (e) {
    if (e instanceof Fail) { logRefusal(action, e.status, e.code); return { success: false, message: e.message, code: e.code, ...e.extra }; }
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`leaders-api [${ref}] ${action}:`, e);
    return { success: false, message: `خطأ داخلي، حاول بعد قليل (المرجع ${ref})`, code: 'internal', ref };
  }
}
// كل رد 4xx يُسجَّل باسم الفعل ورمزه، بلا بريد ولا متن ولا رمز (البند 6.1): كان طلب يفشل بـ400 مع كل تحميل للوحة
// الخبير ولا يُعرف أي فعل هو. الرفض المتوقع بكثرة (الجلسة المنتهية والتحقق البشري) لا يُسجَّل فلا يغرق السجل
const QUIET = new Set(['session', 'captcha']);
function logRefusal(action: string, status: number, code?: string) {
  if (status >= 400 && status < 500 && !QUIET.has(String(code))) console.warn(`leaders-api refused ${action} ${status} ${code || '-'}`);
}

// منسق الجهة: جلسة مستقلة عن المشاركين، والجهة تُشتق منها لا من الطلب
// لوحة الخبير: الجلسة من expert_sessions، والخبير يُشتق منها على الخادم
const expert: Record<string, (e: any, b: Body, sessionId: string) => Promise<unknown>> = {
  // لوحة الخبير في رحلة واحدة (البند 6.2 من تدقيق الإنتاج): كانت اللوحة تطلب الملخص ثم أربعة طلبات بعده، فتُدفع
  // المسافة إلى الخادم مرتين. هنا تُجمع الأربعة مع الملخص، ولكلٍّ نتيجته كما لو طُلب وحده (خطأ أحدها لا يُسقط اللوحة)،
  // وتبقى الأفعال الأربعة كما هي لإعادة التحميل بعد أي إجراء
  'xp.dashboard': async (e, b) => {
    const d: any = await E.portalDashboard(e);
    if (!d?.success || d.consent_needed || d.onboarding) return d;
    // «تكليفاتي» (تصور ربط الخبراء بالجهة، المرحلة 2): تكليفاته من المصادر الثلاثة بأعداد لا أسماء، وتعذّرها لا يُسقط اللوحة
    d.assignments = await settle('xp.assignments', TM.assignmentsOf(e.id, { withCounts: true }));
    if (b.lite === true) return d;
    // تقييم 360 (feedback360.ts): قوائم بانتظار اعتماد المستشار ودوراته، في الرحلة نفسها
    const [reviews, participants, peers, sus, f360] = await Promise.all([
      settle('xp.reviews', V2.reviews(e)), settle('xp.participants', FL.participants(e)),
      settle('xp.peer-list', PR.expertList(e)), settle('xp.sus-state', SU.state('expert', e)), settle('xp.f360', FB.advisorList(e)),
    ]);
    return { ...d, preload: { reviews, participants, peers, sus, f360 } };
  },
  'xp.consent': (e) => E.portalConsent(e),
  'xp.rater-confirm': (e, b) => FL.raterConfirm(e, b),
  // تقييم 360: المستشار الفعلي يعتمد قائمة المقيّمين أو يعيدها بملاحظة
  'xp.f360': (e) => FB.advisorList(e),
  'xp.f360-decide': (e, b) => FB.advisorDecide(e, b),
  // التقرير للمستشار الفعلي من الإغلاق، والتسليم في جلسة التوجيه
  'xp.f360-report': (e, b) => FB.advisorReport(e, b),
  'xp.f360-release': (e, b) => FB.advisorRelease(e, b),
  'xp.profile-save': (e, b) => E.portalProfileSave(e, b),
  'xp.switch': (e, b) => switchTo(e.email, 'expert', b.to, { ip: null }),
  'xp.reviews': (e) => V2.reviews(e),
  'xp.review': (e, b) => V2.review(e, b),
  'xp.respond': (e, b) => E.portalRespond(e, b),
  'xp.rate': (e, b) => E.portalRate(e, b),
  'xp.logout': (_e, _b, sid) => E.portalLogout(sid),
  'xp.sus-state': (e) => SU.state('expert', e),
  'xp.sus-submit': (e, b) => SU.submit('expert', e, b),
  // المرحلة 9: مشاركوه وملف كل منهم، والختامي والمعالم والقاعة لمستشار الدفعة
  'xp.participants': (e) => FL.participants(e),
  'xp.participant': (e, b) => FL.participant(e, b),
  'xp.assessment-answers': (e, b) => FL.assessmentAnswers(e, b),
  'xp.observation-add': (e, b) => FL.observationAdd(e, b),
  'xp.final-eval': (e, b) => FL.finalGet(e, b),
  'xp.final-eval-save': (e, b) => FL.finalSave(e, b),
  'xp.final-eval-vote': (e, b) => FL.finalVote(e, b),
  'xp.milestone': (e, b) => FL.milestone(e, b),
  'xp.hall': (e, b) => FL.hall(e, b),
  'xp.hall-open': (e, b) => FL.hallOpen(e, b),
  'xp.hall-step': (e, b) => FL.hallStep(e, b),
  'xp.hall-split': (e, b) => FL.hallSplit(e, b),
  'xp.hall-assign': (e, b) => FL.hallAssign(e, b),
  'xp.hall-close': (e, b) => FL.hallClose(e, b),
  // المرحلة 8: طلبات الأقران في دفعاته
  'xp.peer-list': (e) => PR.expertList(e),
  'xp.peer-answer': (e, b) => PR.expertAnswer(e, b),
  'xp.peer-review': (e, b) => PR.expertReview(e, b),
  'xp.peer-close': (e, b) => PR.expertClose(e, b),
};

const coordinator: Record<string, (c: any, b: Body, sessionId: string) => Promise<unknown>> = {
  // with_dashboard: لوحة الجهة في رحلة واحدة (البند 8.1): الهوية والموافقة واللوحة واستبيان السهولة معًا، بدل ثلاثة
  // طلبات متتالية. لا لوحة قبل الموافقة، ولكل جزء نتيجته كما لو طُلب وحده
  'coord.me': async (c, b) => {
    const m: any = await C.me(c);
    if (b.with_dashboard !== true || m.consent_needed) return m;
    const [dashboard, sus] = await Promise.all([settle('coord.dashboard', C.dashboard(c)), settle('coord.sus-state', SU.state('coordinator', c))]);
    return { ...m, preload: { dashboard, sus } };
  },
  'coord.consent': (c) => C.consent(c),
  'coord.rater-confirm': (c, b) => C.raterConfirm(c, b),
  'coord.switch': (c, b) => switchTo(c.email, 'org', b.to, { ip: null }),
  'coord.dashboard': (c) => C.dashboard(c),
  'coord.capstone': (c, b) => X.orgDoc(c.organization_id, b, c.permissions),
  'coord.sus-state': (c) => SU.state('coordinator', c),
  'coord.sus-submit': (c, b) => SU.submit('coordinator', c, b),
  'coord.logout': (_c, _b, sid) => C.logout(sid),
};

const admin: Record<string, (a: A.Admin, b: Body, ctx?: any) => Promise<unknown>> = {
  'admin.health': () => S.health(),
  // الإعدادات العامة: مخزن واحد لكل قيمة يضبطها المالك (settings.js)، والحفظ للمدير ذي الكتابة ويُسجَّل
  'admin.settings': () => ST.adminGet(),
  'admin.settings-save': (a, b) => A.writer(a, ST.adminSave, b),
  // تقييم 360: حالة الدورات ونسب الاستجابة بلا نتيجة فرد، وإغلاق نافذة مبكرًا
  'admin.f360': (_a, b) => FB.adminList(b),
  'admin.f360-close': (a, b) => A.writer(a, FB.adminClose, b),
  // تقرير فرد للدعم الفني: للمدير ذي الكتابة وحده ويُسجَّل كل فتح، وحجب ملاحظة تكشف صاحبها
  'admin.f360-report': (a, b) => A.writer(a, FB.adminReport, b),
  'admin.f360-comment': (a, b) => A.writer(a, FB.adminHideComment, b),
  'admin.mail-gallery': () => Promise.resolve(S.mailGallery()),
  'admin.mail-send-test': S.mailSendTest,
  'admin.visits': (_a, b) => S.visits(b),
  'admin.trends': () => S.trends(),
  'admin.item-analysis': (_a, b) => S.itemReport(b),
  'admin.overview': async (a, b) => ({ ...(await A.overview(b)), mfa_required: A.needsSecondFactor(a) }),
  'admin.participants': (_a, b) => A.participants(b),
  'admin.participant': (_a, b) => FL.participantFile(String(b.id || ''), 'admin', { viewer: { email: _a.email } }),
  'admin.peer': (_a, b) => PR.adminList(b),
  'admin.reviews': (_a, b) => A.reviews(b),
  'admin.evidence-url': (a, b) => A.evidenceUrl(a, b),
  'admin.assessment-answers': (a, b) => A.assessmentAnswers(a, b),
  'admin.approve': A.approve,
  'admin.status': A.setStatus,
  'admin.reset-assessment': A.resetAssessment,
  'admin.review': A.reviewRequirement,
  'admin.stage-override': A.stageOverride,
  'admin.stage-create': A.stageCreate,
  'admin.create-participant': A.createParticipant,
  'admin.participants-import': A.participantsImport,
  'admin.participant-save': A.participantSave,
  'admin.insight': () => IN.adminInsight(),
  'admin.changes': (_a, b) => IN.adminChanges(b),
  'admin.inbox': (_a, b) => A.inbox(b),
  'admin.remind-stuck': A.remindStuck,
  'admin.observation-add': (a, b) => A.writer(a, OB.adminAdd, b),
  'admin.observation-remove': (a, b) => A.writer(a, OB.adminRemove, b),
  'admin.participant-impact': (_a, b) => A.participantImpact(b),
  'admin.participant-delete': A.participantDelete,
  'admin.sus': () => SU.adminSummary(),
  'admin.erasures': () => PV.pendingList(),
  'admin.catalog': (_a, b) => A.catalog(b),
  'admin.track': (_a, b) => A.track(b),
  'admin.orgs': () => A.orgs(),
  'admin.org': (_a, b) => A.org(b),
  'admin.assign-org': A.assignOrg,
  'admin.org-impact': C.orgImpact,
  'admin.org-finance': Y.adminOrgFinance,
  'admin.coordinator': C.adminGet,
  'admin.coordinator-save': C.adminSave,
  'admin.coordinator-invite': C.adminInvite,
  'admin.coordinator-status': C.adminSetStatus,
  'admin.coordinator-revoke': C.adminRevokeSessions,
  'admin.coordinator-remove': (a, b) => A.superWriter(a, C.adminRemove, b),
  'admin.coordinator-preview': C.adminPreview,
  'admin.org-journey': C.adminJourney,
  'admin.book-preview': (_a, b) => A.bookPreview(b),
  'admin.submissions': (_a, b) => A.submissions(b),
  'admin.submission': (_a, b) => A.submission(b),
  'admin.review-submission': A.reviewSubmission,
  'admin.save': A.save,
  'admin.delete': A.remove,
  'admin.reorder': A.reorder,
  'admin.clone-instrument': A.cloneInstrument,
  'admin.activate-instrument': A.activateInstrument,
  'admin.lab': () => L.adminOverview(),
  'admin.lab-item': (a, b) => A.writer(a, L.adminItem, b),
  'admin.lab-grant': (a, b) => A.writer(a, L.adminGrant, b),
  'admin.lab-revoke': (a, b) => A.writer(a, L.adminRevoke, b),
  'admin.lab-preview': (_a, b) => L.adminPreview(b),
  'admin.lab-cards': (_a, b) => L.adminCards(b),
  'admin.certificates': (_a, b) => Z.list(b),
  'admin.certificate': (_a, b) => Z.get(b),
  'admin.certificate-issue': (a, b) => A.writer(a, Z.issue, b),
  // D05: التعليق والإلغاء اليدويان للمدير الأعلى وحده بتعليل
  'admin.certificate-revoke': (a, b) => A.superWriter(a, Z.revoke, b),
  'admin.certificate-reissue': (a, b) => A.writer(a, Z.reissue, b),
  'admin.certificate-reissue-org': (a, b) => A.superWriter(a, Z.reissueOrg, b),
  'admin.cert-preview': (_a, b) => Z.preview(b),
  'admin.cert-settings': () => Z.settingsGet(),
  'admin.cert-settings-save': (a, b) => A.writer(a, Z.settingsSave, b),
  'admin.activities': () => V.overview(),
  'admin.workshop-save': (a, b) => A.writer(a, V.workshopSave, b),
  'admin.workshop-delete': (a, b) => A.writer(a, V.workshopDelete, b),
  'admin.workshop-invite': (a, b) => A.writer(a, V.workshopInvite, b),
  'admin.workshop-qr': (_a, b) => V.workshopQr(b),
  'admin.workshop-attendance': (_a, b) => V.workshopAttendance(b),
  'admin.workshop-mark': (a, b) => A.writer(a, V.workshopMark, b),
  'admin.coaching-mark': (a, b) => A.writer(a, V.coachingMark, b),
  'admin.coaching-add': (a, b) => A.writer(a, V.coachingAdd, b),
  'admin.coach-available': (a, b) => A.writer(a, V.coachAvailable, b),
  'admin.impact': (_a, b) => I.adminReport(b),
  'admin.curriculum': (_a, b) => A.curriculum(b),
  'admin.programs': () => G.list(),
  // مع participant_id: حقوق مشارك واحد لملفه (admin-core-12)، وبدونه لوحة المدفوعات كاملة
  'admin.payments': (_a, b) => (b.participant_id ? Y.participantEntitlements(String(b.participant_id)) : Y.adminOverview()),
  'admin.sponsor-requests': () => R.adminList(),
  'admin.sponsor-decide': R.adminDecide,
  'admin.payment': Y.adminPayment,
  'admin.payment-note': Y.adminPaymentNote,
  'admin.payment-remind': Y.adminPaymentRemind,
  'admin.payment-settings': (a, b) => A.superWriter(a, Y.adminSettings, b),
  'admin.payment-grant': Y.adminGrant,
  'admin.payment-reconcile': Y.adminReconcile,
  'admin.experts': () => E.adminList(),
  // ملف الخبير ومعه تكليفاته من المصادر الثلاثة (قراءة؛ التحرير من فريق الدفعة)
  'admin.expert': async (a, b) => ({ ...(await E.adminGet(a, b)), assignments: await TM.assignmentsOf(String(b.id || '')) }),
  'admin.expert-save': E.adminSave,
  'admin.expert-invite': E.adminInvite,
  'admin.expert-set-status': E.adminSetStatus,
  'admin.expert-match': E.adminMatch,
  'admin.expert-assign': E.adminAssign,
  'admin.expert-requests': (_a, b) => E.adminRequests(b),
  'admin.expert-request-cancel': E.adminCancelRequest,
  'admin.expert-request-retry': E.adminRetryRequest,
  'admin.expert-request-complete': E.adminCompleteRequest,
  'admin.program': (_a, b) => G.program(b),
  'admin.program-save': (a, b) => A.writer(a, G.programSave, b),
  'admin.program-archive': (a, b) => A.writer(a, G.programArchive, b),
  'admin.program-version': (a, b) => A.writer(a, G.programPublish, b),
  'admin.program-restore': (a, b) => A.superWriter(a, G.programRestore, b),
  'admin.program-compare': (_a, b) => G.programCompare(b),
  'admin.cohort-save': (a, b) => A.writer(a, G.cohortSave, b),
  'admin.milestones': (_a, b) => G.milestones(b),
  'admin.hall': (_a, b) => H.adminState(b),
  'admin.demo-open': (a, b, ctx) => A.writer(a, (x, y) => D.open(x, y, ctx), b),
  'admin.demo-reset': (a, b) => A.superWriter(a, D.reset, b),
  'admin.hall-open': (a, b) => A.writer(a, H.open, b),
  'admin.hall-step': (a, b) => A.writer(a, H.step, b),
  'admin.hall-split': (a, b) => A.writer(a, H.split, b),
  'admin.hall-assign': (a, b) => A.writer(a, H.assign, b),
  'admin.hall-close': (a, b) => A.writer(a, H.close, b),
  'admin.katon': (_a, b) => KT.adminList(b),
  'admin.katon-topic-save': (a, b) => A.writer(a, KT.topicSave, b),
  'admin.katon-sentence-save': (a, b) => A.writer(a, KT.sentenceSave, b),
  'admin.katon-sentence-delete': (a, b) => A.writer(a, KT.sentenceDelete, b),
  'admin.katon-points': (a, b) => A.writer(a, KT.pointsSave, b),
  'admin.final-eval': (a, b) => F.get(b, a),
  'admin.final-eval-save': (a, b) => A.writer(a, F.save, b),
  'admin.final-eval-vote': (a, b) => A.writer(a, F.vote, b),
  'admin.final-eval-reopen': (a, b) => A.writer(a, F.reopen, b),
  'admin.final-eval-config': (a, b) => A.writer(a, F.config, b),
  'admin.cohort-groups': (_a, b) => G.cohortGroups(b),
  // فريق الدفعة في نقطة واحدة، وملخصه لكل دفعة في صفحة الجهة (team.ts)
  'admin.cohort-team': (_a, b) => TM.cohortTeam(b),
  'admin.cohort-visibility': (a, b) => VS.adminCohortGet(a, b),
  'admin.cohort-visibility-save': (a, b) => A.writer(a, VS.adminCohortSave, b),
  // معاينة ملف مشارك بعين المستشار أو الخبير المسند: الحمولة الحقيقية نفسها التي تصلهما (file.ts)، للمدير ذي الكتابة
  'admin.preview-as': (a, b) => A.writer(a, FL.adminPreviewAs, b),
  'admin.org-team': (_a, b) => TM.orgTeam(b),
  'admin.team-add': (a, b) => A.writer(a, TM.teamAdd, b),
  'admin.team-remove': (a, b) => A.writer(a, TM.teamRemove, b),
  'admin.cohort-group-save': (a, b) => A.writer(a, G.cohortGroupSave, b),
  'admin.cohort-group-assign': (a, b) => A.writer(a, G.cohortGroupAssign, b),
  'admin.cohort-groups-auto': (a, b) => A.writer(a, G.cohortGroupsAuto, b),
  'admin.milestone-save': (a, b) => A.writer(a, G.milestoneSave, b),
  'admin.milestone-delete': (a, b) => A.writer(a, G.milestoneDelete, b),
  'admin.participant-milestone': (a, b) => A.writer(a, G.participantMilestone, b),
  'admin.cohort-upgrade': (a, b) => A.writer(a, G.cohortUpgrade, b),
  'admin.cohort-enroll': (a, b) => A.writer(a, G.cohortEnroll, b),
  'admin.capstones': (_a, b) => X.adminList(b),
  'admin.capstone': (_a, b) => X.adminGet(b),
  'admin.capstone-review': (a, b) => A.writer(a, X.adminReview, b),
  'admin.capstone-sponsor': (a, b) => A.writer(a, X.adminSponsor, b),
  'admin.outcomes': (_a, b) => T.adminOutcomes(b),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return reply(req, { success: false, message: 'Method not allowed' }, 405);
  let action = '';
  try {
    const b: Body = await req.json().catch(() => ({}));
    action = String(b.action || '');
    const ctx = { ip: clientIp(req), ua: req.headers.get('user-agent')?.slice(0, 300) || null };

    if (open[action]) return reply(req, await open[action](b, ctx));
    if (participant[action]) {
      const { participant: p, sessionId } = await P.participantFromToken(b.token);
      if (p.is_demo && DEMO_BLOCKED.has(action)) throw new Fail('هذا غير متاح لحساب العرض', 403, 'demo');
      // بوابة الدفع: القياس المبدئي يحتاج حقه، وما بعده (الرحلة والقياس البعدي) يحتاج حق البرنامج
      const need = payGate(action, b);
      if (need) await Y.requireAccess(p, need);
      // D18: ما يعتمد على أغراض النسخة الجوهرية وحدها ينتظر تجديد الموافقة، والرحلة نفسها لا تُحجب
      if (CONSENT_GATED.includes(action) && 'consented_at' in p && consentState(p.consent_version, p.consented_at).needed) {
        throw new Fail('جدّد موافقتك على سياسة الخصوصية المحدّثة أولًا، من الشريط أعلى رحلتك', 428, 'consent_renew');
      }
      return reply(req, await participant[action](p, b, sessionId, ctx));
    }
    if (coordinator[action]) {
      const { coordinator: c, sessionId } = await C.fromToken(b.token);
      return reply(req, await coordinator[action](c, b, sessionId));
    }
    if (expert[action]) {
      const { expert: e, sessionId } = await E.expertFromToken(b.token);
      // قبل الاعتماد: الملف والخروج فقط
      if (!E.portalWorking(e) && !['xp.dashboard', 'xp.consent', 'xp.profile-save', 'xp.logout', 'xp.switch'].includes(action)) throw new Fail('يُفتح هذا بعد اعتماد ملفك', 403, 'pending');
      return reply(req, await expert[action](e, b, sessionId));
    }
    if (admin[action]) {
      const a = await A.adminFromToken(b.token);
      return reply(req, await admin[action](a, b, ctx));
    }
    throw new Fail('إجراء غير معروف', 400, 'unknown_action');
  } catch (e) {
    if (e instanceof Fail) {
      // تعطل البريد أو غياب مفتاحَي التحقق البشري يوقف الدخول بالرمز، وتعذّر السجل يُفشل العمليات؛
      // فيُبلَّغ المالك فورًا (مرة كل عشر دقائق لكل نوع)
      if (['mail_failed', 'mail_unconfigured', 'mail_cap', 'captcha_unconfigured', 'audit_failed'].includes(e.code)) {
        await alertOps(e.code, { action, message: e.message, ...e.extra });
      }
      logRefusal(action, e.status, e.code);
      return reply(req, { success: false, message: e.message, code: e.code, ...e.extra }, e.status);
    }
    // رقم مرجع يراه المستخدم ويُسجَّل مع الخطأ ويصل في التنبيه، فيُربط البلاغ بسجله
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`leaders-api [${ref}] ${action}:`, e);
    await alertOps('internal', { ref, action, message: String((e as Error)?.message || e).slice(0, 300) });
    return reply(req, { success: false, message: `خطأ داخلي، حاول بعد قليل (المرجع ${ref})`, code: 'internal', ref }, 500);
  }
});
