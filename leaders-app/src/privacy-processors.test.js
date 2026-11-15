// سياسة خصوصية الموقع والمصفوفة (home/privacy.html) تسمي المعالجين الذين تستدعيهم الشيفرة فعلًا (visitor-7):
// لا AWS بعد نقل إشعار المستشار إلى user-api (D14)، والبريد عبر Resend، والتحقق البشري من Cloudflare،
// وقناة التشغيل عبر Slack، والمساعد الآلي عبر Anthropic.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const policy = read('home/privacy.html');
const thirdParties = policy.slice(policy.indexOf('id="s4"'), policy.indexOf('id="s5"'));
const legal = read('leaders-app/src/screens/Legal.jsx');

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

  // الاختبار لا يكتشف المضيفين الجدد بنفسه: لكل معالج تستدعيه الدوال تأكيد صريح هنا وفي سياسة برنامج القادة
  it('تسمي Slack ما دامت الدوال تنشر في قناة التشغيل عبر slack.com', () => {
    expect(read('supabase/functions/_shared/slack.ts')).toContain('https://slack.com/api/chat.postMessage');
    expect(thirdParties).toMatch(/<strong>Slack<\/strong>:[^<]*مقنّع/);
    expect(legal).toMatch(/<li>Slack: [^<]*مقنّعًا/);
  });

  it('تسمي Anthropic وموضع المعالجة كما يُضبط في كل طلب (الولايات المتحدة)', () => {
    const agent = 'supabase/functions/agent-chat/model.ts';
    if (existsSync(join(root, agent))) {
      expect(read(agent)).toContain("baseURL: 'https://api.anthropic.com'");
      expect(read(agent)).toContain("inference_geo: 'us'");
    }
    expect(thirdParties).toMatch(/<strong>Anthropic<\/strong>:[^<]*الولايات المتحدة/);
    expect(legal).toMatch(/<li>Anthropic: [^<]*الولايات المتحدة/);
  });

  // التخزين في مومباي لا يُقال عن «جميع» البيانات ما دام نص المحادثة يُعالج في الولايات المتحدة، ومدة احتفاظ Anthropic مذكورة
  it('مادة التخزين تستثني المعالجين، ومدة احتفاظ Anthropic في السياستين', () => {
    const storage = policy.slice(policy.indexOf('id="s3"'), policy.indexOf('id="s4"'));
    expect(storage).not.toMatch(/جميع بياناتكم/);
    expect(storage).toMatch(/Anthropic في الولايات المتحدة/);
    expect(thirdParties).toMatch(/<strong>Anthropic<\/strong>:[^<]*لا تتجاوز 30 يومًا/);
    expect(legal).toMatch(/<li>Anthropic: [^<]*لا تتجاوز 30 يومًا/);
  });

  it('الجوال لتعريف الحساب، ورمز التحقق يُرسل إلى البريد لا إلى الجوال', () => {
    expect(policy).not.toMatch(/التحقق عبر OTP/);
    expect(policy).toMatch(/<td>رقم الجوال<\/td><td>تعريف الحساب/);
    expect(policy).toContain('رمز التحقق إلى بريدكم الإلكتروني');
  });
});
