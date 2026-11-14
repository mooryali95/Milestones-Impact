// ════════════════════════════════════════════════════════════════
// أساسيات leaders-api: الاتصال، التشفير، الردود، البريد
// ════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { STUCK_MAIL_SUBJECT, stuckMailText } from './onboarding.js';
import { RETAKE_BUTTON, RETAKE_MAIL_SUBJECT, RETAKE_TITLE, retakeText } from './retake.js';
import { alertWebhook, esc, MAIL_FROM_DEFAULT, type MailAttachment, mailButton, mailCode, mailCounts, type MailKind, mailNote, mailRows, mailShell, mailText, type MailFamily, sendCounted } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { passOk, reserveAttempt, signPass } from './guards.js';
import { POLICY_DIGEST } from './policy-digest.js';
import { POLICY_MATERIAL_VERSION } from './labels.js';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;

export const CONFIG = {
  url: env('SUPABASE_URL'),
  serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  // ملح الهاش للرموز والتوكنات. سر مستقل حتى لا يكفي تسريب القاعدة وحده.
  pepper: env('LEADERS_TOKEN_PEPPER'),
  appUrl: env('LEADERS_APP_URL', SITES.leaders),
  coordinatorDays: 14,
  rpId: env('LEADERS_RP_ID', 'leaders.sunkvalue.com'),
  rpName: 'Milestone Impact',
  origins: env('LEADERS_ORIGINS', SITES.leaders).split(',').map((s) => s.trim()),
  // لوحة الإدارة تنادي نفس الدالة؛ مسموحة في CORS فقط وليست أصلًا لمفاتيح المرور
  adminOrigins: env('LEADERS_ADMIN_ORIGINS', SITES.admin).split(',').map((s) => s.trim()),
  resendKey: env('RESEND_API_KEY'),
  // سر يرسله المجدول (pg_cron) لتشغيل التذكيرات؛ بدونه لا يعمل الإجراء
  cronSecret: env('LEADERS_CRON_SECRET'),
  // توقيع webhook منصات الحجز (دالة leaders-hooks)
  calcomSecret: env('LEADERS_CALCOM_SECRET'),
  calendlyKey: env('LEADERS_CALENDLY_KEY'),
  mailFrom: env('LEADERS_MAIL_FROM', MAIL_FROM_DEFAULT),
  // تقرير الصحة الأسبوعي والتنبيه الفوري يصلان إلى هذا البريد (المالك)
  alertEmail: env('LEADERS_ALERT_EMAIL'),
  // التحقق البشري (Cloudflare Turnstile) قبل كل رمز بالبريد: إلزامي، وبلا المفتاحين يفشل مغلقًا (المرحلة ل1)
  turnstileSecret: env('LEADERS_TURNSTILE_SECRET'),
  turnstileSite: env('LEADERS_TURNSTILE_SITE_KEY'),
  // سقف يومي لرسائل الرموز من هذه الدالة، فيبقى من حصة البريد ما يكفي للإدارة
  mailDailyCap: Number(env('LEADERS_MAIL_DAILY_CAP', '80')) || 80,
  // تسجيلات جديدة من شبكة واحدة في اليوم: يتسع لقاعة ورشة؛ يُرفع قبل ورشتين على شبكة واحدة
  registerPerIpDay: Number(env('LEADERS_REGISTER_PER_IP_DAY', '60')) || 60,
  // الجلسة تتجدد بالاستعمال، وتنتهي بعد أسبوعين من آخر نشاط
  sessionDays: 14,
  codeMinutes: 15,
};

// سران إلزاميان: بدونهما لا شيء يعمل، والفشل عند الإقلاع أوضح من فشل صامت لاحقًا (docs/SECRETS.md)
if (!CONFIG.serviceKey || !CONFIG.pepper) throw new Error('leaders-api: SUPABASE_SERVICE_ROLE_KEY وLEADERS_TOKEN_PEPPER إلزاميان، انظر docs/SECRETS.md');

export const db = createClient(CONFIG.url, CONFIG.serviceKey, {
  db: { schema: 'leaders' },
  auth: { persistSession: false },
});

// المخطط العام: لجلسات الإدارة (api_sessions) والتخزين فقط
export const publicDb = createClient(CONFIG.url, CONFIG.serviceKey, { auth: { persistSession: false } });
export const storage = publicDb.storage;
export const BUCKET = 'leaders-private';

// ── الردود ──
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && CONFIG.origins.concat(CONFIG.adminOrigins).includes(origin) ? origin : CONFIG.origins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // الطلب التمهيدي (OPTIONS) يُخزَّن في المتصفح يومًا بدل أن يسبق كل طلب إلى الخادم (التدقيق 2026-11-10، البند 8.1).
  // المتصفحات تقصره على حدها (Chrome ساعتان)، وهو مكسب لكل البوابات
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

export class Fail extends Error {
  constructor(message: string, public status = 400, public code = 'bad_request', public extra: Record<string, unknown> = {}) { super(message); }
}

export function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(req.headers.get('origin')) },
  });
}

export const preflight = (req: Request) => new Response('ok', { headers: cors(req.headers.get('origin')) });

export const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

// ── التشفير ──
const enc = new TextEncoder();

