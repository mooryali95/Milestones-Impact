import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deliver, esc, MAIL_FROM_DEFAULT, mailButton, mailNote, mailRows, mailShell, mailText, plain } from "../_shared/mail.ts";

// send-otp: رسائل نموذج التواصل فقط (تنبيه الإدارة وتأكيد المرسل).
// النشر: يتطلب جدول mail_log (supabase/migrations/20261022030000_mail_log.sql).
//
// لا تُرسل رسالة إلا عن طلب تواصل حقيقي أُدرج في آخر 10 دقائق، ومرة واحدة
// لكل طلب ونوع. القيم تُقرأ من الجدول لا من جسم الطلب، وتُرمَّز قبل وضعها
// في HTML، فلا يستطيع أحد إرسال بريد باسمكم بنص من اختياره.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_EMAIL = "p.o.m2012@hotmail.com";
const FROM_EMAIL = MAIL_FROM_DEFAULT;
const FRESH_MS = 10 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sendEmail = (to: string, subject: string, html: string) => deliver(to, subject, html, { key: RESEND_API_KEY, from: FROM_EMAIL });

type SB = ReturnType<typeof createClient>;

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

    // ════════ NOTIFY ADMIN ════════
    if (action === "notify") {
      const r = await freshContact(supabase, String(body.emailContact || body.email || ""));
      if (!r || !(await claim(supabase, "notify", String(r.id)))) return json({ success: true });

      const PAGE_LABEL: Record<string, string> = { "MI-HOME": "الصفحة الرئيسية", "MI-LEADERS": "صفحة برنامج القادة" };
      const pageLabel = PAGE_LABEL[r.product as string] || (r.product as string) || "غير محدد";
      const dateStr = new Date(r.created_at as string).toLocaleString("ar-SA", {
        timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
      });
      const html = mailShell(`طلب تواصل جديد من ${r.name}`, `
${mailText(`${esc(dateStr)} · ${esc(pageLabel)}`)}
${mailRows([
  ["الاسم", r.name],
  ["الجهة", r.organization || "—"],
  ["البريد", r.email, true],
  ["الجوال", r.phone || "—", true],
  ["نوع الطلب", r.interest_label || r.interest || "—"],
  ["المصدر", pageLabel],
])}
${mailButton("https://admin.sunkvalue.com", "افتح لوحة الإدارة")}`, { eyebrow: "NEW CONTACT REQUEST", footnote: "" });
      await sendEmail(ADMIN_EMAIL, `طلب جديد من ${plain(r.name)} — ${plain(pageLabel)}`, html);
      return json({ success: true });
    }

    // ════════ CONFIRM ════════
    if (action === "confirm") {
      const r = await freshContact(supabase, String(body.email || ""));
      if (!r || !(await claim(supabase, "confirm", String(r.id)))) return json({ success: true });

      const isLeaders = r.product === "MI-LEADERS";
      const homeHtml = mailShell(`وصلتنا رسالتكم، ${r.name}`, `
${mailText(`شكرًا لتواصلكم مع Milestone Impact. سيتواصل معكم أحد أعضاء الفريق خلال <b style="font-weight:400;color:#0B272F">48 ساعة عمل</b>.`)}
${mailNote(`طلبكم: ${esc(r.interest_label || r.interest || "استفسار عام")}`)}`, { footnote: "استلمتم هذه الرسالة لأنكم أرسلتم طلب تواصل من موقعنا." });
      const leadersHtml = mailShell(`أهلًا بكم، ${r.name}`, `
${mailText(`يسرّنا استلام طلب انضمامكم إلى برنامج القادة من Milestone Impact. سيتواصل معكم الفريق خلال <b style="font-weight:400;color:#0B272F">48 ساعة عمل</b>.`)}`, { eyebrow: "LEADERS PROGRAM", footnote: "استلمتم هذه الرسالة لأنكم أرسلتم طلب انضمام من موقعنا." });
      const subject = isLeaders ? `تأكيد طلبكم — برنامج القادة` : `استلمنا طلبكم — Milestone Impact`;
      await sendEmail(r.email as string, subject, isLeaders ? leadersHtml : homeHtml);
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("send-otp:", err);
    return json({ error: "خطأ داخلي" }, 500);
  }
});
