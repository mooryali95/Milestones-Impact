// تجديد ملفات القسم في Safari بلا رابط في الخطأ، والمخرج الأخير
// (حادث الخبير على iPhone، 2026-11-25: 404 مخزن سنة تحت ترويسة immutable، وSafari لا يذكر الرابط)
import { describe, expect, it, vi } from 'vitest';
import { chunkCandidates, chunkName, FRESH_PARAM, hardReload, refreshFailedAsset, retryImport } from '../../shared/ui/lazy-retry.js';

const origin = 'https://leaders.sunkvalue.com';
// دالة تحميل بنص البناء (vitest يعيد كتابة import( في نص الاختبار نفسه)
const built = (src, impl = () => {}) => Object.assign(impl, { toString: () => src });

describe('Safari: تجديد ملفات القسم بلا رابط في الخطأ', () => {
  const safari = new TypeError('Importing a module script failed.');
  it('chunkCandidates: من نص دالة التحميل وروابط modulepreload وResource Timing، من النطاق نفسه وحده', () => {
    const load = built('()=>Mn(()=>import("./ExpertPortal-AbC_12.js"),__vite__mapDeps([1,2]))');
    const doc = { baseURI: `${origin}/`, querySelectorAll: () => [{ getAttribute: (k) => (k === 'href' ? '/assets/ui-x1.js' : null) }, { getAttribute: (k) => (k === 'href' ? 'https://evil.example/assets/y.js' : null) }] };
    const perf = { getEntriesByType: () => [{ name: `${origin}/assets/index-Q.css` }, { name: `${origin}/fonts/a.woff2` }, { name: `${origin}/assets/ExpertPortal-AbC_12.js` }] };
    expect(chunkCandidates({ load, origin, doc, perf })).toEqual([`${origin}/assets/ExpertPortal-AbC_12.js`, `${origin}/assets/ui-x1.js`, `${origin}/assets/index-Q.css`]);
    expect(chunkCandidates({ origin: null })).toEqual([]);
  });
  it('chunkName: اسم القسم بحروف صغيرة من البناء ومن المصدر', () => {
    expect(chunkName(built('()=>Mn(()=>import("./ExpertPortal-AbC_12.js"),[])'))).toBe('expertportal');
    expect(chunkName(built("() => import('./screens/Feedback360.jsx')"))).toBe('feedback360');
    expect(chunkName(() => Promise.reject(new Error('x')))).toBe('');
  });
  it('refreshFailedAsset بلا رابط: يسأل كل مرشح، ويجدد بـcache: reload ما رده غير سليم وحده', async () => {
    const bad = `${origin}/assets/ExpertPortal-AbC.js`;
    const good = `${origin}/assets/index-Q.js`;
    const html = `${origin}/assets/ui-H.js`;
    const fetchImpl = vi.fn(async (url, init) => {
      if (init.cache === 'reload') return { ok: true, headers: new Headers({ 'content-type': 'application/javascript' }) };
      if (url === bad) return { ok: false, status: 404, headers: new Headers({ 'content-type': 'text/html' }) };
      if (url === html) return { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }) };
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/javascript' }) };
    });
    await refreshFailedAsset(safari, { fetchImpl, origin, candidates: [bad, good, html] });
    const reloads = fetchImpl.mock.calls.filter(([, i]) => i.cache === 'reload').map(([u]) => u);
    expect(reloads.sort()).toEqual([bad, html].sort());
    expect(fetchImpl).toHaveBeenCalledWith(good, { credentials: 'same-origin' });
    // شبكة مقطوعة: يُجدَّد (الطلب الأول رمى)، ولا يرمي أبدًا
    await expect(refreshFailedAsset(safari, { fetchImpl: () => Promise.reject(new TypeError('offline')), origin, candidates: [bad] })).resolves.toBeUndefined();
    await expect(refreshFailedAsset(safari, { fetchImpl: () => new Promise(() => {}), origin, candidates: [bad], timeoutMs: 5 })).resolves.toBeUndefined();
    expect(refreshFailedAsset(safari, { fetchImpl, origin, candidates: [] })).toBeNull();
  });
  it('retryImport يمرر دالة التحميل إلى إعادة التحميل، ويضع اسم القسم على الخطأ إن لم تُعد الصفحة', async () => {
    const reloadPage = vi.fn(() => false);
    const err = new TypeError('Importing a module script failed.');
    const failing = built("() => import('./screens/ExpertPortal.jsx')", () => Promise.reject(err));
    await expect(retryImport(failing, { reloadPage })).rejects.toBe(err);
    expect(reloadPage).toHaveBeenCalledWith({ error: err, load: failing });
    expect(err.chunk).toBe('expertportal');
  });
});

describe('المخرج الأخير: تحديث كامل', () => {
  it('hardReload يلغي عامل الخدمة ويحذف المخازن ويجدد الملفات ثم يفتح الرابط بمعامل جديد', async () => {
    const unregister = vi.fn(async () => true);
    const del = vi.fn(async () => true);
    const win = { location: { origin }, navigator: { serviceWorker: { getRegistrations: async () => [{ unregister }] } }, caches: { keys: async () => ['mi-leaders-a', 'mi-leaders-b'], delete: del } };
    const refresh = vi.fn(async () => {});
    const navigate = vi.fn();
    await hardReload({ href: `${origin}/?tab=expert&mi_reload=5`, navigate, now: 42, win, refresh });
    expect(unregister).toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith(null, { origin });
    const u = new URL(navigate.mock.calls[0][0]);
    expect(u.searchParams.get(FRESH_PARAM)).toBe('42');
    expect(u.searchParams.get('tab')).toBe('expert');
    expect(u.searchParams.has('mi_reload')).toBe(false);
  });
  it('بلا عامل خدمة ولا مخازن يفتح الرابط على أي حال', async () => {
    const navigate = vi.fn();
    await hardReload({ href: `${origin}/#/leaders`, navigate, now: 1, win: {}, refresh: () => { throw new Error('x'); } });
    expect(navigate).toHaveBeenCalledWith(`${origin}/?${FRESH_PARAM}=1#/leaders`);
  });
});