// بصمة محتوى بلا فلفل (D02): تُقارن ببصمات بيان الإصدار في المستودع
export async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hash(value: string) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(CONFIG.pepper + ':' + value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

// bytea عبر PostgREST يُكتب ويُقرأ نصًا سداسيًا يبدأ بـ \x
export const toBytea = (u: Uint8Array) => '\\x' + Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
export function fromBytea(s: string) {
  const hex = s.startsWith('\\x') ? s.slice(2) : s;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function must<T>(res: { data: T; error: unknown }, msg = 'تعذّر تنفيذ العملية'): T {
  if (res.error) {
    console.error(res.error);
    throw new Fail(msg, 500, 'db_error');
  }
  return res.data;
}

// كل الصفوف بصفحات من 1000: القراءة الواحدة تُقطع عند حد Supabase (max rows) دون خطأ،
// فالإحصاءات المجمّعة تُقرأ بهذه دائمًا. build يبني الاستعلام من جديد لكل صفحة.
export async function all(build: (from: number, to: number) => any, msg?: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await build(from, from + 999), msg) as any[] ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// صفوف مجموعة مشاركين، بدفعات من 150 معرّفًا كي لا يتجاوز الرابط حده.
// ids = null تعني الكل بلا تصفية، وهو أخف من تمرير كل المعرّفات.
export async function allFor(ids: string[] | null, make: () => any, col = 'participant_id') {
  if (!ids) return all((f, t) => make().range(f, t));
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const part = ids.slice(i, i + 150);
    out.push(...await all((f, t) => make().in(col, part).range(f, t)));
  }
  return out;
}

// السجل ليس اختياريًا: إن تعذّر إدراج الأثر فشلت العملية برمز audit_failed ويُبلَّغ المالك فورًا،
// بدل أن يضيع الأثر بصمت (الملحق 4، R6). من يعدّ الأثر ثانويًا يلتقط الخطأ صراحةً (award، alertOps).
export async function audit(actorType: 'admin' | 'participant' | 'system' | 'coordinator', actor: string | null, action: string,
  entity: string, entityId: string | null, before: unknown = null, after: unknown = null) {
  const { error } = await db.from('audit_log').insert({ actor_type: actorType, actor, action, entity, entity_id: entityId, before, after });
  if (error) {
    console.error('leaders-api: audit insert failed', action, error.message);
    throw new Fail('تعذّر تسجيل العملية في السجل، فلم تكتمل. حاول بعد قليل.', 500, 'audit_failed', { action });
  }
}

// سجل الموافقات التاريخي (D18): سطر لا يُكتب فوقه بالنسخة وبصمة نص الوثائق، وهو دليل الموافقة.
// تعذّر كتابته يرمي، فيفشل الطلب قبل أثره في السجل ولا تُعد الموافقة مسجلة بلا دليلها.
export type ConsentSubject = 'participant' | 'coordinator' | 'expert' | 'rater';
export async function logConsent(subject: ConsentSubject, subjectId: string, kind: 'accept' | 'renew' | 'org_share_on' | 'org_share_off') {
  const { error } = await db.from('consent_events').insert({ subject, subject_id: subjectId, kind, version: POLICY_DIGEST.version, text_digest: POLICY_DIGEST.sha256 });
  if (error) {
    console.error('consent_events insert:', error.message);
    throw new Fail('تعذّر تسجيل موافقتك الآن، حاول بعد قليل', 503, 'consent_unavailable');
  }
}
// سطر الموافقة عند أول دخول للمنسق والخبير (D18): مطلوب إن لم يُسجَّل له قبول لآخر نسخة جوهرية.
// تعذّر القراءة يرمي، فلا يُعفى أحد من الموافقة بعطل
export async function consentNeeded(subject: ConsentSubject, subjectId: string) {
  const { data, error } = await db.from('consent_events').select('id').eq('subject', subject).eq('subject_id', subjectId).gte('version', POLICY_MATERIAL_VERSION).limit(1);
  if (error) {
    console.error('consent_events read:', error.message);
    throw new Fail('تعذّر التحقق من الموافقة الآن، حاول بعد قليل', 503, 'consent_unavailable');
  }
  return !data?.length;
}

// ── البريد ──
// القالب من المصدر الموحّد (_shared/mail.ts)؛ هنا رسائل البرنامج فقط
export { mailButton };
// كل رسالة تحمل عائلتها (السطر الإنجليزي فوق العنوان) وسطر معاينة صندوق الوارد
const shell = (family: MailFamily, title: string, body: string, preheader = '', footnote?: string) =>
  mailShell(title, body, { family, preheader, ...(footnote != null ? { footnote } : {}) });
const hello = (name: string | null | undefined) => (name ? `أهلًا ${esc(name)}،` : 'أهلًا،');

// حساب العرض التوضيحي: نطاق بريد لا يستقبل، ولا تُرسل إليه رسالة من أي مسار (الحارس هنا لا في كل موضع)
export const DEMO_MAIL_DOMAIN = 'demo.milestone-impact.org';
export const isDemoMail = (to: string) => String(to || '').trim().toLowerCase().endsWith(`@${DEMO_MAIL_DOMAIN}`);

// كل بريد يمر بالعداد الموحد (D15): kind يحدد نصيبه من السقف، وref الكيان المرتبط (مشارك أو مقيّم) بلا عنوان.
// الجماعي (bulk) حين تُحجب حصته يدخل الطابور ولا يفشل، وتفرغه المهمة الساعية (drainMailQueue).
export async function sendMail(to: string, subject: string, html: string, attachments: MailAttachment[] = [], { kind = 'notify', ref = null }: { kind?: MailKind; ref?: string | null } = {}) {
  if (isDemoMail(to)) { console.info('leaders-api: mail to the demo account skipped:', subject); return; }
  if (!CONFIG.resendKey) throw new Fail('خدمة البريد غير مهيأة', 503, 'mail_unconfigured');
  const r = await sendCounted(db, to, subject, html, { kind, source: 'leaders-api', ref, cap: CONFIG.mailDailyCap, key: CONFIG.resendKey, from: CONFIG.mailFrom, attachments });
  if (r.ok) return;
  if (r.reason === 'mail_cap' || r.reason === 'mail_share') {
    if (kind === 'bulk' && !attachments.length && await enqueueMail(to, subject, html, ref)) return;
    throw new Fail('بلغت الرسائل حدها اليومي، وتصل بعد ساعات', 429, 'mail_cap');
  }
  throw new Fail('تعذّر إرسال البريد، حاول بعد قليل', 502, 'mail_failed');
}

async function enqueueMail(to: string, subject: string, html: string, ref: string | null) {
  const { error } = await db.from('mail_queue').insert({ to_email: to, subject, html, ref, kind: 'bulk' });
  if (error) { console.error('mail_queue insert:', error); return false; }
  return true;
}

// من المهمة الساعية: يرسل المعلّق بالترتيب ما دامت الحصة تسمح، ويكتب العلامة بعد نجاح الإرسال وحده
export const QUEUE_MAX_ATTEMPTS = 5;
export async function drainMailQueue(limit = 40) {
  const { data, error } = await db.from('mail_queue').select('id, to_email, subject, html, ref, attempts')
    .is('sent_at', null).is('gave_up_at', null).order('created_at').limit(limit);
  if (error) return { sent: 0, pending: null };
  let sent = 0;
  for (const m of data || []) {
    const r = await sendCounted(db, m.to_email, m.subject, m.html, { kind: 'bulk', source: 'leaders-api', ref: m.ref, cap: CONFIG.mailDailyCap, key: CONFIG.resendKey, from: CONFIG.mailFrom });
    if (r.ok) { await db.from('mail_queue').update({ sent_at: new Date().toISOString() }).eq('id', m.id); sent++; continue; }
    if (r.reason === 'mail_cap' || r.reason === 'mail_share') break;   // الحصة: تُستأنف في الساعة التالية
    const attempts = (m.attempts || 0) + 1;
    await db.from('mail_queue').update({ attempts, last_error: r.reason, ...(attempts >= QUEUE_MAX_ATTEMPTS ? { gave_up_at: new Date().toISOString() } : {}) }).eq('id', m.id);
  }
  const { count } = await db.from('mail_queue').select('id', { count: 'exact', head: true }).is('sent_at', null).is('gave_up_at', null);
  return { sent, pending: count ?? 0 };
}

// ── الدخول ──
export function signInMail(name: string, code: string, link: string, isNew: boolean) {
  return shell('access', isNew ? 'أكمل تسجيلك في برنامج القادة' : 'رمز الدخول إلى رحلتك',
    mailText(`${hello(name)} اضغط الزر للمتابعة، أو أدخل الرمز في الصفحة التي طلبته منها.`)
    + mailButton(link, isNew ? 'تأكيد التسجيل' : 'الدخول الآن')
    + mailCode(code, `صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.`),
    `رمزك ${code} · صالح ${CONFIG.codeMinutes} دقيقة`);
}

// ── الرحلة ──
// قرار المستشار على بند أو نموذج: أُعيد للتعديل، أو اعتُمد
export function reviewMail(name: string, title: string, returned: boolean, note?: string | null) {
  return shell('journey', returned ? 'ملاحظة من المستشار على عملك' : 'اعتُمد عملك',
    mailText(`${hello(name)} ${returned ? `راجع المستشار «${esc(title)}» وطلب تعديلًا قبل اعتماده.` : `راجع المستشار «${esc(title)}» واعتمده. أحسنت، خطوة أخرى في رحلتك.`}`)
    + (returned && note ? mailNote(esc(note)) : '')
    + mailButton(CONFIG.appUrl, 'افتح رحلتي'),
    returned ? `ملاحظة على «${title}» قبل اعتماده` : `اعتُمد «${title}»`);
}

export function reminderMail(name: string, open: number) {
  return shell('journey', 'رحلتك بانتظارك',
    mailText(`${hello(name)} لديك ${open} ${open === 1 ? 'خطوة مفتوحة' : 'خطوات مفتوحة'} في رحلتك القيادية. بضع دقائق اليوم تقرّبك من المرحلة التالية.`)
    + mailButton(CONFIG.appUrl, 'أكمل رحلتي'),
    `${open} ${open === 1 ? 'خطوة مفتوحة' : 'خطوات مفتوحة'} في رحلتك`);
}

// تذكير المتعثر قبل الاعتماد بما بقي عليه هو (onboarding.js stuckMailText): يرسله المدير لمن يختارهم
export function stuckMail(name: string, text: string) {
  return shell('journey', 'خطوة واحدة لتبدأ رحلتك', mailText(`${hello(name)} ${esc(text)}`) + mailButton(CONFIG.appUrl, 'أكمل الآن'), text);
}

// ملاحظة أو تنبيه أو إشادة مرئية للمشارك (observations.ts): النص نفسه الذي تعرضه بطاقته في الموقع
export function observationMail(name: string, heading: string, body: string) {
  return shell('journey', esc(heading), mailText(`${hello(name)} ${esc(body)}`) + mailButton(CONFIG.appUrl, 'افتح رحلتي'), body.slice(0, 140));
}

// طلب إعادة القياس: النص نفسه الذي تعرضه بطاقة الموقع (retake.js retakeText)
export function retakeMail(name: string, text: string) {
  return shell('journey', RETAKE_TITLE, mailText(`${hello(name)} ${esc(text)}`) + mailButton(CONFIG.appUrl, RETAKE_BUTTON), text);
}

// pay: يبقى رسم البرنامج (D04)، فيحمل البريد رابط الدفع وصفحته تعرض المسار المعتمد والسعر وسياسة الاسترداد
export function approvedMail(name: string, pay = false) {
  return pay
    ? shell('journey', 'اعتُمد مسارك، وبقيت خطوة واحدة',
      mailText(`${hello(name)} راجع المستشار نتيجتك واعتمد مسارك في البرنامج. تجد في الصفحة مسارك المعتمد بأبوابه ونماذجه وساعاته، ومعه رسم البرنامج وسياسة الاسترداد.`)
      + mailButton(CONFIG.appUrl, 'راجع مسارك وأكمل التسجيل'),
      'مسارك المعتمد ورسم البرنامج بانتظارك')
    : shell('journey', 'اعتُمد مستواك، ورحلتك مفتوحة الآن',
      mailText(`${hello(name)} راجع المستشار نتيجتك واعتمد مستواك في البرنامج. تجد ملف كفاءتك ومرحلتك الأولى بانتظارك.`)
      + mailButton(CONFIG.appUrl, 'افتح رحلتي'),
      'ملف كفاءتك ومرحلتك الأولى بانتظارك');
}

// بريد كل قرار ختامي بخطوته التالية (D05)
export const FINAL_MAIL_SUBJECT: Record<string, string> = {
  pass: 'اجتزت برنامج القادة', pass_notes: 'اجتزت برنامج القادة بملاحظات', extend: 'تقييمك الختامي: خطوتك التالية', fail: 'نتيجة تقييمك الختامي',
};
// held: لم تصدر الشهادة مع الاعتماد (الإصدار التلقائي متوقف أو تعذّر)، فلا يَعِد البريد بها
export function finalDecisionMail(name: string, decision: string, notes: string | null, { held = false }: { held?: boolean } = {}) {
  const notYet = 'لم تصدر شهادة الإتمام بنجاح بعد، ولك أن تسأل عنها بالرد على هذه الرسالة.';
  const next: Record<string, string> = {
    pass: held ? `اعتُمد تقييمك الختامي بقرار «اجتاز». ${notYet}`
      : 'اعتُمد تقييمك الختامي بقرار «اجتاز». تصلك شهادة الإتمام بنجاح في رسالة مستقلة، وتجدها في رحلتك.',
    pass_notes: held ? `اعتُمد تقييمك الختامي بقرار «اجتاز بملاحظات». ${notYet} وملاحظات المقيّم أدناه لتطويرك بعد البرنامج.`
      : 'اعتُمد تقييمك الختامي بقرار «اجتاز بملاحظات». تصلك شهادة الإتمام بنجاح في رسالة مستقلة، وملاحظات المقيّم أدناه لتطويرك بعد البرنامج.',
    extend: 'اعتُمد تقييمك الختامي بقرار «يُمدَّد». لا تصدر الشهادة الآن، ويُفتح لك ما ينقصك لتستكمله، وتجد أدناه ما يلزم. يُعاد تقييمك حين تستكمله.',
    fail: 'اعتُمد تقييمك الختامي بقرار «لم يجتز». لا تصدر شهادة إتمام. يمكنك طلب مراجعة القرار من لجنة لم تشارك فيه بالرد على هذه الرسالة خلال عشرة أيام عمل، ولجهتك أن تطلب إفادة بساعات حضورك.',
  };
  return shell('journey', FINAL_MAIL_SUBJECT[decision] || 'نتيجة تقييمك الختامي',
    mailText(`${hello(name)} ${next[decision] || 'اعتُمد تقييمك الختامي.'}`)
    + (notes ? mailNote(esc(notes)) : '')
    + mailButton(CONFIG.appUrl, 'افتح رحلتي'),
    FINAL_MAIL_SUBJECT[decision] || 'نتيجة تقييمك الختامي');
}

// تذكير من اعتُمد مساره ولم يُكمل التسجيل، بعد 3 أيام ثم 7 (D04)
export function payReminderMail(name: string, days: number) {
  return shell('journey', 'مسارك المعتمد بانتظارك',
    mailText(`${hello(name)} اعتُمد مسارك قبل ${days} أيام، وبقي إكمال التسجيل لتُفتح رحلتك. إن كان لديك سؤال عن المسار أو الرسم فرُدّ على هذه الرسالة.`)
    + mailButton(CONFIG.appUrl, 'أكمل التسجيل'),
    'خطوة واحدة تفتح رحلتك');
}

// ── بريد الدفع (payments-ledger.js NOTIFY): كل واحد خلف مفتاح في اللوحة، مغلق حتى يفتحه المدير ──
export function paymentReceiptMail(name: string, item: string, amount: string, order: string | null, next: string) {
  return shell('journey', 'وصلنا دفعك',
    mailText(`${hello(name)} تأكد دفعك، وهذا ملخصه لسجلك.`)
    + mailRows([['البند', item], ['المبلغ', amount], ...(order ? [['رقم الطلب', order] as [string, string]] : [])])
    + mailText(esc(next))
    + mailButton(CONFIG.appUrl, 'افتح رحلتك'),
    'تأكيد الدفع', 'إيصال الدفع الرسمي يصلك من مزوّد الدفع Creem على البريد نفسه.');
}
export function paymentRefundMail(name: string, item: string, amount: string) {
  return shell('journey', 'استُردّت دفعتك',
    mailText(`${hello(name)} استُردّت دفعتك، ويعود المبلغ إلى وسيلة الدفع نفسها خلال أيام بحسب مصرفك.`)
    + mailRows([['البند', item], ['المبلغ', amount]])
    + mailText('أُقفل ما فتحه هذا الدفع في حسابك. إن كان الاسترداد خطأ أو لديك سؤال فردّ على هذه الرسالة.'),
    'استرداد دفعة');
}
export function paymentAbandonMail(name: string, item: string) {
  return shell('journey', 'دفعك لم يكتمل',
    mailText(`${hello(name)} فتحت صفحة الدفع لـ«${esc(item)}» ولم تكتمل العملية، ولم يُخصم منك شيء. إن واجهت مشكلة في الدفع فردّ على هذه الرسالة ونساعدك.`)
    + mailButton(CONFIG.appUrl, 'أكمل الدفع'),
    'خطوة واحدة باقية');
}
export function paymentOwnerMail(what: string, rows: [string, string][]) {
  return shell('admin', what, mailRows(rows) + mailButton(`${SITES.admin}/#/leaders/payments`, 'افتح المدفوعات'), what);
}

// إخطار النسخة الجوهرية (D18): ما تغيّر بنصه من POLICY_CHANGES، ورابط السجل والسياسة، وأن الموافقة تُطلب عند الدخول
export function policyChangeMail(name: string, version: string, items: readonly string[]) {
  return shell('journey', 'حدّثنا سياسة الخصوصية وشروط البرنامج',
    mailText(`${hello(name)} نشرنا النسخة ${esc(version)} من سياسة الخصوصية وشروط برنامج القادة، وفيها تغيير جوهري نطلب عنده موافقتك مجددًا عند دخولك القادم. ما تغيّر:`)
    + items.map((t) => mailText(`• ${esc(t)}`)).join('')
    + mailButton(`${CONFIG.appUrl}/legal/changes`, 'اقرأ سجل التغييرات'),
    'ما تغيّر في سياسة الخصوصية والشروط');
}

export function certificateMail(name: string, url: string) {
  return shell('journey', 'مبارك، صدرت شهادة إتمامك بنجاح',
    mailText(`${hello(name)} اعتُمد تقييمك الختامي، وصدرت باسمك «شهادة إتمام بنجاح» لبرنامج القادة.`)
    + mailText('تجدها في رحلتك جاهزة للطباعة والحفظ PDF، ولها رابط تحقق عام يمكنك مشاركته أو إضافته إلى ملفك في LinkedIn.')
    + mailButton(url, 'اعرض شهادتي'),
    'شهادتك جاهزة برابط تحقق عام');
}

// اعتُمد التقييم الختامي والشهادة تنتظر تأكيد الاسم كما سيُطبع عليها (7.3)
export function nameConfirmMail(name: string, url: string) {
  return shell('journey', 'اعتُمد تقييمك الختامي: أكّد اسمك لتصدر شهادتك',
    mailText(`${hello(name)} اعتُمد تقييمك الختامي بنجاح. بقيت خطوة واحدة: راجع اسمك كما سيُطبع على الشهادة وأكّده، فتصدر فورًا.`)
    + mailText('الشهادة تحمل رقم تحقق عامًا، والاسم يُقفل بعد صدورها، فراجعه بالعربية والإنجليزية.')
    + mailButton(url, 'راجع اسمي وأكّده'),
    'خطوة واحدة قبل صدور شهادتك');
}

// phase 'pre': تقدير الممارسة الحالية قبل بدء البرنامج، ويُعاد بعده للمقارنة.
// phase 'f360': تقييم 360 للتطوير (تصور 2026-11-11): تقدير واحد لكل عبارة، ووعد الإخفاء بحسب مجموعة المقيّم
// (feedbackPromiseAr في feedback360.js)، والمهلة نافذة الدورة لا 30 يومًا.
export function raterMail(rater: string | null, who: string, link: string, phase: 'pre' | 'post' | 'f360' = 'post', f360?: { promise: string; closes: string; reminder?: boolean }) {
  if (phase === 'f360' && f360) {
    return shell('journey', f360.reminder ? `تذكير: تقديرك لـ${who}` : `طلب تقدير من ${who}`,
      mailText(`${hello(rater)} ${f360.reminder ? `لم يصلنا تقديرك بعد لـ${esc(who)}، والنافذة تُغلق ${esc(f360.closes)}.` : `يشارك ${esc(who)} في برنامج القادة من Milestone Impact، ورشّحك مستشاره لتقييم 360 للتطوير: مرآة لممارسته يناقشها معه في جلسة توجيه، ولا تدخل أي تقييم أو شهادة.`}`)
      + mailText('عبارات قصيرة تقدّر كلًّا منها كما رأيته في الأشهر الثلاثة الأخيرة، و«لا أستطيع الحكم» لما لم تشهده، ثم ثلاثة أسئلة اختيارية. يستغرق ذلك نحو عشر دقائق.')
      + mailText(esc(f360.promise))
      + mailButton(link, 'ابدأ التقدير')
      + mailNote(`الرابط خاص بك وصالح حتى ${esc(f360.closes)}. نحفظ اسمك وبريدك وصلتك به وتقديرك لتقرير تطويري له وحده، وتجد إشعار الخصوصية كاملًا في <a href="${CONFIG.appUrl}/legal/privacy">سياسة الخصوصية</a>.`),
      `عشر دقائق لتقييم 360 لـ${who}`, '');
  }
  const pre = phase === 'pre';
  return shell('journey', `طلب تقدير من ${who}`,
    mailText(`${hello(rater)} يشارك ${esc(who)} في برنامج القادة من Milestone Impact، ${pre ? 'ويطلب تقديرك لممارسته الحالية في العمل قبل أن يبدأ البرنامج.' : 'ويطلب تقديرك لتغير ممارسته في العمل خلال البرنامج.'}`)
    + mailText(pre
      ? 'عبارات قصيرة تقدّر كلًّا منها مرة واحدة كما رأيته في الأشهر الثلاثة الأخيرة، وسنطلب منك التقدير نفسه بعد البرنامج لنقارن. يستغرق ذلك نحو ثلاث دقائق، ولا يظهر تقديرك له منفردًا.'
      : 'عبارات قصيرة، لكل منها تقديران: كيف يمارسها الآن، وكيف كان قبل البرنامج. يستغرق ذلك نحو خمس دقائق، ولا يظهر تقديرك له منفردًا.')
    + mailButton(link, 'ابدأ التقدير')
    + mailNote(`الرابط خاص بك وصالح 30 يومًا. نحفظ اسمك وبريدك وصلتك به وتقديرك لقياس أثر البرنامج وحده، وتجد إشعار الخصوصية كاملًا في <a href="${CONFIG.appUrl}/legal/privacy">سياسة الخصوصية</a>.`),
    `${pre ? 'ثلاث' : 'خمس'} دقائق لتقدير ممارسة ${who}`, '');
}

// ── تقييم 360 للتطوير: رسائل الدورة (المستشار يعتمد القائمة ويسلّم التقرير في جلسة) ──
export const FEEDBACK_MAIL = {
  list: { subject: (who: string) => `قائمة مقيّمي 360 بانتظار اعتمادك: ${who}` },
  returned: { subject: () => 'أعاد مستشارك قائمة مقيّمي 360 بملاحظة' },
  ready: { subject: (who: string) => `تقرير 360 جاهز لجلسة الاستلام: ${who}` },
  released: { subject: () => 'تقرير 360 الخاص بك متاح الآن' },
} as const;
export function feedbackMail(kind: keyof typeof FEEDBACK_MAIL, name: string | null, who: string, opts: { note?: string | null; url: string }) {
  const body = {
    list: mailText(`${hello(name)} رشّح ${esc(who)} مقيّميه لتقييم 360، والقائمة بانتظار اعتمادك بصفتك مستشاره. تأكد من تنوعها (المدير والزملاء والفريق وأصحاب المصلحة)، ومن أن فيها من يختلف معه لا المادحين وحدهم.`),
    returned: mailText(`${hello(name)} أعاد مستشارك قائمة مقيّميك بملاحظة: ${esc(opts.note || '')}. عدّلها وأرسلها مرة أخرى.`),
    ready: mailText(`${hello(name)} أُغلقت نافذة تقييم 360 لـ${esc(who)}، وتقريره جاهز لتطّلع عليه قبل جلسة الاستلام. لا يراه المشارك حتى تسلّمه له في الجلسة.`),
    released: mailText(`${hello(name)} سلّمك مستشارك تقرير 360: ما يراه فيك مديرك وزملاؤك وفريقك مقارنة بتقديرك، وملاحظاتهم المكتوبة بلا نسبة إلى أحد. للتطوير وحده، ولا يدخل أي تقييم أو شهادة.`),
  }[kind];
  const cta = { list: 'راجع القائمة واعتمدها', returned: 'عدّل القائمة', ready: 'اقرأ التقرير', released: 'افتح تقريرك' }[kind];
  return shell('journey', (FEEDBACK_MAIL[kind].subject as (w: string) => string)(who), body + mailButton(opts.url, cta), '');
}

// D19: مقيّم بانتظار تأكيد المستشار أو المنسق قبل إرسال دعوته، بلا عنوانه في البريد
export function raterConfirmMail(who: string, why: string, url: string) {
  return shell('journey', 'مقيّم بانتظار تأكيدك',
    mailText(`دعا ${esc(who)} مقيّمًا لتقدير أثره، وبريده يحتاج تأكيدك قبل إرسال الدعوة: ${esc(why)}.`)
    + mailText('تأكد أن المقيّم من يعمل معه فعلًا (مديره أو زميله أو أحد فريقه)، فتقديره يدخل حكم «تغير مؤكد» وتقرير الأثر للجهة.')
    + mailButton(url, 'راجع وأكّد'),
    'تأكيد مقيّم قبل إرسال دعوته');
}

export function raterRejectedMail(name: string, rater: string, reason: string) {
  return shell('journey', 'لم يُعتمد أحد مقيّميك',
    mailText(`${hello(name)} لم يُعتمد ${esc(rater)} مقيّمًا لأثرك، والسبب: ${esc(reason)}.`)
    + mailText('ادعُ مقيّمًا آخر ممن يعملون معك، ويُفضَّل ببريد جهتك.')
    + mailButton(CONFIG.appUrl, 'افتح رحلتك'),
    'ادعُ مقيّمًا آخر');
}

// ── الجلسات ──
// تذكير قبل الجلسة بيوم، ومعه رابطها إن كانت عن بعد
export function sessionReminderMail(name: string, when: string, expert: string | null, joinUrl: string | null) {
  return shell('sessions', 'جلستك غدًا',
    mailText(`${hello(name)} نذكّرك بجلسة التوجيه${expert ? ` مع ${esc(expert)}` : ''}.`)
    + mailRows([['الموعد', when], ...(expert ? [['الخبير', expert] as [string, string]] : []), ...(joinUrl ? [['الرابط', joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(joinUrl || CONFIG.appUrl, joinUrl ? 'رابط الجلسة' : 'افتح رحلتي')
    + mailNote('جهّز سؤالًا أو موقفًا من عملك هذا الأسبوع، فالجلسة على قدر ما تحمله إليها.'),
    `${when}${expert ? ` · مع ${expert}` : ''}`, '');
}

// دعوة جلسة الورشة وتذكيراها (قبل يوم وقبل ساعة): الموعد والمكان أو الرابط، والقاعة تُفتح من التطبيق
export const WORKSHOP_MAIL = {
  invite: { subject: 'دعوة: جلستك التدريبية', lead: 'ندعوك إلى الجلسة التدريبية القادمة في برنامجك.', note: 'أضف الموعد إلى تقويمك من المرفق. يوم الجلسة افتح «القاعة» في التطبيق من جوالك لتعرف فريقك وطاولتك.' },
  day: { subject: 'جلستك التدريبية غدًا', lead: 'نذكّرك بجلستك التدريبية غدًا.', note: 'أحضر جوالك مشحونًا، فالمشاركة في الجولات من تطبيقك، وبها يُحتسب حضورك.' },
  hour: { subject: 'جلستك التدريبية بعد ساعة', lead: 'جلستك التدريبية تبدأ بعد نحو ساعة.', note: 'افتح «القاعة» في التطبيق حين تصل، وادخلها لتظهر لزملائك وللخبير.' },
} as const;
export function workshopMail(kind: keyof typeof WORKSHOP_MAIL, name: string, title: string, when: string, where: string | null, joinUrl: string | null) {
  const m = WORKSHOP_MAIL[kind];
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', title], ['الموعد', when], ...(where ? [['المكان', where] as [string, string]] : []), ...(joinUrl ? [['الرابط', joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح رحلتي')
    + mailNote(m.note),
    `${title} · ${when}`, '');
}

// طلب حذف البيانات: تأكيد لصاحب الحساب بالمهلة وطريقة السحب (privacy.ts)
export const ERASE_MAIL_SUBJECT = 'استلمنا طلب حذف بياناتك';
export function eraseRequestMail(name: string, days: number) {
  return shell('access', ERASE_MAIL_SUBJECT,
    mailText(`${hello(name)} سجّلنا طلبك حذف حسابك وبياناتك من منصة Milestone Impact.`)
    + mailText(`ننفذه خلال ${days} يومًا على الأكثر، ويصلك تأكيد عند تنفيذه. ما يُلزمنا النظام بحفظه (سجلات الدفع) يبقى للمدة النظامية وحدها.`)
    + mailButton(CONFIG.appUrl, 'افتح ملفي')
    + mailNote('إن لم تطلب ذلك أو غيّرت رأيك فاسحب الطلب من صفحة ملفك في التطبيق قبل تنفيذه. بعد التنفيذ لا تُسترد البيانات.'),
    'طلب حذف البيانات', 'وصلتك هذه الرسالة لأن طلب حذف سُجّل من حسابك.');
}

// دخول من جهاز جديد: تنبيه لصاحب الحساب مع طريقة إنهاء الجلسة إن لم يكن هو
export function newDeviceMail(name: string, device: string, when: string) {
  return shell('access', 'دخول جديد إلى حسابك',
    mailText(`${hello(name)} سُجّل دخول إلى رحلتك من جهاز لم تستعمله من قبل.`)
    + mailRows([['الجهاز', device], ['الوقت', when]])
    + mailNote('إن كان أنت فلا شيء عليك. وإن لم يكن: افتح ملفك › «أجهزتك» وأنهِ الجلسات الأخرى.')
    + mailButton(`${CONFIG.appUrl}/?tab=profile`, 'أجهزتك'),
    `${device} · ${when}`, '');
}

// ── الجهة ──
// دعوة المنسق: رسالة الترحيب الوحيدة التي تصل الجهة، فتحمل كل ما يبدأ به: رابط تسجيل موظفيه، ومقاعد العقد ومدته، وخطواته الأولى
export type OrgInviteInfo = { invite_code?: string | null; seats?: number | null; contract_starts?: string | null; contract_ends?: string | null };
const contractDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' });
export const orgJoinUrl = (code?: string | null) => (code ? `${CONFIG.appUrl}/j/${encodeURIComponent(code)}` : null);
export function coordinatorInviteMail(name: string | null, org: string, info: OrgInviteInfo = {}) {
  const join = orgJoinUrl(info.invite_code);
  const term = info.contract_starts && info.contract_ends ? `${contractDay(info.contract_starts)} إلى ${contractDay(info.contract_ends)}`
    : info.contract_ends ? `حتى ${contractDay(info.contract_ends)}` : null;
  const rows: [string, unknown, boolean?][] = [
    ...(join ? [['رابط تسجيل موظفيكم', join, true] as [string, unknown, boolean]] : []),
    ...(info.seats ? [['مقاعد العقد', `${info.seats} مقعدًا`] as [string, unknown]] : []),
    ...(term ? [['مدة العقد', term] as [string, unknown]] : [])];
  const steps = [
    'ادخل لوحة الجهة من الزر أدناه، برمز يصل إلى هذا البريد، بلا كلمة مرور.',
    ...(join ? ['أرسل رابط التسجيل إلى من ترشّحهم جهتك. من يسجّل منه يظهر في دفعة جهتك، وتغطي الجهة رسومه ما دام العقد ساريًا وفيه مقعد شاغر.'] : []),
    'تابع من اللوحة تقدّم مشاركيك بما تتيحه صلاحياتك، ويصلك ملخص أسبوعي بالبريد.',
  ];
  return shell('organization', `لوحة ${org} في برنامج القادة`,
    mailText(`${hello(name)} أُنشئ لك حساب منسق لجهة ${esc(org)} في برنامج القادة.`)
    + (rows.length ? mailRows(rows) : '')
    + mailText('<b>خطواتك الأولى</b>')
    + mailText(steps.map((t, i) => `${i + 1}. ${esc(t)}`).join('<br>'))
    + mailButton(`${CONFIG.appUrl}/org`, 'افتح لوحة الجهة')
    + mailNote('لا ترى الجهة أبدًا: إجابات القياس، ونماذج المشارك وتأملاته، وملاحظات المستشار، ومسودة مبادرته قبل اعتمادها.'),
    join ? `رابط تسجيل موظفيكم ولوحة ${org}` : `حساب منسق لجهة ${org}`, '');
}

export function coordinatorSignInMail(name: string | null, code: string, link: string) {
  return shell('access', 'رمز الدخول إلى لوحة الجهة',
    mailText(`${hello(name)} اضغط الزر للدخول، أو أدخل الرمز في الصفحة.`)
    + mailButton(link, 'الدخول الآن')
    + mailCode(code, `صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.`),
    `رمزك ${code} · صالح ${CONFIG.codeMinutes} دقيقة`);
}

export function coordinatorWeeklyMail(name: string | null, org: string, k: Record<string, number>) {
  return shell('organization', `ملخص ${org} الأسبوعي`,
    mailText(`${hello(name)} هذا ملخص مشاركي جهتك في برنامج القادة.`)
    + mailRows([['المشاركون', k.total], ['انضموا هذا الأسبوع', k.joined_week], ['نشطون هذا الأسبوع', k.active_week],
      ['اعتُمد مسارهم', k.approved], ['أنهوا البرنامج', k.completed], ['متوسط الإنجاز', `${k.avg_progress}%`],
      ...(k.seats ? [['مقاعد العقد', `${k.seats_used} من ${k.seats}`] as [string, unknown]] : []),
      ...(k.seats_waiting ? [['بانتظار قرار الرعاية', k.seats_waiting] as [string, unknown]] : [])])
    + mailButton(`${CONFIG.appUrl}/org`, 'التفاصيل في لوحة الجهة'),
    `${k.active_week} نشطون · متوسط الإنجاز ${k.avg_progress}%`, 'يصلك هذا الملخص كل أسبوع، ويمكن للإدارة إيقافه متى طلبت.');
}

// إشعار المشارك حين تُفتح لجهته صلاحية تكشف بياناته (الشفافية قبل الاطلاع)
export function orgAccessMail(name: string, org: string, items: string[]) {
  return shell('organization', `${org} تطّلع على رحلتك`,
    mailText(`${hello(name)} فُتح لجهتك ${esc(org)} الاطلاع على: <b>${items.map(esc).join('، ')}</b>.`)
    + mailNote('لا ترى جهتك أبدًا: إجابات القياس، ونماذجك وتأملاتك، وملاحظات المستشار، ومسودة مبادرتك قبل اعتمادها.')
    + mailButton(`${CONFIG.appUrl}/?tab=profile`, 'ماذا ترى جهتك'),
    `فُتح لجهتك: ${items.join('، ')}`, '');
}

// ── الخبراء: الإعلام بالتكليف في فريق دفعة (تصور ربط الخبراء بالجهة، المرحلة 2) ──
// إعلام بلا قبول (القبول والاعتذار في المرحلة 3 بترحيلها)، يمر بحصة البريد نفسها (sendMail). المدعو الجديد لا تصله هذه الرسالة:
// سطر التكليف (assignmentNote) داخل دعوته نفسها، فرسالة واحدة تجمع الدعوة والتكليف
export type AssignmentMail = { cohort: string; org: string | null; role: string; scope: string; period: string };
export function teamAssignedMail(name: string | null, a: AssignmentMail) {
  return shell('experts', 'كُلّفت في فريق دفعة',
    mailText(`${hello(name)} أضافتك إدارة برنامج القادة إلى فريق <b>${esc(a.cohort)}</b>${a.org ? ` في ${esc(a.org)}` : ''}.`)
    + mailRows([['الدور', a.role], ['التكليف', a.scope], ['المدة', a.period]])
    + mailText('تجد تكليفاتك وعدد من تخدمهم في لوحة الخبير، تحت «تكليفاتي». إن تعذّر عليك هذا التكليف فراسل إدارة البرنامج.')
    + mailButton(`${SITES.leaders}/x`, 'افتح لوحة الخبير'),
    `${a.role} في ${a.cohort}`, 'تصلك هذه الرسالة لأن إدارة برنامج القادة أضافتك إلى فريق دفعة.');
}
export const assignmentNote = (a: AssignmentMail) =>
  mailNote(`<b>تكليفك:</b> ${esc(a.role)} في فريق ${esc(a.cohort)}${a.org ? ` (${esc(a.org)})` : ''}، ${esc(a.period)}. يبدأ عملك فيه بعد اعتماد ملفك.`);

// ── الإدارة ──
export function healthMail(rows: [string, string][], issues: string[]) {
  return shell('admin', 'تقرير الأسبوع: برنامج القادة',
    mailRows(rows)
    + (issues.length ? mailText('<b>ما يحتاج تدخلك</b>') + mailNote(issues.map(esc).join('<br>')) : mailText('لا شيء يحتاج تدخلك هذا الأسبوع.'))
    + mailButton(`${SITES.admin}/#/leaders/overview`, 'افتح لوحة الإدارة'),
    issues.length ? `${issues.length} يحتاج تدخلك` : 'لا شيء يحتاج تدخلك', 'يصلك هذا التقرير كل أسبوع لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.');
}

// ── تنبيه التشغيل الفوري ──
// خطأ داخلي (500) أو تعطل البريد يصل المالك فورًا لا في تقرير الأحد، مرة كل عشر
// دقائق لكل نوع. النافذة تُقرأ من audit_log (action=system.alert) فلا جدول جديد.
export function alertMail(kind: string, detail: Record<string, unknown>) {
  const rows = Object.entries(detail).map(([k, v]) => [k, String(v ?? '')] as [string, string]);
  return shell('admin', `تنبيه تشغيلي: ${kind}`,
    mailText(`وقع <b>${esc(kind)}</b> في leaders-api الآن. لن يصلك تنبيه آخر من النوع نفسه خلال عشر دقائق.`)
    + mailRows(rows)
    + mailButton(`${SITES.admin}/#/leaders/overview`, 'افتح لوحة الإدارة'),
    `${kind} في leaders-api`, 'يصلك هذا التنبيه لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.');
}
const ALERT_WINDOW_MS = 10 * 60e3;
// تهدئة احتياطية داخل النسخة حين يتعذّر السجل نفسه (تنبيه audit_failed مثلًا)، فلا يفيض البريد
const lastAlert = new Map<string, number>();
export async function alertOps(kind: string, detail: Record<string, unknown>) {
  if ((lastAlert.get(kind) ?? 0) > Date.now() - ALERT_WINDOW_MS) return false;
  try {
    const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
    const { count, error } = await db.from('audit_log').select('id', { count: 'exact', head: true })
      .eq('action', 'system.alert').eq('entity_id', kind).gte('created_at', since);
    if (!error && (count ?? 0) > 0) return false;
    lastAlert.set(kind, Date.now());
    // أثر التنبيه يهدّئ التنبيهات بين النسخ؛ وتعذّره لا يمنع التنبيه، فقد يكون التنبيه عن تعذّر السجل نفسه
    await audit('system', 'alert', 'system.alert', 'system', kind, null, detail).catch((e) => console.error('alertOps audit:', e));
    // قناة غير البريد أولًا (D15): حين يكون العطل في البريد نفسه يصل التنبيه
    const hooked = await alertWebhook(kind, detail);
    if (!CONFIG.alertEmail || !CONFIG.resendKey) return hooked;
    await sendMail(CONFIG.alertEmail, `تنبيه: ${kind} في leaders-api`, alertMail(kind, detail), [], { kind: 'alert' });
    return true;
  } catch (e) { console.error('alertOps:', e); return false; }
}

// معرض المعاينة في لوحة الإدارة: كل قالب ببيانات تجريبية، من الدوال نفسها التي تُرسل
export const MAIL_GALLERY: { key: string; family: MailFamily; label: string; subject: string; html: () => string }[] = [
  { key: 'signin', family: 'access', label: 'رمز دخول المشارك', subject: 'رمز الدخول إلى رحلتك', html: () => signInMail('سارة', '153262', CONFIG.appUrl, false) },
  { key: 'register', family: 'access', label: 'إكمال التسجيل', subject: 'أكمل تسجيلك في برنامج القادة', html: () => signInMail('سارة', '153262', CONFIG.appUrl, true) },
  { key: 'coord-signin', family: 'access', label: 'رمز دخول لوحة الجهة', subject: 'رمز الدخول إلى لوحة الجهة', html: () => coordinatorSignInMail('خالد', '820417', `${CONFIG.appUrl}/org`) },
  { key: 'approved', family: 'journey', label: 'اعتماد المستوى', subject: 'اعتُمد مستواك في برنامج القادة', html: () => approvedMail('سارة') },
  { key: 'approved-pay', family: 'journey', label: 'اعتماد المسار مع رابط الدفع', subject: 'اعتُمد مسارك في برنامج القادة', html: () => approvedMail('سارة', true) },
  { key: 'pay-receipt', family: 'journey', label: 'تأكيد الدفع للعميل (بمفتاح)', subject: 'وصلنا دفعك', html: () => paymentReceiptMail('سارة', 'القياس المبدئي', '1.99 USD', 'ord_123', 'القياس مفتوح لك الآن.') },
  { key: 'pay-refund', family: 'journey', label: 'إشعار الاسترداد للعميل (بمفتاح)', subject: 'استُردّت دفعتك', html: () => paymentRefundMail('سارة', 'القياس المبدئي', '1.99 USD') },
  { key: 'pay-abandon', family: 'journey', label: 'تذكير من لم يكمل الدفع (يدوي)', subject: 'دفعك لم يكتمل', html: () => paymentAbandonMail('سارة', 'القياس المبدئي') },
  { key: 'pay-owner', family: 'admin', label: 'تنبيه الإدارة بدفعة (بمفتاح)', subject: 'دفعة جديدة', html: () => paymentOwnerMail('دفعة جديدة', [['المشارك', 'سارة الأحمد'], ['البند', 'القياس المبدئي'], ['المبلغ', '1.99 USD']]) },
  { key: 'pay-reminder', family: 'journey', label: 'تذكير إكمال التسجيل', subject: 'مسارك المعتمد بانتظارك', html: () => payReminderMail('سارة', 3) },
  { key: 'review-ok', family: 'journey', label: 'اعتماد عمل', subject: 'اعتُمد بند في رحلتك', html: () => reviewMail('سارة', 'خطة التطوير الشخصية', false) },
  { key: 'review-returned', family: 'journey', label: 'إعادة عمل بملاحظة', subject: 'ملاحظة من المستشار على رحلتك', html: () => reviewMail('سارة', 'خطة التطوير الشخصية', true, 'أضف مؤشرًا قابلًا للقياس لكل هدف.') },
  { key: 'reminder', family: 'journey', label: 'تذكير أسبوعي', subject: 'رحلتك القيادية بانتظارك', html: () => reminderMail('سارة', 3) },
  { key: 'stuck', family: 'journey', label: 'تذكير من لم يكمل التسجيل (يدوي)', subject: STUCK_MAIL_SUBJECT, html: () => stuckMail('سارة', stuckMailText({ step: 'assessment_doing', answered: 42, total: 63 })!) },
  { key: 'retake', family: 'journey', label: 'طلب إعادة قياس تحديد المستوى', subject: RETAKE_MAIL_SUBJECT, html: () => retakeMail('سارة', retakeText('effort', 35)) },
  { key: 'observation', family: 'journey', label: 'تنبيه أو ملاحظة مرئية للمشارك', subject: 'تنبيه في رحلتك: غياب عن جلسة توجيه', html: () => observationMail('سارة', 'غياب عن جلسة توجيه', 'سُجّل غيابك عن جلسة التوجيه يوم الأحد 15 نوفمبر. إن كان لديك عذر فأخبر مستشارك، واحجز موعدًا بديلًا من صفحة الأنشطة.') },
  { key: 'certificate', family: 'journey', label: 'صدور شهادة الإتمام بنجاح', subject: 'شهادة إتمامك بنجاح برنامج القادة', html: () => certificateMail('سارة', `${CONFIG.appUrl}/v/MI-LDR-2026-SAMPLE`) },
  { key: 'final-extend', family: 'journey', label: 'قرار ختامي: يُمدَّد', subject: FINAL_MAIL_SUBJECT.extend, html: () => finalDecisionMail('سارة', 'extend', 'أكمل فصل المخاطر في وثيقة المبادرة.') },
  { key: 'final-fail', family: 'journey', label: 'قرار ختامي: لم يجتز', subject: FINAL_MAIL_SUBJECT.fail, html: () => finalDecisionMail('سارة', 'fail', null) },
  { key: 'rater', family: 'journey', label: 'طلب تقدير الأثر بعد البرنامج', subject: 'طلب تقدير من سارة', html: () => raterMail('أحمد', 'سارة الحربي', CONFIG.appUrl, 'post') },
  { key: 'f360-invite', family: 'journey', label: 'تقييم 360: دعوة المقيّم', subject: 'طلب تقدير من سارة', html: () => raterMail('أحمد', 'سارة الحربي', CONFIG.appUrl, 'f360', { promise: 'يُجمع تقديرك مع مقيّمَين آخرين على الأقل من مجموعتك، ولا يظهر منفردًا.', closes: 'الأحد 22 نوفمبر' }) },
  { key: 'f360-reminder', family: 'journey', label: 'تقييم 360: تذكير المقيّم', subject: 'تذكير: تقديرك لسارة', html: () => raterMail('أحمد', 'سارة الحربي', CONFIG.appUrl, 'f360', { promise: 'يُجمع تقديرك مع مقيّمَين آخرين على الأقل من مجموعتك، ولا يظهر منفردًا.', closes: 'الأحد 22 نوفمبر', reminder: true }) },
  { key: 'f360-list', family: 'journey', label: 'تقييم 360: القائمة بانتظار المستشار', subject: FEEDBACK_MAIL.list.subject('سارة'), html: () => feedbackMail('list', 'د. منى', 'سارة الحربي', { url: `${CONFIG.appUrl}/x` }) },
  { key: 'f360-returned', family: 'journey', label: 'تقييم 360: أعاد المستشار القائمة', subject: FEEDBACK_MAIL.returned.subject(), html: () => feedbackMail('returned', 'سارة', 'سارة', { note: 'أضف زميلًا من خارج فريقك المباشر.', url: CONFIG.appUrl }) },
  { key: 'f360-ready', family: 'journey', label: 'تقييم 360: التقرير جاهز للمستشار', subject: FEEDBACK_MAIL.ready.subject('سارة'), html: () => feedbackMail('ready', 'د. منى', 'سارة الحربي', { url: `${CONFIG.appUrl}/x` }) },
  { key: 'f360-released', family: 'journey', label: 'تقييم 360: التقرير متاح للمشارك', subject: FEEDBACK_MAIL.released.subject(), html: () => feedbackMail('released', 'سارة', 'سارة', { url: CONFIG.appUrl }) },
  { key: 'workshop-invite', family: 'sessions', label: 'دعوة الجلسة التدريبية', subject: WORKSHOP_MAIL.invite.subject, html: () => workshopMail('invite', 'سارة', 'اليوم التدريبي الأول', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', null) },
  { key: 'workshop-day', family: 'sessions', label: 'تذكير الجلسة التدريبية: قبل يوم', subject: WORKSHOP_MAIL.day.subject, html: () => workshopMail('day', 'سارة', 'اليوم التدريبي الأول', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', null) },
  { key: 'workshop-hour', family: 'sessions', label: 'تذكير الجلسة التدريبية: قبل ساعة', subject: WORKSHOP_MAIL.hour.subject, html: () => workshopMail('hour', 'سارة', 'اليوم التدريبي الأول', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', null) },
  { key: 'session-reminder', family: 'sessions', label: 'تذكير الجلسة', subject: 'جلستك غدًا', html: () => sessionReminderMail('سارة', 'الأحد 2 نوفمبر · 10:00', 'د. منى القحطاني', 'https://meet.google.com/abc-defg-hij') },
  { key: 'erase-request', family: 'access', label: 'تأكيد طلب حذف البيانات', subject: ERASE_MAIL_SUBJECT, html: () => eraseRequestMail('سارة', 30) },
  { key: 'new-device', family: 'access', label: 'دخول من جهاز جديد', subject: 'دخول جديد إلى حسابك', html: () => newDeviceMail('سارة', 'iPhone · Safari', 'الأحد 2 نوفمبر · 10:00') },
  { key: 'coord-invite', family: 'organization', label: 'دعوة مطّلع الجهة', subject: 'لوحة وزارة التجربة في برنامج القادة', html: () => coordinatorInviteMail('خالد', 'وزارة التجربة', { invite_code: 'tajriba', seats: 25, contract_starts: '2026-11-01', contract_ends: '2027-10-31' }) },
  { key: 'coord-weekly', family: 'organization', label: 'ملخص الجهة الأسبوعي', subject: 'ملخص وزارة التجربة الأسبوعي', html: () => coordinatorWeeklyMail('خالد', 'وزارة التجربة', { total: 24, joined_week: 3, active_week: 17, approved: 20, completed: 4, avg_progress: 46 }) },
  { key: 'org-access', family: 'organization', label: 'إشعار اطلاع الجهة', subject: 'وزارة التجربة تطّلع على رحلتك', html: () => orgAccessMail('سارة', 'وزارة التجربة', ['التواصل', 'المستويات']) },
  { key: 'team-assigned', family: 'experts', label: 'التكليف في فريق دفعة', subject: 'كُلّفت في فريق دفعة وزارة التجربة 2026', html: () => teamAssignedMail('منى', { cohort: 'دفعة وزارة التجربة 2026', org: 'وزارة التجربة', role: 'موجّه', scope: 'خبير المجموعة 2', period: '1 مارس 2026 إلى 30 يونيو 2026' }) },
  { key: 'health', family: 'admin', label: 'تقرير الأسبوع للإدارة', subject: 'تقرير الأسبوع: برنامج القادة', html: () => healthMail([['مشاركون جدد', '12'], ['بانتظار الاعتماد', '3']], ['3 مشاركين بانتظار اعتماد المستوى منذ أكثر من 3 أيام']) },
  { key: 'ops-alert', family: 'admin', label: 'تنبيه تشغيلي فوري', subject: 'تنبيه: internal في leaders-api', html: () => alertMail('internal', { ref: 'a1b2c3d4', action: 'me', message: 'relation "leaders.x" does not exist' }) },
];

// ── حارس رسائل الرموز ──
// قبل كل رمز يُرسل بالبريد: حدود لكل شبكة في الساعة واليوم، وسقف يومي عام
// يحمي حصة البريد من الاستنزاف، ثم التحقق البشري، وهو إلزامي يفشل مغلقًا بلا مفتاحيه (المرحلة ل1).
// التسجيلات الجديدة (بريد لا حساب له) لها نصيب من السقف لا تتجاوزه، فإغراق
// التسجيل ببريد وهمي لا يحجب رموز الدخول عن أصحاب الحسابات؛ ولها حد لكل شبكة
// يتسع لقاعة ورشة. ورسائل نموذج التواصل تُحتسب في السقف نفسه لأنها من الحصة نفسها.
export const CHALLENGE_TABLES = ['email_challenges', 'coordinator_challenges', 'expert_challenges'];
const REGISTER_SHARE = 0.7;
async function challengeCount(since: string, ip?: string | null, purpose?: 'register' | 'login') {
  let n = 0;
  for (const t of CHALLENGE_TABLES) {
    if (purpose && t !== 'email_challenges') continue;   // purpose عمود رموز المشاركين وحدها
    let q = db.from(t).select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (ip) q = q.eq('ip', ip);
    if (purpose) q = q.eq('purpose', purpose);
    const { count } = await q;
    n += count ?? 0;
  }
  return n;
}
// استهلاك البريد في المدة كما يراه الحارس وتقرير الصحة (مصدر واحد): العداد الموحد leaders.mail_events (D15).
// null: العداد غير مقروء الآن، فيقرر sendCounted (الرموز والتنبيه تمر، وما سواها يُحجب أو يدخل الطابور، وينبّه)
export async function mailUsage(since = new Date(Date.now() - 864e5).toISOString()) {
  return (await mailCounts(db, since))?.sent ?? null;
}
// الرمز يُحتسب في السقف فقط إن أُرسل فعلًا: فشل الإرسال يحذف صفه ويرفع الخطأ نفسه
export async function sendOrDiscard(table: string, id: string, to: string, subject: string, html: string) {
  try { await sendMail(to, subject, html, [], { kind: 'code' }); }
  catch (e) { await db.from(table).delete().eq('id', id); throw e; }
}

async function turnstileOk(token: unknown, ip: string | null) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', CONFIG.turnstileSecret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return !!(await r.json())?.success;
  } catch { return false; }
}

// التحقق البشري إلزامي ويفشل مغلقًا: بلا مفتاحَي Turnstile يتوقف الدخول برمز البريد ويُبلَّغ المالك فورًا
// (captcha_unconfigured)، بدل أن تسقط الحماية بصمت إن حُذف سر (الملحق 1، H2). بوابة النشر في ci.yml
// تمنع أصلًا نشر الدوال بلا المفتاحين. الدخول بحساب Google وبمفتاح المرور لا يمر من هنا فيبقى متاحًا.
// closed: رسالة التوقف لغير الدخول (طلب انضمام الخبير)، فلا يُدل صاحب الطلب على دخول لا يعنيه
const SIGNIN_CLOSED = 'الدخول برمز البريد متوقف مؤقتًا. ادخل بحساب Google أو بمفتاح المرور، أو حاول بعد قليل.';
export async function requireHuman(b: Record<string, any>, ctx: { ip: string | null }, closed = SIGNIN_CLOSED) {
  if (!CONFIG.turnstileSecret || !CONFIG.turnstileSite) {
    console.error('leaders-api: Turnstile keys missing; email-code sign-in and expert applications are closed');
    throw new Fail(closed, 503, 'captcha_unconfigured');
  }
  if (!(await turnstileOk(b.captcha, ctx.ip))) {
    throw new Fail(b.captcha ? 'تعذّر التحقق، أعد المحاولة' : 'أكّد أنك لست برنامجًا آليًا', 400, 'captcha', { site_key: CONFIG.turnstileSite });
  }
}

// تصريح خطوة الاسم (guards.js): من تحقق عند البريد لا يُطلب منه التحدي ثانية عند الاسم
export const issuePass = (email: string) => signPass(CONFIG.pepper, email);
export async function humanGate(b: Record<string, any>, ctx: { ip: string | null }, email: string) {
  if (b.pass && await passOk(CONFIG.pepper, b.pass, email)) return;
  await requireHuman(b, ctx);
}

// حدود الشبكة في الساعة واليوم: تتسع لقاعة ورشة كاملة (50 مشاركًا وأكثر) على شبكة واحدة
export async function networkGuard(ctx: { ip: string | null }) {
  if (!ctx.ip) return;
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  if (await challengeCount(hourAgo, ctx.ip) >= 150) throw new Fail('طلبات كثيرة، حاول بعد قليل', 429, 'rate');
  if (await challengeCount(dayAgo, ctx.ip) >= 300) throw new Fail('طلبات كثيرة اليوم من هذه الشبكة، حاول غدًا', 429, 'rate');
}

// opts.checked: حدود الشبكة والتحقق البشري جرت سلفًا في الطلب نفسه (authStart يجريهما قبل أي إفصاح)،
// ورمز Turnstile لمرة واحدة فلا يُتحقق منه مرتين
export async function mailGuard(b: Record<string, any>, ctx: { ip: string | null }, purpose: 'login' | 'register' = 'login', opts: { checked?: boolean } = {}) {
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  if (!opts.checked) await networkGuard(ctx);
  if (purpose === 'register' && ctx.ip && await challengeCount(dayAgo, ctx.ip, 'register') >= CONFIG.registerPerIpDay) {
    throw new Fail('تسجيلات كثيرة اليوم من هذه الشبكة. سجّل بحساب Google، أو حاول غدًا', 429, 'rate');
  }
  if ((await mailUsage(dayAgo) ?? 0) >= CONFIG.mailDailyCap) {
    console.error('leaders-api: mail daily cap reached', CONFIG.mailDailyCap);
    throw new Fail('بلغت الرسائل حدها اليومي. ادخل بمفتاح المرور، أو حاول بعد ساعات', 429, 'mail_cap');
  }
  if (purpose === 'register' && await challengeCount(dayAgo, null, 'register') >= Math.floor(CONFIG.mailDailyCap * REGISTER_SHARE)) {
    console.error('leaders-api: registration share of mail cap reached', CONFIG.mailDailyCap);
    throw new Fail('بلغت تسجيلات اليوم حدها. سجّل بحساب Google، أو حاول بعد ساعات', 429, 'mail_cap');
  }
  // التحقق البشري آخرًا: لا يُستهلك رمز Turnstile على طلب سترفضه الحدود
  if (!opts.checked) await requireHuman(b, ctx);
}

// ── محاولات الرمز في البوابات الثلاث (المشارك والجهة والخبير) ──
// تُحجز المحاولة ذريًا قبل المقارنة (guards.js): لا تتجاوز خمسًا ولو تزامنت الطلبات (الملحق 1، M2)
export async function reserveCodeAttempt(table: string, ch: { id: string; attempts: number }) {
  const r = await reserveAttempt({
    cas: async (n: number) => {
      const { data, error } = await db.from(table).update({ attempts: n + 1 })
        .eq('id', ch.id).eq('attempts', n).is('consumed_at', null).select('id');
      if (error) throw new Fail('تعذّر التحقق الآن، حاول بعد قليل', 500, 'db_error');
      return !!data?.length;
    },
    read: async () => {
      const { data } = await db.from(table).select('attempts, consumed_at').eq('id', ch.id).maybeSingle();
      return data ? { attempts: data.attempts, consumed: !!data.consumed_at } : null;
    },
  }, ch.attempts);
  if (r.ok) return;
  if (r.reason === 'gone') throw new Fail('الرمز مستخدم أو منتهٍ، اطلب رمزًا جديدًا', 400, 'expired');
  throw new Fail('محاولات كثيرة، اطلب رمزًا جديدًا', 429, 'attempts');
}
