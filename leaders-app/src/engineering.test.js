// حراس المرحلة ي (الهندسة والاختبارات): لا خطوط خارجية، عامل خدمة ببصمة البناء، تحميل كسول،
// فحص أنواع كل الدوال واختبارات Deno وسير التكامل في CI، وكل متغير بيئة في الدوال موثّق في docs/SECRETS.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('الخطوط والعامل والتحميل', () => {
  it('لا طلب إلى Google Fonts في التطبيقين، والخطوط محلية في public/fonts', () => {
    for (const app of ['leaders-app', 'admin-app']) {
      const html = read(`${app}/index.html`);
      expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      expect(html).toContain('/fonts/fonts.css');
      expect(read(`${app}/public/_headers`)).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      expect(readdirSync(join(root, `${app}/public/fonts`)).filter((f) => f.endsWith('.woff2')).length).toBeGreaterThanOrEqual(5);
      expect(read(`${app}/public/fonts/fonts.css`)).toMatch(/url\(\/fonts\/NotoKufiArabic-arabic\.woff2\)/);
    }
    expect(read('leaders-app/public/fonts/fonts.css')).toMatch(/font-family: 'Amiri'/);
  });
  it('عامل الخدمة يسمّي مخزنه ببصمة البناء، والتسجيل يمررها، والصفحات لا تُخزَّن', () => {
    expect(read('leaders-app/public/sw.js')).toMatch(/searchParams\.get\('v'\)/);
    expect(read('leaders-app/src/main.jsx')).toMatch(/register\(`\/sw\.js\?v=\$\{build\}`\)/);
    const h = read('leaders-app/public/_headers');
    for (const path of ['/\n', '/org\n', '/legal/*\n', '/j/*\n']) expect(h).toContain(`${path}  Cache-Control: no-cache`);
  });
  it('الشاشات الثقيلة كسولة في التطبيقين مع Suspense، وقطعة React مستقلة', () => {
    const app = read('leaders-app/src/App.jsx');
    for (const s of ['Handbook', 'Capstone', 'Hall', 'Katon', 'OrgPortal', 'ExpertPortal', 'Legal', 'Impact']) expect(app).toMatch(new RegExp(`const ${s}(?:Screen)? = lazy\\(\\(\\) => import\\('./screens/${s}\\.jsx'\\)\\)`));
    expect(read('leaders-app/src/main.jsx')).toMatch(/<Suspense fallback=/);
    const admin = read('admin-app/src/App.jsx');
    for (const s of ['Leaders', 'Matrix', 'Visits', 'Contacts', 'Settings']) expect(admin).toContain(`const ${s} = lazy(() => import('./screens/${s}.jsx'))`);
    expect(read('admin-app/src/main.jsx')).toMatch(/<Suspense fallback=/);
    for (const v of ['leaders-app/vite.config.js', 'admin-app/vite.config.js']) expect(read(v)).toMatch(/manualChunks: \{ react: \['react', 'react-dom'\] \}/);
  });
});

describe('CI والاختبارات', () => {
  it('أنواع كل الدوال واختبارات Deno في ci.yml، وسير التكامل بمساراته الذهبية', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('deno check --node-modules-dir=auto supabase/functions/*/index.ts');
    expect(ci).toMatch(/deno test --node-modules-dir=none .*supabase\/functions\/leaders-api\//);
    const integ = read('.github/workflows/integration.yml');
    expect(integ).toContain('supabase start');
    expect(integ).toContain('bash scripts/integration/apply-migrations.sh');
    expect(integ).toContain('node scripts/integration/golden.mjs');
    const toml = read('supabase/config.toml');
    expect(toml).toMatch(/schemas = \["public", "graphql_public", "leaders"\]/);
    expect(toml).toMatch(/\[db\.migrations\]\nenabled = false/);   // البدء لا يطبّق الترحيلات: اللقطة أولًا ثم الترحيلات بالترتيب
    const apply = read('scripts/integration/apply-migrations.sh');
    const at = (needle) => { const i = apply.indexOf(needle); expect(i, needle).toBeGreaterThan(-1); return i; };
    expect(at('supabase/schema/baseline.sql')).toBeLessThan(at('scripts/integration/seed-reference.sql'));
    expect(at('scripts/integration/seed-reference.sql')).toBeLessThan(at('for f in $(ls supabase/migrations/*.sql | sort)'));
    expect(read('scripts/integration/seed-reference.sql')).toMatch(/insert into leaders\.placement_model \(id\) values \(1\)/);
    for (const f of ['google_test.ts', 'passkeys_test.ts', 'payments_test.ts']) expect(statSync(join(root, `supabase/functions/leaders-api/${f}`)).size).toBeGreaterThan(500);
    expect(read('scripts/db/snapshot.mjs')).toContain("import { DATA_ONLY } from './data-only.mjs'");
  });
  it('dependabot وNode المثبت وvite 7.3.7 فما فوق', () => {
    expect(read('.github/dependabot.yml')).toMatch(/package-ecosystem: npm/);
    expect(read('.nvmrc').trim()).toBe('20');
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.engines.node).toBe('>=20 <23');
    const v = pkg.devDependencies.vite.replace(/^[^\d]*/, '').split('.').map(Number);
    expect(v[0] > 7 || (v[0] === 7 && (v[1] > 3 || (v[1] === 3 && v[2] >= 7)))).toBe(true);
  });
});

describe('الأسرار موثقة', () => {
  it('كل متغير بيئة تقرؤه الدوال مذكور في docs/SECRETS.md، والسران الإلزاميان مفروضان عند الإقلاع', () => {
    const doc = read('docs/SECRETS.md');
    const names = new Set();
    const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|js)$/.test(f) && !/_test\.ts$|_test_env\.ts$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/(?:Deno\.env\.get|\benv)\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g)) names.add(m[1]); } };
    walk(join(root, 'supabase/functions'));
    expect(names.size).toBeGreaterThan(15);
    for (const n of names) expect(doc, n).toContain(`\`${n}\``);
    expect(read('supabase/functions/leaders-api/core.ts')).toMatch(/if \(!CONFIG\.serviceKey \|\| !CONFIG\.pepper\) throw new Error/);
  });
});
