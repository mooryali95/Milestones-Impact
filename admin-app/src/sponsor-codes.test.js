// منطق رموز الرعاية النقي (supabase/functions/leaders-api/sponsor-codes.js): التوليد والحالة والاستخدام والرسالة والتحقق
import { describe, expect, it } from 'vitest';
import { cleanExpiry, cleanMaxUses, codePrefix, codeState, CUSTOM_CODE_RE, formatCode, participantMessage, usageAr } from '../../supabase/functions/leaders-api/sponsor-codes.js';
import { SITES } from '../../supabase/functions/_shared/sites.js';

describe('رموز الرعاية', () => {
  it('البادئة من الاسم المختصر أو الإنجليزي، والرمز ثمانية أحرف بلا ملتبس في مجموعتين', () => {
    expect(codePrefix({ short_name: 'Manzoma' })).toBe('manz');
    expect(codePrefix({ short_name: 'منظومة', name_en: 'MoH' })).toBe('moh');
    expect(codePrefix({ name: 'جهة' })).toBe('org');
    const c = formatCode('manz', [0, 1, 2, 3, 30, 31, 62, 255]);
    expect(c).toMatch(/^manz-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(c.slice(5).replace('-', '')).not.toMatch(/[01ilo]/);
    expect(CUSTOM_CODE_RE.test('short12')).toBe(false);
    expect(CUSTOM_CODE_RE.test('spring-2027')).toBe(true);
  });
  it('الحالة والاستخدام', () => {
    const now = Date.parse('2026-11-23T10:00:00Z');
    expect(codeState({ active: true, used: 0, max_uses: null }, now)).toBe('active');
    expect(codeState({ active: false, used: 0 }, now)).toBe('stopped');
    expect(codeState({ active: true, used: 0, expires_at: '2026-11-23T09:00:00Z' }, now)).toBe('expired');
    expect(codeState({ active: true, used: 10, max_uses: 10 }, now)).toBe('exhausted');
    expect(usageAr({ used: 3, max_uses: 10 })).toBe('3 من 10');
    expect(usageAr({ used: 3, max_uses: null })).toBe('3 · بلا حد');
  });
  it('الرسالة فيها الرابط والرمز بأحرف كبيرة', () => {
    const m = participantMessage('manz-7k4q-x9m2', SITES.leaders, 'منظومة');
    expect(m).toContain(SITES.leaders);
    expect(m).toContain('MANZ-7K4Q-X9M2');
    expect(m).toContain('منظومة');
  });
  it('التحقق من الحد والتاريخ', () => {
    expect(cleanMaxUses('')).toEqual({ value: null });
    expect(cleanMaxUses('5')).toEqual({ value: 5 });
    expect(cleanMaxUses('0').error).toBeTruthy();
    expect(cleanMaxUses('2.5').error).toBeTruthy();
    expect(cleanExpiry('2026-12-31')).toEqual({ value: '2026-12-31T20:59:59.000Z' });
    expect(cleanExpiry('x').error).toBeTruthy();
    expect(cleanExpiry(null)).toEqual({ value: null });
  });
});
