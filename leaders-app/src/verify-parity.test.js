// حراس الحزمة 1 (D16 في سجل قرارات لجنة الخبراء): التحقق المحلي يطابق CI، وبوابة الترحيلات قبل النشر،
// وفحص الأسرار، وسجل ما دُمج منذ آخر نشر، ولا صلاحية نشر لوكيل في .claude/settings.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CI_SETUP, STEPS } from '../../scripts/ops/verify-steps.mjs';
import { classify, gateOf } from '../../scripts/ops/pending-migrations.mjs';
import { scanText } from '../../scripts/ops/secrets-scan.mjs';
import { areaOf } from '../../scripts/ops/since-release.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// أوامر run في وظيفة واحدة من ملف سير، سطرًا سطرًا بلا تعليقات
function runLines(yml, job) {
  const lines = yml.split('\n');
  const start = lines.findIndex((l) => l === `  ${job}:`);
  const end = lines.findIndex((l, i) => i > start && /^ {2}[a-z][\w-]*:\s*$/.test(l));
  const body = lines.slice(start, end < 0 ? undefined : end);
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const m = body[i].match(/^(\s*)(?:- )?run: (.*)$/);
    if (!m) continue;
    if (m[2].trim() !== '|') { out.push(m[2].trim()); continue; }
    const indent = m[1].length;
    for (i++; i < body.length && (body[i].trim() === '' || body[i].search(/\S/) > indent); i++) {
      const t = body[i].trim();
      if (t && !t.startsWith('#')) out.push(t);
    }
    i--;
  }
  return out;
}

describe('npm run verify يطابق build-and-test في ci.yml', () => {
  const ci = runLines(read('.github/workflows/ci.yml'), 'build-and-test');
  const local = STEPS.flatMap((s) => s.cmds);
  it('كل أمر فحص في CI موجود بنصه في خطوات التحقق المحلي', () => {
    const checks = ci.filter((c) => !CI_SETUP.some((re) => re.test(c)));
    expect(checks.length).toBeGreaterThan(20);
    expect(checks.filter((c) => !local.includes(c))).toEqual([]);
  });
  it('كل خطوة محلية موسومة ci موجودة في CI، وما لا يوسم يحتاج سرًا', () => {
    for (const s of STEPS) {
      if (s.ci) expect(s.cmds.filter((c) => !ci.includes(c)), s.id).toEqual([]);
      else expect(s.needsToken, s.id).toBe(true);
    }
  });
  it('الأمر مسجّل في package.json، والمتحقق يرفض الدمج عند التخطي أو الشجرة غير النظيفة', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.verify).toBe('node scripts/ops/verify.mjs');
    expect(pkg.scripts['since-release']).toBe('node scripts/ops/since-release.mjs');
    const v = read('scripts/ops/verify.mjs');
    expect(v).toContain('غير صالح للدمج');
    expect(v).toMatch(/git\('status --porcelain'\)/);
  });
  it('الكتاب v3 ومتحققه في CI، والمتحقق بلا مسار جلسة سابقة', () => {
    expect(ci).toContain('node scripts/handbook/verify.mjs > /dev/null');
    const hv = read('scripts/handbook/verify.mjs');
    expect(hv).not.toMatch(/\/tmp\/claude-0|scratchpad/);
    expect(read('scripts/handbook/content.mjs')).toMatch(/min_level: meta\.min_level \|\| null/);
  });
});

describe('بوابة الترحيلات قبل نشر الدوال', () => {
  it('الترحيل بلا وسم حاجب، والوسمان tolerant وdeferred لا يحجبان', () => {
    expect(gateOf('-- عنوان\ncreate table x();').gate).toBe('blocking');
    expect(gateOf('-- عنوان\n-- deploy-gate: tolerant\n').gate).toBe('tolerant');
    expect(gateOf('-- deploy-gate: deferred بقرار D03\n')).toEqual({ gate: 'deferred', note: 'بقرار D03' });
    expect(gateOf(`${'--\n'.repeat(20)}-- deploy-gate: tolerant`).gate).toBe('blocking');   // الوسم في السطور الأولى فقط
    const sql = { a: 'create table a();', b: '-- deploy-gate: deferred', c: 'x' };
    expect(classify(['a', 'b', 'c'], ['c'], (n) => sql[n]).map((p) => [p.name, p.gate])).toEqual([['a', 'blocking'], ['b', 'deferred']]);
  });
  it('تفعيل v5 موسوم مؤجلًا من مولّده، والوظيفتان deploy تشغّلان البوابة قبل النشر', () => {
    expect(gateOf(read('supabase/migrations/20261102100100_leaders_activate_v5.sql')).gate).toBe('deferred');
    expect(read('scripts/questions/build-v5.mjs')).toContain('deploy-gate: deferred');
    for (const [f, job] of [['.github/workflows/ci.yml', 'deploy'], ['.github/workflows/deploy-leaders-api.yml', 'deploy']]) {
      const yml = read(f);
      const lines = runLines(yml, job);
      const gate = lines.findIndex((l) => l.includes('scripts/ops/pending-migrations.mjs'));
      const deploy = lines.findIndex((l) => l.startsWith('deploy leaders-api'));
      expect(gate, f).toBeGreaterThanOrEqual(0);
      expect(gate, f).toBeLessThan(deploy);
    }
  });
});

describe('فحص الأسرار', () => {
  const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2lnbmF0dXJlc2lnbmF0dXJl`;
  it('مفتاح anon مسموح، ومفتاح الخدمة وأنواع الأسرار المعروفة مرفوضة', () => {
    expect(scanText(`const k = '${jwt({ role: 'anon', ref: 'x' })}'`)).toEqual([]);
    expect(scanText(`k=${jwt({ role: 'service_role' })}`)[0].kind).toMatch(/service_role/);
    for (const s of ['sbp_' + 'a'.repeat(40), 'AKIA' + 'A'.repeat(16), '-----BEGIN ' + 'PRIVATE KEY-----', 're_abcdefgh_' + 'x'.repeat(20), 'ghp_' + 'a'.repeat(36)]) {
      expect(scanText(`x ${s} y`).length, s.slice(0, 6)).toBe(1);
    }
  });
  it('مفتاح anon المودع في ci.yml يجتاز الفحص', () => {
    expect(scanText(read('.github/workflows/ci.yml'))).toEqual([]);
  });
});

describe('سجل ما دُمج، وصلاحيات الوكيل', () => {
  it('المجالات تصنّف الملفات', () => {
    expect(areaOf('supabase/functions/leaders-api/admin.ts')).toBe('الدوال');
    expect(areaOf('supabase/migrations/x.sql')).toBe('الترحيلات');
    expect(areaOf('leaders-app/src/App.jsx')).toBe('منصة القادة');
    expect(areaOf('HANDOFF.md')).toBe('الوثائق');
    expect(areaOf('home/index.html')).toBe('الموقع الرئيسي');
  });
  it('لا صلاحية نشر في .claude/settings.json، والنشر والدفع إلى release ممنوعان', () => {
    const s = JSON.parse(read('.claude/settings.json'));
    expect(JSON.stringify(s.permissions.allow || [])).not.toMatch(/deploy|db push|release/);
    expect(s.permissions.deny).toEqual(expect.arrayContaining(['Bash(supabase functions deploy:*)', 'Bash(npx -y supabase@latest functions deploy:*)']));
  });
});
