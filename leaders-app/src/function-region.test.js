// منطقة تنفيذ الدوال مثبتة على منطقة القاعدة (ops-3، تدقيق 2026-11-11): بلا تثبيت نُفّذت الدالة في us-east-2 وdb_ms
// بين 297 و968، ومع forceFunctionRegion=ap-south-1 بين 25 و85. العملاء كلهم يبنون العنوان من fnUrl وحده، والمسبار
// وفحوص ما بعد النشر تطلب العنوان نفسه الذي يطلبه المستخدم.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callFn, fnUrl, FUNCTION_REGION, SUPABASE_URL } from '../../src/lib/api.js';
import { call, coordCall, xpCall } from './api.js';

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
    expect(urls).toEqual([PINNED('leaders-api'), PINNED('leaders-api'), PINNED('leaders-api'), PINNED('user-api')]);
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
    expect(read('admin-app/src/api.js')).toContain("const ADMIN_API = fnUrl('admin-api');");
    expect(read('admin-app/src/leaders.js')).toContain("const API = fnUrl('leaders-api');");
  });

  it('المسبار وفحوص ما بعد النشر تطلب المنطقة نفسها', () => {
    for (const f of ['.github/workflows/probe.yml', '.github/workflows/ci.yml', '.github/workflows/deploy-leaders-api.yml']) {
      expect(read(f), f).toContain(`"https://$PROJECT_REF.supabase.co/functions/v1/$1?forceFunctionRegion=${FUNCTION_REGION}"`);
    }
  });
});
