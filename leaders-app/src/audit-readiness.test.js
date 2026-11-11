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
    expect(isEmail('omar_x@outlook.com')).toBe(true);
  });
});
