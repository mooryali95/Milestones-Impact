// ════════════════════════════════════════════════════════════════
// الشاشات الكسولة بعد النشر: ملف قسم قديم لم يعد موجودًا (مصدر واحد للوحة الإدارة وتطبيق القادة)
// ════════════════════════════════════════════════════════════════
// أسماء ملفات الأقسام تتغير مع كل بناء. الصفحة المفتوحة قبل النشر لا تعيد تحميل index.html، فتطلب عند فتح قسم لأول مرة
// ملفًا حُذف، فيفشل الاستيراد (404، أو index.html بنوع HTML إن لم يُصلح رد Pages للملف الغائب).
// React.lazy يحفظ الوعد المرفوض، فلا يصلحه «حاول مرة أخرى»: الحل إعادة تحميل الصفحة مرة واحدة، بعلامة في الجلسة تمنع
// حلقة إعادة التحميل إن تكرر الفشل لسبب آخر، فتعرض الشاشة حينها رسالة واضحة بزر إعادة التحميل.
// الخيار to (دالة تعطي الرابط): إعادة التحميل إلى رابط بعينه بدل الرابط الحالي، كقسم المشارك المطلوب (/?tab=) في تطبيق
// القادة، فلا تقع الصفحة الجديدة على «رحلتي» (تصور تحديث المنصة، المرحلة 1 البند 3).
// الخيار error (الخطأ الذي سبّب إعادة التحميل): يُطلب الملف الفاشل من الشبكة أولًا بـcache: 'reload' فيستبدل المتصفح ما خزّنه
// له. رد Pages للملف الغائب يحمل ترويسة /assets/* (ثابت سنة) لأن _headers تطابق مسار الطلب لا الملف المقدَّم، فيبقى 404
// مخزنًا في المتصفح. فإن عاد الملف بعد تراجع الواجهة إلى نشر سابق، أعاد هذا الطلب تخزينه سليمًا قبل إعادة التحميل.
// يعمل حيث تحمل رسالة الخطأ رابط الملف (Chromium وFirefox)، وSafari لا يذكره فلا طلب فيه (RUNBOOK §2).
import { lazy } from 'react';

export const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to load module script|MIME type|ChunkLoadError|Loading (?:CSS )?chunk \S+ failed|Unable to preload CSS/i;
export const isChunkError = (e) => CHUNK_ERROR.test(String((e && (e.message || e.reason?.message)) || e || ''));

// علامة واحدة للتطبيقين: مخزن الجلسة خاص بكل نطاق، فلا تتداخل لوحة الإدارة وتطبيق القادة
const FLAG = 'mi_chunk_reload';
// علامة الرابط حين يُمنع مخزن الجلسة: معامل في الاستعلام (قبل #، فلا يمس مسار اللوحة) بوقت آخر إعادة
export const RELOAD_PARAM = 'mi_reload';
const WINDOW_MS = 60_000;
const defaultReload = () => { if (typeof window !== 'undefined') window.location.reload(); };
const defaultStorage = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };
const defaultLocation = () => (typeof window === 'undefined' ? null : window.location);
const defaultNavigate = (url) => { if (typeof window !== 'undefined') window.location.replace(url); };
// علامة في الصفحة نفسها: لا تُعاد الصفحة مرتين قبل أن تُحمَّل من جديد، أيًا كان المخزن
let reloadedThisPage = false;
export const _resetReloadFlag = () => { reloadedThisPage = false; };

// المخزن يعمل فعلًا: يُكتب ويُقرأ ما كُتب (المخزن الممنوع يرمي، والممتلئ يرمي عند الكتابة)
function storageMark(storage, now) {
  if (!storage) return null;
  try {
    const last = Number(storage.getItem(FLAG)) || 0;
    if (last && now - last < WINDOW_MS) return { recent: true };
    storage.setItem(FLAG, String(now));
    return storage.getItem(FLAG) === String(now) ? { recent: false } : null;
  } catch { return null; }
}

// الرابط المطلوب بعد إعادة التحميل: ما تعطيه to إن أعطت رابطًا صالحًا، وإلا الرابط الحالي
function targetHref(to, location) {
  try {
    const t = typeof to === 'function' ? to() : to;
    if (t) return new URL(t, location?.href).toString();
  } catch { /* رابط غير صالح: الرابط الحالي */ }
  return null;
}

// رابط ملف /assets/ الفاشل من رسالة الخطأ، من النطاق نفسه فقط، أو null
const ASSET_URL = /https?:\/\/[^\s"'()<>]+?\/assets\/[^\s"'()<>?#]+?\.(?:m?js|css)\b/i;
export function failedAssetUrl(e, origin = defaultLocation()?.origin) {
  const text = String((e && (e.message || e.reason?.message)) || e || '');
  const m = text.match(ASSET_URL);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    return origin && u.origin !== origin ? null : u.toString();
  } catch { return null; }
}

