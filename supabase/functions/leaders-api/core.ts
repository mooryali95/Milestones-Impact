// ════════════════════════════════════════════════════════════════
// أساسيات leaders-api: الاتصال، التشفير، الردود، البريد
// ════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { deliver, esc, mailButton, mailCode, mailShell } from '../_shared/mail.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;

export const CONFIG = {
  url: env('SUPABASE_URL'),
  serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  // ملح الهاش للرموز والتوكنات. سر مستقل حتى لا يكفي تسريب القاعدة وحده.
  pepper: env('LEADERS_TOKEN_PEPPER'),
  appUrl: env('LEADERS_APP_URL', 'https://leaders.sunkvalue.com'),
  coordinatorDays: 14,
  rpId: env('LEADERS_RP_ID', 'leaders.sunkvalue.com'),
  rpName: 'Milestone Impact',
  origins: env('LEADERS_ORIGINS', 'https://leaders.sunkvalue.com').split(',').map((s) => s.trim()),
  // لوحة الإدارة تنادي نفس الدالة؛ مسموحة في CORS فقط وليست أصلًا لمفاتيح المرور
  adminOrigins: env('LEADERS_ADMIN_ORIGINS', 'https://admin.sunkvalue.com').split(',').map((s) => s.trim()),
  resendKey: env('RESEND_API_KEY'),
  // سر يرسله المجدول (pg_cron) لتشغيل التذكيرات؛ بدونه لا يعمل الإجراء
  cronSecret: env('LEADERS_CRON_SECRET'),
  // توقيع webhook منصات الحجز (دالة leaders-hooks)
  calcomSecret: env('LEADERS_CALCOM_SECRET'),
  calendlyKey: env('LEADERS_CALENDLY_KEY'),
  mailFrom: env('LEADERS_MAIL_FROM', 'Milestone Impact <milestoneimpact@basserh.com>'),
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

export async function audit(actorType: 'admin' | 'participant' | 'system' | 'coordinator', actor: string | null, action: string,
  entity: string, entityId: string | null, before: unknown = null, after: unknown = null) {
  await db.from('audit_log').insert({ actor_type: actorType, actor, action, entity, entity_id: entityId, before, after });
}

// ── البريد ──
// القالب من المصدر الموحّد (_shared/mail.ts)؛ هنا رسائل البرنامج فقط
export { mailButton };
const shell = (title: string, body: string) => mailShell(title, body, { eyebrow: 'LEADERS PROGRAM' });

export async function sendMail(to: string, subject: string, html: string) {
  if (!CONFIG.resendKey) throw new Fail('خدمة البريد غير مهيأة', 503, 'mail_unconfigured');
  if (!(await deliver(to, subject, html, { key: CONFIG.resendKey, from: CONFIG.mailFrom }))) {
    throw new Fail('تعذّر إرسال البريد، حاول بعد قليل', 502, 'mail_failed');
  }
}

export function signInMail(name: string, code: string, link: string, isNew: boolean) {
  const hello = name ? `أهلًا ${esc(name)}،` : 'أهلًا،';
  return shell(isNew ? 'أكمل تسجيلك في برنامج القادة' : 'رمز الدخول إلى رحلتك', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">${hello} اضغط الزر للمتابعة، أو أدخل الرمز في الصفحة التي طلبته منها.</p>
${mailButton(link, isNew ? 'تأكيد التسجيل' : 'الدخول الآن')}
${mailCode(code, `صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.`)}`);
}

// قرار المستشار على بند أو نموذج: أُعيد للتعديل، أو اعتُمد
export function reviewMail(name: string, title: string, returned: boolean, note?: string | null) {
  const head = returned ? 'ملاحظة من المستشار على عملك' : 'اعتُمد عملك';
  const body = returned
    ? `راجع المستشار «${esc(title)}» وطلب تعديلًا قبل اعتماده.`
    : `راجع المستشار «${esc(title)}» واعتمده. أحسنت، خطوة أخرى في رحلتك.`;
  return shell(head, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">أهلًا ${esc(name)}، ${body}</p>
${returned && note ? `<p style="font-size:14px;line-height:1.8;margin:0 0 18px;padding:12px 14px;background:#F7F8F6;border-right:2px solid #A97A2E;border-radius:2px">${esc(note)}</p>` : ''}
${mailButton(CONFIG.appUrl, 'افتح رحلتي')}`);
}

// تذكير أسبوعي لمن غاب عن رحلته وما زالت لديه خطوات مفتوحة
export function healthMail(rows: [string, string][], issues: string[]) {
  const table = rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5F7176">${esc(k)}</td><td style="padding:6px 0;font-weight:600" align="left">${esc(v)}</td></tr>`).join('');
  const list = issues.length
    ? `<p style="font-size:15px;margin:18px 0 6px;font-weight:600">ما يحتاج تدخلك</p><ul style="margin:0;padding-inline-start:20px;line-height:1.9">${issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<p style="font-size:15px;margin:18px 0 0">لا شيء يحتاج تدخلك هذا الأسبوع.</p>';
  return mailShell('تقرير الأسبوع: برنامج القادة', `<table role="presentation" width="100%" style="font-size:14px">${table}</table>${list}
${mailButton('https://admin.sunkvalue.com/#/leaders/overview', 'افتح لوحة الإدارة')}`, { eyebrow: 'LEADERS PROGRAM', footnote: 'يصلك هذا التقرير كل أسبوع لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.' });
}

export function reminderMail(name: string, open: number) {
  return shell('رحلتك بانتظارك', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">أهلًا ${esc(name)}، لديك ${open} ${open === 1 ? 'خطوة مفتوحة' : 'خطوات مفتوحة'} في رحلتك القيادية. بضع دقائق اليوم تقرّبك من المرحلة التالية.</p>
${mailButton(CONFIG.appUrl, 'أكمل رحلتي')}`);
}

