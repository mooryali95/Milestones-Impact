// منطقة تنفيذ الدوال مثبتة على منطقة القاعدة (ops-3، تدقيق 2026-11-11): بلا تثبيت نُفّذت الدالة في us-east-2 وdb_ms
// بين 297 و968، ومع forceFunctionRegion=ap-south-1 بين 25 و85. العملاء كلهم يبنون العنوان من fnUrl وحده، والمسبار
// وفحوص ما بعد النشر تطلب العنوان نفسه الذي يطلبه المستخدم.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callFn, fnUrl, FUNCTION_REGION, SUPABASE_URL } from '../../src/lib/api.js';
import { call, coordCall, xpCall } from './api.js';
import { CLIENT_LEVEL } from '../../supabase/functions/_shared/client-compat.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PINNED = (fn) => `${SUPABASE_URL}/functions/v1/${fn}?forceFunctionRegion=ap-south-1`;

afterEach(() => vi.unstubAllGlobals());

describe('منطقة تنفيذ الدوال', () => {
  it('منطقة القاعدة نفسها (مومباي)', () => {
    expect(FUNCTION_REGION).toBe('ap-south-1');
    expect(fnUrl('leaders-api')).toBe(PINNED('leaders-api'));
  });

  it('طلبات المشارك والجهة والخبير والمصفوفة تذهب إلى العنوان المثبت', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => { urls.push(url); return { status: 200, json: async () => ({ success: true }) }; }));
    await call('system.ping');
    await coordCall('coord.me');
    await xpCall('xp.me');
    await callFn('user-api', { action: 'ping' });
    // leaders-api ومعه مستوى الواجهة (المرحلة 5 البند 7، _shared/client-compat.js) بعد معامل المنطقة نفسه
    const leaders = `${PINNED('leaders-api')}&cl=${CLIENT_LEVEL}`;
    expect(urls).toEqual([leaders, leaders, leaders, PINNED('user-api')]);
  });

  it('لا عميل يبني عنوان دالة بنفسه: fnUrl مصدره الوحيد', () => {
    const SKIP = /node_modules|\.test\.|\.spec\./;
    const walk = (d) => readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      if (SKIP.test(p)) return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|ts)$/.test(p) ? [p] : [];
    });
    const builders = ['src', 'leaders-app/src', 'admin-app/src', 'shared']
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((p) => /\/functions\/v1\//.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1));
    expect(builders).toEqual(['src/lib/api.js']);
    // اللوحة تطلب الدالتين باسمهما عبر postAction، وهي تبني العنوان من fnUrl (ش9)
    expect(read('admin-app/src/api.js')).toContain("await post('admin-api', {");
    expect(read('admin-app/src/leaders.js')).toContain("await post('leaders-api', {");
    expect(read('src/lib/api.js')).toMatch(/const url = leaders \? `\$\{fnUrl\(fn\)\}&\$\{LEVEL_PARAM\}=\$\{CLIENT_LEVEL\}` : fnUrl\(fn\);\n\s+const r = await fetchRetry\(url,/);
  });

  it('المسبار وفحوص ما بعد النشر تطلب المنطقة نفسها', () => {
    for (const f of ['.github/workflows/probe.yml', '.github/workflows/ci.yml', '.github/workflows/deploy-leaders-api.yml']) {
      expect(read(f), f).toContain(`"https://$PROJECT_REF.supabase.co/functions/v1/$1?forceFunctionRegion=${FUNCTION_REGION}"`);
    }
  });

  it('نموذج التواصل في الموقع الرئيسي (ومنه بوابة مقياس الجاهزية) يطلب المنطقة نفسها، وكل الصفحات على نسخته الأخيرة', () => {
    const tf = read('home/assets/program/js/typeform.js');
    expect(tf).toContain(`/functions/v1/send-otp?forceFunctionRegion=${FUNCTION_REGION}`);
    expect(tf).not.toMatch(/functions\/v1\/send-otp`/);
    const pages = ['index.html', 'projects/index.html', 'governance/index.html', 'assessment/index.html', 'pricing.html', 'refund.html', 'privacy.html', 'terms.html', 'leaders/index.html'];
    const versions = new Set(pages.map((p) => read(`home/${p}`).match(/typeform\.js\?v=(\d+)/)?.[1]));
    expect([...versions]).toEqual(['7']);
    // المساعد الآلي في الصفحات نفسها، يقرأ عنوان الدالة ومفتاحها من typeform.js
    expect(new Set(pages.map((p) => read(`home/${p}`).match(/chat\.js\?v=(\d+)/)?.[1]))).toEqual(new Set(['1']));
    expect(tf).toContain('/functions/v1/${name}?forceFunctionRegion=' + FUNCTION_REGION);
  });
});

