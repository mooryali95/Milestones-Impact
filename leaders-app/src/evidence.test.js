import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  agreement, angoffCut, classificationAccuracy, doubleMarkSample, EVIDENCE_GATES, fairnessReport, mantelHaenszel,
  measurementEvidence, normalCdf, overrideStats, semOf, trackDistribution,
} from '../../supabase/functions/leaders-api/evidence.js';
import { DEFAULT_MODEL, itemsToFlip, evaluatePlacement, tierMaxPointsOf, TIER_MAX_POINTS } from '../../supabase/functions/leaders-api/logic.js';
import { computeFinal, finalConfig, FINAL_DEFAULTS } from '../../supabase/functions/leaders-api/final.js';
import { feedbackReport, GAP_FIRM_MIN } from '../../supabase/functions/leaders-api/feedback360.js';

describe('measurement evidence: error and classification', () => {
  it('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it('semOf is sd·√(1−r)', () => {
    expect(semOf(15, 0.75)).toBeCloseTo(7.5, 6);
    expect(semOf(null, 0.7)).toBeNull();
  });
  it('accuracy is high far from the cuts and about one half on a cut', () => {
    expect(classificationAccuracy([30, 95], 5, [55, 80]).accuracy).toBeGreaterThan(0.99);
    expect(classificationAccuracy([55], 9, [55, 80]).accuracy).toBeCloseTo(0.5, 1);
    expect(classificationAccuracy([], 9, [55, 80]).accuracy).toBeNull();
    expect(classificationAccuracy([60], 0, [55, 80]).accuracy).toBeNull();
  });
  it('summarises per dimension, suggests a borderline of one SEM, and multiplies into a track accuracy', () => {
    const reliability = { dims: Object.fromEntries(['milestone', 'impact', 'leadership'].map((d) => [d, { n: 40, alpha: 0.64, sd: 15 }])) };
    const composites = Object.fromEntries(['milestone', 'impact', 'leadership'].map((d) => [d, [40, 52, 58, 66, 70, 79, 84]]));
    const e = measurementEvidence({ reliability, composites, respondents: 40 });
    expect(e.dimensions[0].sem).toBe(9);
    expect(e.dimensions[0].borderline_suggested).toBe(9);
    expect(e.dimensions[0].borderline_now).toBe(DEFAULT_MODEL.borderline);
    expect(e.joint_accuracy).toBeCloseTo(e.dimensions[0].accuracy ** 3, 1);
    expect(e.gates.first.met).toBe(true);
    expect(e.gates.forms.met).toBe(false);
    expect(e.gates.fairness.need).toBe(EVIDENCE_GATES.fairness);
  });
  it('has nothing to say without data, and says so with nulls', () => {
    const e = measurementEvidence({});
    expect(e.joint_accuracy).toBeNull();
    expect(e.overrides.rate).toBeNull();
    expect(e.tracks.total).toBe(0);
  });
});

describe('advisor overrides and track distribution', () => {
  it('counts approved placements that differ from the computed level, by direction', () => {
    const computed = { 'a1:milestone': 'beginner', 'a1:impact': 'intermediate', 'a1:leadership': 'advanced', 'a2:milestone': 'beginner' };
    const pl = [
      { assessment_id: 'a1', dimension: 'milestone', level: 'intermediate', approved_at: 'x' },
      { assessment_id: 'a1', dimension: 'impact', level: 'intermediate', approved_at: 'x' },
      { assessment_id: 'a1', dimension: 'leadership', level: 'intermediate', approved_at: 'x' },
      { assessment_id: 'a2', dimension: 'milestone', level: 'advanced', approved_at: null },
    ];
    expect(overrideStats(pl, computed)).toEqual({ n: 3, overridden: 2, up: 1, down: 1, rate: 0.67 });
  });
  it('reports used cells and the share of the six largest', () => {
    const l = (m, i, d) => ({ milestone: m, impact: i, leadership: d });
    const t = trackDistribution([l('beginner', 'beginner', 'beginner'), l('beginner', 'beginner', 'beginner'), l('advanced', 'beginner', 'intermediate'), { milestone: 'beginner' }]);
    expect(t).toMatchObject({ total: 3, cells: 27, used: 2, top6_share: 1 });
    expect(t.list[0]).toEqual({ key: 'M1I1L1', n: 2 });
  });
});

