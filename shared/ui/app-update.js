// ════════════════════════════════════════════════════════════════
// تحديث بالدعوة لا بالكسر (تصور تحديث المنصة، المرحلة 5): مصدر واحد لتطبيق القادة ولوحة الإدارة
// ════════════════════════════════════════════════════════════════
// معرّف الإصدار بصمة قطعة الدخول المهشّرة (index-<hash>.js) كما يقرؤها main.jsx، ويكتبها البناء في /version.json
// (shared/build/release-files.mjs). لا SHA الإيداع: الناتج المودع يطابق إعادة بنائه من المصدر.
// - الفحص: عند الرجوع إلى التبويب، وعند التنقل الداخلي، وكل 20 دقيقة. وفحصان متقاربان بينهما دقيقة على الأقل.
// - عند الاختلاف: شريط سطر واحد «تحديث جديد متاح» وزر «حدّث» (UpdateBar.jsx)، بلا رقم نسخة ولا تفاصيل.
// - وعند أول تنقل داخلي بعدها: إعادة تحميل تلقائية إلى الوجهة نفسها، ما لم يكن في الصفحة ما لم يُحفظ
//   (unsaved-registry.js)، وبحارس reloadOnce (مرة في الدقيقة على الأكثر، ش3).
// - رد الخادم update_required (عميل أقدم من الحد الأدنى، _shared/client-compat.js) وunknown_action يُظهران الشريط نفسه إن
//   كان على الموقع إصدار أحدث فعلًا (فحص version.json فورًا)، فلا يُدعى أحد إلى تحديث لا يغيّر شيئًا، ولا تتكرر إعادة
//   التحميل إلى البناء نفسه إن سبقت الدوال ترقية الواجهة (النشر يرقّي الدوال قبل Pages).
// - عامل الخدمة الجديد لا يستولي على التبويبات وحده (sw.js): «حدّث» يرسل إليه SKIP_WAITING وتُعاد الصفحة بعد controllerchange.
import { reloadOnce } from './lazy-retry.js';
import { hasUnsaved } from './unsaved-registry.js';

export const BUILD_SRC = /\/assets\/index-([\w-]+)\.js/;
export const VERSION_URL = '/version.json';
export const CHECK_EVERY_MS = 20 * 60_000;
export const MIN_GAP_MS = 60_000;
const BUILD_RE = /^[\w-]{4,40}$/;

/** بصمة البناء من وسوم السكربت في الصفحة، أو 'dev' (خادم التطوير) */
export function buildFromScripts(doc = typeof document === 'undefined' ? null : document) {
  const src = doc ? [...(doc.scripts || [])].map((s) => String(s.src || '').match(BUILD_SRC)?.[1]).find(Boolean) : null;
  return (src || 'dev').slice(0, 40);
}

/** البصمة من جسم version.json، أو null إن لم يكن بالشكل المتوقع */
export function buildOfVersion(json) {
  const b = json && typeof json === 'object' ? json.build : null;
  return typeof b === 'string' && BUILD_RE.test(b) ? b : null;
}

const defaultFetch = (...a) => (typeof fetch === 'function' ? fetch(...a) : Promise.reject(new Error('no fetch')));

/** مخزن حالة التحديث (بلا React). current: بصمة هذه الصفحة. 'dev' أو فارغة: لا فحص */
export function createAppUpdate({ current = null, fetchImpl = defaultFetch, now = () => Date.now(), url = VERSION_URL } = {}) {
  const state = { current, available: false, reason: null, lastCheck: -Infinity, checking: null };
  const subs = new Set();
  const emit = () => { for (const fn of subs) { try { fn(); } catch { /* مستمع معطوب لا يوقف غيره */ } } };
  const live = () => !!state.current && state.current !== 'dev';

  function mark(reason) {
    if (state.available) return;
    state.available = true;
    state.reason = reason;
    emit();
  }

  /** بصمة version.json على الموقع الآن، أو null. لا يرمي أبدًا */
  async function fetchLatest() {
    try {
      const r = await fetchImpl(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!r || !r.ok) return null;
      return buildOfVersion(await r.json());
    } catch { return null; }
  }

  /** يقرأ version.json ويعيد true إن اختلفت البصمة. force يتجاوز فاصل الدقيقة. لا يرمي أبدًا */
  function check({ force = false } = {}) {
    if (!live()) return Promise.resolve(false);
    if (state.available) return Promise.resolve(true);
    if (state.checking) return state.checking;
    if (!force && now() - state.lastCheck < MIN_GAP_MS) return Promise.resolve(false);
    state.lastCheck = now();
    state.checking = (async () => {
      try {
        const b = await fetchLatest();
        if (b && b !== state.current) { mark('version'); return true; }
        return false;
      } finally { state.checking = null; }
    })();
    return state.checking;
  }

  /** رد خادم يدل على عميل قديم: الرمزان يُظهران الشريط بعد تأكيد إصدار أحدث في version.json. السبب 'server' لـupdate_required */
  function serverSaid(code) {
    if (code !== 'update_required' && code !== 'unknown_action') return Promise.resolve(false);
    if (!live()) return Promise.resolve(false);
    const reason = code === 'update_required' ? 'server' : 'version';
    if (state.available) return Promise.resolve(true);
    return (async () => {
      const r = await fetchLatest();
      if (r && r !== state.current) { mark(reason); return true; }
      return false;
    })();
  }

  return {
    get available() { return state.available; },
    get reason() { return state.reason; },
    get current() { return state.current; },
    setCurrent(b) { state.current = b; },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    check,
    mark,
    serverSaid,
    _reset() { state.available = false; state.reason = null; state.lastCheck = -Infinity; state.checking = null; },
  };
}

