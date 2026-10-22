import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// user-api: تسجيل مشاركي Matrix ودخولهم وحفظ بياناتهم.
//
// قواعد أمان:
// - لا رد يكشف هل البريد أو الجوال مسجّل قبل إثبات ملكية البريد بالرمز.
// - الرمز يُثبت ملكية البريد فقط، فالجلسة تُفتح لتسجيل هذا البريد وحده،
//   ولا تُفتح أبدًا لتسجيل آخر لمجرد تطابق رقم الجوال.
// - الرموز من مولّد تشفيري وتُحفظ هاشًا.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Milestone Impact <milestoneimpact@basserh.com>";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h user sessions
const OTP_COOLDOWN_MS = 60 * 1000;           // 60s between sends per email
const OTP_TTL_MS = 10 * 60 * 1000;           // codes valid 10 min
const MAX_FAILS = 5;                          // failed verifies per 15 min window
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const BAD_CODE_MSG = "رمز التحقق غير صحيح أو منتهي الصلاحية";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const validPhone = (p: string) => /^05\d{8}$/.test((p || "").replace(/\s/g, ""));
// بلا فواصل أو أقواس أو علامات اقتباس، فلا يصلح البريد لحقن مرشّحات أو HTML.
const validEmail = (e: string) => /^[^\s@<>"'(),;]+@[^\s@<>"'(),;]+\.[a-zA-Z]{2,}$/.test(e || "") && (e || "").length <= 254;

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function randomCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}
const otpHash = (email: string, code: string) => sha256hex(`user-otp:${email}:${code}`);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND) { console.log("No RESEND_API_KEY"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) { console.error("Resend error:", await res.text()); return false; }
  return true;
}

