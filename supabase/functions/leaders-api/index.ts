// ════════════════════════════════════════════════════════════════
// leaders-api — دالة الحافة لتطبيق القادة (leaders.sunkvalue.com)
// ════════════════════════════════════════════════════════════════
// نفس منهجية user-api في المصفوفة: كل الطلبات POST بجسم JSON فيه
// action، والجلسة توكن داخل الجسم يُتحقق منه على الخادم. لا وصول
// مباشر للجداول من المتصفح؛ مخطط leaders مغلق إلا لـ service_role.
//
// الإجراءات:
//   مفتوحة:   cert.verify · auth.start · auth.verify · org.info · cron.reminders (بسرّ المجدول) · passkey.auth-options · passkey.auth-verify
//   للمشارك:  me · logout · profile.save · upload.url · cv.attach
//             assessment.get · assessment.answer · assessment.submit
//             requirement.update · passkey.register-options · passkey.register-verify · passkey.dismiss
//             handbook.toc · handbook.chapter · handbook.complete · models.list · models.get · models.save · achievements · certificate
//   للمنسق:   coord.me · coord.dashboard · coord.logout (والدخول: coord.auth-start · coord.auth-verify)
//   للإدارة:  admin.* بتوكن جلسة لوحة الإدارة نفسها (admin-api)
import { clientIp, Fail, preflight, reply } from './core.ts';
import * as P from './participant.ts';
import * as K from './passkeys.ts';
import * as A from './admin.ts';
import * as C from './coordinator.ts';
import * as Z from './certificates.ts';

type Body = Record<string, any>;

const open: Record<string, (b: Body, ctx: any) => Promise<unknown>> = {
  'auth.start': P.authStart,
  'auth.verify': P.authVerify,
  'org.info': (b) => P.orgInfo(b),
  // التذكير الأسبوعي للمشاركين، ثم ملخص الجهات لمنسقيها في التشغيلة نفسها
  'cron.reminders': async (b) => {
    const r: any = await A.reminders(b);
    return { ...r, coordinator_reports: await C.weeklyReports() };
  },
  'coord.auth-start': C.authStart,
  'coord.auth-verify': C.authVerify,
  'passkey.auth-options': () => K.authOptions(),
  'passkey.auth-verify': K.authVerify,
  'cert.verify': Z.verify,
};

const participant: Record<string, (p: any, b: Body, sessionId: string, ctx: any) => Promise<unknown>> = {
  'me': (p) => P.me(p),
  'logout': (_p, _b, sid) => P.logout(sid),
  'profile.save': P.profileSave,
  'upload.url': P.uploadUrl,
  'cv.attach': P.cvAttach,
  'assessment.get': (p) => P.assessmentGet(p),
  'assessment.answer': P.assessmentAnswer,
  'assessment.submit': P.assessmentSubmit,
  'requirement.update': P.requirementUpdate,
  'passkey.register-options': (p) => K.registerOptions(p),
  'passkey.register-verify': K.registerVerify,
  'passkey.dismiss': (p) => P.passkeyDismiss(p),
  'handbook.toc': (p) => P.handbookToc(p),
  'handbook.chapter': (p, b, _s, ctx) => P.handbookChapter(p, b, ctx),
  'handbook.complete': (p, b) => P.handbookComplete(p, b),
  'models.list': (p) => P.modelsList(p),
  'models.get': (p, b) => P.modelGet(p, b),
  'models.save': (p, b) => P.modelSave(p, b),
  'achievements': (p) => P.achievements(p),
  'certificate': (p) => Z.mine(p),
};

// منسق الجهة: جلسة مستقلة عن المشاركين، والجهة تُشتق منها لا من الطلب
const coordinator: Record<string, (c: any, b: Body, sessionId: string) => Promise<unknown>> = {
  'coord.me': (c) => C.me(c),
  'coord.dashboard': (c) => C.dashboard(c),
  'coord.logout': (_c, _b, sid) => C.logout(sid),
};

const admin: Record<string, (a: A.Admin, b: Body) => Promise<unknown>> = {
  'admin.overview': (_a, b) => A.overview(b),
  'admin.participants': (_a, b) => A.participants(b),
  'admin.participant': (_a, b) => A.participant(b),
  'admin.reviews': () => A.reviews(),
  'admin.evidence-url': (_a, b) => A.evidenceUrl(b),
  'admin.approve': A.approve,
  'admin.status': A.setStatus,
  'admin.reset-assessment': A.resetAssessment,
  'admin.review': A.reviewRequirement,
  'admin.create-participant': A.createParticipant,
  'admin.catalog': () => A.catalog(),
  'admin.track': (_a, b) => A.track(b),
  'admin.orgs': () => A.orgs(),
  'admin.org': (_a, b) => A.org(b),
  'admin.assign-org': A.assignOrg,
  'admin.org-impact': C.orgImpact,
  'admin.coordinator': C.adminGet,
  'admin.coordinator-save': C.adminSave,
  'admin.coordinator-invite': C.adminInvite,
  'admin.coordinator-status': C.adminSetStatus,
  'admin.coordinator-revoke': C.adminRevokeSessions,
  'admin.coordinator-remove': C.adminRemove,
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
  'admin.certificates': (_a, b) => Z.list(b),
  'admin.certificate': (_a, b) => Z.get(b),
  'admin.certificate-issue': (a, b) => A.writer(a, Z.issue, b),
  'admin.certificate-revoke': (a, b) => A.writer(a, Z.revoke, b),
  'admin.certificate-reissue': (a, b) => A.writer(a, Z.reissue, b),
  'admin.cert-settings': () => Z.settingsGet(),
  'admin.cert-settings-save': (a, b) => A.writer(a, Z.settingsSave, b),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return reply(req, { success: false, message: 'Method not allowed' }, 405);
  try {
    const b: Body = await req.json().catch(() => ({}));
    const action = String(b.action || '');
    const ctx = { ip: clientIp(req), ua: req.headers.get('user-agent')?.slice(0, 300) || null };

    if (open[action]) return reply(req, await open[action](b, ctx));
    if (participant[action]) {
      const { participant: p, sessionId } = await P.participantFromToken(b.token);
      return reply(req, await participant[action](p, b, sessionId, ctx));
    }
    if (coordinator[action]) {
      const { coordinator: c, sessionId } = await C.fromToken(b.token);
      return reply(req, await coordinator[action](c, b, sessionId));
    }
    if (admin[action]) {
      const a = await A.adminFromToken(b.token);
      return reply(req, await admin[action](a, b));
    }
    throw new Fail('إجراء غير معروف', 400, 'unknown_action');
  } catch (e) {
    if (e instanceof Fail) return reply(req, { success: false, message: e.message, code: e.code }, e.status);
    console.error('leaders-api:', e);
    return reply(req, { success: false, message: 'خطأ داخلي، حاول بعد قليل', code: 'internal' }, 500);
  }
});
