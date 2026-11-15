// ════════════════════════════════════════════════════════════════
// قالب البريد الموحّد لكل دوال الحافة بهوية Milestone Impact (الوضع الفاتح)
// ════════════════════════════════════════════════════════════════
// مصدر واحد لشكل الرسائل: leaders-api وuser-api وadmin-api وsend-otp
// تستورد من هنا ولا تحمل قوالب خاصة. أرضية Mist، بطاقة بيضاء بخط شعري،
// الشعار ثم خط ذهبي، عنوان خفيف الوزن، زر بإطار ذهبي، وتوقيع وحقوق.
// جداول لا عناصر حديثة حتى يظهر متطابقًا في Outlook وGmail وApple Mail.
// كل قيمة متغيرة تمر عبر esc() قبل وضعها في HTML، والقيمة داخل جملة عبر bdi() التي ترمّز وتعزل.
// الاتجاه على كل جدول وخلية وفقرة لا على html وحده: Gmail يحذف سمات html وbody، فيرث المتن اتجاه واجهته.

import { crossesAlert, domainOf, mailDecision, PRIORITY_KINDS } from './mail-budget.js';
import { slackAlert, slackCode, slackMail, slackUse } from './slack.ts';

// ألوان البريد من ألوان الهوية (shared/js/brand.js) بالقيم نفسها؛ دوال الحافة لا تستورد من خارج
// supabase/functions، فتُنسخ هنا ويطابقها single-source.test.js. القيم مكتوبة لأن برامج البريد لا تقرأ متغيرات CSS.
export const MAIL = {
  graphite: '#0B272F', ink: '#061318', slate: '#12414E', gold: '#A97A2E', copper: '#C79A4B',
  paper: '#FBF8EF', ground: '#F1EEE7', ivory: '#FFFDF8', line: '#E5E1D6', text: '#33464B', muted: '#6B7C80', mist: '#EAF0F0',
};
const FONT = `'Noto Kufi Arabic','Segoe UI',Tahoma,Arial,sans-serif`;
const LATIN = `'Helvetica Neue',Arial,sans-serif`;
const MONO = `'SF Mono',Menlo,Consolas,'Courier New',monospace`;

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// قيمة متغيرة داخل جملة عربية (اسم، بريد، جهة، رمز، تاريخ، نص كتبه مستخدم): مرمّزة ومعزولة الاتجاه،
// فلا يقلب اسم لاتيني أو بريد ترتيب ما حوله، ولا تنتقل نقطته إلى طرف السطر
export const bdi = (v: unknown) => `<bdi>${esc(v)}</bdi>`;

// اتجاه الكتلة العربية بالسمتين والنمط معًا: بعض برامج البريد تحذف أحدها. لا align على الجداول (يجعلها عائمة)
const RTL = 'dir="rtl" align="right"';

// سطر عنوان البريد نص لا HTML: بلا أسطر جديدة ولا طول مفتوح
export const plain = (v: unknown, max = 60) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

// ── مكوّنات المتن ──
export const mailText = (html: string) => `<p ${RTL} style="font-size:15px;line-height:1.9;margin:0 0 18px;color:${MAIL.text};text-align:right">${html}</p>`;

// زر ممتلئ بلون الهوية الداكن وخط ذهبي سفلي، بجدول حتى يظهر في Outlook
export const mailButton = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 26px"><tr>
<td bgcolor="${MAIL.graphite}" style="background:${MAIL.graphite};border-radius:3px;border-bottom:2px solid ${MAIL.copper}"><a dir="rtl" href="${esc(href)}" style="display:inline-block;padding:15px 44px;font-family:${FONT};font-size:15px;font-weight:600;color:${MAIL.ivory};text-decoration:none">${esc(label)}</a></td></tr></table>`;

// رمز تحقق: بطاقة مستقلة بإطار ذهبي رفيع، أرقام أحادية العرض متباعدة، ثم مدة الصلاحية
export const mailCode = (code: string, note: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>
<td dir="rtl" align="center" bgcolor="${MAIL.ivory}" style="background:${MAIL.ivory};border:1px solid ${MAIL.copper};border-radius:4px;padding:22px 12px 18px">
<div style="font-family:${LATIN};font-size:10px;letter-spacing:3px;color:${MAIL.gold};margin:0 0 10px" dir="ltr">VERIFICATION CODE</div>
<div style="font-family:${MONO};font-size:34px;letter-spacing:12px;font-weight:600;color:${MAIL.graphite};direction:ltr;padding-left:12px">${bdi(code)}</div>
<div style="font-family:${FONT};font-size:13px;color:${MAIL.muted};margin:12px 0 0">${esc(note)}</div>
</td></tr></table>`;

