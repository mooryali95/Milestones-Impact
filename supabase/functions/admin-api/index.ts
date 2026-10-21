import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// admin-api: دخول لوحة الإدارة وكل عملياتها.
// النشر: supabase functions deploy admin-api
//
// عقد مع leaders-api (لا تغيّره دون تنسيق): جدول api_sessions،
// token_hash = sha256 hex للتوكن بلا ملح، kind = 'admin'، expires_at،
// meta.email وmeta.role ('super_admin' | 'admin' | 'viewer').

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Milestone Impact <milestoneimpact@basserh.com>";
const APP = "Milestone Impact Admin";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4h admin sessions
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

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

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
}
function otpHtml(code: string) {
  return `<div dir="rtl" style="font-family:Tahoma,sans-serif;max-width:480px;margin:0 auto;background:#f5f3ef;padding:24px;border-radius:14px">
    <div style="background:#061E2C;border-radius:10px;padding:20px 24px;text-align:center;margin-bottom:20px">
      <span style="color:#C8A45C;font-size:1rem;font-weight:700">${APP}</span>
    </div>
    <p style="color:#1F3340;font-size:.95rem;margin:0 0 18px">رمز الدخول المؤقت:</p>
    <div style="background:#fff;border-radius:10px;padding:20px;text-align:center;border:1px solid #e8e4df;margin-bottom:16px">
      <span style="font-size:2.4rem;font-weight:700;color:#14495E;letter-spacing:14px;font-family:monospace;direction:ltr">${code}</span>
    </div>
    <p style="color:#8B9AAB;font-size:.78rem;text-align:center">صالح لمدة 10 دقائق فقط</p>
  </div>`;
}

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
  const { data: us } = await sb.from("admin_users").select("role_id, is_active, email").eq("id", userId).limit(1);
  if (!us?.length || !us[0].is_active) return null;
  return {
    userId,
    role: String(us[0].role_id || ""),
    email: String(us[0].email || (data[0].meta as Record<string, unknown>)?.email || ""),
  };
}

async function revokeSessions(sb: SB, userId: string) {
  await sb.from("api_sessions").delete().eq("kind", "admin").eq("subject", String(userId));
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
      const { data: admins } = await sb.from("admin_users").select("id, is_active, totp_enabled").ilike("email", email).limit(1);
      if (admins?.length && admins[0].is_active && !admins[0].totp_enabled) {
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
        .select("id, name, role_id, is_active, totp_secret, totp_enabled").ilike("email", email).limit(1);
      const user = admins?.[0];

      let verified = false;
      if (user?.is_active) {
        if (user.totp_enabled && user.totp_secret) {
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

      const token = randomToken();
      const { error } = await sb.from("api_sessions").insert({
        token_hash: await sha256hex(token), kind: "admin", subject: String(user.id),
        meta: { role: user.role_id, name: user.name, email },
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      });
      if (error) throw error;
      await sb.from("admin_users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
      try { await sb.from("admin_audit_log").insert({ user_id: user.id, user_email: email, action: "login", meta: { role: user.role_id } }); } catch { /* audit best-effort */ }
      return json({ success: true, token, user: { id: user.id, name: user.name, role: user.role_id, email, totp_enabled: !!user.totp_enabled } });
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
      if (action === "list-users") {
        const { data } = await sb.from("admin_users")
          .select("id, name, email, role_id, is_active, totp_enabled, created_at")
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
        const { error } = await sb.from("admin_users")
          .insert({ name: newName, email: newEmail, role_id: newRole, is_active: true });
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
      const { data: target } = await sb.from("admin_users").select("role_id, is_active").eq("id", targetId).limit(1);
      if (!target?.length) return json({ success: false, message: "المستخدم غير موجود" }, 404);
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
