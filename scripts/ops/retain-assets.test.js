// الاحتفاظ بملفات الإصدارات السابقة (المرحلة 5 البند 6، الخيار أ) والتحقق بعد الترقية (البند 8): منطق القرار نقي، وملفات
// السير تشغّل الفحصين حيث يجب، والمجلد المودع يطابق قائمته والناتج المبني يحمله.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { daysBetween, expired, KEEP_DAYS, missingFromNext, ownFromBuilt, planRetention, storeProblems } from './retain-assets.mjs';
import { blocked, checkFiles, checkFilesSettled, fetchSite, missingIs404, SITES, typeOk, waitForBuild } from './verify-live.mjs';
import { decide } from './ci-changes.mjs';
import { builtListFile, ownAssetsOf } from '../../shared/build/release-files.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('خطة الاحتفاظ', () => {
  const today = '2026-11-18';
  it('يحتفظ بما يقدّمه الإصدار المرقّى ولا يبنيه المصدر الحالي، بتاريخ اليوم', () => {
    const p = planRetention({ live: ['index-A.js', 'Lab-A.js', 'react-X.js', '404.html'], own: ['index-B.js', 'Lab-B.js', 'react-X.js'], fixed: ['404.html'], today });
    expect(p.add).toEqual(['Lab-A.js', 'index-A.js']);
    expect(p.retained).toEqual({ 'Lab-A.js': today, 'index-A.js': today });
    expect(p.drop).toEqual([]);
  });
  it('ما في القائمة يبقى بتاريخه الأول، وما مضى عليه أكثر من 14 يومًا يُحذف', () => {
    const retained = { 'old-1.js': '2026-11-01', 'mid-1.js': '2026-11-07', 'new-1.js': '2026-11-17' };
    const p = planRetention({ live: ['index-B.js', 'new-1.js', 'mid-1.js'], liveRetained: { 'new-1.js': '2026-11-17', 'mid-1.js': '2026-11-07' }, own: ['index-C.js'], retained, today: '2026-11-20' });
    expect(p.retained).toEqual({ 'index-B.js': '2026-11-20', 'mid-1.js': '2026-11-07', 'new-1.js': '2026-11-17' });
    expect(p.drop).toEqual(['old-1.js']);
    expect(p.add).toEqual(['index-B.js']);
    // اليوم الخامس عشر: mid-1 انقضت مدته وإن كان الإصدار المرقّى يحمله نسخةً من مجلده
    const later = planRetention({ live: ['index-B.js', 'mid-1.js'], liveRetained: { 'mid-1.js': '2026-11-07' }, own: ['index-C.js'], retained: p.retained, today: '2026-11-22' });
    expect(later.drop).toEqual(['mid-1.js']);
    expect(Object.keys(later.retained)).toEqual(['index-B.js', 'new-1.js']);
  });
  it('ما بناه مصدر الإصدار المرقّى نفسه يبقى ما دام مرقّى، وعدّه يبدأ من آخر تحديث رآه حيًا لا من أول تحديث في الطلب', () => {
    const p = planRetention({ live: ['index-A.js'], own: ['index-B.js'], retained: { 'index-A.js': '2026-10-01' }, today });
    expect(p.retained).toEqual({ 'index-A.js': today });
    expect(p.drop).toEqual([]);
    expect(p.add).toEqual([]);
    // طلب بقي مفتوحًا 10 أيام: تحديثه الأخير يجدد التاريخ، فبعد ترقيته يبقى الملف 14 يومًا كاملة
    const first = planRetention({ live: ['index-A.js'], own: ['index-B.js'], today: '2026-11-01' });
    const last = planRetention({ live: ['index-A.js'], own: ['index-B.js'], retained: first.retained, today: '2026-11-11' });
    expect(last.retained).toEqual({ 'index-A.js': '2026-11-11' });
    const after = planRetention({ live: ['index-B.js', 'index-A.js'], liveRetained: last.retained, own: ['index-C.js'], retained: last.retained, today: '2026-11-25' });
    expect(after.retained['index-A.js']).toBe('2026-11-11');
    expect(after.drop).toEqual([]);
  });
  it('ما يبنيه المصدر من قائمة آخر بناء، ولو كان اسمه في retained.json (تراجع)، فلا يُحذف من الناتج', () => {
    const own = ownFromBuilt({ own: ['index-B.js', 'Lab-A.js'] }, ['index-B.js', 'Lab-A.js', 'Old-1.js', '404.html'], { 'Lab-A.js': '2026-11-01', 'Old-1.js': '2026-11-01' }, ['404.html']);
    expect(own).toEqual(['Lab-A.js', 'index-B.js']);
    const p = planRetention({ live: ['index-A.js'], own, retained: { 'Lab-A.js': '2026-11-01', 'Old-1.js': '2026-11-01' }, today: '2026-11-20' });
    expect(p.drop).toEqual(['Lab-A.js', 'Old-1.js']);
    expect(own.includes('Lab-A.js')).toBe(true);
    expect(() => ownFromBuilt(null, [])).toThrow(/شغّل npm run leaders:build/);
    expect(() => ownFromBuilt({ own: ['index-B.js'] }, ['index-C.js'])).toThrow(/لا يطابق آخر بناء/);
  });
  it('ملف عاد يبنيه المصدر (تراجع) يخرج من القائمة، وملفات public/assets لا تُحتفظ', () => {
    const p = planRetention({ live: ['Lab-A.js'], own: ['Lab-A.js', '404.html'], retained: { 'Lab-A.js': today, '404.html': today }, fixed: ['404.html'], today });
    expect(p.retained).toEqual({});
    expect(p.drop).toEqual(['404.html', 'Lab-A.js']);
  });
  it('من قائمة الإصدار المرقّى يُورث تاريخها (طلب متفرع قبل تحديث المجلد)', () => {
    const p = planRetention({ live: ['x.js', 'index-A.js'], liveRetained: { 'x.js': '2026-11-10' }, own: ['index-B.js'], retained: {}, today });
    expect(p.retained).toEqual({ 'index-A.js': today, 'x.js': '2026-11-10' });
  });
  it('الأيام والانقضاء', () => {
    expect(daysBetween('2026-11-01', '2026-11-15')).toBe(14);
    expect(expired('2026-11-01', '2026-11-15')).toBe(false);
    expect(expired('2026-11-01', '2026-11-16')).toBe(true);
    expect(expired('bad', '2026-11-16')).toBe(false);
    expect(KEEP_DAYS).toBe(14);
  });
});

