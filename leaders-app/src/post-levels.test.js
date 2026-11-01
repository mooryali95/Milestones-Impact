// إغلاق الحلقة (المرحلة ب): فقرات المستوى في البعدي، وتوائم المواقف المشتركة،
// و«مكتسبات المستوى» منفصلةً عن فرق القبلي والبعدي.
import { describe, expect, it } from 'vitest';
import {
  anchorRepeat, forForm, isTwin, levelGainReport, levelGains, practiceEffect, servedPost, skillSplit, tierPercents,
} from '../../supabase/functions/leaders-api/logic.js';
import BANK from '../../supabase/content/questions/v4.2/items.json';
import LEVELS_SQL from '../../supabase/migrations/20261101130000_leaders_post_v2_levels.sql?raw';
import MIN_SQL from '../../supabase/migrations/20261101125000_leaders_questions_min_level.sql?raw';

const POST = BANK.filter((q) => q.instrument === 'post-v2' && q.active !== false);
const choice = (id, dimension, tier, extra = {}) => ({
  id, code: id, dimension, tier, kind: 'choice', options: [{ score: 0 }, { score: 4 }], ...extra,
});

describe('servedPost: تصفية فقرات المستوى', () => {
  const qs = [
    choice('k1', 'milestone', 'knowledge'),
    choice('k2', 'milestone', 'knowledge', { min_level: 'intermediate' }),
    choice('k3', 'milestone', 'knowledge', { min_level: 'advanced' }),
    choice('k4', 'impact', 'knowledge', { min_level: 'intermediate' }),
  ];
  it('المبتدئ أو من لا مستوى معتمدًا له يرى العام فقط', () => {
    expect(servedPost(qs, {}).map((q) => q.id)).toEqual(['k1']);
    expect(servedPost(qs, { levels: { milestone: 'beginner' } }).map((q) => q.id)).toEqual(['k1']);
  });
  it('المستوى يُقارن في بُعد الفقرة وحده، وما دون المستوى المعتمد يُقدَّم', () => {
    expect(servedPost(qs, { levels: { milestone: 'intermediate' } }).map((q) => q.id)).toEqual(['k1', 'k2']);
    expect(servedPost(qs, { levels: { milestone: 'advanced' } }).map((q) => q.id)).toEqual(['k1', 'k2', 'k3']);
    expect(servedPost(qs, { levels: { impact: 'advanced' } }).map((q) => q.id)).toEqual(['k1', 'k4']);
  });
});

describe('servedPost: التوأم بدل المشترك', () => {
  const qs = [
    choice('s1', 'milestone', 'skill', { code: 'M-S1', anchor_code: 'M-S1' }),
    choice('s1t', 'milestone', 'skill', { code: 'M-S1T', anchor_code: 'M-S1' }),
    choice('s2', 'milestone', 'skill', { code: 'M-S2', anchor_code: 'M-S2', form: 'A' }),
  ];
  it('الأغلبية ترى التوأم، ومجموعة التكرار ترى الأصل، ولا يُقدَّم الاثنان معًا', () => {
    expect(servedPost(qs, { repeat: false }).map((q) => q.id)).toEqual(['s1t', 's2']);
    expect(servedPost(qs, { repeat: true }).map((q) => q.id)).toEqual(['s1', 's2']);
    expect(isTwin(qs[1])).toBe(true);
    expect(isTwin(qs[0])).toBe(false);
  });
  it('مجموعة التكرار نحو ربع المشاركين وثابتة لكل مشارك', () => {
    const ids = Array.from({ length: 4000 }, (_, i) => `p-${i}-${(i * 7919) % 104729}`);
    const share = ids.filter(anchorRepeat).length / ids.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
    expect(anchorRepeat('p-42')).toBe(anchorRepeat('p-42'));
  });
});

describe('skillSplit وأثر التكرار مع التوائم', () => {
  const qs = [
    choice('a', 'impact', 'skill'),
    choice('t', 'impact', 'skill', { code: 'I-S1T', anchor_code: 'I-S1' }),
    choice('f', 'impact', 'skill', { form: 'A' }),
    choice('g', 'impact', 'skill', { form: 'A', min_level: 'intermediate' }),
  ];
  it('التوأم يُحسب مع الموازية، وفقرة المستوى خارج القسمة', () => {
    const r = skillSplit(qs, { a: 1, t: 1, f: 0, g: 1 });
    expect(r.impact).toEqual({ anchor: 100, form: 50 });
  });
  it('من رأى التوائم لا مشترك له في البعدي فيُستبعد من تقدير أثر التكرار، ويبقى التقدير من مجموعة التكرار', () => {
    const twinPost = skillSplit([qs[1], qs[2]], { t: 1, f: 1 }).impact;
    expect(twinPost.anchor).toBeNull();
    const pairs = [
      { pre: { anchor: 50, form: 50 }, post: twinPost },
      { pre: { anchor: 50, form: 50 }, post: { anchor: 90, form: 70 } },
    ];
    expect(practiceEffect(pairs)).toEqual({ n: 1, points: 10 });
  });
});

