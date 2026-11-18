// ════════════════════════════════════════════════════════════════
// leaders-api — دالة الحافة لتطبيق القادة (leaders.sunkvalue.com)
// ════════════════════════════════════════════════════════════════
// نفس منهجية user-api في المصفوفة: كل الطلبات POST بجسم JSON فيه
// action، والجلسة توكن داخل الجسم يُتحقق منه على الخادم. لا وصول
// مباشر للجداول من المتصفح؛ مخطط leaders مغلق إلا لـ service_role.
//
// الإجراءات:
//   مفتوحة:   cert.verify · rater.get · rater.submit (برابط المقيّم) · sponsor.get · sponsor.submit (برابط الراعي) · share.get · share.note (برابط المشاركة) · outcome.get · outcome.submit (تأكيد الراعي لأثر المبادرة) · expert.apply (طلب انضمام خبير) · offer.get · offer.respond (برابط عرض الخبير) · cron.expert-offers (بسرّ المجدول) · auth.start · auth.verify · auth.google · org.info · cron.reminders (بسرّ المجدول) · passkey.auth-options · passkey.auth-verify · workshop.scan (إيصال مسح رمز الحضور قبل الدخول)
//   للمشارك:  me · org.logo · logout · sessions.list · sessions.revoke · profile.save · upload.url · cv.attach
//             assessment.get · assessment.answer · assessment.submit
//             requirement.update · passkey.register-options · passkey.register-verify · passkey.list · passkey.remove · passkey.dismiss
//             handbook.toc · handbook.chapter · handbook.complete · handbook.export · models.list · models.get · models.save · lab.list · lab.start · lab.answer · lab.draft · lab.hint · lab.check · achievements · certificate
//             handbook.ping · video.ping · content.ping · content.open · workshop.checkin · workshop.join · coaching.instant (الأنشطة الموثقة)
//             impact.mine · rater.invite · rater.revoke (القياس البعدي ومقيّموه؛ الدعوة والإلغاء مع مفتاح 360)
//             f360.mine · f360.start · f360.self · f360.nominate · f360.remove · f360.submit · f360.report · f360.plan (تقييم 360 للتطوير)
//             capstone.get · capstone.summary · capstone.submit · capstone.doc (مشروع التخرج)
//             capstone.shares · capstone.share-create · capstone.share-update · capstone.share-revoke · capstone.note-mark (المشاركة برابط وملاحظات القراء)
//             tracking.get · tracking.save (متابعة تنفيذ المبادرة وأثرها بعد اعتمادها)
//   للمنسق:   coord.me · coord.dashboard · coord.capstone · coord.logout (والدخول: coord.auth-start · coord.auth-verify)
//   للإدارة:  admin.* بتوكن جلسة لوحة الإدارة نفسها (admin-api)
import { alertOps, carryoverAlert, clientIp, CONFIG, db, drainMailQueue, Fail, must, preflight, reply, secretEquals, stuckQueueAlert } from './core.ts';
import { slackHello } from '../_shared/slack.ts';
import { CONSENT_GATED, consentState, CONTACT_EMAIL } from './labels.js';
import { approvalOf, inProgram, journeyApproved } from './logic.js';
import * as P from './participant.ts';
import * as K from './passkeys.ts';
import * as A from './admin.ts';
import * as C from './coordinator.ts';
import * as Z from './certificates.ts';
import * as V from './activities.ts';
import * as I from './impact.ts';
import * as G from './programs.ts';
import * as CP from './cohort-plan.ts';
import * as F from './final.ts';
import * as KT from './katon.ts';
import * as H from './hall.ts';
import * as D from './demo.ts';
import * as S from './system.ts';
import * as L from './lab.ts';
import * as X from './capstone.ts';
import * as T from './tracking.ts';
import * as SH from './share.ts';
import * as E from './experts.ts';
import * as Y from './payments.ts';
import * as R from './sponsor.ts';
import { switchTo } from './switch.ts';
import * as V2 from './advisor.ts';
import * as PR from './peer.ts';
import * as FL from './file.ts';
import * as SU from './sus.ts';
import * as PV from './privacy.ts';
import * as ER from './erasure.ts';
import * as TM from './team.ts';
import * as ST from './settings.ts';
import * as FB from './feedback360.ts';
import * as OB from './observations.ts';
import * as IN from './insight.ts';
import * as VS from './visibility.ts';
import * as MC from './mail-center.ts';
import * as NC from './notify-center.ts';
import * as AG from './agent-admin.ts';
import * as MB from './master-book.ts';
import * as DG from './digest.ts';
import * as BP from './book-proposals.ts';
import * as BR from './book-release.ts';
import * as NU from './nudges.ts';
import * as FT from './features.ts';
import * as NB from './nudge-banner.ts';
import * as GU from './guide.ts';
import * as GE from './guide-eval.ts';
import * as GA from './guide-admin.ts';
import * as TD from './today-desk.ts';
import * as GT from './guide-transcripts.ts';
import { bookAccess } from './master-book.js';

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
  // مسح رمز الحضور قبل الدخول (W1): إيصال موقّع بلا بيانات شخصية يُستهلك بـworkshop.checkin بعد الدخول، بحد معدل في activities.ts
  'workshop.scan': (b, ctx) => V.workshopScan(b, ctx),
  'cert.verify': Z.verify,
  'rater.get': I.raterGet,
  'rater.submit': I.raterSubmit,
  'sponsor.get': X.sponsorGet,
  'sponsor.submit': X.sponsorSubmit,
  // مشاركة وثيقة المبادرة برابط خاص (share.ts): القراءة، وملاحظة القارئ إن فتحها صاحب الوثيقة
  'share.get': SH.get,
  'share.note': (b, ctx) => SH.note(b, ctx),
  'outcome.get': T.verifyGet,
  'outcome.submit': T.verifySubmit,
  'expert.apply': E.apply,
  'offer.get': E.offerGet,
  'offer.respond': E.offerRespond,
  // كل ساعة: يُفرَّغ طابور البريد أولًا، ثم تنتقل العروض المنتهية للتالي، ثم التذكيرات.
  // التفريغ قبل ما يولّده المسح من بريد: ما اتسعت له حصة اليوم (من 03:00 بالرياض، وفي تفريغ المساء من 22:17) يأخذه الأقدم انتظارًا قبل الجديد، فلا
  // يسبق تذكير هذه الساعة إشعارًا ينتظر منذ أمس (وعليه يُبنى الموعد المتوقع في مركز البريد، queueEta). سر المجدول يُتحقق منه قبل كل شيء
  'cron.expert-offers': async (b) => {
    if (!secretEquals(b.secret, CONFIG.cronSecret)) throw new Fail('غير مصرّح', 403, 'forbidden');
    // بريد ميزة مخفية (360) يُمسك في الطابور حتى تُظهَر (FT.heldMail). تعذّر حسابه يؤجل التفريغ ساعة ولا يرسل ما يجب إمساكه
    const hold = await FT.heldMail().catch((e) => { console.error('held mail', e); return null; });
    // وبريد ورشة خُزّن بملاحظة القاعة ثم أُخفيت: يخرج بملاحظة عامة (FT.mailRewrite)
    const rewrite = await FT.mailRewrite().catch((e) => { console.error('mail rewrite', e); return null; });
    const mail_queue = hold && rewrite ? await drainMailQueue(40, hold, rewrite).catch((e) => ({ sent: 0, error: String(e?.message || e) })) : { sent: 0, deferred: true };
    // كل خطوة بحارسها: خطوة ترمي لا توقف ما بعدها (الملخص اليومي آخرها، فلا يتأخر ساعة بعطل في غيره)
    const sweeps = { ...(await E.sweepOffers(b).catch((e) => ({ offers_error: String(e?.message || e) }))),
      session_reminders: await V.sessionReminders().catch((e) => ({ error: String(e?.message || e) })), workshop_reminders: await V.workshopReminders().catch((e) => ({ error: String(e?.message || e) })),
      pay_reminders: await Y.payReminders().catch((e) => ({ sent: 0, error: String(e?.message || e) })),
      pay_expired: await Y.expireAbandoned().catch((e) => ({ expired: 0, error: String(e?.message || e) })),
      // تقييم 360: التذكير في أيامه المضبوطة، والإغلاق عند انقضاء النافذة وإبلاغ المستشار
      feedback360: await FB.sweep().catch((e) => ({ reminded: 0, closed: 0, error: String(e?.message || e) })),
      // بداية إخفاء مقيّمي الأثر مع 360: علامة واحدة في أول تشغيل بعد النشر (feedback360.ts impactPausedSince)
      impact_pause_mark: await FB.markImpactPause().catch((e) => ({ error: String(e?.message || e) })),
      // طلبات الحذف: تذكير المالك قبل 10 أيام وقبل 3 ويوم المهلة ثم يوميًا بعد التأخر (erasure.ts remindSweep)
      erasure_reminders: await ER.remindSweep().catch((e) => ({ reminded: 0, error: String(e?.message || e) })) };
    return {
      ...sweeps, mail_queue,
      ...(hold && rewrite ? {
        // ما بقي في الطابور أكثر من ست ساعات لغير الحصة بعد التفريغ والمسح: تنبيه واحد، ولكل رسالة مرة
        mail_stuck: await stuckQueueAlert(hold).catch((e) => ({ alerted: 0, error: String(e?.message || e) })),
        // وما ينتظر الحصة يُرحَّل إلى الغد آليًّا: سطر واحد في اليوم للمالك بعدده وموعد فراغه المتوقع
        mail_carryover: await carryoverAlert(hold).catch((e) => ({ alerted: false, error: String(e?.message || e) })),
      } : { mail_stuck: { alerted: 0, deferred: true }, mail_carryover: { alerted: false, deferred: true } }),
      // رسالة الربط في سلاك مرة واحدة بعد ضبط البوت (slack.ts slackHello)
      slack_hello: await slackHello(db).catch((e) => { console.error('slack hello', e); return 'failed' as const; }),
      // الملخص اليومي لإشعارات الإدارة: مرة في اليوم في أول تشغيل بعد 9:00 بالرياض (المهمة في الدقيقة 17، فنحو 9:17)، لا يُنشر فارغًا، وبريد واحد بدله إن لم يصل Slack
      daily_digest: await DG.dailyDigest().catch((e) => ({ due: true, error: String(e?.message || e) })),
    };
  },
  'xp.auth-start': E.portalStart,
  'xp.auth-verify': E.portalVerify,
  'xp.auth-google': E.portalGoogle,
};