// جدول بيانات بخطوط شعرية: [التسمية، القيمة، لاتيني؟]. القيمة معزولة وتنكسر عند أي حرف، فلا يمد رابط طويل الرسالة على الجوال
export const mailRows = (rows: [string, unknown, boolean?][]) => `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 22px;text-align:right">
${rows.map(([k, v, ltr]) => `<tr><td ${RTL} valign="top" style="padding:11px 0;border-bottom:1px solid ${MAIL.line};color:${MAIL.muted};width:34%;text-align:right">${esc(k)}</td><td dir="${ltr ? 'ltr' : 'rtl'}" align="right" style="padding:11px 0;border-bottom:1px solid ${MAIL.line};color:${MAIL.graphite};font-weight:600;text-align:right;word-break:break-word;overflow-wrap:anywhere${ltr ? `;direction:ltr;font-family:${LATIN}` : ''}">${bdi(v)}</td></tr>`).join('')}
</table>`;

// ملاحظة مميّزة بشريط ذهبي على الطرف
export const mailNote = (html: string) => `<p ${RTL} style="font-size:14px;line-height:1.9;margin:0 0 20px;padding:14px 16px;background:${MAIL.ivory};border-right:2px solid ${MAIL.copper};border-radius:2px;color:${MAIL.text};text-align:right">${html}</p>`;

// ── الإطار ──
// eyebrow: سطر صغير بالإنجليزية فوق العنوان (اسم المنتج)، في سطره وحده فلا يختلط بالعربي
// footnote: سطر أسفل البطاقة (افتراضيًا: تجاهل الرسالة إن لم تطلبها)
// عائلات الرسائل: السطر الإنجليزي فوق العنوان يدل على نوع الرسالة (مصدر واحد لكل الدوال)
export const MAIL_FAMILY = {
  access: 'SECURE ACCESS', journey: 'YOUR JOURNEY', capstone: 'CAPSTONE', sessions: 'SESSIONS',
  organization: 'ORGANIZATION', experts: 'EXPERT NETWORK', admin: 'ADMIN REPORT', general: 'MILESTONE IMPACT',
} as const;
export type MailFamily = keyof typeof MAIL_FAMILY;

// preheader: السطر الذي يظهر تحت العنوان في صندوق الوارد، مخفي داخل الرسالة
// عنوان فيه قيمة متغيرة: mailTitle`طلب تقدير من ${who}` نص للوسم title، وفي العنوان الظاهر تُعزل القيمة بـbdi()
// فلا تنتقل نقطة اسم لاتيني (Jr. أو Co.) إلى طرف السطر. السلسلة المجردة تُرمّز كما هي
export type MailTitle = { text: string; html: string };
export const mailTitle = (parts: TemplateStringsArray, ...vals: unknown[]): MailTitle => ({
  text: parts.reduce((a, p, i) => a + p + (i < vals.length ? String(vals[i] ?? '') : ''), ''),
  html: parts.reduce((a, p, i) => a + esc(p) + (i < vals.length ? bdi(vals[i]) : ''), ''),
});
export function mailShell(heading: string | MailTitle, body: string, { eyebrow = 'MILESTONE IMPACT', family, preheader = '', footnote = 'إن لم تطلب هذه الرسالة فتجاهلها، ولن يتغير شيء في حسابك.' }: { eyebrow?: string; family?: MailFamily; preheader?: string; footnote?: string } = {}) {
  if (family) eyebrow = MAIL_FAMILY[family];
  const title = typeof heading === 'string' ? heading : heading.text;
  const titleHtml = typeof heading === 'string' ? esc(heading) : heading.html;
  const year = new Date().getFullYear();
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${MAIL.ground};font-family:${FONT};color:${MAIL.graphite};-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(preheader)}&#8203;${'&nbsp;&zwnj;'.repeat(40)}</div>` : ''}
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" bgcolor="${MAIL.ground}" style="background:${MAIL.ground};text-align:right"><tr><td align="center" style="padding:40px 12px">
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;border-radius:6px;overflow:hidden;box-shadow:0 10px 30px rgba(11,39,47,.08);text-align:right">
<tr><td bgcolor="${MAIL.graphite}" style="background:${MAIL.graphite};padding:30px 40px 26px" align="left" dir="ltr">
  <!-- الشعار نصًا بخط الهوية وألوانها: يظهر دائمًا، ولو حجب البريد الصور الخارجية -->
  <div style="font-family:${LATIN};font-size:22px;line-height:1;color:${MAIL.ivory};letter-spacing:.4px;white-space:nowrap"><span style="color:${MAIL.copper};font-size:14px;vertical-align:3px">&#9670;</span>&nbsp;&nbsp;<b style="font-weight:700">Milestone</b> <span style="font-weight:300">Impact</span></div>
  <div style="width:48px;height:1px;line-height:1px;font-size:0;background:${MAIL.copper};margin:18px 0 0">&nbsp;</div>
