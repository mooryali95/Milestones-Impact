// ════════════════════════════════════════════════════════════════
// الاتصال بدالة leaders-api
// ════════════════════════════════════════════════════════════════
// نفس منهجية تطبيق المصفوفة: المفتاح العام في الترويسة لبوابة Supabase،
// وتوكن الجلسة داخل الجسم يُتحقق منه على الخادم.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/api.js';

const TOKEN_KEY = 'mi_leaders_session';

export const session = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* وضع خاص */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* وضع خاص */ } },
};

// يُستدعى عند انتهاء الجلسة ليعود التطبيق لشاشة الدخول
let onExpired = () => {};
export const setExpiredHandler = (fn) => { onExpired = fn; };

export async function call(action, body = {}) {
  let res;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/leaders-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ action, token: session.get(), ...body }),
    });
    res = await r.json();
  } catch {
    res = { success: false, message: 'تعذّر الاتصال، تحقّق من الشبكة وحاول مرة أخرى', code: 'network' };
  }
  if (!res.success && res.code === 'session') { session.clear(); onExpired(); }
  return res;
}

// رفع ملف إلى المخزن الخاص برابط موقّع تصدره الدالة
export async function uploadFile(file, purpose) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.size > 10 * 1024 * 1024) return { success: false, message: 'حجم الملف أكبر من 10 ميجابايت' };
  const u = await call('upload.url', { purpose, ext });
  if (!u.success) return u;
  try {
    const r = await fetch(u.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: file,
    });
    if (!r.ok) return { success: false, message: 'تعذّر رفع الملف، حاول مرة أخرى' };
  } catch {
    return { success: false, message: 'تعذّر رفع الملف، تحقّق من الشبكة' };
  }
  return { success: true, path: u.path };
}
