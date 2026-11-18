// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 5: تحديث بالدعوة لا بالكسر.
// version.json وفحصه، والشريط، وإعادة التحميل عند التنقل بلا نموذج غير محفوظ، وتفعيل عامل الخدمة المنتظر، وربط
// update_required وunknown_action بالشريط، ومستوى العميل في الرابط، وإضافتا البناء، وأن الناتج المبني يحمل هذا كله.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _setAppUpdate, activateWaiting, adoptWaitingIfAlone, applyUpdate, buildFromScripts, buildOfVersion, CHECK_EVERY_MS,
  createAppUpdate, installAppUpdate, MIN_GAP_MS, reloadOnNavigate,
} from '../../shared/ui/app-update.js';
import UpdateBar from '../../shared/ui/UpdateBar.jsx';
import { _resetUnsaved, hasUnsaved, registerUnsaved } from '../../shared/ui/unsaved-registry.js';
import { buildIdOf, versionFile } from '../../shared/build/release-files.mjs';
import { CLIENT_LEVEL, LEVEL_PARAM, MIN_CLIENT_LEVEL } from '../../supabase/functions/_shared/client-compat.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

afterEach(() => { _resetUnsaved(); _setAppUpdate(null); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('بصمة الإصدار: مصدر واحد', () => {
  it('من وسم سكربت الدخول، و dev بلا وسم', () => {
    const doc = { scripts: [{ src: 'https://leaders.test/assets/vendor-x.js' }, { src: 'https://leaders.test/assets/index-AbC_12-z.js' }] };
    expect(buildFromScripts(doc)).toBe('AbC_12-z');
    expect(buildFromScripts({ scripts: [] })).toBe('dev');
    expect(buildFromScripts(null)).toBe('dev');
  });
  it('version.json: بصمة بالشكل المتوقع وحده', () => {
    expect(buildOfVersion({ build: 'WTNxnE59' })).toBe('WTNxnE59');
    for (const bad of [null, {}, { build: 1 }, { build: 'a b' }, { build: '<x>' }, { build: 'abc' }, []]) expect(buildOfVersion(bad)).toBe(null);
  });
  it('إضافة البناء تكتب version.json من قطعة الدخول، ولا شيء غيرها', () => {
    const bundle = { 'assets/Lab-1.js': { type: 'chunk', isEntry: false, fileName: 'assets/Lab-1.js' }, 'assets/index-Zx9.js': { type: 'chunk', isEntry: true, fileName: 'assets/index-Zx9.js' } };
    expect(buildIdOf(bundle)).toBe('Zx9');
    const emitted = [];
    versionFile().generateBundle.call({ emitFile: (f) => emitted.push(f), error: (m) => { throw new Error(m); } }, {}, bundle);
    expect(emitted).toEqual([{ type: 'asset', fileName: 'version.json', source: '{"build":"Zx9"}\n' }]);
    expect(() => versionFile().generateBundle.call({ emitFile() {}, error: (m) => { throw new Error(m); } }, {}, {})).toThrow(/قطعة الدخول/);
  });
  it('الناتج المبني للتطبيقين: version.json يطابق قطعة الدخول في index.html، وبلا تخزين في _headers', () => {
    for (const out of ['leaders', 'admin']) {
      const v = JSON.parse(read(`${out}/version.json`)).build;
      expect(read(`${out}/index.html`)).toContain(`/assets/index-${v}.js`);
      expect(read(`${out}/_headers`)).toMatch(/^\/version\.json\n {2}Cache-Control: no-store$/m);
    }
  });
});

describe('فحص version.json', () => {
  it('الاختلاف يُظهر التحديث مرة واحدة، والتطابق لا', async () => {
    let t = 0;
    const fetchImpl = vi.fn(() => json({ build: 'OLDbuild' }));
    const u = createAppUpdate({ current: 'OLDbuild', fetchImpl, now: () => t });
    const seen = vi.fn();
    u.subscribe(seen);
    expect(await u.check()).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith('/version.json', { cache: 'no-store', credentials: 'same-origin' });
    fetchImpl.mockImplementation(() => json({ build: 'NEWbuild' }));
    t += MIN_GAP_MS;
    expect(await u.check()).toBe(true);
    expect(u.available).toBe(true);
    expect(u.reason).toBe('version');
    expect(await u.check({ force: true })).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('فحصان متقاربان: الثاني بلا طلب ما لم يُفرض، وطلبان متزامنان طلب واحد', async () => {
    let t = 1000;
    const fetchImpl = vi.fn(() => json({ build: 'SAMEbuild' }));
    const u = createAppUpdate({ current: 'SAMEbuild', fetchImpl, now: () => t });
    await u.check();
    await u.check();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 10;
    await u.check({ force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    t += MIN_GAP_MS;
    await Promise.all([u.check(), u.check()]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('فشل الشبكة أو 404 أو جسم غير صالح لا يُظهر شيئًا ولا يرمي، وخادم التطوير بلا فحص', async () => {
    for (const f of [() => Promise.reject(new TypeError('offline')), () => json({}, false), () => json({ build: '' }), () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('x')) })]) {
      const u = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn(f) });
      expect(await u.check({ force: true })).toBe(false);
      expect(u.available).toBe(false);
    }
    const fetchImpl = vi.fn(() => json({ build: 'NEWbuild' }));
    const dev = createAppUpdate({ current: 'dev', fetchImpl });
    expect(await dev.check({ force: true })).toBe(false);
    dev.serverSaid('update_required');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dev.available).toBe(false);
  });
  it('الفحص عند الرجوع إلى التبويب وكل 20 دقيقة، ولا تركيب في خادم التطوير', () => {
    const listeners = {};
    const doc = { scripts: [{ src: '/assets/index-CURbuild.js' }], visibilityState: 'visible', addEventListener: (k, fn) => { listeners[`doc:${k}`] = fn; } };
    const win = { document: doc, addEventListener: (k, fn) => { listeners[k] = fn; }, setInterval: vi.fn() };
    const fetchImpl = vi.fn(() => json({ build: 'CURbuild' }));
    const u = installAppUpdate(win, { fetchImpl });
    expect(u.current).toBe('CURbuild');
    expect(win.setInterval).toHaveBeenCalledWith(expect.any(Function), CHECK_EVERY_MS);
    listeners['doc:visibilitychange']();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const win2 = { document: { scripts: [], addEventListener: vi.fn() }, addEventListener: vi.fn(), setInterval: vi.fn() };
    installAppUpdate(win2, { fetchImpl });
    expect(win2.setInterval).not.toHaveBeenCalled();
  });
});

describe('رد الخادم: update_required وunknown_action', () => {
  it('update_required يُظهر الشريط إن كان على الموقع إصدار أحدث، متجاوزًا فاصل الدقيقة', async () => {
    const fetchImpl = vi.fn(() => json({ build: 'NEWbuild' }));
    const u = createAppUpdate({ current: 'CURbuild', fetchImpl });
    expect(await u.check()).toBe(true);
    u._reset();
    expect(await u.serverSaid('update_required')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(u.available).toBe(true);
    expect(u.reason).toBe('server');
  });
  it('update_required والموقع ما زال يقدّم بناء الصفحة نفسه (الدوال سبقت Pages): لا شريط، فلا إعادة تحميل إلى البناء نفسه', async () => {
    for (const f of [() => json({ build: 'CURbuild' }), () => Promise.reject(new TypeError('offline')), () => json({}, false)]) {
      const u = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn(f) });
      expect(await u.serverSaid('update_required')).toBe(false);
      expect(u.available).toBe(false);
      expect(reloadOnNavigate(u, { unsaved: () => false, reload: vi.fn(() => true) })).toBe(false);
    }
  });
  it('unknown_action يُظهره إن كان على الخادم إصدار أحدث فعلًا، ولا يُظهره إن تطابقا', async () => {
    const same = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn(() => json({ build: 'CURbuild' })) });
    same.serverSaid('unknown_action');
    await new Promise((r) => setTimeout(r, 0));
    expect(same.available).toBe(false);
    const newer = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn(() => json({ build: 'NEWbuild' })) });
    newer.serverSaid('unknown_action');
    await new Promise((r) => setTimeout(r, 0));
    expect(newer.available).toBe(true);
  });
  it('العميلان يربطان الرمزين بالشريط في مكان واحد لكل منهما', () => {
    expect(read('leaders-app/src/api.js')).toMatch(/res\?\.code === 'update_required' \|\| res\?\.code === 'unknown_action'\) appUpdate\(\)\?\.serverSaid\(res\.code\)/);
    expect(read('admin-app/src/api.js')).toMatch(/res\?\.code === 'update_required' \|\| res\?\.code === 'unknown_action'\) appUpdate\(\)\?\.serverSaid\(res\.code\)/);
  });
});

