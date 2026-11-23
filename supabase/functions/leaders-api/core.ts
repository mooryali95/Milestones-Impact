// ════════════════════════════════════════════════════════════════
// أساسيات leaders-api: الاتصال، التشفير، الردود، البريد
// ════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { STUCK_MAIL_SUBJECT, stuckMailText } from './onboarding.js';
import { stageText } from './nudge.js';
import { RETAKE_BUTTON, RETAKE_MAIL_SUBJECT, RETAKE_TITLE, retakeText } from './retake.js';
import { alertWebhook, slackAlertDelivered, bdi, esc, MAIL_FROM_DEFAULT, type MailAttachment, mailButton, mailCode, mailCounts, type MailKind, mailNote, mailRows, mailShell, mailText, type MailFamily, type MailTitle, mailTitle, sendCounted } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { slackCode, slackConfigured, slackMail, slackUse } from '../_shared/slack.ts';
import { route, SLACK_DOWN_MS, SLACK_DOWN_SUBJECT, slackStateOf } from '../_shared/notify-routing.js';
import { notifySettings } from '../_shared/notify-settings.ts';
import { passOk, reserveAttempt, signPass } from './guards.js';
import { POLICY_DIGEST } from './policy-digest.js';
import { POLICY_MATERIAL_VERSION } from './labels.js';
import { WORKSHOP_NO_HALL_NOTE } from './features.js';
import { mailBudget, queueEta } from './mail-center.js';
import { ERASE_DELETED, ERASE_GROUNDS, ERASE_KEPT, leftAr, PAYMENT_RETENTION_YEARS } from './erasure.js';
import { inFlush, mailDayStart } from '../_shared/mail-budget.js';

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
  // سقف مطلق من لحظة الدخول مهما تجدد الاستعمال (M9): بعده دخول جديد. وجلسة العرض قصيرة لأن رابطها يُعرض على شاشة
  sessionMaxDays: 30,
  demoSessionHours: 8,
  // إضافة مفتاح مرور تحتاج دخولًا حديثًا (M3): رمز مسروق قديم لا يتحول إلى مفتاح دائم
  passkeyStepUpMinutes: 60,
  codeMinutes: 15,
};

// سران إلزاميان: بدونهما لا شيء يعمل، والفشل عند الإقلاع أوضح من فشل صامت لاحقًا (docs/SECRETS.md)
if (!CONFIG.serviceKey || !CONFIG.pepper) throw new Error('leaders-api: SUPABASE_SERVICE_ROLE_KEY وLEADERS_TOKEN_PEPPER إلزاميان، انظر docs/SECRETS.md');

export const db = createClient(CONFIG.url, CONFIG.serviceKey, {
  db: { schema: 'leaders' },
  auth: { persistSession: false },
});
// سلاسل سلاك اليومية تُحفظ في leaders.slack_threads بهذا العميل
slackUse(db);

// المخطط العام: لجلسات الإدارة (api_sessions) والتخزين فقط
export const publicDb = createClient(CONFIG.url, CONFIG.serviceKey, { auth: { persistSession: false } });
export const storage = publicDb.storage;
export const BUCKET = 'leaders-private';

// ── الردود ──
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && CONFIG.origins.concat(CONFIG.adminOrigins).includes(origin) ? origin : CONFIG.origins[0],
  // x-client-build: معرّف بناء الواجهة (المرحلة 4، البند 4). العميل لا يرسله إلا بعد أن يقرأ x-client-build: on في رد
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-build',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // إعلان مفتاح منع التكرار (idempotency.ts، ش9): بلا هذا لا يقرأ المتصفح الترويسة فلا يعيد العميل أي كتابة
  'Access-Control-Expose-Headers': 'x-idem, x-client-build',
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

// مقارنة سر بزمن ثابت: لا يتسرب من زمن الرد كم حرفًا طابق (تدقيق 2026-11-14، N17)
export function secretEquals(given: unknown, expected: string) {
  if (typeof given !== 'string' || !expected) return false;
  const a = enc.encode(given);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i += 1) diff |= (a[i % (a.length || 1)] ?? 0) ^ b[i];
  return diff === 0;
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