// ── منسق الجهة ──
const btn = mailButton;

export function coordinatorInviteMail(name: string | null, org: string) {
  return shell(`لوحة ${org} في برنامج القادة`, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">${name ? `أهلًا ${esc(name)}،` : 'أهلًا،'} أُنشئ لك حساب اطلاع بصفتك منسق ${esc(org)} في برنامج القادة من Milestone Impact.</p>
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">ترى منه تقدّم مشاركي جهتك وتوزيعهم على المسارات وتقارير الجهة، ويصلك ملخص أسبوعي بالبريد. الدخول برمز يصل إلى هذا البريد، بلا كلمة مرور.</p>
${btn(`${CONFIG.appUrl}/org`, 'افتح لوحة الجهة')}`);
}

export function coordinatorSignInMail(name: string | null, code: string, link: string) {
  return shell('رمز الدخول إلى لوحة الجهة', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">${name ? `أهلًا ${esc(name)}،` : 'أهلًا،'} اضغط الزر للدخول، أو أدخل الرمز في الصفحة.</p>
${btn(link, 'الدخول الآن')}
${mailCode(code, `صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.`)}`);
}

export function coordinatorWeeklyMail(name: string | null, org: string, k: Record<string, number>) {
  const row = (l: string, v: number | string) => `<tr><td style="padding:8px 0;border-bottom:1px solid #DCE2E1">${l}</td><td style="padding:8px 0;border-bottom:1px solid #DCE2E1;text-align:left;font-family:Arial,sans-serif;font-weight:300;font-size:16px;color:#0B272F">${v}</td></tr>`;
  return shell(`ملخص ${org} الأسبوعي`, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">${name ? `أهلًا ${esc(name)}،` : 'أهلًا،'} هذا ملخص مشاركي جهتك في برنامج القادة.</p>
<table width="100%" style="font-size:14px;margin:0 0 20px">
${row('المشاركون', k.total)}${row('انضموا هذا الأسبوع', k.joined_week)}${row('نشطون هذا الأسبوع', k.active_week)}
${row('اعتُمد مسارهم', k.approved)}${row('أنهوا البرنامج', k.completed)}${row('متوسط الإنجاز', `${k.avg_progress}%`)}
</table>
${btn(`${CONFIG.appUrl}/org`, 'التفاصيل في لوحة الجهة')}
<p style="font-size:12px;color:#4A6A72;margin:0">يمكن للإدارة إيقاف هذا الملخص متى طلبت.</p>`);
}

export function approvedMail(name: string) {
  return shell('اعتُمد مستواك، ورحلتك مفتوحة الآن', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">أهلًا ${esc(name)}، راجع المستشار نتيجتك واعتمد مستواك في البرنامج. تجد ملف كفاءتك ومرحلتك الأولى بانتظارك.</p>
${mailButton(CONFIG.appUrl, 'افتح رحلتي')}`);
}

