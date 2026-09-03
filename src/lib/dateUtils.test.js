import { gregorianToHijri, validPhone, validEmail, isPast, todayISO, fmtBoth } from './dateUtils';

// ════════════════════════════════════════════════════════════════
// التقويم الهجري
// ════════════════════════════════════════════════════════════════
// المراجع أدناه من أمّ القرى — التقويم المعتمد رسمياً في السعودية.
// وهي بالضبط التواريخ التي كشفت أن الحساب القديم يسبقه بيوم إلى
// يومين، فتثبيتها هنا يمنع الانزلاق إليه ثانية.

describe('gregorianToHijri', () => {
  // الخمسة الأولى تواريخ عامة. والثلاثة الأخيرة مختارة عمداً عند نقاط
  // يفترق فيها أمّ القرى عن التقويم الجدولي — فلو انزلق أحدهم إلى
  // الجدولي مرة أخرى سقطت هذه صراحةً لا بالمصادفة.
  const cases = [
    ['2026-08-30', 17, 3, 1448, 'ربيع الأول'],
    ['2026-01-01', 12, 7, 1447, 'رجب'],
    ['2025-03-01', 1, 9, 1446, 'رمضان'],
    ['2030-06-15', 13, 2, 1452, 'صفر'],
    ['2000-01-01', 24, 9, 1420, 'رمضان'],
    ['2024-08-10', 6, 2, 1446, 'صفر'],          // الجدولي: 4 صفر
    ['2024-02-07', 26, 7, 1445, 'رجب'],         // الجدولي: 27 رجب
    ['2024-07-04', 28, 12, 1445, 'ذو الحجة'],   // الجدولي: 27 ذو الحجة
  ];

  it.each(cases)('%s تطابق أمّ القرى', (g, day, month, year, monthName) => {
    const h = gregorianToHijri(g);
    expect({ day: h.day, month: h.month, year: h.year }).toEqual({ day, month, year });
    expect(h.formatted).toBe(`${day} ${monthName} ${year}هـ`);
  });

  it('تُبقي الأرقام لاتينية كبقية الواجهة', () => {
    // الافتراضي في ar-SA أرقام هندية (١٧)؛ الواجهة كلها لاتينية.
    expect(gregorianToHijri('2026-08-30').formatted).toMatch(/^\d+ /);
    expect(gregorianToHijri('2026-08-30').formatted).not.toMatch(/[٠-٩]/);
  });

  it('تلصق «هـ» بالسنة بلا مسافة', () => {
    expect(gregorianToHijri('2025-03-01').formatted).toMatch(/1446هـ$/);
  });

  it('لا تتراجع أبداً عبر ألف يوم متتابع', () => {
    // تحويلٌ يعيد تاريخاً أسبق ليومٍ أحدث خللٌ صريح في الخوارزمية.
    let prev = -Infinity;
    const start = new Date('2024-01-01');
    for (let i = 0; i < 1000; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const h = gregorianToHijri(d);
      const ordinal = h.year * 10000 + h.month * 100 + h.day;
      expect(ordinal).toBeGreaterThanOrEqual(prev);
      prev = ordinal;
    }
  });

  it('تبقى داخل حدود التقويم عبر ألف يوم', () => {
    const start = new Date('2024-01-01');
    for (let i = 0; i < 1000; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const h = gregorianToHijri(d);
      expect(h.month).toBeGreaterThanOrEqual(1);
      expect(h.month).toBeLessThanOrEqual(12);
      expect(h.day).toBeGreaterThanOrEqual(1);
      expect(h.day).toBeLessThanOrEqual(30);
    }
  });

  it('تعيد شكلاً آمناً لتاريخ غير صالح بدل أن ترمي', () => {
    // Intl يرمي RangeError على Invalid Date، وذلك يُسقط التصيير كله.
    const h = gregorianToHijri('ليس تاريخاً');
    expect(h.formatted).toBe('—');
    expect(Number.isNaN(h.day)).toBe(true);
  });
});

describe('fmtBoth', () => {
  it('تجمع الهجري والميلادي بفاصل واحد', () => {
    const r = fmtBoth('2025-03-01');
    expect(r.hijri).toBe('1 رمضان 1446هـ');
    expect(r.both).toBe(`${r.hijri} | ${r.gregorian}`);
  });

  it('التقويمان بنظام أرقام واحد', () => {
    // كان الهجري لاتينياً والميلادي هندياً — نظاما أرقام في صفٍّ واحد
    // من الجدول النهائي الذي يُطبع. الواجهة كلها لاتينية، فليكونا كذلك.
    const r = fmtBoth('2025-03-01');
    expect(r.gregorian).not.toMatch(/[٠-٩]/);
    expect(r.hijri).not.toMatch(/[٠-٩]/);
    expect(r.gregorian).toMatch(/\d/);
  });
});

// ════════════════════════════════════════════════════════════════
// التحقّق من المدخلات
// ════════════════════════════════════════════════════════════════

describe('validPhone', () => {
  it('يقبل الجوال السعودي بعشر خانات يبدأ بـ 05', () => {
    expect(validPhone('0512345678')).toBe(true);
    expect(validPhone('0599999999')).toBe(true);
  });

  it('يتجاهل المسافات', () => {
    expect(validPhone('051 234 5678')).toBe(true);
  });

  it('يرفض ما ليس جوالاً سعودياً', () => {
    expect(validPhone('0412345678')).toBe(false);   // لا يبدأ بـ 05
    expect(validPhone('051234567')).toBe(false);    // تسع خانات
    expect(validPhone('05123456789')).toBe(false);  // إحدى عشرة
    expect(validPhone('+966512345678')).toBe(false); // صيغة دولية
    expect(validPhone('05abcdefgh')).toBe(false);
    expect(validPhone('')).toBe(false);
  });
});

describe('validEmail', () => {
  it('يقبل العناوين السليمة', () => {
    expect(validEmail('a@b.co')).toBe(true);
    expect(validEmail('omar@sunkvalue.com')).toBe(true);
    expect(validEmail('first.last+tag@sub.example.org')).toBe(true);
  });

  it('يرفض المختلّة', () => {
    expect(validEmail('no-at-sign')).toBe(false);
    expect(validEmail('@example.com')).toBe(false);
    expect(validEmail('a@b')).toBe(false);          // بلا نطاق أعلى
    expect(validEmail('a@b.c')).toBe(false);        // نطاق أعلى من حرف
    expect(validEmail('a..b@example.com')).toBe(false); // نقطتان متتاليتان
    expect(validEmail('.a@example.com')).toBe(false);   // نقطة في الأول
    expect(validEmail('a.@example.com')).toBe(false);   // نقطة في الآخر
    expect(validEmail('')).toBe(false);
  });

  it('يرفض ما تجاوز 254 محرفاً', () => {
    expect(validEmail('a'.repeat(250) + '@example.com')).toBe(false);
  });
});

describe('isPast', () => {
  it('اليوم ليس ماضياً', () => {
    // الحدّ منتصف ليل اليوم، فاليوم نفسه يبقى قابلاً للحجز.
    expect(isPast(todayISO())).toBe(false);
  });

  it('الأمس ماضٍ والغد ليس كذلك', () => {
    const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
    expect(isPast(shift(-1))).toBe(true);
    expect(isPast(shift(1))).toBe(false);
  });
});
