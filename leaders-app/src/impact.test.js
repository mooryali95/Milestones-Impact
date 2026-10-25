// قياس الأثر: المقارنة بين القياسين، والتغير الموثوق، والتثليث
import { describe, expect, it } from 'vitest';
import {
  beforePercents, comparableComposite, compareAssessments, cronbachAlpha, effectLabel, impactVerdict, normalizedChange,
  pairedStats, raterPercents, reliableChange,
} from '../../supabase/functions/leaders-api/logic.js';
import POST_SQL from '../../supabase/migrations/20261024150000_leaders_post_assessment.sql?raw';

describe('comparableComposite', () => {
  it('ignores a tier missing from either form', () => {
    const pre = { knowledge: 50, skill: 40, behavior: 60 };
    const post = { knowledge: null, skill: 80, behavior: 70 };
    const c = comparableComposite(pre, post, { w_knowledge: 30, w_skill: 45, w_behavior: 25 });
    expect(c.tiers).toEqual(['skill', 'behavior']);
    // الأوزان 45 و25 فقط
    expect(c.pre).toBe(Math.round(((45 * 40 + 25 * 60) / 70) * 10) / 10);
    expect(c.post).toBe(Math.round(((45 * 80 + 25 * 70) / 70) * 10) / 10);
  });
  it('returns nulls when nothing is shared', () => {
    expect(comparableComposite({ knowledge: 50 }, { skill: 50 }).pre).toBeNull();
  });
});

describe('normalizedChange', () => {
  it('measures gain against the room left to improve', () => {
    expect(normalizedChange(50, 75)).toBe(0.5);
    expect(normalizedChange(90, 95)).toBe(0.5);
  });
  it('measures loss against the starting point', () => {
    expect(normalizedChange(80, 60)).toBe(-0.25);
    expect(normalizedChange(100, 100)).toBe(0);
    expect(normalizedChange(100, 101)).toBeNull();
  });
});

describe('reliableChange', () => {
  it('needs the change to exceed 1.96 standard errors of the difference', () => {
    // SEM = 15 × √0.25 = 7.5، وخطأ الفرق = 10.61، والحد = 20.8
    const small = reliableChange(50, 65, 15, 0.75);
    expect(small.reliable).toBe(false);
    expect(small.direction).toBe('flat');
    expect(small.threshold).toBe(20.8);
    const big = reliableChange(50, 75, 15, 0.75);
    expect(big.reliable).toBe(true);
    expect(big.direction).toBe('up');
    expect(reliableChange(70, 45, 15, 0.75).direction).toBe('down');
  });
  it('a more reliable instrument detects smaller change', () => {
    expect(reliableChange(50, 65, 15, 0.9).reliable).toBe(true);
  });
});

describe('cronbachAlpha', () => {
  it('is high for consistent items and null for too little data', () => {
    const rows = [[1, 1, 1], [2, 2, 3], [3, 3, 3], [4, 4, 4], [0, 1, 0]];
    expect(cronbachAlpha(rows)).toBeGreaterThan(0.9);
    expect(cronbachAlpha([[1, 2], [2, 3]])).toBeNull();
  });
  it('is low for unrelated items', () => {
    expect(cronbachAlpha([[0, 4, 2], [4, 0, 2], [2, 2, 0], [0, 0, 4], [4, 4, 4], [2, 0, 0]])).toBeLessThan(0.5);
  });
});

describe('pairedStats', () => {
  it('reports the mean change and the paired effect size', () => {
    const s = pairedStats([[50, 60], [40, 55], [60, 62], [55, 70]]);
    expect(s.n).toBe(4);
    expect(s.diff).toBe(10.5);
    expect(s.dz).toBeGreaterThan(1);
    expect(effectLabel(s.dz)).toBe('كبير');
    expect(effectLabel(0.3)).toBe('صغير');
    expect(pairedStats([]).n).toBe(0);
  });
});

describe('impactVerdict', () => {
  it('never confirms change from self rating alone', () => {
    expect(impactVerdict({ self: 'up' }).key).toBe('emerging');
    expect(impactVerdict({ self: 'up', test: 'flat' }).key).toBe('emerging');
  });
  it('confirms with two sources including an external one', () => {
    expect(impactVerdict({ self: 'up', rater: 'up', raterProspective: true }).key).toBe('confirmed');
    expect(impactVerdict({ self: 'up', rater: 'up' }).key).toBe('emerging');
    expect(impactVerdict({ test: 'up', evidence: true }).key).toBe('confirmed');
  });
  it('flags a reliable decline for review', () => {
    expect(impactVerdict({ test: 'down', self: 'up', rater: 'up' }).key).toBe('decline');
    expect(impactVerdict({}).key).toBe('none');
  });
});

const likert = (id, dimension, retro = true) => ({
  id, dimension, tier: 'behavior', kind: 'likert', retro,
  options: [0, 1, 2, 3, 4].map((score) => ({ label: `l${score}`, score })).concat({ label: 'na', score: -1 }),
});

describe('retrospective and rater ratings', () => {
  const qs = [likert('a', 'milestone'), likert('b', 'milestone'), likert('c', 'impact')];
  it('reads "before the program" answers as their own percent', () => {
    const values = { a: { k: 4, before: 1 }, b: { k: 3, before: 2 }, c: { k: 5, before: null } };
    const before = beforePercents(qs, values);
    expect(before.milestone.behavior).toBe(37.5);
    expect(before.impact.behavior).toBeNull();
  });
  it('averages a rater now and before, skipping "cannot judge"', () => {
    const r = raterPercents(qs, { a: { now: 4, before: 2 }, b: { now: 5, before: 1 }, c: { now: 3, before: 1 } });
    expect(r.milestone).toEqual({ now: 100, before: 50 });
    expect(r.impact).toEqual({ now: 75, before: 25 });
    expect(r.leadership).toBeNull();
  });
});

describe('compareAssessments', () => {
  const pre = { milestone: { knowledge: 50, skill: 50, behavior: 70, level: 'beginner' } };
  const post = { milestone: { knowledge: null, skill: 90, behavior: 75, behavior_before: 45, level: 'intermediate' } };
  it('combines test change, retrospective change and rater into one verdict', () => {
    const [m, i] = compareAssessments({ pre, post, rater: { milestone: { now: 80, before: 55 } } });
    expect(m.tiers).toEqual(['skill', 'behavior']);
    expect(m.test_direction).toBe('up');
    expect(m.retro_change).toBe(30);
    // قدّر نفسه 70 في البداية ثم رأى أنه كان 45: انزياح استجابة 25
    expect(m.response_shift).toBe(25);
    expect(m.verdict.key).toBe('confirmed');
    expect(m.verdict.sources).toEqual(['test', 'self', 'rater']);
    expect(i.composite_pre).toBeNull();
    expect(i.verdict.key).toBe('none');
  });
  it('uses cohort reliability per dimension when given', () => {
    const [loose] = compareAssessments({ pre, post, impact: { reliability: { milestone: 0.5 }, sd: { milestone: 25 } } });
    expect(loose.test_direction).toBe('flat');
  });
});

describe('post-v1 migration', () => {
  it('seeds anchors from the latest baseline without knowledge items, and transfer items unscored', () => {
    expect(POST_SQL).toMatch(/'post-v1', 'القياس البعدي لبرنامج القادة', 'post', false/);
    expect(POST_SQL).toMatch(/where q\.tier in \('skill', 'behavior'\)/);
    expect((POST_SQL.match(/\('T-\d'/g) || []).length).toBe(5);
    expect((POST_SQL.match(/\('[MIL]-B\d', 'ي/g) || []).length).toBe(12);
  });
});
