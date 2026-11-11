// سياسة خصوصية الموقع والمصفوفة (home/privacy.html) تسمي المعالجين الذين تستدعيهم الشيفرة فعلًا (visitor-7):
// لا AWS بعد نقل إشعار المستشار إلى user-api (D14)، والبريد عبر Resend، والتحقق البشري من Cloudflare.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const policy = read('home/privacy.html');
const thirdParties = policy.slice(policy.indexOf('id="s4"'), policy.indexOf('id="s5"'));

describe('معالجو البيانات في سياسة الخصوصية', () => {
  it('لا تسمي AWS لإشعار المستشار، فالشيفرة لا تستدعي Lambda', () => {
    expect(read('src/config/constants.js')).not.toMatch(/amazonaws/);
    expect(policy).not.toMatch(/Amazon Web Services|\bAWS\b/);
  });

  it('تسمي Resend ما دام البريد يُرسل عبره', () => {
    expect(read('supabase/functions/_shared/mail.ts')).toContain('api.resend.com');
    expect(thirdParties).toContain('Resend');
  });

  it('تسمي Cloudflare للتحقق البشري ما دامت الدوال تتحقق عبر Turnstile', () => {
    expect(read('supabase/functions/user-api/index.ts')).toContain('challenges.cloudflare.com');
    expect(thirdParties).toMatch(/Cloudflare<\/strong>:[^<]*التحقق/);
    expect(thirdParties).toContain('Supabase');
  });

  it('تسمي Google Fonts ما دام تطبيق المصفوفة يحمّل خطوطه منها', () => {
    if (read('src/styles/appCss.js').includes('fonts.googleapis.com')) expect(thirdParties).toContain('Google Fonts');
  });

  it('الجوال لتعريف الحساب، ورمز التحقق يُرسل إلى البريد لا إلى الجوال', () => {
    expect(policy).not.toMatch(/التحقق عبر OTP/);
    expect(policy).toMatch(/<td>رقم الجوال<\/td><td>تعريف الحساب/);
    expect(policy).toContain('رمز التحقق إلى بريدكم الإلكتروني');
  });
});
