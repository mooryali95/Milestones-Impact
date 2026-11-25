// عامل Pages لملفات /assets/ (shared/build/asset-worker.js)، وتجديد ملفات القسم في Safari بلا رابط في الخطأ، والمخرج الأخير
// (حادث الخبير على iPhone، 2026-11-25: 404 مخزن سنة تحت ترويسة immutable، وSafari لا يذكر الرابط)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import worker, { assetResponse, IMMUTABLE } from '../../shared/build/asset-worker.js';
import { ASSET_ROUTES } from '../../shared/build/release-files.mjs';
import { chunkCandidates, chunkName, FRESH_PARAM, hardReload, refreshFailedAsset, retryImport } from '../../shared/ui/lazy-retry.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const origin = 'https://leaders.sunkvalue.com';
const req = (path, method = 'GET') => new Request(`${origin}${path}`, { method });
// دالة تحميل بنص البناء (vitest يعيد كتابة import( في نص الاختبار نفسه)
const built = (src, impl = () => {}) => Object.assign(impl, { toString: () => src });
const assets = (res) => ({ ASSETS: { fetch: vi.fn(async () => res) } });

describe('عامل /assets/: الغائب لا يُخزَّن، والموجود كما هو', () => {
  it('404 من خادم الملفات (بترويسة immutable من _headers) يصير 404 بـno-store', async () => {
    const res = new Response('<p>الملف غير موجود.</p>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': IMMUTABLE, etag: '"x"' } });
    const out = await worker.fetch(req('/assets/ExpertPortal-OLD.js'), assets(res), {});
    expect(out.status).toBe(404);
    expect(out.headers.get('cache-control')).toBe('no-store');
    expect(out.headers.get('etag')).toBeNull();
    expect(out.headers.get('content-type')).toMatch(/^text\/html/);
    expect(out.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('صفحة HTML برمز 200 تحت اسم ملف JS أو CSS تُعامل غائبة: 404 بلا تخزين', async () => {
    for (const p of ['/assets/a-1.js', '/assets/a-1.css']) {
      const res = new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html', 'cache-control': IMMUTABLE } });
      const out = await worker.fetch(req(p), assets(res), {});
      expect(out.status).toBe(404);
      expect(out.headers.get('cache-control')).toBe('no-store');
    }
  });
  it('الملف الموجود بترويسات _headers يُرد كما هو (الكائن نفسه)', async () => {
    const res = new Response('export{}', { status: 200, headers: { 'content-type': 'application/javascript', 'cache-control': IMMUTABLE, 'x-content-type-options': 'nosniff' } });
    const out = await worker.fetch(req('/assets/index-abc.js'), assets(res), {});
    expect(out).toBe(res);
  });
  it('الملف الموجود بلا ترويسات _headers (إن لم يطبقها خادم الملفات في العامل) يأخذ الثبات سنة وnosniff', async () => {
    const res = new Response('export{}', { status: 200, headers: { 'content-type': 'application/javascript' } });
    const out = await worker.fetch(req('/assets/index-abc.js'), assets(res), {});
    expect(out.status).toBe(200);
    expect(out.headers.get('cache-control')).toBe(IMMUTABLE);
    expect(out.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await out.text()).toBe('export{}');
  });
  it('304 يبقى 304، والصورة 200 بنوعها لا تُمس، وHEAD للغائب بلا جسم', async () => {
    const r304 = new Response(null, { status: 304, headers: { 'cache-control': IMMUTABLE, 'x-content-type-options': 'nosniff' } });
    expect((await worker.fetch(req('/assets/a.js'), assets(r304), {})).status).toBe(304);
    const png = new Response('x', { status: 200, headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE, 'x-content-type-options': 'nosniff' } });
    expect(await worker.fetch(req('/assets/logo.png'), assets(png), {})).toBe(png);
    const head = assetResponse(req('/assets/x.js', 'HEAD'), new Response(null, { status: 404, headers: { 'cache-control': IMMUTABLE } }));
    expect(head.status).toBe(404);
    expect(head.headers.get('cache-control')).toBe('no-store');
  });
  it('مسار خارج /assets/ (لا يصل أصلًا بـ_routes.json) يمر كما هو، وpassThroughOnException مفعّل', async () => {
    const res = new Response('x', { status: 404 });
    const ctx = { passThroughOnException: vi.fn() };
    expect(await worker.fetch(req('/org'), assets(res), ctx)).toBe(res);
    expect(ctx.passThroughOnException).toHaveBeenCalled();
  });
  it('الناتج المبني للتطبيقين يحمل العامل نفسه و_routes.json المحصور في /assets/*', () => {
    const src = read('shared/build/asset-worker.js');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(ASSET_ROUTES).toEqual({ version: 1, include: ['/assets/*'], exclude: [] });
    for (const app of ['leaders', 'admin']) {
      expect(read(`${app}/_worker.js`)).toBe(src);
      expect(JSON.parse(read(`${app}/_routes.json`))).toEqual(ASSET_ROUTES);
      expect(read(`${app}-app/vite.config.js`)).toContain('assetWorker()');
    }
  });
});

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
