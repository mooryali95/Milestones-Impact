import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { flakyOf, summarize } from './e2e-flaky.mjs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('رحلات المتصفح المتذبذبة (أ6)', () => {
  const report = { suites: [{ file: 'a.spec.js', specs: [
    { title: 'ثابت', line: 3, tests: [{ status: 'expected', results: [{}] }] },
    { title: 'متذبذب', line: 9, tests: [{ status: 'flaky', results: [{}, {}] }] },
  ], suites: [{ specs: [{ title: 'داخلي', line: 20, tests: [{ status: 'flaky', results: [{}, {}] }] }] }] }] };
  it('يجمع ما نجح بعد إعادة المحاولة وحده، ومعه الملف والسطر', () => {
    expect(flakyOf(report)).toEqual([
      { file: 'a.spec.js', title: 'متذبذب', line: 9, retries: 1 },
      { file: 'a.spec.js', title: 'داخلي', line: 20, retries: 1 },
    ]);
    expect(summarize(flakyOf(report))).toContain('(2)');
    expect(summarize([])).toContain('لا اختبار');
  });
  it('طلب الدمج يحذر فقط، والسير الأسبوعي يشغّل كل المجموعات ويفشل فوق الحد', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/run: node scripts\/ops\/e2e-flaky\.mjs\n/);
    expect(ci).toContain('REQUIRE_CRYPTO_TOOLS');
    const sg = read('.github/workflows/stage-gates.yml');
    expect(sg).toContain('node scripts/ops/e2e-groups.mjs groups');
    expect(sg).toContain('e2e-flaky.mjs --max="$FLAKY_MAX"');
    expect(read('scripts/ops/e2e-groups.mjs')).toContain('PLAYWRIGHT_JSON_OUTPUT_NAME');
  });
});
