// ════════════════════════════════════════════════════════════════
// إجراءات المشارك: الدخول بالبريد، الملف، القياس، الرحلة
// ════════════════════════════════════════════════════════════════
import {
  all, audit, BUCKET, CONFIG, db, Fail, hash, humanGate, isDemoMail, logConsent, mailGuard, must, networkGuard, policyChangeMail, randomCode, randomToken, reserveCodeAttempt, sendMail, sendOrDiscard, sha256Hex, signInMail, storage, newDeviceMail } from './core.ts';
import { domainCandidates, hostOf, isPublicMail } from './domains.js';
import { servedOrder } from './answer-review.js';
import { profileComplete } from './onboarding.js';
import { saveEffort } from './effort.ts';
import { openRetake, RETAKE_TITLE, retakeText } from './retake.js';
import {
  AUTO_CHECKS, cleanSurvey, SCOPES, buildJourney, contentLevels, continuousAssessment, FINAL_DECISION_AR, milestoneStatuses, milestoneSummary, googleIdentity, chapterPoints, cleanAnswers, filterHandbookMd, gradeQuiz, handbookModulesFor, missingFields, modelsFor, quizFor, rankFor, shuffleQuiz, overallLevel, isEmail, trackKey, journeyProgress, normalizeEmail, strengthsLine, latinDigits, normalizePhone, placementFromAnswers, priorityFor, reasonWithFlags, behaviorNaExcess, BEHAVIOR_NA_MESSAGE, scoreFor,
  seededShuffle, beforePercents, DEFAULT_MODEL, formFor, forForm, usesForms, skillSplit, commonBehavior,
  servedPost, anchorRepeat, levelGains, levelGated,
  VERIFIED_KINDS, readingVerdict, chapterCompletion, certNameOk, certNameEnOk, JOB_TITLE_MIN, fieldsFor, orgVisibility, finalConfig, approvalOf } from './logic.js';
import { bindAnswers, CHARTER_KEY, importRows, initiativeOf, trackProject } from './capstone.js';
import { profileFor } from './profiles.ts';
import { evidenceFor, participantItem } from './activities.ts';
import { contentLevelsFor, groupOf, journeyDefinition, releaseOf, requirementFor } from './programs.ts';
import { continuousEvents as katonEvents } from './katon.ts';
import { CONTACT_EMAIL, consentState, POLICY_CHANGES, POLICY_MATERIAL_VERSION, POLICY_VERSION, UNEXPECTED_ERROR } from './labels.js';
import { GOOGLE_CLIENT_ID } from '../_shared/sites.js';
import { verifyGoogleToken } from './google.ts';
import { rolesOf } from './doors.ts';
import { access as accessOf } from './payments.ts';
import { pinSponsorFor } from './entitlements.ts';
import { advisorOf, notifyAdvisor } from './advisor.ts';

type Ctx = { ip: string | null; ua: string | null };
type Body = Record<string, any>;

// ── الجلسة ──
// وصف مختصر للجهاز من المتصفح، لرسالة الدخول الجديد
const deviceOf = (ua: string | null) => {
  const s = String(ua || '');
  const os = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : 'جهاز';
  const br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /Firefox\//.test(s) ? 'Firefox' : '';
  return br ? `${os} · ${br}` : os;
};

export async function issueSession(participantId: string, method: string, ctx: Ctx) {
  // جهاز جديد: لصاحب الحساب دخول سابق، وليس بينها جلسة من المتصفح نفسه
  const { data: prev } = await db.from('auth_sessions').select('user_agent').eq('participant_id', participantId).order('created_at', { ascending: false }).limit(20);
  const isNew = (prev || []).length > 0 && ctx.ua && !(prev || []).some((x: any) => x.user_agent === ctx.ua);
  const token = randomToken();
  const expires = new Date(Date.now() + CONFIG.sessionDays * 864e5).toISOString();
  must(await db.from('auth_sessions').insert({
    participant_id: participantId, token_hash: await hash(token), method, ip: ctx.ip, user_agent: ctx.ua, expires_at: expires,
  }));
  await db.from('participants').update({ last_login_at: new Date().toISOString() }).eq('id', participantId);
  if (isNew) {
    const { data: p } = await db.from('participants').select('full_name, email, is_demo').eq('id', participantId).maybeSingle();
    if (p?.is_demo) return token;
    const when = new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    if (p?.email) sendMail(p.email, 'دخول جديد إلى حسابك', newDeviceMail(p.full_name, deviceOf(ctx.ua), when)).catch((e) => console.error('new device mail', e));
  }
  return token;
}

export async function participantFromToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const { data: s } = await db.from('auth_sessions')
    .select('id, participant_id, expires_at, revoked_at').eq('token_hash', await hash(token)).maybeSingle();
  if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const p = must(await db.from('participants').select('*').eq('id', s.participant_id).single());
  if (p.status === 'suspended') throw new Fail(`الحساب موقوف. تواصل مع ${CONTACT_EMAIL}.`, 403, 'suspended');
  // الاستعمال يجدد المدة: تنتهي الجلسة بعد sessionDays من آخر نشاط لا من الدخول
  const now = Date.now();
  const touch: Record<string, string> = { last_seen_at: new Date(now).toISOString() };
  if (new Date(s.expires_at).getTime() - now < (CONFIG.sessionDays - 1) * 864e5) touch.expires_at = new Date(now + CONFIG.sessionDays * 864e5).toISOString();
  db.from('auth_sessions').update(touch).eq('id', s.id).then(() => {});
  return { participant: p, sessionId: s.id as string };
}

// ── نسب المشارك لجهته ──
// ما يربط المشارك بجهة راعية شيئان فقط: رمز رابطها (يكتبه أو يأتي به)، أو نطاق بريده
// بعد توثيقه. الموقع المُحيل (ref) يرسله المتصفح ويستطيع أي أحد كتابته، فلا يربط أحدًا
// ويُحفظ للتحليل فقط (referrer_host).
const ORG_COLS = 'id, name, short_name, color, status';
const live = (o: any) => (o && o.status !== 'inactive' ? o : null);

async function orgByCode(code: unknown) {
  const c = String(code || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{4,40}$/.test(c)) return null;
  const { data } = await db.from('organizations').select(ORG_COLS).ilike('invite_code', c).maybeSingle();
  return live(data);
}

async function orgByHost(host: string | null) {
  // mi.manzoma.sa تطابق mi.manzoma.sa ثم manzoma.sa، والأدق يفوز؛ اللواحق العامة (gov.sa…) لا تدخل المطابقة
  const candidates = domainCandidates(host);
  if (!candidates.length) return null;
  const { data } = await db.from('organizations').select(`${ORG_COLS}, domains`).overlaps('domains', candidates);
  for (const c of candidates) {
    const hit = (data || []).find((o: any) => live(o) && (o.domains || []).includes(c));
    if (hit) return hit;
  }
  return null;
}