// ما لا يحتاج حقًا: الحساب والملف والدفع نفسه. القياس المبدئي بحقه، وكل ما سواه بحق البرنامج
const PAY_FREE = new Set(['me', 'org.logo', 'me.sponsor-code', 'org.visibility', 'logout', 'sessions.list', 'sessions.revoke', 'profile.save', 'profile.confirm-name',
  'me.privacy', 'me.notice-ack', 'me.nudge-seen', 'me.export', 'me.erase-request', 'upload.url', 'cv.attach', 'passkey.register-options', 'passkey.register-verify', 'passkey.list', 'passkey.remove', 'passkey.dismiss', 'pay.access', 'pay.checkout', 'sponsor.request', 'sponsor.cancel', 'me.switch',
  'sus.state', 'sus.submit', 'demo.fill-profile', 'demo.fill-assessment', 'ratings.pending', 'consent.accept', 'org.share-consent',
  // الحضور في القاعة لا تمنعه بوابة الدفع (W1): من حضر حضر، وحقه في البرنامج يُسوّى في مكانه. وworkshop.scan مفتوح أصلًا
  'workshop.checkin']);
// حساب العرض لا يُرسل بريدًا لأحد ولا يشغل خبيرًا حقيقيًا ولا يفتح دفعًا: هذه الإجراءات له مغلقة
// ورابطه يُعرض على شاشة: لا يدخل القاعة الحية الحقيقية، ولا يرفع ملفات، ولا يسجّل مفتاح مرور، ولا يبدّل إلى دور آخر (M5)
// ورابط الجلسة عن بعد يُعرض على شاشة الورشة، ورمز الجهة يربطه بجهة حقيقية، وتقييم 360 يفتح دورة ترشيح (P1-04)
const DEMO_BLOCKED = new Set(['guide.ask', 'experts.choose', 'rater.invite', 'f360.nominate', 'f360.submit', 'coaching.instant', 'sponsor.request', 'pay.checkout',
  'hall.join', 'hall.hand', 'hall.pick', 'upload.url', 'cv.attach', 'passkey.register-options', 'passkey.register-verify', 'passkey.remove', 'me.switch', 'me.erase-request',
  'workshop.join', 'me.sponsor-code', 'f360.start', 'capstone.share-create']);