describe('«مكتسبات المستوى» منفصلة عن الفرق', () => {
  const qs = [
    choice('k', 'leadership', 'knowledge'),
    choice('s', 'leadership', 'skill'),
    choice('gk', 'leadership', 'knowledge', { min_level: 'intermediate' }),
    choice('gs', 'leadership', 'skill', { min_level: 'advanced', options: [{ score: 0 }, { score: 2 }, { score: 4 }] }),
  ];
  const answers = { k: 1, s: 1, gk: 0, gs: 1 };
  it('النسب المقارنة لا تتأثر بفقرات المستوى', () => {
    const common = qs.filter((q) => !q.min_level);
    const t = tierPercents(common, answers);
    expect(t.leadership.knowledge).toBe(100);
    expect(t.leadership.skill).toBe(100);
    // لو خُلطت لانخفضت المعرفة إلى 50 دون أن يتراجع شيء مما قيس قبليًا
    expect(tierPercents(qs, answers).leadership.knowledge).toBe(50);
  });
  it('levelGains تحسب فقرات المستوى وحدها لكل بُعد', () => {
    const g = levelGains(qs, answers);
    expect(g.leadership).toEqual({ pct: 25, n: 2, level: 'advanced' });
    expect(g.milestone).toBeNull();
  });
  it('levelGainReport يعرضها باسمها دون أن يمس الفرق', () => {
    const r = levelGainReport({ leadership: { knowledge: 80, level_gain: 25, level_gain_n: 2, level_gain_level: 'advanced' }, impact: { knowledge: 70, level_gain: null } });
    expect(r.leadership).toEqual({ label_ar: 'مكتسبات المستوى', pct: 25, n: 2, level: 'advanced' });
    expect(r.impact).toBeNull();
    expect(r.milestone).toBeNull();
  });
});

describe('بنك post-v2 في v4.2', () => {
  it('المبتدئ يرى في كل صيغة عدد ما كان يراه قبل الإضافة، والتوائم بدل المشتركة', () => {
    for (const f of ['A', 'B']) {
      const old = forForm(POST.filter((q) => !q.min_level && !isTwin(q)), f);
      const served = servedPost(forForm(POST, f), { levels: {}, repeat: false });
      expect(served.length).toBe(old.length);
      expect(served.filter(isTwin).length).toBe(9);
    }
  });
  it('المتقدم في الأطر الثلاثة يرى 4 فقرات مستوى لكل بُعد في صيغته', () => {
    const levels = { milestone: 'advanced', impact: 'advanced', leadership: 'advanced' };
    for (const f of ['A', 'B']) {
      const served = servedPost(forForm(POST, f), { levels });
      for (const d of ['milestone', 'impact', 'leadership']) {
        expect(served.filter((q) => q.dimension === d && q.min_level).length).toBe(4);
      }
    }
  });
  it('المتوسط يرى فقرات الباب الخامس فقط', () => {
    const served = servedPost(forForm(POST, 'A'), { levels: { impact: 'intermediate' } });
    const gated = served.filter((q) => q.min_level);
    expect(gated.map((q) => q.chapter_key)).toEqual(['ch5', 'ch5']);
    expect(gated.every((q) => q.dimension === 'impact')).toBe(true);
  });
  it('الترحيل يدرج كل الفقرات الجديدة بمعرّفاتها، والعمود بقيد المستويات', () => {
    const fresh = POST.filter((q) => q.min_level || isTwin(q));
    expect(fresh.length).toBe(33);
    for (const q of fresh) {
      expect(LEVELS_SQL).toContain(`'${q.id}', '${q.dimension}', '${q.code}'`);
    }
    expect(LEVELS_SQL).toMatch(/enable row level security/);
    expect(LEVELS_SQL).toMatch(/on conflict \(instrument_id, code\) do nothing/);
    expect(MIN_SQL).toMatch(/check \(min_level in \('beginner', 'intermediate', 'advanced'\)\)/);
  });
});
