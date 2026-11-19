// مطابقة نص البحث (search-text.js): الجوال بكل صيغه، وتوحيد الحروف العربية، وما لا يُكتب في العنوان.
// المصدر نفسه يستعمله بحث قائمة المشاركين والبحث الشامل وبحث الخادم (admin.participants)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digitQuery, foldText, phoneMatches, phoneNeedle, searchMatcher } from '../../supabase/functions/leaders-api/search-text.js';
import { lastActive } from '../../supabase/functions/leaders-api/last-active.js';
import { normalizePhone } from '../../supabase/functions/leaders-api/logic.js';

const STORED = '+966551234567';

describe('الجوال بأي صيغة', () => {
  it('الصيغ الأربع تجد الرقم المحفوظ دوليًا', () => {
    for (const q of ['0551234567', '551234567', '966551234567', '+966551234567', '00966551234567']) expect(phoneMatches(q, STORED), q).toBe(true);
  });
  it('بمسافات وشرطات وأقواس وأرقام عربية وفارسية وعلامات اتجاه منسوخة', () => {
    for (const q of ['055 123 4567', '055-123-4567', '+966 55 123 4567', '(055) 1234567', '٠٥٥١٢٣٤٥٦٧', '۰۵۵۱۲۳۴۵۶۷', '+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧', '\u202a+966 55 123 4567\u202c', '055\u00a0123\u00a04567']) {
      expect(phoneMatches(q, STORED), q).toBe(true);
    }
  });
  it('جزء من الرقم يكفي: أوله بالصفر، أو أي موضع منه', () => {
    expect(phoneMatches('0551', STORED)).toBe(true);
    expect(phoneMatches('05512', STORED)).toBe(true);
    expect(phoneMatches('4567', STORED)).toBe(true);
    expect(phoneMatches('96655', STORED)).toBe(true);
  });
  it('رقم آخر لا يطابق، والصفر المحلي لا يطابق وسط الرقم', () => {
    expect(phoneMatches('0559999999', STORED)).toBe(false);
    expect(phoneMatches('0512', STORED)).toBe(false);   // 512 في وسط الرقم، لكن 05 بداية جوال آخر
    expect(phoneMatches('0551234567', '+966501234567')).toBe(false);
  });
  it('ما ليس رقمًا لا يبحث في الجوال: حروف، أو أقل من ثلاثة أرقام، أو فارغ', () => {
    for (const q of ['', '  ', '05', '5', 'سارة', 'سارة 0551234567', 'a55123', null, undefined]) expect(phoneNeedle(q), String(q)).toBe('');
    expect(phoneMatches('055', null)).toBe(false);
    expect(phoneMatches('055', '')).toBe(false);
  });
  it('الإبرة: الصفر المحلي يصير 966، و00 و+ تُحذفان', () => {
    expect(phoneNeedle('0551234567')).toBe('966551234567');
    expect(phoneNeedle('00966551234567')).toBe('966551234567');
    expect(phoneNeedle('+966 55-123')).toBe('96655123');
    expect(phoneNeedle('551234567')).toBe('551234567');
  });
  it('كل ما يحفظه normalizePhone يوجد بما كُتب به', () => {
    for (const typed of ['0551234567', '551234567', '966551234567', '+966551234567', '٠٥٥١٢٣٤٥٦٧']) expect(phoneMatches(typed, normalizePhone(typed)), typed).toBe(true);
    // رقم دولي غير سعودي يُحفظ كما كُتب، ويوجد بصيغته الدولية
    expect(phoneMatches('+44 7911 123456', normalizePhone('+447911123456'))).toBe(true);
    expect(phoneMatches('00447911123456', '+447911123456')).toBe(true);
  });
});

