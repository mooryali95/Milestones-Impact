// ════════════════════════════════════════════════════════════════
// قالب البريد الموحّد لكل دوال الحافة بهوية Milestone Impact (الوضع الفاتح)
// ════════════════════════════════════════════════════════════════
// مصدر واحد لشكل الرسائل: leaders-api وuser-api وadmin-api وsend-otp
// تستورد من هنا ولا تحمل قوالب خاصة. أرضية Mist، بطاقة بيضاء بخط شعري،
// الشعار ثم خط ذهبي، عنوان خفيف الوزن، زر بإطار ذهبي، وتوقيع وحقوق.
// جداول لا عناصر حديثة حتى يظهر متطابقًا في Outlook وGmail وApple Mail.
// كل قيمة متغيرة تمر عبر esc() قبل وضعها في HTML.

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

// سطر عنوان البريد نص لا HTML: بلا أسطر جديدة ولا طول مفتوح
export const plain = (v: unknown, max = 60) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

// ── مكوّنات المتن ──
export const mailText = (html: string) => `<p style="font-size:15px;line-height:1.9;margin:0 0 18px;color:${MAIL.text}">${html}</p>`;

// زر ممتلئ بلون الهوية الداكن وخط ذهبي سفلي، بجدول حتى يظهر في Outlook
export const mailButton = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 26px"><tr>
<td bgcolor="${MAIL.graphite}" style="background:${MAIL.graphite};border-radius:3px;border-bottom:2px solid ${MAIL.copper}"><a href="${esc(href)}" style="display:inline-block;padding:15px 44px;font-family:${FONT};font-size:15px;font-weight:600;color:${MAIL.ivory};text-decoration:none">${esc(label)}</a></td></tr></table>`;

// رمز تحقق: بطاقة مستقلة بإطار ذهبي رفيع، أرقام أحادية العرض متباعدة، ثم مدة الصلاحية
export const mailCode = (code: string, note: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>
<td align="center" bgcolor="${MAIL.ivory}" style="background:${MAIL.ivory};border:1px solid ${MAIL.copper};border-radius:4px;padding:22px 12px 18px">
<div style="font-family:${LATIN};font-size:10px;letter-spacing:3px;color:${MAIL.gold};margin:0 0 10px" dir="ltr">VERIFICATION CODE</div>
<div style="font-family:${MONO};font-size:34px;letter-spacing:12px;font-weight:600;color:${MAIL.graphite};direction:ltr;padding-left:12px">${esc(code)}</div>
<div style="font-family:${FONT};font-size:13px;color:${MAIL.muted};margin:12px 0 0">${esc(note)}</div>
</td></tr></table>`;

