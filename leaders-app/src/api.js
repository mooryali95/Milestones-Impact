// ════════════════════════════════════════════════════════════════
// الاتصال بدالة leaders-api
// ════════════════════════════════════════════════════════════════
// نفس منهجية تطبيق المصفوفة: المفتاح العام في الترويسة لبوابة Supabase،
// وتوكن الجلسة داخل الجسم يُتحقق منه على الخادم.
import { BUSY_STATUS, fetchRetry, SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/api.js';

const TOKEN_KEY = 'mi_leaders_session';

export const session = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* وضع خاص */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* وضع خاص */ } },
};

// تفضيلات محلية صغيرة: آخر باب قُرئ، وإخفاء بطاقة الترحيب. ضياعها لا يضر.
const local = (key) => ({
  get() { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* وضع خاص */ } },
});
export const lastRead = local('mi_leaders_last_read');
export const welcomeSeen = local('mi_leaders_welcome_seen');

// يُستدعى عند انتهاء الجلسة ليعود التطبيق لشاشة الدخول
let onExpired = () => {};
export const setExpiredHandler = (fn) => { onExpired = fn; };

// 502/503/504 من بوابة Supabase أثناء إقلاع الدالة بلا جسم مفيد؛ أما ما ترسله الدالة نفسها
// بهذه الرموز (القياس غير مفعّل، الدفع مطفأ…) فجسمه JSON برسالته ولا يُستبدل بـ«الخادم مشغول»
const BUSY = { success: false, message: 'الخادم مشغول لحظيًا، حاول بعد ثوانٍ', code: 'busy' };
export async function parse(r) {
  const body = await r.json().catch(() => null);
  if (body && typeof body === 'object') return 'success' in body || !BUSY_STATUS.includes(r.status) ? body : BUSY;
  if (BUSY_STATUS.includes(r.status)) return BUSY;
  throw new Error(`bad response ${r.status}`);
}

export async function call(action, body = {}) {
  let res;
  try {
    const r = await fetchRetry(`${SUPABASE_URL}/functions/v1/leaders-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ action, token: session.get(), ...body }),
    });
    res = await parse(r);
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

// ── منسق الجهة: جلسة مستقلة عن المشارك تمامًا ──
const COORD_KEY = 'mi_leaders_coord_session';
export const coordSession = {
  get() { try { return localStorage.getItem(COORD_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(COORD_KEY, t); } catch { /* وضع خاص */ } },
  clear() { try { localStorage.removeItem(COORD_KEY); } catch { /* وضع خاص */ } },
};
let onCoordExpired = () => {};
export const setCoordExpired = (fn) => { onCoordExpired = fn; };

export async function coordCall(action, body = {}) {
  let res;
  try {
    const r = await fetchRetry(`${SUPABASE_URL}/functions/v1/leaders-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ action, token: coordSession.get(), ...body }),
    });
    res = await parse(r);
  } catch {
    res = { success: false, message: 'تعذّر الاتصال، تحقّق من الشبكة وحاول مرة أخرى', code: 'network' };
  }
  if (!res.success && (res.code === 'session' || res.code === 'suspended')) { coordSession.clear(); onCoordExpired(res.message); }
  return res;
}

// ── لوحة الخبير: جلسة مستقلة (expert_sessions) بالنمط نفسه ──
const XP_KEY = 'mi_leaders_expert_session';
export const xpSession = {
  get() { try { return localStorage.getItem(XP_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(XP_KEY, t); } catch { /* وضع خاص */ } },
  clear() { try { localStorage.removeItem(XP_KEY); } catch { /* وضع خاص */ } },
};
export async function xpCall(action, body = {}) {
  let res;
  try {
    const r = await fetchRetry(`${SUPABASE_URL}/functions/v1/leaders-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ action, token: xpSession.get(), ...body }),
    });
    res = await parse(r);
  } catch {
    res = { success: false, message: 'تعذّر الاتصال، تحقّق من الشبكة وحاول مرة أخرى', code: 'network' };
  }
  if (!res.success && (res.code === 'session' || res.code === 'suspended')) xpSession.clear();
  return res;
}