// يطلب الملف الفاشل من الشبكة متجاوزًا مخزن المتصفح (فيستبدل رده المخزن)، بمهلة أقصاها timeoutMs. لا يرمي أبدًا
export function refreshFailedAsset(e, { fetchImpl = typeof fetch === 'function' ? fetch : null, origin, timeoutMs = 3000 } = {}) {
  const url = failedAssetUrl(e, origin);
  if (!url || typeof fetchImpl !== 'function') return null;
  let timer;
  const wait = new Promise((r) => { timer = setTimeout(r, timeoutMs); });
  let req;
  try { req = Promise.resolve(fetchImpl(url, { cache: 'reload', credentials: 'same-origin' })).catch(() => {}); } catch { req = Promise.resolve(); }
  return Promise.race([req, wait]).then(() => { clearTimeout(timer); });
}

// إعادة تحميل واحدة في الدقيقة: true إن أعاد التحميل الآن، وfalse إن سبقتها إعادة قريبة (فلا حلقة). بمخزن الجلسة إن عمل،
// وإلا بعلامة الرابط (تبقى بعد إعادة التحميل)، وإن تعذرت كذلك فلا إعادة: رسالة الشاشة بزرها أسلم من حلقة بلا نهاية
// وبالخيار error يُجدَّد الملف الفاشل في مخزن المتصفح أولًا (refreshFailedAsset)، ثم تكون إعادة التحميل
export function reloadOnce({ storage = defaultStorage(), reload = defaultReload, now = Date.now(), location = defaultLocation(), navigate = defaultNavigate, to = null, error = null, refresh = refreshFailedAsset } = {}) {
  if (reloadedThisPage) return false;
  const mark = storageMark(storage, now);
  if (mark?.recent) return false;
  const pending = error && typeof refresh === 'function' ? safeRefresh(refresh, error, location) : null;
  const after = (go) => { if (pending) pending.then(go, go); else go(); };
  if (mark) {
    reloadedThisPage = true;
    const href = targetHref(to, location);
    // رابط مختلف يُفتح بالتنقل (تحميل كامل)، والرابط نفسه بإعادة التحميل
    after(() => { if (href && href !== location?.href) navigate(href); else reload(); });
    return true;
  }
  let url;
  try { url = new URL(targetHref(to, location) || location.href); } catch { return false; }
  let current;
  try { current = new URL(location.href); } catch { current = url; }
  const last = Number(current.searchParams.get(RELOAD_PARAM)) || 0;
  if (last && now - last < WINDOW_MS) return false;
  url.searchParams.set(RELOAD_PARAM, String(now));
  reloadedThisPage = true;
  const dest = url.toString();
  after(() => navigate(dest));
  return true;
}

function safeRefresh(refresh, error, location) {
  try {
    const p = refresh(error, { origin: location?.origin });
    return p && typeof p.then === 'function' ? p : null;
  } catch { return null; }
}

// الاستيراد بمحاولة ثانية، ثم إعادة تحميل الصفحة مرة واحدة. خطأ غير خطأ الملف يُرمى كما هو
export async function retryImport(load, { reloadPage = reloadOnce } = {}) {
  try {
    const mod = await load();
    // مستمع vite:preloadError (installPreloadRecovery) أعاد الصفحة ومنع الرمي، فيُرجع غلاف Vite وحدةً فارغة:
    // يُنتظر التحميل الجديد بلا خطأ «default» يومض قبله
    if (mod == null) return new Promise(() => {});
    return mod;
  } catch (e) {
    if (!isChunkError(e)) throw e;
    try {
      const mod = await load();
      return mod == null ? new Promise(() => {}) : mod;
    } catch (e2) {
      // تُعاد الصفحة: الوعد لا ينتهي فلا تومض رسالة الخطأ قبل التحميل
      if (reloadPage({ error: e2 })) return new Promise(() => {});
      throw e2;
    }
  }
}

export const lazyRetry = (load, opts) => lazy(() => retryImport(load, opts));
// قسم مسمّى من ملف فيه أكثر من قسم
export const lazyNamed = (load, key, opts) => lazy(() => retryImport(load, opts).then((m) => ({ default: m[key] })));

// تحميل مسبق فشل (Vite يطلق vite:preloadError): إعادة تحميل واحدة بدل الرمي. opts تمرر إلى reloadOnce (ومنها to)
export function installPreloadRecovery(target = typeof window === 'undefined' ? null : window, opts) {
  if (!target) return;
  target.addEventListener('vite:preloadError', (event) => { if (reloadOnce({ ...opts, error: event.payload })) event.preventDefault(); });
}