const campaignOf = (c: unknown) => {
  const s = String(c || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : null;
};

// رمز رابط الجهة (?org=): محاولاته الخاطئة محدودة لكل شبكة أو حساب (D20)، فلا تُخمَّن الرموز
const ORG_LINK_TRIES_PER_HOUR = 30;
async function resolveOrg(b: Body, key = 'anon') {
  const c = String(b.org || '').trim();
  if (!c) return null;
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('action', 'org.code-fail').eq('actor', key).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if ((count ?? 0) >= ORG_LINK_TRIES_PER_HOUR) throw new Fail('محاولات كثيرة لرابط الجهة، حاول بعد ساعة', 429, 'rate');
  const byCode = await orgByCode(c);
  if (!byCode) { await audit('system', key, 'org.code-fail', 'organizations', 'none'); return null; }
  return { org: byCode, via: 'link' as const };
}

// ── الجهة الراعية برمز يكتبه المشارك ──
// الجهة الراعية (organization_id) غير «جهة العمل» (organization_name، نص يكتبه المشارك ولا يُربط بشيء).
// لا قائمة جهات علنية: الرمز الصحيح وحده يكشف اسم جهته، والخاطئ رده واحد دائمًا، ومحاولاته محدودة.
const SPONSOR_TRIES_PER_HOUR = 10;
async function sponsorByCode(code: unknown, key: string) {
  const c = String(code || '').trim();
  if (!c) return null;
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('action', 'sponsor.code-fail').eq('actor', key).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if ((count ?? 0) >= SPONSOR_TRIES_PER_HOUR) throw new Fail('محاولات كثيرة لرمز الجهة، حاول بعد ساعة', 429, 'rate');
  const org = await orgByCode(c);
  if (!org) {
    await audit('system', key, 'sponsor.code-fail', 'organizations', 'none');
    throw new Fail('تعذّر التحقق من رمز الجهة الراعية. تأكد منه، أو تابع دونه وتربطك الإدارة لاحقًا.', 400, 'sponsor_code');
  }
  return { org, via: 'link' as const };   // الرمز المكتوب هو رمز رابط الجهة نفسه
}
// ── الربط بنطاق البريد الوظيفي: بريد موثَّق على نطاق مسجل لجهة نشطة يربط صاحبه بها ──
// نطاقات البريد العامة لا تربط أحدًا أبدًا (القائمة في domains.js).
export async function orgByEmail(email: string) {
  const dom = String(email || '').split('@')[1]?.toLowerCase() || '';
  if (!dom || isPublicMail(dom)) return null;
  const org = await orgByHost(dom);
  return org ? { org, via: 'domain' as const } : null;
}
async function sponsorFor(b: Body, key: string, email = '') {
  return (await sponsorByCode(b.sponsor_code, key)) || (await resolveOrg(b, key)) || (await orgByEmail(email));
}

// أدوار البريد الأخرى، تُكشف لصاحبه فقط بعد إثبات ملكيته (رمز أو رابط أو Google)، فلا يُنشأ له حساب مشارك خطأً
const otherRoles = async (email: string) => (await rolesOf(email)).filter((d) => d !== 'participant');

// المشارك المسجل يضيف رمز جهته الراعية لاحقًا (مرة واحدة: الربط بعدها من الإدارة)
export async function sponsorCode(p: any, b: Body) {
  if (p.organization_id) throw new Fail('حسابك مرتبط بجهة راعية. لتغييرها تواصل مع الإدارة.', 409);
  const r = await sponsorByCode(b.sponsor_code, `p:${p.id}`);
  if (!r) throw new Fail('اكتب رمز الجهة الراعية');
  const saved = must(await db.from('participants').update({ organization_id: r.org.id, org_via: 'link' }).eq('id', p.id).is('organization_id', null).select('*').single());
  await audit('participant', p.id, 'participant.sponsor', 'organizations', r.org.id);
  await pinSponsorFor(p.id);
  return { success: true, ...(await mePayload(saved)) };
}

// يعرض اسم الجهة في شاشة التسجيل قبل إدخال البريد
export async function orgInfo(b: Body, ctx: { ip?: string | null } = {}) {
  const r = await resolveOrg(b, `ip:${ctx.ip || 'none'}`);
  if (!r) return { success: false, message: 'رابط الجهة غير صالح أو منتهٍ', code: 'org' };
  return { success: true, via: r.via, org: { name: r.org.name, short_name: r.org.short_name, color: r.org.color } };
}

// ── الموافقة على الخصوصية والشروط ──
// تُسجَّل مع نسخة السياسة لحظة التسجيل (الإشعار يسبق زر التسجيل)، ولمن سبق تسجيله عند أول دخول
// بعد نشر السياسة. تعذّر الكتابة يرمي، فلا تُعد الموافقة مسجلة وهي لم تُحفظ.
async function setConsent(participantId: string, fields: Record<string, unknown>) {
  must(await db.from('participants').update(fields).eq('id', participantId), 'تعذّر حفظ موافقتك الآن، حاول بعد قليل');
}
// سطر في السجل التاريخي لا يُكتب فوقه (D18) أولًا، ثم الموافقة في جدول المشارك (النسخة النافذة ووقتها):
// إن تعذّر السطر لم تُكتب الموافقة، فتطلبها شاشة الموافقة من جديد ولا تُعد مسجلة بلا دليلها
async function recordConsent(participantId: string, kind: 'accept' | 'renew' = 'accept') {
  await logConsent('participant', participantId, kind);
  await setConsent(participantId, { consented_at: new Date().toISOString(), consent_version: POLICY_VERSION });
}
export async function consentAccept(p: any) {
  const before = consentState(p.consent_version, p.consented_at);
  await recordConsent(p.id, before.needed === 'renew' ? 'renew' : 'accept');
  await audit('participant', p.id, 'participant.consent', 'participants', p.id, { version: p.consent_version ?? null }, { version: POLICY_VERSION });
  const fresh = must(await db.from('participants').select('*').eq('id', p.id).single());
  return { success: true, ...(await mePayload(fresh)) };
}
// موافقة المشارك على اطلاع جهته على مستوياته: بدونها لا تخرج المستويات للجهة ولو مُنح منسقها صلاحيتها
export async function orgShareConsent(p: any, b: Body) {
  const share = b.share === true;
  // الحالة أولًا فيسري السحب فورًا، ثم سطر السجل (D18)؛ تعذّر أيهما يفشل الطلب قبل أثره في السجل
  must(await db.from('participants').update({ org_share_consented_at: share ? new Date().toISOString() : null }).eq('id', p.id), 'تعذّر حفظ اختيارك الآن');
  await logConsent('participant', p.id, share ? 'org_share_on' : 'org_share_off');
  await audit('participant', p.id, share ? 'participant.org-share.on' : 'participant.org-share.off', 'participants', p.id);
  return { success: true, share };
}

// إخطار النسخة الجوهرية مرة واحدة لكل نسخة (D18): بريد لكل من وافق على نسخة أقدم، في طابور البريد الجماعي
// فيمر بالعداد الموحد (D15). يُكتب في الطابور دفعة واحدة، ثم يُسجَّل في السجل فلا يتكرر. من المهمة الساعية.
export async function policyNotify() {
  const v = POLICY_MATERIAL_VERSION;
  const { data: done, error } = await db.from('audit_log').select('id').eq('action', 'policy.notify').eq('entity_id', v).limit(1);
  if (error) return { queued: 0, error: error.message };
  if (done?.length) return { queued: 0, done: true };
  const rows = (await all((f, t) => db.from('participants').select('id, email, full_name, consent_version, is_demo')
    .not('consented_at', 'is', null).or(`consent_version.is.null,consent_version.lt.${v}`).order('id').range(f, t)))
    .filter((r: any) => !r.is_demo && r.email && !isDemoMail(r.email));
  const items = POLICY_CHANGES.find((c) => c.version === v)?.items || [];
  const subject = 'حدّثنا سياسة الخصوصية وشروط برنامج القادة';
  if (rows.length) {
    const { error: qe } = await db.from('mail_queue').insert(rows.map((r: any) => ({ to_email: r.email, subject, html: policyChangeMail(r.full_name, v, items), ref: `participant:${r.id}`, kind: 'bulk' })));
    if (qe) return { queued: 0, error: qe.message };
  }
  await audit('system', null, 'policy.notify', 'policy', v, null, { version: v, recipients: rows.length });
  return { queued: rows.length };
}

// ── 1. بدء الدخول أو التسجيل ──
// بريد واحد يحمل رابطًا ورمزًا، والرد واحد لكل بريد مسجلًا كان أو جديدًا: { success, sent }، كبوابتي الخبير والجهة.
// الاسم والجوال ورمز الجهة تُطلب بعد إثبات ملكية البريد (needs_name في authVerify)، فلا يستطيع أحد أن يعرف
// من صفحة الدخول إن كان بريد ما مسجلًا في البرنامج (التدقيق 2026-11-10). ما جاء به الزائر من رابط جهة أو حملة
// يُحفظ مع التحدي فلا يضيع إن فُتح رابط البريد على جهاز آخر.
export async function authStart(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد الإلكتروني غير صحيح');

  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count: perEmail } = await db.from('email_challenges').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', hourAgo);
  if ((perEmail ?? 0) >= 5) throw new Fail('طلبات كثيرة لهذا البريد، حاول بعد ساعة', 429, 'rate');
  await networkGuard(ctx);
  await humanGate(b, ctx, email);

  const { data: existing } = await db.from('participants').select('id, full_name').eq('email', email).maybeSingle();
  // التسجيل الجديد: آثار الوصول وحدها الآن، والملف بعد التحقق. اسم يرسله عميل قديم (قبل هذا التغيير) يُحفظ كما كان
  const pending: Body | null = existing ? null : {
    campaign: campaignOf(b.campaign), referrer_host: hostOf(b.ref),
    ...(String(b.org || '').trim() ? { org: String(b.org).trim().slice(0, 60) } : {}),
    ...(String(b.full_name || '').trim().length >= 3 ? { full_name: String(b.full_name).trim().slice(0, 120) } : {}),
  };

  await mailGuard(b, ctx, existing ? 'login' : 'register', { checked: true });
  const code = randomCode();
  const link = randomToken(24);
  const row = must(await db.from('email_challenges').insert({
    email, purpose: existing ? 'login' : 'register', code_hash: await hash(code), link_token_hash: await hash(link),
    pending_profile: pending, ip: ctx.ip, expires_at: new Date(Date.now() + CONFIG.codeMinutes * 6e4).toISOString(),
  }).select('id').single()) as { id: string };
  const url = `${CONFIG.appUrl}/verify?e=${encodeURIComponent(email)}&t=${link}`;
  await sendOrDiscard('email_challenges', row.id, email, existing ? 'رمز الدخول إلى رحلتك' : 'أكمل تسجيلك في برنامج القادة',
    signInMail(existing?.full_name || pending?.full_name || '', code, url, !existing));
  return { success: true, sent: true };
}

// ملف التسجيل الجديد يُتحقق منه قبل البحث عن التحدي، فلا يستهلك خطأ في الاسم أو الجوال محاولة من محاولات الرمز
function newcomerFields(b: Body) {
  if (b.full_name === undefined) return null;
  const name = String(b.full_name || '').trim();
  if (name.length < 3) throw new Fail('اكتب اسمك الكامل (3 أحرف على الأقل).', 400, 'name');
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw new Fail('رقم الجوال غير صحيح. اكتبه بصيغة 05XXXXXXXX.', 400, 'phone');
  return { full_name: name.slice(0, 120), phone };
}

