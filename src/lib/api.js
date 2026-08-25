// ════════════════════════════════════════════════════════════════
// DATABASE ACCESS — via server-side Edge Functions
// ════════════════════════════════════════════════════════════════
// All privileged reads/writes go through the user-api / admin-api Edge
// Functions, which authenticate a per-session token server-side. The anon
// key below is public by design and only unlocks: (a) public SELECT on
// process_details / app_content, and (b) invoking the Edge Functions —
// it grants no access to registrations, OTP codes, or admin data.

export const SUPABASE_URL = 'https://eormhcupwgwpllhrfxxg.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0';

// Invoke an Edge Function. The anon key stays in the Authorization header
// (required by the Supabase gateway); the per-session token — when present —
// is carried inside the JSON body and verified server-side.
export async function callFn(fn, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) { return { success: false, message: 'خطأ في الاتصال بالخادم' }; }
}

// Public read of the two openly-readable content tables (SELECT-only via RLS).
// يعيد مصفوفة عند النجاح — وقد تكون فارغة لأن الجدول فارغ فعلاً —
// و null عند الفشل. التمييز مقصود: بدونه لا تستطيع الواجهة أن تفرّق
// بين "لا توجد بيانات" و"تعذّر الوصول"، فتعرض فراغاً صامتاً في الحالتين.
export async function publicRead(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (e) { return null; }
}

// ── User data API (token-scoped: a user only ever sees/writes their own row) ──
export const UserAPI = {
  registerSend: (name, phone, email) => callFn('user-api', { action: 'register-send', name, phone, email }),
  resumeSend: (phone) => callFn('user-api', { action: 'resume-send', phone }),
  verify: (payload) => callFn('user-api', { action: 'verify', ...payload }),
  get: (token) => callFn('user-api', { action: 'get', token }),
  save: (token, fields) => callFn('user-api', { action: 'save', token, fields }),
};

// ── Admin data API (token-scoped: every action re-checks the admin session) ──
export const AdminAPI = {
  loginSend: (email) => callFn('admin-api', { action: 'login-send', email }),
  loginVerify: (email, code) => callFn('admin-api', { action: 'login-verify', email, code }),
  call: (token, action, extra = {}) => callFn('admin-api', { action, token, ...extra }),
};
