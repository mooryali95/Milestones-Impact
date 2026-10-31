import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.3.3";
import { deliver, MAIL_FROM_DEFAULT, mailCode, mailNote, mailRows, mailShell, mailText, plain } from "../_shared/mail.ts";
import { SITES } from "../_shared/sites.js";

// admin-api: دخول لوحة الإدارة وكل عملياتها.
// النشر: supabase functions deploy admin-api
//
// عقد مع leaders-api (لا تغيّره دون تنسيق): جدول api_sessions،
// token_hash = sha256 hex للتوكن بلا ملح، kind = 'admin'، expires_at،
// meta.email وmeta.role ('super_admin' | 'admin' | 'viewer').
//
// مفاتيح المرور: النطاق sunkvalue.com، فالمفتاح نفسه يدخل لوحة الإدارة
// ودخول المستشار في المصفوفة. الجداول في 20261022100000_passkeys_owner.sql.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = MAIL_FROM_DEFAULT;
const APP = "Milestone Impact Admin";
const RP_ID = Deno.env.get("ADMIN_RP_ID") || "sunkvalue.com";
const RP_NAME = "Milestone Impact";
const ORIGINS = (Deno.env.get("ADMIN_ORIGINS") ||
  [SITES.admin, SITES.matrix, SITES.mi].join(",")).split(",").map((s) => s.trim());

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4h admin sessions
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
// العمليات الحساسة (مفاتيح المرور ووضع المفتاح وحده) تتطلب دخولًا حديثًا.
const FRESH_MS = 10 * 60 * 1000;

const ROLES = ["super_admin", "admin", "viewer"];
// المراقب يقرأ فقط؛ هذه الإجراءات تكتب.
const WRITE_ACTIONS = ["unlock-reg", "update-reg", "save-process", "save-content", "update-contact"];
const CONTACT_STATUSES = ["new", "read", "replied", "archived"];

// رد واحد لكل بريد، مسجّلًا كان أم لا، كي لا يكشف من هم المدراء.
const SENT_MSG = "إن كان البريد مسجّلًا فسيصله رمز الدخول خلال دقيقة";
const BAD_CODE_MSG = "الرمز غير صحيح أو منتهي الصلاحية";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
// رمز من 6 أرقام بمولّد تشفيري (Math.random قابل للتنبؤ)، بلا انحياز للباقي.
function randomCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}
// الرمز يُحفظ هاشًا في email_otps.otp_code، لا نصًا صريحًا.
const otpHash = (email: string, code: string) => sha256hex(`admin-otp:${email}:${code}`);
const isEmail = (s: string) => /^[^\s@<>"'();,]+@[^\s@<>"'();,]+\.[a-z]{2,}$/i.test(s) && s.length <= 254;

// ── TOTP (RFC 6238) ──
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32enc(b: Uint8Array): string {
  let o = "", bits = 0, val = 0;
  for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; o += B32[(val >> bits) & 31]; } }
  if (bits > 0) o += B32[(val << (5 - bits)) & 31];
  return o;
}
function b32dec(s: string): Uint8Array {
  s = s.toUpperCase().replace(/=+$/, "");
  const o: number[] = []; let bits = 0, val = 0;
  for (const c of s) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { bits -= 8; o.push((val >> bits) & 0xff); } }
  return new Uint8Array(o);
}
async function hotp(secret: string, counter: bigint): Promise<string> {
  const ck = await crypto.subtle.importKey("raw", b32dec(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, counter);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", ck, buf));
  const off = sig[19] & 0xf;
  return ((((sig[off] & 0x7f) << 24) | ((sig[off + 1] & 0xff) << 16) | ((sig[off + 2] & 0xff) << 8) | (sig[off + 3] & 0xff)) % 1_000_000).toString().padStart(6, "0");
}
async function verifyTotp(secret: string, token: string, win = 1): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  const t = BigInt(Math.floor(Date.now() / 1000 / 30));
  for (let i = -win; i <= win; i++) if (await hotp(secret, t + BigInt(i)) === token) return true;
  return false;
}
function genSecret(): string { return b32enc(crypto.getRandomValues(new Uint8Array(20))); }
function totpUri(secret: string, email: string): string {
  return `otpauth://totp/${encodeURIComponent(APP)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(APP)}&algorithm=SHA1&digits=6&period=30`;
}

