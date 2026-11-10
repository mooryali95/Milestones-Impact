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
// معالج البداية: بطاقة «ما بعد ذلك» بعد القياس، وبطاقات أول فتح للكتيب والقاعة والمبادرة (راحة عرض لا حالة رحلة)
export const nextSeen = local('mi_leaders_next_seen');
export const firstOpenSeen = (key) => local(`mi_leaders_first_${key}`);

// يُستدعى عند انتهاء الجلسة ليعود التطبيق لشاشة الدخول
let onExpired = () => {};
export const setExpiredHandler = (fn) => { onExpired = fn; };

// 502/503/504 من بوابة Supabase أثناء إقلاع الدالة بلا جسم مفيد؛ أما ما ترسله الدالة نفسها
// بهذه الرموز (القياس غير مفعّل، الدفع مطفأ…) فجسمه JSON برسالته ولا يُستبدل بـ«الخادم مشغول»
const BUSY = { success: false, message: 'الخادم مشغول لحظيًا، حاول بعد ثوانٍ', code: 'busy' };
export async function parse(r) {
  const body = await r.json().catch(() => null);
  // الدالة ترد دائمًا بحقل success. رد 5xx بلا هذا الحقل ليس منها بل من البوابة أو وقت التشغيل (500 عابر تحت الحمل،
  // كما كشفه اختبار حمل القاعة): يُعامل «الخادم مشغول» برسالته العربية ورمزه، لا برسالة البوابة الإنجليزية بلا رمز
  if (body && typeof body === 'object') return 'success' in body || r.status < 500 ? body : BUSY;
  if (r.status >= 500) return BUSY;
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

// ما يأتي مجمّعًا مع الحساب عند فتح المنصة (me مع with_home، البند 7.5): كل جزء يُؤخذ مرة واحدة ثم يُحذف،
// فالقسم الذي يُعاد تركيبه بعد إجراء يطلب حاله الحالية لا نسخة الفتح الأول
let preloaded = {};
export const bootPreload = {
  set(obj) { preloaded = { ...(obj || {}) }; },
  take(key) { const v = preloaded[key]; delete preloaded[key]; return v; },
};

// ── الخروج من البوابات (التدقيق 2026-11-10، البند 8.3) ──
// المشارك والخبير والمنسق جلسات مستقلة في المتصفح نفسه، فالخروج من واحدة كان يُبقي الأخرى مفتوحة على جهاز مشترك.
// الخروج يسأل حين توجد جلسة دور آخر، ويُلغي كل جلسة على الخادم أيضًا لا من المتصفح وحده
const ROLES = [
  { key: 'participant', label: 'مشارك', store: session, send: (a) => call(a), action: 'logout' },
  { key: 'expert', label: 'خبير', store: xpSession, send: (a) => xpCall(a), action: 'xp.logout' },
  { key: 'org', label: 'منسق جهة', store: coordSession, send: (a) => coordCall(a), action: 'coord.logout' },
];
export const otherRoleSessions = (here) => ROLES.filter((r) => r.key !== here && r.store.get()).map((r) => r.label);
export async function signOut(here) {
  const others = otherRoleSessions(here);
  const all = others.length > 0 && window.confirm(`أنت داخل على هذا الجهاز أيضًا بصفة ${others.join(' و')}.\n\nموافق: اخرج من الكل (الأنسب لجهاز مشترك).\nإلغاء: اخرج من هذه البوابة وحدها.`);
  for (const r of ROLES.filter((x) => x.key === here || (all && x.store.get()))) {
    if (r.store.get()) await r.send(r.action).catch(() => {});
    r.store.clear();
  }
}
