// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 1: إيقاف كسر الصفحات المفتوحة.
// الوحدة المشتركة لإعادة التحميل (shared/ui/lazy-retry.js) في التطبيقين، وإعادة التحميل إلى القسم المطلوب (reload-view.js)،
// وقرارات تخزين عامل الخدمة (public/sw.js) دوال خالصة تُقرأ هنا في Node، وصفحة 404 لملفات /assets/ الغائبة.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { _resetReloadFlag, failedAssetUrl, installPreloadRecovery, isChunkError, refreshFailedAsset, reloadOnce, retryImport, RELOAD_PARAM } from '../../shared/ui/lazy-retry.js';
import { _requestedView, noteView, reloadToView, urlForView } from './reload-view.js';
import { tabFromSearch } from './deeplink.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const chunkErr = new TypeError('Failed to fetch dynamically imported module: https://leaders.sunkvalue.com/assets/Handbook-OLD1234.js');

describe('مصدر واحد لإعادة التحميل في التطبيقين', () => {
  it('ملف اللوحة يعيد تصدير المشترك ولا يكرر منطقه', () => {
    const admin = read('admin-app/src/lazy-retry.js');
    expect(admin).toContain("export * from '../../shared/ui/lazy-retry.js';");
    expect(admin).not.toMatch(/function reloadOnce|CHUNK_ERROR =/);
  });
  it('تطبيق القادة: كل شاشة كسولة تمر بالحارس، ولا React.lazy خام، والتحميل المسبق بإعادة واحدة لا بحلقة', () => {
    const app = read('leaders-app/src/App.jsx');
    expect(app).not.toMatch(/\blazy\(/);
    expect(app.match(/= lazyView\(\(\) => import\(/g).length).toBeGreaterThanOrEqual(18);
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).not.toMatch(/React\.lazy\(/);
    const main = read('leaders-app/src/main.jsx');
    expect(main).toContain('installPreloadRecovery(window, { to: viewHref });');
    expect(main).not.toMatch(/location\.reload\(\)/);
    // حاجز القسم يميز خطأ الملف بالمطابِق المشترك نفسه
    expect(read('leaders-app/src/ErrorBoundary.jsx')).toContain("import { hardReload, isChunkError } from '../../shared/ui/lazy-retry.js';");
  });
  it('to: إعادة التحميل إلى رابط آخر بالتنقل، والرابط نفسه بإعادة التحميل، ومرة واحدة في الدقيقة', () => {
    _resetReloadFlag();
    const storage = memStorage();
    const reload = vi.fn();
    const navigate = vi.fn();
    const location = { href: 'https://leaders.sunkvalue.com/' };
    expect(reloadOnce({ storage, reload, navigate, location, now: 1000, to: () => 'https://leaders.sunkvalue.com/?tab=handbook' })).toBe(true);
    expect(navigate).toHaveBeenCalledWith('https://leaders.sunkvalue.com/?tab=handbook');
    expect(reload).not.toHaveBeenCalled();
    // صفحة جديدة والفشل نفسه خلال الدقيقة: لا إعادة ثانية
    _resetReloadFlag();
    expect(reloadOnce({ storage, reload, navigate, location, now: 30_000, to: () => 'https://leaders.sunkvalue.com/?tab=handbook' })).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    // to يعطي الرابط الحالي نفسه: إعادة تحميل عادية
    _resetReloadFlag();
    expect(reloadOnce({ storage: memStorage(), reload, navigate, location, now: 1, to: () => location.href })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // to يرمي أو يعطي فارغًا: الرابط الحالي
    _resetReloadFlag();
    expect(reloadOnce({ storage: memStorage(), reload, navigate, location, now: 1, to: () => { throw new Error('x'); } })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it('to مع مخزن ممنوع: علامة الرابط على رابط القسم، ولا حلقة بعده', () => {
    _resetReloadFlag();
    const navigate = vi.fn();
    const location = { href: 'https://leaders.sunkvalue.com/' };
    expect(reloadOnce({ storage: null, navigate, location, now: 5000, to: () => 'https://leaders.sunkvalue.com/?tab=capstone' })).toBe(true);
    const next = new URL(navigate.mock.calls[0][0]);
    expect(next.searchParams.get('tab')).toBe('capstone');
    expect(next.searchParams.get(RELOAD_PARAM)).toBe('5000');
    // الصفحة الجديدة (القسم قرأ tab وحذفه، والعلامة باقية) والفشل نفسه: لا إعادة
    _resetReloadFlag();
    const after = new URL(next); after.searchParams.delete('tab');
    expect(reloadOnce({ storage: null, navigate, location: { href: after.toString() }, now: 20_000, to: () => `${after}&tab=capstone` })).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('installPreloadRecovery يمرر to ويمنع الرمي مرة واحدة فقط', () => {
    _resetReloadFlag();
    const target = new EventTarget();
    const navigate = vi.fn();
    const storage = memStorage();
    const location = { href: 'https://leaders.sunkvalue.com/' };
    installPreloadRecovery(target, { storage, navigate, location, now: 1000, to: () => 'https://leaders.sunkvalue.com/?tab=lab' });
    const ev1 = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(ev1);
    expect(ev1.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('https://leaders.sunkvalue.com/?tab=lab');
    const ev2 = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('المطابِق المشترك يعرف خطأ الملف الغائب وخطأ نوع HTML، ولا يخلط خطأ الشبكة العام', () => {
    expect(isChunkError(chunkErr)).toBe(true);
    expect(isChunkError(new TypeError("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'"))).toBe(true);
    expect(isChunkError(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('404 الملف الغائب المخزَّن في المتصفح يُجدَّد قبل إعادة التحميل (التراجع إلى نشر سابق)', () => {
  const origin = 'https://leaders.sunkvalue.com';
  it('failedAssetUrl يأخذ رابط /assets/ من رسالة Chromium وFirefox، من النطاق نفسه وحده', () => {
    expect(failedAssetUrl(chunkErr, origin)).toBe(`${origin}/assets/Handbook-OLD1234.js`);
    expect(failedAssetUrl(new TypeError(`error loading dynamically imported module: ${origin}/assets/Lab-abc.js`), origin)).toBe(`${origin}/assets/Lab-abc.js`);
    expect(failedAssetUrl(new Error(`Unable to preload CSS for ${origin}/assets/index-abc.css`), origin)).toBe(`${origin}/assets/index-abc.css`);
    // Safari لا يذكر الرابط، ونطاق آخر لا يُطلب
    expect(failedAssetUrl(new TypeError('Importing a module script failed.'), origin)).toBeNull();
    expect(failedAssetUrl(new TypeError('Failed to fetch dynamically imported module: https://evil.example/assets/x.js'), origin)).toBeNull();
  });
  it('refreshFailedAsset يطلب الملف بـcache: reload، ولا يرمي إن فشل الطلب، وينتهي بالمهلة', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ status: 200 }));
    await refreshFailedAsset(chunkErr, { fetchImpl, origin });
    expect(fetchImpl).toHaveBeenCalledWith(`${origin}/assets/Handbook-OLD1234.js`, { cache: 'reload', credentials: 'same-origin' });
    await expect(refreshFailedAsset(chunkErr, { fetchImpl: () => Promise.reject(new TypeError('offline')), origin })).resolves.toBeUndefined();
    await expect(refreshFailedAsset(chunkErr, { fetchImpl: () => new Promise(() => {}), origin, timeoutMs: 5 })).resolves.toBeUndefined();
    expect(refreshFailedAsset(new TypeError('Importing a module script failed.'), { fetchImpl, origin })).toBeNull();
  });
  it('reloadOnce بالخطأ يجدد الملف ثم يعيد التحميل، وبلا خطأ يعيد فورًا كما كان', async () => {
    _resetReloadFlag();
    const order = [];
    let release;
    const refresh = vi.fn(() => new Promise((r) => { release = () => { order.push('refresh'); r(); }; }));
    const navigate = vi.fn(() => order.push('navigate'));
    const location = { href: `${origin}/`, origin };
    expect(reloadOnce({ storage: memStorage(), navigate, location, now: 1000, to: () => `${origin}/?tab=lab`, error: chunkErr, refresh })).toBe(true);
    expect(refresh).toHaveBeenCalledWith(chunkErr, { origin, load: null });
    expect(navigate).not.toHaveBeenCalled();
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['refresh', 'navigate']);
    // التجديد الذي يرمي لا يمنع إعادة التحميل
    _resetReloadFlag();
    const reload = vi.fn();
    expect(reloadOnce({ storage: memStorage(), reload, location, now: 1000, error: chunkErr, refresh: () => { throw new Error('x'); } })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('مستمع preloadError ومحاولة الاستيراد الثانية يمرران الخطأ إلى reloadOnce', async () => {
    _resetReloadFlag();
    const target = new EventTarget();
    const refresh = vi.fn(() => Promise.resolve());
    const navigate = vi.fn();
    installPreloadRecovery(target, { storage: memStorage(), navigate, refresh, location: { href: `${origin}/`, origin }, now: 1000 });
    const ev = new Event('vite:preloadError', { cancelable: true });
    ev.payload = chunkErr;
    target.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(refresh).toHaveBeenCalledWith(chunkErr, { origin, load: null });
    const reloadPage = vi.fn(() => true);
    retryImport(() => Promise.reject(chunkErr), { reloadPage });
    await new Promise((r) => setTimeout(r, 0));
    expect(reloadPage).toHaveBeenCalledWith({ error: chunkErr, load: expect.any(Function) });
    expect(read('leaders-app/src/reload-view.js')).toContain('reloadPage: (o) => reloadToView(o)');
  });
});

describe('إعادة التحميل تفتح القسم المطلوب لا «رحلتي»', () => {
  it('urlForView يكتب /?tab= في مسار المشارك ويبقي ما سواه، ويقرؤه tabFromSearch', () => {
    const u = urlForView('https://leaders.sunkvalue.com/?org=abc#x', 'handbook');
    expect(new URL(u).searchParams.get('tab')).toBe('handbook');
    expect(new URL(u).searchParams.get('org')).toBe('abc');
    expect(new URL(u).hash).toBe('#x');
    expect(tabFromSearch(new URL(u).search)).toEqual({ view: 'handbook', search: '?org=abc' });
    for (const v of ['handbook', 'capstone', 'hall', 'impact', 'lab', 'katon', 'f360', 'profile']) expect(tabFromSearch(new URL(urlForView('https://l.x/', v)).search).view, v).toBe(v);
    // الرحلة لا تحتاج رابطًا، وtab قديم يُحذف
    expect(urlForView('https://l.x/?tab=lab', 'home')).toBe('https://l.x/');
    expect(urlForView('https://l.x/', null)).toBe('https://l.x/');
    // البوابات المستقلة مسارها في الرابط: لا تُمس
    expect(urlForView('https://l.x/x?t=1', 'handbook')).toBe('https://l.x/x?t=1');
    expect(urlForView('https://l.x/org', 'lab')).toBe('https://l.x/org');
  });
  it('فشل ملف القسم مرتين يعيد التحميل إلى القسم الذي طلبه المشارك، ومرة واحدة', async () => {
    _resetReloadFlag();
    noteView('capstone');
    expect(_requestedView()).toBe('capstone');
    const navigate = vi.fn();
    const storage = memStorage();
    const location = { href: 'https://leaders.sunkvalue.com/' };
    const load = vi.fn(() => Promise.reject(chunkErr));
    const pending = retryImport(load, { reloadPage: () => reloadToView({ storage, navigate, location, now: 1000, to: () => urlForView(location.href, _requestedView()) }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://leaders.sunkvalue.com/?tab=capstone');
    // الوعد لا ينتهي: لا تومض رسالة الخطأ قبل التحميل
    expect(await Promise.race([pending.then(() => 'resolved'), new Promise((r) => setTimeout(() => r('pending'), 10))])).toBe('pending');
    noteView(null);
  });
  it('reloadToView يقرأ القسم المطلوب من رابط الصفحة الحالي', () => {
    _resetReloadFlag();
    noteView('impact');
    const navigate = vi.fn();
    reloadToView({ storage: memStorage(), navigate, location: window.location, now: 1 });
    expect(new URL(navigate.mock.calls[0][0]).searchParams.get('tab')).toBe('impact');
    noteView(null);
  });
});

// عامل الخدمة يُقرأ في سياق معزول بلا self ولا caches: لا يُركَّب أي مستمع، وتُستخرج دوال القرار وحدها
function swPolicy() {
  const ctx = { URL };
  vm.createContext(ctx);
  vm.runInContext(`${read('leaders-app/public/sw.js')}\n;globalThis.__p = { cacheableAsset, cacheableNavigation, inCachedDir, isRange, SHELL, cachesToDelete, skipWaitingFor, matchCurrentFirst };`, ctx);
  return ctx.__p;
}
const H = (o = {}) => ({ get: (k) => o[k.toLowerCase()] ?? null });
const req = (headers) => ({ headers: H(headers) });
const res = (status, type, ct, kind = 'basic') => ({ status, ok: status >= 200 && status < 300, type: kind, headers: H(ct ? { 'content-type': ct } : {}) });

describe('عامل الخدمة: ما يُخزَّن وما لا يُخزَّن', () => {
  const p = swPolicy();
  it('يخزن /assets/ و/fonts/ بنوع JS أو CSS أو خط فقط', () => {
    expect(p.cacheableAsset(req(), res(200, 0, 'application/javascript; charset=utf-8'), '/assets/index-abc.js')).toBe(true);
    expect(p.cacheableAsset(req(), res(200, 0, 'text/javascript'), '/assets/Hall-abc.js')).toBe(true);
    expect(p.cacheableAsset(req(), res(200, 0, 'text/css'), '/assets/index-abc.css')).toBe(true);
    expect(p.cacheableAsset(req(), res(200, 0, 'font/woff2'), '/fonts/NotoKufiArabic-arabic-s2.woff2')).toBe(true);
    expect(p.cacheableAsset(req(), res(200, 0, 'text/css'), '/fonts/fonts-s2.css')).toBe(true);
  });
  it('يخزن صور /assets/ (الشعار وصور الكتيب) فتبقى دون اتصال', () => {
    expect(p.cacheableAsset(req(), res(200, 0, 'image/svg+xml'), '/assets/milestone-impact-inverted-abc.svg')).toBe(true);
    expect(p.cacheableAsset(req(), res(200, 0, 'image/webp'), '/assets/cover-abc.webp')).toBe(true);
    expect(p.cacheableAsset(req(), res(200, 0, 'image/png'), '/assets/logo-abc.png')).toBe(true);
    expect(p.cacheableAsset(req(), res(404, 0, 'image/webp'), '/assets/cover-OLD.webp')).toBe(false);
    expect(p.cacheableAsset(req(), res(200, 0, 'text/html'), '/assets/cover-OLD.webp')).toBe(false);
  });
  it('لا يخزن HTML تحت اسم ملف JS (رد الملف الغائب أو تحدي جدار الحماية)', () => {
    expect(p.cacheableAsset(req(), res(200, 0, 'text/html; charset=utf-8'), '/assets/Handbook-OLD.js')).toBe(false);
    expect(p.cacheableAsset(req(), res(404, 0, 'text/html'), '/assets/Handbook-OLD.js')).toBe(false);
    expect(p.cacheableAsset(req(), res(403, 0, 'text/html'), '/assets/index-abc.js')).toBe(false);
    expect(p.cacheableAsset(req(), res(200, 0, ''), '/assets/index-abc.js')).toBe(false);
  });
  it('لا يخزن خارج /assets/ و/fonts/ (الفيديو والصور والملف التعريفي)', () => {
    expect(p.cacheableAsset(req(), res(200, 0, 'video/mp4'), '/media/intro-v3.mp4')).toBe(false);
    expect(p.cacheableAsset(req(), res(200, 0, 'application/javascript'), '/media/x.js')).toBe(false);
    expect(p.cacheableAsset(req(), res(200, 0, 'image/png'), '/media/cover.png')).toBe(false);
    expect(p.inCachedDir('/assetsx/a.js')).toBe(false);
  });
  it('لا يخزن ردًا جزئيًا (206) ولا طلب Range، ولا ردًا معتمًا من نطاق آخر', () => {
    expect(p.cacheableAsset(req(), res(206, 0, 'application/javascript'), '/assets/index-abc.js')).toBe(false);
    expect(p.cacheableAsset(req({ range: 'bytes=0-' }), res(200, 0, 'font/woff2'), '/fonts/a.woff2')).toBe(false);
    expect(p.isRange(req({ range: 'bytes=0-1' }))).toBe(true);
    expect(p.isRange(req())).toBe(false);
    expect(p.cacheableAsset(req(), { ...res(200, 0, 'application/javascript', 'opaque') }, '/assets/index-abc.js')).toBe(false);
  });
  it('التنقل يُحفظ ردًا سليمًا من النطاق نفسه فقط', () => {
    expect(p.cacheableNavigation(res(200, 0, 'text/html'))).toBe(true);
    for (const r of [res(500, 0, 'text/html'), res(503, 0, 'text/html'), res(403, 0, 'text/html'), res(200, 0, 'text/html', 'opaque'), res(200, 0, 'text/html', 'opaqueredirect'), null]) expect(p.cacheableNavigation(r)).toBe(false);
  });
  it('النسخة من ?v=، ولا skipWaiting عند التثبيت (المرحلة 5): يُفعَّل بـSKIP_WAITING وحده، ويُبقي مخزن الإصدار السابق', () => {
    const sw = read('leaders-app/public/sw.js');
    expect(sw).toMatch(/searchParams\.get\('v'\)/);
    expect(sw).toContain('cachesToDelete(keys, CACHE).map((k) => caches.delete(k))');
    const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('message'"));
    expect(install).not.toContain('skipWaiting');
    expect(sw).toMatch(/skipWaitingFor\(data, list\.length\)\) return self\.skipWaiting\(\)/);
    expect(sw).toContain('self.clients.claim()');
    expect(sw).toContain("caches.open(CACHE).then((c) => c.put('/', copy))");
  });
});

describe('عامل الخدمة: التفعيل بالدعوة ومخزن الإصدار السابق (المرحلة 5)', () => {
  const p = swPolicy();
  // مخازن بترتيب إنشائها كما في Cache API: match العام يعيد أول إصابة، فالأقدم يجيب أولًا
  const fakeCaches = (byName) => {
    const order = Object.keys(byName);
    const cache = (n) => ({ match: async (k) => byName[n][k] ?? undefined });
    return {
      open: async (n) => (byName[n] ? cache(n) : { match: async () => undefined }),
      match: async (k) => { for (const n of order) { if (byName[n][k] !== undefined) return byName[n][k]; } return undefined; },
    };
  };
  it('الانقطاع: الصفحة من مخزن الإصدار الحالي لا من مخزن N-1 الأقدم، وما غاب عنه من أي مخزن', async () => {
    const store = fakeCaches({ 'mi-leaders-old': { '/': 'old-page', '/favicon.svg': 'old-icon' }, 'mi-leaders-new': { '/': 'new-page' } });
    expect(await store.match('/')).toBe('old-page');
    expect(await p.matchCurrentFirst(store, 'mi-leaders-new', '/')).toBe('new-page');
    expect(await p.matchCurrentFirst(store, 'mi-leaders-new', '/favicon.svg')).toBe('old-icon');
    expect(await p.matchCurrentFirst(store, 'mi-leaders-new', '/none')).toBeUndefined();
    const sw = read('leaders-app/public/sw.js');
    expect(sw).toContain(".catch(() => matchCurrentFirst(caches, CACHE, '/'))");
    expect(sw).toContain('fetch(req).catch(() => matchCurrentFirst(caches, CACHE, req))');
    expect(sw).not.toMatch(/catch\(\(\) => caches\.match/);
  });
  it('يُبقي الحالي وآخر مخزن قبله (N-1) ويحذف ما سواهما، ولا يمس مخزنًا ليس له', () => {
    expect([...p.cachesToDelete(['mi-leaders-a', 'mi-leaders-b', 'mi-leaders-c', 'other'], 'mi-leaders-c')]).toEqual(['mi-leaders-a']);
    expect([...p.cachesToDelete(['mi-leaders-a', 'mi-leaders-b'], 'mi-leaders-b')]).toEqual([]);
    expect([...p.cachesToDelete(['mi-leaders-x'], 'mi-leaders-x')]).toEqual([]);
    expect([...p.cachesToDelete([], 'mi-leaders-x')]).toEqual([]);
    expect([...p.cachesToDelete(['mi-leaders-a', 'mi-leaders-b', 'mi-leaders-c'], 'mi-leaders-a')]).toEqual(['mi-leaders-b']);
  });
  it('SKIP_WAITING من «حدّث» يُفعَّل دائمًا، ومع onlyIfAlone حين تكون نافذة واحدة فقط', () => {
    expect(p.skipWaitingFor({ type: 'SKIP_WAITING' }, 3)).toBe(true);
    expect(p.skipWaitingFor({ type: 'SKIP_WAITING', onlyIfAlone: true }, 1)).toBe(true);
    expect(p.skipWaitingFor({ type: 'SKIP_WAITING', onlyIfAlone: true }, 2)).toBe(false);
    expect(p.skipWaitingFor({ type: 'OTHER' }, 1)).toBe(false);
    expect(p.skipWaitingFor(null, 1)).toBe(false);
  });
});

describe('ملف /assets/ الغائب يعطي 404 لا صفحة التطبيق', () => {
  it('assets/404.html في public/ وفي الناتج المبني للتطبيقين، وترويسته بلا تخزين', () => {
    for (const [app, out] of [['leaders-app', 'leaders'], ['admin-app', 'admin']]) {
      for (const f of [`${app}/public/assets/404.html`, `${out}/assets/404.html`]) {
        expect(existsSync(join(root, f)), f).toBe(true);
        expect(read(f)).toMatch(/^<!doctype html>/i);
        expect(read(f).length).toBeLessThan(1024);
      }
      // _headers تطابق مسار الطلب لا الملف المقدَّم: قاعدة لـ/assets/404.html لا تمس رد الملف الغائب، فلا تُكتب
      const h = read(`${out}/_headers`);
      expect(h, out).not.toMatch(/^\/assets\/404\.html$/m);
      // لا 404.html في الجذر: يبقى Pages في وضع التطبيق ذي الصفحة الواحدة لمسارات التطبيق
      expect(existsSync(join(root, `${app}/public/404.html`)), app).toBe(false);
      // ولا قاعدة /* إلى index.html في _redirects: قد تتقدم على أقرب 404.html فيعود الملف الغائب صفحةً برمز 200
      for (const f of [`${app}/public/_redirects`, `${out}/_redirects`]) expect(read(f), f).not.toMatch(/^\/\*\s/m);
    }
  });
  it('لا شرطة طويلة ولا متوسطة في ملفات المرحلة', () => {
    for (const f of ['shared/ui/lazy-retry.js', 'admin-app/src/lazy-retry.js', 'leaders-app/src/reload-view.js', 'leaders-app/public/sw.js', 'leaders-app/public/assets/404.html', 'admin-app/public/assets/404.html', 'leaders-app/src/update-safety.test.js', 'leaders-app/src/main.jsx', 'leaders-app/src/ErrorBoundary.jsx', 'leaders-app/src/deeplink.js']) {
      expect(/[\u2013\u2014]/.test(read(f)), f).toBe(false);
    }
  });
});

describe('غلاف Vite بعد إعادة التحميل من مستمع preloadError', () => {
  it('وحدة فارغة (المستمع منع الرمي وأعاد الصفحة) تنتظر التحميل الجديد ولا ترمي «default»', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const p = retryImport(load, { reloadPage: () => true });
    expect(await Promise.race([p.then(() => 'resolved', () => 'rejected'), new Promise((r) => setTimeout(() => r('pending'), 10))])).toBe('pending');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
