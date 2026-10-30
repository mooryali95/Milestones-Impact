import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.3.3";
import { deliver, MAIL_FROM_DEFAULT, mailCode, mailShell, mailText } from "../_shared/mail.ts";

// user-api: تسجيل مشاركي Matrix ودخولهم وحفظ بياناتهم.
//
// قواعد أمان:
// - لا رد يكشف هل البريد أو الجوال مسجّل قبل إثبات ملكية البريد بالرمز.
// - الرمز يُثبت ملكية البريد فقط، فالجلسة تُفتح لتسجيل هذا البريد وحده،
//   ولا تُفتح أبدًا لتسجيل آخر لمجرد تطابق رقم الجوال.
// - الرموز من مولّد تشفيري وتُحفظ هاشًا.
// - مفتاح المرور (النطاق sunkvalue.com) بديل الرمز في الاستئناف، ويُضاف بعد دخول حديث.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = MAIL_FROM_DEFAULT;
const RP_ID = Deno.env.get("USER_RP_ID") || "sunkvalue.com";
const ORIGINS = (Deno.env.get("USER_ORIGINS") || "https://matrix.sunkvalue.com,https://mi.sunkvalue.com")
  .split(",").map((s) => s.trim());

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h user sessions
const OTP_COOLDOWN_MS = 60 * 1000;           // 60s between sends per email
const OTP_TTL_MS = 10 * 60 * 1000;           // codes valid 10 min
const MAX_FAILS = 5;                          // failed verifies per 15 min window
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const FRESH_MS = 10 * 60 * 1000;             // adding a passkey needs a recent sign-in

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

// البريد بالقالب الموحّد (_shared/mail.ts)
const sendEmail = (to: string, subject: string, html: string) => deliver(to, subject, html, { key: RESEND, from: FROM });
const otpHtml = (code: string) => mailShell("رمز التحقق إلى مصفوفة التأثير", `
${mailText("أدخل هذا الرمز في الصفحة التي طلبته منها لإكمال الدخول.")}
${mailCode(code, "صالح 10 دقائق ولمرة واحدة.")}`, { eyebrow: "IMPACT MATRIX" });

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

