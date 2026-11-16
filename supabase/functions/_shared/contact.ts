// ════════════════════════════════════════════════════════════════
// طلبات التواصل (public.contact_requests): الإدراج وتنبيه الإدارة وتأكيد المرسل
// ════════════════════════════════════════════════════════════════
// مستخرجة من send-otp. الإدراج منفصل عن بريد التأكيد: النموذج يستدعي الثلاثة كما كان، والمساعد الآلي يدرج
// وينبّه الإدارة وحدهما، لأنه أبلغ الزائر بالوعد نفسه في المحادثة (لا بريد ثانٍ بوعد مختلف).
// المرسل يُمرَّر من الدالة (sendCounted بمصدرها)، فيبقى لكل دالة سطرها في العداد الموحد.
// القيم تُقرأ من الصف المحفوظ لا من جسم الطلب، وتُرمَّز قبل وضعها في HTML.
import { bdi, mailButton, mailNote, mailRows, mailShell, mailText, mailTitle, plain } from './mail.ts';
import { SITES } from './sites.js';
import { PROMISE_AR } from './hours.js';
import { slackPost } from './slack.ts';
import { route } from './notify-routing.js';
import { notifySettings } from './notify-settings.ts';

// deno-lint-ignore no-explicit-any
type SB = any;
export type ContactRow = Record<string, unknown>;
export type MailSend = (to: string, subject: string, html: string) => Promise<boolean>;

// صفوف المساعد موسومة في context بهذه البادئة، وتُستثنى من حدود النموذج (countSince في send-otp)
export const AGENT_CONTEXT_PREFIX = '[agent]';
// صفوف النموذج وحدها: context فارغ أو لا يبدأ بالبادئة
export const formOnly = (q: SB) => q.or(`context.is.null,context.not.like.${AGENT_CONTEXT_PREFIX}*`);
// البادئة يضعها الخادم وحده: نص الزائر في النموذج العام تُنزع منه أي بادئة مماثلة قبل الحفظ، فلا يفلت صف
// من حدود النموذج بكتابة [agent] في أول السياق
export const formContext = (s: string) => String(s ?? '').replace(/^(?:\s*\[\s*agent\s*\]\s*)+/i, '').trim();

export const CONTACT_SELECT = 'id, name, organization, email, phone, interest, interest_label, product, created_at';

export async function insertContactRequest(sb: SB, row: ContactRow, ip: string | null) {
  return await sb.from('contact_requests').insert({ ...row, ip }).select(CONTACT_SELECT).single();
}

// يحجز الرسالة قبل إرسالها؛ القيد الفريد يمنع التكرار. أي خطأ آخر يمنع الإرسال.
async function claim(sb: SB, kind: 'notify' | 'confirm', ref: string): Promise<boolean> {
  const { error } = await sb.from('mail_log').insert({ kind, ref });
  if (!error) return true;
  if (error.code !== '23505') console.error('mail_log:', error);
  return false;
}

// أسماء صفحات النموذج (send-otp). المصدر الواحد لعنوان البريد وسطر Slack
export const CONTACT_PAGES: Record<string, string> = { 'MI-HOME': 'الصفحة الرئيسية', 'MI-LEADERS': 'صفحة برنامج القادة', 'MI-ASSESSMENT': 'مقياس جاهزية الأثر' };
// سطر Slack لطلب التواصل (contact_request، قرار المالك: بريد وSlack معًا): نوعه وصفحته من القائمة الثابتة ورابط اللوحة.
// لا اسم ولا جهة ولا بريد ولا جوال ولا نوع الطلب كما كتبه الزائر: كلها في البريد وحده (التصور 6.6)
export const contactLine = (product: unknown) => `📬 طلب تواصل جديد · ${CONTACT_PAGES[String(product ?? '')] ?? 'صفحة أخرى'}\n${SITES.admin}/`;

// pageLabel: اسم المصدر من الدالة المستدعية (أسماء صفحات النموذج في send-otp)
// slack: سطر Slack من هنا (النموذج العام). المساعد الآلي ينشر سطر التحويل الخاص به (agent-chat/handler.ts) فلا يطلبه
export async function notifyAdmin(sb: SB, r: ContactRow, send: MailSend, adminEmail: string, pageLabel: string, sourceLabel = '', { slack = false }: { slack?: boolean } = {}) {
  if (!(await claim(sb, 'notify', String(r.id)))) return;
  // البريد مقفل (يُرسل دائمًا)، وسطر Slack بما حفظه المالك في «التوجيه»
  if (slack && route('contact_request', await notifySettings(sb)).slack) slackPost('alerts', contactLine(r.product), { client: sb });
  const dateStr = new Date(r.created_at as string).toLocaleString('ar-SA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const html = mailShell(mailTitle`طلب تواصل جديد من ${r.name}`, `
${mailText(`${bdi(dateStr)} · ${bdi(pageLabel)}${sourceLabel ? ` · ${bdi(sourceLabel)}` : ''}`)}
${mailRows([
  ['الاسم', r.name as string],
  ['الجهة', (r.organization as string) || 'غير مذكور'],
  ['البريد', r.email as string, true],
  ['الجوال', (r.phone as string) || 'غير مذكور', true],
  ['نوع الطلب', (r.interest_label as string) || (r.interest as string) || 'غير مذكور'],
  ['المصدر', pageLabel],
])}
${mailButton(SITES.admin, 'افتح لوحة الإدارة')}`, { family: 'admin', preheader: 'طلب تواصل جديد من الموقع', footnote: '' });
  if (!adminEmail) { console.error('contact notify skipped: CONTACT_NOTIFY_EMAIL and LEADERS_ALERT_EMAIL are unset'); return; }
  await send(adminEmail, `طلب جديد من ${plain(r.name as string)} · ${plain(pageLabel)}`, html);
}

export async function confirmSender(sb: SB, r: ContactRow, send: MailSend) {
  if (!(await claim(sb, 'confirm', String(r.id)))) return;
  const isLeaders = r.product === 'MI-LEADERS';
  const homeHtml = mailShell(mailTitle`وصلتنا رسالتكم، ${r.name}`, `
${mailText(`شكرًا لتواصلكم مع Milestone Impact. ${PROMISE_AR}.`)}
${mailNote(`طلبكم: ${bdi((r.interest_label as string) || (r.interest as string) || 'استفسار عام')}`)}`, { family: 'general', preheader: 'يرد عليكم الفريق خلال 4 ساعات عمل', footnote: 'استلمتم هذه الرسالة لأنكم أرسلتم طلب تواصل من موقعنا.' });
  const leadersHtml = mailShell(mailTitle`أهلًا بكم، ${r.name}`, `
${mailText(`يسرّنا استلام طلب انضمامكم إلى برنامج القادة من Milestone Impact. ${PROMISE_AR}.`)}`, { family: 'general', preheader: 'يرد عليكم الفريق خلال 4 ساعات عمل', footnote: 'استلمتم هذه الرسالة لأنكم أرسلتم طلب انضمام من موقعنا.' });
  const subject = isLeaders ? `تأكيد طلبكم · برنامج القادة` : `استلمنا طلبكم · Milestone Impact`;
  await send(r.email as string, subject, isLeaders ? leadersHtml : homeHtml);
}