// البريد بالقالب الموحّد (_shared/mail.ts)
const sendEmail = (to: string, subject: string, html: string) => deliver(to, subject, html, { key: RESEND, from: FROM });
const ADMIN_MAIL = { family: "access" as const };
const otpHtml = (code: string) => mailShell("رمز الدخول إلى لوحة الإدارة", `
${mailText("أدخل هذا الرمز في صفحة الدخول لإكمال تسجيل دخولك.")}
${mailCode(code, "صالح 10 دقائق ولمرة واحدة.")}`, ADMIN_MAIL);

type SB = ReturnType<typeof createClient>;

async function tooManyFails(sb: SB, email: string): Promise<boolean> {
  const since = new Date(Date.now() - FAIL_WINDOW_MS).toISOString();
  const { count } = await sb.from("totp_attempts").select("*", { count: "exact", head: true })
    .eq("email", email).eq("success", false).gte("created_at", since);
  return (count ?? 0) >= MAX_FAILS;
}

// الجلسة صالحة فقط إن كان صاحبها ما زال نشطًا؛ والدور يُقرأ من admin_users
// لا من meta، فيسري سحب الصلاحية فورًا دون انتظار انتهاء الجلسة.
async function getAdminSession(sb: SB, token: string) {
  if (!token || token.length < 32) return null;
  const { data } = await sb.from("api_sessions").select("subject, meta, expires_at")
    .eq("token_hash", await sha256hex(token)).eq("kind", "admin").limit(1);
  if (!data?.length) return null;
  if (new Date(data[0].expires_at as string).getTime() < Date.now()) return null;
  const userId = data[0].subject as string;
  const { data: us } = await sb.from("admin_users")
    .select("role_id, is_active, email, name, is_owner, passkey_only").eq("id", userId).limit(1);
  if (!us?.length || !us[0].is_active) return null;
  const meta = (data[0].meta || {}) as Record<string, unknown>;
  // وضع المفتاح وحده يُسقط الجلسات التي فُتحت برمز قبل تفعيله.
  if (us[0].passkey_only && meta.method !== "passkey") return null;
  return {
    userId,
    role: String(us[0].role_id || ""),
    email: String(us[0].email || meta.email || ""),
    name: String(us[0].name || ""),
    isOwner: !!us[0].is_owner,
    passkeyOnly: !!us[0].passkey_only,
    method: String(meta.method || ""),
    authAt: Number(meta.auth_at || 0),
  };
}

async function revokeSessions(sb: SB, userId: string) {
  await sb.from("api_sessions").delete().eq("kind", "admin").eq("subject", String(userId));
}

// معرّف حساب Supabase Auth لهذا البريد، يُنشأ مؤكَّدًا إن لم يوجد. الدخول نفسه
// لا يمر بـ Auth (رمز البريد أو مفتاح المرور عبر هذه الدالة)، فلا كلمة مرور.
async function authUserId(sb: SB, email: string): Promise<string | null> {
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (data?.user?.id) return data.user.id;
  if (error) console.error("admin-api createUser:", error.message);
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    const found = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
    if (found) return found.id;
    if (!list?.users?.length || list.users.length < 1000) break;
  }
  return null;
}

type Ctx = { ip: string; ua: string };
const clientCtx = (req: Request): Ctx => ({
  ip: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
  ua: (req.headers.get("user-agent") || "").slice(0, 300),
});

