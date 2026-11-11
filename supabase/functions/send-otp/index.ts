import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { esc, MAIL_FROM_DEFAULT, mailButton, mailNote, mailRows, mailShell, mailText, plain, sendCounted } from "../_shared/mail.ts";
import { SITES } from "../_shared/sites.js";

// send-otp: نموذج التواصل فقط: إدراج الطلب (contact)، وتنبيه الإدارة، وتأكيد المرسل.
// النشر: يتطلب جدول mail_log (supabase/migrations/20261022030000_mail_log.sql)،
// وعمود contact_requests.ip (supabase/migrations/20261105100000_contact_requests_via_function.sql).
//
// الإدراج عبر الدالة لا مباشرة من المتصفح: تحقق بشري (Turnstile) إن كان مفعّلًا،
// وحدود لكل بريد ولكل شبكة وللجميع، فلا يستطيع أحد إرسال بريد باسمكم إلى عناوين
// من اختياره. لا تُرسل رسالة إلا عن طلب حقيقي محفوظ، ومرة واحدة لكل طلب ونوع.
// القيم تُقرأ من الجدول لا من جسم الطلب، وتُرمَّز قبل وضعها في HTML.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
// التحقق البشري: المفتاح نفسه الذي يستعمله تطبيق القادة (أضف mi.sunkvalue.com إلى نطاقات الأداة في Cloudflare).
// إلزامي منذ المرحلة ل1: بلا المفتاحين يُرفض النموذج (والصفحة تعرض بديل البريد المباشر) بدل أن يُفتح للإغراق
const TURNSTILE_SECRET = Deno.env.get("LEADERS_TURNSTILE_SECRET") || "";
const TURNSTILE_SITE = Deno.env.get("LEADERS_TURNSTILE_SITE_KEY") || "";
const ADMIN_EMAIL = "p.o.m2012@hotmail.com";
const FROM_EMAIL = MAIL_FROM_DEFAULT;
const FRESH_MS = 10 * 60 * 1000;
// حدود الإغراق: لكل بريد في الساعة، ولكل شبكة في الساعة، وللجميع في الساعة
const PER_EMAIL_HOUR = 3;
const PER_IP_HOUR = 5;
const GLOBAL_HOUR = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// رسائل نموذج التواصل بالعداد الموحد (D15) نوعًا contact، فتُحتسب من نصيب غير الرموز
const MAIL_CAP = Number(Deno.env.get("LEADERS_MAIL_DAILY_CAP") || "80") || 80;
const counter = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const sendEmail = async (to: string, subject: string, html: string) =>
  (await sendCounted(counter, to, subject, html, { kind: "contact", source: "send-otp", cap: MAIL_CAP, key: RESEND_API_KEY, from: FROM_EMAIL })).ok;

// عميل بلا أنواع جداول (لا مخطط مولَّد هنا)
// deno-lint-ignore no-explicit-any
type SB = any;
type Row = Record<string, unknown>;

const clientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

async function turnstileOk(token: unknown, ip: string | null) {
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;
  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return !!(await r.json())?.success;
  } catch { return false; }
}

