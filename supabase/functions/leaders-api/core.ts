// ════════════════════════════════════════════════════════════════
// أساسيات leaders-api: الاتصال، التشفير، الردود، البريد
// ════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

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
  mailFrom: env('LEADERS_MAIL_FROM', 'Milestone Impact <milestoneimpact@basserh.com>'),
  sessionDays: 30,
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
  'Access-Control-Allow-Origin': origin && CONFIG.origins.concat(CONFIG.adminOrigins, ['http://localhost:5174']).includes(origin) ? origin : CONFIG.origins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

export class Fail extends Error {
  constructor(message: string, public status = 400, public code = 'bad_request') { super(message); }
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
// قالب البريد بهوية Milestone Impact (الوضع الفاتح): أرضية Mist، بطاقة بيضاء بخط شعري،
// الشعار ثم خط ذهبي، عنوان خفيف الوزن، زر بإطار ذهبي، وتوقيع وحقوق في التذييل.
// جداول لا عناصر حديثة حتى يظهر متطابقًا في Outlook وGmail وApple Mail.
const LOGO_URL = 'https://mi.sunkvalue.com/assets/brand/png/milestone-impact-400w.png';
const MAIL = { graphite: '#0B272F', gold: '#A97A2E', mist: '#F7F8F6', line: '#DCE2E1', slate: '#2C4148', muted: '#6E8085' };
const FONT = `'Noto Kufi Arabic',Tahoma,Arial,sans-serif`;

export const mailButton = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 22px"><tr>
<td style="border:1px solid ${MAIL.gold};border-radius:2px"><a href="${href}" style="display:inline-block;padding:13px 34px;font-family:${FONT};font-size:14px;color:${MAIL.graphite};text-decoration:none;letter-spacing:0">${label}</a></td></tr></table>`;

function shell(title: string, body: string) {
  const year = new Date().getFullYear();
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${MAIL.mist};font-family:${FONT};color:${MAIL.graphite}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAIL.mist}"><tr><td align="center" style="padding:36px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${MAIL.line};border-radius:2px">
<tr><td style="padding:30px 36px 0" align="left" dir="ltr">
  <img src="${LOGO_URL}" width="132" alt="Milestone Impact" style="display:block;width:132px;height:auto;border:0;font-family:Arial,sans-serif;font-size:18px;color:${MAIL.graphite}">
</td></tr>
<tr><td style="padding:22px 36px 0"><div style="height:1px;line-height:1px;font-size:0;background:${MAIL.gold}">&nbsp;</div></td></tr>
<tr><td style="padding:26px 36px 8px">
  <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px;color:${MAIL.gold};text-transform:uppercase;margin:0 0 8px" dir="ltr" align="right">LEADERS PROGRAM</div>
  <h1 style="font-family:${FONT};font-weight:300;font-size:22px;line-height:1.5;margin:0 0 16px;color:${MAIL.graphite}">${title}</h1>
  <div style="font-size:15px;line-height:1.9;color:${MAIL.slate}">${body}</div>
</td></tr>
<tr><td style="padding:8px 36px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${MAIL.line}"><tr>
    <td style="padding-top:16px;font-size:13px;color:${MAIL.slate}">Milestone Impact · <span style="color:${MAIL.gold}">مَعلَم</span><br><span style="font-size:12px;color:${MAIL.muted}">من النية… إلى الأثر</span></td>
  </tr></table>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 8px;font-size:11px;line-height:1.8;color:${MAIL.muted}" align="center">
  إن لم تطلب هذه الرسالة فتجاهلها، ولن يتغير شيء في حسابك.<br>
  © ${year} Milestone Impact. جميع الحقوق محفوظة. هذه الرسالة ومحتواها مخصصة لمستلمها فقط.
</td></tr></table>
</td></tr></table></body></html>`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function sendMail(to: string, subject: string, html: string) {
  if (!CONFIG.resendKey) {
    console.error('RESEND_API_KEY missing; mail to', to, 'not sent');
    throw new Fail('خدمة البريد غير مهيأة', 503, 'mail_unconfigured');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CONFIG.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CONFIG.mailFrom, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error('mail failed', res.status, await res.text());
    throw new Fail('تعذّر إرسال البريد، حاول بعد قليل', 502, 'mail_failed');
  }
}

export function signInMail(name: string, code: string, link: string, isNew: boolean) {
  const hello = name ? `أهلًا ${esc(name)}،` : 'أهلًا،';
  return shell(isNew ? 'أكمل تسجيلك في برنامج القادة' : 'رمز الدخول إلى رحلتك', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">${hello} اضغط الزر للمتابعة، أو أدخل الرمز في الصفحة التي طلبته منها.</p>
${mailButton(link, isNew ? 'تأكيد التسجيل' : 'الدخول الآن')}
<p style="text-align:center;font-family:Arial,sans-serif;font-size:32px;letter-spacing:10px;font-weight:300;color:#0B272F;margin:0 0 8px;direction:ltr">${code}</p>
<p style="text-align:center;font-size:13px;color:#6E8085;margin:0">صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.</p>`);
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
export function reminderMail(name: string, open: number) {
  return shell('رحلتك بانتظارك', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">أهلًا ${esc(name)}، لديك ${open} ${open === 1 ? 'خطوة مفتوحة' : 'خطوات مفتوحة'} في رحلتك القيادية. بضع دقائق اليوم تقرّبك من المرحلة التالية.</p>
${mailButton(CONFIG.appUrl, 'أكمل رحلتي')}`);
}

// ── منسق الجهة ──
const btn = mailButton;

export function coordinatorInviteMail(name: string | null, org: string) {
  return shell(`لوحة ${esc(org)} في برنامج القادة`, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">${name ? `أهلًا ${esc(name)}،` : 'أهلًا،'} أُنشئ لك حساب اطلاع بصفتك منسق ${esc(org)} في برنامج القادة من Milestone Impact.</p>
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">ترى منه تقدّم مشاركي جهتك وتوزيعهم على المسارات وتقارير الجهة، ويصلك ملخص أسبوعي بالبريد. الدخول برمز يصل إلى هذا البريد، بلا كلمة مرور.</p>
${btn(`${CONFIG.appUrl}/org`, 'افتح لوحة الجهة')}`);
}

export function coordinatorSignInMail(name: string | null, code: string, link: string) {
  return shell('رمز الدخول إلى لوحة الجهة', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">${name ? `أهلًا ${esc(name)}،` : 'أهلًا،'} اضغط الزر للدخول، أو أدخل الرمز في الصفحة.</p>
${btn(link, 'الدخول الآن')}
<p style="text-align:center;font-family:Arial,sans-serif;font-size:32px;letter-spacing:10px;font-weight:300;color:#0B272F;margin:0 0 8px;direction:ltr">${code}</p>
<p style="text-align:center;font-size:13px;color:#6E8085;margin:0">صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.</p>`);
}

export function coordinatorWeeklyMail(name: string | null, org: string, k: Record<string, number>) {
  const row = (l: string, v: number | string) => `<tr><td style="padding:8px 0;border-bottom:1px solid #DCE2E1">${l}</td><td style="padding:8px 0;border-bottom:1px solid #DCE2E1;text-align:left;font-family:Arial,sans-serif;font-weight:300;font-size:16px;color:#0B272F">${v}</td></tr>`;
  return shell(`ملخص ${esc(org)} الأسبوعي`, `
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