// جدول بيانات بخطوط شعرية: [التسمية، القيمة، لاتيني؟]
export const mailRows = (rows: [string, unknown, boolean?][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 22px">
${rows.map(([k, v, ltr]) => `<tr><td style="padding:11px 0;border-bottom:1px solid ${MAIL.line};color:${MAIL.muted};width:34%">${esc(k)}</td><td style="padding:11px 0;border-bottom:1px solid ${MAIL.line};color:${MAIL.graphite};font-weight:600${ltr ? `;direction:ltr;text-align:right;font-family:${LATIN}` : ''}">${esc(v)}</td></tr>`).join('')}
</table>`;

// ملاحظة مميّزة بشريط ذهبي على الطرف
export const mailNote = (html: string) => `<p style="font-size:14px;line-height:1.9;margin:0 0 20px;padding:14px 16px;background:${MAIL.ivory};border-right:2px solid ${MAIL.copper};border-radius:2px;color:${MAIL.text}">${html}</p>`;

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
export function mailShell(title: string, body: string, { eyebrow = 'MILESTONE IMPACT', family, preheader = '', footnote = 'إن لم تطلب هذه الرسالة فتجاهلها، ولن يتغير شيء في حسابك.' }: { eyebrow?: string; family?: MailFamily; preheader?: string; footnote?: string } = {}) {
  if (family) eyebrow = MAIL_FAMILY[family];
  const year = new Date().getFullYear();
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${MAIL.ground};font-family:${FONT};color:${MAIL.graphite};-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(preheader)}&#8203;${'&nbsp;&zwnj;'.repeat(40)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${MAIL.ground}" style="background:${MAIL.ground}"><tr><td align="center" style="padding:40px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;border-radius:6px;overflow:hidden;box-shadow:0 10px 30px rgba(11,39,47,.08)">
<tr><td bgcolor="${MAIL.graphite}" style="background:${MAIL.graphite};padding:30px 40px 26px" align="left" dir="ltr">
  <!-- الشعار نصًا بخط الهوية وألوانها: يظهر دائمًا، ولو حجب البريد الصور الخارجية -->
  <div style="font-family:${LATIN};font-size:22px;line-height:1;color:${MAIL.ivory};letter-spacing:.4px;white-space:nowrap"><span style="color:${MAIL.copper};font-size:14px;vertical-align:3px">&#9670;</span>&nbsp;&nbsp;<b style="font-weight:700">Milestone</b> <span style="font-weight:300">Impact</span></div>
  <div style="width:48px;height:1px;line-height:1px;font-size:0;background:${MAIL.copper};margin:18px 0 0">&nbsp;</div>
</td></tr>
<tr><td bgcolor="${MAIL.paper}" style="background:${MAIL.paper};padding:36px 40px 10px">
  <div style="font-family:${LATIN};font-size:10px;letter-spacing:3.5px;color:${MAIL.gold};text-transform:uppercase;margin:0 0 12px" dir="ltr" align="right">${esc(eyebrow)}</div>
  <h1 style="font-family:${FONT};font-weight:700;font-size:23px;line-height:1.6;margin:0 0 18px;color:${MAIL.graphite}">${esc(title)}</h1>
  <div style="font-size:15px;line-height:1.9;color:${MAIL.text}">${body}</div>
</td></tr>
<tr><td bgcolor="${MAIL.paper}" style="background:${MAIL.paper};padding:6px 40px 32px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${MAIL.line}"><tr>
    <td style="padding-top:20px;font-size:13px;line-height:1.8;color:${MAIL.graphite}"><span dir="ltr" style="font-family:${LATIN};font-weight:700">Milestone Impact</span><br><span style="font-size:12px;color:${MAIL.gold}">من النية… إلى الأثر</span></td>
    <td style="padding-top:20px;font-size:12px;color:${MAIL.muted}" align="left" valign="bottom"><a href="mailto:${MAIL_REPLY_TO}" style="color:${MAIL.muted};text-decoration:none;font-family:${LATIN}" dir="ltr">${MAIL_REPLY_TO}</a></td>
  </tr></table>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px"><tr><td style="padding:20px 8px 0;font-size:11px;line-height:1.9;color:${MAIL.muted}" align="center">
  ${footnote ? `${esc(footnote)}<br>` : ''}<span dir="ltr">© ${year} Milestone Impact</span> · جميع الحقوق محفوظة.
</td></tr></table>
</td></tr></table></body></html>`;
}

// ── الإرسال عبر Resend ──
// يعيد true عند القبول؛ وكل دالة تقرر ماذا تفعل بالفشل (ترمي أو تتجاهل)
// المرسل من نطاق العلامة نفسها (mail.sunkvalue.com موثّق في Resend بـ SPF وDKIM وDMARC)، والردود إلى بريد التواصل العام
export const MAIL_FROM_DEFAULT = 'Milestone Impact <no-reply@mail.sunkvalue.com>';
export const MAIL_REPLY_TO = 'mi@sunkvalue.com';
// احتياط: إن رفض Resend النطاق الجديد (مفتاح مقيّد بالنطاق القديم مثلًا) لا تضيع الرسالة
const MAIL_FROM_FALLBACK = 'Milestone Impact <milestoneimpact@basserh.com>';

// نسخة نصية من القالب: فلاتر البريد تثق بالرسالة التي تحمل الصيغتين، وبعض البرامج تعرض النص وحده
export function plainText(html: string) {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<br\s*\/?>|<\/(p|div|tr|h1|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&#9670;/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

export async function deliver(to: string, subject: string, html: string, { key = Deno.env.get('RESEND_API_KEY') || '', from = MAIL_FROM_DEFAULT } = {}) {
  if (!key) { console.error('RESEND_API_KEY missing; mail to', to, 'not sent'); return false; }
  const send = (sender: string) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender, to: [to], subject, html, text: plainText(html), reply_to: MAIL_REPLY_TO }),
  });
  try {
    let res = await send(from);
    if (!res.ok && (res.status === 403 || res.status === 422) && from !== MAIL_FROM_FALLBACK) {
      console.error('mail sender rejected, retrying with fallback', res.status, await res.text());
      res = await send(MAIL_FROM_FALLBACK);
    }
    if (!res.ok) { console.error('mail failed', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error('mail failed', e); return false; }
}