async function createSession(sb: SB, subject: string, method: "email" | "passkey" = "email"): Promise<string> {
  const token = randomToken();
  const { error } = await sb.from("api_sessions").insert({
    token_hash: await sha256hex(token), kind: "user", subject,
    meta: { method, auth_at: Date.now() },
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return token;
}

async function getSessionInfo(sb: SB, token: string): Promise<{ subject: string; method: string; authAt: number } | null> {
  if (!token || token.length < 32) return null;
  const { data } = await sb.from("api_sessions").select("subject, meta, expires_at")
    .eq("token_hash", await sha256hex(token)).eq("kind", "user").limit(1);
  if (!data?.length) return null;
  if (new Date(data[0].expires_at as string).getTime() < Date.now()) return null;
  const meta = (data[0].meta || {}) as Record<string, unknown>;
  return { subject: data[0].subject as string, method: String(meta.method || ""), authAt: Number(meta.auth_at || 0) };
}

async function getSession(sb: SB, token: string): Promise<string | null> {
  return (await getSessionInfo(sb, token))?.subject ?? null;
}

// ── WebAuthn ──
// bytea عبر PostgREST يُكتب ويُقرأ نصًا سداسيًا يبدأ بـ \x
const toBytea = (u: Uint8Array) => "\\x" + Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
function fromBytea(s: string): Uint8Array<ArrayBuffer> {
  const hex = s.startsWith("\\x") ? s.slice(2) : s;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function challengeOf(response: unknown): string {
  try {
    const r = response as { response?: { clientDataJSON?: string } };
    const b64 = String(r?.response?.clientDataJSON || "").replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(b64)).challenge || "");
  } catch { return ""; }
}
async function saveChallenge(sb: SB, challenge: string, purpose: "register" | "authenticate", subject: string | null) {
  const { error } = await sb.from("webauthn_challenges").insert({
    scope: "user", purpose, subject, challenge, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
  if (error) throw error;
}
// يستهلك التحدي مرة واحدة فقط.
async function takeChallenge(sb: SB, challenge: string, purpose: string) {
  if (!challenge) return null;
  const { data } = await sb.from("webauthn_challenges").update({ consumed_at: new Date().toISOString() })
    .eq("challenge", challenge).eq("scope", "user").eq("purpose", purpose).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString()).select("*");
  return data?.[0] || null;
}
async function challengeFlood(sb: SB): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { count } = await sb.from("webauthn_challenges").select("*", { count: "exact", head: true })
    .eq("scope", "user").gte("created_at", since);
  return (count ?? 0) >= 120;
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

    // ── passkey-login: الاستئناف بمفتاح المرور بدل الرمز ──
    if (action === "passkey-login-options") {
      if (await challengeFlood(sb)) return json({ success: false, message: "محاولات كثيرة، انتظر دقيقة" }, 429);
      const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred" });
      await saveChallenge(sb, options.challenge, "authenticate", null);
      return json({ success: true, options });
    }

    if (action === "passkey-login-verify") {
      const ch = await takeChallenge(sb, challengeOf(body.response), "authenticate");
      if (!ch) return json({ success: false, message: "انتهت مهلة العملية، حاول مرة أخرى" }, 400);
      const { data: pks } = await sb.from("user_passkeys").select("*").eq("credential_id", String(body.response?.id || "")).limit(1);
      const pk = pks?.[0];
      if (!pk) return json({ success: false, code: "unknown_passkey", message: "هذا المفتاح غير مسجّل في المصفوفة، ادخل برقم الجوال" }, 404);
      let v;
      try {
        v = await verifyAuthenticationResponse({
          response: body.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID,
          credential: { id: pk.credential_id, publicKey: fromBytea(pk.public_key), counter: Number(pk.sign_count), transports: pk.transports || undefined },
        });
      } catch (e) {
        console.error("user-api passkey verify:", e);
        return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      }
      if (!v.verified) return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      await sb.from("user_passkeys").update({ sign_count: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", pk.id);
      const { data: regs } = await sb.from("registrations").select("*").eq("id", pk.registration_id).limit(1);
      if (!regs?.length) return json({ success: false, message: "التسجيل غير موجود" }, 404);
      const token = await createSession(sb, String(regs[0].id), "passkey");
      return json({ success: true, mode: "resume", token, registration: regs[0] });
    }

    // ── passkey-register: يُضاف بعد دخول حديث، ومن لديه مفتاح يضيف غيره بجلسة مفتاح ──
    if (action === "passkey-status" || action === "passkey-register-options" || action === "passkey-register-verify") {
      const s = await getSessionInfo(sb, String(body.token || ""));
      if (!s) return json({ success: false, message: "انتهت الجلسة، سجّل دخولك مجددًا" }, 401);
      const { data: existing } = await sb.from("user_passkeys").select("credential_id, transports").eq("registration_id", s.subject);
      const count = existing?.length ?? 0;
      if (action === "passkey-status") return json({ success: true, count });

      if (Date.now() - s.authAt > FRESH_MS) {
        return json({ success: false, code: "reauth", message: "لحمايتك، سجّل خروجك وادخل مجددًا ثم أضف المفتاح" }, 403);
      }
      if (count && s.method !== "passkey") {
        return json({ success: false, code: "reauth_passkey", message: "ادخل بمفتاحك الحالي لإضافة مفتاح آخر" }, 403);
      }
      if (count >= 10) return json({ success: false, message: "الحد الأقصى 10 مفاتيح" }, 400);

      if (action === "passkey-register-options") {
        const { data: regs } = await sb.from("registrations").select("id, name, email").eq("id", s.subject).limit(1);
        if (!regs?.length) return json({ success: false, message: "التسجيل غير موجود" }, 404);
        const options = await generateRegistrationOptions({
          rpName: "Milestone Impact",
          rpID: RP_ID,
          userName: String(regs[0].email),
          userDisplayName: `${regs[0].name || regs[0].email} (المصفوفة)`,
          userID: new TextEncoder().encode(`user:${s.subject}`),
          attestationType: "none",
          excludeCredentials: (existing || []).map((c) => ({ id: c.credential_id as string, transports: (c.transports as never) || undefined })),
          authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
        });
        await saveChallenge(sb, options.challenge, "register", s.subject);
        return json({ success: true, options });
      }

      const ch = await takeChallenge(sb, challengeOf(body.response), "register");
      if (!ch || ch.subject !== s.subject) return json({ success: false, message: "انتهت مهلة العملية، حاول مرة أخرى" }, 400);
      let v;
      try {
        v = await verifyRegistrationResponse({
          response: body.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID,
        });
      } catch (e) {
        console.error("user-api passkey register:", e);
        return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      }
      if (!v.verified || !v.registrationInfo) return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      const info = v.registrationInfo;
      const { error } = await sb.from("user_passkeys").insert({
        registration_id: s.subject,
        credential_id: info.credential.id,
        public_key: toBytea(info.credential.publicKey),
        sign_count: info.credential.counter,
        transports: info.credential.transports || body.response?.response?.transports || null,
        aaguid: info.aaguid,
        backed_up: info.credentialBackedUp,
        device_label: String(body.label || "").trim().slice(0, 80) || null,
      });
      if (error) throw error;
      return json({ success: true, message: "تم حفظ مفتاح المرور" });
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