</td></tr>
<tr><td ${RTL} bgcolor="${MAIL.paper}" style="background:${MAIL.paper};padding:36px 40px 10px;text-align:right">
  <div style="font-family:${LATIN};font-size:10px;letter-spacing:3.5px;color:${MAIL.gold};text-transform:uppercase;margin:0 0 12px;text-align:right" dir="ltr" align="right">${esc(eyebrow)}</div>
  <h1 ${RTL} style="font-family:${FONT};font-weight:700;font-size:23px;line-height:1.6;margin:0 0 18px;color:${MAIL.graphite};text-align:right">${titleHtml}</h1>
  <div ${RTL} style="font-size:15px;line-height:1.9;color:${MAIL.text};text-align:right">${body}</div>
</td></tr>
<tr><td bgcolor="${MAIL.paper}" style="background:${MAIL.paper};padding:6px 40px 32px">
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${MAIL.line}"><tr>
    <td ${RTL} style="padding-top:20px;font-size:13px;line-height:1.8;color:${MAIL.graphite};text-align:right"><span dir="ltr" style="font-family:${LATIN};font-weight:700">Milestone Impact</span><br><span style="font-size:12px;color:${MAIL.gold}">من النية… إلى الأثر</span></td>
    <td style="padding-top:20px;font-size:12px;color:${MAIL.muted}" align="left" valign="bottom"><a href="mailto:${MAIL_REPLY_TO}" style="color:${MAIL.muted};text-decoration:none;font-family:${LATIN}" dir="ltr">${MAIL_REPLY_TO}</a></td>
  </tr></table>
</td></tr>
</table>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px"><tr><td dir="rtl" style="padding:20px 8px 0;font-size:11px;line-height:1.9;color:${MAIL.muted}" align="center">
  ${footnote ? `${esc(footnote)}<br>` : ''}<span dir="ltr">© ${year} Milestone Impact</span> · جميع الحقوق محفوظة.