// يُصدر جلسة إدارة. method وauth_at يحددان ما تسمح به الجلسة من عمليات حساسة.
async function issueSession(sb: SB, user: Record<string, unknown>, email: string, method: "passkey" | "totp" | "email", ctx: Ctx) {
  const token = randomToken();
  const { error } = await sb.from("api_sessions").insert({
    token_hash: await sha256hex(token), kind: "admin", subject: String(user.id),
    meta: { role: user.role_id, name: user.name, email, method, auth_at: Date.now(), ip: ctx.ip, ua: ctx.ua },
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) throw error;
  await sb.from("admin_users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
  try {
    await sb.from("admin_audit_log").insert({
      user_id: user.id, user_email: email, action: "login", meta: { role: user.role_id, method, ip: ctx.ip },
    });
  } catch { /* audit best-effort */ }
  // المالك يُبلَّغ بكل دخول إلى حسابه.
  if (user.is_owner) {
    await securityMail(email, "دخول جديد إلى حسابك", [
      ["الطريقة", METHOD_LABELS[method]], ["عنوان IP", ctx.ip || "غير معروف"], ["المتصفح", ctx.ua || "غير معروف"],
    ]);
  }
  return {
    token,
    user: {
      id: user.id, name: user.name, role: user.role_id, email, totp_enabled: !!user.totp_enabled,
      is_owner: !!user.is_owner, passkey_only: !!user.passkey_only,
    },
  };
}

const METHOD_LABELS: Record<string, string> = { passkey: "مفتاح المرور", totp: "تطبيق المصادقة", email: "رمز البريد" };

// تنبيه أمني بالبريد: إضافة مفتاح أو حذفه، تغيير وضع الدخول، دخول المالك.
async function securityMail(to: string, title: string, rows: [string, string][]) {
  const when = new Date().toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" });
  const html = mailShell(title, `
${mailRows(rows.concat([["الوقت", when]]).map(([k, v]) => [k, v, /^[\x00-\x7F]*$/.test(v)] as [string, string, boolean]))}
${mailNote("إن لم تكن أنت، ادخل فورًا وأنهِ الجلسات الأخرى واحذف أي مفتاح لا تعرفه.")}`, { ...ADMIN_MAIL, footnote: "" });
  if (!(await sendEmail(to, `تنبيه أمني: ${plain(title)} — ${APP}`, html))) console.error("admin-api securityMail failed");
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
    scope: "admin", purpose, subject, challenge, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
  if (error) throw error;
}
// يستهلك التحدي مرة واحدة فقط.
async function takeChallenge(sb: SB, challenge: string, purpose: string) {
  if (!challenge) return null;
  const { data } = await sb.from("webauthn_challenges").update({ consumed_at: new Date().toISOString() })
    .eq("challenge", challenge).eq("scope", "admin").eq("purpose", purpose).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString()).select("*");
  return data?.[0] || null;
}
// سقف لتحديات الدخول المجهولة كي لا يُغرَق الجدول.
async function challengeFlood(sb: SB): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  const { count } = await sb.from("webauthn_challenges").select("*", { count: "exact", head: true })
    .eq("scope", "admin").gte("created_at", since);
  return (count ?? 0) >= 60;
}

