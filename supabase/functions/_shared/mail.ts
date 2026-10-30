import { SITES } from './sites.js';
// ════════════════════════════════════════════════════════════════
// قالب البريد الموحّد لكل دوال الحافة بهوية Milestone Impact (الوضع الفاتح)
// ════════════════════════════════════════════════════════════════
// مصدر واحد لشكل الرسائل: leaders-api وuser-api وadmin-api وsend-otp
// تستورد من هنا ولا تحمل قوالب خاصة. أرضية Mist، بطاقة بيضاء بخط شعري،
// الشعار ثم خط ذهبي، عنوان خفيف الوزن، زر بإطار ذهبي، وتوقيع وحقوق.
// جداول لا عناصر حديثة حتى يظهر متطابقًا في Outlook وGmail وApple Mail.
// كل قيمة متغيرة تمر عبر esc() قبل وضعها في HTML.

const LOGO_URL = `${SITES.mi}/assets/brand/png/milestone-impact-400w.png`;
export const MAIL = { graphite: '#0B272F', gold: '#A97A2E', mist: '#F7F8F6', line: '#DCE2E1', slate: '#2C4148', muted: '#6E8085' };
const FONT = `'Noto Kufi Arabic',Tahoma,Arial,sans-serif`;
const LATIN = `Arial,sans-serif`;

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// سطر عنوان البريد نص لا HTML: بلا أسطر جديدة ولا طول مفتوح
export const plain = (v: unknown, max = 60) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

// ── مكوّنات المتن ──
export const mailText = (html: string) => `<p style="font-size:15px;line-height:1.8;margin:0 0 16px">${html}</p>`;

export const mailButton = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 22px"><tr>
<td style="border:1px solid ${MAIL.gold};border-radius:2px"><a href="${esc(href)}" style="display:inline-block;padding:13px 34px;font-family:${FONT};font-size:14px;color:${MAIL.graphite};text-decoration:none;letter-spacing:0">${esc(label)}</a></td></tr></table>`;

// رمز تحقق: أرقام كبيرة خفيفة الوزن، ثم مدة الصلاحية
export const mailCode = (code: string, note: string) => `
<p style="text-align:center;font-family:${LATIN};font-size:32px;letter-spacing:10px;font-weight:300;color:${MAIL.graphite};margin:0 0 8px;direction:ltr">${esc(code)}</p>
<p style="text-align:center;font-size:13px;color:${MAIL.muted};margin:0 0 6px">${esc(note)}</p>`;

// جدول بيانات بخطوط شعرية: [التسمية، القيمة، لاتيني؟]
export const mailRows = (rows: [string, unknown, boolean?][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 20px">
${rows.map(([k, v, ltr]) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${MAIL.line};color:${MAIL.muted};width:34%">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${MAIL.line};color:${MAIL.graphite}${ltr ? `;direction:ltr;text-align:right;font-family:${LATIN}` : ''}">${esc(v)}</td></tr>`).join('')}
</table>`;

// ملاحظة مميّزة بشريط ذهبي على الطرف
export const mailNote = (html: string) => `<p style="font-size:14px;line-height:1.8;margin:0 0 18px;padding:12px 14px;background:${MAIL.mist};border-right:2px solid ${MAIL.gold};border-radius:2px">${html}</p>`;

// ── الإطار ──
// eyebrow: سطر صغير بالإنجليزية فوق العنوان (اسم المنتج)
// footnote: سطر أسفل البطاقة (افتراضيًا: تجاهل الرسالة إن لم تطلبها)
export function mailShell(title: string, body: string, { eyebrow = 'MILESTONE IMPACT', footnote = 'إن لم تطلب هذه الرسالة فتجاهلها، ولن يتغير شيء في حسابك.' } = {}) {
  const year = new Date().getFullYear();
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${MAIL.mist};font-family:${FONT};color:${MAIL.graphite}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAIL.mist}"><tr><td align="center" style="padding:36px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${MAIL.line};border-radius:2px">
<tr><td style="padding:30px 36px 0" align="left" dir="ltr">
  <img src="${LOGO_URL}" width="132" alt="Milestone Impact" style="display:block;width:132px;height:auto;border:0;font-family:${LATIN};font-size:18px;color:${MAIL.graphite}">
</td></tr>
<tr><td style="padding:22px 36px 0"><div style="height:1px;line-height:1px;font-size:0;background:${MAIL.gold}">&nbsp;</div></td></tr>
<tr><td style="padding:26px 36px 8px">
  <div style="font-family:${LATIN};font-size:10px;letter-spacing:3px;color:${MAIL.gold};text-transform:uppercase;margin:0 0 8px" dir="ltr" align="right">${esc(eyebrow)}</div>
  <h1 style="font-family:${FONT};font-weight:300;font-size:22px;line-height:1.5;margin:0 0 16px;color:${MAIL.graphite}">${esc(title)}</h1>
  <div style="font-size:15px;line-height:1.9;color:${MAIL.slate}">${body}</div>
</td></tr>
<tr><td style="padding:8px 36px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${MAIL.line}"><tr>
    <td style="padding-top:16px;font-size:13px;color:${MAIL.slate}">Milestone Impact · <span style="color:${MAIL.gold}">مَعلَم</span><br><span style="font-size:12px;color:${MAIL.muted}">من النية… إلى الأثر</span></td>
  </tr></table>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 8px;font-size:11px;line-height:1.8;color:${MAIL.muted}" align="center">
  ${footnote ? `${esc(footnote)}<br>` : ''}جميع الحقوق محفوظة <span dir="ltr">© ${year} Milestone Impact</span>. هذه الرسالة ومحتواها مخصصة لمستلمها فقط.
</td></tr></table>
</td></tr></table></body></html>`;
}

// ── الإرسال عبر Resend ──
// يعيد true عند القبول؛ وكل دالة تقرر ماذا تفعل بالفشل (ترمي أو تتجاهل)
export const MAIL_FROM_DEFAULT = 'Milestone Impact <milestoneimpact@basserh.com>';
export async function deliver(to: string, subject: string, html: string, { key = Deno.env.get('RESEND_API_KEY') || '', from = MAIL_FROM_DEFAULT } = {}) {
  if (!key) { console.error('RESEND_API_KEY missing; mail to', to, 'not sent'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) { console.error('mail failed', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error('mail failed', e); return false; }
}
