// ترشيد CI (2026-11-11، بطلب المالك): ما يمسه التعديل وحده، ولا فحص مرتين للشجرة نفسها، والاعتماديات من الذاكرة،
// ولا بناء لكل التطبيقات عند تعديل واحد. يحرس القرار (ci-changes.mjs) والمجموعات (e2e-groups.mjs) وثوابت ملفات السير.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decide } from '../../scripts/ops/ci-changes.mjs';
import { GROUPS, plan, specs } from '../../scripts/ops/e2e-groups.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const on = (d) => Object.entries(d).filter(([, v]) => v === true).map(([k]) => k).sort();

describe('قرار ما يمسه التعديل (scripts/ops/ci-changes.mjs)', () => {
  it('مسودات المراجعة لا تشغّل شيئًا، والوثائق المحروسة تشغّل الفحوص الخفيفة وحدها', () => {
    expect(on(decide(['docs/audit/2026-11-11-x.md', 'docs/prototypes/a.html']))).toEqual([]);
    expect(on(decide(['RUNBOOK.md', 'docs/ops/دليل-المشغل-v1.md']))).toEqual(['checks']);
  });
  it('تطبيق واحد يبني نفسه ويشغّل رحلاته، لا غيره', () => {
    expect(on(decide(['leaders-app/src/screens/Journey.jsx']))).toEqual(['checks', 'e2e_cross', 'e2e_leaders', 'leaders']);
    expect(on(decide(['admin-app/src/screens/Orgs.jsx']))).toEqual(['admin', 'checks', 'e2e_admin', 'e2e_cross']);
    expect(on(decide(['src/App.jsx']))).toEqual(['checks', 'e2e_site', 'matrix']);
    expect(on(decide(['home/index.html']))).toEqual(['checks', 'e2e_leaders', 'e2e_site', 'home']);
  });
  it('منطق الخادم المشترك يمس التطبيقات الثلاثة والدوال والتكامل؛ الترحيل يمس التكامل والفحوص وحدها', () => {
    expect(on(decide(['supabase/functions/leaders-api/logic.js']))).toEqual(
      ['admin', 'backend', 'checks', 'e2e_admin', 'e2e_cross', 'e2e_leaders', 'e2e_site', 'functions', 'leaders', 'matrix']);
    expect(on(decide(['supabase/functions/send-otp/index.ts']))).toEqual(['backend', 'checks', 'functions']);
    expect(on(decide(['supabase/migrations/20991231000000_x.sql']))).toEqual(['backend', 'checks']);
  });
  it('الشك يشغّل كل شيء: سير العمل، والاعتماديات، وإعداد الرحلات، وملف بلا مجال معروف', () => {
    const all = on(decide([], { all: true }));
    for (const f of ['.github/workflows/ci.yml', '.github/actions/node-deps/action.yml', 'package-lock.json', 'playwright.config.js', 'scripts/ops/ci-changes.mjs', 'new-root-file.js']) {
      expect(on(decide([f])), f).toEqual(all);
    }
  });
  it('ملف رحلة متغير يشغّل مجموعته وحدها، والمساعد المشترك يشغّل المجموعات كلها', () => {
    expect(on(decide(['e2e/admin-nav.spec.js']))).toEqual(['checks', 'e2e_admin']);
    expect(on(decide(['e2e/matrix.spec.js']))).toEqual(['checks', 'e2e_site']);
    expect(on(decide(['e2e/readable.js']))).toEqual(['checks', 'e2e_admin', 'e2e_cross', 'e2e_leaders', 'e2e_site']);
  });
});

describe('مجموعات رحلات المتصفح (scripts/ops/e2e-groups.mjs)', () => {
  it('كل ملف رحلة في مجموعة واحدة، والمجموعات الأربع تغطي الملفات كلها', () => {
    const all = specs();
    expect(all.length).toBe(readdirSync(join(root, 'e2e')).filter((f) => f.endsWith('.spec.js')).length);
    expect(all.filter((s) => !s.group)).toEqual([]);
    const covered = GROUPS.flatMap((g) => plan(g.id).files).sort();
    expect(covered).toEqual(all.map((s) => s.file).sort());
  });
  it('مجموعة الإدارة لا تشغّل خادم المصفوفة ولا القادة، وإعداد Playwright يحترم E2E_SERVERS', () => {
    expect(plan('admin').servers).toEqual(['admin']);
    expect(plan('site').servers).not.toContain('admin');
    const cfg = read('playwright.config.js');
    expect(cfg).toContain("SERVERS.filter((s) => !ONLY || ONLY.includes(s.name))");
    expect(cfg).toMatch(/process\.env\.E2E_PREBUILT \? '' : 'npm run build && '/);
  });
});