export function certificateMail(name: string, url: string) {
  return shell('مبارك، صدرت شهادة مشاركتك', `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">أهلًا ${esc(name)}، أتممت متطلبات برنامج القادة، وصدرت شهادة مشاركتك باسمك.</p>
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">تجدها في رحلتك جاهزة للطباعة والحفظ PDF، ولها رابط تحقق عام يمكنك مشاركته أو إضافته إلى ملفك في LinkedIn.</p>
${mailButton(url, 'اعرض شهادتي')}`);
}

// phase 'pre': تقدير الممارسة الحالية قبل بدء البرنامج، ويُعاد بعده للمقارنة
export function raterMail(rater: string | null, who: string, link: string, phase: 'pre' | 'post' = 'post') {
  const pre = phase === 'pre';
  return shell(`طلب تقدير من ${who}`, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">${rater ? `أهلًا ${esc(rater)}،` : 'أهلًا،'} يشارك ${esc(who)} في برنامج القادة من Milestone Impact، ${pre ? 'ويطلب تقديرك لممارسته الحالية في العمل قبل أن يبدأ البرنامج.' : 'ويطلب تقديرك لتغير ممارسته في العمل خلال البرنامج.'}</p>
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">${pre
    ? 'عبارات قصيرة تقدّر كلًّا منها مرة واحدة كما رأيته في الأشهر الثلاثة الأخيرة، وسنطلب منك التقدير نفسه بعد البرنامج لنقارن. يستغرق ذلك نحو ثلاث دقائق، ولا يظهر تقديرك له منفردًا.'
    : 'عبارات قصيرة، لكل منها تقديران: كيف يمارسها الآن، وكيف كان قبل البرنامج. يستغرق ذلك نحو خمس دقائق، ولا يظهر تقديرك له منفردًا.'}</p>
${mailButton(link, 'ابدأ التقدير')}
<p style="font-size:12px;color:#4A6A72;margin:18px 0 0">الرابط خاص بك وصالح 30 يومًا.</p>`);
}

// ── حارس رسائل الرموز ──
// قبل كل رمز يُرسل بالبريد: حدود لكل جهاز في الساعة واليوم، وسقف يومي عام
// يحمي حصة البريد من الاستنزاف، ثم التحقق البشري إن كان مفعّلًا.
const CHALLENGE_TABLES = ['email_challenges', 'coordinator_challenges'];
async function challengeCount(since: string, ip?: string | null) {
  let n = 0;
  for (const t of CHALLENGE_TABLES) {
    let q = db.from(t).select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (ip) q = q.eq('ip', ip);
    const { count } = await q;
    n += count ?? 0;
  }
  return n;
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

export async function mailGuard(b: Record<string, any>, ctx: { ip: string | null }) {
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  // الحد يتسع لدفعة تسجّل معًا من شبكة واحدة (قاعة ورشة)، ولا يكفي جهازًا واحدًا لاستنزاف السقف العام
  if (ctx.ip) {
    if (await challengeCount(hourAgo, ctx.ip) >= 30) throw new Fail('طلبات كثيرة، حاول بعد قليل', 429, 'rate');
    if (await challengeCount(dayAgo, ctx.ip) >= 60) throw new Fail('طلبات كثيرة اليوم من هذه الشبكة، حاول غدًا', 429, 'rate');
  }
  if (await challengeCount(dayAgo) >= CONFIG.mailDailyCap) {
    console.error('leaders-api: mail daily cap reached', CONFIG.mailDailyCap);
    throw new Fail('بلغت الرسائل حدها اليومي. ادخل بمفتاح المرور، أو حاول بعد ساعات', 429, 'mail_cap');
  }
  if (CONFIG.turnstileSecret && !(await turnstileOk(b.captcha, ctx.ip))) {
    throw new Fail(b.captcha ? 'تعذّر التحقق، أعد المحاولة' : 'أكّد أنك لست برنامجًا آليًا', 400, 'captcha', { site_key: CONFIG.turnstileSite });
  }
}