// وما سواه مفتوح لحساب العرض بقرار لا بسهو: كل فعل في DEMO_BLOCKED أو هنا (program_gate_test.ts)
const DEMO_OPEN = new Set(['guide.state', 'guide.clear', 'guide.confirm', 'me', 'sus.state', 'sus.submit', 'org.logo', 'me.privacy', 'me.notice-ack', 'me.nudge-seen', 'me.export', 'pay.access', 'sponsor.cancel', 'org.visibility',
  'consent.accept', 'org.share-consent', 'ratings.pending', 'experts.suggest', 'ratings.submit', 'katon.mine', 'katon.answer', 'hall.state', 'peer.list', 'peer.ask',
  'peer.answer', 'peer.close', 'demo.fill-profile', 'demo.fill-assessment', 'logout', 'sessions.list', 'sessions.revoke', 'profile.save', 'profile.confirm-name',
  'assessment.get', 'assessment.answer', 'assessment.submit', 'requirement.update', 'passkey.list', 'passkey.dismiss', 'handbook.toc', 'handbook.chapter', 'handbook.complete',
  'handbook.export', 'models.list', 'models.get', 'models.save', 'lab.list', 'lab.start', 'lab.answer', 'lab.draft', 'lab.hint', 'lab.check', 'achievements', 'certificate',
  'handbook.ping', 'video.ping', 'content.ping', 'content.open', 'workshop.checkin', 'impact.mine', 'rater.revoke', 'f360.mine', 'f360.self', 'f360.remove', 'f360.report',
  'f360.plan', 'capstone.get', 'capstone.summary', 'capstone.submit', 'capstone.doc', 'tracking.get', 'tracking.save',
  'capstone.shares', 'capstone.share-update', 'capstone.share-revoke', 'capstone.note-mark']);

// بوابة البرنامج (P1-04): كل فعل للمشارك في واحدة من ثلاث، وprogram_gate_test.ts يُسقط فعلًا لم يُصنَّف.
// المعتمد مساره: approvalOf (ثلاثة تسكينات معتمدة، القاعدة نفسها في الكتاب وكاتون والمبادرة). وداخل البرنامج: inProgram
// (المنسحب والموقوف خارجه، والموقوف يُرد قبل هذا في participantFromToken). الاعتماد لا يُسحب بعد منحه، فيُحفظ في العامل
// فلا يُقرأ مع كل سؤال من أسئلة القاعة. الأولى: يبقى لكل من يدخل ومنهم المنسحب (الحساب وبياناته وملفه وشهادته)
const GATE_ACCOUNT = new Set(['me', 'org.logo', 'logout', 'sessions.list', 'sessions.revoke', 'profile.save', 'profile.confirm-name', 'certificate',
  'me.privacy', 'me.notice-ack', 'me.nudge-seen', 'me.export', 'me.erase-request', 'passkey.register-options', 'passkey.register-verify', 'passkey.list', 'passkey.remove', 'passkey.dismiss',
  'consent.accept', 'org.share-consent', 'org.visibility', 'me.switch', 'pay.access', 'sponsor.cancel', 'sus.state', 'sus.submit']);