describe('item fairness (Mantel-Haenszel)', () => {
  const rows = (pRef, pFocal, n = 200) => Array.from({ length: n }, (_, i) => {
    const group = i % 2 ? 'ref' : 'focal';
    const total = i % 10;
    const p = group === 'ref' ? pRef : pFocal;
    return { group, total, correct: ((i * 7919) % 100) / 100 < p };
  });
  it('is negligible when both groups answer alike, and large when one group is favoured at equal ability', () => {
    expect(mantelHaenszel(rows(0.6, 0.6)).cls).toBe('A');
    const biased = mantelHaenszel(rows(0.8, 0.3));
    expect(biased.cls).toBe('C');
    expect(biased.delta).toBeLessThan(0);
  });
  it('returns nulls when a group is missing', () => {
    expect(mantelHaenszel([{ group: 'ref', total: 1, correct: true }]).cls).toBeNull();
  });
  it('does not run below its gate', () => {
    const r = fairnessReport([], new Map([['a', new Map()]]), { a: 'ref' });
    expect(r.ready).toBe(false);
    expect(r.items).toEqual([]);
  });
});

describe('rater agreement and the double-marking sample', () => {
  it('perfect agreement is kappa 1 and meets the target', () => {
    expect(agreement([[1, 1], [2, 2], [3, 3], [4, 4]])).toEqual({ n: 4, exact: 1, adjacent: 1, kappa: 1, meets_target: true });
  });
  it('systematic disagreement falls below the target, and out-of-scale pairs are dropped', () => {
    const a = agreement([[1, 4], [2, 3], [3, 2], [4, 1], [9, 1]]);
    expect(a.n).toBe(4);
    expect(a.kappa).toBeLessThan(0);
    expect(a.meets_target).toBe(false);
    expect(agreement([]).kappa).toBeNull();
  });
  it('the sample is a fixed fifth, stable for a seed and different across seeds', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const s = doubleMarkSample(ids, 'cohort-1');
    expect(s).toHaveLength(4);
    expect(doubleMarkSample([...ids].reverse(), 'cohort-1')).toEqual(s);
    expect(doubleMarkSample(ids, 'cohort-2')).not.toEqual(s);
    expect(doubleMarkSample(['only'], 's')).toEqual(['only']);
    expect(doubleMarkSample([], 's')).toEqual([]);
  });
});

describe('standard setting (modified Angoff)', () => {
  const items = [
    { code: 'K1', dimension: 'milestone', tier: 'knowledge' }, { code: 'K2', dimension: 'milestone', tier: 'knowledge' },
    { code: 'S1', dimension: 'milestone', tier: 'skill' }, { code: 'B1', dimension: 'milestone', tier: 'behavior' },
  ];
  it('weights tier means by the placement model and reports the spread between judges', () => {
    const one = (judge, k, s, b) => [{ judge, code: 'K1', p: k }, { judge, code: 'K2', p: k }, { judge, code: 'S1', p: s }, { judge, code: 'B1', p: b }];
    const r = angoffCut([...one('j1', 0.6, 0.5, 0.5), ...one('j2', 0.7, 0.6, 0.5)], items);
    // j1: (35·60 + 50·50 + 15·50)/100 = 53.5 · j2: (35·70 + 50·60 + 15·50)/100 = 62
    expect(r.dimensions.milestone.cut).toBeCloseTo(57.8, 1);
    expect(r.dimensions.milestone.range).toEqual([53.5, 62]);
    expect(r.dimensions.milestone.se).toBeGreaterThan(0);
    expect(r.dimensions.milestone.tiers.knowledge).toBe(65);
    expect(r.dimensions.impact.cut).toBeNull();
    expect(r.judges).toBe(2);
  });
  it('ignores ratings outside 0..1 and unknown items', () => {
    const r = angoffCut([{ judge: 'j', code: 'K1', p: 1.4 }, { judge: 'j', code: 'ZZ', p: 0.5 }, { judge: 'j', code: 'S1', p: 0.5 }], items);
    expect(r.dimensions.milestone.cut).toBe(50);
  });
});

describe('items to flip reads the instrument, not a constant', () => {
  const q = (tier, form = null, extra = {}) => ({ dimension: 'milestone', tier, form, options: [{ score: 0 }, { score: 4 }], ...extra });
  const v5 = [...Array.from({ length: 8 }, () => q('knowledge', 'A')), ...Array.from({ length: 8 }, () => q('knowledge', 'B')),
    ...Array.from({ length: 3 }, () => q('skill')), ...Array.from({ length: 5 }, () => q('skill', 'A')), ...Array.from({ length: 5 }, () => q('skill', 'B')),
    ...Array.from({ length: 5 }, () => q('behavior')), q('skill', 'A', { min_level: 'advanced' }), q('skill', null, { code: 'X', anchor_code: 'Y' })];
  it('counts one form, without level-gated items and twins', () => {
    expect(tierMaxPointsOf(v5, { dimension: 'milestone', form: 'A' })).toEqual({ knowledge: 32, skill: 32, behavior: 20 });
    expect(tierMaxPointsOf([], { dimension: 'milestone' })).toEqual(TIER_MAX_POINTS);
  });
  it('a question is worth less in an eight-item tier, so more questions separate the levels', () => {
    const pcts = { knowledge: 30, skill: 30, behavior: 30 };
    const ev = { ...pcts, ...evaluatePlacement(pcts, DEFAULT_MODEL) };
    const six = itemsToFlip(ev, DEFAULT_MODEL);
    const eight = itemsToFlip(ev, DEFAULT_MODEL, tierMaxPointsOf(v5, { dimension: 'milestone', form: 'A' }));
    expect(eight).toBeGreaterThan(six);
  });
});