// عدة سطور في إدراج واحد (ورقة الحضور الجماعية: سطر لكل مشارك بطلب واحد)، بقاعدة audit نفسها: تعذّره يرمي فلا تُعد العملية مسجلة
export type AuditRow = { actorType: 'admin' | 'participant' | 'system' | 'coordinator'; actor: string | null; action: string; entity: string; entityId: string | null; before?: unknown; after?: unknown };
export async function auditMany(rows: AuditRow[]) {
  if (!rows.length) return;
  const { error } = await db.from('audit_log').insert(rows.map((r) => ({ actor_type: r.actorType, actor: r.actor, action: r.action, entity: r.entity, entity_id: r.entityId, before: r.before ?? null, after: r.after ?? null })));
  if (error) {
    console.error('leaders-api: audit insert failed', rows[0].action, error.message);
    throw new Fail('تعذّر تسجيل العملية في السجل، فلم تكتمل. حاول بعد قليل.', 500, 'audit_failed', { action: rows[0].action });
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
const shell = (family: MailFamily, title: string | MailTitle, body: string, preheader = '', footnote?: string) =>
  mailShell(title, body, { family, preheader, ...(footnote != null ? { footnote } : {}) });
// الاسم معزول الاتجاه (bdi): اسم لاتيني لا يقلب ترتيب التحية ولا ينقل فاصلتها
const hello =(name: string | null | undefined) => (name ? `أهلًا ${bdi(name)}،` : 'أهلًا،');

// حساب العرض التوضيحي: نطاق بريد لا يستقبل، ولا تُرسل إليه رسالة من أي مسار (الحارس هنا لا في كل موضع)
export const DEMO_MAIL_DOMAIN = 'demo.milestone-impact.org';
export const isDemoMail = (to: string) => String(to || '').trim().toLowerCase().endsWith(`@${DEMO_MAIL_DOMAIN}`);

// كل بريد يمر بالعداد الموحد (D15): kind يحدد نصيبه من السقف، وref الكيان المرتبط (مشارك أو مقيّم) بلا عنوان.
// الجماعي (bulk) والإشعار حين تُحجب حصتهما يدخلان الطابور ولا يفشلان، وتفرغه المهمة الساعية (drainMailQueue).
// purpose: غرض الرمز كما يظهر في سلسلة الرموز في سلاك (دخول مشارك، دخول جهة...)
// expiresAt: موعد الرسالة المؤرخة (تذكير ورشة، دعوة تقييم، عرض خدمة): إن انتظرت في الطابور حتى مضى تُترك ولا تخرج متأخرة.
// بلا موعد تنتظر حتى تُرسل، يومًا بعد يوم
// force: يتجاوز حصة الإشعارات ويبقى تحت السقف الكلي (كإرسال المدير من الصندوق). queue:false لا يدخل الطابور أبدًا
// (بريد إتمام الحذف: الطابور يحفظ عنوان من مُحيت بياناته)
export async function sendMail(to: string, subject: string, html: string, attachments: MailAttachment[] = [], { kind = 'notify', ref = null, purpose = null, expiresAt = null, force = false, queue = true }: { kind?: MailKind; ref?: string | null; purpose?: string | null; expiresAt?: string | null; force?: boolean; queue?: boolean } = {}): Promise<void | 'queued'> {
  if (isDemoMail(to)) { console.info('leaders-api: mail to the demo account skipped:', subject); return; }
  if (!CONFIG.resendKey) {
    // يُبلَّغ في سلاك كما تبلغه الدوال الأخرى من sendCounted: سلاك هو الاحتياط حين يتعطل البريد
    if (kind === 'code') slackCode(db, { status: 'failed', purpose, to, source: 'leaders-api', reason: 'mail_unconfigured' });
    else slackMail(db, { kind, to, source: 'leaders-api', reason: 'mail_unconfigured' });
    throw new Fail('خدمة البريد غير مهيأة', 503, 'mail_unconfigured');
  }
  const r = await sendCounted(db, to, subject, html, { kind, source: 'leaders-api', ref, cap: CONFIG.mailDailyCap, key: CONFIG.resendKey, from: CONFIG.mailFrom, attachments, purpose, force, alert: alertOps });
  if (r.ok) return;
  if (r.reason === 'mail_cap' || r.reason === 'mail_share') {
    // الجماعي والإشعار لا يضيعان بالسقف: يدخلان صندوق «لم يُرسل» ويخرجان آليًّا حين تتسع الحصة، أو يرسلهما المدير يدويًّا.
    // الرمز لا يُؤجَّل (ينتهي في دقائق). المرفق الصغير (دعوة التقويم) يُحفظ مع رسالته، والكبير لا يُخزَّن
    if (queue && (kind === 'bulk' || kind === 'notify') && queueableAttachments(attachments) && await enqueueMail(to, subject, html, ref, kind, r.reason, expiresAt, attachments)) return 'queued';   // دخلت صندوق «لم يُرسل»: يعدّها من يهمه الفرق (دعوة الورشة)
    throw new Fail('بلغت الرسائل حدها اليومي، وتصل بعد ساعات', 429, 'mail_cap');
  }
  throw new Fail('تعذّر إرسال البريد، حاول بعد قليل', 502, 'mail_failed');
}

// الأعمدة الأحدث تُكتب إن وُجدت، ويُعاد الإدراج بدونها قبل ترحيلها (السبب 20261114110000، والموعد 20261116150000)
// ما يُحفظ من المرفقات مع رسالة منتظرة: دعوة تقويم وما في حجمها. أكبر منه لا يدخل الطابور (ترحيل 20261120100000)
export const QUEUE_ATTACH_MAX = 64_000;
export const queueableAttachments = (a: MailAttachment[] = []) => a.reduce((n, x) => n + String(x?.content || '').length, 0) <= QUEUE_ATTACH_MAX;

export async function enqueueMail(to: string, subject: string, html: string, ref: string | null, kind: 'bulk' | 'notify' = 'bulk', reason: string | null = null, expiresAt: string | null = null, attachments: MailAttachment[] = []) {
  const row = { to_email: to, subject: subject.slice(0, 300), html, ref, kind };
  // رسالة بمرفق لا تُحفظ بلاه: إن رُفض عمود المرفقات (قبل ترحيله) تبقى خارج الطابور ويُبلَّغ المرسل بتعذّرها
  if (attachments.length) {
    const { error } = await db.from('mail_queue').insert({ ...row, reason, attachments, ...(expiresAt ? { expires_at: expiresAt } : {}) });
    if (error) { console.error('mail_queue insert (attachments):', error); return false; }
    return true;
  }
  let { error } = await db.from('mail_queue').insert({ ...row, reason, ...(expiresAt ? { expires_at: expiresAt } : {}) });
  if (error && expiresAt) ({ error } = await db.from('mail_queue').insert({ ...row, reason }));   // قبل ترحيل الموعد
  if (error) ({ error } = await db.from('mail_queue').insert(row));   // قبل ترحيل مركز البريد: بلا عمود السبب
  if (error) { console.error('mail_queue insert:', error); return false; }
  return true;
}

// من المهمة الساعية: يرسل المعلّق بالترتيب ما دامت الحصة تسمح، ويكتب العلامة بعد نجاح الإرسال وحده
export const QUEUE_MAX_ATTEMPTS = 5;
// لا ترك أعمى بالعمر: ما لا موعد له ينتظر حتى يُرسل، ويُستأنف كل ساعة ويومًا بعد يوم حين تتحرر الحصة.
// المؤرخ (expires_at) وحده يُترك حين يمضي موعده، بعلامة stale («فات أوانه» في مركز البريد وتقرير الأسبوع).
// الترتيب: الإشعار الفردي (notify) قبل الجماعي (bulk)، ثم الأقدم. والتوقف عند الحصة صحيح لأن النوعين حصة واحدة
// (mailDecision): ما حُجب منهما واحد حُجب ما بعده.
// من 22:00 بالرياض (inFlush) يمرر flush: يأخذ الطابور ما بقي من حصة اليوم قبل تصفيرها، إلا FLUSH_KEEP لرموز الدخول.
// الإرسال المباشر لا يمرره، فالأقدم انتظارًا يأخذ مكان المساء قبل الجديد
// hold: رسائل تُمسك فلا تُرسل ولا تُعد محاولة (بريد ميزة مطفأة، heldMail في features.ts)، ويُقرأ بعددها زيادةً فلا تحجب ما بعدها
// rewrite: نص الرسالة كما يُرسل الآن (بريد ورشة دخل الطابور بملاحظة القاعة ثم أُخفيت، mailRewrite في features.ts)
export const QUEUE_QUOTA_REASONS = ['mail_cap', 'mail_share'];
// قبل ترحيل الموعد (لا عمود expires_at): قاعدة العمر القديمة للإشعار تبقى كما كانت، فلا يتغير سلوك الإنتاج قبل الترحيل
const LEGACY_STALE_HOURS = 48;
// المطالبة بالرسالة قبل إرسالها: sent_at يُكتب بشرط أنها ما زالت منتظرة، فلا يرسلها مساران معًا (التفريغ و«أرسل الآن»).
// تعذّر الإرسال يعيدها إلى الانتظار (releaseQueued)
export async function claimQueued(id: string) {
  const { data, error } = await db.from('mail_queue').update({ sent_at: new Date().toISOString() }).eq('id', id).is('sent_at', null).is('gave_up_at', null).select('id');
  return !error && (data || []).length > 0;
}
export const releaseQueued = (id: string, patch: Record<string, unknown> = {}) => db.from('mail_queue').update({ sent_at: null, ...patch }).eq('id', id);
// موعد بعد ساعات من الآن: للإشعار الذي لا معنى له بعد وقته (اتصال فوري، تنبيه أمني، تذكير دفع)
export const expiresIn = (hours: number) => new Date(Date.now() + hours * 36e5).toISOString();
export async function drainMailQueue(limit = 40, hold: Set<string> = new Set(), rewrite: (m: { subject: string; html: string }) => string = (m) => m.html) {
  const read = (cols: string) => db.from('mail_queue').select(cols)
    .is('sent_at', null).is('gave_up_at', null).order('kind', { ascending: false }).order('created_at').limit(limit + hold.size);
  let { data, error } = await read('id, kind, created_at, to_email, subject, html, ref, attempts, expires_at, attachments');
  if (error) ({ data, error } = await read('id, kind, created_at, to_email, subject, html, ref, attempts, expires_at'));   // قبل ترحيل المرفقات
  let legacy = false;
  if (error) { ({ data, error } = await read('id, kind, created_at, to_email, subject, html, ref, attempts')); legacy = true; }
  if (error) return { sent: 0, pending: null };
  let sent = 0, expired = 0;
  for (const m of ((data || []) as any[]).filter((x: any) => !hold.has(x.id)).slice(0, limit)) {
    const over = m.expires_at ? Date.parse(m.expires_at) <= Date.now() : legacy && m.kind === 'notify' && Date.now() - Date.parse(m.created_at) > LEGACY_STALE_HOURS * 36e5;
    if (over) {
      await db.from('mail_queue').update({ gave_up_at: new Date().toISOString(), last_error: 'stale' }).eq('id', m.id).is('sent_at', null);
      expired++;
      continue;
    }
    if (!(await claimQueued(m.id))) continue;   // أرسلها المدير أو ألغاها بعد قراءة الدفعة
    const r = await sendCounted(db, m.to_email, m.subject, rewrite(m), { kind: m.kind === 'notify' ? 'notify' : 'bulk', source: 'leaders-api', ref: m.ref, cap: CONFIG.mailDailyCap, key: CONFIG.resendKey, from: CONFIG.mailFrom, alert: alertOps, queued: true, flush: inFlush(), ...(Array.isArray(m.attachments) && m.attachments.length ? { attachments: m.attachments } : {}) });
    if (r.ok) { sent++; continue; }   // sent_at كُتب بالمطالبة، ويبقى بعد نجاح الإرسال وحده
    if (r.reason === 'mail_cap' || r.reason === 'mail_share') { await releaseQueued(m.id); break; }   // الحصة: تُستأنف في الساعة التالية
    const attempts = (m.attempts || 0) + 1;
    await releaseQueued(m.id, { attempts, last_error: r.reason, ...(attempts >= QUEUE_MAX_ATTEMPTS ? { gave_up_at: new Date().toISOString() } : {}) });
  }
  const { count } = await db.from('mail_queue').select('id', { count: 'exact', head: true }).is('sent_at', null).is('gave_up_at', null);
  return { sent, pending: count ?? 0, ...(expired ? { expired } : {}), ...(hold.size ? { held: hold.size } : {}) };
}

// من المهمة الساعية بعد التفريغ: رسالة انتظرت في الطابور أكثر من QUEUE_ALERT_HOURS لغير الحصة (فشل عند المزوّد، أو سبب
// غير معروف) تنبيه واحد للمالك يجمع ما تأخر. انتظار الحصة سير عادي يُبلَّغ في سطر يومي واحد (carryoverAlert)، لا لكل رسالة.
// كل رسالة يُنبَّه إليها مرة واحدة: علامتها سطر في audit_log (mail.queue-stuck بمعرّفها)، تُكتب بعد وصول التنبيه
// من إحدى القناتين، فلا يضيع التنبيه إن لم يصل، ويُعاد في الساعة التالية
export const QUEUE_ALERT_HOURS = 6;
// والممسَك (hold) ليس عالقًا: انتظاره بقرار إخفاء ميزته، فلا يُنبَّه إليه
const quotaWait = (m: { attempts?: number | null; reason?: string | null }) => !(m.attempts || 0) && QUEUE_QUOTA_REASONS.includes(String(m.reason));
export async function stuckQueueAlert(hold: Set<string> = new Set()) {
  const before = new Date(Date.now() - QUEUE_ALERT_HOURS * 36e5).toISOString();
  const read = (cols: string) => db.from('mail_queue').select(cols).is('sent_at', null).is('gave_up_at', null).lt('created_at', before).order('created_at').limit(200);
  let { data, error } = await read('id, created_at, kind, reason, attempts');
  if (error) ({ data, error } = await read('id, created_at, kind, attempts'));   // قبل ترحيل مركز البريد: بلا عمود السبب
  if (error) return { stuck: null, alerted: 0 };
  const rows = ((data || []) as unknown as { id: string; created_at: string; kind: string; reason?: string | null; attempts?: number | null }[]).filter((m) => !hold.has(m.id) && !quotaWait(m));
  if (!rows.length) return { stuck: 0, alerted: 0 };
  const marks = await db.from('audit_log').select('entity_id').eq('action', 'mail.queue-stuck').in('entity_id', rows.map((m) => m.id));
  // تعذّر قراءة العلامات: التنبيه مكررًا أهون من ضياعه
  const seen = new Set(marks.error ? [] : (marks.data || []).map((x: any) => String(x.entity_id)));
  const fresh = rows.filter((m) => !seen.has(m.id));
  if (!fresh.length) return { stuck: rows.length, alerted: 0 };
  const hours = Math.floor((Date.now() - Date.parse(fresh[0].created_at)) / 36e5);
  const r = await raiseAlert('mail_queue_stuck', { messages: fresh.length, waiting_over_hours: QUEUE_ALERT_HOURS, oldest_hours: hours, ...(fresh[0].reason ? { reason: fresh[0].reason } : {}) });
  if (!r.webhook && !r.slack && !r.email) return { stuck: rows.length, alerted: 0 };
  const { error: markError } = await db.from('audit_log').insert(fresh.map((m) => ({ actor_type: 'system', actor: 'cron', action: 'mail.queue-stuck', entity: 'mail_queue', entity_id: m.id })));
  if (markError) console.error('mail.queue-stuck marks:', markError.message);
  return { stuck: rows.length, alerted: fresh.length };
}

// حصة اليوم الآن: الأعداد كما يقرؤها حارس الإرسال (mailCounts) منذ بداية يوم المزوّد (03:00 بالرياض)، فيُقدَّر
// متى يخرج كل منتظر (queueEta). تعذّر العداد يُعامل حصة ممتلئة: التقدير يتأخر ولا يعد بما لا يُرسل
// waiting: الإشعارات المنتظرة في الطابور الآن، فما يدخل بعدها يخرج بعدها (الطابور يفرّغ الإشعار بالأقدم)
export async function mailWindow(now = Date.now()) {
  const [counts, waiting] = await Promise.all([
    mailCounts(db, mailDayStart(now)),
    db.from('mail_queue').select('id', { count: 'exact', head: true }).is('sent_at', null).is('gave_up_at', null).eq('kind', 'notify')
      .then((x: any) => (x.error ? 0 : x.count ?? 0), () => 0),
  ]);
  const budget = mailBudget(counts ?? { sent: CONFIG.mailDailyCap, nonCode: CONFIG.mailDailyCap }, CONFIG.mailDailyCap);
  return { budget, waiting: waiting as number, read: counts != null };
}

// سطر يومي واحد للمالك: ما بقي في الطابور بالحصة يُرحَّل إلى الغد آليًّا، وكم هو، ومتى يُتوقع أن يفرغ (queueEta).
// أول تشغيلة بعد الحادية عشرة مساءً بالرياض (CARRYOVER_HOUR_RIYADH) فيها انتظار بالحصة: بعد تشغيلات تفريغ المساء
// (من 22:17) فلا يذكر إلا ما يُرحَّل فعلًا إلى ما بعد تصفير الحصة 03:00. ومهلته نحو عشرين ساعة (ALERT_COOLDOWN_MS)
// فلا يتكرر في اليوم نفسه. الممسَك لا يُعد
export const CARRYOVER_HOUR_RIYADH = 23;
export async function carryoverAlert(hold: Set<string> = new Set(), now = Date.now()) {
  if (new Date(now + 3 * 36e5).getUTCHours() < CARRYOVER_HOUR_RIYADH) return { waiting: null, alerted: false };
  const { data, error } = await db.from('mail_queue').select('id, created_at, reason, attempts').is('sent_at', null).is('gave_up_at', null).order('created_at').limit(500);
  if (error) return { waiting: null, alerted: false };
  const rows = ((data || []) as any[]).filter((m) => !hold.has(m.id) && quotaWait(m));
  if (!rows.length) return { waiting: 0, alerted: false };
  const w = await mailWindow(now);
  const eta = queueEta(rows, { ...w, now });
  const last = Object.values(eta).map((e: any) => e.at).filter(Boolean).sort().pop();
  const r = await raiseAlert('mail_queue_carryover', { waiting: rows.length, oldest_hours: Math.floor((now - Date.parse(rows[0].created_at)) / 36e5), ...(last ? { expected_clear_day: riyadhDay(last) } : {}) });
  return { waiting: rows.length, alerted: !r.cooled && (r.webhook || !!r.slack || r.email) };
}
const riyadhDay = (iso: string) => new Date(Date.parse(iso) + 3 * 36e5).toISOString().slice(0, 10);

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
    mailText(`${hello(name)} ${returned ? `راجع المستشار «${bdi(title)}» وطلب تعديلًا قبل اعتماده.` : `راجع المستشار «${bdi(title)}» واعتمده. أحسنت، خطوة أخرى في رحلتك.`}`)
    + (returned && note ? mailNote(bdi(note)) : '')
    + mailButton(CONFIG.appUrl, 'افتح رحلتي'),
    returned ? `ملاحظة على «${title}» قبل اعتماده` : `اعتُمد «${title}»`);
}

// التذكير الموحد (nudges.ts): النص الذي بناه المحرك من رحلته (nudge.js)، وتوقيع مرسله إن لم يكن آليًا
export function nudgeMail(name: string, heading: string, text: string, signature = '') {
  return shell('journey', esc(heading), mailText(`${hello(name)} ${esc(text)}`) + (signature ? mailText(esc(signature)) : '') + mailButton(CONFIG.appUrl, 'أكمل رحلتي'), text.slice(0, 140));
}

