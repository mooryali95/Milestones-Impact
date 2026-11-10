import { describe, expect, it } from 'vitest';
import { CAPTCHA_TEXT, captchaGate, captchaMessage } from './captcha.js';

describe('رسائل التحقق البشري (التدقيق 2026-11-10)', () => {
  it('لكل فشل رسالته: التحميل غير التحقق غير المهلة', () => {
    expect(new Set(Object.values(CAPTCHA_TEXT)).size).toBe(3);
    expect(captchaMessage('load')).toContain('تعذّر تحميل');
    expect(captchaMessage('challenge')).toContain('لم يكتمل التحقق');
    expect(captchaMessage('challenge')).not.toContain('تحميل');
    expect(captchaMessage('timeout')).toContain('مهلة');
    expect(captchaMessage('شيء آخر')).toBe(CAPTCHA_TEXT.challenge);
  });
  it('أول طلب: تظهر الأداة بلا رسالة', () => {
    const g = captchaGate({ code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' }, undefined);
    expect(g.box.site).toBe('0x4AAA');
    expect(g.error).toBe('');
  });
  it('رفض الخادم رمز الأداة: تظهر رسالته وتُبنى الأداة من جديد', () => {
    const r = { code: 'captcha', site_key: '0x4AAA', message: 'تعذّر التحقق، أعد المحاولة' };
    const a = captchaGate(r, 'tok-1');
    expect(a.error).toBe('تعذّر التحقق، أعد المحاولة');
    expect(typeof a.box.n).toBe('number');
  });
  it('بلا مفتاح موقع: لا أداة، والرسالة من الخادم', () => {
    const g = captchaGate({ code: 'captcha', message: 'الدخول برمز البريد متوقف مؤقتًا' }, undefined);
    expect(g.box).toBeNull();
    expect(g.error).toContain('متوقف');
  });
});