// ── عامل الخدمة: تفعيل النسخة المنتظرة بطلب صريح ──
/** يرسل SKIP_WAITING إلى عامل الخدمة المنتظر (إن وُجد ووُجد عامل يتحكم بالصفحة) وينتظر controllerchange، بمهلة.
 * يعيد true إن تبدّل العامل. لا يرمي أبدًا */
export async function activateWaiting(sw = typeof navigator === 'undefined' ? null : navigator.serviceWorker, { timeoutMs = 3000 } = {}) {
  try {
    if (!sw || !sw.controller || typeof sw.getRegistration !== 'function') return false;
    const reg = await sw.getRegistration();
    const waiting = reg && reg.waiting;
    if (!waiting) return false;
    const changed = new Promise((res) => {
      const t = setTimeout(() => res(false), timeoutMs);
      sw.addEventListener('controllerchange', () => { clearTimeout(t); res(true); }, { once: true });
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return await changed;
  } catch { return false; }
}

/** صفحة على الإصدار الجديد ونسخة عامل الخدمة الجديدة تنتظر: تُفعَّل إن كانت هذه الصفحة وحدها مفتوحة (يقرر العامل بعدّ
 * نوافذه، sw.js)، فلا تبقى النسخة الجديدة منتظرة حتى تُغلق كل التبويبات، ولا تُنتزع صفحة قديمة مفتوحة في تبويب آخر */
export function adoptWaitingIfAlone(reg) {
  if (!reg) return;
  const ask = (w) => { try { w?.postMessage({ type: 'SKIP_WAITING', onlyIfAlone: true }); } catch { /* عامل أُزيل */ } };
  if (reg.waiting) ask(reg.waiting);
  reg.addEventListener?.('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener?.('statechange', () => { if (w.state === 'installed' && reg.waiting === w) ask(w); });
  });
}

const defaultLocation = () => (typeof window === 'undefined' ? null : window.location);

/** «حدّث»: طلب المستخدم نفسه، فلا حارس دقيقة. يفعّل العامل المنتظر ثم يفتح to() (القسم الحالي) أو يعيد التحميل */
export async function applyUpdate({ to = null, sw, location = defaultLocation(), activate = activateWaiting } = {}) {
  await activate(sw);
  let href = null;
  try { href = typeof to === 'function' ? to() : to; } catch { href = null; }
  if (href && location && href !== location.href) location.assign(href);
  else location?.reload();
}

/** التنقل الداخلي: يفحص version.json (بفاصل الدقيقة)، وإن كان التحديث متاحًا ولا شيء لم يُحفظ أعاد التحميل إلى الوجهة
 * بحارس reloadOnce. يعيد true إن بدأت إعادة التحميل، فيترك المستدعي التنقل في الصفحة الحالية */
export function reloadOnNavigate(update, { to = null, unsaved = hasUnsaved, reload = reloadOnce, activate = activateWaiting, sw } = {}) {
  if (!update) return false;
  if (!update.available) { update.check(); return false; }
  if (unsaved()) return false;
  const later = (go) => (...a) => { Promise.resolve(activate(sw)).catch(() => {}).then(() => go(...a)); };
  const loc = defaultLocation();
  return reload({
    to,
    reload: later(() => loc?.reload()),
    navigate: later((u) => loc?.replace(u)),
  });
}

// ── المثيل الواحد في الصفحة ──
let instance = null;
export const appUpdate = () => instance;
export const _setAppUpdate = (u) => { instance = u; };

/** يركّب الفحص في الصفحة: الرجوع إلى التبويب، وكل 20 دقيقة، وعودة الاتصال. يعيد المثيل */
export function installAppUpdate(win = typeof window === 'undefined' ? null : window, opts = {}) {
  const current = opts.current ?? buildFromScripts(win?.document);
  instance = createAppUpdate({ current, ...opts });
  if (!win || current === 'dev') return instance;
  const doc = win.document;
  doc?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'visible') instance.check(); });
  win.addEventListener?.('online', () => instance.check());
  win.setInterval?.(() => instance.check({ force: true }), CHECK_EVERY_MS);
  return instance;
}