// أحدث طلب تواصل بهذا البريد في آخر 10 دقائق، أو لا شيء.
async function freshContact(sb: SB, email: string) {
  if (!email || email.length > 254) return null;
  const { data } = await sb.from("contact_requests")
    .select("id, name, organization, email, phone, interest, interest_label, product, created_at")
    .eq("email", email.trim().toLowerCase())
    .gte("created_at", new Date(Date.now() - FRESH_MS).toISOString())
    .order("created_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

// يحجز الرسالة قبل إرسالها؛ القيد الفريد يمنع التكرار. أي خطأ آخر يمنع الإرسال.
async function claim(sb: SB, kind: "notify" | "confirm", ref: string): Promise<boolean> {
  const { error } = await sb.from("mail_log").insert({ kind, ref });
  if (!error) return true;
  if (error.code !== "23505") console.error("mail_log:", error);
  return false;
}

// عدد الطلبات منذ وقت، أو null إن تعذّر العد فيفشل الطلب مغلقًا (لا طلب بلا حد)
async function countSince(sb: SB, since: string, filter?: (q: any) => any): Promise<number | null> {
  let q: any = sb.from("contact_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) { console.error("contact count:", error); return null; }
  return count ?? 0;
}

const PAGE_LABEL: Record<string, string> = { "MI-HOME": "الصفحة الرئيسية", "MI-LEADERS": "صفحة برنامج القادة", "MI-ASSESSMENT": "مقياس جاهزية الأثر" };

async function notifyAdmin(sb: SB, r: Row) {
  if (!(await claim(sb, "notify", String(r.id)))) return;
  const pageLabel = PAGE_LABEL[r.product as string] || (r.product as string) || "غير محدد";
  const dateStr = new Date(r.created_at as string).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const html = mailShell(`طلب تواصل جديد من ${r.name}`, `
${mailText(`${esc(dateStr)} · ${esc(pageLabel)}`)}
${mailRows([
  ["الاسم", r.name as string],
  ["الجهة", (r.organization as string) || "—"],
  ["البريد", r.email as string, true],
  ["الجوال", (r.phone as string) || "—", true],
  ["نوع الطلب", (r.interest_label as string) || (r.interest as string) || "—"],
  ["المصدر", pageLabel],
])}
${mailButton(SITES.admin, "افتح لوحة الإدارة")}`, { family: "admin", preheader: "طلب تواصل جديد من الموقع", footnote: "" });
  await sendEmail(ADMIN_EMAIL, `طلب جديد من ${plain(r.name as string)} — ${plain(pageLabel)}`, html);
}

async function confirmSender(sb: SB, r: Row) {
  if (!(await claim(sb, "confirm", String(r.id)))) return;
  const isLeaders = r.product === "MI-LEADERS";
  const homeHtml = mailShell(`وصلتنا رسالتكم، ${r.name}`, `
${mailText(`شكرًا لتواصلكم مع Milestone Impact. سيتواصل معكم أحد أعضاء الفريق خلال <b>48 ساعة عمل</b>.`)}
${mailNote(`طلبكم: ${esc((r.interest_label as string) || (r.interest as string) || "استفسار عام")}`)}`, { family: "general", preheader: "يتواصل معكم الفريق خلال 48 ساعة عمل", footnote: "استلمتم هذه الرسالة لأنكم أرسلتم طلب تواصل من موقعنا." });
  const leadersHtml = mailShell(`أهلًا بكم، ${r.name}`, `
${mailText(`يسرّنا استلام طلب انضمامكم إلى برنامج القادة من Milestone Impact. سيتواصل معكم الفريق خلال <b>48 ساعة عمل</b>.`)}`, { family: "general", preheader: "يتواصل معكم الفريق خلال 48 ساعة عمل", footnote: "استلمتم هذه الرسالة لأنكم أرسلتم طلب انضمام من موقعنا." });
  const subject = isLeaders ? `تأكيد طلبكم — برنامج القادة` : `استلمنا طلبكم — Milestone Impact`;
  await sendEmail(r.email as string, subject, isLeaders ? leadersHtml : homeHtml);
}

// ════════ CONTACT ════════
async function contact(sb: SB, body: Record<string, unknown>, req: Request) {
  const ip = clientIp(req);
  const email = text(body.email, 254).toLowerCase();
  const name = text(body.name, 120);
  if (name.length < 2) return json({ success: false, code: "invalid", message: "اكتبوا الاسم" }, 400);
  if (!isEmail(email)) return json({ success: false, code: "invalid", message: "البريد الإلكتروني غير صحيح" }, 400);
  if (!TURNSTILE_SECRET || !TURNSTILE_SITE) {
    console.error("send-otp: Turnstile keys missing; the contact form is closed");
    return json({ success: false, code: "captcha_unconfigured", message: "النموذج متوقف مؤقتًا، راسلونا على البريد مباشرة" }, 503);
  }
  if (!(await turnstileOk(body.captcha, ip))) {
    return json({ success: false, code: "captcha", site_key: TURNSTILE_SITE, message: body.captcha ? "تعذّر التحقق، أعيدوا المحاولة" : "أكّدوا أنكم لستم برنامجًا آليًا" }, 400);
  }
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const limits: [number | null, number][] = [
    [await countSince(sb, hourAgo, (q) => q.eq("email", email)), PER_EMAIL_HOUR],
    [ip ? await countSince(sb, hourAgo, (q) => q.eq("ip", ip)) : 0, PER_IP_HOUR],
    [await countSince(sb, hourAgo), GLOBAL_HOUR],
  ];
  if (limits.some(([n]) => n === null)) return json({ success: false, code: "rate", message: "تعذّر التحقق من حد الطلبات الآن، حاولوا بعد قليل أو راسلونا بالبريد" }, 429);
  if (limits.some(([n, max]) => (n ?? 0) >= max)) return json({ success: false, code: "rate", message: "طلبات كثيرة، حاولوا بعد ساعة أو راسلونا بالبريد" }, 429);

  const row: Row = {
    product: text(body.product, 40) || "MI-HOME", source_url: text(body.source_url, 500), name, organization: text(body.organization, 200),
    email, phone: text(body.phone, 40), interest: text(body.interest, 40), interest_label: text(body.interest_label, 120),
    context: text(body.context, 2000), user_agent: text(body.user_agent, 300), language: text(body.language, 40), status: "new",
  };
  const ins = await sb.from("contact_requests").insert({ ...row, ip }).select("id, name, organization, email, phone, interest, interest_label, product, created_at").single();
  if (ins.error || !ins.data) {
    console.error("contact insert:", ins.error);
    return json({ success: false, code: "db", message: "تعذّر حفظ الطلب الآن" }, 500);
  }
  // الرسالتان من الصف المحفوظ؛ فشل البريد لا يُفشل الطلب (محفوظ في اللوحة)
  await notifyAdmin(sb, ins.data as Row).catch((e) => console.error("notify:", e));
  await confirmSender(sb, ins.data as Row).catch((e) => console.error("confirm:", e));
  return json({ success: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // send/verify القديمان كانا يكشفان بريد المدراء ويقبلان تخمين الرمز بلا حد.
    // دخول الإدارة كله الآن عبر admin-api.
    if (action === "send" || action === "verify") {
      return json({ success: false, message: "استخدم admin-api" }, 410);
    }

    if (action === "contact") return await contact(supabase, body, req);

    // notify/confirm: للصفحات المخزّنة قبل v4 التي ما زالت تُدرج مباشرة (حتى يُطبَّق ترحيل الإغلاق)
    if (action === "notify") {
      const r = await freshContact(supabase, String(body.emailContact || body.email || ""));
      if (r) await notifyAdmin(supabase, r as Row);
      return json({ success: true });
    }
    if (action === "confirm") {
      const r = await freshContact(supabase, String(body.email || ""));
      if (r) await confirmSender(supabase, r as Row);
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("send-otp:", err);
    return json({ error: "خطأ داخلي" }, 500);
  }
});
