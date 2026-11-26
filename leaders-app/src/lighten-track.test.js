// تخفيف ما لا يخص المسار (تصور المرحلة 3 §5.4، البند 3.4)
import { describe, expect, it } from 'vitest';
import { labVisible } from '../../supabase/functions/leaders-api/lab.js';

const it_ = (id, dimension, audience = 'granted', min_level = 'beginner') => ({ id, key: id, dimension, audience, min_level, active: true, sort: 1 });

describe('المختبر بمحور أولوية المسار', () => {
  const items = [it_('a', 'impact'), it_('b', 'milestone'), it_('c', 'impact', 'granted', 'advanced')];
  const levels = { impact: 'intermediate', milestone: 'beginner', leadership: 'beginner' };
  it('أدوات بُعد الأولوية تظهر تلقائيًا بالمستوى، بلا منح', () => {
    expect(labVisible(items, { levels, participantId: 'p', priority: 'impact' }).map((x) => x.id)).toEqual(['a']);
  });
  it('بلا أولوية أو بلا اعتماد لا يتغير شيء', () => {
    expect(labVisible(items, { levels, participantId: 'p' })).toEqual([]);
    expect(labVisible(items, { levels: null, participantId: 'p', priority: 'impact' })).toEqual([]);
  });
});

import { activityFor, cleanConfig, readingChapters, readingStatus, applyDelivery } from '../../supabase/functions/leaders-api/logic.js';

describe('الكتيب: الإلزام لفصول المسار ومحوره', () => {
  const ch = (id, dimension) => ({ id, dimension, title_ar: id });
  const chapters = [ch('m1', 'milestone'), ch('m2', 'milestone'), ch('i1', 'impact'), ch('i2', 'impact'), ch('i3', 'impact'), ch('l1', 'leadership'), ch('l2', 'leadership')];
  const read = (ids) => Object.fromEntries(ids.map((id) => [id, { words: 100, active_seconds: 9999, slices: Array(20).fill(999) }]));
  const quiz = (ids) => Object.fromEntries(ids.map((id) => [id, true]));
  it('نطاق المسار: أبواب محور الأولوية كلها وأول باب من كل إطار آخر، والبقية اختيارية', () => {
    expect(readingChapters({ scope: 'track' }, chapters, { priority: 'impact' }).map((m) => m.id)).toEqual(['m1', 'i1', 'i2', 'i3', 'l1']);
    const s = readingStatus({ scope: 'track', quiz: true }, chapters, {}, {}, { priority: 'impact' });
    expect([s.total, s.optional]).toEqual([5, 2]);
  });
  it('بلا أولوية معروفة يبقى الإلزام كاملًا، فلا يُخفف ما لا يُعرف مساره', () => {
    expect(readingChapters({ scope: 'track' }, chapters, {}).map((m) => m.id)).toHaveLength(7);
  });
  it('لا فقد: باب قرأه واجتاز أسئلته خارج النطاق يبقى محسوبًا، فلا تنخفض جاهزية أحد', () => {
    const done = ['m1', 'm2', 'i1'];
    const before = readingStatus({ scope: 'all', quiz: true }, chapters, read(done), quiz(done));
    const after = readingStatus({ scope: 'track', quiz: true }, chapters, read(done), quiz(done), { priority: 'impact' });
    expect(after.count).toBe(before.count);
    expect(after.count / after.total).toBeGreaterThanOrEqual(before.count / before.total);
    expect(after.chapters.find((c) => c.id === 'm2').kept).toBe(true);
  });
  it('النطاق محفوظ في الإعداد، والكتاب بدل الورش يأخذه، وactivityFor يمرر الأولوية', () => {
    expect(cleanConfig('reading', { scope: 'track' }).scope).toBe('track');
    expect(applyDelivery({ kind: 'workshop', code: 'T-ATTEND', config: {} }, { format: 'handbook' }).config.scope).toBe('track');
    const a = activityFor({ kind: 'reading', config: { scope: 'track', quiz: true } }, { chapters, reading: {}, quizzes: {}, priority: 'impact' });
    expect(a.total).toBe(5);
  });
});