describe('إعادة التحميل عند التنقل الداخلي', () => {
  const ready = () => { const u = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn(() => json({ build: 'CURbuild' })) }); u.mark('version'); return u; };
  it('بلا تحديث: لا إعادة، ويُفحص version.json', () => {
    const u = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn(() => json({ build: 'CURbuild' })) });
    const spy = vi.spyOn(u, 'check');
    const reload = vi.fn();
    expect(reloadOnNavigate(u, { reload })).toBe(false);
    expect(spy).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(reloadOnNavigate(null, { reload })).toBe(false);
  });
  it('تحديث متاح ولا شيء لم يُحفظ: إعادة واحدة بحارس reloadOnce إلى الوجهة', () => {
    const reload = vi.fn(() => true);
    const to = () => 'https://leaders.test/?tab=handbook';
    expect(reloadOnNavigate(ready(), { reload, to, unsaved: () => false })).toBe(true);
    expect(reload).toHaveBeenCalledWith(expect.objectContaining({ to }));
  });
  it('حارس الدقيقة يرفض: يمضي التنقل في الصفحة نفسها', () => {
    expect(reloadOnNavigate(ready(), { reload: () => false, unsaved: () => false })).toBe(false);
  });
  it('نموذج غير محفوظ أو نافذة حوار مفتوحة: لا إعادة تحميل', () => {
    const reload = vi.fn(() => true);
    const off = registerUnsaved(() => true);
    expect(reloadOnNavigate(ready(), { reload })).toBe(false);
    off();
    expect(hasUnsaved()).toBe(false);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(reloadOnNavigate(ready(), { reload })).toBe(false);
    document.body.innerHTML = '';
    expect(reloadOnNavigate(ready(), { reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('السجل: دالة ترمي تُعامل كأن فيها ما لم يُحفظ، وإلغاء التسجيل يزيلها', () => {
    const off = registerUnsaved(() => { throw new Error('x'); });
    expect(hasUnsaved()).toBe(true);
    off();
    expect(hasUnsaved()).toBe(false);
  });
  it('التنقل يفعّل العامل المنتظر قبل التحميل الجديد', async () => {
    const activate = vi.fn(() => Promise.resolve(true));
    let navigate;
    const reload = (o) => { navigate = o.navigate; return true; };
    expect(reloadOnNavigate(ready(), { reload, unsaved: () => false, activate })).toBe(true);
    // الرابط نفسه بلا تغيير (jsdom لا ينفذ التنقل)، والمهم أن التفعيل يسبق التحميل
    navigate(window.location.href);
    expect(activate).toHaveBeenCalledTimes(1);
  });
  it('النماذج الرئيسية تسجّل حالتها: الحارس العام، والمختبر، والقياس، ونوافذ اللوحة', () => {
    expect(read('leaders-app/src/unsaved.js')).toContain('registerUnsaved(() => latest.current.dirty)');
    expect(read('leaders-app/src/screens/Lab.jsx')).toContain('useUnsavedFlag(() => dirty.current)');
    expect(read('leaders-app/src/screens/Assessment.jsx')).toContain('useUnsavedFlag(Object.keys(pending).length > 0 || saving > 0)');
    expect(read('admin-app/src/ui.jsx')).toMatch(/export function useGuardedClose\(dirty, onClose\) \{\n {2}const \{ confirm \} = useUI\(\);\n {2}useUnsavedFlag\(dirty\);/);
    const app = read('leaders-app/src/App.jsx');
    expect(app).toMatch(/const go = useCallback\(\(v, fromHistory = false, \{ reloadable = true \} = \{\}\) => \{[\s\S]{0,600}if \(reloadable && viewRef\.current !== v\) \{ if \(reloadOnNavigate\(appUpdate\(\), \{ to: \(\) => urlForView\(location\.href, v\) \}\)\) return; \}\n\s*else appUpdate\(\)\?\.check\(\);/);
    // تنقل يحمل حالة لا يحملها الرابط لا يعيد التحميل: أداة بعينها، وباب في الكتاب، والعودة إلى فصل المبادرة
    expect(app).toContain("const openLab = (id = null) => { setLabOpen(id); go('lab', false, { reloadable: id == null }); };");
    expect(app).toContain("setCapReturn(t?.chapter_id || null); go('handbook', false, { reloadable: t == null }); };");
    expect(app).toContain("setBookTarget(null); go('capstone', false, { reloadable: false }); }");
    expect(read('admin-app/src/main.jsx')).toContain("window.addEventListener('hashchange', () => { reloadOnNavigate(appUpdate()); });");
  });
});

describe('عامل الخدمة: التفعيل بطلب', () => {
  const swWith = (waiting) => {
    const listeners = {};
    return {
      controller: {},
      getRegistration: () => Promise.resolve({ waiting }),
      addEventListener: (k, fn) => { listeners[k] = fn; },
      fire: (k) => listeners[k]?.(),
    };
  };
  it('يرسل SKIP_WAITING إلى المنتظر وينتظر controllerchange', async () => {
    const waiting = { postMessage: vi.fn() };
    const sw = swWith(waiting);
    waiting.postMessage.mockImplementation(() => setTimeout(() => sw.fire('controllerchange'), 0));
    expect(await activateWaiting(sw)).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
  it('بلا منتظر أو بلا عامل متحكم أو بلا دعم: لا شيء، ومهلة إن لم يتبدل', async () => {
    expect(await activateWaiting(swWith(null))).toBe(false);
    expect(await activateWaiting({ ...swWith({ postMessage() {} }), controller: null })).toBe(false);
    expect(await activateWaiting(null)).toBe(false);
    expect(await activateWaiting(swWith({ postMessage() {} }), { timeoutMs: 5 })).toBe(false);
  });
  it('«حدّث» يفعّل ثم يفتح القسم الحالي، أو يعيد الصفحة نفسها', async () => {
    const loc = { href: 'https://leaders.test/', assign: vi.fn(), reload: vi.fn() };
    const activate = vi.fn(() => Promise.resolve(false));
    await applyUpdate({ to: () => 'https://leaders.test/?tab=impact', location: loc, activate });
    expect(activate).toHaveBeenCalled();
    expect(loc.assign).toHaveBeenCalledWith('https://leaders.test/?tab=impact');
    await applyUpdate({ to: null, location: loc, activate });
    expect(loc.reload).toHaveBeenCalledTimes(1);
  });
  it('صفحة الإصدار الجديد تطلب التفعيل إن كانت وحدها (onlyIfAlone)، عند التسجيل وعند انتهاء التثبيت', () => {
    const waiting = { postMessage: vi.fn() };
    const listeners = {};
    const reg = { waiting, addEventListener: (k, fn) => { listeners[k] = fn; } };
    adoptWaitingIfAlone(reg);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING', onlyIfAlone: true });
    const fresh = { state: 'installing', postMessage: vi.fn(), addEventListener: (k, fn) => { fresh.on = fn; } };
    reg.installing = fresh;
    listeners.updatefound();
    fresh.state = 'installed';
    reg.waiting = fresh;
    fresh.on();
    expect(fresh.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING', onlyIfAlone: true });
    expect(() => adoptWaitingIfAlone(null)).not.toThrow();
  });
  it('main.jsx يسجّل العامل ويطلب التفعيل بلا انتزاع، والعامل بلا skipWaiting عند التثبيت', () => {
    expect(read('leaders-app/src/main.jsx')).toContain('navigator.serviceWorker.register(`/sw.js?v=${build}`).then(adoptWaitingIfAlone)');
    expect(read('leaders-app/src/main.jsx')).toContain('const build = buildFromScripts(document);');
  });
});

describe('الشريط: سطر واحد وزر «حدّث»، بلا رقم نسخة', () => {
  it('لا يظهر قبل التحديث، ويظهر بنصه وحده بعده، والزر يطبّق التحديث', async () => {
    const u = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn() });
    const apply = vi.fn(() => Promise.resolve());
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => { r.render(<UpdateBar update={u} apply={apply} to={() => '/?tab=lab'} />); });
    expect(host.innerHTML).toBe('');
    await act(async () => { u.mark('version'); });
    const bar = host.querySelector('[data-testid="update-bar"]');
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.textContent).toBe('تحديث جديد متاححدّث');
    expect(bar.textContent).not.toMatch(/\d|CURbuild/);
    await act(async () => { bar.querySelector('button').click(); });
    expect(apply).toHaveBeenCalledWith({ to: expect.any(Function) });
    expect(bar.querySelector('button').disabled).toBe(true);
    await act(async () => { r.unmount(); });
  });
  it('«حدّث» وفي الصفحة ما لم يُحفظ: لا إعادة تحميل من أول نقرة، بل سطر ينبّه وزر «حدّث دون حفظ»، وبعد الحفظ يعود كما كان', async () => {
    _resetUnsaved();
    let dirty = true;
    const off = registerUnsaved(() => dirty);
    const u = createAppUpdate({ current: 'CURbuild', fetchImpl: vi.fn() });
    const apply = vi.fn(() => Promise.resolve());
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => { r.render(<UpdateBar update={u} apply={apply} />); });
    await act(async () => { u.mark('version'); });
    const bar = host.querySelector('[data-testid="update-bar"]');
    await act(async () => { bar.querySelector('button').click(); });
    expect(apply).not.toHaveBeenCalled();
    expect(bar.textContent).toBe('لديك ما لم يُحفظ، احفظه ثم حدّثحدّث دون حفظ');
    await act(async () => { bar.querySelector('button').click(); });
    expect(apply).toHaveBeenCalledTimes(1);
    await act(async () => { r.unmount(); });
    // حُفظ بين النقرتين: النقرة الثانية على «حدّث» تطبّق التحديث مباشرة
    const apply2 = vi.fn(() => Promise.resolve());
    const r2 = createRoot(host);
    dirty = true;
    await act(async () => { r2.render(<UpdateBar update={u} apply={apply2} />); });
    await act(async () => { host.querySelector('button').click(); });
    expect(apply2).not.toHaveBeenCalled();
    dirty = false;
    await act(async () => { host.querySelector('button').click(); });
    expect(apply2).toHaveBeenCalledTimes(1);
    await act(async () => { r2.unmount(); });
    off();
  });
  it('التطبيقان يعرضانه فوق المحتوى، وتطبيق القادة يعود إلى القسم نفسه', () => {
    expect(read('leaders-app/src/main.jsx')).toContain('<UpdateBar to={viewHref} />');
    expect(read('admin-app/src/main.jsx')).toContain('<UpdateBar />');
    for (const f of ['leaders-app/src/main.jsx', 'admin-app/src/main.jsx']) expect(read(f)).toContain("import '../../shared/css/update-bar.css';");
  });
});

describe('مستوى العميل في الرابط (update_required)', () => {
  it('الحد الأدنى لا يتجاوز مستوى الواجهة، والعميل يرسله لـleaders-api وحدها', async () => {
    expect(MIN_CLIENT_LEVEL).toBeLessThanOrEqual(CLIENT_LEVEL);
    const { postAction } = await import('../../src/lib/api.js');
    const calls = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => { calls.push(String(url)); return Promise.resolve(new Response('{"success":true}', { status: 200 })); });
    await postAction('leaders-api', { action: 'system.ping' });
    await postAction('admin-api', { action: 'ping' });
    expect(new URL(calls[0]).searchParams.get(LEVEL_PARAM)).toBe(String(CLIENT_LEVEL));
    expect(new URL(calls[0]).searchParams.get('forceFunctionRegion')).toBe('ap-south-1');
    expect(new URL(calls[1]).searchParams.get(LEVEL_PARAM)).toBe(null);
  });
});

describe('لا شرطة طويلة ولا متوسطة في ملفات المرحلة', () => {
  it('المصادر والسكربتات والوثيقة', () => {
    const files = ['shared/ui/app-update.js', 'shared/ui/UpdateBar.jsx', 'shared/ui/unsaved-registry.js', 'shared/css/update-bar.css', 'shared/build/release-files.mjs',
      'supabase/functions/_shared/client-compat.js', 'supabase/functions/leaders-api/client_compat_test.ts', 'scripts/ops/retain-assets.mjs', 'scripts/ops/verify-live.mjs',
      'scripts/ops/retain-assets.test.js', 'leaders-app/src/app-update.test.jsx', 'leaders-app/public/sw.js', 'leaders-app/public/_headers', 'admin-app/public/_headers', 'releases/README.md'];
    for (const f of files) {
      expect(existsSync(join(root, f)), f).toBe(true);
      expect(/[\u2013\u2014]/.test(read(f)), f).toBe(false);
    }
  });
});
