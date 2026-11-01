import { describe, expect, it } from 'vitest';
import { autoGroups, cleanGroupSettings, cleanStageModes, contentLevels } from '../../supabase/functions/leaders-api/logic.js';

const lv = (l) => ({ milestone: l, impact: l, leadership: l });
const people = [
  ...['a1', 'a2', 'a3'].map((id) => ({ id, name: id, levels: lv('advanced') })),
  ...['i1', 'i2', 'i3'].map((id) => ({ id, name: id, levels: lv('intermediate') })),
  ...['b1', 'b2', 'b3'].map((id) => ({ id, name: id, levels: lv('beginner') })),
];

describe('نمط المجموعة', () => {
  it('الدفعة المتجانسة تعطي المحتوى بمستواها الموحد، والمختلطة بمستوى المشارك', () => {
    const mine = { milestone: 'advanced', impact: 'beginner', leadership: 'intermediate' };
    expect(contentLevels(mine, { level_mode: 'uniform', content_level: 'beginner' })).toEqual(lv('beginner'));
    expect(contentLevels(mine, { level_mode: 'mixed' })).toBe(mine);
    expect(contentLevels(mine, null)).toBe(mine);
    expect(contentLevels(mine, { level_mode: 'uniform', content_level: null })).toBe(mine);
  });

  it('التوزيع المتنوع يضع كل المستويات في كل مجموعة بأحجام متوازنة', () => {
    const g = autoGroups(people, 3, 'mixed');
    expect(g.map((x) => x.length)).toEqual([3, 3, 3]);
    for (const grp of g) expect(new Set(grp.map((id) => id[0])).size).toBe(3);
    expect(autoGroups(people, 3, 'mixed')).toEqual(g);
  });

  it('التوزيع بالمستوى يجمع المتقاربين', () => {
    const g = autoGroups(people, 3, 'level');
    expect(g.map((grp) => new Set(grp.map((id) => id[0])).size)).toEqual([1, 1, 1]);
    expect(g[0][0][0]).toBe('b');
  });

  it('ينظف الإعدادات ويرفض المجهول', () => {
    expect(cleanStageModes({ a: 'groups', b: 'x', ghost: 'shared' }, ['a', 'b'])).toEqual({ a: 'groups' });
    expect(cleanGroupSettings({ level_mode: 'uniform', content_level: 'beginner', project_mode: 'group' })).toEqual({ level_mode: 'uniform', content_level: 'beginner', project_mode: 'group' });
    expect(() => cleanGroupSettings({ level_mode: 'x' })).toThrow();
    expect(cleanGroupSettings({ content_level: 'x' })).toEqual({ content_level: null });
  });
});
