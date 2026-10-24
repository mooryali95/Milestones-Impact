import { describe, expect, it } from 'vitest';
import { evaluate, MODEL_DEFAULT, reorderIds, trackKey, trackLevels, lines } from './methodology.js';

describe('المنهجية', () => {
  it('رمز المسار يُقرأ ويُبنى بالاتجاهين', () => {
    expect(trackLevels('M2I1L3')).toEqual({ milestone: 'intermediate', impact: 'beginner', leadership: 'advanced' });
    expect(trackKey('advanced', 'beginner', 'intermediate')).toBe('M3I1L2');
  });

  it('المؤشر المركّب موزون، والجانب الأضعف يمنع المستوى الأعلى', () => {
    const r = evaluate({ knowledge: 75, skill: 25, behavior: 69 }, MODEL_DEFAULT);
    expect(r.composite).toBe(49.1);
    expect(r.level).toBe('beginner');
    expect(evaluate({ knowledge: 90, skill: 90, behavior: 90 }, MODEL_DEFAULT).level).toBe('advanced');
    // مؤشر عالٍ لكن جانب تحت حد الاحترافي
    expect(evaluate({ knowledge: 100, skill: 100, behavior: 50 }, MODEL_DEFAULT).level).toBe('intermediate');
    expect(evaluate({}, MODEL_DEFAULT)).toBeNull();
  });

  it('إعادة الترتيب داخل مجموعة العنصر فقط، ولا شيء على الطرف', () => {
    const rows = [
      { id: 'a', stage_key: 's1', sort: 1 }, { id: 'b', stage_key: 's1', sort: 2 },
      { id: 'x', stage_key: 's2', sort: 1 }, { id: 'c', stage_key: 's1', sort: 3 },
    ];
    expect(reorderIds(rows, 'stage_requirements', 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(reorderIds(rows, 'stage_requirements', 'c', 1)).toBeNull();
    expect(reorderIds([{ key: 'k1', sort: 1 }, { key: 'k2', sort: 2 }], 'journey_stages', 'k1', 1)).toEqual(['k2', 'k1']);
  });

  it('البنود تُنظَّف من الترقيم والشرطات', () => {
    expect(lines('1. أول\n- ثانٍ\n\n•  ثالث')).toEqual(['أول', 'ثانٍ', 'ثالث']);
  });
});
