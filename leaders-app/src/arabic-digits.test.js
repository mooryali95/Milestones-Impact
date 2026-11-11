// فحص الجاهزية p-entry-1 (2026-11-11): الأرقام العربية المشرقية (٠-٩) من لوحة المفاتيح العربية.
// كانت \D تمحوها من رمز الدخول بلا رسالة، وnormalizePhone يردها null («رقم الجوال غير صحيح»)،
// وحقل سنوات الخبرة (type=number) يُفرغ نفسه بها. الإصلاح: latinDigits في logic.js مصدرًا واحدًا لكل حد.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanExpert, codeDigits, latinDigits, normalizePhone } from '../../supabase/functions/leaders-api/logic.js';
import { parseDate, parseNumber } from '../../supabase/functions/leaders-api/capstone.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('latinDigits وcodeDigits', () => {
  it('المشرقية والفارسية إلى 0-9، وما سواها كما هو', () => {
    expect(latinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(latinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(latinDigits('رمز ٢٤٦ و810')).toBe('رمز 246 و810');
    expect(latinDigits(null)).toBe('');
    expect(latinDigits(8)).toBe('8');
  });
  it('رمز الدخول: ستة أرقام لاتينية مما كُتب أو لُصق', () => {
    expect(codeDigits('٢٤٦٨١٠')).toBe('246810');
    expect(codeDigits('٢٤٦ ٨١٠')).toBe('246810');
    expect(codeDigits('۲۴۶۸۱۰۹')).toBe('246810');
    expect(codeDigits('24a6')).toBe('246');
  });
});

describe('الخادم يقبل الأرقام المشرقية', () => {
  it('normalizePhone: الجوال بالأرقام المشرقية يُحفظ بالصيغة الموحدة', () => {
    expect(normalizePhone('٠٥٠٠٠٠٠٠٠٠')).toBe('+966500000000');
    expect(normalizePhone('۰۵۱۲۳۴۵۶۷۸')).toBe('+966512345678');
    expect(normalizePhone('+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧')).toBe('+966501234567');
    expect(normalizePhone('٠٥٠٠')).toBeNull();
  });
  it('سنوات الخبرة وساعات الخبير بالأرقام المشرقية لا تضيع null', () => {
    const e = cleanExpert({ years_experience: '١٢', weekly_hours: '٥' });
    expect(e.years_experience).toBe(12);
    expect(e.weekly_hours).toBe(5);
    expect(cleanExpert({ years_experience: '' }).years_experience).toBeNull();
  });
  it('profile.save وتحقق الرموز الثلاثة يمران بـlatinDigits', () => {
    const p = read('supabase/functions/leaders-api/participant.ts');
    expect(p).toContain('const y = Number(latinDigits(f.years_experience).trim());');
    for (const f of ['participant.ts', 'coordinator.ts', 'experts.ts']) {
      const s = read(`supabase/functions/leaders-api/${f}`);
      expect(s, f).toContain("await hash(latinDigits(b.code || '').trim())");
      expect(s, f).not.toContain("await hash(String(b.code || '').trim())");
    }
  });
  it('أرقام جداول المبادرة وتواريخها من المصدر نفسه', () => {
    expect(parseNumber('١٬٢٣٤٫٥')).toBe(1234.5);
    expect(parseNumber('۱۲')).toBe(12);
    expect(parseDate('٢٠٢٦-٠٣-١٥')).toBe(Date.UTC(2026, 2, 15));
    expect(read('supabase/functions/leaders-api/capstone.js')).not.toContain("'٠١٢٣٤٥٦٧٨٩'.indexOf");
  });
});

describe('الواجهة لا تمحو الأرقام المشرقية', () => {
  it('حقول رمز الدخول في بوابات المشارك والجهة والخبير تمر بـcodeDigits', () => {
    expect(read('leaders-app/src/screens/SignIn.jsx')).toContain('const digits = codeDigits(v);');
    expect(read('leaders-app/src/screens/OrgPortal.jsx')).toContain('const d = codeDigits(e.target.value);');
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).toContain('setCode(codeDigits(e.target.value))');
    for (const f of ['SignIn.jsx', 'OrgPortal.jsx']) expect(read(`leaders-app/src/screens/${f}`), f).not.toMatch(/value\.replace\(\/\\D\/g/);
  });
  it('سنوات الخبرة حقل نصي رقمي يحوّل المشرقية، لا type=number', () => {
    const s = read('leaders-app/src/screens/Profile.jsx');
    expect(s).not.toMatch(/need\('years_experience'\)\} type="number"/);
    expect(s).toContain("k === 'years_experience' ? latinDigits(e.target.value).replace(/\\D/g, '').slice(0, 2)");
  });
});
