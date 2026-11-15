// قاعدة المرافق الذكي للجهة والدفعة (logic.js companionAllowed): مصدر واحد يستعمله المرافق عند بنائه
import { describe, expect, it } from 'vitest';
import { companionAllowed } from '../../supabase/functions/leaders-api/logic.js';

describe('companionAllowed', () => {
  it('الجهة تسمح افتراضيًا، وصف قبل الترحيل (بلا العمود) مسموح', () => {
    expect(companionAllowed({ id: 'o' }, null)).toBe(true);
    expect(companionAllowed({ companion_allowed: true }, { companion: true })).toBe(true);
  });
  it('الجهة التي أوقفته توقفه أيًا كانت الدفعة', () => {
    expect(companionAllowed({ companion_allowed: false }, { companion: true })).toBe(false);
  });
  it('الدفعة التي أطفأته تطفئه، والفرد بلا جهة مسموح له', () => {
    expect(companionAllowed({ companion_allowed: true }, { companion: false })).toBe(false);
    expect(companionAllowed(null, null)).toBe(true);
    expect(companionAllowed(undefined, { companion: false })).toBe(false);
  });
});
