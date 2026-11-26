import { describe, expect, it } from 'vitest';
import { isoDay } from './institutional.js';

describe('isoDay', () => {
  it('يأخذ اليوم بتوقيت الرياض لا UTC', () => {
    expect(isoDay('2026-11-25T22:30:00Z')).toBe('2026-11-26');
    expect(isoDay('2026-11-25T20:30:00Z')).toBe('2026-11-25');
  });
  it('يعيد فارغًا لتاريخ غير صالح', () => { expect(isoDay('x')).toBe(''); });
});