// whitelists: what admin sessions may write
const PROCESS_FIELDS = ["insight", "why_it_matters", "description", "outputs", "duration", "feeds", "fed_by"];
const REG_ADMIN_FIELDS = ["submitted", "submittedAt", "reopenRequested"];
const CONTACT_FIELDS = ["status", "context"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const action = body.action as string;
    const sb = createClient(SB_URL, SB_KEY);

    // ══ login-send: same reply whether or not the email is an admin ══
    if (action === "login-send") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!isEmail(email)) return json({ success: false, message: "البريد غير صحيح" }, 400);
      const since = new Date(Date.now() - OTP_COOLDOWN_MS).toISOString();
      const { data: recent } = await sb.from("email_otps").select("id").eq("email", email).gte("created_at", since).limit(1);
      if (recent?.length) return json({ success: false, message: "يرجى الانتظار دقيقة قبل إعادة الإرسال" }, 429);

      // من فعّل TOTP لا يدخل برمز البريد، فلا نرسله له أصلًا.
      // ومن جعل دخوله بمفتاح المرور وحده لا يُرسل له رمز كذلك.
      const { data: admins } = await sb.from("admin_users").select("id, is_active, totp_enabled, passkey_only").ilike("email", email).limit(1);
      if (admins?.length && admins[0].is_active && !admins[0].totp_enabled && !admins[0].passkey_only) {
        const code = randomCode();
        const exp = new Date(Date.now() + OTP_TTL_MS).toISOString();
        const { error } = await sb.from("email_otps")
          .insert({ email, otp_code: await otpHash(email, code), verified: false, expires_at: exp });
        if (error) throw error;
        await sendEmail(email, `رمز الدخول: ${code} — ${APP}`, otpHtml(code));
      }
      return json({ success: true, message: SENT_MSG });
    }

    // ══ login-verify: TOTP only when enabled, otherwise email OTP ══
    if (action === "login-verify") {
      const email = String(body.email || "").trim().toLowerCase();
      const code = String(body.code || "");
      if (!email || !/^\d{6}$/.test(code)) return json({ success: false, message: "الرمز يجب أن يكون 6 أرقام" }, 400);
      if (await tooManyFails(sb, email)) return json({ success: false, message: "تجاوزت عدد المحاولات، انتظر 15 دقيقة" }, 429);

      const { data: admins } = await sb.from("admin_users")
        .select("id, name, role_id, is_active, totp_secret, totp_enabled, is_owner, passkey_only").ilike("email", email).limit(1);
      const user = admins?.[0];

      let verified = false;
      let method: "totp" | "email" = "email";
      if (user?.is_active && !user.passkey_only) {
        if (user.totp_enabled && user.totp_secret) {
          method = "totp";
          // TOTP عامل ثانٍ حقيقي: من فعّله لا يدخل برمز البريد.
          verified = await verifyTotp(user.totp_secret as string, code);
        } else {
          const now = new Date().toISOString();
          const { data: otps } = await sb.from("email_otps").select("id")
            .eq("email", email).eq("otp_code", await otpHash(email, code)).eq("verified", false).gte("expires_at", now)
            .order("created_at", { ascending: false }).limit(1);
          if (otps?.length) {
            verified = true;
            await sb.from("email_otps").update({ verified: true }).eq("id", otps[0].id);
          }
        }
      }
      await sb.from("totp_attempts").insert({ email, success: verified });
      if (!verified || !user) return json({ success: false, message: BAD_CODE_MSG });
      return json({ success: true, ...(await issueSession(sb, user, email, method, clientCtx(req))) });
    }

    // ══ passkey-login: بلا بريد، المتصفح يعرض مفاتيح sunkvalue.com المحفوظة ══
    if (action === "passkey-login-options") {
      if (await challengeFlood(sb)) return json({ success: false, message: "محاولات كثيرة، انتظر دقيقة" }, 429);
      const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "required" });
      await saveChallenge(sb, options.challenge, "authenticate", null);
      return json({ success: true, options });
    }

    if (action === "passkey-login-verify") {
      const ch = await takeChallenge(sb, challengeOf(body.response), "authenticate");
      if (!ch) return json({ success: false, message: "انتهت مهلة العملية، حاول مرة أخرى" }, 400);
      const credId = String(body.response?.id || "");
      const { data: pks } = await sb.from("admin_passkeys").select("*").eq("credential_id", credId).limit(1);
      const pk = pks?.[0];
      if (!pk) return json({ success: false, code: "unknown_passkey", message: "هذا المفتاح غير مسجّل لحساب إدارة، ادخل بالبريد ثم أضفه من الإعدادات" }, 404);
      let v;
      try {
        v = await verifyAuthenticationResponse({
          response: body.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID,
          requireUserVerification: true,
          credential: { id: pk.credential_id, publicKey: fromBytea(pk.public_key), counter: Number(pk.sign_count), transports: pk.transports || undefined },
        });
      } catch (e) {
        console.error("admin-api passkey verify:", e);
        return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      }
      if (!v.verified) return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      await sb.from("admin_passkeys").update({ sign_count: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", pk.id);
      const { data: us } = await sb.from("admin_users")
        .select("id, name, email, role_id, is_active, totp_enabled, is_owner, passkey_only").eq("id", pk.admin_id).limit(1);
      const user = us?.[0];
      if (!user?.is_active) return json({ success: false, message: "الحساب غير نشط" }, 403);
      const email = String(user.email || "").toLowerCase();
      return json({ success: true, ...(await issueSession(sb, user, email, "passkey", clientCtx(req))) });
    }

    // ══ everything below requires a valid admin session ══
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const tok = String(body.token || bearer || "");
    const session = await getAdminSession(sb, tok);
    if (!session) return json({ success: false, message: "انتهت الجلسة، سجّل دخولك مجددًا" }, 401);
    const role = session.role;
    const adminEmail = session.email;

    const audit = async (act: string, meta: Record<string, unknown> = {}) => {
      try { await sb.from("admin_audit_log").insert({ user_id: session.userId, user_email: adminEmail, action: act, meta }); } catch { /* best-effort */ }
    };

    if (WRITE_ACTIONS.includes(action) && role !== "admin" && role !== "super_admin") {
      return json({ success: false, message: "صلاحية المراقب للقراءة فقط" }, 403);
    }

    // ══ TOTP self-management — always operates on the session's OWN user ══
    // تغيير TOTP المفعّل أو تعطيله يتطلب رمزه الحالي، فلا تكفي جلسة مسروقة لإزالته.
    if (action === "setup-totp" || action === "reset-totp" || action === "disable-totp") {
      const { data: us } = await sb.from("admin_users").select("totp_enabled, totp_secret").eq("id", session.userId).limit(1);
      const enabled = !!us?.[0]?.totp_enabled;
      if (action === "setup-totp" && enabled) return json({ success: false, message: "TOTP مفعّل بالفعل" });
      if (enabled && action !== "setup-totp") {
        if (await tooManyFails(sb, adminEmail)) return json({ success: false, message: "تجاوزت عدد المحاولات، انتظر 15 دقيقة" }, 429);
        const ok = await verifyTotp(String(us?.[0]?.totp_secret || ""), String(body.code || ""));
        await sb.from("totp_attempts").insert({ email: adminEmail, success: ok });
        if (!ok) return json({ success: false, message: "أدخل الرمز الحالي من تطبيق المصادقة" }, 403);
      }
      if (action === "disable-totp") {
        await sb.from("admin_users").update({ totp_secret: null, totp_enabled: false }).eq("id", session.userId);
        await audit("disable-totp");
        return json({ success: true, message: "تم تعطيل TOTP" });
      }
      const secret = genSecret();
      await sb.from("admin_users").update({ totp_secret: secret, totp_enabled: false }).eq("id", session.userId);
      await audit(action);
      return json({ success: true, secret, uri: totpUri(secret, adminEmail) });
    }
    if (action === "confirm-totp") {
      const code = String(body.code || "");
      if (await tooManyFails(sb, adminEmail)) return json({ success: false, message: "تجاوزت عدد المحاولات، انتظر 15 دقيقة" }, 429);
      const { data: us } = await sb.from("admin_users").select("totp_secret").eq("id", session.userId).limit(1);
      const secret = us?.[0]?.totp_secret as string | undefined;
      if (!secret) return json({ success: false, message: "ابدأ الإعداد أولاً" });
      const ok = await verifyTotp(secret, code);
      await sb.from("totp_attempts").insert({ email: adminEmail, success: ok });
      if (!ok) return json({ success: false, message: "الرمز غير صحيح، تأكد من الوقت وأعد المحاولة" });
      await sb.from("admin_users").update({ totp_enabled: true }).eq("id", session.userId);
      await audit("confirm-totp");
      return json({ success: true, message: "تم تفعيل TOTP" });
    }

    // ══ مفاتيح المرور وأمان الحساب — دائمًا على حساب الجلسة نفسها ══
    const fresh = Date.now() - session.authAt < FRESH_MS;
    const STALE = { success: false, code: "reauth", message: "لحمايتك، سجّل خروجك وادخل مجددًا ثم أعد المحاولة خلال 10 دقائق" };
    const NEED_PASSKEY = { success: false, code: "reauth_passkey", message: "هذه العملية تتطلب دخولًا بمفتاح مرور مسجّل، سجّل خروجك وادخل به" };
    const myPasskeys = async () => {
      const { data } = await sb.from("admin_passkeys")
        .select("id, credential_id, transports, device_label, backed_up, created_at, last_used_at")
        .eq("admin_id", session.userId).order("created_at", { ascending: true });
      return data || [];
    };

    if (action === "security-status") {
      const pks = await myPasskeys();
      return json({
        success: true, is_owner: session.isOwner, passkey_only: session.passkeyOnly, method: session.method,
        passkeys: pks.map(({ credential_id: _c, ...p }) => p),
      });
    }

    if (action === "passkey-register-options" || action === "passkey-register-verify") {
      if (!fresh) return json(STALE, 403);
      const existing = await myPasskeys();
      // من لديه مفتاح يضيف غيره بجلسة مفتاح فقط، فلا يكفي رمز بريد مسروق لزرع مفتاح.
      if (existing.length && session.method !== "passkey") return json(NEED_PASSKEY, 403);
      if (existing.length >= 10) return json({ success: false, message: "الحد الأقصى 10 مفاتيح" }, 400);

      if (action === "passkey-register-options") {
        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: RP_ID,
          userName: `${adminEmail} (إدارة)`,
          userDisplayName: `${session.name || adminEmail} (إدارة)`,
          userID: new TextEncoder().encode(`admin:${session.userId}`),
          attestationType: "none",
          excludeCredentials: existing.map((c) => ({ id: c.credential_id as string, transports: (c.transports as never) || undefined })),
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
        });
        await saveChallenge(sb, options.challenge, "register", String(session.userId));
        return json({ success: true, options });
      }

      const ch = await takeChallenge(sb, challengeOf(body.response), "register");
      if (!ch || ch.subject !== String(session.userId)) return json({ success: false, message: "انتهت مهلة العملية، حاول مرة أخرى" }, 400);
      let v;
      try {
        v = await verifyRegistrationResponse({
          response: body.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID,
          requireUserVerification: true,
        });
      } catch (e) {
        console.error("admin-api passkey register:", e);
        return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      }
      if (!v.verified || !v.registrationInfo) return json({ success: false, message: "تعذّر التحقق من مفتاح المرور" }, 400);
      const info = v.registrationInfo;
      const label = String(body.label || "").trim().slice(0, 80) || null;
      const { error } = await sb.from("admin_passkeys").insert({
        admin_id: session.userId,
        credential_id: info.credential.id,
        public_key: toBytea(info.credential.publicKey),
        sign_count: info.credential.counter,
        transports: info.credential.transports || body.response?.response?.transports || null,
        aaguid: info.aaguid,
        backed_up: info.credentialBackedUp,
        device_label: label,
      });
      if (error) throw error;
      await audit("passkey-register", { label });
      const ctx = clientCtx(req);
      await securityMail(adminEmail, "أُضيف مفتاح مرور إلى حسابك", [
        ["الجهاز", label || "بلا اسم"], ["عنوان IP", ctx.ip || "غير معروف"], ["المتصفح", ctx.ua || "غير معروف"],
      ]);
      return json({ success: true, message: "تم حفظ مفتاح المرور" });
    }

    if (action === "passkey-delete") {
      if (!fresh) return json(STALE, 403);
      if (session.method !== "passkey") return json(NEED_PASSKEY, 403);
      const id = String(body.id || "");
      const pks = await myPasskeys();
      const target = pks.find((p) => p.id === id);
      if (!target) return json({ success: false, message: "المفتاح غير موجود" }, 404);
      if (session.passkeyOnly && pks.length <= 2) {
        return json({ success: false, message: "الدخول بالمفتاح وحده يتطلب مفتاحين على الأقل، أضف مفتاحًا آخر أو عطّل الوضع أولًا" });
      }
      await sb.from("admin_passkeys").delete().eq("id", id).eq("admin_id", session.userId);
      await audit("passkey-delete", { label: target.device_label });
      await securityMail(adminEmail, "حُذف مفتاح مرور من حسابك", [["الجهاز", String(target.device_label || "بلا اسم")]]);
      return json({ success: true, message: "تم حذف المفتاح" });
    }

    // الدخول بمفتاح المرور وحده: يُغلق باب رموز البريد وتطبيق المصادقة.
    if (action === "passkey-only") {
      if (!fresh) return json(STALE, 403);
      if (session.method !== "passkey") return json(NEED_PASSKEY, 403);
      const enable = body.enable === true;
      if (enable) {
        const pks = await myPasskeys();
        if (pks.length < 2) {
          return json({ success: false, message: "سجّل مفتاحين على الأقل (جهازان، أو مفتاح متزامن ومفتاح احتياطي) قبل التفعيل كي لا تفقد الوصول" });
        }
      }
      await sb.from("admin_users").update({ passkey_only: enable }).eq("id", session.userId);
      // الجلسات المفتوحة برمز تسقط تلقائيًا في getAdminSession، ونحذفها صراحة أيضًا.
      if (enable) {
        const { data: rows } = await sb.from("api_sessions").select("token_hash, meta").eq("kind", "admin").eq("subject", String(session.userId));
        const drop = (rows || []).filter((r) => (r.meta as Record<string, unknown>)?.method !== "passkey").map((r) => r.token_hash);
        if (drop.length) await sb.from("api_sessions").delete().in("token_hash", drop);
      }
      await audit("passkey-only", { enable });
      await securityMail(adminEmail, enable ? "فُعّل الدخول بمفتاح المرور وحده" : "عُطّل الدخول بمفتاح المرور وحده", [
        ["الحالة", enable ? "رموز البريد وتطبيق المصادقة لا تُقبل" : "رموز البريد وتطبيق المصادقة مقبولة"],
      ]);
      return json({ success: true, passkey_only: enable });
    }

    if (action === "sessions-list") {
      const curHash = await sha256hex(tok);
      const { data } = await sb.from("api_sessions").select("token_hash, meta, expires_at")
        .eq("kind", "admin").eq("subject", String(session.userId)).gt("expires_at", new Date().toISOString());
      return json({
        success: true,
        sessions: (data || []).map((r) => {
          const m = (r.meta || {}) as Record<string, unknown>;
          return {
            current: r.token_hash === curHash, method: m.method || null, ip: m.ip || null, ua: m.ua || null,
            auth_at: m.auth_at || null, expires_at: r.expires_at,
          };
        }),
      });
    }

    if (action === "sessions-revoke-others") {
      const { error } = await sb.from("api_sessions").delete().eq("kind", "admin")
        .eq("subject", String(session.userId)).neq("token_hash", await sha256hex(tok));
      if (error) throw error;
      await audit("sessions-revoke-others");
      return json({ success: true, message: "أُنهيت كل الجلسات الأخرى" });
    }

    if (action === "list-regs") {
      const { data } = await sb.from("registrations").select("*").order("registeredAt", { ascending: false });
      return json({ success: true, registrations: data || [] });
    }

    if (action === "unlock-reg") {
      const id = String(body.id || "");
      if (!id) return json({ success: false, message: "معرّف مفقود" }, 400);
      const { error } = await sb.from("registrations")
        .update({ submitted: false, reopenRequested: false, submittedAt: null }).eq("id", id);
      if (error) throw error;
      await audit("unlock-reg", { id });
      return json({ success: true });
    }

    if (action === "update-reg") {
      const id = String(body.id || "");
      const fields = body.fields || {};
      const updates: Record<string, unknown> = {};
      for (const k of REG_ADMIN_FIELDS) if (k in fields) updates[k] = fields[k];
      if (!id || !Object.keys(updates).length) return json({ success: false, message: "بيانات ناقصة" }, 400);
      const { error } = await sb.from("registrations").update(updates).eq("id", id);
      if (error) throw error;
      await audit("update-reg", { id, updates });
      return json({ success: true });
    }

    if (action === "save-process") {
      const key = String(body.process_key || "");
      const updates: Record<string, unknown> = {};
      for (const k of PROCESS_FIELDS) if (k in (body.updates || {})) updates[k] = body.updates[k];
      if (!key || !Object.keys(updates).length) return json({ success: false, message: "بيانات ناقصة" }, 400);
      const { error } = await sb.from("process_details").update(updates).eq("process_key", key);
      if (error) throw error;
      await audit("save-process", { key });
      return json({ success: true });
    }

    if (action === "save-content") {
      const key = String(body.key || "");
      if (!key || !("value" in body)) return json({ success: false, message: "بيانات ناقصة" }, 400);
      const { error } = await sb.from("app_content")
        .update({ value: body.value, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) throw error;
      await audit("save-content", { key });
      return json({ success: true });
    }

    if (action === "list-contacts") {
      const { data } = await sb.from("contact_requests").select("*").order("created_at", { ascending: false }).limit(500);
      return json({ success: true, contacts: data || [] });
    }

    if (action === "update-contact") {
      const id = String(body.id || "");
      const fields = body.fields || {};
      const updates: Record<string, unknown> = {};
      for (const k of CONTACT_FIELDS) if (k in fields) updates[k] = fields[k];
      if (!id || !Object.keys(updates).length) return json({ success: false, message: "بيانات ناقصة" }, 400);
      if ("status" in updates && !CONTACT_STATUSES.includes(String(updates.status))) {
        return json({ success: false, message: "حالة غير معروفة" }, 400);
      }
      const { error } = await sb.from("contact_requests").update(updates).eq("id", id);
      if (error) throw error;
      await audit("update-contact", { id, updates });
      return json({ success: true });
    }

    // ══ user management: super_admin only ══
    if (action === "list-users" || action === "add-user" || action === "update-user") {
      if (role !== "super_admin") return json({ success: false, message: "غير مصرح" }, 403);
      // إن وُجد مالك فهو وحده من يمنح صلاحية المدير العام أو يعدّل مديرًا عامًا آخر.
      const mayGrantSuper = async () => {
        if (session.isOwner) return true;
        const { count } = await sb.from("admin_users").select("*", { count: "exact", head: true }).eq("is_owner", true);
        return (count ?? 0) === 0;
      };
      if (action === "list-users") {
        const { data } = await sb.from("admin_users")
          .select("id, name, email, role_id, is_active, totp_enabled, is_owner, passkey_only, created_at")
          .order("created_at", { ascending: true });
        return json({ success: true, users: data || [] });
      }
      if (action === "add-user") {
        const newName = String(body.newName || "").trim();
        const newEmail = String(body.newEmail || "").trim().toLowerCase();
        const newRole = String(body.newRole || "");
        if (!newName || newName.length > 120 || !isEmail(newEmail) || !ROLES.includes(newRole)) {
          return json({ success: false, message: "بيانات غير مكتملة" }, 400);
        }
        if (newRole === "super_admin" && !(await mayGrantSuper())) {
          return json({ success: false, message: "منح صلاحية المدير العام للمالك وحده" }, 403);
        }
        // admin_users.id مفتاح أجنبي إلى auth.users: نأخذ معرّف حساب Auth بالبريد أو ننشئه.
        const authId = await authUserId(sb, newEmail);
        if (!authId) return json({ success: false, message: "تعذّر إنشاء حساب الدخول لهذا البريد" }, 500);
        const { error } = await sb.from("admin_users")
          .insert({ id: authId, name: newName, email: newEmail, role_id: newRole, is_active: true });
        if (error) {
          console.error("admin-api add-user:", error);
          return json({ success: false, message: "تعذّرت الإضافة، ربما البريد مسجّل مسبقًا" }, 400);
        }
        await audit("add-user", { newEmail, newRole });
        return json({ success: true, message: "تم إضافة المستخدم" });
      }
      // update-user
      const targetId = String(body.targetId || "");
      const field = String(body.field || "");
      const value = body.value;
      if (!["role_id", "is_active"].includes(field)) return json({ success: false, message: "حقل غير مسموح" }, 400);
      if (field === "role_id" && !ROLES.includes(String(value))) return json({ success: false, message: "دور غير معروف" }, 400);
      if (field === "is_active" && typeof value !== "boolean") return json({ success: false, message: "قيمة غير صحيحة" }, 400);
      if (targetId === String(session.userId)) {
        return json({ success: false, message: "لا يمكن تغيير دورك أو تعطيل حسابك بنفسك" });
      }
      // لا يُترك النظام بلا مدير عام نشط.
      const { data: target } = await sb.from("admin_users").select("role_id, is_active, is_owner").eq("id", targetId).limit(1);
      if (!target?.length) return json({ success: false, message: "المستخدم غير موجود" }, 404);
      // القاعدة تمنع هذا أيضًا (admin_owner_guard)؛ الفحص هنا لرسالة واضحة.
      if (target[0].is_owner) return json({ success: false, message: "حساب المالك محمي ولا يُعدَّل من اللوحة" }, 403);
      if ((target[0].role_id === "super_admin" || (field === "role_id" && value === "super_admin")) && !(await mayGrantSuper())) {
        return json({ success: false, message: "تعديل المدراء العامين للمالك وحده" }, 403);
      }
      const demotes = target[0].role_id === "super_admin" && target[0].is_active &&
        ((field === "role_id" && value !== "super_admin") || (field === "is_active" && value === false));
      if (demotes) {
        const { count } = await sb.from("admin_users").select("*", { count: "exact", head: true })
          .eq("role_id", "super_admin").eq("is_active", true);
        if ((count ?? 0) <= 1) return json({ success: false, message: "يجب أن يبقى مدير عام نشط واحد على الأقل" });
      }
      const { error } = await sb.from("admin_users").update({ [field]: value }).eq("id", targetId);
      if (error) throw error;
      // الدور القديم محفوظ في meta الجلسات المفتوحة؛ إنهاؤها يفرض الدخول بالصلاحية الجديدة.
      await revokeSessions(sb, targetId);
      await audit("update-user", { targetId, field, value });
      return json({ success: true });
    }

    if (action === "logout") {
      await sb.from("api_sessions").delete().eq("token_hash", await sha256hex(tok));
      return json({ success: true });
    }

    return json({ success: false, message: "action غير معروف" }, 400);
  } catch (err) {
    console.error("admin-api:", err);
    return json({ success: false, message: "خطأ داخلي" }, 500);
  }
});
