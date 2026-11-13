// التدقيق الشامل للجاهزية (2026-11-11): حراس الإصلاحات المتحقق منها في الواجهات والخادم.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('server-sec-1: دخول لوحة الإدارة بمطابقة تامة للبريد', () => {
  const api = read('supabase/functions/admin-api/index.ts');
  it('لا ilike على البريد في الدخول والتحقق والاستعادة (الحرفان _ و% شاملان فيه)', () => {
    expect(api).not.toMatch(/\.ilike\(\s*["']email["']/);
    for (const action of ['login-send', 'recovery-request', 'login-verify']) {
      const at = api.indexOf(`action === "${action}"`);
      expect(at, action).toBeGreaterThan(0);
      expect(api.slice(at, at + 1600), action).toMatch(/from\("admin_users"\)[\s\S]{0,200}\.eq\("email", email\)/);
    }
  });
  it('البريد يُطبَّع بحروف صغيرة قبل المطابقة وعند إنشاء المدير، والتحقق يقبل _ و% فالمطابقة التامة هي الحارس', () => {
    expect(api.match(/const email = String\(body\.email \|\| ""\)\.trim\(\)\.toLowerCase\(\);/g).length).toBeGreaterThanOrEqual(3);
    expect(api).toContain('const newEmail = String(body.newEmail || "").trim().toLowerCase();');
    const isEmail = new Function(`${api.match(/const isEmail = [^\n]+/)[0].replace("(s: string)", "(s)")}; return isEmail;`)();
    expect(isEmail('first_last@example.com')).toBe(true);
  });
});

// المستودع عام: لا بريد شخصي في الكود ولا في الترحيلات ولا في السكربتات (الاختبارات تستعمل عناوين وهمية وهي خارج الفحص)
describe('لا بيانات شخصية في المصدر', () => {
  it('لا عنوان بريد على نطاق شخصي في الدوال والترحيلات والسكربتات', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '../..');
    const files = [];
    const walk = (dir) => readdirSync(dir).forEach((n) => {
      const f = join(dir, n);
      if (statSync(f).isDirectory()) { if (!/node_modules|\.git$/.test(f)) walk(f); } else if (/\.(ts|js|mjs|sql|sh|toml|yml)$/.test(n) && !/(_test\.ts|\.test\.js)$/.test(n)) files.push(f);
    });
    ['supabase', 'scripts', '.github'].forEach((d) => walk(join(root, d)));
    const personal = /[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud|live|msn)\.[a-z.]+/i;
    // استثناءان معلَّلان: ترحيل مطبّق على الإنتاج لا تُغيَّر بايتاته (applied-manifest يرفض)، وسكربت التكامل الذي ينشئ الحساب الذي يشترطه ذلك الترحيل
    const frozen = ['/supabase/migrations/20261022110000_multiple_owners.sql', '/scripts/integration/apply-migrations.sh'];
    expect(files.filter((f) => personal.test(readFileSync(f, 'utf8'))).map((f) => f.replace(root, '')).filter((f) => !frozen.includes(f))).toEqual([]);
  });
});