// ملاحظة أو تنبيه أو إشادة مرئية للمشارك (observations.ts): النص نفسه الذي تعرضه بطاقته في الموقع
export function observationMail(name: string, heading: string, body: string) {
  return shell('journey', esc(heading), mailText(`${hello(name)} ${bdi(body)}`) + mailButton(CONFIG.appUrl, 'افتح رحلتي'), body.slice(0, 140));
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
    + (notes ? mailNote(bdi(notes)) : '')
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
// paid: ما دُفع فعلًا من الإشعار (payments.ts paidTotal): المدفوع شامل الضريبة، وسطر الضريبة حين تزيد على صفر.
// وبلا paid يبقى سطر المبلغ المسجل كما كان
export function paymentReceiptMail(name: string, item: string, amount: string, order: string | null, next: string, paid: { total: string; tax?: string; sub?: string } | null = null) {
  const money: [string, string][] = paid
    ? [...(paid.tax ? [...(paid.sub ? [['المبلغ قبل الضريبة', paid.sub]] as [string, string][] : []), ['الضريبة', paid.tax]] as [string, string][] : []), [paid.tax ? 'المدفوع شامل الضريبة' : 'المبلغ المدفوع', paid.total]]
    : [['المبلغ', amount]];
  return shell('journey', 'وصلنا دفعك',
    mailText(`${hello(name)} تأكد دفعك، وهذا ملخصه لسجلك.`)
    + mailRows([['البند', item], ...money, ...(order ? [['رقم الطلب', order] as [string, string]] : [])])
    + mailText(esc(next))
    + mailButton(CONFIG.appUrl, 'افتح رحلتك'),
    'تأكيد الدفع', 'إيصال الدفع الرسمي يصلك من مزوّد الدفع Creem على البريد نفسه.');
}
// of: المدفوع كله حين يكون الاسترداد جزئيًا (payments.ts): الحق باقٍ فلا يُقال «أُقفل»
export function paymentRefundMail(name: string, item: string, amount: string, of = '') {
  if (of) {
    return shell('journey', 'استُردّ جزء من دفعتك',
      mailText(`${hello(name)} استُردّ جزء من دفعتك، ويعود المبلغ المسترد إلى وسيلة الدفع نفسها خلال أيام بحسب مصرفك.`)
      + mailRows([['البند', item], ['المبلغ المسترد', amount], ['من المدفوع', of]])
      + mailText('ما فتحه هذا الدفع في حسابك باقٍ كما هو. إن كان الاسترداد خطأ أو لديك سؤال فردّ على هذه الرسالة.'),
      'استرداد جزء من دفعة');
  }
  return shell('journey', 'استُردّت دفعتك',
    mailText(`${hello(name)} استُردّت دفعتك، ويعود المبلغ إلى وسيلة الدفع نفسها خلال أيام بحسب مصرفك.`)
    + mailRows([['البند', item], ['المبلغ', amount]])
    + mailText('أُقفل ما فتحه هذا الدفع في حسابك. إن كان الاسترداد خطأ أو لديك سؤال فردّ على هذه الرسالة.'),
    'استرداد دفعة');
}
export function paymentAbandonMail(name: string, item: string) {
  return shell('journey', 'دفعك لم يكتمل',
    mailText(`${hello(name)} فتحت صفحة الدفع لـ«${bdi(item)}» ولم تكتمل العملية، ولم يُخصم منك شيء. إن واجهت مشكلة في الدفع فردّ على هذه الرسالة ونساعدك.`)
    + mailButton(CONFIG.appUrl, 'أكمل الدفع'),
    'خطوة واحدة باقية');
}
export function paymentOwnerMail(what: string, rows: [string, string][]) {
  return shell('admin', what, mailRows(rows) + mailButton(`${SITES.admin}/#/leaders/payments`, 'افتح المدفوعات'), what);
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
    return shell('journey', f360.reminder ? mailTitle`تذكير: تقديرك لـ${who}` : mailTitle`طلب تقدير من ${who}`,
      mailText(`${hello(rater)} ${f360.reminder ? `لم يصلنا تقديرك بعد لـ${bdi(who)}، والنافذة تُغلق ${bdi(f360.closes)}.` : `يشارك ${bdi(who)} في برنامج القادة من Milestone Impact، ورشّحك مستشاره لتقييم 360 للتطوير: مرآة لممارسته يناقشها معه في جلسة توجيه، ولا تدخل أي تقييم أو شهادة.`}`)
      + mailText('عبارات قصيرة تقدّر كلًّا منها كما رأيته في الأشهر الثلاثة الأخيرة، و«لا أستطيع الحكم» لما لم تشهده، ثم ثلاثة أسئلة اختيارية. يستغرق ذلك نحو عشر دقائق.')
      + mailText(esc(f360.promise))
      + mailButton(link, 'ابدأ التقدير')
      + mailNote(`الرابط خاص بك وصالح حتى ${bdi(f360.closes)}. نحفظ اسمك وبريدك وصلتك به وتقديرك لتقرير تطويري له وحده، وتجد إشعار الخصوصية كاملًا في <a href="${CONFIG.appUrl}/legal/privacy">سياسة الخصوصية</a>.`),
      `عشر دقائق لتقييم 360 لـ${who}`, '');
  }
  const pre = phase === 'pre';
  return shell('journey', mailTitle`طلب تقدير من ${who}`,
    mailText(`${hello(rater)} يشارك ${bdi(who)} في برنامج القادة من Milestone Impact، ${pre ? 'ويطلب تقديرك لممارسته الحالية في العمل قبل أن يبدأ البرنامج.' : 'ويطلب تقديرك لتغير ممارسته في العمل خلال البرنامج.'}`)
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
    list: mailText(`${hello(name)} رشّح ${bdi(who)} مقيّميه لتقييم 360، والقائمة بانتظار اعتمادك بصفتك مستشاره. تأكد من تنوعها (المدير والزملاء والفريق وأصحاب المصلحة)، ومن أن فيها من يختلف معه لا المادحين وحدهم.`),
    returned: mailText(`${hello(name)} أعاد مستشارك قائمة مقيّميك بملاحظة: ${bdi(opts.note || '')}. عدّلها وأرسلها مرة أخرى.`),
    ready: mailText(`${hello(name)} أُغلقت نافذة تقييم 360 لـ${bdi(who)}، وتقريره جاهز لتطّلع عليه قبل جلسة الاستلام. لا يراه المشارك حتى تسلّمه له في الجلسة.`),
    released: mailText(`${hello(name)} سلّمك مستشارك تقرير 360: ما يراه فيك مديرك وزملاؤك وفريقك مقارنة بتقديرك، وملاحظاتهم المكتوبة بلا نسبة إلى أحد. للتطوير وحده، ولا يدخل أي تقييم أو شهادة.`),
  }[kind];
  const cta = { list: 'راجع القائمة واعتمدها', returned: 'عدّل القائمة', ready: 'اقرأ التقرير', released: 'افتح تقريرك' }[kind];
  return shell('journey', (FEEDBACK_MAIL[kind].subject as (w: string) => string)(who), body + mailButton(opts.url, cta), '');
}

// D19: مقيّم بانتظار تأكيد المستشار أو المنسق قبل إرسال دعوته، بلا عنوانه في البريد
export function raterConfirmMail(who: string, why: string, url: string) {
  return shell('journey', 'مقيّم بانتظار تأكيدك',
    mailText(`دعا ${bdi(who)} مقيّمًا لتقدير أثره، وبريده يحتاج تأكيدك قبل إرسال الدعوة: ${bdi(why)}.`)
    + mailText('تأكد أن المقيّم من يعمل معه فعلًا (مديره أو زميله أو أحد فريقه)، فتقديره يدخل حكم «تغير مؤكد» وتقرير الأثر للجهة.')
    + mailButton(url, 'راجع وأكّد'),
    'تأكيد مقيّم قبل إرسال دعوته');
}

export function raterRejectedMail(name: string, rater: string, reason: string) {
  return shell('journey', 'لم يُعتمد أحد مقيّميك',
    mailText(`${hello(name)} لم يُعتمد ${bdi(rater)} مقيّمًا لأثرك، والسبب: ${bdi(reason)}.`)
    + mailText('ادعُ مقيّمًا آخر ممن يعملون معك، ويُفضَّل ببريد جهتك.')
    + mailButton(CONFIG.appUrl, 'افتح رحلتك'),
    'ادعُ مقيّمًا آخر');
}