function otpHtml(code: string) {
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f3ef;padding:24px;border-radius:14px">
    <div style="background:linear-gradient(135deg,#061E2C,#0A2A3D);border-radius:10px;padding:20px 24px;text-align:center;margin-bottom:20px">
      <span style="color:#C8A45C;font-size:1rem;font-weight:700">Milestone Impact — مصفوفة التأثير</span>
    </div>
    <p style="color:#1F3340;font-size:.95rem;margin:0 0 18px">رمز التحقق الخاص بك:</p>
    <div style="background:#fff;border-radius:10px;padding:20px;text-align:center;border:1px solid #e8e4df;margin-bottom:16px">
      <span style="font-size:2.4rem;font-weight:700;color:#14495E;letter-spacing:14px;font-family:monospace;direction:ltr">${code}</span>
    </div>
    <p style="color:#8B9AAB;font-size:.78rem;text-align:center">صالح لمدة 10 دقائق فقط — إذا لم تطلبه تجاهل هذا البريد</p>
  </div>`;
}

type SB = ReturnType<typeof createClient>;

async function cooldownOk(sb: SB, email: string): Promise<number> {
  const since = new Date(Date.now() - OTP_COOLDOWN_MS).toISOString();
  const { data } = await sb.from("email_otps").select("created_at").eq("email", email)
    .gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  if (!data?.length) return 0;
  const last = new Date(data[0].created_at as string).getTime();
  return Math.max(0, Math.ceil((OTP_COOLDOWN_MS - (Date.now() - last)) / 1000));
}

async function failsExceeded(sb: SB, key: string): Promise<boolean> {
  const since = new Date(Date.now() - FAIL_WINDOW_MS).toISOString();
  const { count } = await sb.from("totp_attempts").select("*", { count: "exact", head: true })
    .eq("email", key).eq("success", false).gte("created_at", since);
  return (count ?? 0) >= MAX_FAILS;
}

async function issueOtp(sb: SB, email: string) {
  const code = randomCode();
  const exp = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const { error } = await sb.from("email_otps")
    .insert({ email, otp_code: await otpHash(email, code), verified: false, expires_at: exp });
  if (error) throw error;
  await sendEmail(email, `رمز التحقق: ${code} — مصفوفة التأثير`, otpHtml(code));
}

async function checkOtp(sb: SB, email: string, otp: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await sb.from("email_otps").select("id")
    .eq("email", email).eq("otp_code", await otpHash(email, otp)).eq("verified", false).gte("expires_at", now)
    .order("created_at", { ascending: false }).limit(1);
  if (!data?.length) return false;
  await sb.from("email_otps").update({ verified: true }).eq("id", data[0].id);
  return true;
}

async function createSession(sb: SB, subject: string): Promise<string> {
  const token = randomToken();
  const { error } = await sb.from("api_sessions").insert({
    token_hash: await sha256hex(token), kind: "user", subject,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return token;
}

async function getSession(sb: SB, token: string): Promise<string | null> {
  if (!token || token.length < 32) return null;
  const { data } = await sb.from("api_sessions").select("subject, expires_at")
    .eq("token_hash", await sha256hex(token)).eq("kind", "user").limit(1);
  if (!data?.length) return null;
  if (new Date(data[0].expires_at as string).getTime() < Date.now()) return null;
  return data[0].subject as string;
}

async function emailForPhone(sb: SB, phone: string): Promise<string | null> {
  const { data } = await sb.from("registrations").select("email").eq("phone", phone).limit(1);
  return data?.length ? String(data[0].email).toLowerCase() : null;
}

// Only these fields may be written by a user session; identity fields never change here.
const SAVE_FIELDS = ["dates", "confirmed", "submitted", "submittedAt", "reopenRequested", "demographic_analysis"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const action = body.action as string;
    const sb = createClient(SB_URL, SB_KEY);

    // ── register-send: the code proves ownership of this email, nothing more ──
    if (action === "register-send") {
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").replace(/\s/g, "");
      const email = String(body.email || "").trim().toLowerCase();
      if (!name || name.length > 80) return json({ success: false, message: "الاسم غير صالح" }, 400);
      if (!validPhone(phone)) return json({ success: false, message: "رقم الجوال غير صالح" }, 400);
      if (!validEmail(email)) return json({ success: false, message: "البريد غير صالح" }, 400);
      const wait = await cooldownOk(sb, email);
      if (wait > 0) return json({ success: false, message: `يرجى الانتظار ${wait} ثانية قبل إعادة الإرسال` }, 429);
      await issueOtp(sb, email);
      // مسجّل أم جديد يُعرف بعد التحقق فقط، فلا يكشف هذا الرد شيئًا.
      return json({ success: true, mode: "new" });
    }

    // ── resume-send: same reply whether or not the phone is registered ──
    if (action === "resume-send") {
      const phone = String(body.phone || "").replace(/\s/g, "");
      if (!validPhone(phone)) return json({ success: false, message: "رقم الجوال غير صالح" }, 400);
      const email = await emailForPhone(sb, phone);
      if (email) {
        const wait = await cooldownOk(sb, email);
        if (wait > 0) return json({ success: false, message: `يرجى الانتظار ${wait} ثانية قبل إعادة الإرسال` }, 429);
        await issueOtp(sb, email);
      }
      return json({ success: true });
    }

    // ── verify: check OTP, then open a session for THIS email's registration only ──
    if (action === "verify") {
      const otp = String(body.otp || "");
      const phone = String(body.phone || "").replace(/\s/g, "");
      const givenEmail = String(body.email || "").trim().toLowerCase();
      if (!/^\d{6}$/.test(otp)) return json({ success: false, message: "أدخل رمزاً من 6 أرقام" }, 400);

      // resume flow sends phone only; resolve email server-side
      const email = givenEmail || (phone ? await emailForPhone(sb, phone) : null);
      // حدّ المحاولات على البريد إن عُرف، وإلا على الجوال، فلا يُخمَّن بلا سقف.
      const key = email || `phone:${phone}`;
      if (!email && !phone) return json({ success: false, message: "بيانات ناقصة" }, 400);

      if (await failsExceeded(sb, key)) {
        return json({ success: false, message: "تجاوزت الحد المسموح من المحاولات، انتظر 15 دقيقة" }, 429);
      }
      const ok = !!email && await checkOtp(sb, email, otp);
      await sb.from("totp_attempts").insert({ email: key, success: ok });
      if (!ok || !email) return json({ success: false, message: BAD_CODE_MSG });

      const { data: regs } = await sb.from("registrations").select("*").eq("email", email).limit(1);
      let reg = regs?.[0] || null;
      let mode = "resume";
      if (!reg) {
        const name = String(body.name || "").trim();
        if (!name || name.length > 80 || !validPhone(phone)) return json({ success: false, message: "بيانات التسجيل ناقصة" }, 400);
        // الجوال لصاحب بريد آخر: لا تُفتح جلسته، ولا يُكرَّر الرقم.
        if (await emailForPhone(sb, phone)) {
          return json({ success: false, message: "هذا الجوال مسجّل ببريد آخر، استخدم استعادة الجلسة برقم الجوال" }, 409);
        }
        const id = `reg:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const record = {
          id, name, phone, email,
          registeredAt: new Date().toISOString(),
          dates: {}, confirmed: {}, submitted: false, reopenRequested: false,
        };
        const { data: inserted, error } = await sb.from("registrations").insert(record).select("*").limit(1);
        if (error) throw error;
        reg = inserted?.[0] || record;
        mode = "new";
      }
      const token = await createSession(sb, reg.id as string);
      return json({ success: true, mode, token, registration: reg });
    }

    // ── get: fetch own registration ──
    if (action === "get") {
      const subject = await getSession(sb, String(body.token || ""));
      if (!subject) return json({ success: false, message: "انتهت الجلسة، سجّل دخولك مجددًا" }, 401);
      const { data } = await sb.from("registrations").select("*").eq("id", subject).limit(1);
      if (!data?.length) return json({ success: false, message: "التسجيل غير موجود" }, 404);
      return json({ success: true, registration: data[0] });
    }

    // ── save: update own registration, whitelisted fields only ──
    if (action === "save") {
      const subject = await getSession(sb, String(body.token || ""));
      if (!subject) return json({ success: false, message: "انتهت الجلسة، سجّل دخولك مجددًا" }, 401);
      const fields = body.fields || {};
      const updates: Record<string, unknown> = {};
      for (const k of SAVE_FIELDS) if (k in fields) updates[k] = fields[k];
      if (!Object.keys(updates).length) return json({ success: false, message: "لا توجد حقول للحفظ" }, 400);
      if (JSON.stringify(updates).length > 100_000) return json({ success: false, message: "البيانات أكبر من المسموح" }, 413);
      const { error } = await sb.from("registrations").update(updates).eq("id", subject);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ success: false, message: "Invalid action" }, 400);
  } catch (err) {
    console.error("user-api:", err);
    return json({ success: false, message: "خطأ داخلي" }, 500);
  }
});
