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
// Chromium وFirefox يذكران رابط الملف في رسالة الخطأ فيُطلب وحده. Safari لا يذكره، فتُسأل الملفات المرشحة (chunkCandidates)
// ويُجدَّد منها ما رده المخزن غير سليم. (عامل الخادم خيار موثق في RUNBOOK §2.)
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

// ملفات الاستيراد المرشحة حين لا تذكر رسالة الخطأ رابطًا (Safari: «Importing a module script failed.»): ما في نص دالة
// التحميل من import("…") (في البناء: import("./<القسم>-<البصمة>.js") نسبيًا إلى assets/)، وروابط modulepreload التي يضعها
// Vite لتبعيات القسم، وسكربتات الوحدات، وما طلبته الصفحة من /assets/*.js|css (Resource Timing). من النطاق نفسه وحده، و60 على الأكثر
const IMPORT_SPEC = /import\(\s*["'`]([^"'`]+?\.(?:m?js|jsx|css))["'`]\s*\)/g;
const ASSET_PATH = /^\/assets\/[^?#]+\.(?:m?js|css)$/i;
export function chunkCandidates({ load = null, origin = defaultLocation()?.origin, doc = typeof document === 'undefined' ? null : document, perf = typeof performance === 'undefined' ? null : performance, max = 60 } = {}) {
  if (!origin) return [];
  const base = `${origin}/assets/`;
  const out = new Set();
  const add = (href, rel = base) => {
    try {
      const u = new URL(href, rel);
      if (u.origin === origin && ASSET_PATH.test(u.pathname)) out.add(`${u.origin}${u.pathname}`);
    } catch { /* رابط غير صالح */ }
  };
  try { if (typeof load === 'function') for (const m of String(load).matchAll(IMPORT_SPEC)) add(m[1]); } catch { /* نص الدالة غير متاح */ }
  try { if (doc) for (const el of doc.querySelectorAll('link[rel="modulepreload"][href], script[type="module"][src], link[rel="stylesheet"][href]')) add(el.getAttribute('href') || el.getAttribute('src'), doc.baseURI || origin); } catch { /* لا مستند */ }
  try { if (perf && typeof perf.getEntriesByType === 'function') for (const e of perf.getEntriesByType('resource')) add(e.name); } catch { /* لا Resource Timing */ }
  return [...out].slice(0, max);
}

// اسم القسم من دالة التحميل (import("./ExpertPortal-<البصمة>.js") أو ('./screens/ExpertPortal.jsx')) بحروف صغيرة لاسم فعل
// القياس (lazy.<القسم>)، أو '' إن لم يُعرف
export function chunkName(load) {
  try {
    const m = String(load).match(/import\(\s*["'`](?:[^"'`]*\/)?([A-Za-z][A-Za-z0-9]*)(?:[-.][^"'`/]*)?["'`]/);
    return m ? m[1].toLowerCase().slice(0, 40) : '';
  } catch { return ''; }
}

const okAsset = (res) => !!res && res.ok && !/^text\/html/i.test((res.headers && res.headers.get && res.headers.get('content-type')) || '');

// يطلب الملف الفاشل من الشبكة متجاوزًا مخزن المتصفح (فيستبدل رده المخزن)، بمهلة أقصاها timeoutMs. لا يرمي أبدًا.
// بلا رابط في الخطأ (Safari): يسأل كل ملف مرشح (chunkCandidates) بطلب عادي يجيبه المخزن غالبًا بلا شبكة، وما رده غير سليم
// (404 مخزن، أو صفحة HTML) يُطلب ثانية بـcache: 'reload' فيستبدل المتصفح رده المخزن قبل إعادة التحميل
export function refreshFailedAsset(e, { fetchImpl = typeof fetch === 'function' ? fetch : null, origin, timeoutMs = 3000, load = null, candidates = null } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const call = (url, init) => { try { return Promise.resolve(fetchImpl(url, { credentials: 'same-origin', ...init })).catch(() => null); } catch { return Promise.resolve(null); } };
  const url = failedAssetUrl(e, origin);
  let req;
  if (url) req = call(url, { cache: 'reload' });
  else {
    const list = Array.isArray(candidates) ? candidates : chunkCandidates({ load, origin: origin ?? undefined });
    if (!list.length) return null;
    req = Promise.all(list.map((u) => call(u).then((res) => (okAsset(res) ? null : call(u, { cache: 'reload' })))));
  }
  let timer;
  const wait = new Promise((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([req, wait]).then(() => { clearTimeout(timer); });
}

// المخرج الأخير حين يتكرر فشل القسم بعد إعادة التحميل التلقائية: يلغي تسجيل عامل الخدمة، ويحذف مخازنه، ويجدد ملفات
// /assets/ المرشحة من الشبكة (refreshFailedAsset بلا رابط)، ثم يفتح الصفحة برابط فيه معامل جديد فلا يُقدَّم من أي مخزن
export const FRESH_PARAM = 'mi_fresh';
export async function hardReload({ href = defaultLocation()?.href, navigate = defaultNavigate, now = Date.now(), win = typeof window === 'undefined' ? null : window, refresh = refreshFailedAsset } = {}) {
  const step = (p, ms = 2500) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  try {
    const sw = win && win.navigator && win.navigator.serviceWorker;
    if (sw && typeof sw.getRegistrations === 'function') await step(sw.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))));
  } catch { /* لا عامل خدمة */ }
  try {
    const store = win && win.caches;
    if (store && typeof store.keys === 'function') await step(store.keys().then((ks) => Promise.all(ks.map((k) => store.delete(k)))));
  } catch { /* لا مخازن */ }
  try { await step(refresh(null, { origin: win?.location?.origin })); } catch { /* لا يمنع الفتح */ }
  let dest = href;
  try { const u = new URL(href); u.searchParams.set(FRESH_PARAM, String(now)); u.searchParams.delete(RELOAD_PARAM); dest = u.toString(); } catch { /* الرابط كما هو */ }
  navigate(dest);
}

// إعادة تحميل واحدة في الدقيقة: true إن أعاد التحميل الآن، وfalse إن سبقتها إعادة قريبة (فلا حلقة). بمخزن الجلسة إن عمل،
// وإلا بعلامة الرابط (تبقى بعد إعادة التحميل)، وإن تعذرت كذلك فلا إعادة: رسالة الشاشة بزرها أسلم من حلقة بلا نهاية
// وبالخيار error يُجدَّد الملف الفاشل في مخزن المتصفح أولًا (refreshFailedAsset)، ثم تكون إعادة التحميل
export function reloadOnce({ storage = defaultStorage(), reload = defaultReload, now = Date.now(), location = defaultLocation(), navigate = defaultNavigate, to = null, error = null, load = null, refresh = refreshFailedAsset } = {}) {
  if (reloadedThisPage) return false;
  const mark = storageMark(storage, now);
  if (mark?.recent) return false;
  const pending = error && typeof refresh === 'function' ? safeRefresh(refresh, error, location, load) : null;
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

function safeRefresh(refresh, error, location, load) {
  try {
    const p = refresh(error, { origin: location?.origin, load });
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
      if (reloadPage({ error: e2, load })) return new Promise(() => {});
      // اسم القسم على الخطأ: يقرؤه حاجز القسم في القياس (lazy.<القسم>) فيقول الحدث أي قسم فشل
      try { if (e2 && typeof e2 === 'object' && !e2.chunk) e2.chunk = chunkName(load); } catch { /* خطأ مجمّد */ }
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
