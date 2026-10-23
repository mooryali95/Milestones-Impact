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
// قالب واحد بهوية Milestone Impact. RTL، بلا صور خارجية.
function shell(title: string, body: string) {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#EFE7D8;font-family:Tahoma,Arial,sans-serif;color:#0B272F">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B272F;padding:22px 28px;color:#fff;font-size:15px;font-weight:bold">Milestone Impact · القادة</td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 14px">${title}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px;background:#EAF0F0;font-size:12px;color:#12414E">إن لم تطلب هذه الرسالة فتجاهلها، ولن يتغير شيء في حسابك.</td></tr>
</table></td></tr></table></body></html>`;
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
<p style="text-align:center;margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#12414E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold">${isNew ? 'تأكيد التسجيل' : 'الدخول الآن'}</a></p>
<p style="text-align:center;font-size:30px;letter-spacing:8px;font-weight:bold;margin:0 0 8px;direction:ltr">${code}</p>
<p style="text-align:center;font-size:13px;color:#12414E;margin:0">صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.</p>`);
}

// قرار المستشار على بند أو نموذج: أُعيد للتعديل، أو اعتُمد
export function reviewMail(name: string, title: string, returned: boolean, note?: string | null) {
  const head = returned ? 'ملاحظة من المستشار على عملك' : 'اعتُمد عملك';
  const body = returned
    ? `راجع المستشار «${esc(title)}» وطلب تعديلًا قبل اعتماده.`
    : `راجع المستشار «${esc(title)}» واعتمده. أحسنت، خطوة أخرى في رحلتك.`;
  return shell(head, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">أهلًا ${esc(name)}، ${body}</p>
${returned && note ? `<p style="font-size:14px;line-height:1.8;margin:0 0 18px;padding:12px 14px;background:#F6EEDC;border-radius:10px">${esc(note)}</p>` : ''}
<p style="text-align:center;margin:0"><a href="${CONFIG.appUrl}" style="display:inline-block;background:#12414E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold">افتح رحلتي</a></p>`);
}

// تذكير أسبوعي لمن غاب عن رحلته وما زالت لديه خطوات مفتوحة
export function reminderMail(name: string, open: number) {
  return shell('رحلتك بانتظارك', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">أهلًا ${esc(name)}، لديك ${open} ${open === 1 ? 'خطوة مفتوحة' : 'خطوات مفتوحة'} في رحلتك القيادية. بضع دقائق اليوم تقرّبك من المرحلة التالية.</p>
<p style="text-align:center;margin:0"><a href="${CONFIG.appUrl}" style="display:inline-block;background:#12414E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold">أكمل رحلتي</a></p>`);
}

// ── منسق الجهة ──
const btn = (href: string, label: string) => `<p style="text-align:center;margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#12414E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold">${label}</a></p>`;

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
<p style="text-align:center;font-size:30px;letter-spacing:8px;font-weight:bold;margin:0 0 8px;direction:ltr">${code}</p>
<p style="text-align:center;font-size:13px;color:#12414E;margin:0">صالح ${CONFIG.codeMinutes} دقيقة ولمرة واحدة.</p>`);
}

export function coordinatorWeeklyMail(name: string | null, org: string, k: Record<string, number>) {
  const row = (l: string, v: number) => `<tr><td style="padding:8px 0;border-bottom:1px solid #EFE7D8">${l}</td><td style="padding:8px 0;border-bottom:1px solid #EFE7D8;text-align:left;font-weight:bold">${v}</td></tr>`;
  return shell(`ملخص ${esc(org)} الأسبوعي`, `
<p style="font-size:15px;line-height:1.8;margin:0 0 14px">${name ? `أهلًا ${esc(name)}،` : 'أهلًا،'} هذا ملخص مشاركي جهتك في برنامج القادة.</p>
<table width="100%" style="font-size:14px;margin:0 0 20px">
${row('المشاركون', k.total)}${row('انضموا هذا الأسبوع', k.joined_week)}${row('نشطون هذا الأسبوع', k.active_week)}
${row('اعتُمد مسارهم', k.approved)}${row('أنهوا البرنامج', k.completed)}${row('متوسط الإنجاز', k.avg_progress)}
</table>
${btn(`${CONFIG.appUrl}/org`, 'التفاصيل في لوحة الجهة')}
<p style="font-size:12px;color:#4A6A72;margin:0">يمكن للإدارة إيقاف هذا الملخص متى طلبت.</p>`);
}

export function approvedMail(name: string) {
  return shell('اعتُمد مستواك، ورحلتك مفتوحة الآن', `
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">أهلًا ${esc(name)}، راجع المستشار نتيجتك واعتمد مستواك في البرنامج. تجد ملف كفاءتك ومرحلتك الأولى بانتظارك.</p>
<p style="text-align:center;margin:0"><a href="${CONFIG.appUrl}" style="display:inline-block;background:#12414E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold">افتح رحلتي</a></p>`);
}