</td></tr></table>
</td></tr></table></body></html>`;
}

// ── الإرسال عبر Resend ──
// يعيد true عند القبول؛ وكل دالة تقرر ماذا تفعل بالفشل (ترمي أو تتجاهل)
// المرسل من نطاق العلامة نفسها (mail.sunkvalue.com موثّق في Resend بـ SPF وDKIM وDMARC)، والردود إلى بريد التواصل العام
export const MAIL_FROM_DEFAULT = 'Milestone Impact <no-reply@mail.sunkvalue.com>';
export const MAIL_REPLY_TO = 'mi@sunkvalue.com';
// لا مرسل احتياطي من نطاق آخر (D15): رفض Resend للنطاق (403 أو 422) عطل يُنبَّه إليه فورًا عبر قناة غير البريد،
// لا رسالة تخرج باسم نطاق لا تحرسه سجلات SPF وDKIM وDMARC الخاصة بالمنصة.

// نسخة نصية من القالب: فلاتر البريد تثق بالرسالة التي تحمل الصيغتين، وبعض البرامج تعرض النص وحده
export function plainText(html: string) {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    // خلية التسمية في mailRows تلاصق خلية القيمة: فاصل بينهما في النص، لا «الموعدالأحد»
    .replace(/<\/td><td/gi, ': </td><td')
    .replace(/<br\s*\/?>|<\/(p|div|tr|h1|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&#9670;/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// attachments: ملفات مرفقة بمحتواها base64 (مثل دعوة التقويم .ics)
export type MailAttachment = { filename: string; content: string; content_type?: string };
type DeliverOpts = { key?: string; from?: string; attachments?: MailAttachment[] };
export async function deliverResult(to: string, subject: string, html: string, { key = Deno.env.get('RESEND_API_KEY') || '', from = MAIL_FROM_DEFAULT, attachments = [] }: DeliverOpts = {}) {
  if (!key) { console.error('RESEND_API_KEY missing; mail to', to, 'not sent'); return { ok: false, status: 0, unconfigured: true }; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text: plainText(html), reply_to: MAIL_REPLY_TO, ...(attachments.length ? { attachments } : {}) }),
    });
    const text = await res.text();
    if (!res.ok) { console.error('mail failed', res.status, text.slice(0, 300)); return { ok: false, status: res.status, rejected: res.status === 403 || res.status === 422 }; }
    let id: string | null = null;
    try { id = JSON.parse(text)?.id ?? null; } catch { /* رد بلا معرّف */ }
    return { ok: true, status: res.status, id };
  } catch (e) { console.error('mail failed', e); return { ok: false, status: 0 }; }
}
export const deliver = async (to: string, subject: string, html: string, opts: DeliverOpts = {}) => (await deliverResult(to, subject, html, opts)).ok;

// تنبيه المالك عبر قناة غير البريد (D15): رابط ويب (Slack أو Teams أو Telegram أو غيرها) في LEADERS_ALERT_WEBHOOK.
// حين يكون العطل في البريد نفسه لا يصل تنبيه بالبريد، فهذه القناة لا تعتمد عليه.
const WEBHOOK_TIMEOUT_MS = 5000;
export async function alertWebhook(kind: string, detail: Record<string, unknown>) {
  // سلسلة التنبيهات في سلاك إن ضُبط البوت: لا يُنتظر ولا يُحسب في نتيجة الرابط (slack.ts)
  slackAlert(kind, detail);
  const url = Deno.env.get('LEADERS_ALERT_WEBHOOK') || '';
  if (!url) { console.error('alert (no webhook):', kind, JSON.stringify(detail)); return false; }
  try {
    const text = `[Milestone Impact] ${kind}: ${JSON.stringify(detail)}`;
    // مهلة قصيرة: رابط بطيء لا يؤخر رد طلب الرمز المحجوب
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text, kind, detail }), signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
    return r.ok;
  } catch (e) { console.error('alertWebhook:', e); return false; }
}

// ── العداد الموحد (D15): كل بريد يمر من هنا، وسجله في leaders.mail_events بلا متن ولا رمز ──
export type MailKind = 'code' | 'alert' | 'notify' | 'bulk' | 'contact';
export type SendOutcome = { ok: boolean; reason?: 'mail_cap' | 'mail_share' | 'mail_kind' | 'mail_failed' | 'mail_unconfigured'; id?: string | null };
// deno-lint-ignore no-explicit-any
type Client = any;
const eventsOf = (client: Client) => (typeof client?.schema === 'function' ? client.schema('leaders') : client).from('mail_events');

export async function mailCounts(client: Client, since = new Date(Date.now() - 864e5).toISOString()) {
  const base = () => eventsOf(client).select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', since);
  const [all, non] = await Promise.all([base(), base().not('kind', 'in', '(code,alert)')]);
  if (all.error || non.error) { console.error('mail_events count:', all.error || non.error); return null; }   // العداد غير مقروء الآن
  return { sent: all.count ?? 0, nonCode: non.count ?? 0 };
}

// تنبيه تعذّر العداد مرة كل عشر دقائق لكل نسخة من الدالة، فلا يُغرق الرابط
const COUNTER_ALERT_MS = 10 * 60e3;
let counterAlertAt = 0;
// الدوال التي لا تمرر alert (admin-api وuser-api وsend-otp) تنبّه بالرابط وحده بلا سجل تهدئة، فتُهدَّأ هنا لكل نوع
// في كل نسخة، وإلا أرسل كل طلب رمز محجوب في يوم ممتلئ رسالة إلى قناة المالك. المهلة كمهلة alertOps للنوع نفسه
export const WEBHOOK_ALERT_MS: Record<string, number> = { mail_cap: 6 * 36e5, mail_rejected: 36e5 };
const webhookAlertAt = new Map<string, number>();
export const resetWebhookAlerts = () => webhookAlertAt.clear();   // للاختبار

// sourceShare: نصيب مصدر واحد من السقف (مصفوفة التأثير مثلًا)، فلا تستنزف بوابة عامة رموز دخول غيرها
// بصمة العنوان في سجل البريد: يُبحث بها عن بريد يكتبه المدير («لماذا لم يصل؟») ولا يُستخرج منها عنوان.
// مملّحة بسر المنصة نفسه في كل الدوال، فالبصمة واحدة أيًّا كانت الدالة المرسلة
export async function addressHash(email: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mail:${Deno.env.get('LEADERS_TOKEN_PEPPER') || ''}:${String(email || '').trim().toLowerCase()}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
// صف السجل بأعمدة مركز البريد، ويُعاد بدونها إن رُفض (قبل ترحيل 20261114110000): العداد لا يتعطل بعمود ناقص
// deno-lint-ignore no-explicit-any
async function logEvent(client: Client, row: Record<string, any>, extra: Record<string, any>) {
  let { error } = await eventsOf(client).insert({ ...row, ...extra });
  if (error) ({ error } = await eventsOf(client).insert(row));
  if (error) console.error('mail_events insert:', error);
}

// force: قرار صريح من المدير بإرسال رسالة من صندوق «لم يُرسل»: يتجاوز حصة غير الرموز ويبقى تحت السقف الكلي كالرمز
// (لا احتياط التنبيه فوق السقف)
// alert: قناة تنبيه المالك لأحداث البريد (السقف، و70%، ورفض المزوّد، وتعذّر العداد). leaders-api يمرر alertOps
// (الرابط والبريد بتهدئة لكل نوع)، وما سواه الرابط وحده. رسالة التنبيه نفسها تنبّه بالرابط وحده، فلا حلقة
// queued: رسالة في الطابور أصلًا (تفريغ المهمة الساعية): حجبها بالحصة أُبلغ عنه سلاك عند دخولها فلا يُعاد كل ساعة
export type MailAlert = (kind: string, detail: Record<string, unknown>) => Promise<unknown>;
export async function sendCounted(client: Client, to: string, subject: string, html: string,
  { kind, source, ref = null, cap, sourceShare, force = false, alert, purpose = null, queued = false, ...opts }: DeliverOpts & { kind: MailKind; source: string; ref?: string | null; cap: number; sourceShare?: number; force?: boolean; alert?: MailAlert; purpose?: string | null; queued?: boolean }): Promise<SendOutcome> {
  // عميل سلاسل سلاك قبل أي تنبيه: user-api وsend-otp لا يمررانه في غير هذا
  slackUse(client);
  const via: MailAlert = kind === 'alert' || !alert ? alertWebhook : alert;
  // التنبيه لا يُفشل الإرسال أبدًا
  const raise = (k: string, d: Record<string, unknown>) => {
    const calm = via === alertWebhook ? WEBHOOK_ALERT_MS[k] ?? 0 : 0;
    if (calm) {
      if ((webhookAlertAt.get(k) ?? 0) > Date.now() - calm) return Promise.resolve();
      webhookAlertAt.set(k, Date.now());
    }
    return Promise.resolve().then(() => via(k, d)).catch((e) => console.error('mail alert:', k, e));
  };
  // سلاك (slack.ts): كل رمز بحالته، وكل بريد غيره لم يصل بسببه. لا يُنتظر، ولا يمر بالعداد
  const report = (status: 'sent' | 'blocked' | 'failed', reason: string | null = null) => {
    if (kind === 'code') slackCode(client, { status, purpose, to, source, reason });
    else if (status !== 'sent') slackMail(client, { kind, to, source, reason: reason || status });
  };
  const counts = await mailCounts(client);
  // عنوان رسالة الرمز لا يُحفظ: بعض الدوال تكتب الرمز في عنوانها، والسجل لا يحمل رمزًا أبدًا (D15)
  const extra = { to_hash: await addressHash(to), subject: kind === 'code' ? null : String(subject || '').slice(0, 300) };
  if (counts && sourceShare != null) {
    const { count, error } = await eventsOf(client).select('id', { count: 'exact', head: true }).eq('status', 'sent').eq('source', source)
      .gte('created_at', new Date(Date.now() - 864e5).toISOString());
    if (!error && (count ?? 0) >= Math.floor(cap * sourceShare)) {
      await logEvent(client, { kind, source, ref, status: 'blocked', to_domain: domainOf(to) }, extra);
      if (!queued) report('blocked', 'mail_share');
      return { ok: false, reason: 'mail_share' };
    }
  }
  const log = (status: string, resend_id: string | null = null) => logEvent(client, { kind, source, ref, status, resend_id, to_domain: domainOf(to) }, extra);
  if (counts) {
    const d = mailDecision(force ? 'code' : kind, counts, cap);
    if (!d.ok) {
      await log('blocked');
      if (!queued || (d.reason !== 'mail_cap' && d.reason !== 'mail_share')) report('blocked', String(d.reason));
      // امتلاء السقف حدث يُنبَّه إليه (والتهدئة عند alertOps، أو في raise للرابط وحده)؛ حجب الحصة سير عادي يدخل به الإشعار الطابور.
      // التنبيه المحجوب بعد احتياطه لا ينبّه عن نفسه: وصل الرابط قبله
      if (d.reason === 'mail_cap' && kind !== 'alert') await raise('mail_cap', { source, kind, sent: counts.sent, cap });
      return { ok: false, reason: d.reason as SendOutcome['reason'] };
    }
  } else {
    // تعذّر العداد (D15): لا رسالة بلا قرار سقف إلا الرموز والتنبيه. ما سواها يُحجب بسبب السقف، والجماعي يدخل
    // الطابور عند مرسله، والمالك يُنبَّه
    if (Date.now() - counterAlertAt > COUNTER_ALERT_MS) { counterAlertAt = Date.now(); await raise('mail_counter_unavailable', { source, kind }); }
    if (!PRIORITY_KINDS.has(kind)) { await log('blocked'); if (!queued) report('blocked', 'mail_counter_unavailable'); return { ok: false, reason: 'mail_cap' }; }
  }
  const r = await deliverResult(to, subject, html, opts);
  await log(r.ok ? 'sent' : 'failed', r.ok ? (r.id ?? null) : null);
  report(r.ok ? 'sent' : 'failed', r.ok ? null : r.unconfigured ? 'mail_unconfigured' : r.rejected ? `rejected ${r.status}` : `mail_failed ${r.status ?? 0}`);
  if (!r.ok && r.rejected) await raise('mail_rejected', { source, kind, status: r.status, from: opts.from || MAIL_FROM_DEFAULT });
  if (r.ok && counts && crossesAlert(counts.sent, cap)) await raise('mail_quota_70', { sent: counts.sent + 1, cap, source });
  if (r.ok) return { ok: true, id: r.id ?? null };
  return { ok: false, reason: r.unconfigured ? 'mail_unconfigured' : 'mail_failed' };
}

// دعوة تقويم (iCalendar) لموعد واحد: تُضاف إلى أي تقويم بنقرة. النصوص تُهرَّب حسب RFC 5545
export function icsEvent({ uid, start, end, title, description = '', url = '' }: { uid: string; start: string; end: string; title: string; description?: string; url?: string }) {
  const t = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const x = (v: string) => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Milestone Impact//Leaders//AR', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}@sunkvalue.com`, `DTSTAMP:${t(new Date().toISOString())}`, `DTSTART:${t(start)}`, `DTEND:${t(end)}`,
    `SUMMARY:${x(title)}`, ...(description ? [`DESCRIPTION:${x(description)}`] : []), ...(url ? [`URL:${url}`, `LOCATION:${x(url)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${x(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  const text = lines.join('\r\n') + '\r\n';
  return { filename: 'session.ics', content: btoa(String.fromCharCode(...new TextEncoder().encode(text))), content_type: 'text/calendar; charset=utf-8; method=PUBLISH' };
}
