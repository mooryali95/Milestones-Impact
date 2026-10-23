// ════════════════════════════════════════════════════════════════
// الاتصال بدالة admin-api والجلسة
// ════════════════════════════════════════════════════════════════
// المفتاح العام يرضي بوابة Supabase فقط؛ ما يصرّح فعلًا بكل إجراء هو
// توكن جلسة المدير داخل الجسم، ويُتحقق منه على الخادم.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/api.js';

const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;
export const ROLE_LABELS = { super_admin: 'مدير عام', admin: 'مدير نظام', viewer: 'مراقب' };

// نفس مفتاح اللوحة القديمة ومدتها، فالدخول في إحداهما يفتح الأخرى
const KEY = 'mi_admin_v3';
const TTL = 8 * 60 * 60 * 1000;
export const session = {
  load() {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!d?.token || !d.user?.email) return null;
      if (Date.now() - d.ts > TTL) { this.clear(); return null; }
      return d;
    } catch { return null; }
  },
  save(token, user) { try { sessionStorage.setItem(KEY, JSON.stringify({ token, user, ts: Date.now() })); } catch { /* وضع خاص */ } },
  // تحديث بيانات المستخدم دون تمديد عمر الجلسة
  patchUser(patch) {
    const d = this.load();
    if (!d) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ ...d, user: { ...d.user, ...patch } })); } catch { /* */ }
  },
  clear() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* */ } },
};

let onExpired = () => {};
export const setExpiredHandler = (fn) => { onExpired = fn; };

export async function call(action, body = {}) {
  const token = session.load()?.token;
  let res;
  try {
    const r = await fetch(ADMIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ action, ...(token ? { token } : {}), ...body }),
    });
    res = await r.json();
  } catch {
    res = { success: false, message: 'خطأ في الاتصال بالخادم' };
  }
  if (!res.success && token && res.message?.includes('الجلسة')) { session.clear(); onExpired(); }
  return res;
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
