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
//             requirement.update · passkey.register-options · passkey.register-verify · passkey.dismiss
//             handbook.toc · handbook.chapter · handbook.complete · handbook.export · models.list · models.get · models.save · lab.list · lab.start · lab.answer · achievements · certificate
//             handbook.ping · video.ping · content.ping · content.open · workshop.checkin · workshop.join · coaching.instant (الأنشطة الموثقة)
//             impact.mine · rater.invite · rater.revoke (القياس البعدي ومقيّموه)
//             capstone.get · capstone.summary · capstone.submit · capstone.doc (مشروع التخرج)
//             tracking.get · tracking.save (متابعة تنفيذ المبادرة وأثرها بعد اعتمادها)
//   للمنسق:   coord.me · coord.dashboard · coord.capstone · coord.logout (والدخول: coord.auth-start · coord.auth-verify)
//   للإدارة:  admin.* بتوكن جلسة لوحة الإدارة نفسها (admin-api)
import { alertOps, clientIp, drainMailQueue, Fail, preflight, reply } from './core.ts';
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

type Body = Record<string, any>;

const open: Record<string, (b: Body, ctx: any) => Promise<unknown>> = {
  'auth.start': P.authStart,
  'auth.verify': P.authVerify,
  'auth.google': P.authGoogle,
  'org.info': (b) => P.orgInfo(b),
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
  'cron.expert-offers': async (b) => ({ ...(await E.sweepOffers(b)), session_reminders: await V.sessionReminders(),
    pay_reminders: await Y.payReminders().catch((e) => ({ sent: 0, error: String(e?.message || e) })),
    mail_queue: await drainMailQueue().catch((e) => ({ sent: 0, error: String(e?.message || e) })) }),
  'xp.auth-start': E.portalStart,
  'xp.auth-verify': E.portalVerify,
  'xp.auth-google': E.portalGoogle,
};

// ما لا يحتاج حقًا: الحساب والملف والدفع نفسه. القياس المبدئي بحقه، وكل ما سواه بحق البرنامج
const PAY_FREE = new Set(['me', 'org.logo', 'me.sponsor-code', 'org.visibility', 'logout', 'sessions.list', 'sessions.revoke', 'profile.save',
  'upload.url', 'cv.attach', 'passkey.register-options', 'passkey.register-verify', 'passkey.dismiss', 'pay.access', 'pay.checkout', 'sponsor.request', 'sponsor.cancel', 'me.switch',
  'demo.fill-profile', 'demo.fill-assessment', 'ratings.pending', 'consent.accept', 'org.share-consent']);
// حساب العرض لا يُرسل بريدًا لأحد ولا يشغل خبيرًا حقيقيًا ولا يفتح دفعًا: هذه الإجراءات له مغلقة
const DEMO_BLOCKED = new Set(['experts.choose', 'rater.invite', 'coaching.instant', 'sponsor.request', 'pay.checkout']);
function payGate(action: string, b: Body): 'assessment' | 'program' | null {
  if (PAY_FREE.has(action)) return null;
  if (action.startsWith('assessment.')) return b.kind === 'post' ? 'program' : 'assessment';
  return 'program';
}

const participant: Record<string, (p: any, b: Body, sessionId: string, ctx: any) => Promise<unknown>> = {
  'me': (p) => P.me(p),
  'org.logo': (p) => P.orgLogo(p),
  'me.sponsor-code': (p, b) => P.sponsorCode(p, b),
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
  'upload.url': P.uploadUrl,
  'cv.attach': P.cvAttach,
  'assessment.get': (p, b) => P.assessmentGet(p, b),
  'assessment.answer': P.assessmentAnswer,
  'assessment.submit': P.assessmentSubmit,
  'requirement.update': P.requirementUpdate,
  'passkey.register-options': (p) => K.registerOptions(p),
  'passkey.register-verify': K.registerVerify,
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
  'capstone.get': (p) => X.get(p),
  'capstone.summary': (p, b) => X.saveSummary(p, b),
  'capstone.submit': (p) => X.submit(p),
  'capstone.doc': (p) => X.doc(p),
  'tracking.get': (p) => T.mine(p),
  'tracking.save': (p, b) => T.save(p, b),
};

// منسق الجهة: جلسة مستقلة عن المشاركين، والجهة تُشتق منها لا من الطلب
// لوحة الخبير: الجلسة من expert_sessions، والخبير يُشتق منها على الخادم
const expert: Record<string, (e: any, b: Body, sessionId: string) => Promise<unknown>> = {
  'xp.dashboard': (e) => E.portalDashboard(e),
  'xp.profile-save': (e, b) => E.portalProfileSave(e, b),
  'xp.switch': (e, b) => switchTo(e.email, 'expert', b.to, { ip: null }),
  'xp.reviews': (e) => V2.reviews(e),
  'xp.review': (e, b) => V2.review(e, b),
  'xp.respond': (e, b) => E.portalRespond(e, b),
  'xp.rate': (e, b) => E.portalRate(e, b),
  'xp.logout': (_e, _b, sid) => E.portalLogout(sid),
  // المرحلة 9: مشاركوه وملف كل منهم، والختامي والمعالم والقاعة لمستشار الدفعة
  'xp.participants': (e) => FL.participants(e),
  'xp.participant': (e, b) => FL.participant(e, b),
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
  'coord.me': (c) => C.me(c),
  'coord.switch': (c, b) => switchTo(c.email, 'org', b.to, { ip: null }),
  'coord.dashboard': (c) => C.dashboard(c),
  'coord.capstone': (c, b) => X.orgDoc(c.organization_id, b),
  'coord.logout': (_c, _b, sid) => C.logout(sid),
};