describe('final evaluation: near-cut flag and optional project floor', () => {
  const comps = (project) => [
    { key: 'continuous', label: 'مستمر', value: 90 }, { key: 'milestones', label: 'معالم', value: 100 },
    { key: 'project', label: 'مشروع', value: project }, { key: 'post', label: 'بعدي', value: 90 },
  ];
  it('the floor is off by default and changes nothing', () => {
    expect(FINAL_DEFAULTS.project_floor).toBe(0);
    const r = computeFinal(comps(40), null);
    expect(r.suggested).toBe('pass');
    expect(r.floor_capped).toBe(false);
  });
  it('when set, a project below it turns pass into pass with notes, and never touches the score', () => {
    const off = computeFinal(comps(40), null);
    const on = computeFinal(comps(40), { project_floor: 60 });
    expect(on.suggested).toBe('pass_notes');
    expect(on.floor_capped).toBe(true);
    expect(on.score).toBe(off.score);
    expect(computeFinal(comps(80), { project_floor: 60 }).floor_capped).toBe(false);
  });
  it('flags a score within the margin of a decision cut, as information only', () => {
    const near = computeFinal(comps(40), { thresholds: { pass: 76, pass_notes: 60, extend: 45 } });
    expect(near.score).toBe(77);
    expect(near.near_cut).toMatchObject({ key: 'pass', cut: 76, gap: 1 });
    expect(near.suggested).toBe('pass');
    expect(computeFinal(comps(40), { near_cut: 0, thresholds: { pass: 76, pass_notes: 60, extend: 45 } }).near_cut).toBeNull();
    expect(finalConfig({ near_cut: 99 }).near_cut).toBe(20);
  });
});

describe('360: a gap from few raters is a discussion point', () => {
  const items = [{ id: 'q1', dimension: 'leadership', options: [0, 1, 2, 3, 4].map((score) => ({ score })) }];
  const s = { min_group: 3, min_others: 3, gap_points: 0.5, scale_labels: [] };
  const raters = (n) => Array.from({ length: n }, (_, i) => ({ status: 'submitted', relation: 'peer', email: `r${i}@x.sa`, answers: { q1: { now: 4 } } }));
  it('marks the gap firm only from the minimum number of non-manager raters', () => {
    expect(feedbackReport({ items, selfAnswers: { q1: 1 }, raters: raters(3), s }).gap_firm).toBe(false);
    expect(feedbackReport({ items, selfAnswers: { q1: 1 }, raters: raters(GAP_FIRM_MIN), s }).gap_firm).toBe(true);
  });
  it('a framework score is the mean of rater means, so a rater who judged more items weighs the same', () => {
    const two = [{ id: 'q1', dimension: 'leadership', options: items[0].options }, { id: 'q2', dimension: 'leadership', options: items[0].options }];
    const rs = [
      { status: 'submitted', relation: 'peer', answers: { q1: { now: 4 }, q2: { now: 4 } } },
      { status: 'submitted', relation: 'peer', answers: { q1: { now: 0 } } },
      { status: 'submitted', relation: 'peer', answers: { q1: { now: 0 } } },
    ];
    const r = feedbackReport({ items: two, selfAnswers: {}, raters: rs, s });
    // متوسطات المقيّمين 5 و1 و1 ← 2.3، لا متوسط الإجابات الأربع (5، 5، 1، 1 ← 3)
    expect(r.dims[0].cells.all.avg).toBe(2.3);
  });
});

describe('the evidence module stays advisory', () => {
  it('nothing that scores or decides imports it', () => {
    const dir = 'supabase/functions/leaders-api/';
    for (const f of ['logic.js', 'final.js', 'capstone.js', 'continuous.js', 'feedback360.js', 'participant.ts', 'final.ts']) {
      expect(fs.readFileSync(dir + f, 'utf8')).not.toMatch(/from '\.\/evidence\.js'/);
    }
  });
});
