import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const FROM_EMAIL = "Milestone Impact <milestoneimpact@basserh.com>";
const FRESH_MS = 10 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
// سطر عنوان البريد نص لا HTML، لكن بلا أسطر جديدة ولا طول مفتوح.
const plain = (v: unknown, max = 60) => String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) { console.log("No RESEND_API_KEY"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) { console.error("Resend error:", await res.text()); return false; }
  return true;
}

function emailWrapper(content: string) {
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#f5f3ef">
    <div style="background:linear-gradient(135deg,#061E2C 0%,#0A2A3D 100%);padding:26px 30px;border-radius:14px 14px 0 0;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:10px">
        <div style="width:42px;height:42px;background:linear-gradient(135deg,#14495E,#0A2A3D);border:1px solid rgba(200,164,92,0.4);border-radius:10px;display:inline-flex;align-items:center;justify-content:center">
          <span style="color:#C8A45C;font-weight:700;font-size:0.95rem">MI</span>
        </div>
        <div style="text-align:right">
          <div style="color:#F2EBD9;font-size:1rem;font-weight:600">Milestone Impact</div>
          <div style="color:#C8A45C;font-size:0.72rem;margin-top:1px">مصفوفة التأثير</div>
        </div>
      </div>
    </div>
    <div style="background:#fff;padding:28px 30px;border-radius:0 0 14px 14px;border:1px solid #e8e4df;border-top:none">
      ${content}
      <div style="margin-top:24px;padding-top:18px;border-top:1px solid #f0ece6;text-align:center">
        <p style="color:#bbb;font-size:0.68rem;margin:0">© 2026 Milestone Impact — جميع الحقوق محفوظة</p>
        <p style="color:#ccc;font-size:0.62rem;margin:4px 0 0">هذا البريد مرسل تلقائياً، لا تقم بالرد عليه</p>
      </div>
    </div>
  </div>`;
}

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
      const html = emailWrapper(`
        <div style="display:inline-block;background:rgba(20,73,94,0.1);color:#14495E;border:1px solid rgba(20,73,94,0.25);border-radius:20px;padding:4px 14px;font-size:0.76rem;margin-bottom:18px">🔔 طلب تواصل جديد</div>
        <h2 style="color:#061E2C;margin:0 0 4px;font-size:1.1rem">وصل طلب من ${esc(r.name)}</h2>
        <p style="color:#8B9AAB;font-size:0.82rem;margin:0 0 22px">${esc(dateStr)} · ${esc(pageLabel)}</p>
        <div style="background:#f9f8f6;border-radius:10px;border:1px solid #ede9e3;overflow:hidden;margin-bottom:18px">
          <table style="width:100%;border-collapse:collapse">
            ${[
              ["الاسم", r.name],
              ["الجهة", r.organization || "—"],
              ["البريد", r.email],
              ["الجوال", r.phone || "—"],
              ["نوع الطلب", r.interest_label || r.interest || "—"],
              ["المصدر", pageLabel],
            ].map(([k, v], i) => `<tr style="${i > 0 ? "border-top:1px solid #f0ece6" : ""}">
              <td style="color:#8B9AAB;font-size:0.75rem;padding:10px 14px;width:35%">${esc(k)}</td>
              <td style="color:#061E2C;font-size:0.82rem;font-weight:600;padding:10px 14px">${esc(v)}</td>
            </tr>`).join("")}
          </table>
        </div>
        <div style="text-align:center">
          <a href="https://admin.sunkvalue.com" style="display:inline-block;background:linear-gradient(135deg,#061E2C,#14495E);color:#F2EBD9;text-decoration:none;padding:11px 26px;border-radius:8px;font-size:0.88rem;font-weight:600">فتح لوحة الإدارة</a>
        </div>
      `);
      await sendEmail(ADMIN_EMAIL, `طلب جديد من ${plain(r.name)} — ${plain(pageLabel)}`, html);
      return json({ success: true });
    }

    // ════════ CONFIRM ════════
    if (action === "confirm") {
      const r = await freshContact(supabase, String(body.email || ""));
      if (!r || !(await claim(supabase, "confirm", String(r.id)))) return json({ success: true });

      const isLeaders = r.product === "MI-LEADERS";
      const homeHtml = emailWrapper(`
        <p style="color:#8B9AAB;font-size:0.78rem;font-weight:600;letter-spacing:0.08em;margin:0 0 8px">— MILESTONE IMPACT —</p>
        <h2 style="color:#061E2C;margin:0 0 6px;font-size:1.15rem;font-weight:700">وصلتنا رسالتكم، ${esc(r.name)}</h2>
        <p style="color:#6B6560;font-size:0.88rem;margin:0 0 22px;line-height:1.7">شكراً لتواصلكم مع Milestone Impact. سيتواصل معكم أحد أعضائنا خلال <strong style="color:#061E2C">48 ساعة عمل</strong>.</p>
        <div style="background:#f5f3ef;border-radius:10px;padding:16px 18px;border-right:3px solid #C8A45C;margin-bottom:22px">
          <div style="font-size:0.72rem;color:#8B9AAB;font-weight:600;margin-bottom:4px">طلبكم</div>
          <div style="font-size:0.9rem;color:#061E2C;font-weight:700">${esc(r.interest_label || r.interest || "استفسار عام")}</div>
        </div>
      `);
      const leadersHtml = emailWrapper(`
        <p style="color:#8B9AAB;font-size:0.78rem;font-weight:600;letter-spacing:0.08em;margin:0 0 8px">— برنامج إدارة المشروعات للقادة —</p>
        <h2 style="color:#061E2C;margin:0 0 6px;font-size:1.15rem;font-weight:700">أهلاً بكم، ${esc(r.name)}</h2>
        <p style="color:#6B6560;font-size:0.88rem;margin:0 0 20px;line-height:1.75">يسرّنا استلام طلب انضمامكم إلى برنامج <strong style="color:#061E2C">MI-Leaders</strong>. سيتواصل معكم الفريق خلال <strong style="color:#061E2C">48 ساعة عمل</strong>.</p>
      `);
      const subject = isLeaders ? `تأكيد طلبكم — برنامج MI-Leaders` : `استلمنا طلبكم — Milestone Impact`;
      await sendEmail(r.email as string, subject, isLeaders ? leadersHtml : homeHtml);
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("send-otp:", err);
    return json({ error: "خطأ داخلي" }, 500);
  }
});