// ── الجلسات ──
// تذكير قبل الجلسة بيوم، ومعه رابطها إن كانت عن بعد
// place: مكان الجلسة الجماعية الحضورية (المرحلة 5). بلاه البريد كما كان حرفًا
export function sessionReminderMail(name: string, when: string, expert: string | null, joinUrl: string | null, place: string | null = null) {
  return shell('sessions', 'جلستك غدًا',
    mailText(`${hello(name)} نذكّرك بجلسة التوجيه${expert ? ` مع ${bdi(expert)}` : ''}.`)
    + mailRows([['الموعد', when], ...(place ? [['المكان', place] as [string, string]] : []), ...(expert ? [['الخبير', expert] as [string, string]] : []), ...(joinUrl ? [['الرابط', joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(joinUrl || CONFIG.appUrl, joinUrl ? 'رابط الجلسة' : 'افتح رحلتي')
    + mailNote('جهّز سؤالًا أو موقفًا من عملك هذا الأسبوع، فالجلسة على قدر ما تحمله إليها.'),
    `${when}${place ? ` · ${place}` : ''}${expert ? ` · مع ${expert}` : ''}`, '');
}

// دعوة جلسة الورشة وتذكيراها (قبل يوم وقبل ساعة): الموعد والمكان أو الرابط، والقاعة تُفتح من التطبيق
export const WORKSHOP_MAIL = {
  invite: { subject: 'دعوة: جلستك التدريبية', lead: 'ندعوك إلى الجلسة التدريبية القادمة في برنامجك.', note: 'أضف الموعد إلى تقويمك من المرفق. يوم الجلسة افتح «القاعة» في التطبيق من جوالك لتعرف فريقك وطاولتك.' },
  day: { subject: 'جلستك التدريبية غدًا', lead: 'نذكّرك بجلستك التدريبية غدًا.', note: 'أحضر جوالك مشحونًا، فالمشاركة في الجولات من تطبيقك، وبها يُحتسب حضورك.' },
  hour: { subject: 'جلستك التدريبية بعد ساعة', lead: 'جلستك التدريبية تبدأ بعد نحو ساعة.', note: 'افتح «القاعة» في التطبيق حين تصل، وادخلها لتظهر لزملائك وللخبير.' },
} as const;
// staged: جلسة عن بعد لم تُفتح مرحلتها في رحلته بعد، فلا رابط في البريد ولا تعليمات القاعة: الرابط في رحلته حين تُفتح
export const WORKSHOP_STAGED_NOTE = 'رابط الانضمام يظهر في رحلتك حين تُفتح لك مرحلة هذه الجلسة، فافتح رحلتك يومها.';
// later: جلسة عن بعد لم يُضف رابطها بعد (J1)، فلا تعليمات القاعة: الرابط يصل قبلها ويظهر في رحلته
export const WORKSHOP_LINK_LATER_NOTE = 'هذه الجلسة عن بعد، ورابط الانضمام يُضاف لاحقًا ويظهر في رحلتك قبل بدئها بساعة.';
// hall: مفتاح القاعة (features.hall). مطفأة: ملاحظة بلا ذكرها بطريقة توثيق حضور الجلسة (method، WORKSHOP_NO_HALL_NOTE)
// trainer: المدرب المسمى للجلسة (المرحلة 4) سطر في الدعوة، وبلاه لا سطر
export function workshopMail(kind: keyof typeof WORKSHOP_MAIL, name: string, title: string, when: string, where: string | null, joinUrl: string | null, staged: boolean | 'staged' | 'later' = false, hall = true, method: 'qr' | 'join' | 'other' = 'qr', trainer: string | null = null) {
  const m = WORKSHOP_MAIL[kind];
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', title], ['الموعد', when], ...(where ? [['المكان', where] as [string, string]] : []), ...(trainer ? [['المدرب', trainer] as [string, string]] : []), ...(joinUrl ? [['الرابط', joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح رحلتي')
    + mailNote(staged === 'later' ? WORKSHOP_LINK_LATER_NOTE : staged ? WORKSHOP_STAGED_NOTE : hall ? m.note : WORKSHOP_NO_HALL_NOTE[method][kind]),
    `${title} · ${when}`, '');
}

// إشعار تغيّر موعد جلسة أو مكانها لمن دُعي إليها (تصور تشغيل الدفعة، المرحلة 4): قصير، بالموعد والمكان الجديدين وملف تقويم
// محدَّث. ثابت مستقل عن WORKSHOP_MAIL: ليس من ملاحظات القاعة التي يبدّلها الطابور (hallNoteRewrite)
export const WORKSHOP_CHANGE_MAIL = {
  subject: 'تحديث: جلستك التدريبية',
  lead: { when: 'تغيّر موعد جلستك التدريبية.', where: 'تغيّر مكان جلستك التدريبية.', both: 'تغيّر موعد جلستك التدريبية ومكانها.' },
  note: 'الملف المرفق يحدّث الموعد في تقويمك. إن بقي الموعد القديم فاحذفه.',
} as const;
export function workshopChangeMail(name: string, title: string, when: string, where: string | null, joinUrl: string | null, staged: boolean | 'staged' | 'later' = false, changed: { when: boolean; where: boolean } = { when: true, where: false }, trainer: string | null = null) {
  const c = WORKSHOP_CHANGE_MAIL;
  const m = { subject: c.subject, note: c.note, lead: changed.when && changed.where ? c.lead.both : changed.where ? c.lead.where : c.lead.when };
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead} هذا ما صار عليه:`)
    + mailRows([['الجلسة', title], ['الموعد', when], ...(where ? [['المكان', where] as [string, string]] : []), ...(trainer ? [['المدرب', trainer] as [string, string]] : []), ...(joinUrl ? [['الرابط', joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح رحلتي')
    + mailNote(staged === 'later' ? WORKSHOP_LINK_LATER_NOTE : staged ? WORKSHOP_STAGED_NOTE : m.note),
    `${title} · ${when}`, '');
}

// إلغاء جلسة الورشة لمن دُعي إليها (قرار المالك 2026-11-22): قصير، بملف إلغاء تقويم (METHOD:CANCEL بمعرّف الدعوة نفسه ورقم
// تسلسل أحدث) يزيل الموعد، والجملة تبقى لمن يتجاهل برنامجه الملف. يخرج عند إلغاء الجلسة أو حذفها أو نقلها عن دفعتهم.
// ثابت مستقل عن WORKSHOP_MAIL: ليس من ملاحظات القاعة التي يبدّلها الطابور (hallNoteRewrite)
export const WORKSHOP_CANCEL_MAIL = {
  subject: 'أُلغيت: جلستك التدريبية',
  lead: 'أُلغيت الجلسة التدريبية التالية، فلا تحضر في موعدها.',
  // stale: الموعد المخزَّن تغيّر بعد آخر دعوة ولم يُبلَّغ به أحد، فالملغى هو الموعد الذي في يد المدعو لا المخزَّن
  staleLead: 'أُلغيت الجلسة التدريبية التالية. الموعد أدناه هو آخر موعد أبلغناك به لها، فلا تحضر فيه.',
  note: 'الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه. إن حُدد لها موعد جديد وصلتك دعوته.',
} as const;
export function workshopCancelMail(name: string, title: string, when: string, where: string | null, trainer: string | null = null, stale = false) {
  const m = { ...WORKSHOP_CANCEL_MAIL, lead: stale ? WORKSHOP_CANCEL_MAIL.staleLead : WORKSHOP_CANCEL_MAIL.lead };
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', title], ['الموعد الملغى', when], ...(where ? [['المكان', where] as [string, string]] : []), ...(trainer ? [['المدرب', trainer] as [string, string]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح رحلتي')
    + mailNote(m.note),
    `${title} · ${when}`, '');
}
// سحب موعد جلسة أُعلنت (قرار المالك 2026-11-22، المتابعة 2): المدير أفرغ موعدها، فالجلسة باقية في الرحلة «يُحدد لاحقًا» وموعدها
// القديم يُزال من التقويم بملف الإلغاء نفسه. وحين يُحدد موعد جديد تخرج دعوته المعتادة برقم تسلسل أعلى
export const WORKSHOP_UNDATE_MAIL = {
  subject: 'سُحب الموعد: جلستك التدريبية',
  lead: 'سُحب موعد الجلسة التدريبية التالية، فلا تحضر فيه. الجلسة باقية في برنامجك، وتصلك دعوة بموعدها الجديد حين يُحدد.',
  note: 'الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه.',
} as const;
export function workshopUndateMail(name: string, title: string, when: string, where: string | null, trainer: string | null = null) {
  const m = WORKSHOP_UNDATE_MAIL;
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', title], ['الموعد المسحوب', when], ...(where ? [['المكان', where] as [string, string]] : []), ...(trainer ? [['المدرب', trainer] as [string, string]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح رحلتي')
    + mailNote(m.note),
    `${title} · ${when}`, '');
}
// بريد المدرب المسمى (المتابعة 1، 2026-11-22): يصله ما يصل المدعوين، بريد واحد لكل حدث وبملف التقويم نفسه (المعرّف ورقم
// التسلسل): الدعوة حين تُعلن الجلسة، والتحديث حين يتغير موعدها أو مكانها أو طريقتها أو رابطها، والإلغاء، وسحب الموعد، والعودة
// بعد الإلغاء. وعند استبداله: للسابق «release» بملف يزيل الموعد من تقويمه، وللجديد الدعوة.
// لا شيء فيه عن مشارك بعينه: العدد وحده، كما يراه في بوابته
export const WORKSHOP_TRAINER_MAIL = {
  invite: { subject: 'دعوة: جلسة تدريبية أنت مدربها', lead: 'سُمّيت مدربًا للجلسة التدريبية التالية، وأُرسلت دعوتها إلى المشاركين.', note: 'أضف الموعد إلى تقويمك من المرفق. تجد الجلسة وورقة حضورها في بوابتك.' },
  change: { subject: 'تحديث: جلسة تدريبية أنت مدربها', lead: 'تغيّر موعد الجلسة التدريبية التي أنت مدربها.', note: 'الملف المرفق يحدّث الموعد في تقويمك. إن بقي الموعد القديم فاحذفه.' },
  cancel: { subject: 'أُلغيت: جلسة تدريبية أنت مدربها', lead: 'أُلغيت الجلسة التدريبية التالية التي سُمّيت مدربًا لها، فلا تُعقد في موعدها.', note: 'الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه.' },
  undate: { subject: 'سُحب الموعد: جلسة تدريبية أنت مدربها', lead: 'سُحب موعد الجلسة التدريبية التالية التي أنت مدربها، فلا تُعقد فيه. يصلك موعدها الجديد حين يُحدد.', note: 'الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه.' },
  release: { subject: 'تغيّر المدرب: جلسة تدريبية كنت مدربها', lead: 'لم تعد مدرب الجلسة التدريبية التالية، فلا يلزمك حضورها. الجلسة نفسها قائمة في موعدها.', note: 'الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه.' },
  restore: { subject: 'أُعيدت: جلسة تدريبية أنت مدربها', lead: 'أُعيدت الجلسة التدريبية التالية بعد إلغائها، وأنت مدربها.', note: 'أضف الموعد إلى تقويمك من المرفق. تجد الجلسة وورقة حضورها في بوابتك.' },
} as const;
const TRAINER_CHANGE_LEAD = { when: WORKSHOP_TRAINER_MAIL.change.lead, where: 'تغيّر مكان الجلسة التدريبية التي أنت مدربها.', both: 'تغيّر موعد الجلسة التدريبية التي أنت مدربها ومكانها.' } as const;
const TRAINER_WHEN_LABEL: Partial<Record<keyof typeof WORKSHOP_TRAINER_MAIL, string>> = { cancel: 'الموعد الملغى', undate: 'الموعد المسحوب' };
const TRAINER_COUNT_LABEL: Record<keyof typeof WORKSHOP_TRAINER_MAIL, string | null> = { invite: 'دُعي من المشاركين', change: 'أُبلغ من المشاركين', cancel: 'أُبلغ من المشاركين', undate: 'أُبلغ من المشاركين', release: null, restore: 'دُعي من المشاركين' };
// where: مكان الحضورية، أو «عن بعد» لجلسة عن بعد ومعها رابطها إن وُجد (joinUrl). changed: ما تغيّر في بريد التحديث
export function workshopTrainerMail(kind: keyof typeof WORKSHOP_TRAINER_MAIL, name: string, g: { title: string; when: string; where?: string | null; cohort?: string | null; count: number; joinUrl?: string | null; changed?: { when: boolean; where: boolean } }) {
  const base = WORKSHOP_TRAINER_MAIL[kind];
  const changed = kind === 'change' && g.changed ? (g.changed.when && g.changed.where ? TRAINER_CHANGE_LEAD.both : g.changed.where ? TRAINER_CHANGE_LEAD.where : TRAINER_CHANGE_LEAD.when) : base.lead;
  // نص ثابت من الخادم: مقدمة النوع، وللتحديث ما تغيّر ثم «هذا ما صار عليه»
  const m = { ...base, lead: kind === 'change' ? `${changed} هذا ما صار عليه:` : changed };
  const count = TRAINER_COUNT_LABEL[kind];
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', g.title], [TRAINER_WHEN_LABEL[kind] || 'الموعد', g.when], ...(g.cohort ? [['الدفعة', g.cohort] as [string, string]] : []), ...(g.where ? [['المكان', g.where] as [string, string]] : []),
      ...(g.joinUrl ? [['الرابط', g.joinUrl, true] as [string, string, boolean]] : []), ...(count ? [[count, String(g.count)] as [string, string]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح بوابتي')
    + mailNote(m.note),
    `${g.title} · ${g.when}`, '');
}

// ── الجلسة الجماعية مع المستشار (تصور تشغيل الدفعة 2026-11-19، المرحلة 5) ──
// للمدعو: الموعد والمستشار والمكان أو الرابط وملف تقويم، بلا أسماء بقية المدعوين ولا عددهم. وللمستشار بريد واحد بالتكليف
// والعدد بلا أسماء (يراها في بوابته). الإلغاء والإزالة يقولان إن الجلسة لم تُحسب من الرصيد
// الإلغاء والإزالة يحملان ملف إلغاء تقويم (METHOD:CANCEL بمعرّف الدعوة نفسه) يزيل الموعد، والجملة تبقى لمن يتجاهل برنامجه الملف.
// وإعادة إرسال الدعوة وإضافة مدعو إلى جلسة قائمة بقالب الدعوة نفسه (invite): لا قالب جديد
export const GROUP_SESSION_MAIL = {
  invite: { subject: 'دعوة: جلسة جماعية مع المستشار', lead: 'ندعوك إلى جلسة جماعية مع المستشار ضمن برنامجك.', note: 'أضف الموعد إلى تقويمك من المرفق. تجد الجلسة في رحلتك تحت الاستشارة.' },
  change: { subject: 'تحديث: جلستك الجماعية مع المستشار', lead: 'تغيّرت تفاصيل جلستك الجماعية مع المستشار. هذا ما صارت عليه:', note: 'الملف المرفق يحدّث الموعد في تقويمك. إن بقي الموعد القديم فاحذفه.' },
  cancel: { subject: 'أُلغيت: جلستك الجماعية مع المستشار', lead: 'أُلغيت الجلسة الجماعية التالية، فلا موعد لها.', note: 'لم تُحسب من رصيد استشاراتك. الملف المرفق يزيل موعدها من تقويمك، وإن بقي فاحذفه.' },
  removed: { subject: 'تحديث: لست مدعوًّا إلى الجلسة الجماعية', lead: 'لم تعد مدعوًّا إلى الجلسة الجماعية التالية.', note: 'لم تُحسب من رصيد استشاراتك. الملف المرفق يزيل موعدها من تقويمك، وإن بقي فاحذفه.' },
} as const;
export type GroupSessionView = { title: string; when: string; expert?: string | null; where?: string | null; joinUrl?: string | null; counts?: boolean };
export function groupSessionMail(kind: keyof typeof GROUP_SESSION_MAIL, name: string, g: GroupSessionView) {
  const m = GROUP_SESSION_MAIL[kind];
  const live = kind === 'invite' || kind === 'change';
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', g.title], ['الموعد', g.when], ...(g.expert ? [['المستشار', g.expert] as [string, string]] : []), ...(g.where ? [['المكان', g.where] as [string, string]] : []),
      ...(live && g.joinUrl ? [['الرابط', g.joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح رحلتي')
    + mailNote(kind === 'invite' ? `${m.note} ${g.counts === false ? 'لا تُحسب من رصيد استشاراتك.' : 'تُحسب جلسة واحدة من رصيد استشاراتك.'}` : m.note),
    `${g.title} · ${g.when}`, '');
}
export const GROUP_EXPERT_MAIL = {
  assign: { subject: 'تكليف: جلسة جماعية مع مشاركيك', lead: 'كُلّفت بجلسة جماعية مع مشاركين في البرنامج.', note: 'بعد الجلسة سجّل من حضر ومن لم يحضر من بوابتك، في ورقة واحدة.' },
  change: { subject: 'تحديث: جلستك الجماعية', lead: 'تغيّرت تفاصيل الجلسة الجماعية التي كُلّفت بها. هذا ما صارت عليه:', note: 'الملف المرفق يحدّث الموعد في تقويمك.' },
  cancel: { subject: 'أُلغيت: جلستك الجماعية', lead: 'أُلغيت الجلسة الجماعية التالية، أو أُسندت إلى غيرك.', note: 'الملف المرفق يزيل موعدها من تقويمك، وإن بقي فاحذفه.' },
} as const;
export function groupExpertMail(kind: keyof typeof GROUP_EXPERT_MAIL, name: string, g: GroupSessionView & { count: number; cohort?: string | null }) {
  const m = GROUP_EXPERT_MAIL[kind];
  return shell('sessions', m.subject,
    mailText(`${hello(name)} ${m.lead}`)
    + mailRows([['الجلسة', g.title], ['الموعد', g.when], ...(g.cohort ? [['الدفعة', g.cohort] as [string, string]] : []), ['عدد المشاركين', String(g.count)], ...(g.where ? [['المكان', g.where] as [string, string]] : []),
      ...(kind !== 'cancel' && g.joinUrl ? [['الرابط', g.joinUrl, true] as [string, string, boolean]] : [])])
    + mailButton(CONFIG.appUrl, 'افتح بوابتي')
    + mailNote(m.note),
    `${g.title} · ${g.when}`, '');
}

// طلب حذف البيانات: تأكيد لصاحب الحساب بالمهلة وطريقة السحب (privacy.ts)
export const ERASE_MAIL_SUBJECT = 'استلمنا طلب حذف بياناتك';
export function eraseRequestMail(name: string, days: number) {
  return shell('access', ERASE_MAIL_SUBJECT,
    mailText(`${hello(name)} سجّلنا طلبك حذف حسابك وبياناتك من منصة Milestone Impact.`)
    + mailText(`نرد عليه خلال ${days} يومًا على الأكثر، ويصلك بريد بقرارنا. عند تنفيذه تُحذف شهادتك إن صدرت، ويبقى ما يُلزمنا النظام بحفظه (سجلات الدفع) ${PAYMENT_RETENTION_YEARS} سنوات وحدها.`)
    + mailButton(CONFIG.appUrl, 'افتح ملفي')
    + mailNote('إن لم تطلب ذلك أو غيّرت رأيك فاسحب الطلب من صفحة ملفك في التطبيق قبل تنفيذه. بعد التنفيذ لا تُسترد البيانات.'),
    'طلب حذف البيانات', 'وصلتك هذه الرسالة لأن طلب حذف سُجّل من حسابك.');
}

// تأكيد تنفيذ الحذف: آخر رسالة لمن حُذفت بياناته، إلى عنوانه الملتقط قبل الحذف. لا تدخل الطابور (sendMail queue:false):
// الطابور يحفظ عنوان من مُحيت بياناته. تذكر تاريخ التنفيذ وما حُذف وما بقي ولماذا وإلى متى (erasure.js، المصدر الواحد)
const arDay = (iso: string) => new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' });
export const ERASE_DONE_SUBJECT = 'نُفّذ طلب حذف بياناتك';
export function eraseDoneMail(name: string | null, doneAt: string) {
  return shell('access', ERASE_DONE_SUBJECT,
    mailText(`${hello(name)} حذفنا حسابك وبياناتك من منصة Milestone Impact في ${bdi(arDay(doneAt))}.`)
    + mailRows([
      ['ما حُذف', ERASE_DELETED.join('، ')],
      ...ERASE_KEPT.map((k) => [k.title, k.text] as [string, string]),
    ])
    + mailNote('لا تُسترد البيانات بعد الحذف. إن عدت إلى البرنامج يومًا فسجّل من جديد.'),
    'نُفّذ طلب الحذف', 'وصلتك هذه الرسالة الأخيرة لأنك طلبت حذف بياناتك، ولن يصلك منا بعدها شيء.');
}

// الرد برفض الطلب: السبب وأساسه، وما يبقى، وحق الشكوى إلى سدايا، وأن له إعادة الطلب متى زال السبب
export const ERASE_DECLINED_SUBJECT = 'ردنا على طلب حذف بياناتك';
export function eraseDeclinedMail(name: string | null, ground: keyof typeof ERASE_GROUNDS, note: string | null, at: string) {
  const g = ERASE_GROUNDS[ground] || ERASE_GROUNDS.other;
  return shell('access', ERASE_DECLINED_SUBJECT,
    mailText(`${hello(name)} درسنا طلبك حذف حسابك وبياناتك من منصة Milestone Impact، وقررنا في ${bdi(arDay(at))} ألّا ننفذه الآن، وحسابك باقٍ كما هو.`)
    + mailRows([
      ['السبب', g.ar],
      ...(g.basis ? [['الأساس النظامي', g.basis] as [string, string]] : []),
      ...(note ? [['التوضيح', note] as [string, string]] : []),
    ])
    + mailText('لك أن تعيد الطلب من صفحة ملفك في التطبيق متى زال هذا السبب، ولك أن تراسلنا بالرد على هذه الرسالة إن رأيت أن قرارنا لا يصح.')
    + mailButton(CONFIG.appUrl, 'افتح ملفي')
    + mailNote('إن لم يرضك ردنا فلك الحق في تقديم شكوى إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا) بوصفها الجهة المختصة بحماية البيانات الشخصية.'),
    'ردنا على طلب الحذف', 'وصلتك هذه الرسالة ردًّا على طلب حذف سُجّل من حسابك.');
}

// تأكيد السحب حين أبلغ المشارك المدير بنفسه (بريد أو اتصال أو رسالة): هذا هو الضمان أن السحب صدر منه فعلًا
export const ERASE_WITHDRAWN_SUBJECT = 'أُغلق طلب حذف بياناتك بناءً على طلبك';
export function eraseWithdrawnMail(name: string | null, via: string, at: string) {
  return shell('access', ERASE_WITHDRAWN_SUBJECT,
    mailText(`${hello(name)} أبلغتنا ${esc(via)} أنك تسحب طلب حذف حسابك وبياناتك، فأغلقناه في ${bdi(arDay(at))}، وحسابك باقٍ كما هو.`)
    + mailButton(CONFIG.appUrl, 'افتح ملفي')
    + mailNote('إن لم تطلب سحبه فأعد الطلب من صفحة ملفك في التطبيق، أو رد على هذه الرسالة لنتابعه معك.'),
    'أُغلق طلب الحذف', 'وصلتك هذه الرسالة لأن طلب حذف من حسابك أُغلق.');
}

// بريد المالك عن طلب حذف (عند وصوله وفي كل تذكير): الاسم والمهلة والأيام المتبقية، وزر يفتح ورقة الطلب نفسها
// لا النظرة العامة. erase_request وerase_reminder في طبقة الحرج: بريد وسلاك معًا ولا يُجمعان
export const ERASE_OWNER_KINDS = ['erase_request', 'erase_reminder'];
export const erasureUrl = (participantId: string) => `${SITES.admin}/#/leaders/participants/${encodeURIComponent(participantId)}?erasure=open`;
// العنوان بلا اسم: يُحفظ في سجل البريد 180 يومًا، ولا يُمحى بحذف صاحب الطلب (عنوانه بريد المالك لا بريده)
export function eraseOwnerSubject(kind: string, detail: Record<string, unknown>) {
  const left = Number(detail.days_left);
  return kind === 'erase_request' ? `طلب حذف بيانات جديد، ${leftAr(left)}` : left < 0 ? `طلب حذف بيانات ${leftAr(left)}` : `تذكير: طلب حذف بيانات، ${leftAr(left)}`;
}
export function eraseOwnerMail(kind: string, detail: Record<string, unknown>) {
  const who = String(detail.name || 'مشارك');
  const left = Number(detail.days_left);
  const due = detail.due_at ? bdi(arDay(String(detail.due_at))) : '';
  const lead = kind === 'erase_request'
    ? `وصل طلب حذف بيانات من ${bdi(who)}. المهلة النظامية للرد ${due} (${esc(leftAr(left))}).`
    : left < 0 ? `تجاوز طلب حذف بيانات ${bdi(who)} المهلة النظامية (${due}). قرر الآن.`
    : `طلب حذف بيانات ${bdi(who)} ينتظر قرارك، ${esc(leftAr(left))} (المهلة ${due}).`;
  return shell('admin', eraseOwnerSubject(kind, detail),
    mailText(lead)
    + mailRows([...(detail.reason ? [['سببه', String(detail.reason)] as [string, string]] : []), ['رقم الطلب', String(detail.request || ''), true]])
    + mailButton(String(detail.url || `${SITES.admin}/#/leaders/participants`), 'افتح الطلب')
    + mailNote('من الورقة تنفّذ الحذف، أو ترفضه بسبب نظامي، أو تغلقه إن سحبه صاحبه. القرار للمدير الأعلى.'),
    `${who} · ${leftAr(left)}`, 'يصلك هذا لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.');
}

// دخول من جهاز جديد: تنبيه لصاحب الحساب مع طريقة إنهاء الجلسة إن لم يكن هو
export function passkeyAddedMail(name: string, device: string, when: string) {
  return shell('access', 'أُضيف مفتاح مرور إلى حسابك',
    mailText(`${hello(name)} أُضيف مفتاح مرور جديد يدخل به صاحبه إلى رحلتك بلا رمز بريد.`)
    + mailRows([['الجهاز', device], ['الوقت', when]])
    + mailNote('إن كان أنت فلا شيء عليك. وإن لم يكن: افتح ملفك › «مفاتيح المرور» واحذفه، فتنتهي معه الجلسات الأخرى.')
    + mailButton(`${CONFIG.appUrl}/?tab=profile`, 'مفاتيح المرور'),
    `${device} · ${when}`, '');
}
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
  return shell('organization', mailTitle`لوحة ${org} في برنامج القادة`,
    mailText(`${hello(name)} أُنشئ لك حساب منسق لجهة ${bdi(org)} في برنامج القادة.`)
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
  return shell('organization', mailTitle`ملخص ${org} الأسبوعي`,
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
  return shell('organization', mailTitle`${org} تطّلع على رحلتك`,
    mailText(`${hello(name)} فُتح لجهتك ${bdi(org)} الاطلاع على: <b>${items.map(esc).join('، ')}</b>.`)
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
    mailText(`${hello(name)} أضافتك إدارة برنامج القادة إلى فريق <b>${bdi(a.cohort)}</b>${a.org ? ` في ${bdi(a.org)}` : ''}.`)
    + mailRows([['الدور', a.role], ['التكليف', a.scope], ['المدة', a.period]])
    + mailText('تجد تكليفاتك وعدد من تخدمهم في لوحة الخبير، تحت «تكليفاتي». إن تعذّر عليك هذا التكليف فراسل إدارة البرنامج.')
    + mailButton(`${SITES.leaders}/x`, 'افتح لوحة الخبير'),
    `${a.role} في ${a.cohort}`, 'تصلك هذه الرسالة لأن إدارة برنامج القادة أضافتك إلى فريق دفعة.');
}
export const assignmentNote = (a: AssignmentMail) =>
  mailNote(`<b>تكليفك:</b> ${bdi(a.role)} في فريق ${bdi(a.cohort)}${a.org ? ` (${bdi(a.org)})` : ''}، ${bdi(a.period)}. يبدأ عملك فيه بعد اعتماد ملفك.`);

// ── الإدارة ──
export function healthMail(rows: [string, string][], issues: string[]) {
  return shell('admin', 'تقرير الأسبوع: برنامج القادة',
    mailRows(rows)
    + (issues.length ? mailText('<b>ما يحتاج تدخلك</b>') + mailNote(issues.map(esc).join('<br>')) : mailText('لا شيء يحتاج تدخلك هذا الأسبوع.'))
    + mailButton(`${SITES.admin}/#/leaders/overview`, 'افتح لوحة الإدارة'),
    issues.length ? `${issues.length} يحتاج تدخلك` : 'لا شيء يحتاج تدخلك', 'يصلك هذا التقرير كل أسبوع لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.');
}

// الملخص الأسبوعي لدفعة جارية (تصور تشغيل الدفعة 2026-11-19، المرحلة 3، القرار 11): أعداد من لقطة الدفعة اليومية وحدها، بلا اسم
// مشارك ولا بريد ولا جوال. اسم الدفعة ومراحلها ليست بيانات مشارك. والزر يفتح تبويب «المتابعة» في ملفها
// الاسم بعد النقطتين لا داخل الجملة: أسماء الدفعات تبدأ غالبًا بكلمة «دفعة»
export const cohortWeeklySubject = (cohort: string) => `الملخص الأسبوعي: ${cohort}`;
export type CohortWeekly = { members: number; active_week: number; late: number; waiting: number; finished: number; done_week: number; stages: { title: string; here: number }[]; next_at: string | null; taken_at: string };
const riyadhTime = (iso: string) => new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export function cohortWeeklyMail(cohort: { id: string; name: string }, k: CohortWeekly) {
  return shell('admin', mailTitle`الملخص الأسبوعي: ${cohort.name}`,
    mailRows([['الأعضاء', k.members], ['نشطون هذا الأسبوع', k.active_week], ['أنشطة مكتملة هذا الأسبوع', k.done_week],
      ...k.stages.filter((x) => x.here > 0).map((x) => [`في مرحلة ${x.title}`, x.here] as [string, unknown]),
      ['أتموا الرحلة', k.finished], ['متأخرون', k.late], ['ينتظرون قرارك', k.waiting],
      ['أقرب جلسة', k.next_at ? riyadhTime(k.next_at) : 'لا جلسة مؤرخة']])
    + mailNote(`الأعداد من لقطة ${esc(riyadhTime(k.taken_at))} بتوقيت الرياض، بلا أسماء. التفاصيل في تبويب «المتابعة».`)
    + mailButton(`${SITES.admin}/#/leaders/programs/${encodeURIComponent(cohort.id)}?view=follow`, 'افتح المتابعة'),
    `${k.active_week} نشطون · ${k.late} متأخرون · ${k.waiting} ينتظرون قرارك`, 'يصلك هذا الملخص كل أحد لكل دفعة جارية. توقفه من مركز الإشعارات في لوحة الإدارة.');
}

// تنبيه أمني بتغيير مفتاح المساعد للمالكين: الحساب والطريقة والوقت وآخر أربعة وحدها، بلا شيء آخر من المفتاح
export const AGENT_KEY_MAIL_SUBJECT = { changed: 'تنبيه أمني: تم تغيير مفتاح المساعد', reverted: 'تنبيه أمني: أُعيد مفتاح المساعد إلى سر الخادم' };
export function agentKeyMail(kind: 'changed' | 'reverted', rows: [string, string][]) {
  return shell('admin', AGENT_KEY_MAIL_SUBJECT[kind],
    mailRows(rows)
    + mailNote('إن لم تكن أنت، ادخل وارجع إلى سر الخادم من «المساعد الآلي» وأنهِ الجلسات الأخرى.')
    + mailButton(`${SITES.admin}/#/leaders/agent`, 'افتح شاشة المساعد'),
    AGENT_KEY_MAIL_SUBJECT[kind], 'يصلك هذا لأنك من مالكي لوحة الإدارة.');
}

// بريد الملاك الأمني لتغيير توجيه الإشعارات (مركز الإشعارات، المرحلة 4، صف notify_routing_changed المقفل): ما تغير
// بتسميات الفهرس وحدها، ومن حفظ ومتى
export const ROUTING_MAIL_SUBJECT = 'تنبيه أمني: تغير توجيه إشعارات الإدارة';
export function routingMail(rows: [string, string][]) {
  return shell('admin', ROUTING_MAIL_SUBJECT,
    mailRows(rows)
    + mailNote('إن لم تكن أنت أو أحد الملاك، ادخل وأعد الإعداد من قسم «التوجيه» في مركز البريد، وأنهِ الجلسات الأخرى وغيّر وسيلة الدخول.')
    + mailButton(`${SITES.admin}/#/leaders/mailcenter`, 'افتح مركز البريد'),
    ROUTING_MAIL_SUBJECT, 'يصلك هذا لأنك من مالكي لوحة الإدارة.');
}

// ── تنبيه التشغيل الفوري ──
// خطأ داخلي (500) أو تعطل البريد يصل المالك فورًا لا في تقرير الأحد، مرة في كل مهلة تهدئة
// لكل نوع. النافذة تُقرأ من audit_log (action=system.alert) فلا جدول جديد.
const ALERT_WINDOW_MS = 10 * 60e3;
// حوادث البريد تدوم ساعات (السقف حتى تصفير حصة اليوم 03:00 بالرياض، ورفض النطاق حتى يُصلح)، فمهلتها أطول: حادثة واحدة لا تُرسل تنبيهات كثيرة.
// mail_queue_stuck بلا مهلة نوع: الرابط يُهدَّأ لكل رسالة في stuckQueueAlert، وبريده احتياط مقيّد (stuckMailDue).
// وتجربة القناة مرة في الدقيقة
export const ALERT_COOLDOWN_MS: Record<string, number> = {
  mail_cap: 6 * 36e5, mail_quota_70: 6 * 36e5, mail_rejected: 36e5, mail_counter_unavailable: 36e5, mail_queue_stuck: 0, alert_test: 60e3,
  // سطر الترحيل اليومي (carryoverAlert): مرة في اليوم، فمهلته أقل من يوم بقليل
  mail_queue_carryover: 20 * 36e5,
  // إخفاق الفتح عند أجهزة كثيرة (client-events.ts bootAlert): الفعل مفتوح بلا جلسة، فساعة تحد ما قد يصل من تنبيه مصطنع
  client_boot_failures: 36e5,
  // تذكير طلب الحذف بلا تهدئة: المرحلة تُحجز في الصف قبل التنبيه (erasure.ts remindSweep) فلا يتكرر، والتهدئة كانت
  // تحجب إعادة تذكير لم يصل من أي قناة (تُكتب قبل أي قناة) ثم يُعدّ واصلًا
  erase_reminder: 0,
  // كل تغيير في المساعد يُبلَّغ (بلا تهدئة)
  agent_key_changed: 0, agent_key_reverted: 0, agent_enabled: 0, agent_disabled: 0,
  // تنبيهات agent-chat تُهدَّأ هناك بعلامة يومية في القاعدة (agent_spend_alert)، فلا تهدئة ثانية تحجب مستوى عن آخر
  agent_spend_80: 0, agent_spend_cap: 0, agent_eval_stale: 0, agent_model_unknown: 0, agent_ledger_error: 0, agent_model_config: 0,
};
export const alertCooldown = (kind: string) => ALERT_COOLDOWN_MS[kind] ?? ALERT_WINDOW_MS;
const SPAN_AR: Record<number, string> = { 60e3: 'دقيقة', 600e3: 'عشر دقائق', 36e5: 'ساعة', 216e5: 'ست ساعات', 72e6: 'عشرين ساعة' };
export function alertMail(kind: string, detail: Record<string, unknown>, windowMs = ALERT_WINDOW_MS) {
  const rows = Object.entries(detail).map(([k, v]) => [k, String(v ?? '')] as [string, string]);
  // fn: الدالة التي رفعت التنبيه إن لم تكن leaders-api (agent-chat مثلًا)
  const where = typeof detail.fn === 'string' && detail.fn ? detail.fn : 'leaders-api';
  const calm = windowMs > 0 ? ` لن يصلك تنبيه آخر من النوع نفسه خلال ${SPAN_AR[windowMs] ?? `${Math.round(windowMs / 6e4)} دقيقة`}.` : '';
  return shell('admin', `تنبيه تشغيلي: ${kind}`,
    mailText(`وقع <b>${bdi(kind)}</b> في ${bdi(where)} الآن.${esc(calm)}`)
    + mailRows(rows)
    + mailButton(`${SITES.admin}/#/leaders/overview`, 'افتح لوحة الإدارة'),
    `${kind} في ${where}`, 'يصلك هذا التنبيه لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.');
}
// بريد mail_queue_stuck: التنبيه بالبريد من نصيب الرموز في السقف، والطابور يتأخر في الأيام المزدحمة نفسها،
// فلا يُرسل إلا حين لا يصل الرابط، ومرة كل ست ساعات بين النسخ (من سجل البريد بعنوانه). ما لم يصل لا يُعلَّم ويُعاد
export const STUCK_MAIL_MS = 6 * 36e5;
const alertSubject = (kind: string) => `تنبيه: ${kind} في leaders-api`;
let stuckMailAt = 0;
async function stuckMailDue() {
  if (stuckMailAt > Date.now() - STUCK_MAIL_MS) return false;
  const { count, error } = await db.from('mail_events').select('id', { count: 'exact', head: true })
    .eq('kind', 'alert').eq('status', 'sent').eq('subject', alertSubject('mail_queue_stuck')).gte('created_at', new Date(Date.now() - STUCK_MAIL_MS).toISOString());
  return !!error || !(count ?? 0);   // تعذّر السجل: التنبيه أهون من ضياعه
}
// تهدئة احتياطية داخل النسخة حين يتعذّر السجل نفسه (تنبيه audit_failed مثلًا)، فلا يفيض البريد
const lastAlert = new Map<string, number>();
// بريد «Slack لا يستقبل التنبيهات»: سلاك مضبوط ولم يصل منه تنبيه، فيُبلَّغ المالك مرة كل ست ساعات على الأكثر (التصور 6.4).
// العلامة من سجل البريد بعنوانه كبريد الطابور العالق، وما لم يصل لا يُعلَّم فيُعاد مع التنبيه التالي
let slackDownAt = 0;
export const resetSlackDown = () => { slackDownAt = 0; };   // للاختبار
async function slackDownDue() {
  if (slackDownAt > Date.now() - SLACK_DOWN_MS) return false;
  const { count, error } = await db.from('mail_events').select('id', { count: 'exact', head: true })
    .eq('kind', 'alert').eq('status', 'sent').eq('subject', SLACK_DOWN_SUBJECT).gte('created_at', new Date(Date.now() - SLACK_DOWN_MS).toISOString());
  return !!error || !(count ?? 0);
}
export function slackDownMail(kind: string) {
  return shell('admin', SLACK_DOWN_SUBJECT,
    mailText(`لم يصل تنبيه <b>${bdi(kind)}</b> إلى سلسلة التنبيهات في Slack. التنبيهات المهمة تصلك بالبريد بدلها حتى يعود.`)
    + mailNote('راجع حالة Slack في بطاقة صحة البريد والتنبيه، ثم أرسل تنبيهًا تجريبيًا. لن يصلك هذا البريد ثانية قبل ست ساعات.')
    + mailButton(`${SITES.admin}/#/leaders/overview`, 'افتح لوحة الإدارة'),
    'Slack لا يستقبل التنبيهات', 'يصلك هذا التنبيه لأن بريدك مضبوط في LEADERS_ALERT_EMAIL.');
}
// يستعمله أيضًا إشعار المالك التشغيلي (notify.ts) حين لا يصل سطره
export async function slackDownNotice(kind: string) {
  if (!(await slackDownDue())) return false;
  slackDownAt = Date.now();
  const ok = await sendMail(CONFIG.alertEmail, SLACK_DOWN_SUBJECT, slackDownMail(kind), [], { kind: 'alert' }).then(() => true, (e) => { console.error('slack down mail:', e); return false; });
  if (!ok) slackDownAt = 0;
  return ok;
}
// cooled: كُبح بالمهلة فلم يُرسل شيء، وwebhook وemail: ما وصل من القناتين، وrouted: ما قرره جدول التوجيه بعد حال سلاك
export type AlertResult = { cooled: boolean; webhook: boolean; email: boolean; slack?: boolean; routed?: { email: boolean; slack: boolean } };
// key: مفتاح تهدئة داخل النوع (رقم طلب الحذف مثلًا): لكل طلب تنبيهه، فطلبان في عشر دقائق لا يُسقط ثانيهما.
// المهلة وسطر السجل بالمفتاح المركب `${kind}:${key}`، والنوع في القناتين كما هو
// mail: ما يدخل متن بريد المالك وحده (اسم المشارك وسببه في طلب الحذف): لا يُكتب في سجل التدقيق الذي لا يُحذف منه
// (system.alert)، ولا يصل سلاك ولا الرابط، ولا يدخل العنوان المحفوظ في سجل البريد
export type AlertOpts = { key?: string | null; mail?: Record<string, unknown> | null };
// القناة يقررها جدول التوجيه وحده (_shared/notify-routing.js): الحرج بريد وسلاك دائمًا، والمهم سلاك والبريد احتياط
// حين لا يصل سلاك ولا الرابط، ومفتاح المساعد بلا بريد (يغطيه بريد الملاك الأمني). والإعداد ما حفظه المالك في قسم
// «التوجيه» (notifySettings، ذاكرة الدقيقة)، و«متوازن» الافتراضي إن لم يُحفظ أو تعذّرت قراءته
export async function raiseAlert(kind: string, detail: Record<string, unknown>, { key = null, mail = null }: AlertOpts = {}): Promise<AlertResult> {
  const windowMs = alertCooldown(kind);
  const cool = key ? `${kind}:${key}` : kind;
  const cooled = { cooled: true, webhook: false, email: false, slack: false };
  if (windowMs > 0 && (lastAlert.get(cool) ?? 0) > Date.now() - windowMs) return cooled;
  // المهلة تُحجز قبل أول انتظار: دفعة متزامنة (رموز محجوبة بالسقف) تنبيه واحد لا تستنفد احتياط البريد
  if (windowMs > 0) lastAlert.set(cool, Date.now());
  try {
    if (windowMs > 0) {
      const since = new Date(Date.now() - windowMs).toISOString();
      const { count, error } = await db.from('audit_log').select('id', { count: 'exact', head: true })
        .eq('action', 'system.alert').eq('entity_id', cool).gte('created_at', since);
      if (!error && (count ?? 0) > 0) return cooled;
    }
    // أثر التنبيه يهدّئ التنبيهات بين النسخ؛ وتعذّره لا يمنع التنبيه، فقد يكون التنبيه عن تعذّر السجل نفسه
    await audit('system', 'alert', 'system.alert', 'system', cool, null, detail).catch((e) => console.error('alertOps audit:', e));
    // قناة غير البريد أولًا (D15): حين يكون العطل في البريد نفسه يصل التنبيه. سلاك والرابط معًا، وكلاهما قناة كافية
    // (readiness.js ALERT_CHANNELS)، فنتيجة سلاك تُنتظر (بمهلة) لتُحسب في «وصل» كما يُحسب الرابط
    const settings = await notifySettings(db);
    const plan = route(kind, settings);
    const [webhook, slack] = plan.slack
      ? await Promise.all([alertWebhook(kind, detail, { slack: false }), slackAlertDelivered(kind, detail)])
      : [false, false];
    const state = plan.slack ? slackStateOf({ delivered: webhook || slack, configured: slackConfigured() || !!Deno.env.get('LEADERS_ALERT_WEBHOOK') }) : 'ok';
    const decided = route(kind, settings, state);
    const routed = { email: decided.email, slack: plan.slack };
    const base = { cooled: false, webhook, slack, routed };
    if (!CONFIG.alertEmail || !CONFIG.resendKey) return { ...base, email: false };
    // سلاك مضبوط ولم يستقبل: بريد واحد بذلك كل ست ساعات، مستقل عن بريد التنبيه نفسه
    if (plan.slack && !slack && slackConfigured()) await slackDownNotice(kind);
    if (!decided.email) return { ...base, email: false };
    // بريد الطابور العالق احتياط مقيّد فوق قاعدة «المهم»: مرة كل ست ساعات بين النسخ
    if (kind === 'mail_queue_stuck') {
      if (!(await stuckMailDue())) return { ...base, email: false };
      stuckMailAt = Date.now();
    }
    // التنبيه بالبريد يمر فوق السقف باحتياطه (ALERT_OVER_CAP)، فلا يحجبه امتلاء اليوم الذي ينبّه إليه
    // طلب الحذف وتذكيره بقالبهما (الاسم والمهلة وزر الورقة)، وغيرهما بقالب الحادثة العام
    const owner = ERASE_OWNER_KINDS.includes(kind);
    const email = await sendMail(CONFIG.alertEmail, owner ? eraseOwnerSubject(kind, detail) : alertSubject(kind), owner ? eraseOwnerMail(kind, { ...detail, ...(mail || {}) }) : alertMail(kind, detail, windowMs), [], { kind: 'alert' })
      .then(() => true, (e) => { console.error('alertOps mail:', e); return false; });
    // بريد الطابور لم يصل: تُرفع مهلته فيُعاد في الساعة التالية لا بعد ست ساعات
    if (kind === 'mail_queue_stuck' && !email) stuckMailAt = 0;
    return { ...base, email };
  } catch (e) { console.error('alertOps:', e); return { cooled: false, webhook: false, email: false, slack: false }; }
}
export async function alertOps(kind: string, detail: Record<string, unknown>, opts: AlertOpts = {}) {
  const r = await raiseAlert(kind, detail, opts);
  return r.webhook || !!r.slack || r.email;
}

// معرض المعاينة في لوحة الإدارة: كل قالب ببيانات تجريبية، من الدوال نفسها التي تُرسل
export const MAIL_GALLERY: { key: string; family: MailFamily; label: string; subject: string; html: () => string }[] = [
  { key: 'signin', family: 'access', label: 'رمز دخول المشارك', subject: 'رمز الدخول إلى رحلتك', html: () => signInMail('سارة', '153262', CONFIG.appUrl, false) },
  { key: 'register', family: 'access', label: 'إكمال التسجيل', subject: 'أكمل تسجيلك في برنامج القادة', html: () => signInMail('سارة', '153262', CONFIG.appUrl, true) },
  { key: 'coord-signin', family: 'access', label: 'رمز دخول لوحة الجهة', subject: 'رمز الدخول إلى لوحة الجهة', html: () => coordinatorSignInMail('خالد', '820417', `${CONFIG.appUrl}/org`) },
  { key: 'approved', family: 'journey', label: 'اعتماد المستوى', subject: 'اعتُمد مستواك في برنامج القادة', html: () => approvedMail('سارة') },
  { key: 'approved-pay', family: 'journey', label: 'اعتماد المسار مع رابط الدفع', subject: 'اعتُمد مسارك في برنامج القادة', html: () => approvedMail('سارة', true) },
  { key: 'pay-receipt', family: 'journey', label: 'تأكيد الدفع للعميل (بمفتاح)', subject: 'وصلنا دفعك', html: () => paymentReceiptMail('سارة', 'القياس المبدئي', '1.99 USD', 'ord_123', 'القياس مفتوح لك الآن.', { sub: '1.99 USD', tax: '0.30 USD', total: '2.29 USD' }) },
  { key: 'pay-refund', family: 'journey', label: 'إشعار الاسترداد للعميل (بمفتاح)', subject: 'استُردّت دفعتك', html: () => paymentRefundMail('سارة', 'القياس المبدئي', '1.99 USD') },
  { key: 'pay-refund-partial', family: 'journey', label: 'إشعار الاسترداد الجزئي للعميل (بمفتاح)', subject: 'استُردّ جزء من دفعتك', html: () => paymentRefundMail('سارة', 'رسم البرنامج', '20.00 USD', '99.00 USD') },
  { key: 'pay-abandon', family: 'journey', label: 'تذكير من لم يكمل الدفع (يدوي)', subject: 'دفعك لم يكتمل', html: () => paymentAbandonMail('سارة', 'القياس المبدئي') },
  { key: 'pay-owner', family: 'admin', label: 'تنبيه الإدارة بدفعة (بمفتاح)', subject: 'دفعة جديدة', html: () => paymentOwnerMail('دفعة جديدة', [['المشارك', 'سارة الأحمد'], ['البند', 'القياس المبدئي'], ['المبلغ', '1.99 USD']]) },
  { key: 'pay-owner-over', family: 'admin', label: 'تنبيه الإدارة بدفعة أعلى من المطلوب', subject: 'دفعة أعلى من المطلوب', html: () => paymentOwnerMail('دفعة أعلى من المطلوب', [['المشارك', 'سارة الأحمد'], ['البند', 'القياس المبدئي'], ['المطلوب', '1.00 USD'], ['المدفوع قبل الضريبة', '1.99 USD'], ['الضريبة', '0.30 USD'], ['المدفوع', '2.29 USD'], ['القرار', 'مُنح الحق، واسترداد الفرق قرارك من لوحة Creem'], ['رقم الطلب', 'ord_123']]) },
  { key: 'pay-reminder', family: 'journey', label: 'تذكير إكمال التسجيل', subject: 'مسارك المعتمد بانتظارك', html: () => payReminderMail('سارة', 3) },
  { key: 'review-ok', family: 'journey', label: 'اعتماد عمل', subject: 'اعتُمد بند في رحلتك', html: () => reviewMail('سارة', 'خطة التطوير الشخصية', false) },
  { key: 'review-returned', family: 'journey', label: 'إعادة عمل بملاحظة', subject: 'ملاحظة من المستشار على رحلتك', html: () => reviewMail('سارة', 'خطة التطوير الشخصية', true, 'أضف مؤشرًا قابلًا للقياس لكل هدف.') },
  // التذكير الموحد (nudge.js): نص المحرك نفسه لكل مرسل. المفتاحان القديمان باقيان لسجل البريد
  { key: 'reminder', family: 'journey', label: 'تذكير: الخطوة التالية في الرحلة (كل المرسلين)', subject: 'خطوتك التالية في «التدريب»',
    html: () => nudgeMail('سارة', 'خطوتك التالية في «التدريب»', stageText({ stage: 'التدريب', need: 'خطة المبادرة', progress: 40, days: 9 }), '— فريق برنامج القادة') },
  { key: 'stuck', family: 'journey', label: 'تذكير: إكمال التسجيل والقياس (كل المرسلين)', subject: STUCK_MAIL_SUBJECT,
    html: () => nudgeMail('سارة', STUCK_MAIL_SUBJECT, stuckMailText({ step: 'assessment_doing', answered: 42, total: 63 })!, '— فريق برنامج القادة') },
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
  { key: 'workshop-invite-trainer', family: 'sessions', label: 'دعوة الجلسة التدريبية: بمدرب مسمى', subject: WORKSHOP_MAIL.invite.subject, html: () => workshopMail('invite', 'سارة', 'ورشة التفاوض', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', null, false, true, 'qr', 'د. منى القحطاني') },
  { key: 'workshop-change', family: 'sessions', label: 'تحديث الجلسة التدريبية: تغيّر الموعد أو المكان', subject: WORKSHOP_CHANGE_MAIL.subject, html: () => workshopChangeMail('سارة', 'ورشة التفاوض', 'الاثنين 16 نوفمبر · 10:00', 'قاعة الملك فهد، الدور الأول', null, false, { when: true, where: true }, 'د. منى القحطاني') },
  { key: 'workshop-cancel', family: 'sessions', label: 'إلغاء الجلسة التدريبية: للمدعوين', subject: WORKSHOP_CANCEL_MAIL.subject, html: () => workshopCancelMail('سارة', 'ورشة التفاوض', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', 'د. منى القحطاني') },
  { key: 'workshop-cancel-stale', family: 'sessions', label: 'إلغاء الجلسة التدريبية: بموعد لم يُبلَّغ تغييره', subject: WORKSHOP_CANCEL_MAIL.subject, html: () => workshopCancelMail('سارة', 'ورشة التفاوض', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', 'د. منى القحطاني', true) },
  { key: 'workshop-undate', family: 'sessions', label: 'سحب موعد الجلسة التدريبية: للمدعوين', subject: WORKSHOP_UNDATE_MAIL.subject, html: () => workshopUndateMail('سارة', 'ورشة التفاوض', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', 'د. منى القحطاني') },
  { key: 'workshop-invite-to-trainer', family: 'sessions', label: 'دعوة الجلسة التدريبية: للمدرب', subject: WORKSHOP_TRAINER_MAIL.invite.subject, html: () => workshopTrainerMail('invite', 'د. منى', { title: 'ورشة التفاوض', when: 'الأحد 15 نوفمبر · 09:00', where: 'قاعة التدريب، الدور الثالث', cohort: 'دفعة الخريف', count: 18 }) },
  { key: 'workshop-change-trainer', family: 'sessions', label: 'تحديث الجلسة التدريبية: للمدرب', subject: WORKSHOP_TRAINER_MAIL.change.subject, html: () => workshopTrainerMail('change', 'د. منى', { title: 'ورشة التفاوض', when: 'الاثنين 16 نوفمبر · 10:00', where: 'قاعة الملك فهد، الدور الأول', cohort: 'دفعة الخريف', count: 18, changed: { when: true, where: true } }) },
  { key: 'workshop-undate-trainer', family: 'sessions', label: 'سحب موعد الجلسة التدريبية: للمدرب', subject: WORKSHOP_TRAINER_MAIL.undate.subject, html: () => workshopTrainerMail('undate', 'د. منى', { title: 'ورشة التفاوض', when: 'الأحد 15 نوفمبر · 09:00', where: 'قاعة التدريب، الدور الثالث', cohort: 'دفعة الخريف', count: 18 }) },
  { key: 'workshop-release-trainer', family: 'sessions', label: 'استبدال مدرب الجلسة التدريبية: للمدرب السابق', subject: WORKSHOP_TRAINER_MAIL.release.subject, html: () => workshopTrainerMail('release', 'د. منى', { title: 'ورشة التفاوض', when: 'الأحد 15 نوفمبر · 09:00', where: 'قاعة التدريب، الدور الثالث', cohort: 'دفعة الخريف', count: 0 }) },
  { key: 'workshop-cancel-trainer', family: 'sessions', label: 'إلغاء الجلسة التدريبية: للمدرب', subject: WORKSHOP_TRAINER_MAIL.cancel.subject, html: () => workshopTrainerMail('cancel', 'د. منى', { title: 'ورشة التفاوض', when: 'الأحد 15 نوفمبر · 09:00', where: 'قاعة التدريب، الدور الثالث', cohort: 'دفعة الخريف', count: 18 }) },
  { key: 'workshop-restore-trainer', family: 'sessions', label: 'إعادة جلسة تدريبية ملغاة: للمدرب', subject: WORKSHOP_TRAINER_MAIL.restore.subject, html: () => workshopTrainerMail('restore', 'د. منى', { title: 'ورشة التفاوض', when: 'الأحد 15 نوفمبر · 09:00', where: 'قاعة التدريب، الدور الثالث', cohort: 'دفعة الخريف', count: 18 }) },
  { key: 'group-session-invite', family: 'sessions', label: 'الجلسة الجماعية مع المستشار: دعوة المشارك', subject: GROUP_SESSION_MAIL.invite.subject, html: () => groupSessionMail('invite', 'سارة', { title: 'جلسة جماعية: الاستشارة', when: 'الأحد 6 ديسمبر، 10:00 ص', expert: 'د. منى القحطاني', joinUrl: 'https://meet.example.com/group', counts: true }) },
  { key: 'group-session-change', family: 'sessions', label: 'الجلسة الجماعية مع المستشار: تغيّر الموعد أو المكان', subject: GROUP_SESSION_MAIL.change.subject, html: () => groupSessionMail('change', 'سارة', { title: 'جلسة جماعية: الاستشارة', when: 'الاثنين 7 ديسمبر، 11:00 ص', expert: 'د. منى القحطاني', where: 'قاعة الاجتماعات، الدور الثالث' }) },
  { key: 'group-session-cancel', family: 'sessions', label: 'الجلسة الجماعية مع المستشار: إلغاء', subject: GROUP_SESSION_MAIL.cancel.subject, html: () => groupSessionMail('cancel', 'سارة', { title: 'جلسة جماعية: الاستشارة', when: 'الأحد 6 ديسمبر، 10:00 ص', expert: 'د. منى القحطاني' }) },
  { key: 'group-session-removed', family: 'sessions', label: 'الجلسة الجماعية مع المستشار: إزالة مشارك', subject: GROUP_SESSION_MAIL.removed.subject, html: () => groupSessionMail('removed', 'سارة', { title: 'جلسة جماعية: الاستشارة', when: 'الأحد 6 ديسمبر، 10:00 ص', expert: 'د. منى القحطاني' }) },
  { key: 'group-session-expert', family: 'sessions', label: 'الجلسة الجماعية مع المستشار: تكليف المستشار', subject: GROUP_EXPERT_MAIL.assign.subject, html: () => groupExpertMail('assign', 'د. منى', { title: 'جلسة جماعية: الاستشارة', when: 'الأحد 6 ديسمبر، 10:00 ص', cohort: 'دفعة الخريف', count: 6, joinUrl: 'https://meet.example.com/group' }) },
  { key: 'workshop-day', family: 'sessions', label: 'تذكير الجلسة التدريبية: قبل يوم', subject: WORKSHOP_MAIL.day.subject, html: () => workshopMail('day', 'سارة', 'اليوم التدريبي الأول', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', null) },
  { key: 'workshop-hour', family: 'sessions', label: 'تذكير الجلسة التدريبية: قبل ساعة', subject: WORKSHOP_MAIL.hour.subject, html: () => workshopMail('hour', 'سارة', 'اليوم التدريبي الأول', 'الأحد 15 نوفمبر · 09:00', 'قاعة التدريب، الدور الثالث', null) },
  { key: 'session-reminder', family: 'sessions', label: 'تذكير الجلسة', subject: 'جلستك غدًا', html: () => sessionReminderMail('سارة', 'الأحد 2 نوفمبر · 10:00', 'د. منى القحطاني', 'https://meet.google.com/abc-defg-hij') },
  { key: 'erase-request', family: 'access', label: 'تأكيد طلب حذف البيانات', subject: ERASE_MAIL_SUBJECT, html: () => eraseRequestMail('سارة', 30) },
  { key: 'erase-done', family: 'access', label: 'تأكيد تنفيذ حذف البيانات', subject: ERASE_DONE_SUBJECT, html: () => eraseDoneMail('سارة', '2026-11-16T09:00:00Z') },
  { key: 'erase-declined', family: 'access', label: 'الرد برفض طلب حذف البيانات', subject: ERASE_DECLINED_SUBJECT, html: () => eraseDeclinedMail('سارة', 'litigation', 'البيانات مطلوبة في دعوى منظورة أمام المحكمة التجارية', '2026-11-16T09:00:00Z') },
  { key: 'erase-withdrawn', family: 'access', label: 'تأكيد سحب طلب الحذف بطلب المشارك', subject: ERASE_WITHDRAWN_SUBJECT, html: () => eraseWithdrawnMail('سارة', 'بالبريد', '2026-11-16T09:00:00Z') },
  { key: 'erase-owner', family: 'admin', label: 'تذكير المالك بطلب حذف ينتظر قراره', subject: eraseOwnerSubject('erase_reminder', { name: 'سارة الأحمد', days_left: 3 }), html: () => eraseOwnerMail('erase_reminder', { name: 'سارة الأحمد', days_left: 3, due_at: '2026-12-10T09:00:00Z', request: '22222222-2222-4222-8222-222222222222', reason: 'انتهى البرنامج', url: erasureUrl('11111111-1111-4111-8111-111111111111') }) },
  { key: 'passkey-added', family: 'access', label: 'إضافة مفتاح مرور', subject: 'أُضيف مفتاح مرور إلى حسابك', html: () => passkeyAddedMail('سارة', 'iPhone · Safari', 'الأحد 2 نوفمبر · 10:00') },
  { key: 'new-device', family: 'access', label: 'دخول من جهاز جديد', subject: 'دخول جديد إلى حسابك', html: () => newDeviceMail('سارة', 'iPhone · Safari', 'الأحد 2 نوفمبر · 10:00') },
  { key: 'coord-invite', family: 'organization', label: 'دعوة مطّلع الجهة', subject: 'لوحة وزارة التجربة في برنامج القادة', html: () => coordinatorInviteMail('خالد', 'وزارة التجربة', { invite_code: 'tajriba', seats: 25, contract_starts: '2026-11-01', contract_ends: '2027-10-31' }) },
  { key: 'cohort-weekly', family: 'admin', label: 'ملخص الدفعة الأسبوعي', subject: cohortWeeklySubject('دفعة التجربة'), html: () => cohortWeeklyMail({ id: '00000000-0000-0000-0000-000000000000', name: 'دفعة التجربة' }, { members: 24, active_week: 17, late: 3, waiting: 2, finished: 1, done_week: 31, stages: [{ title: 'التدريب', here: 14 }, { title: 'التطبيق في العمل', here: 6 }], next_at: '2026-11-24T06:00:00Z', taken_at: '2026-11-22T00:17:00Z' }) },
  { key: 'coord-weekly', family: 'organization', label: 'ملخص الجهة الأسبوعي', subject: 'ملخص وزارة التجربة الأسبوعي', html: () => coordinatorWeeklyMail('خالد', 'وزارة التجربة', { total: 24, joined_week: 3, active_week: 17, approved: 20, completed: 4, avg_progress: 46 }) },
  { key: 'org-access', family: 'organization', label: 'إشعار اطلاع الجهة', subject: 'وزارة التجربة تطّلع على رحلتك', html: () => orgAccessMail('سارة', 'وزارة التجربة', ['التواصل', 'المستويات']) },
  { key: 'team-assigned', family: 'experts', label: 'التكليف في فريق دفعة', subject: 'كُلّفت في فريق دفعة وزارة التجربة 2026', html: () => teamAssignedMail('منى', { cohort: 'دفعة وزارة التجربة 2026', org: 'وزارة التجربة', role: 'موجّه', scope: 'خبير المجموعة 2', period: '1 مارس 2026 إلى 30 يونيو 2026' }) },
  { key: 'health', family: 'admin', label: 'تقرير الأسبوع للإدارة', subject: 'تقرير الأسبوع: برنامج القادة', html: () => healthMail([['مشاركون جدد', '12'], ['بانتظار الاعتماد', '3']], ['3 مشاركين بانتظار اعتماد المستوى منذ أكثر من 3 أيام']) },
  { key: 'agent-key', family: 'admin', label: 'تنبيه أمني: تغيير مفتاح المساعد', subject: AGENT_KEY_MAIL_SUBJECT.changed, html: () => agentKeyMail('changed', [['الحساب', 'o***@example.com'], ['الطريقة', 'مفتاح المرور'], ['آخر أربعة قبل', '••••wxyz'], ['آخر أربعة بعد', '••••abcd'], ['الوقت', '15 نوفمبر 2026، 10:20']]) },
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
// المدة افتراضًا يوم المزوّد الحالي (mailDayStart)، كما يعد حارس الإرسال.
// null: العداد غير مقروء الآن، فيقرر sendCounted (الرموز والتنبيه تمر، وما سواها يُحجب أو يدخل الطابور، وينبّه)
export async function mailUsage(since = mailDayStart()) {
  return (await mailCounts(db, since))?.sent ?? null;
}
// الرمز يُحتسب في السقف فقط إن أُرسل فعلًا: فشل الإرسال يحذف صفه ويرفع الخطأ نفسه
const CODE_PURPOSE: Record<string, string> = { email_challenges: 'دخول مشارك', coordinator_challenges: 'دخول جهة', expert_challenges: 'دخول خبير' };
export async function sendOrDiscard(table: string, id: string, to: string, subject: string, html: string, purpose = CODE_PURPOSE[table] ?? table) {
  try { await sendMail(to, subject, html, [], { kind: 'code', purpose }); }
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
  if ((await mailUsage() ?? 0) >= CONFIG.mailDailyCap) {   // حصة اليوم (من 03:00 بالرياض)، لا حدود الشبكة المتحركة
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