// ── 2. التحقق بالرمز أو الرابط ──
// رسائل الرابط تسمّي حاله بدقة (مستعمل، أو منتهٍ، أو لبريد آخر، أو غير معروف) بدل «منتهٍ» لكل شيء.
// التسجيل الجديد يمر هنا مرتين: الأولى تثبت ملكية البريد فيُطلب الاسم (needs_name) والتحدي باقٍ صالحًا،
// والثانية تحمل الاسم فيُستهلك التحدي ويُنشأ الحساب. needs_name ردّ غير ناجح عمدًا: عميل قديم لا يعرفه
// يعرض رسالته بدل أن يعدّه دخولًا بلا جلسة.
export async function authVerify(b: Body, ctx: Ctx) {
  const email = normalizeEmail(b.email);
  const fields = newcomerFields(b);
  let ch: any = null;
  if (b.link) {
    const { data } = await db.from('email_challenges').select('*').eq('link_token_hash', await hash(String(b.link))).maybeSingle();
    if (!data) throw new Fail('رابط الدخول غير صالح، أو استُبدل برابط أحدث. افتح آخر رسالة وصلتك، أو اطلب رمزًا جديدًا.', 400, 'link_unknown');
    if (data.email !== email) throw new Fail('هذا الرابط لبريد آخر. افتحه من الرسالة نفسها كما وصلت دون تعديل، أو اطلب رمزًا جديدًا.', 400, 'link_mismatch');
    if (data.consumed_at) throw new Fail('استُخدم رابط الدخول هذا من قبل، فكل رابط لمرة واحدة. اطلب رمزًا جديدًا إن احتجت الدخول.', 400, 'used');
    if (new Date(data.expires_at) < new Date()) throw new Fail(`انتهت صلاحية الرابط (${CONFIG.codeMinutes} دقيقة). اطلب رمزًا جديدًا.`, 400, 'expired');
    ch = data;
  } else {
    const { data } = await db.from('email_challenges').select('*').eq('email', email).is('consumed_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    ch = data;
    if (ch) {
      // المحاولة تُحجز ذريًا قبل المقارنة: خمس محاولات للرمز ولو تزامنت الطلبات (الملحق 1، M2)
      await reserveCodeAttempt('email_challenges', ch);
      if (ch.code_hash !== await hash(latinDigits(b.code || '').trim())) {
        throw new Fail('الرمز غير صحيح. تأكد من آخر رمز وصلك، أو اطلب رمزًا جديدًا.', 400, 'code');
      }
    }
  }
  if (!ch || ch.consumed_at || new Date(ch.expires_at) < new Date()) {
    throw new Fail('الرمز منتهٍ أو مستخدم، اطلب رمزًا جديدًا', 400, 'expired');
  }
  let { data: p } = await db.from('participants').select('*').eq('email', email).maybeSingle();
  let profile: Body | null = null;
  if (!p) {
    if (ch.purpose !== 'register') throw new Fail('انتهت صلاحية خطوة التسجيل. ابدأ من جديد.', 400, 'restart');
    // تسجيل جديد لبريد خبير أو منسق جهة: يختار صاحبه وجهته قبل إنشاء حساب مشارك (الرمز يبقى صالحًا لإعادة الطلب)
    if (b.confirm_new !== true) {
      const roles = await otherRoles(email);
      if (roles.length) return { success: true, choose_role: true, roles };
    }
    const pend = ch.pending_profile || {};
    const named = fields || (pend.full_name ? { full_name: pend.full_name, phone: pend.phone || null } : null);
    if (!named) return { success: false, needs_name: true, code: 'needs_name', message: 'تحقّقنا من بريدك. حدّث الصفحة وأكمل اسمك لإنشاء حسابك.' };
    // الجهة الراعية: رمز يكتبه المشارك، أو رابط جهة جاء به، أو نطاق بريده الموثَّق. التسجيل القديم حمل الجهة محسومة
    const r = pend.organization_id ? { org: { id: pend.organization_id }, via: pend.org_via }
      : await sponsorFor({ sponsor_code: b.sponsor_code, org: pend.org }, ctx.ip || email, email);
    profile = {
      ...named, campaign: pend.campaign || null, referrer_host: pend.referrer_host || null,
      ...(r ? { organization_id: r.org.id, org_via: r.via } : {}),
    };
  }
  // استهلاك ذري: لو سبق استخدامه في طلب موازٍ لا يُحدَّث أي صف
  const { data: used } = await db.from('email_challenges').update({ consumed_at: new Date().toISOString() })
    .eq('id', ch.id).is('consumed_at', null).select('id');
  if (!used?.length) throw new Fail(b.link ? 'استُخدم رابط الدخول هذا من قبل. اطلب رمزًا جديدًا إن احتجت الدخول.' : 'استُخدم هذا الرمز من قبل. اطلب رمزًا جديدًا.', 400, 'used');

  if (!p && profile) {
    p = must(await db.from('participants').insert({
      email, full_name: profile.full_name, phone: profile.phone,
      organization_id: profile.organization_id || null,
      org_via: profile.org_via || null, campaign: profile.campaign, referrer_host: profile.referrer_host,
      email_verified_at: new Date().toISOString(), source: profile.organization_id ? 'invite' : 'self',
    }).select('*').single());
    await audit('participant', p.id, 'participant.register', 'participants', p.id);
    // أكمل التسجيل بعد إشعار الخصوصية والشروط. تعذّر تسجيلها لا يفشل الحساب المنشأ: تبقى غير مسجلة، فتطلبها شاشة الموافقة
    await recordConsent(p.id).catch((e) => console.error('register consent:', e));
    if (p.organization_id) await pinSponsorFor(p.id);   // إعفاء الراعي يُثبَّت لحظة الربط
  } else if (!p.email_verified_at) {
    await db.from('participants').update({ email_verified_at: new Date().toISOString() }).eq('id', p.id);
  }
  const token = await issueSession(p.id, b.link ? 'email_link' : 'email_code', ctx);
  return { success: true, token, ...(await mePayload(p)) };
}

// ── 3. الدخول بحساب Google ──
// التوقيع يُتحقق منه محليًا بمفاتيح Google العامة (google.ts)، ثم العميل والمُصدر والصلاحية والبريد الموثّق.
// البريد الموجود يُفتح حسابه، والجديد يُنشأ بالاسم من Google ويُكمل ملفه كالمعتاد.
export async function authGoogle(b: Body, ctx: Ctx) {
  const credential = String(b.credential || '');
  if (credential.length < 100) throw new Fail('لم يكتمل الدخول بحساب Google، حاول مرة أخرى');
  const id: any = googleIdentity(await verifyGoogleToken(credential), GOOGLE_CLIENT_ID);
  if (id.error) throw new Fail(id.error, 401, 'google');

  let { data: p } = await db.from('participants').select('*').eq('email', id.email).maybeSingle();
  if (!p) {
    // حساب جديد: يتأكد صاحبه أنه مشارك (لا خبير ولا منسق جهة) قبل إنشائه، ويضيف رمز جهته إن وُجد
    if (b.confirm_new !== true) return { success: true, confirm_new: true, name: id.name || '', roles: await otherRoles(id.email) };
    const r = await sponsorFor(b, ctx.ip || id.email, id.email);
    p = must(await db.from('participants').insert({
      email: id.email, full_name: id.name || id.email.split('@')[0], email_verified_at: new Date().toISOString(),
      campaign: campaignOf(b.campaign), referrer_host: hostOf(b.ref),
      ...(r ? { organization_id: r.org.id, org_via: r.via } : {}),
      source: r ? 'invite' : 'self',
    }).select('*').single());
    await audit('participant', p.id, 'participant.register', 'participants', p.id, null, { via: 'google' });
    await recordConsent(p.id).catch((e) => console.error('register consent:', e));   // كما في التسجيل بالبريد
    if (p.organization_id) await pinSponsorFor(p.id);
  } else if (!p.email_verified_at) {
    await db.from('participants').update({ email_verified_at: new Date().toISOString() }).eq('id', p.id);
  }
  if (p.status === 'suspended') throw new Fail(`الحساب موقوف. تواصل مع ${CONTACT_EMAIL}.`, 403, 'suspended');
  const token = await issueSession(p.id, 'google', ctx);
  return { success: true, token, ...(await mePayload(p)) };
}

export async function logout(sessionId: string) {
  await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
  return { success: true };
}

// أجهزة المشارك: الجلسات السارية، وإنهاء غير الحالية
export async function sessionsList(p: any, sessionId: string) {
  const { data } = await db.from('auth_sessions').select('id, method, user_agent, created_at, last_seen_at')
    .eq('participant_id', p.id).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    .order('last_seen_at', { ascending: false, nullsFirst: false }).limit(20);
  return { success: true, sessions: (data || []).map((x) => ({ ...x, current: x.id === sessionId })) };
}

export async function sessionsRevoke(p: any, b: Body, sessionId: string) {
  let q = db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('participant_id', p.id).is('revoked_at', null).neq('id', sessionId);
  if (b.id) q = q.eq('id', String(b.id));
  must(await q);
  return sessionsList(p, sessionId);
}

// ── 3. حالة المشارك كاملة ──
async function activeInstrument(kind = 'baseline') {
  const { data } = await db.from('instruments').select('*').eq('kind', kind).eq('active', true)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  return data;
}

// آخر قياس مبدئي أرسله المشارك، بأداته وصيغته
export async function lastBaseline(participantId: string) {
  const { data } = await db.from('assessments').select('id, form, instrument_id, instruments!inner(key, kind)')
    .eq('participant_id', participantId).eq('status', 'submitted').eq('instruments.kind', 'baseline')
    .order('submitted_at', { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

// الأداة البعدية التي تقابل قياس المشارك المبدئي (pairs_with)، فمن بدأ على
// v3 يُختم بـ post-v1 ومن بدأ على v4 بـ post-v2، وإلا أداة بعدية عامة (بلا
// pairs_with). أداة مقرونة بمبدئي آخر لا تُعطى أبدًا، فنتائجها لا تُقارن
// (حارس الإقران pairComparable)؛ وأحدث أداة لمن لا مبدئي له بعد.
export async function postInstrumentFor(participantId: string) {
  const [{ data: posts }, base] = await Promise.all([
    db.from('instruments').select('*').eq('kind', 'post').eq('active', true).order('version', { ascending: false }),
    lastBaseline(participantId),
  ]);
  const list = posts || [];
  const key = base?.instruments?.key;
  if (!key) return list[0] || null;
  return list.find((i: any) => i.pairs_with === key) || list.find((i: any) => !i.pairs_with) || null;
}

// audience 'participant' (الافتراضي): مستوى واحد ملخص دون تفصيل الأبعاد.
// audience 'admin': التفصيل الكامل لكل بُعد.
// هوية المسار: للمشارك اسمه ووصفه فقط، وللإدارة الرمز ومحور الأولوية أيضًا.
const TRACK_FIELDS = 'key, title_ar, summary_ar, focus_ar, journey_ar, priority_dimension';
// المشروع التطبيقي لا يُكتب لكل مسار: يُشتق من فصول وثيقة المبادرة نفسها
async function trackFor(p: any, levels: Record<string, string>, scope: string | null = null) {
  const key = trackKey(levels);
  if (!key) return null;
  const [{ data }, models] = await Promise.all([
    db.from('tracks').select(TRACK_FIELDS).eq('key', key).maybeSingle(),
    db.from('learning_models').select('id, key, dimension, min_level, active, scopes, capstone_sort, title_ar').not('capstone_sort', 'is', null),
  ]);
  const t: any = data || { key };
  const priority = await participantPriority(p.id, levels, t.priority_dimension || null);
  return {
    ...t, priority_dimension: priority, profile: await profileFor(levels, priority), strengths: strengthsLine(levels, priority),
    project: trackProject(models.data || [], levels, scope, priority)?.text || null,
  };
}
// المؤشرات المركّبة من آخر قياس مبدئي مُرسل، لكسر التعادل في محور الأولوية
export async function baselineComposites(participantId: string) {
  const base = await lastBaseline(participantId);
  if (!base) return null;
  const { data } = await db.from('assessment_results').select('dimension, composite_pct').eq('assessment_id', base.id);
  const out = Object.fromEntries((data || []).filter((r: any) => r.composite_pct != null).map((r: any) => [r.dimension, Number(r.composite_pct)]));
  return Object.keys(out).length ? out : null;
}
// محور الأولوية في مسار المشارك: الأضعف مستوى، والتعادل بمؤشراته الفعلية،
// وافتراض المسار (tracks.priority_dimension) حين تغيب المؤشرات.
// يفتح حقول التعمق في نماذجه ويحدد مشروع المسار ووزن المعيار.
export async function participantPriority(participantId: string, levels: Record<string, string>, fallback?: string | null) {
  const key = trackKey(levels);
  if (!key) return null;
  let def = fallback;
  if (def === undefined) {
    const { data } = await db.from('tracks').select('priority_dimension').eq('key', key).maybeSingle();
    def = (data as any)?.priority_dimension || null;
  }
  return priorityFor(levels, await baselineComposites(participantId), def);
}
// المشارك يرى ملف التعريف (العنوان والوصف والرحلة) وسطر أقوى أطره؛ والإدارة
// ترى فوقها عنوان المسار الداخلي ورمزه
const trackView = (t: any, audience: 'participant' | 'admin') => !t ? null : {
  ...(audience === 'admin' ? { key: t.key, priority_dimension: t.priority_dimension || null, track_title: t.title_ar || null, profile_key: t.profile?.key || null } : {}),
  title: t.profile?.title_ar || t.title_ar || null, summary: t.profile?.summary_ar || t.summary_ar || null,
  strengths: t.strengths || null, focus: t.focus_ar || null,
  project: t.project || null, journey: t.profile?.journey_ar || t.journey_ar || null,
};

// الرحلة ونسبة التقدم من مصدر واحد: يستعملها المشارك والإدارة ومنسق الجهة، فلا يرى أحدهم رقمًا غير الآخر
// مصادر التقييم المستمر من جداولها: اختبارات الكتيب، والنماذج المقيَّمة، وتقييم الخبراء، والمعالم بمعيارها، والمختبر
async function continuousFor(participantId: string, milestones: any[], programId: string | null) {
  const [hb, subs, rt, lb, kt, prog, pa] = await Promise.all([
    db.from('handbook_progress').select('quiz_score, quiz_total, completed_at, handbook_modules(title_ar)').eq('participant_id', participantId),
    db.from('model_submissions').select('rating, reviewed_at, updated_at, learning_models(title_ar)').eq('participant_id', participantId).not('rating', 'is', null),
    db.from('expert_ratings').select('overall, comment, created_at, session_id, request_id').eq('participant_id', participantId).eq('direction', 'to_participant'),
    db.from('lab_attempts').select('item_id, pct, finished_at, lab_items(title_ar)').eq('participant_id', participantId).not('finished_at', 'is', null),
    katonEvents(participantId),
    programId ? db.from('programs').select('final_eval').eq('id', programId).maybeSingle() : Promise.resolve({ data: null }),
    // إسهامه في طلبات زملائه كما أكّده الخبير أو صحّحه (المرحلة 8)
    db.from('peer_answers').select('status, confirmed_at, updated_at').eq('author_id', participantId).in('status', ['confirmed', 'corrected']),
  ]);
  const fc = finalConfig((prog as any).data?.final_eval);
  return continuousAssessment({
    quizzes: (hb.data || []).map((q: any) => ({ ...q, title: q.handbook_modules?.title_ar })),
    models: (subs.data || []).map((m: any) => ({ ...m, title: m.learning_models?.title_ar })),
    ratings: (rt.data || []).map((r: any) => ({ ...r, label: r.session_id ? 'جلسة توجيه' : 'استشارة' })),
    milestones: milestones.filter((m: any) => m.done),
    lab: (lb.data || []).map((a: any) => ({ ...a, title: a.lab_items?.title_ar })),
    katon: kt,
    peer: pa.data || [],
    weights: fc.sources, min_events: fc.min_events, min_quiz_items: fc.min_quiz_items,
  });
}

// lite: لوحة الجهة تحسب رحلة كل مشارك عند كل فتح (org-15)، ولا تأخذ منها المجموعة ولا التقييم المستمر،
// فيُتركان (نحو عشرة استعلامات لكل مشارك) والرحلة والتقدم والمعالم كما هي بلا فرق
export async function journeyFor(p: any, { lite = false }: { lite?: boolean } = {}) {
  const [placements, def, progress, assessments, reports, ovr, msRecs, initiative, rated, finals] = await Promise.all([
    db.from('placements').select('dimension, level, approved_at, admin_note').eq('participant_id', p.id),
    journeyDefinition(p),
    db.from('participant_requirements').select('*').eq('participant_id', p.id),
    db.from('assessments').select('id, status, submitted_at, instruments(kind)').eq('participant_id', p.id),
    db.from('reports').select('id, issued_at').eq('participant_id', p.id).not('issued_at', 'is', null),
    db.from('participant_stage_overrides').select('program_id, stage_key, action').eq('participant_id', p.id),
    db.from('participant_milestones').select('milestone_id, done_at, due_override, note, scores').eq('participant_id', p.id),
    initiativeFor(p.id),
    db.from('raters').select('phase').eq('participant_id', p.id).eq('status', 'submitted'),
    // التقييم الختامي مصدر بندين: «استلام التقرير النهائي» في الرحلة، والنتيجة التي تظهر للمشارك بعد اعتمادها
    db.from('final_evaluations').select('program_id, score, decision, status, decided_at, adjust').eq('participant_id', p.id),
  ]);
  const fe = (finals.data || []).find((r: any) => r.program_id === def.program_id) || null;
  const pl = placements.data || [];
  const { levels, approved } = approvalOf(pl);
  const submitted = (kind: string) => (assessments.data || []).some((a: any) => a.status === 'submitted' && a.instruments?.kind === kind);
  const state = {
    profileCompleted: !!p.profile_completed_at,
    hasCv: !!p.cv_path,
    baselineSubmitted: submitted('baseline'),
    placementApproved: approved,
    postSubmitted: submitted('post'),
    // التقرير النهائي يُستلم حين يُعتمد التقييم الختامي فتظهر نتيجته المفصلة (وتعود عند إعادة فتحه)، أو بتقرير صادر في جدوله
    reportIssued: (reports.data || []).length > 0 || fe?.status === 'approved',
    initiativeNamed: !!initiative,
    preRated: (rated.data || []).some((r: any) => r.phase === 'pre'),
    postRated: (rated.data || []).some((r: any) => r.phase === 'post'),
  };
  const prog = Object.fromEntries((progress.data || []).map((r: any) => [r.requirement_id, r]));
  // المحتوى بمستوى الدفعة الموحد إن كانت متجانسة، وإلا بمستوى المشارك؛ القياس والمسار يبقيان من قياسه
  const content = contentLevels(levels, def.cohort) as Record<string, string>;
  const activity = await evidenceFor(p, def.requirements, content, approved, def.cohort?.id || null);
  // تدخل الأدمن في مراحل برنامج المشارك الحالي فقط، وبداية دفعته لشروط الفتح الزمنية
  const overrides = Object.fromEntries((ovr.data || []).filter((o: any) => o.program_id === def.program_id).map((o: any) => [o.stage_key, o.action]));
  const modes = def.cohort?.stage_modes || {};
  const journey = buildJourney({ stages: def.stages.map((s: any) => ({ ...s, work_mode: modes[s.key] || null })), requirements: def.requirements, progress: prog, levels: content, state, activity, overrides, cohortStart: def.cohort?.starts_on || null });
  // المعالم: استحقاقها من جدول الدفعة، واكتمالها من مراحل الرحلة نفسها أو باعتماد يدوي
  const milestones = milestoneStatuses(def.milestones || [], {
    stagesDone: new Set(journey.filter((s: any) => s.status === 'done').map((s: any) => s.key)),
    records: Object.fromEntries((msRecs.data || []).map((r: any) => [r.milestone_id, r])),
    cohort: def.cohort || {},
  });
  const [group, continuous] = lite ? [null, null] : await Promise.all([
    groupOf(p.id, def.cohort?.id || null), continuousFor(p.id, milestones, def.program_id || null),
  ]);
  // التقييم الختامي يظهر للمشارك بعد اعتماده فقط، مع ملاحظات الخبير له (ما ينقصه وكيف يستكمله)
  const final = fe?.status === 'approved'
    ? { score: fe.score, decision: fe.decision, decision_ar: (FINAL_DECISION_AR as Record<string, string>)[fe.decision], decided_at: fe.decided_at, notes: fe.adjust?.notes_to_participant || null } : null;
  // متى أنهى القياس المبدئي: منه موعد اعتماد المسار المعلن (يوما عمل، D04)
  const baselineAt = (assessments.data || []).filter((a: any) => a.status === 'submitted' && a.instruments?.kind === 'baseline').map((a: any) => a.submitted_at).filter(Boolean).sort().at(-1) || null;
  return { pl, levels, approved, def, journey, progress: journeyProgress(journey), milestones, milestone_summary: milestoneSummary(milestones), group, continuous, final, baselineAt };
}

export async function mePayload(p: any, audience: 'participant' | 'admin' = 'participant') {
  const [{ pl, levels, approved, def, journey, progress, milestones, milestone_summary, group, continuous, final, baselineAt }, passkeys, cells, org, payAccess, adv] = await Promise.all([
    journeyFor(p),
    db.from('passkeys').select('id', { count: 'exact', head: true }).eq('participant_id', p.id),
    db.from('grid_cells').select('dimension, level, description_ar, path_title_ar'),
    p.organization_id
      ? db.from('organizations').select('name, short_name, color, status, updated_at, has_logo').eq('id', p.organization_id).maybeSingle().then((r: any) => r.data)
      : null,
    accessOf(p),
    // «مستشارك» (تصور ربط الخبراء بالجهة، المرحلة 2): المستشار الفعلي من advisorOf نفسه الذي يقرر من يقيّمه (خبير مجموعته
    // ثم مستشار دفعته). الاسم وحده بلا بريد، وتعذّر القراءة يخفي السطر ولا يُسقط الرحلة
    audience === 'participant' ? advisorOf(p).catch(() => null) : Promise.resolve(null),
  ]);
  // «كيف تُقيَّم» (D06 وD07): معادلة برنامج المشارك كما تُطبَّق، بلا مفاتيح
  const finalEval = def.program_id ? (await db.from('programs').select('final_eval').eq('id', def.program_id).maybeSingle()).data?.final_eval ?? null : null;
  const fc: any = finalConfig(finalEval);
  const track = trackView(await trackFor(p, levels, p.work_scope || null), audience);
  const cellOf = (d: string, l: string) => (cells.data || []).find((c: any) => c.dimension === d && c.level === l);

  return {
    // ما يحق للمشارك (الدفع أو الرعاية أو الإعفاء): مصدره payments.access وحده
    access: payAccess,
    // حسابات البريد الأخرى (خبير، منسق جهة) لزر التبديل
    switch_to: audience === 'participant' && !p.is_demo ? (await rolesOf(p.email)).filter((d) => d !== 'participant') : [],
    participant: {
      id: p.id, email: p.email, full_name: p.full_name, name_en: p.name_en || null, name_locked: !!p.name_locked_at,
      // تأكيد الاسم قبل الشهادة (7.3)؛ الترحيل 20261110210000 مطبّق على الإنتاج منذ 2026-11-11
      name_confirmed: !!p.name_confirmed_at, phone: p.phone, job_title: p.job_title,
      organization_name: p.organization_name, organization_linked: !!p.organization_id, sector: p.sector, years_experience: p.years_experience, work_scope: p.work_scope || null,
      bio: p.bio, linkedin_url: p.linkedin_url, has_cv: !!p.cv_path, status: p.status, is_demo: !!p.is_demo,
      // null = لم يوافق بعد (يُعرض الإشعار)؛ غياب الحقل = العمود لم يُرحَّل بعد
      consented_at: 'consented_at' in p ? p.consented_at : undefined,
      // D18: لم يوافق قط، أو وافق قبل آخر نسخة جوهرية (يرى ما تغيّر)، أو صدرت نسخة غير جوهرية (شريط)
      consent: 'consented_at' in p ? consentState(p.consent_version, p.consented_at) : undefined,
      org_share: 'org_share_consented_at' in p ? !!p.org_share_consented_at : undefined,
    },
    // المستوى يظهر مبدئيًا فور القياس، ويُعلَّم معتمدًا بعد قرار المستشار
    profile: !pl.length ? null : audience === 'admin' ? {
      approved, track,
      dimensions: pl.map((x: any) => ({
        dimension: x.dimension, level: x.level, approved: !!x.approved_at, note: x.admin_note,
        description: cellOf(x.dimension, x.level)?.description_ar || null,
        path: cellOf(x.dimension, x.level)?.path_title_ar || null,
      })),
    } : { approved, level: overallLevel(levels), track },
    journey: audience === 'admin' ? journey
      : journey.map((st: any) => ({ ...st, items: st.items.map(({ dimension: _d, level: _l, ...it }: any) => participantItem(it, p)) })),
    progress,
    // معالم الرحلة وموقع المشارك منها (المتأخر بعدد أيامه)
    milestones: milestones.map(({ weight: _w, ...m }: any) => (audience === 'admin' ? { ...m, weight: _w } : m)),
    milestone_summary,
    // مجموعته في دفعته، ونمط المشروع
    group, project_mode: def.cohort?.project_mode || 'individual', final,
    advisor: adv ? { full_name: (adv as any).full_name } : null,
    // التقييم المستمر: تكويني يُعرض ولا يحكم. تعليق الخبير للإدارة فقط
    continuous: audience === 'admin' ? continuous
      : continuous && { ...continuous, events: (continuous.events || []).map(({ comment: _c, ...e }: any) => e) },
    // هوية الجهة: يرى المشارك شعارها ولونها بجانب Milestone Impact
    // الشعار نفسه كبير، فيُجلب مرة بـ org.logo ويُخزَّن على الجهاز بنسخته (logo_v)
    org: org && org.status === 'active'
      ? { name: org.name, short_name: org.short_name || null, color: org.color || null, logo_v: org.has_logo ? org.updated_at : null }
      : null,
    // الدفعة: اسمها وتواريخها للمشارك، ومصدرها والبرنامج ونسخته للإدارة
    cohort: !def.cohort || def.cohort.is_default ? null : { name: def.cohort.name, starts_on: def.cohort.starts_on, ends_on: def.cohort.ends_on },
    ...(audience === 'admin' ? { program: { id: def.program_id, cohort: def.cohort, via: def.via, version: def.version } } : {}),
    baseline_submitted_at: baselineAt,
    final_policy: { weights: fc.weights, thresholds: fc.thresholds, measure: { mode: fc.measure.mode, mastery_cut: fc.measure.mastery_cut }, version: fc.version, provisional: true },
    passkeys: passkeys.count ?? 0,
    prompt_passkey: (passkeys.count ?? 0) === 0 && !p.passkey_dismissed_at,
  };
}

export async function me(p: any) {
  // المسجل قبل تسجيل نطاق جهته: يُربط بها عند دخوله التالي، مرة واحدة ويُسجَّل
  if (!p.organization_id && !p.is_demo && p.email_verified_at) {
    const r = await orgByEmail(p.email);
    if (r) {
      const { data } = await db.from('participants').update({ organization_id: r.org.id, org_via: 'domain' }).eq('id', p.id).is('organization_id', null).select('*').maybeSingle();
      if (data) { await audit('system', p.email, 'participant.sponsor-domain', 'organizations', r.org.id); await pinSponsorFor(data.id); p = data; }
    }
  }
  return { success: true, ...(await mePayload(p)) };
}

// ماذا ترى جهتك: صلاحيات المطّلعين النافذين من جهة المشارك مجتمعة، بلا أسمائهم
export async function orgVisibilityFor(p: any) {
  if (!p.organization_id) return { success: true, org: null };
  const { data } = await db.from('org_coordinators').select('status, expires_at, permissions, organizations(name, status)').eq('organization_id', p.organization_id);
  const org = (data || [])[0]?.organizations as any;
  return {
    success: true, org: org?.name || p.organization_name || null, visibility: orgVisibility(data || []),
    share_consented: !!p.org_share_consented_at,
  };
}

export async function orgLogo(p: any) {
  if (!p.organization_id) return { success: true, logo: null };
  const { data } = await db.from('organizations').select('logo, status, updated_at').eq('id', p.organization_id).maybeSingle();
  return { success: true, logo: data?.status === 'active' ? data.logo || null : null, v: data?.updated_at || null };
}

// ── 4. الملف الشخصي ──
const PROFILE_FIELDS: Record<string, number> = {
  full_name: 120, name_en: 120, job_title: 120, organization_name: 200, sector: 120, bio: 2000, linkedin_url: 300,
};

// تأكيد الاسم كما سيُطبع على الشهادة (7.3). يُرفض اسم لا يصلح للشهادة، فيصحّحه صاحبه أولًا من ملفه
export async function confirmName(p: any) {
  if (p.name_locked_at) return { success: true, name_confirmed: true, ...(await mePayload(p)) };
  if (!certNameOk(p.full_name)) throw new Fail('اسمك العربي لا يصلح للشهادة بعد: اسمان على الأقل بالحروف. صحّحه في ملفك ثم أكّده.', 400, 'name');
  if (p.name_en && !certNameEnOk(p.name_en)) throw new Fail('اسمك بالإنجليزية لا يصلح للشهادة بعد: اسمان بالحروف اللاتينية. صحّحه أو احذفه ثم أكّد.', 400, 'name_en');
  const saved = must(await db.from('participants').update({ name_confirmed_at: new Date().toISOString() }).eq('id', p.id).select('*').single());
  await audit('participant', p.id, 'participant.name-confirm', 'participants', p.id, null, { full_name: p.full_name, name_en: p.name_en || null });
  return { success: true, ...(await mePayload(saved)) };
}

export async function profileSave(p: any, b: Body) {
  const f = b.fields || {};
  const patch: Body = {};
  for (const [k, max] of Object.entries(PROFILE_FIELDS)) {
    if (k in f) patch[k] = String(f[k] ?? '').trim().slice(0, max) || null;
  }
  if ('phone' in f) {
    const phone = f.phone ? normalizePhone(f.phone) : null;
    if (f.phone && !phone) throw new Fail('رقم الجوال غير صحيح. اكتبه بصيغة 05XXXXXXXX.');
    patch.phone = phone;
  }
  if ('work_scope' in f) {
    patch.work_scope = SCOPES.includes(f.work_scope) ? f.work_scope : null;
    // النطاق يحدد فصول وثيقة المبادرة، فلا يتغير وهي عند المراجعة أو معتمدة
    if (patch.work_scope !== (p.work_scope || null) && CAPSTONE_LOCKED.includes(await capstoneStatus(p.id))) {
      throw new Fail('نطاق عملك مثبت في وثيقة مبادرتك المسلّمة، ولا يتغير حتى تعود إليك', 409, 'scope_locked');
    }
  }
  if ('years_experience' in f) {
    const y = Number(latinDigits(f.years_experience).trim());
    patch.years_experience = Number.isFinite(y) && y >= 0 && y <= 60 ? Math.round(y) : null;
  }
  // بعد إصدار الشهادة يُقفل الاسم؛ التصحيح بإعادة الإصدار من الإدارة
  if (p.name_locked_at) {
    if (('full_name' in patch && patch.full_name !== p.full_name) || ('name_en' in patch && patch.name_en !== (p.name_en || null))) {
      throw new Fail('اسمك مقفل بعد إصدار الشهادة. لتصحيحه تواصل مع إدارة البرنامج', 409, 'name_locked');
    }
  }
  // الاسم والمسمى يُطبعان على الشهادة ويراهما المنسق: يُفحص ما تغيّر منهما فقط، فلا يُمنع حساب قديم من حفظ غيرهما
  // (التدقيق 2026-11-10، البند 7.3: «OmarManzoma» و«O» حُفظا بلا فحص). الفحص نفسه في الواجهة (logic.js)
  if ('full_name' in patch && patch.full_name !== p.full_name && !certNameOk(patch.full_name)) {
    throw new Fail('اكتب اسمك الكامل كما تريده على الشهادة: اسمان على الأقل، بالحروف دون أرقام أو رموز.', 400, 'name');
  }
  if (patch.name_en && patch.name_en !== (p.name_en || null) && !certNameEnOk(patch.name_en)) {
    throw new Fail('الاسم بالإنجليزية بأحرف لاتينية، واسمان على الأقل', 400, 'name_en');
  }
  if ('job_title' in patch && patch.job_title !== p.job_title && patch.job_title && String(patch.job_title).trim().length < JOB_TITLE_MIN) {
    throw new Fail(`اكتب مسماك الوظيفي (${JOB_TITLE_MIN} أحرف على الأقل)`, 400, 'job_title');
  }
  // تغيير الاسم يلغي تأكيده: يُعرض على صاحبه من جديد قبل أن تصدر به شهادة
  if (('full_name' in patch && patch.full_name !== p.full_name) || ('name_en' in patch && patch.name_en !== (p.name_en || null))) {
    patch.name_confirmed_at = null;
  }
  if (patch.linkedin_url && !/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(patch.linkedin_url)) {
    throw new Fail('رابط LinkedIn غير صحيح');
  }
  const merged = { ...p, ...patch };
  const complete = profileComplete(merged);
  if (complete && !p.profile_completed_at) {
    patch.profile_completed_at = new Date().toISOString();
    if (p.status === 'registered') patch.status = 'profiled';
  }
  const updated = must(await db.from('participants').update(patch).eq('id', p.id).select('*').single());
  return { success: true, ...(await mePayload(updated)) };
}

// رفع السيرة الذاتية أو دليل متطلب: رابط رفع موقّع إلى مخزن خاص
export async function uploadUrl(p: any, b: Body) {
  const purpose = b.purpose === 'cv' ? 'cv' : 'evidence';
  const ext = String(b.ext || '').toLowerCase();
  if (!['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg'].includes(ext)) throw new Fail('نوع الملف غير مدعوم. ارفع PDF أو Word أو Excel أو PowerPoint أو صورة.');
  const path = `${p.id}/${purpose}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Fail('تعذّر رفع الملف. حاول مرة أخرى.', 500);
  return { success: true, path, url: data.signedUrl, token: data.token };
}

export async function cvAttach(p: any, b: Body) {
  const path = String(b.path || '');
  if (!path.startsWith(`${p.id}/cv/`)) throw new Fail(UNEXPECTED_ERROR);
  const updated = must(await db.from('participants').update({ cv_path: path }).eq('id', p.id).select('*').single());
  return { success: true, ...(await mePayload(updated)) };
}

// ── 5. القياس ──
// الأسئلة تُرسل بلا درجات، والخيارات مخلوطة بترتيب ثابت لكل مشارك،
// وكل خيار يحمل فهرسه الأصلي k الذي يُعاد عند الإجابة.
export async function assessmentGet(p: any, b: Body = {}) {
  if (!p.profile_completed_at) throw new Fail('أكمل ملفك الشخصي أولًا', 400, 'profile');
  const kind = b.kind === 'post' ? 'post' : 'baseline';
  if (kind === 'post') await requirePostOpen(p);
  const inst = kind === 'post' ? await postInstrumentFor(p.id) : await activeInstrument(kind);
  if (!inst) throw new Fail(kind === 'post' ? 'القياس البعدي لم يُفعَّل بعد، وسيصلك إشعار حين يُتاح' : 'القياس غير متاح حاليًا', 409, 'no_instrument');

  let { data: a } = await db.from('assessments').select('*').eq('participant_id', p.id).eq('instrument_id', inst.id)
    .neq('status', 'void').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (!a) {
    a = must(await db.from('assessments').insert({ participant_id: p.id, instrument_id: inst.id }).select('*').single());
  }
  let qs = must(await db.from('questions').select('id, dimension, code, tier, text_ar, help_ar, kind, options, sort, retro, form, anchor_code, min_level')
    .eq('instrument_id', inst.id).eq('active', true)) ?? [];
  if (kind === 'post') qs = await postServed(p, qs);
  // أداة بصيغتين: المبدئي صيغة ثابتة للمشارك، والبعدي الصيغة الأخرى
  if (usesForms(qs)) {
    if (!a.form) {
      const prev = kind === 'post' ? (await lastBaseline(p.id))?.form : null;
      a.form = formFor(p.id, prev);
      must(await db.from('assessments').update({ form: a.form }).eq('id', a.id));
    }
    qs = forForm(qs, a.form);
  }
  const answers = must(await db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id)) ?? [];
  // ترتيب العرض من مصدر واحد مع مراجعة الإجابات في اللوحة (servedOrder): الأبعاد بترتيبها، وفي كل
  // بُعد الممارسة ثم المواقف ثم المعرفة، وبنود انتقال التعلم في البعدي آخرًا
  qs = servedOrder(qs);

  return {
    success: true,
    assessment: { id: a.id, kind, status: a.status, est_minutes: inst.est_minutes, intro: inst.intro_ar, title: inst.title_ar },
    // طلب إعادة قائم من الإدارة (retake.js): بطاقة فوق مقدمة القياس بنص البريد نفسه، حتى يسلّم القياس الجديد
    retake: kind === 'baseline' ? await retakeNotice(p.id, inst.est_minutes ?? null) : null,
    questions: qs.map((q: any) => {
      // na يميّز "لا ينطبق" في مقياس التكرار فقط، فلا يكشف إجابة صحيحة
      const opts = (q.options || []).map((o: any, k: number) => ({ k, label: o.label, ...(q.kind === 'likert' && Number(o.score) < 0 ? { na: true } : {}) }));
      return {
        id: q.id, dimension: q.dimension, tier: q.tier, text: q.text_ar, help: q.help_ar, kind: q.kind, retro: !!q.retro,
        // مقياس التكرار يبقى بترتيبه الطبيعي، والاختيارات تُخلط
        options: q.kind === 'likert' ? opts : seededShuffle(opts, p.id + q.id),
      };
    }),
    answers: Object.fromEntries(answers.map((x: any) => [x.question_id, x.value?.k])),
    before: Object.fromEntries(answers.filter((x: any) => x.value?.before != null).map((x: any) => [x.question_id, x.value.before])),
  };
}

// طلب الإعادة القائم للمشارك بعنوانه ونصه، من قياساته المبدئية نفسها (لا جدول تنبيهات)
export async function retakeNotice(participantId: string, minutes: number | null) {
  const { data, error } = await db.from('assessments').select('status, submitted_at, retake_requested_at, retake_reason, instruments!inner(kind)')
    .eq('participant_id', participantId).eq('instruments.kind', 'baseline');
  if (error) return null;
  const open = openRetake(data || []);
  return open ? { title: RETAKE_TITLE, text: retakeText(open.reason, minutes), requested_at: open.requested_at } : null;
}

// ما يُقدَّم في القياس البعدي: فقرات المستوى حتى المستوى المعتمد في كل بُعد،
// والتوأم بدل المشترك (أو الأصل لربع المشاركين لتقدير أثر التكرار).
// العرض والإجابة والإرسال كلها تمر من هنا فتُحسب الدرجة على ما قُدِّم فقط.
export async function postServed(p: any, qs: any[]) {
  const pl = must(await db.from('placements').select('dimension, level, approved_at').eq('participant_id', p.id)) ?? [];
  const levels = Object.fromEntries(pl.filter((x: any) => x.approved_at).map((x: any) => [x.dimension, x.level]));
  return servedPost(qs, { levels, repeat: anchorRepeat(p.id) });
}

// القياس البعدي يُفتح حين يصل المشارك إلى مرحلة التقييم في رحلته
export async function requirePostOpen(p: any) {
  const st = await mePayload(p);
  if (!st.profile?.approved) throw new Fail('يُفتح القياس البعدي بعد اعتماد مسارك', 403, 'locked');
  const stage = st.journey.find((s: any) => s.items.some((i: any) => i.code === 'E-POST'));
  if (stage && stage.status === 'locked') throw new Fail('يُفتح القياس البعدي حين تصل إلى مرحلة التقييم', 403, 'locked');
}

async function openAssessment(p: any, id: string) {
  const a = must(await db.from('assessments').select('*').eq('id', id).eq('participant_id', p.id).maybeSingle());
  if (!a) throw new Fail(UNEXPECTED_ERROR, 404);
  if (a.status !== 'in_progress') throw new Fail('القياس مُرسَل من قبل', 400, 'submitted');
  return a;
}

export async function assessmentAnswer(p: any, b: Body) {
  const a = await openAssessment(p, String(b.assessment_id));
  const q = must(await db.from('questions').select('*').eq('id', String(b.question_id)).eq('instrument_id', a.instrument_id).maybeSingle());
  if (!q || (q.form && a.form && q.form !== a.form)) throw new Fail(UNEXPECTED_ERROR);
  const { data: inst } = await db.from('instruments').select('kind').eq('id', a.instrument_id).maybeSingle();
  if (inst?.kind === 'post') {
    const all = must(await db.from('questions').select('id, code, dimension, anchor_code, min_level').eq('instrument_id', a.instrument_id).eq('active', true)) ?? [];
    if (!(await postServed(p, all)).some((x: any) => x.id === q.id)) throw new Fail(UNEXPECTED_ERROR);
  }
  const k = Number(b.k);
  const score = scoreFor(q, k);
  if (!Number.isInteger(k) || score == null) throw new Fail(UNEXPECTED_ERROR);
  // القياس الرجعي: تقدير "قبل البرنامج" بجانب تقدير الآن، ولا يدخل في الدرجة
  let before: number | null = null;
  if (q.retro && b.before != null) {
    before = Number(b.before);
    if (!Number.isInteger(before) || scoreFor(q, before) == null) throw new Fail(UNEXPECTED_ERROR);
  }
  must(await db.from('assessment_answers').upsert({
    assessment_id: a.id, question_id: q.id, value: q.retro ? { k, before } : { k }, score, answered_at: new Date().toISOString(),
  }));
  return { success: true };
}

export async function assessmentSubmit(p: any, b: Body) {
  const a = await openAssessment(p, String(b.assessment_id));
  const [qs, ans, model] = await Promise.all([
    db.from('questions').select('*').eq('instrument_id', a.instrument_id).eq('active', true),
    db.from('assessment_answers').select('question_id, value').eq('assessment_id', a.id),
    db.from('placement_model').select('*').eq('id', 1).maybeSingle(),
  ]);
  const { data: inst } = await db.from('instruments').select('kind').eq('id', a.instrument_id).maybeSingle();
  let questions = a.form ? forForm(qs.data || [], a.form) : (qs.data || []);
  // البعدي يُتحقق من اكتماله ويُحسب على المجموعة نفسها التي عُرضت
  if (inst?.kind === 'post') questions = await postServed(p, questions);
  const answers = Object.fromEntries((ans.data || []).map((x: any) => [x.question_id, x.value?.k]));
  const missing = questions.filter((q: any) => answers[q.id] == null).length;
  if (missing) throw new Fail(`بقي ${missing} من الأسئلة دون إجابة`, 400, 'incomplete');
  if (inst?.kind === 'post') return postSubmit(p, a, questions, ans.data || [], model.data || null);

  // «لا ينطبق» لعبارة واحدة على الأكثر في كل قسم من الممارسة: أكثر من ذلك
  // يُسقط الممارسة من المؤشر ويعيد توزيع وزنها صامتًا (ملحق التدقيق 1، #1). الرد يسمّي العبارات الزائدة
  // فتنتقل الشاشة إلى أولها بدل أن يبحث عنها المشارك سؤالًا سؤالًا (فحص الجاهزية p-entry-2)
  const naOver = behaviorNaExcess(questions, answers);
  if (naOver.length) throw new Fail(BEHAVIOR_NA_MESSAGE, 400, 'too_many_na', { question_ids: naOver });
  // المعيار المركّب وحده، من جدوله أو من قيمه الافتراضية في logic.js
  const result = placementFromAnswers(questions, answers, [], model.data || DEFAULT_MODEL);
  const split = skillSplit(questions, answers);
  const now = new Date().toISOString();
  must(await db.from('assessment_results').upsert(result.map((r: any) => ({
    assessment_id: a.id, dimension: r.dimension, level: r.level,
    skill_anchor_pct: split[r.dimension]?.anchor ?? null, skill_form_pct: split[r.dimension]?.form ?? null,
    // الدرجة هي المؤشر المركّب نفسه حتى لا يختلف رقم التقرير عن سبب المستوى
    score: r.composite ?? Math.round(((r.knowledge ?? 0) + (r.skill ?? 0) + (r.behavior ?? 0)) / 3 * 100) / 100,
    knowledge_pct: r.knowledge, skill_pct: r.skill, behavior_pct: r.behavior,
    ...(r.composite !== undefined ? { composite_pct: r.composite, borderline: r.borderline, reason_ar: reasonWithFlags(r) } : {}),
  }))));
  // مستوى مبدئي، لا يُكتب فوق مستوى اعتمده المستشار
  const { data: current } = await db.from('placements').select('dimension, approved_at').eq('participant_id', p.id);
  // حساب العرض: يُعتمد مستواه فورًا فتظهر رحلته في الورشة دون انتظار المستشار
  const auto = p.is_demo ? { approved_at: now, approved_by: 'عرض توضيحي' } : { approved_at: null, approved_by: null };
  const locked = new Set((current || []).filter((c: any) => c.approved_at).map((c: any) => c.dimension));
  const fresh = result.filter((r: any) => !locked.has(r.dimension));
  if (fresh.length) {
    must(await db.from('placements').upsert(fresh.map((r: any) => ({
      participant_id: p.id, dimension: r.dimension, level: r.level, source: 'assessment',
      assessment_id: a.id, decided_at: now, ...auto,
    }))));
  }
  await db.from('assessments').update({ status: 'submitted', submitted_at: now }).eq('id', a.id);
  // مؤشر الجهد يُحفظ على القياس بعد احتساب المستوى وحفظه (effort.ts): استشاري للمراجع، لا يدخل ما سبق، وتعذّره لا يُسقط الإرسال
  await saveEffort({ id: a.id, instrument_id: a.instrument_id, started_at: a.started_at, submitted_at: now }).catch((e) => console.error('effort:', e));
  const updated = must(await db.from('participants').update({ status: locked.size === 3 || p.is_demo ? 'placed' : 'pending_approval' })
    .eq('id', p.id).select('*').single());
  await audit('participant', p.id, 'assessment.submit', 'assessments', a.id, null, result);
  return { success: true, ...(await mePayload(updated)) };
}

// القياس البعدي: النتيجة تُحفظ للمقارنة، ولا تغيّر المستوى المعتمد ولا الرحلة.
// "لا ينطبق" في الآن يُغني عن تقدير ما قبل البرنامج.
async function postSubmit(p: any, a: any, questions: any[], rows: any[], model: any) {
  const values = Object.fromEntries(rows.map((x: any) => [x.question_id, x.value || {}]));
  const answers = Object.fromEntries(rows.map((x: any) => [x.question_id, x.value?.k]));
  const noBefore = questions.filter((q: any) => q.retro && (scoreFor(q, answers[q.id]) ?? 0) >= 0 && values[q.id]?.before == null).length;
  if (noBefore) throw new Fail(`بقي تقدير "قبل البرنامج" في ${noBefore} من العبارات`, 400, 'incomplete');
  const served = questions.filter((q: any) => q.tier !== 'transfer');
  // فرق القبلي والبعدي على الفقرات العامة وحدها؛ فقرات المستوى تُحفظ منفصلة
  const scored = served.filter((q: any) => !levelGated(q));
  const gains: any = levelGains(served, answers);
  const m = model || DEFAULT_MODEL;
  const result = placementFromAnswers(scored, answers, [], m);
  const minBehavior = Number(m.min_behavior_items ?? DEFAULT_MODEL.min_behavior_items);
  const before: any = beforePercents(scored, values, { minBehavior });
  const split = skillSplit(scored, answers);
  // الممارسة على العبارات المجابة في القياسين معًا
  let common: Record<string, any> = {};
  const base = await lastBaseline(p.id);
  if (base) {
    const [bq, ba] = await Promise.all([
      db.from('questions').select('id, code, dimension, tier, options').eq('instrument_id', base.instrument_id).eq('tier', 'behavior'),
      db.from('assessment_answers').select('question_id, value').eq('assessment_id', base.id),
    ]);
    const preAnswers = Object.fromEntries((ba.data || []).map((x: any) => [x.question_id, x.value?.k]));
    common = commonBehavior(bq.data || [], preAnswers, scored, answers, { minBehavior });
  }
  must(await db.from('assessment_results').upsert(result.map((r: any) => ({
    assessment_id: a.id, dimension: r.dimension, level: r.level, score: r.composite ?? 0,
    knowledge_pct: r.knowledge, skill_pct: r.skill, behavior_pct: r.behavior,
    composite_pct: r.composite, borderline: r.borderline, reason_ar: r.reason,
    behavior_before_pct: before[r.dimension]?.behavior ?? null,
    skill_anchor_pct: split[r.dimension]?.anchor ?? null, skill_form_pct: split[r.dimension]?.form ?? null,
    behavior_common_pct: common[r.dimension]?.post ?? null, behavior_pre_common_pct: common[r.dimension]?.pre ?? null,
    level_gain_pct: gains[r.dimension]?.pct ?? null, level_gain_n: gains[r.dimension]?.n ?? null, level_gain_level: gains[r.dimension]?.level ?? null,
  }))));
  await db.from('assessments').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', a.id);
  await audit('participant', p.id, 'assessment.submit-post', 'assessments', a.id, null, result);
  return { success: true, ...(await mePayload(p)) };
}

// ── 6. متطلبات الرحلة ──
// المشارك يُنجز ما يخصه فقط، في مرحلته الحالية أو ما قبلها.
export async function requirementUpdate(p: any, b: Body) {
  const { r } = await requirementFor(p, b.requirement_id).catch(() => { throw new Fail(UNEXPECTED_ERROR, 404); });
  if (r.kind === 'auto' || r.kind === 'meeting' || r.code in AUTO_CHECKS) throw new Fail('هذا المتطلب يُحدَّث تلقائيًا أو من المستشار');
  if (VERIFIED_KINDS.includes(r.kind)) throw new Fail('هذا النشاط يُوثَّق بإنجازه الفعلي لا بالتأشير');
  const state = await mePayload(p);
  const stage = state.journey.find((s: any) => s.key === r.stage_key);
  if (!stage || stage.status === 'locked') throw new Fail('هذه المرحلة لم تُفتح بعد', 400, 'locked');
  if (!stage.items.some((i: any) => i.id === r.id)) throw new Fail('هذا المتطلب لا يخص مسارك');

  // الاستبانة تكتمل بإجاباتها لا بنقرة، وتُعدَّل ما دامت المرحلة مفتوحة
  if (r.kind === 'survey') {
    // الاستبانة المنتظرة للحضور لا تُرسل (7.8): الحكم من الرحلة نفسها (gateSurveys)، لا من الواجهة
    const waits = stage.items.find((i: any) => i.id === r.id)?.waits;
    if (waits) throw new Fail(waits, 409, 'survey_waits');
    const s: any = cleanSurvey(r.config, b.answers);
    if (s.error) throw new Fail(s.error);
    must(await db.from('participant_requirements').upsert({
      participant_id: p.id, requirement_id: r.id, status: 'done', answers: s.answers, completed_at: new Date().toISOString(),
    }));
    return { success: true, ...(await mePayload(p)) };
  }
  const evidence = b.evidence_path ? String(b.evidence_path) : null;
  if (evidence && !evidence.startsWith(`${p.id}/evidence/`)) throw new Fail(UNEXPECTED_ERROR);
  if (r.kind === 'upload' && !evidence) throw new Fail('ارفع الملف أولًا');
  const undo = b.undo === true && !r.needs_review;
  const status = undo ? 'pending' : r.needs_review ? 'submitted' : 'done';
  must(await db.from('participant_requirements').upsert({
    participant_id: p.id, requirement_id: r.id, status,
    evidence_path: evidence, note: b.note ? String(b.note).slice(0, 1000) : null,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }));
  return { success: true, ...(await mePayload(p)) };
}

export async function passkeyDismiss(p: any) {
  await db.from('participants').update({ passkey_dismissed_at: new Date().toISOString() }).eq('id', p.id);
  return { success: true };
}

// ── 7. الكتيب الشخصي ──
// يُفتح بعد اعتماد المستوى. المحتوى يُرسل بابًا بابًا بعد تصفيته بمستوى
// المشارك، ويُسجَّل كل فتح في handbook_views. العرض في المتصفح رسم على
// لوحة (canvas) بعلامة مائية باسم المشارك، فلا نص قابل للنسخ في الصفحة.
const HANDBOOK_VIEWS_PER_HOUR = 120;

export async function approvedLevels(p: any) {
  const a = approvalOf(must(await db.from('placements').select('dimension, level, approved_at').eq('participant_id', p.id)) ?? []);
  if (!a.approved) throw new Fail('يُفتح كتيبك بعد اعتماد مسارك', 403, 'locked');
  return contentLevelsFor(p, a.levels as Record<string, string>);
}

// نقاط المشارك ولقبه من سجل النقاط
export async function pointsOf(participantId: string) {
  const rows = must(await db.from('points_ledger').select('source, ref_id, points, note, created_at')
    .eq('participant_id', participantId).order('created_at', { ascending: false })) ?? [];
  const total = rows.reduce((a: number, r: any) => a + (r.points || 0), 0);
  return { total, rank: rankFor(total), ledger: rows };
}

// يمنح النقاط مرة واحدة لكل إنجاز (قيد فريد على المصدر والمرجع)
export async function award(participantId: string, source: string, refId: string, points: number, note: string) {
  if (!points) return 0;
  const { error } = await db.from('points_ledger').insert({ participant_id: participantId, source, ref_id: refId, points, note });
  if (!error) return points;
  // المنح المكرر يمنعه القيد الفريد (23505) وهذا مقصود؛ أي خطأ آخر يُسجَّل فلا تضيع النقاط بصمت
  if (error.code !== '23505') {
    console.error('award', { participantId, source, refId, error });
    await audit('system', null, 'points.award-failed', 'points_ledger', participantId, null, { source, ref_id: refId, points, code: error.code, message: error.message }).catch(() => {});
  }
  return 0;
}

export async function handbookToc(p: any) {
  const levels = await approvedLevels(p);
  const [mods, prog, models, subs, pts, reads] = await Promise.all([
    db.from('handbook_modules').select('id, dimension, chapter_key, sort, title_ar, min_level, body_md, quiz_md'),
    db.from('handbook_progress').select('module_id, quiz_score, quiz_total, completed_at').eq('participant_id', p.id),
    db.from('learning_models').select('id, dimension, sort, min_level, active, points, scopes'),
    db.from('model_submissions').select('model_id, status').eq('participant_id', p.id),
    pointsOf(p.id),
    db.from('reading_progress').select('module_id, words, active_seconds, slices').eq('participant_id', p.id),
  ]);
  const chapters = handbookModulesFor(must(mods) ?? [], levels);
  const done = Object.fromEntries((prog.data || []).map((r: any) => [r.module_id, r]));
  const read = Object.fromEntries((reads.data || []).map((r: any) => [r.module_id, r]));
  const mine = modelsFor(models.data || [], levels, p.work_scope);
  const submitted = new Set((subs.data || []).filter((s: any) => s.status !== 'draft').map((s: any) => s.model_id));
  return {
    success: true,
    level: overallLevel(levels),
    // الكتاب عام: يُعرض رمز المسار فقط
    code: trackKey(levels),
    chapters: chapters.map((m: any) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, quiz: quizFor(m.quiz_md, levels[m.dimension], p.work_scope).length,
      done: done[m.id] ? { score: done[m.id].quiz_score, total: done[m.id].quiz_total, at: done[m.id].completed_at } : null,
      // تعريف واحد لإتمام الباب مع الرحلة (readingStatus): قراءة فعلية ثم الاختبار. الكتيب كان يعدّ الاختبار وحده
      // فيقول «أتممت 1 من 22» والرحلة «قرأت 0 من 22» (التدقيق 2026-11-10، البند 7.2)
      ...chapterCompletion(readingVerdict(read[m.id]), !!done[m.id]),
    })),
    models: { total: mine.length, submitted: mine.filter((m: any) => submitted.has(m.id)).length,
      points: mine.reduce((a: number, m: any) => a + (m.points || 0), 0) },
    points: { total: pts.total, rank: pts.rank },
    name: p.full_name,
  };
}

export async function handbookChapter(p: any, b: Body, ctx: Ctx) {
  const levels = await approvedLevels(p);
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count } = await db.from('handbook_views').select('id', { count: 'exact', head: true })
    .eq('participant_id', p.id).gte('viewed_at', hourAgo);
  if ((count ?? 0) >= HANDBOOK_VIEWS_PER_HOUR) throw new Fail('فتحت صفحات كثيرة خلال ساعة، تابع بعد قليل', 429, 'rate');
  const m = must(await db.from('handbook_modules').select('*').eq('id', String(b.id)).maybeSingle());
  if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
  await db.from('handbook_views').insert({ participant_id: p.id, module_id: m.id, ip: ctx.ip, user_agent: ctx.ua });
  const [{ data: done }, { data: rd }] = await Promise.all([
    db.from('handbook_progress').select('*').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle(),
    db.from('reading_progress').select('words, active_seconds, slices').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle(),
  ]);
  return {
    success: true,
    reading: readingVerdict(rd),
    chapter: { id: m.id, dimension: m.dimension, chapter_key: m.chapter_key, title: m.title_ar, md: filterHandbookMd(m.body_md, levels[m.dimension], p.work_scope) },
    // الأسئلة بلا الإجابات الصحيحة، وخياراتها مخلوطة بترتيب ثابت لهذا المشارك؛ التصحيح على الخادم فقط
    quiz: shuffleQuiz(quizFor(m.quiz_md, levels[m.dimension], p.work_scope), p.id + m.id).map((q: any) => ({ q: q.q, options: q.options })),
    reflection: m.reflection_ar || '',
    done: done ? { score: done.quiz_score, total: done.quiz_total, reflection: done.reflection, at: done.completed_at } : null,
    watermark: `${p.full_name} · ${p.email}`,
  };
}

// نسخة شخصية PDF من الكتاب: أبواب المسار نفسها المصفّاة بمستوى المشارك،
// برقم إصدار يُطبع في العلامة المائية لكل صفحة. ثلاث نسخ يوميًا.
const HANDBOOK_EXPORTS_PER_DAY = 3;
export async function handbookExport(p: any, ctx: Ctx) {
  const levels = await approvedLevels(p);
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('handbook_exports').select('id', { count: 'exact', head: true })
    .eq('participant_id', p.id).gte('created_at', dayAgo);
  if ((count ?? 0) >= HANDBOOK_EXPORTS_PER_DAY) throw new Fail('بلغت حد النسخ اليومي (3 نسخ). تتاح نسخة جديدة بعد 24 ساعة', 429, 'rate');
  const [mods, models] = await Promise.all([
    db.from('handbook_modules').select('id, dimension, chapter_key, sort, title_ar, min_level, body_md, reflection_ar'),
    db.from('learning_models').select('*'),
  ]);
  const chapters = handbookModulesFor(must(mods) ?? [], levels);
  if (!chapters.length) throw new Fail('لا أبواب في كتيبك بعد', 404);
  const now = new Date();
  const ref = `MI-BK-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomToken(8).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5).padEnd(5, 'X')}`;
  must(await db.from('handbook_exports').insert({ ref, participant_id: p.id, chapters: chapters.length, ip: ctx.ip, user_agent: ctx.ua }));
  await audit('participant', p.email, 'handbook.export', 'participants', p.id, null, { ref, chapters: chapters.length });
  return {
    success: true,
    book: {
      // الكتاب عام: لا شيء من بيانات المسار إلا رمزه
      ref, issued_at: now.toISOString(), name: p.full_name, email: p.email, code: trackKey(levels),
      chapters: chapters.map((m: any) => ({ id: m.id, dimension: m.dimension, title: m.title_ar, md: filterHandbookMd(m.body_md, levels[m.dimension], p.work_scope), reflection: m.reflection_ar || '' })),
      tools: modelsFor(models.data || [], levels, p.work_scope).map((m: any) => ({ dimension: m.dimension, title: m.title_ar, summary: m.summary_ar || '', when: m.when_ar || '', steps: m.steps_ar || '', source: m.source_ar || '' })),
    },
  };
}

// إتمام الباب: يصحح الاختبار، ويحفظ التأمل، ويمنح النقاط أول مرة فقط
export async function handbookComplete(p: any, b: Body) {
  const levels = await approvedLevels(p);
  const m = must(await db.from('handbook_modules').select('id, dimension, min_level, body_md, quiz_md, title_ar').eq('id', String(b.id)).maybeSingle());
  if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
  // بالترتيب نفسه الذي عُرض به، فرقم الإجابة ورقم الصحيحة في النتيجة من القائمة المعروضة
  const quiz = shuffleQuiz(quizFor(m.quiz_md, levels[m.dimension], p.work_scope), p.id + m.id);
  const g = gradeQuiz(quiz, b.answers);
  if (quiz.length && (!Array.isArray(b.answers) || b.answers.length < quiz.length || b.answers.some((x: any) => x === null || x === undefined))) {
    throw new Fail('أجب عن كل الأسئلة أولًا');
  }
  const reflection = String(b.reflection || '').trim().slice(0, 4000) || null;
  const { data: prev } = await db.from('handbook_progress').select('quiz_score, quiz_total').eq('participant_id', p.id).eq('module_id', m.id).maybeSingle();
  // أول محاولة هي التي تُحتسب؛ الإعادة للتعلم وتحديث التأمل فقط
  if (prev) await db.from('handbook_progress').update({ reflection }).eq('participant_id', p.id).eq('module_id', m.id);
  else {
    // D02: إصدار الدفعة وبصمة الاختبار والإجابات نصًا (السؤال والخيار المختار)، لتصويب عادل لا ينقص أحدًا.
    // الختم إلزامي: null لدفعة بلا إصدار وحدها، وخطأ القراءة أو الحفظ يرمي فلا تُحفظ نتيجة بلا ختمها
    const row = { participant_id: p.id, module_id: m.id, quiz_score: g.score, quiz_total: g.total, reflection };
    const stamp = { content_release: (await releaseOf(p))?.id ?? null, quiz_fingerprint: await sha256Hex(String(m.quiz_md || '')),
      quiz_answers: quiz.map((x: any, i: number) => ({ q: x.q, a: x.options[Number(b.answers?.[i])] ?? null })) };
    must(await db.from('handbook_progress').insert({ ...row, ...stamp }));
  }
  const gained = prev ? 0 : await award(p.id, 'chapter', m.id, chapterPoints(g.score, reflection), m.title_ar);
  const pts = await pointsOf(p.id);
  return { success: true, ...g, first: !prev, counted: prev || { quiz_score: g.score, quiz_total: g.total }, gained, points: { total: pts.total, rank: pts.rank } };
}

// ── 8. النماذج التعليمية ──
async function myModel(p: any, id: unknown) {
  const levels = await approvedLevels(p);
  const m = must(await db.from('learning_models').select('*').eq('id', String(id || '')).maybeSingle());
  if (!m || !modelsFor([m], levels, p.work_scope).length) throw new Fail('هذا النموذج لا يخص مسارك', 404);
  // الحقول كما تخص المشارك: بمستواه في بُعد النموذج ونطاق عمله
  const priority = await participantPriority(p.id, levels);
  return { ...m, fields: fieldsFor(m.fields, levels[m.dimension], p.work_scope, m.dimension === priority) };
}

// اسم المبادرة من مصدره الوحيد: بطاقة المبادرة في مكتبة النماذج
export async function initiativeFor(participantId: string) {
  const { data } = await db.from('model_submissions').select('answers, learning_models!inner(key)')
    .eq('participant_id', participantId).eq('learning_models.key', CHARTER_KEY).maybeSingle();
  return initiativeOf((data as any)?.answers);
}

// فصول الوثيقة تُقفل ما دامت الوثيقة عند المستشار أو الراعي أو معتمدة
export const CAPSTONE_LOCKED = ['submitted', 'accepted', 'approved'];
export async function capstoneStatus(participantId: string) {
  const { data } = await db.from('capstones').select('status').eq('participant_id', participantId).maybeSingle();
  return (data as any)?.status || 'draft';
}

export async function modelsList(p: any) {
  const levels = await approvedLevels(p);
  const [models, subs, pts, priority] = await Promise.all([
    db.from('learning_models').select('id, dimension, key, sort, title_ar, icon, summary_ar, min_level, points, active, fields, scopes, capstone_sort'),
    db.from('model_submissions').select('model_id, status, rating, bonus, answers, submitted_at, updated_at').eq('participant_id', p.id),
    pointsOf(p.id),
    participantPriority(p.id, levels),
  ]);
  const by = Object.fromEntries((subs.data || []).map((s: any) => [s.model_id, s]));
  return {
    success: true,
    // تقدم كل نموذج: الحقول الإلزامية المكتملة من مجموعها، دون إرسال الإجابات نفسها
    models: modelsFor(must(models) ?? [], levels, p.work_scope).map(({ fields: all, scopes: _s, capstone_sort, ...m }: any) => {
      const fields = fieldsFor(all, levels[m.dimension], p.work_scope, m.dimension === priority);
      const sub = by[m.id];
      const total = fields.filter((f: any) => f.required !== false).length;
      const filled = total - missingFields(fields, sub?.answers || {}).length;
      return { ...m, capstone: capstone_sort != null, fields_n: fields.length, progress: { filled, total },
        submission: sub ? { status: sub.status, rating: sub.rating, bonus: sub.bonus, submitted_at: sub.submitted_at, updated_at: sub.updated_at } : null };
    }),
    points: { total: pts.total, rank: pts.rank },
  };
}

// الجداول المستوردة: صفوف المصدر بأعمدة هذا الجدول، ليستوردها المشارك بنقرة
async function importsFor(p: any, fields: any[]) {
  const want = fields.filter((f: any) => f.type === 'table' && f.import?.model);
  if (!want.length) return {};
  const keys = [...new Set(want.map((f: any) => f.import.model))];
  const { data } = await db.from('model_submissions').select('answers, learning_models!inner(key, title_ar, fields)')
    .eq('participant_id', p.id).in('learning_models.key', keys);
  const src = Object.fromEntries((data || []).map((r: any) => [r.learning_models.key, r]));
  const out: Record<string, any> = {};
  for (const f of want) {
    const s = src[f.import.model];
    const sf = (s?.learning_models?.fields || []).find((x: any) => x.key === f.import.field);
    out[f.key] = { model: f.import.model, title: s?.learning_models?.title_ar || null,
      rows: s && sf ? importRows(f.columns, sf.columns, s.answers?.[f.import.field]) : [] };
  }
  return out;
}

export async function modelGet(p: any, b: Body) {
  const m = await myModel(p, b.id);
  const [{ data: sub }, initiative, status] = await Promise.all([
    db.from('model_submissions').select('*').eq('participant_id', p.id).eq('model_id', m.id).maybeSingle(),
    initiativeFor(p.id),
    m.capstone_sort != null ? capstoneStatus(p.id) : null,
  ]);
  const submission = sub ? { ...sub, answers: bindAnswers(m.fields, sub.answers, m.key === CHARTER_KEY ? null : initiative) } : null;
  return {
    success: true, model: m, submission, initiative,
    imports: await importsFor(p, m.fields),
    capstone: m.capstone_sort != null ? { status, locked: CAPSTONE_LOCKED.includes(status as string) } : null,
  };
}

// حفظ مسودة أو تسليم نهائي؛ التسليم يمنح نقاط النموذج مرة واحدة
export async function modelSave(p: any, b: Body) {
  const m = await myModel(p, b.id);
  const [{ data: prev }, initiative, status] = await Promise.all([
    db.from('model_submissions').select('id, status').eq('participant_id', p.id).eq('model_id', m.id).maybeSingle(),
    m.key === CHARTER_KEY ? null : initiativeFor(p.id),
    m.capstone_sort != null ? capstoneStatus(p.id) : null,
  ]);
  if (prev?.status === 'reviewed') throw new Fail('قُيّم هذا النموذج ولا يمكن تعديله');
  if (CAPSTONE_LOCKED.includes(status as string)) throw new Fail('هذا فصل في وثيقة مبادرتك، وهي عند المراجعة أو معتمدة فلا يُعدَّل الآن', 409, 'capstone_locked');
  // الحقل المربوط باسم المبادرة لا يُكتب هنا: يأتي من بطاقة المبادرة دائمًا
  const answers = bindAnswers(m.fields, cleanAnswers(m.fields, b.answers), initiative);
  const submit = !!b.submit;
  if (submit) {
    const missing = missingFields(m.fields, answers);
    if (missing.length) throw new Fail(`أكمل قبل التسليم: ${missing.join('، ')}`, 400, 'incomplete');
  }
  const row: Body = { participant_id: p.id, model_id: m.id, answers, updated_at: new Date().toISOString() };
  if (submit) Object.assign(row, { status: 'submitted', submitted_at: new Date().toISOString() });
  else if (!prev) row.status = 'draft';
  const saved = must(await db.from('model_submissions').upsert(row, { onConflict: 'participant_id,model_id' }).select('*').single());
  const gained = submit ? await award(p.id, 'model', m.id, m.points, m.title_ar) : 0;
  if (submit) notifyAdvisor(p, m.title_ar).catch(() => {});
  const pts = await pointsOf(p.id);
  return { success: true, submission: saved, gained, points: { total: pts.total, rank: pts.rank } };
}

export async function achievements(p: any) {
  await approvedLevels(p);
  const pts = await pointsOf(p.id);
  return { success: true, ...pts };
}