// داخل البرنامج قبل الاعتماد وبعده: الملف والقياس المبدئي والدفع والرعاية، ودعوة المدير للتقدير القبلي (impact)،
// ومتطلبات المرحلة المفتوحة (requirement.update يقفل المرحلة بنفسه)، والحضور بالرمز في القاعة، والمختبر بمنحته (lab.ts)،
// ورابط الجلسة عن بعد وغرفة الموجّه على الخادم: للمعتمد كما كان، ولغيره حين تفتح مرحلتهما في رحلته بقاعدة الفتح أو بفتح
// الأدمن (sessionOpen في activities.ts)
const GATE_PRE = new Set(['me.sponsor-code', 'pay.checkout', 'sponsor.request', 'upload.url', 'cv.attach', 'assessment.get', 'assessment.answer', 'assessment.submit',
  'demo.fill-profile', 'demo.fill-assessment', 'requirement.update', 'impact.mine', 'rater.invite', 'rater.revoke', 'lab.list', 'lab.start', 'lab.answer', 'lab.draft',
  'lab.hint', 'lab.check', 'workshop.checkin', 'video.ping', 'ratings.pending', 'ratings.submit', 'workshop.join', 'coaching.instant']);
// البرنامج نفسه: مسار معتمد وحالة داخل البرنامج. ما يكشف الدفعة (القاعة والأقران) أو يراسل خبيرًا
const GATE_PROGRAM = new Set(['guide.state', 'guide.ask', 'guide.clear', 'guide.confirm', 'experts.suggest', 'experts.choose', 'katon.mine', 'katon.answer', 'hall.state', 'hall.join', 'hall.hand', 'hall.pick',
  'peer.list', 'peer.ask', 'peer.answer', 'peer.close', 'handbook.toc', 'handbook.chapter', 'handbook.complete', 'handbook.export', 'handbook.ping',
  'models.list', 'models.get', 'models.save', 'achievements', 'content.ping', 'content.open',
  'f360.mine', 'f360.start', 'f360.self', 'f360.nominate', 'f360.remove', 'f360.submit', 'f360.report', 'f360.plan',
  'capstone.get', 'capstone.summary', 'capstone.submit', 'capstone.doc', 'tracking.get', 'tracking.save',
  'capstone.shares', 'capstone.share-create', 'capstone.share-update', 'capstone.share-revoke', 'capstone.note-mark']);
// وما يبقى للمنسحب من الفئتين: الاطلاع على مخرجاته (تقرير 360 المسلَّم، ووثيقة مبادرته، ونسخة كتابه، وتقدير أثره) وتقييم
// خدمة خبير انعقدت. قراءة لما أنجزه أو تقييم لخدمة اكتملت، لا عمل جديد في البرنامج. وتبقى لكل منها بوابتها بعدها: ما في
// GATE_PROGRAM بالاعتماد، والدفع كما هو. وما سواها من الفئتين مغلق على المنسحب (program_gate_test.ts)
// ومشاركة الوثيقة: يرى روابطه وملاحظاتها ويلغي ما شاء، ولا ينشئ رابطًا جديدًا
const GATE_KEPT = new Set(['f360.report', 'capstone.get', 'capstone.doc', 'handbook.export', 'impact.mine', 'ratings.pending', 'ratings.submit',
  'capstone.shares', 'capstone.share-revoke', 'capstone.note-mark']);
const OUT_OF_PROGRAM_AR = `أنت خارج البرنامج الآن، فهذا لم يعد متاحًا لك. تبقى لك بياناتك وشهادتك ومخرجاتك للاطلاع والتنزيل، وللاستفسار: ${CONTACT_EMAIL}`;
const approvedSeen = new Set<string>();
async function programGate(action: string, p: any) {
  if (GATE_ACCOUNT.has(action)) return;
  if (!inProgram(p.status) && !GATE_KEPT.has(action)) throw new Fail(OUT_OF_PROGRAM_AR, 403, 'out_of_program');
  if (GATE_PRE.has(action)) return;
  // فعل البرنامج، وما لم يُصنَّف يُعامل معاملته فلا يُفتح بلا اعتماد. تعذّر القراءة يرمي ولا يفتح شيئًا
  if (approvedSeen.has(p.id)) return;
  if (!approvalOf(must(await db.from('placements').select('dimension, level, approved_at').eq('participant_id', p.id))).approved) {
    throw new Fail('يُفتح هذا بعد اعتماد مسارك', 403, 'locked');
  }
  if (approvedSeen.size > 5000) approvedSeen.clear();
  approvedSeen.add(p.id);
}
function payGate(action: string, b: Body): 'assessment' | 'program' | null {
  if (PAY_FREE.has(action)) return null;
  if (action.startsWith('assessment.')) return b.kind === 'post' ? 'program' : 'assessment';
  return 'program';
}

