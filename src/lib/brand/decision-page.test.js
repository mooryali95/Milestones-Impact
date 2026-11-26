import { describe, expect, it } from 'vitest';
import { STATUS_QUO, fundingHead, isFutureDeadline } from './institutional.js';

describe('صفحة القرار', () => {
  it('لا يعرض موعدًا فائتًا', () => {
    expect(isFutureDeadline('2026-01-04', '2026-11-26T10:00:00Z')).toBe(false);
    expect(isFutureDeadline('2027-01-04', '2026-11-26T10:00:00Z')).toBe(true);
    expect(isFutureDeadline(null, '2026-11-26')).toBe(false);
  });
  it('لا يعد خيارًا فيه «عدم» في وسطه وضعًا قائمًا', () => {
    expect(STATUS_QUO.test('معالجة عدم الامتثال')).toBe(false);
    expect(STATUS_QUO.test('منصة عدم التكرار')).toBe(false);
    expect(STATUS_QUO.test('عدم التدخل')).toBe(true);
    expect(STATUS_QUO.test(' الإبقاء على الوضع')).toBe(true);
  });
  it('يختصر التمويل دون قطع الرقم العشري', () => {
    expect(fundingHead('قرض بقيمة 1.5 مليون من الصندوق')).toBe('قرض بقيمة 1.5 مليون من الصندوق');
    expect(fundingHead('ميزانية الجهة، ودعم جزئي')).toBe('ميزانية الجهة');
    expect(fundingHead('ميزانية الجهة. ودعم')).toBe('ميزانية الجهة');
    expect(fundingHead('،ميزانية')).toBe('،ميزانية');
  });
});