describe('توحيد الحروف العربية', () => {
  it('الألف بأشكالها، والتاء المربوطة والهاء، والياء والألف المقصورة، والهمزة على واو وياء', () => {
    expect(foldText('أسامة')).toBe('اسامه');
    expect(foldText('إيمان')).toBe(foldText('ايمان'));
    expect(foldText('آمنة')).toBe(foldText('امنه'));
    expect(foldText('ٱلرحمن')).toBe(foldText('الرحمن'));
    expect(foldText('منى')).toBe(foldText('مني'));
    expect(foldText('مؤمن')).toBe(foldText('مومن'));
    expect(foldText('رائد')).toBe(foldText('رايد'));
  });
  it('التشكيل والتطويل يُحذفان، والمسافات تُضم، والحروف اللاتينية صغيرة، والأرقام لاتينية', () => {
    expect(foldText('مُحَمَّدٌ')).toBe('محمد');
    expect(foldText('محـــمد')).toBe('محمد');
    expect(foldText('  عبد   الله ')).toBe('عبد الله');
    expect(foldText('Sara@Example.SA')).toBe('sara@example.sa');
    expect(foldText('دفعة ٢٠٢٦')).toBe('دفعه 2026');
    expect(foldText(null)).toBe('');
  });
  it('المطابِق: نص موحّد أو جوال، والبحث الفارغ يمرر الكل', () => {
    const hit = searchMatcher('اسامه');
    expect(hit('أُسامة الأحمد', STORED)).toBe(true);
    expect(hit('سارة', STORED)).toBe(false);
    expect(searchMatcher('  ')('أي شيء', null)).toBe(true);
    expect(searchMatcher('055 123 4567')('سارة', STORED)).toBe(true);
    expect(searchMatcher('055 123 4567')('سارة', '+966509999999')).toBe(false);
    // النص الحرفي كما كان: 551234567 موجودة في النص نفسه
    expect(searchMatcher('551234567')(`سارة ${STORED}`, null)).toBe(true);
  });
});

describe('نص بحث يشبه رقمًا', () => {
  it('جوال أو جزء منه، أو خمسة أرقام فأكثر في أي نص', () => {
    for (const q of ['0551234567', '551', '+966 55', '٠٥٥١٢٣', 'سارة 0551234567', 'سارة 05512', 'جوال: 055-123-4567']) expect(digitQuery(q), q).toBe(true);
  });
  it('الأسماء والنصوص العادية ليست كذلك', () => {
    for (const q of ['', 'سارة', 'دفعة 3', 'وزارة 2030', 'a@b.sa', '05', null]) expect(digitQuery(q), String(q)).toBe(false);
  });
});

describe('آخر نشاط', () => {
  it('الأحدث من آخر دخول ومن آخر استعمال لأي جلسة', () => {
    expect(lastActive('2026-11-01T08:00:00Z', ['2026-11-14T09:00:00Z', '2026-11-10T09:00:00Z'])).toBe('2026-11-14T09:00:00.000Z');
    expect(lastActive('2026-11-15T08:00:00Z', ['2026-11-14T09:00:00Z'])).toBe('2026-11-15T08:00:00.000Z');
    expect(lastActive('2026-11-01T08:00:00Z')).toBe('2026-11-01T08:00:00.000Z');
    expect(lastActive(null, ['2026-11-14T09:00:00Z'])).toBe('2026-11-14T09:00:00.000Z');
  });
  it('لا دخول ولا جلسة: null، وقيمة فاسدة تُتجاهل', () => {
    expect(lastActive(null, [])).toBe(null);
    expect(lastActive(undefined, [null, 'x'])).toBe(null);
  });
});

describe('مصدر واحد', () => {
  it('لا توحيد ثانٍ للحروف ولا مطابقة ثانية للجوال: البحث الشامل والقائمة وبحث الخادم تستورد search-text.js', () => {
    const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
    expect(read('admin-app/src/search.js')).toContain('export const norm = foldText;');
    expect(read('admin-app/src/filters.js')).toMatch(/import \{ digitQuery, searchMatcher \} from '.*search-text\.js'/);
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/import \{ phoneNeedle \} from '\.\/search-text\.js'/);
  });
  it('البحث بالجوال للإدارة وحدها: لا يستورده بحث المنسق ولا الخبير ولا تطبيق المشارك', () => {
    const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
    for (const f of ['supabase/functions/leaders-api/coordinator.ts', 'supabase/functions/leaders-api/experts.ts', 'supabase/functions/leaders-api/file.ts', 'leaders-app/src/coord.js']) {
      expect(read(f), f).not.toContain('search-text.js');
    }
  });
});