// فعل مشارك ببواباته كلها (حساب العرض، والبرنامج، والدفع، وتجديد الموافقة)، في معالج الطلب وداخل الطلب المجمّع
async function asAction(action: string, p: any, b: Body, sid: string, ctx: any) {
  if (p.is_demo && DEMO_BLOCKED.has(action)) throw new Fail('هذا غير متاح لحساب العرض', 403, 'demo');
  // مفاتيح الميزات قبل كل بوابة (features.js): الميزة المخفية مخفية عن الجميع بالرد نفسه، وقراءتها تُجاب بلا شيء
  const soft = await FT.gate(action);
  if (soft) return soft;
  // قبل الدفع: المنسحب ومن لم يُعتمد مساره يعرف السبب الحقيقي لا «ادفع أولًا»
  await programGate(action, p);
  // بوابة الدفع: القياس المبدئي يحتاج حقه، وما بعده (الرحلة والقياس البعدي) يحتاج حق البرنامج
  const need = payGate(action, b);
  if (need) await Y.requireAccess(p, need);
  // D18: ما يعتمد على أغراض النسخة الجوهرية وحدها ينتظر تجديد الموافقة، والرحلة نفسها لا تُحجب
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
  'me.nudge-seen': (p, b) => NB.seen(p, b),
  // «التوجيه والإرشاد» (guide.ts): المشارك من جلسته وحدها، ولا معرّف من جسم الطلب
  'guide.state': (p) => GU.guideState(p),
  'guide.ask': (p, b) => GU.guideAsk(p, b),
  'guide.clear': (p) => GU.guideClear(p),
  'guide.confirm': (p, b) => GU.guideConfirm(p, b),
  'me.export': (p) => PV.exportData(p),
  'me.erase-request': (p, b) => PV.eraseRequest(p, b),
  'pay.access': async (p) => ({ success: true, access: await Y.access(p) }),
  'pay.checkout': (p, b) => Y.checkout(p, b),
  'sponsor.request': (p, b) => R.request(p, b),
  'sponsor.cancel': (p) => R.cancel(p),
  'me.switch': (p, b, sid, ctx) => switchTo(p.email, 'participant', b.to, ctx, sid),
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
  'capstone.shares': (p) => SH.list(p),
  'capstone.share-create': (p, b) => SH.create(p, b),
  'capstone.share-update': (p, b) => SH.update(p, b),
  'capstone.share-revoke': (p, b) => SH.revoke(p, b),
  'capstone.note-mark': (p, b) => SH.noteMark(p, b),
  'tracking.get': (p) => T.mine(p),
  'tracking.save': (p, b) => T.save(p, b),
};
// تصنيف أفعال المشارك كما يقرؤه program_gate_test.ts
export const ACTION_GATES = { actions: Object.keys(participant), account: GATE_ACCOUNT, pre: GATE_PRE, program: GATE_PROGRAM, kept: GATE_KEPT, demoBlocked: DEMO_BLOCKED, demoOpen: DEMO_OPEN, payFree: PAY_FREE, open: Object.keys(open) };

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
const expert: Record<string, (e: any, b: Body, sessionId: string, ctx: any) => Promise<unknown>> = {
  // لوحة الخبير في رحلة واحدة (البند 6.2 من تدقيق الإنتاج): كانت اللوحة تطلب الملخص ثم أربعة طلبات بعده، فتُدفع
  // المسافة إلى الخادم مرتين. هنا تُجمع الأربعة مع الملخص، ولكلٍّ نتيجته كما لو طُلب وحده (خطأ أحدها لا يُسقط اللوحة)،
  // وتبقى الأفعال الأربعة كما هي لإعادة التحميل بعد أي إجراء
  'xp.dashboard': async (e, b) => {
    const d: any = await E.portalDashboard(e);
    // مفاتيح الميزات للواجهة (المرحلة P3): تخفي القاعة و360 بها، والرفض على الخادم وحده
    if (d?.success) d.features = await FT.features();
    // من لا يخدم في الرحلة (عضو لجنة بلا دور، أو معتمد بلا خدمة): لا تكليفات ولا مشاركون ولا أقران ولا 360 (portalDashboard)
    if (!d?.success || d.consent_needed || d.onboarding || !journeyApproved(e)) return d;
    // «تكليفاتي» (تصور ربط الخبراء بالجهة، المرحلة 2): تكليفاته من المصادر الثلاثة بأعداد لا أسماء، وتعذّرها لا يُسقط اللوحة
    d.assignments = await settle('xp.assignments', TM.assignmentsOf(e.id, { withCounts: true }));
    // الكتاب الأم لأعضاء لجنتي المحتوى والقياس (master-book.js)
    d.book_access = bookAccess(e);
    if (b.lite === true) return d;
    // تقييم 360 (feedback360.ts): قوائم بانتظار اعتماد المستشار ودوراته، في الرحلة نفسها
    const [reviews, participants, peers, sus, f360] = await Promise.all([
      settle('xp.reviews', V2.reviews(e)), settle('xp.participants', FL.participants(e)),
      settle('xp.peer-list', PR.expertList(e)), settle('xp.sus-state', SU.state('expert', e)), settle('xp.f360', FT.gate('xp.f360').then((soft) => soft || FB.advisorList(e))),
    ]);
    return { ...d, preload: { reviews, participants, peers, sus, f360 } };
  },
  'xp.consent': (e) => E.portalConsent(e),
  // تعهد السرية لمراجعي الكتاب الأم في أول دخول (experts.ts)
  'xp.pledge': (e) => E.portalPledge(e),
  // الكتاب الأم: قراءة وتعليق لأعضاء لجنتي المحتوى والقياس (master-book.ts)
  'xp.book': (e) => MB.book(MB.expertViewer(e)),
  'xp.book-comment': (e, b) => MB.addComment(MB.expertViewer(e), b),
  'xp.book-comment-delete': (e, b) => MB.deleteComment(MB.expertViewer(e), b),
  'xp.rater-confirm': (e, b) => FL.raterConfirm(e, b),
  // تقييم 360: المستشار الفعلي يعتمد قائمة المقيّمين أو يعيدها بملاحظة
  'xp.f360': (e) => FB.advisorList(e),
  'xp.f360-decide': (e, b) => FB.advisorDecide(e, b),
  // التقرير للمستشار الفعلي من الإغلاق، والتسليم في جلسة التوجيه
  'xp.f360-report': (e, b) => FB.advisorReport(e, b),
  'xp.f360-release': (e, b) => FB.advisorRelease(e, b),
  'xp.profile-save': (e, b) => E.portalProfileSave(e, b),
  'xp.switch': (e, b, sid, ctx) => switchTo(e.email, 'expert', b.to, { ip: ctx?.ip ?? null, ua: ctx?.ua ?? null }, sid),
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
  'xp.capstone-doc': (e, b) => FL.capstoneDoc(e, b),
  'xp.assessment-answers': (e, b) => FL.assessmentAnswers(e, b),
  'xp.observation-add': (e, b) => FL.observationAdd(e, b),
  // المرشد (مشرف الرحلة) يذكّر من يرشدهم بالمحرك نفسه والحد المشترك (nudges.ts)
  'xp.nudge-preview': (e, b) => NU.expertPreview(e, b),
  'xp.nudge': (e, b) => NU.expertSend(e, b),
  'xp.nudge-ledger': (e, b) => NU.expertLedger(e, b),
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
// أفعال اللوحة التي لا تمس الرحلة: لعضو اللجنة بلا دور، ولكل خبير
const XP_NO_JOURNEY = new Set(['xp.dashboard', 'xp.consent', 'xp.pledge', 'xp.book', 'xp.book-comment', 'xp.book-comment-delete', 'xp.profile-save', 'xp.logout', 'xp.switch', 'xp.sus-state', 'xp.sus-submit']);

const coordinator: Record<string, (c: any, b: Body, sessionId: string, ctx: any) => Promise<unknown>> = {
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
  'coord.switch': (c, b, sid, ctx) => switchTo(c.email, 'org', b.to, { ip: ctx?.ip ?? null, ua: ctx?.ua ?? null }, sid),
  'coord.dashboard': (c) => C.dashboard(c),
  // تذكير مجموعتي «يحتاج تدخلك» بالمحرك الموحد (nudges.ts): بتوقيع الجهة وحد يومي، وللإدارة إيقافه لكل جهة
  'coord.nudge-preview': (c, b) => NU.coordPreview(c, b),
  'coord.nudge': (c, b) => NU.coordSend(c, b),
  // مفتاح الرؤية coord_initiatives يحجب المبادرات عن لوحة الجهة، فيحجب وثيقتها بالمعرّف أيضًا (N6)
  'coord.capstone': async (c, b) => { VS.requireVisible(await VS.visibilityOfOrg(c.organization_id), 'coord_initiatives'); return X.orgDoc(c.organization_id, b, c.permissions); },
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
  // مركز البريد: الحصة للجميع. تشخيص عنوان ونص رسالة منتظرة (قد يحمل رابط دخول) لمن يكتب وحده، ورابط الدخول اليدوي للمدير الأعلى
  'admin.mail-center': (a) => MC.center(a),
  // قسم «التوجيه» في مركز البريد: الإعداد ومعاينة أثر 7 أيام للجميع، والحفظ للمالك وحده عبر admin.settings-save
  'admin.notify-routing': (a) => NC.routingState(a),
  'admin.mail-trace': (a, b) => A.writer(a, MC.trace, b),
  'admin.mail-queue-body': (a, b) => A.writer(a, MC.queueBody, b),
  'admin.mail-queue-send': (a, b) => A.writer(a, MC.queueSend, b),
  'admin.mail-queue-cancel': (a, b) => A.writer(a, MC.queueCancel, b),
  'admin.mail-login-link': (a, b) => A.superWriter(a, MC.loginLink, b),
  'admin.mail-send-test': S.mailSendTest,
  // تنبيه تجريبي عبر alertOps، ويعيد القنوات المضبوطة بلا قيمها (للمدير الأعلى)
  'admin.alert-test': (a, b) => A.superWriter(a, S.alertTest, b),
  // صحة البريد والتنبيه: حقائق بطاقة النظرة العامة وشريط اللوحة (للمدير ذي الكتابة، والحكم في ops-health.js)
  'admin.ops-health': (a) => S.opsHealth(a),
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
  'admin.approve-bulk': A.approveBulk,
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
  // مكتب اليوم 3ب: التنبيهات ونبض الدفعات، قراءة فقط بصلاحية الصندوق نفسها (today-desk.ts)
  'admin.today': (_a, b) => TD.today(b),
  // التذكير الموحد (nudges.ts): المحرك نفسه والسجل الواحد لكل مرسل. remind-stuck اسم قديم يبقى للتوافق
  'admin.remind-stuck': (a, b) => A.writer(a, NU.adminSend, b),
  'admin.nudge': (a, b) => A.writer(a, NU.adminSend, b),
  'admin.nudge-preview': NU.adminPreview,
  'admin.nudge-ledger': NU.adminLedger,
  'admin.nudge-report': NU.adminReport,
  'admin.observation-add': (a, b) => A.writer(a, OB.adminAdd, b),
  'admin.observation-remove': (a, b) => A.writer(a, OB.adminRemove, b),
  'admin.participant-impact': (_a, b) => A.participantImpact(b),
  'admin.participant-delete': A.participantDelete,
  'admin.sus': () => SU.adminSummary(),
  'admin.erasures': () => PV.pendingList(),
  // قرار طلب الحذف من ملف المشارك (erasure.ts): القراءة لكل مدير، والقرار للمدير الأعلى (requireSuper داخل كل دالة)
  'admin.erasure-get': (a, b) => ER.get(a, b),
  'admin.erasure-execute': ER.execute,
  'admin.erasure-decline': ER.decline,
  'admin.erasure-withdrawn': ER.withdrawn,
  'admin.catalog': (_a, b) => A.catalog(b),
  // الكتاب الأم: يقرؤه كل مدير، ويعلّق ويحسم المدير الكاتب بعامل ثانٍ (master-book.ts)
  'admin.book': (a) => MB.book(MB.adminViewer(a)),
  'admin.book-comment': (a, b) => A.writer(a, (x, y) => MB.addComment(MB.adminViewer(x), y), b),
  'admin.book-comment-delete': (a, b) => A.writer(a, (x, y) => MB.deleteComment(MB.adminViewer(x), y), b),
  'admin.book-comment-status': (a, b) => A.writer(a, (x, y) => MB.setStatus(MB.adminViewer(x), y), b),
  'admin.book-proposal-save': (a, b) => A.writer(a, (x, y) => BP.saveProposal(MB.adminViewer(x), y), b),
  'admin.book-proposal-status': (a, b) => A.writer(a, (x, y) => BP.moveProposal(MB.adminViewer(x), y), b),
  'admin.book-proposal-edit': (a, b) => A.writer(a, (x, y) => BP.proposeFromEdit(MB.adminViewer(x), y), b),
  'admin.book-release': (a, b) => A.superWriter(a, () => BR.releaseState(), b),
  'admin.book-release-start': (a, b) => A.superWriter(a, BR.releaseStart, b),
  'admin.book-release-pr': (a, b) => A.superWriter(a, BR.releaseOpenPr, b),
  'admin.book-release-publish': (a, b) => A.superWriter(a, BR.releasePublish, b),
  // مشاركة الكتاب: إضافة خبير إلى لجنة المحتوى أو القياس أو إزالته (العضوية نفسها في ملفه)
  'admin.book-reader': (a, b) => A.writer(a, MB.setReader, b),
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
  // خريطة رحلة الدفعة في ملفها: قراءة بمنطق org-journey وصلاحيته نفسها
  'admin.cohort-journey': C.adminCohortJourney,
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
  // تعريف الدفعة لنوافذها (P5): المحرر والجدول يقرآن المراحل والمتطلبات من نسختها المثبتة أو برنامجها الحي
  'admin.cohort-definition': (_a, b) => G.cohortDefinitionFor(b),
  'admin.program-save': (a, b) => A.writer(a, G.programSave, b),
  'admin.program-archive': (a, b) => A.writer(a, G.programArchive, b),
  'admin.program-version': (a, b) => A.writer(a, G.programPublish, b),
  'admin.program-restore': (a, b) => A.superWriter(a, G.programRestore, b),
  'admin.program-compare': (_a, b) => G.programCompare(b),
  'admin.cohort-save': (a, b) => A.writer(a, G.cohortSave, b),
  // خطة الدفعة (R2a): المعاينة والسجل قراءة لكل مدير، والحفظ والتراجع (وكل op غيرهما) للكاتب وحده كـadmin.cohort-save
  'admin.cohort-plan': (a, b) => (b?.op === 'preview' || b?.op === 'history' ? CP.cohortPlanAction(a, b) : A.writer(a, CP.cohortPlanAction, b)),
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
  // المساعد الآلي (agent-admin.ts): القراءة للمدير الأعلى أو المالك، والكتابة superWriter، والمفتاح بتحقق إضافي من admin-api
  // «التوجيه والإرشاد» G3: أعداد وإنفاق بلا نص، للمدير الأعلى والمالك كشاشة المساعد
  'admin.guide-report': (a) => { AG.requireAgentRead(a); return GU.guideReport(); },
  // G4a: تقييم الدقة والدفعة التجريبية، للمدير الأعلى والمالك. البدء والخطوة والتفعيل بغلاف superWriter
  // H1: تبويبا «التوجيه والإرشاد» و«إتاحة التوجيه»
  'admin.guide-dashboard': (a) => GA.dashboard(a),
  'admin.guide-toggle': (a, b) => A.superWriter(a, GA.toggle, b),
  'admin.guide-orgs': (a) => GA.orgs(a),
  'admin.guide-org-set': (a, b) => A.superWriter(a, GA.orgSet, b),
  'admin.guide-eval': (a) => GE.evalState(a),
  // H2: مراجعة المجموعة وتعديل حالاتها، والاعتماد للمالك وحده (يُفحص داخل الدالة)
  'admin.guide-eval-cases': (a) => GE.setGet(a),
  'admin.guide-eval-case': (a, b) => A.superWriter(a, GE.caseSave, b),
  'admin.guide-eval-approve': (a, b) => A.superWriter(a, GE.setApprove, b),
  'admin.guide-eval-results': (a, b) => GE.evalResults(a, b),
  'admin.guide-eval-start': (a, b) => A.superWriter(a, GE.evalStart, b),
  'admin.guide-eval-step': (a, b) => A.superWriter(a, GE.evalStep, b),
  'admin.guide-pilots': (a) => GE.pilotList(a),
  'admin.guide-pilot-set': (a, b) => A.superWriter(a, GE.pilotSet, b),
  // H3: سجل المحادثات. القراءة للمالك وللمدير الأعلى بمنحه (تُفحص حية وتُسجَّل)، والمنح للمالك وحده
  'admin.guide-transcript-access': (a) => GT.accessState(a),
  'admin.guide-transcripts': (a) => GT.list(a),
  'admin.guide-transcript': (a, b) => GT.transcript(a, b),
  'admin.guide-transcript-grants': (a) => GT.grants(a),
  'admin.guide-transcript-grant': (a, b) => A.superWriter(a, GT.grantSet, b),
  // H4: رد غير دقيق ← حالة تقييم، وتوجيهات المالك للمساعد
  'admin.guide-flag': (a, b) => A.superWriter(a, GT.flagReply, b),
  'admin.guide-rules': (a, b) => A.superWriter(a, GT.rulesSave, b),
  'admin.agent-state': (a) => AG.state(a),
  'admin.agent-usage': (a) => AG.usage(a),
  'admin.agent-conversations': (a, b) => AG.conversations(a, b),
  'admin.agent-transcript': (a, b) => AG.transcript(a, b),
  'admin.agent-eval-runs': (a) => AG.evalRuns(a),
  'admin.agent-eval-run': (a, b) => AG.evalRun(a, b),
  'admin.agent-enable': (a, b) => A.superWriter(a, AG.enable, b),
  'admin.agent-eval-start': (a, b) => A.superWriter(a, AG.evalStart, b),
  'admin.agent-eval-step': (a, b) => A.superWriter(a, AG.evalStep, b),
  'admin.agent-eval-cancel': (a, b) => A.superWriter(a, AG.evalCancel, b),
  'admin.agent-key-set': (a, b) => A.superWriter(a, AG.keySet, b),
  'admin.agent-key-clear': (a, b) => A.superWriter(a, AG.keyClear, b),
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
      // البوابات كلها في asAction، مصدرها الواحد للطلب وحده وللطلب المجمّع
      return reply(req, await asAction(action, p, b, sessionId, ctx));
    }
    if (coordinator[action]) {
      const { coordinator: c, sessionId } = await C.fromToken(b.token);
      return reply(req, await coordinator[action](c, b, sessionId, ctx));
    }
    if (expert[action]) {
      const { expert: e, sessionId } = await E.expertFromToken(b.token);
      // قبل الاعتماد: الملف والخروج فقط
      if (!E.portalWorking(e) && !['xp.dashboard', 'xp.consent', 'xp.profile-save', 'xp.logout', 'xp.switch'].includes(action)) throw new Fail('يُفتح هذا بعد اعتماد ملفك', 403, 'pending');
      // خدمة الرحلة وحدها تفتح أفعال الرحلة (journeyApproved): عضو اللجنة بلا دور يدخل لوحته وكتابه ولا يصل مشاركًا
      // ولا دفعة ولا قاعة ولو بقي له تكليف قديم. والكتاب بعد تعهد السرية
      if (E.portalWorking(e) && !journeyApproved(e) && !XP_NO_JOURNEY.has(action)) throw new Fail('هذا لخدمة الرحلة، ولوحتك للكتاب الأم', 403, 'journey');
      if (action.startsWith('xp.book')) await E.requirePledge(e);
      // مفاتيح الميزات: القاعة و360 المخفيان عن الخبير يُرفضان، وقراءتهما تُجاب بلا شيء
      const soft = await FT.gate(action);
      if (soft) return reply(req, soft);
      return reply(req, await expert[action](e, b, sessionId, ctx));
    }
    if (admin[action]) {
      const a = await A.adminFromToken(b.token);
      // المدير مستثنى من مفاتيح الميزات ليبنيها، إلا فتح القاعة المخفية (features.js)
      await FT.gate(action);
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