describe('ثوابت ملفات السير', () => {
  const ci = read('.github/workflows/ci.yml');
  const integ = read('.github/workflows/integration.yml');
  const workflows = readdirSync(join(root, '.github/workflows')).filter((f) => f.endsWith('.yml'));
  it('ما تهمله ci.yml هو ما يعدّه القرار خاملًا', () => {
    const ignored = ci.match(/paths-ignore: \[(.*)\]/)[1];
    for (const d of ['audit', 'assessment', 'prototypes', 'workshop']) {
      expect(ignored).toContain(`'docs/${d}/**'`);
      expect(on(decide([`docs/${d}/x.md`])), d).toEqual([]);
    }
  });
  it('لا فحص مرتين: الطلب الأخضر يرفع بصمة شجرته، والدفع إلى main يبحث عنها قبل الفحص', () => {
    expect(ci).toMatch(/name: ci-pass-\$\{\{ needs\.changes\.outputs\.tree \}\}/);
    expect(ci).toMatch(/actions\/artifacts\?name=ci-pass-\$\{\{ steps\.tree\.outputs\.tree \}\}/);
    expect(integ).toMatch(/name: integration-pass-\$\{\{ steps\.tree\.outputs\.tree \}\}/);
    expect(integ).toMatch(/actions\/artifacts\?name=integration-pass-\$\{\{ steps\.tree\.outputs\.tree \}\}/);
    // الطلب يلغي دفعته الأقدم، وmain ينتظر فلا يُقطع نشر في منتصفه
    for (const t of [ci, integ]) expect(t).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    // المسودات لا تُشغَّل
    for (const t of [ci, integ]) expect(t).toMatch(/!github\.event\.pull_request\.draft/);
  });
  it('التكامل يعمل حين يتغير الخادم أو القاعدة وحدها', () => {
    expect(integ.match(/paths: \[(.*)\]/g)).toHaveLength(2);
    expect(integ).toContain("'supabase/**', 'scripts/integration/**', 'scripts/db/**'");
  });
  it('الاعتماديات من الذاكرة: npm ci عند تغيّر القفل وحده، والمتصفح بإصداره، وDeno، وSupabase CLI بإصدار مثبّت', () => {
    const deps = read('.github/actions/node-deps/action.yml');
    expect(deps).toMatch(/key: node-modules-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('\.nvmrc', 'package-lock\.json'\) \}\}/);
    expect(deps).toMatch(/if: steps\.modules\.outputs\.cache-hit != 'true'\n\s+shell: bash\n\s+run: npm ci/);
    expect(ci).toMatch(/key: playwright-\$\{\{ runner\.os \}\}-\$\{\{ steps\.pw\.outputs\.version \}\}/);
    expect(ci).toMatch(/denoland\/setup-deno@v2\n[\s\S]{0,120}cache: true/);
    for (const f of workflows) expect(read(`.github/workflows/${f}`), f).not.toMatch(/supabase@latest/);
    expect(ci.match(/SUPABASE_CLI: (\S+)/)[1]).toBe(integ.match(/SUPABASE_CLI: (\S+)/)[1]);
  });
  it('لكل وظيفة حد زمني، وإصدار واحد لكل أداة رسمية', () => {
    for (const f of workflows) {
      const t = read(`.github/workflows/${f}`);
      expect((t.match(/runs-on:/g) || []).length, f).toBe((t.match(/timeout-minutes:/g) || []).length);
      expect(t, f).not.toMatch(/actions\/(checkout|setup-node|upload-artifact)@v4/);
    }
  });
  it('المسبار كل ثلاث ساعات وبوابته ست ساعات، وفحص R2 لا يشغّل جهازًا قبل ضبطه، وDependabot شهري بلا الكبرى', () => {
    expect(read('.github/workflows/probe.yml')).toContain("- cron: '23 */3 * * *'");
    expect(read('scripts/ops/stage-gates.mjs')).toContain("lastRun('probe.yml', 6)");
    expect(read('.github/workflows/restore-drill.yml')).toMatch(/r2:\n\s+if: vars\.R2_ENABLED == 'true'/);
    const dep = read('.github/dependabot.yml');
    expect(dep.match(/interval: monthly/g)).toHaveLength(2);
    expect(dep).toContain("update-types: ['version-update:semver-major']");
  });
});
