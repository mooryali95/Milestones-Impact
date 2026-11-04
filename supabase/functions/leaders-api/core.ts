// ════════════════════════════════════════════════════════════════
// أساسيات leaders-api: الاتصال، التشفير، الردود، البريد
// ════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { deliver, esc, MAIL_FROM_DEFAULT, type MailAttachment, mailButton, mailCode, mailNote, mailRows, mailShell, mailText, type MailFamily } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';

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
  // التحقق البشري (Cloudflare Turnstile) قبل إرسال أي رمز: يعمل حين يُضبط السر
  // تقرير الصحة الأسبوعي يصل إلى هذا البريد (المالك)
  alertEmail: env('LEADERS_ALERT_EMAIL'),
  turnstileSecret: env('LEADERS_TURNSTILE_SECRET'),
  turnstileSite: env('LEADERS_TURNSTILE_SITE_KEY'),
  // سقف يومي لرسائل الرموز من هذه الدالة، فيبقى من حصة البريد ما يكفي للإدارة
  mailDailyCap: Number(env('LEADERS_MAIL_DAILY_CAP', '80')) || 80,
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

export async function audit(actorType: 'admin' | 'participant' | 'system' | 'coordinator', actor: string | null, action: string,
  entity: string, entityId: string | null, before: unknown = null, after: unknown = null) {
  await db.from('audit_log').insert({ actor_type: actorType, actor, action, entity, entity_id: entityId, before, after });
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

export async function sendMail(to: string, subject: string, html: string, attachments: MailAttachment[] = []) {
  if (isDemoMail(to)) { console.info('leaders-api: mail to the demo account skipped:', subject); return; }
  if (!CONFIG.resendKey) throw new Fail('خدمة البريد غير مهيأة', 503, 'mail_unconfigured');
  if (!(await deliver(to, subject, html, { key: CONFIG.resendKey, from: CONFIG.mailFrom, attachments }))) {
    throw new Fail('تعذّر إرسال البريد، حاول بعد قليل', 502, 'mail_failed');
  }
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

export function approvedMail(name: string) {
  return shell('journey', 'اعتُمد مستواك، ورحلتك مفتوحة الآن',
    mailText(`${hello(name)} راجع المستشار نتيجتك واعتمد مستواك في البرنامج. تجد ملف كفاءتك ومرحلتك الأولى بانتظارك.`)
    + mailButton(CONFIG.appUrl, 'افتح رحلتي'),
    'ملف كفاءتك ومرحلتك الأولى بانتظارك');
}

export function certificateMail(name: string, url: string) {
  return shell('journey', 'مبارك، صدرت شهادة مشاركتك',
    mailText(`${hello(name)} أتممت متطلبات برنامج القادة، وصدرت شهادة مشاركتك باسمك.`)
    + mailText('تجدها في رحلتك جاهزة للطباعة والحفظ PDF، ولها رابط تحقق عام يمكنك مشاركته أو إضافته إلى ملفك في LinkedIn.')
    + mailButton(url, 'اعرض شهادتي'),
    'شهادتك جاهزة برابط تحقق عام');
}

// phase 'pre': تقدير الممارسة الحالية قبل بدء البرنامج، ويُعاد بعده للمقارنة
export function raterMail(rater: string | null, who: string, link: string, phase: 'pre' | 'post' = 'post') {
  const pre = phase === 'pre';
  return shell('journey', `طلب تقدير من ${who}`,
    mailText(`${hello(rater)} يشارك ${esc(who)} في برنامج القادة من Milestone Impact، ${pre ? 'ويطلب تقديرك لممارسته الحالية في العمل قبل أن يبدأ البرنامج.' : 'ويطلب تقديرك لتغير ممارسته في العمل خلال البرنامج.'}`)
    + mailText(pre
      ? 'عبارات قصيرة تقدّر كلًّا منها مرة واحدة كما رأيته في الأشهر الثلاثة الأخيرة، وسنطلب منك التقدير نفسه بعد البرنامج لنقارن. يستغرق ذلك نحو ثلاث دقائق، ولا يظهر تقديرك له منفردًا.'
      : 'عبارات قصيرة، لكل منها تقديران: كيف يمارسها الآن، وكيف كان قبل البرنامج. يستغرق ذلك نحو خمس دقائق، ولا يظهر تقديرك له منفردًا.')
    + mailButton(link, 'ابدأ التقدير')
    + mailNote('الرابط خاص بك وصالح 30 يومًا.'),
    `${pre ? 'ثلاث' : 'خمس'} دقائق لتقدير ممارسة ${who}`, '');
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
export function coordinatorInviteMail(name: string | null, org: string) {
  return shell('organization', `لوحة ${org} في برنامج القادة`,
    mailText(`${hello(name)} أُنشئ لك حساب اطلاع على ${esc(org)} في برنامج القادة من Milestone Impact.`)
    + mailText('ترى منه ما تتيحه لك صلاحياتك عن مشاركي جهتك وتقاريرها، ويصلك ملخص أسبوعي بالبريد. الدخول برمز يصل إلى هذا البريد، بلا كلمة مرور.')
    + mailButton(`${CONFIG.appUrl}/org`, 'افتح لوحة الجهة'),
    `حساب اطلاع على ${org}`, '');
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
      ['اعتُمد مسارهم', k.approved], ['أنهوا البرنامج', k.completed], ['متوسط الإنجاز', `${k.avg_progress}%`]])
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
export async function alertOps(kind: string, detail: Record<string, unknown>) {
  if (!CONFIG.alertEmail || !CONFIG.resendKey) return false;
  try {
    const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
    const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true })
      .eq('action', 'system.alert').eq('entity_id', kind).gte('created_at', since);
    if ((count ?? 0) > 0) return false;
    await audit('system', 'alert', 'system.alert', 'system', kind, null, detail);
    await sendMail(CONFIG.alertEmail, `تنبيه: ${kind} في leaders-api`, alertMail(kind, detail));
    return true;
  } catch (e) { console.error('alertOps:', e); return false; }
}

