import { describe, it, expect } from 'vitest';
import { emptyDemoRow, validDemoRows } from './useDemographics';

describe('validDemoRows', () => {
  it('يتجاهل الصف الفارغ والصف بلا قوة', () => {
    const named = { ...emptyDemoRow(), name: 'سالم' };
    expect(validDemoRows([emptyDemoRow(), named])).toHaveLength(0);
  });
  it('يقبل صفًا باسم وبُعد قوة واحد', () => {
    const r = emptyDemoRow();
    expect(validDemoRows([{ ...r, name: 'سالم', strength: { ...r.strength, social: 2 } }])).toHaveLength(1);
  });
});