describe('فحص ملفات الإصدار المرقّى في الناتج الجديد', () => {
  it('الغائب يُذكر، إلا ما انقضت مدته في قائمة الإصدار المرقّى وملفات public', () => {
    const missing = missingFromNext({
      live: ['index-A.js', 'Lab-A.js', 'old.js', 'fresh.js', '404.html'], liveRetained: { 'old.js': '2026-11-01', 'fresh.js': '2026-11-15' },
      next: ['index-B.js', 'Lab-A.js'], fixed: ['404.html'], today: '2026-11-20',
    });
    expect(missing).toEqual(['fresh.js', 'index-A.js']);
  });
  it('المجلد يطابق قائمته', () => {
    expect(storeProblems({ 'a.js': '2026-11-18' }, ['a.js'])).toEqual([]);
    expect(storeProblems({ 'a.js': '2026-11-18', 'b.js': 'x' }, ['a.js', 'c.js'])).toEqual([
      'b.js: تاريخ غير صالح x', 'b.js: في retained.json وليس في المجلد', 'c.js: في المجلد وليس في retained.json',
    ]);
  });
  it('المجلد المودع للتطبيقين يطابق قائمته، وكل ملف فيه منسوخ إلى الناتج المبني بمحتواه', () => {
    for (const out of ['leaders', 'admin']) {
      const list = JSON.parse(read(`releases/${out}/retained.json`));
      const files = readdirSync(join(root, 'releases', out, 'assets'));
      expect(storeProblems(list, files), out).toEqual([]);
      for (const n of files) expect(readFileSync(join(root, out, 'assets', n)).equals(readFileSync(join(root, 'releases', out, 'assets', n))), n).toBe(true);
      expect(Object.keys(list)).toEqual([...Object.keys(list)].sort());
    }
  });
  it('releases/ في مجال التطبيق في CI (لا «كل شيء»)', () => {
    expect(decide(['releases/leaders/retained.json']).leaders).toBe(true);
    expect(decide(['releases/leaders/retained.json']).admin).toBe(false);
    expect(decide(['releases/admin/assets/x.js']).admin).toBe(true);
    expect(decide(['releases/admin/assets/x.js']).functions).toBe(false);
  });
});