// معرض المعاينة في لوحة الإدارة: كل قالب ببيانات تجريبية، من الدوال نفسها التي تُرسل
export const MAIL_GALLERY: { key: string; family: MailFamily; label: string; subject: string; html: () => string }[] = [
  { key: 'signin', family: 'access', label: 'رمز دخول المشارك', subject: 'رمز الدخول إلى رحلتك', html: () => signInMail('سارة', '153262', CONFIG.appUrl, false) },
  { key: 'register', family: 'access', label: 'إكمال التسجيل', subject: 'أكمل تسجيلك في برنامج القادة', html: () => signInMail('سارة', '153262', CONFIG.appUrl, true) },
  { key: 'coord-signin', family: 'access', label: 'رمز دخول لوحة الجهة', subject: 'رمز الدخول إلى لوحة الجهة', html: () => coordinatorSignInMail('خالد', '820417', `${CONFIG.appUrl}/org`) },
  { key: 'approved', family: 'journey', label: 'اعتماد المستوى', subject: 'اعتُمد مستواك في برنامج القادة', html: () => approvedMail('سارة') },
  { key: 'review-ok', family: 'journey', label: 'اعتماد عمل', subject: 'اعتُمد بند في رحلتك', html: () => reviewMail('سارة', 'خطة التطوير الشخصية', false) },
  { key: 'review-returned', family: 'journey', label: 'إعادة عمل بملاحظة', subject: 'ملاحظة من المستشار على رحلتك', html: () => reviewMail('سارة', 'خطة التطوير الشخصية', true, 'أضف مؤشرًا قابلًا للقياس لكل هدف.') },
  { key: 'reminder', family: 'journey', label: 'تذكير أسبوعي', subject: 'رحلتك القيادية بانتظارك', html: () => reminderMail('سارة', 3) },
  { key: 'certificate', family: 'journey', label: 'صدور الشهادة', subject: 'شهادة مشاركتك في برنامج القادة', html: () => certificateMail('سارة', `${CONFIG.appUrl}/v/MI-LDR-2026-SAMPLE`) },
  { key: 'rater', family: 'journey', label: 'طلب تقدير 360', subject: 'طلب تقدير من سارة', html: () => raterMail('أحمد', 'سارة الحربي', CONFIG.appUrl, 'post') },
  { key: 'session-reminder', family: 'sessions', label: 'تذكير الجلسة', subject: 'جلستك غدًا', html: () => sessionReminderMail('سارة', 'الأحد 2 نوفمبر · 10:00', 'د. منى القحطاني', 'https://meet.google.com/abc-defg-hij') },
  { key: 'new-device', family: 'access', label: 'دخول من جهاز جديد', subject: 'دخول جديد إلى حسابك', html: () => newDeviceMail('سارة', 'iPhone · Safari', 'الأحد 2 نوفمبر · 10:00') },
  { key: 'coord-invite', family: 'organization', label: 'دعوة مطّلع الجهة', subject: 'لوحة وزارة التجربة في برنامج القادة', html: () => coordinatorInviteMail('خالد', 'وزارة التجربة') },
  { key: 'coord-weekly', family: 'organization', label: 'ملخص الجهة الأسبوعي', subject: 'ملخص وزارة التجربة الأسبوعي', html: () => coordinatorWeeklyMail('خالد', 'وزارة التجربة', { total: 24, joined_week: 3, active_week: 17, approved: 20, completed: 4, avg_progress: 46 }) },
  { key: 'org-access', family: 'organization', label: 'إشعار اطلاع الجهة', subject: 'وزارة التجربة تطّلع على رحلتك', html: () => orgAccessMail('سارة', 'وزارة التجربة', ['التواصل', 'المستويات']) },
  { key: 'health', family: 'admin', label: 'تقرير الأسبوع للإدارة', subject: 'تقرير الأسبوع: برنامج القادة', html: () => healthMail([['مشاركون جدد', '12'], ['بانتظار الاعتماد', '3']], ['3 مشاركين بانتظار اعتماد المستوى منذ أكثر من 3 أيام']) },
  { key: 'ops-alert', family: 'admin', label: 'تنبيه تشغيلي فوري', subject: 'تنبيه: internal في leaders-api', html: () => alertMail('internal', { ref: 'a1b2c3d4', action: 'me', message: 'relation "leaders.x" does not exist' }) },
];