const admin: Record<string, (a: A.Admin, b: Body, ctx?: any) => Promise<unknown>> = {
  'admin.health': () => S.health(),
  'admin.mail-gallery': () => Promise.resolve(S.mailGallery()),
  'admin.mail-send-test': S.mailSendTest,
  'admin.visits': (_a, b) => S.visits(b),
  'admin.trends': () => S.trends(),
  'admin.item-analysis': (_a, b) => S.itemReport(b),
  'admin.overview': async (a, b) => ({ ...(await A.overview(b)), mfa_required: A.needsSecondFactor(a) }),
  'admin.participants': (_a, b) => A.participants(b),
  'admin.participant': (_a, b) => FL.participantFile(String(b.id || ''), 'admin', { viewer: { email: _a.email } }),
  'admin.peer': (_a, b) => PR.adminList(b),
  'admin.reviews': () => A.reviews(),
  'admin.evidence-url': (a, b) => A.evidenceUrl(a, b),
  'admin.approve': A.approve,
  'admin.status': A.setStatus,
  'admin.reset-assessment': A.resetAssessment,
  'admin.review': A.reviewRequirement,
  'admin.stage-override': A.stageOverride,
  'admin.stage-create': A.stageCreate,
  'admin.create-participant': A.createParticipant,
  'admin.participant-save': A.participantSave,
  'admin.participant-impact': (_a, b) => A.participantImpact(b),
  'admin.participant-delete': A.participantDelete,
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
  'admin.certificates': (_a, b) => Z.list(b),
  'admin.certificate': (_a, b) => Z.get(b),
  'admin.certificate-issue': (a, b) => A.writer(a, Z.issue, b),
  'admin.certificate-revoke': (a, b) => A.writer(a, Z.revoke, b),
  'admin.certificate-reissue': (a, b) => A.writer(a, Z.reissue, b),
  'admin.certificate-reissue-org': (a, b) => A.superWriter(a, Z.reissueOrg, b),
  'admin.cert-preview': (_a, b) => Z.preview(b),
  'admin.cert-settings': () => Z.settingsGet(),
  'admin.cert-settings-save': (a, b) => A.writer(a, Z.settingsSave, b),
  'admin.activities': () => V.overview(),
  'admin.workshop-save': (a, b) => A.writer(a, V.workshopSave, b),
  'admin.workshop-delete': (a, b) => A.writer(a, V.workshopDelete, b),
  'admin.workshop-qr': (_a, b) => V.workshopQr(b),
  'admin.workshop-attendance': (_a, b) => V.workshopAttendance(b),
  'admin.workshop-mark': (a, b) => A.writer(a, V.workshopMark, b),
  'admin.coaching-mark': (a, b) => A.writer(a, V.coachingMark, b),
  'admin.coaching-add': (a, b) => A.writer(a, V.coachingAdd, b),
  'admin.coach-available': (a, b) => A.writer(a, V.coachAvailable, b),
  'admin.impact': (_a, b) => I.adminReport(b),
  'admin.curriculum': (_a, b) => A.curriculum(b),
  'admin.programs': () => G.list(),
  'admin.payments': () => Y.adminOverview(),
  'admin.sponsor-requests': () => R.adminList(),
  'admin.sponsor-decide': R.adminDecide,
  'admin.payment-settings': (a, b) => A.superWriter(a, Y.adminSettings, b),
  'admin.payment-grant': Y.adminGrant,
  'admin.payment-reconcile': Y.adminReconcile,
  'admin.experts': () => E.adminList(),
  'admin.expert': E.adminGet,
  'admin.expert-save': E.adminSave,
  'admin.expert-invite': E.adminInvite,
  'admin.expert-set-status': E.adminSetStatus,
  'admin.expert-match': E.adminMatch,
  'admin.expert-assign': E.adminAssign,
  'admin.expert-requests': () => E.adminRequests(),
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
      return reply(req, await participant[action](p, b, sessionId, ctx));
    }
    if (coordinator[action]) {
      const { coordinator: c, sessionId } = await C.fromToken(b.token);
      return reply(req, await coordinator[action](c, b, sessionId));
    }
    if (expert[action]) {
      const { expert: e, sessionId } = await E.expertFromToken(b.token);
      // قبل الاعتماد: الملف والخروج فقط
      if (!E.portalWorking(e) && !['xp.dashboard', 'xp.profile-save', 'xp.logout', 'xp.switch'].includes(action)) throw new Fail('يُفتح هذا بعد اعتماد ملفك', 403, 'pending');
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
      return reply(req, { success: false, message: e.message, code: e.code, ...e.extra }, e.status);
    }
    // رقم مرجع يراه المستخدم ويُسجَّل مع الخطأ ويصل في التنبيه، فيُربط البلاغ بسجله
    const ref = crypto.randomUUID().slice(0, 8);
    console.error(`leaders-api [${ref}] ${action}:`, e);
    await alertOps('internal', { ref, action, message: String((e as Error)?.message || e).slice(0, 300) });
    return reply(req, { success: false, message: `خطأ داخلي، حاول بعد قليل (المرجع ${ref})`, code: 'internal', ref }, 500);
  }
});