describe('التحقق بعد الترقية', () => {
  const site = SITES.leaders;
  const resp = (status, { ct = '', server = '', body = null } = {}) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => ({ 'content-type': ct, server }[k.toLowerCase()] || null) },
    json: () => Promise.resolve(body), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
  it('نوع الرد يطابق الامتداد', () => {
    expect(typeOk('a.js', 'application/javascript; charset=utf-8')).toBe(true);
    expect(typeOk('a.js', 'text/javascript')).toBe(true);
    expect(typeOk('a.css', 'text/css')).toBe(true);
    expect(typeOk('a.js', 'text/html')).toBe(false);
    expect(typeOk('a.css', 'application/javascript')).toBe(false);
  });
  it('403 من Cloudflare يحوّل الفحص إلى pages.dev ويبقى عليه', async () => {
    const fetchImpl = vi.fn((url) => Promise.resolve(url.startsWith(site.origin) ? resp(403, { server: 'cloudflare' }) : resp(200, { ct: 'text/javascript' })));
    const state = {};
    const a = await fetchSite(site, '/assets/x.js', { fetchImpl, state });
    expect(a.base).toBe(site.fallback);
    const b = await fetchSite(site, '/assets/y.js', { fetchImpl, state });
    expect(b.base).toBe(site.fallback);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(blocked(resp(403, { server: 'nginx' }))).toBe(false);
  });
  it('ينتظر version.json حتى تظهر البصمة الجديدة، ويفشل بعد المهلة بآخر ما رُئي', async () => {
    let n = 0, t = 0;
    const fetchImpl = vi.fn(() => Promise.resolve(resp(200, { body: { build: ++n >= 3 ? 'NEW' : 'OLD' } })));
    const ok = await waitForBuild(site, 'NEW', { fetchImpl, sleep: async (ms) => { t += ms; }, now: () => t, waitMs: 900_000, everyMs: 30_000 });
    expect(ok).toMatchObject({ ok: true, seen: 'NEW' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    t = 0;
    const bad = await waitForBuild(site, 'NEVER', { fetchImpl: () => Promise.resolve(resp(200, { body: { build: 'OLD' } })), sleep: async (ms) => { t += ms; }, now: () => t, waitMs: 90_000, everyMs: 30_000 });
    expect(bad).toMatchObject({ ok: false, seen: 'OLD' });
  });
  it('كل ملف 200 بنوعه، وما سوى ذلك يُذكر', async () => {
    const map = { 'a.js': resp(200, { ct: 'text/javascript' }), 'b.css': resp(200, { ct: 'text/css' }), 'c.js': resp(200, { ct: 'text/html' }), 'd.js': resp(404, { ct: 'text/html' }) };
    const fetchImpl = (url) => Promise.resolve(map[url.split('/assets/')[1]]);
    expect(await checkFiles(site, Object.keys(map), { fetchImpl })).toEqual(['c.js: نوعه text/html لا JavaScript', 'd.js: HTTP 404']);
  });
  it('ملف تأخر توزيعه بعد الترقية يُعاد طلبه وحده، وما بقي فاشلًا بعد الجولات مشكلة حقيقية', async () => {
    const calls = {};
    const fetchImpl = (url) => {
      const n = url.split('/assets/')[1];
      calls[n] = (calls[n] || 0) + 1;
      if (n === 'late.js') return Promise.resolve(calls[n] >= 3 ? resp(200, { ct: 'text/javascript' }) : resp(404, { ct: 'text/html' }));
      if (n === 'gone.js') return Promise.resolve(resp(404, { ct: 'text/html' }));
      return Promise.resolve(resp(200, { ct: 'text/javascript' }));
    };
    let slept = 0;
    const out = await checkFilesSettled(site, ['ok.js', 'late.js', 'gone.js'], { fetchImpl, rounds: 4, everyMs: 30_000, sleep: async (ms) => { slept += ms; } });
    expect(out).toEqual(['gone.js: HTTP 404']);
    expect(calls).toEqual({ 'ok.js': 1, 'late.js': 3, 'gone.js': 4 });
    expect(slept).toBe(90_000);
    slept = 0;
    expect(await checkFilesSettled(site, ['ok.js'], { fetchImpl, sleep: async (ms) => { slept += ms; } })).toEqual([]);
    expect(slept).toBe(0);
  });
  it('الملف الغائب 404 لا صفحة التطبيق (تحذير)', async () => {
    expect(await missingIs404(site, { fetchImpl: () => Promise.resolve(resp(404)) })).toBe(null);
    expect(await missingIs404(site, { fetchImpl: () => Promise.resolve(resp(200, { ct: 'text/html' })) })).toMatch(/200 بنوع text\/html/);
  });
});

describe('ملفات السير', () => {
  const ci = yaml.load(read('.github/workflows/ci.yml'));
  const steps = (job) => ci.jobs[job].steps.map((s) => s.run || '');
  it('الفحص في وظيفة web وفي deploy قبل نشر الدوال، والتحقق بعد ترقية release', () => {
    expect(steps('web')).toContain('node scripts/ops/retain-assets.mjs check');
    const d = steps('deploy');
    const at = (re) => d.findIndex((r) => re.test(r));
    expect(at(/retain-assets\.mjs check/)).toBeGreaterThan(-1);
    expect(at(/retain-assets\.mjs check/)).toBeLessThan(at(/supabase functions deploy/));
    expect(at(/verify-live\.mjs --wait=900/)).toBe(at(/git push --force origin "\$GITHUB_SHA:refs\/heads\/release"/) + 1);
    expect(ci.jobs.deploy['timeout-minutes']).toBeGreaterThanOrEqual(50);
  });
  it('سير التراجع الموحد يتحقق من الواجهة المنشورة بشجرة الهدف', () => {
    const rb = yaml.load(read('.github/workflows/deploy-leaders-api.yml'));
    const runs = Object.values(rb.jobs).flatMap((j) => j.steps.map((s) => s.run || ''));
    expect(runs.some((r) => r.includes('node scripts/ops/verify-live.mjs --wait=900 --tree='))).toBe(true);
  });
  it('الإضافتان في إعداد البناء للتطبيقين، والمجلد له وثيقة', () => {
    for (const [app, out] of [['leaders-app', 'leaders'], ['admin-app', 'admin']]) {
      expect(read(`${app}/vite.config.js`)).toContain(`plugins: [react(), versionFile(), assetWorker(), retainedAssets(fileURLToPath(new URL('../releases/${out}', import.meta.url)))]`);
    }
    expect(existsSync(join(root, 'releases/README.md'))).toBe(true);
  });
  it('البناء يكتب قائمة ما بناه خارج الناتج، بأسماء assets/ وحدها', () => {
    expect(builtListFile(join(root, 'releases', 'leaders'))).toBe(join(root, 'node_modules', '.cache', 'mi-release-files', 'leaders.json'));
    expect(ownAssetsOf({ 'index.html': {}, 'version.json': {}, 'assets/index-B.js': {}, 'assets/Lab-A.js': {}, 'assets/x/y.js': {} })).toEqual(['Lab-A.js', 'index-B.js']);
  });
});