// ── حارس رسائل الرموز ──
// قبل كل رمز يُرسل بالبريد: حدود لكل جهاز في الساعة واليوم، وسقف يومي عام
// يحمي حصة البريد من الاستنزاف، ثم التحقق البشري إن كان مفعّلًا.
// التسجيلات الجديدة (بريد لا حساب له) لها نصيب من السقف لا تتجاوزه، فإغراق
// التسجيل ببريد وهمي لا يحجب رموز الدخول عن أصحاب الحسابات؛ ولها حد لكل شبكة
// يتسع لقاعة ورشة. ورسائل نموذج التواصل تُحتسب في السقف نفسه لأنها من الحصة نفسها.
export const CHALLENGE_TABLES = ['email_challenges', 'coordinator_challenges', 'expert_challenges'];
const REGISTER_SHARE = 0.7;
const REGISTER_PER_IP_DAY = 60;
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
async function contactMailCount(since: string) {
  const { count } = await publicDb.from('mail_log').select('id', { count: 'exact', head: true }).gte('created_at', since);
  return count ?? 0;
}
// استهلاك البريد في المدة كما يراه الحارس وتقرير الصحة (مصدر واحد)
export async function mailUsage(since = new Date(Date.now() - 864e5).toISOString()) {
  return (await challengeCount(since)) + (await contactMailCount(since).catch(() => 0));
}
// الرمز يُحتسب في السقف فقط إن أُرسل فعلًا: فشل الإرسال يحذف صفه ويرفع الخطأ نفسه
export async function sendOrDiscard(table: string, id: string, to: string, subject: string, html: string) {
  try { await sendMail(to, subject, html); }
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

export async function mailGuard(b: Record<string, any>, ctx: { ip: string | null }, purpose: 'login' | 'register' = 'login') {
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  // الحد يتسع لقاعة ورشة كاملة (50 مشاركًا وأكثر) على شبكة واحدة؛ والحماية من الإغراق بالتحقق البشري (Turnstile) وحد كل بريد
  if (ctx.ip) {
    if (await challengeCount(hourAgo, ctx.ip) >= 150) throw new Fail('طلبات كثيرة، حاول بعد قليل', 429, 'rate');
    if (await challengeCount(dayAgo, ctx.ip) >= 300) throw new Fail('طلبات كثيرة اليوم من هذه الشبكة، حاول غدًا', 429, 'rate');
    if (purpose === 'register' && await challengeCount(dayAgo, ctx.ip, 'register') >= REGISTER_PER_IP_DAY) {
      throw new Fail('تسجيلات كثيرة اليوم من هذه الشبكة. سجّل بحساب Google، أو حاول غدًا', 429, 'rate');
    }
  }
  if (await mailUsage(dayAgo) >= CONFIG.mailDailyCap) {
    console.error('leaders-api: mail daily cap reached', CONFIG.mailDailyCap);
    throw new Fail('بلغت الرسائل حدها اليومي. ادخل بمفتاح المرور، أو حاول بعد ساعات', 429, 'mail_cap');
  }
  if (purpose === 'register' && await challengeCount(dayAgo, null, 'register') >= Math.floor(CONFIG.mailDailyCap * REGISTER_SHARE)) {
    console.error('leaders-api: registration share of mail cap reached', CONFIG.mailDailyCap);
    throw new Fail('بلغت تسجيلات اليوم حدها. سجّل بحساب Google، أو حاول بعد ساعات', 429, 'mail_cap');
  }
  if (CONFIG.turnstileSecret && !(await turnstileOk(b.captcha, ctx.ip))) {
    throw new Fail(b.captcha ? 'تعذّر التحقق، أعد المحاولة' : 'أكّد أنك لست برنامجًا آليًا', 400, 'captcha', { site_key: CONFIG.turnstileSite });
  }
}
