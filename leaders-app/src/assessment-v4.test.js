// baseline-v4 وpost-v2: النموذجان المتوازيان، وخصم أثر التكرار، والثبات
// الطبقي، والحكم على المؤشر الكلي، وتقدير المدير قبل البرنامج
import { describe, expect, it } from 'vitest';
import {
  commonBehavior, compareAssessments, compositeReliability, equate, forForm, formFor, formOffsets, impactVerdict,
  itemAnalysis, overallChange, practiceEffect, raterProspective, reliableChange, skillSplit, spearmanBrown, tierPercents,
  usesForms,
} from '../../supabase/functions/leaders-api/logic.js';
import V4_SQL from '../../supabase/migrations/20261026090000_leaders_assessment_v4.sql?raw';

const DIMS = ['milestone', 'impact', 'leadership'];
const S = "'((?:[^']|'')*)'";
const unq = (x) => x.replace(/''/g, "'");
const V4 = [...V4_SQL.matchAll(new RegExp(`^  \\('(\\w+)', '([\\w-]+)', '(\\w+)', (?:null|'([AB])'), (\\d+), ${S}, (?:null|${S}), ${S}, '(\\w+)', (?:null|${S})\\)`, 'gm'))]
  .map(([, dimension, code, tier, form, sort, text, opts, competency, chapter, rater]) => ({
    id: code, dimension, code, tier, form: form || null, sort: Number(sort), text: unq(text), competency: unq(competency), chapter,
    rater: rater ? unq(rater) : null, options: opts ? JSON.parse(unq(opts)) : null,
  }));
const keyIndex = (q) => q.options.findIndex((o) => o.score === Math.max(...q.options.map((x) => x.score)));
const lengthRank = (q, k) => [...q.options.keys()].sort((a, b) => q.options[b].label.length - q.options[a].label.length).indexOf(k);

describe('baseline-v4 bank', () => {
  it('has the blueprint: common practice and anchors, then parallel items per form', () => {
    expect(V4).toHaveLength(75);
    for (const d of DIMS) {
      const of = (tier, form) => V4.filter((q) => q.dimension === d && q.tier === tier && q.form === form);
      expect(of('behavior', null)).toHaveLength(4);
      expect(of('skill', null)).toHaveLength(3);
      for (const f of ['A', 'B']) {
        expect(of('skill', f)).toHaveLength(3);
        expect(of('knowledge', f)).toHaveLength(6);
        expect(of('behavior', f)).toHaveLength(0);
      }
    }
  });
  it('gives each form a twin of the same competency and chapter', () => {
    for (const b of V4.filter((q) => q.form === 'B')) {
      const a = V4.find((q) => q.code === b.code.replace(/B$/, ''));
      expect(a?.form, b.code).toBe('A');
      expect([a.dimension, a.tier, a.competency, a.chapter]).toEqual([b.dimension, b.tier, b.competency, b.chapter]);
    }
  });
  it('words every practice item for the manager and leaves options to the shared scale', () => {
    for (const q of V4.filter((x) => x.tier === 'behavior')) {
      expect(q.rater, q.code).toBeTruthy();
      expect(q.options).toBeNull();
    }
  });
  it('spreads the key across option length ranks within every form', () => {
    for (const d of DIMS) {
      for (const t of ['skill', 'knowledge']) {
        for (const f of ['A', 'B']) {
          const ranks = [0, 0, 0, 0];
          for (const q of forForm(V4, f).filter((x) => x.dimension === d && x.tier === t)) ranks[lengthRank(q, keyIndex(q))] += 1;
          expect(Math.max(...ranks), `${d} ${t} ${f}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });
  it('anchors the post instrument to the baseline codes and adds transfer items', () => {
    expect(V4_SQL).toMatch(/q\.code as anchor_code|anchor_code/);
    expect(V4_SQL).toMatch(/'T-5'/);
    expect(V4_SQL).toMatch(/pairs_with/);
  });
});

describe('forms', () => {
  it('assigns a stable form and flips it after the baseline', () => {
    expect(['A', 'B']).toContain(formFor('p1'));
    expect(formFor('p1')).toBe(formFor('p1'));
    expect(formFor('x', 'A')).toBe('B');
    expect(formFor('x', 'B')).toBe('A');
    const seen = new Set(Array.from({ length: 40 }, (_, i) => formFor(`p${i}`)));
    expect(seen.size).toBe(2);
  });
  it('serves common items plus the own form only', () => {
    const qs = [{ id: 1, form: null }, { id: 2, form: 'A' }, { id: 3, form: 'B' }];
    expect(forForm(qs, 'A').map((q) => q.id)).toEqual([1, 2]);
    expect(usesForms(qs)).toBe(true);
    expect(usesForms([{ id: 1 }])).toBe(false);
  });
});

const likert = (id, dimension, extra = {}) => ({
  id, dimension, tier: 'behavior', kind: 'likert', code: id,
  options: [0, 1, 2, 3, 4].map((score) => ({ label: `l${score}`, score })).concat({ label: 'na', score: -1 }), ...extra,
});
const choice = (id, dimension, tier, extra = {}) => ({
  id, dimension, tier, kind: 'choice', code: id, options: [{ label: 'a', score: 0 }, { label: 'b', score: 4 }], ...extra,
});

describe('minimum practice items', () => {
  const qs = ['b1', 'b2', 'b3', 'b4'].map((id) => likert(id, 'milestone'));
  it('drops the practice score when fewer than the minimum are answered', () => {
    expect(tierPercents(qs, { b1: 4, b2: 4, b3: 5, b4: 5 }, { minBehavior: 3 }).milestone.behavior).toBeNull();
    expect(tierPercents(qs, { b1: 4, b2: 4, b3: 4, b4: 5 }, { minBehavior: 3 }).milestone.behavior).toBe(100);
  });
});

describe('skillSplit and commonBehavior', () => {
  it('separates anchor situations from form situations', () => {
    const qs = [choice('s1', 'impact', 'skill'), choice('s2', 'impact', 'skill', { form: 'A' })];
    const r = skillSplit(qs, { s1: 1, s2: 0 });
    expect(r.impact).toEqual({ anchor: 100, form: 0 });
  });
  it('compares practice on items answered both times only', () => {
    const pre = [likert('b1', 'leadership'), likert('b2', 'leadership')];
    const post = [likert('p1', 'leadership', { anchor_code: 'b1' }), likert('p2', 'leadership', { anchor_code: 'b2' })];
    const r = commonBehavior(pre, { b1: 1, b2: 5 }, post, { p1: 3, p2: 4 });
    expect(r.leadership).toEqual({ pre: 25, post: 75 });
  });
});

describe('practice effect', () => {
  it('adjusts the reliable change index for retest gains', () => {
    const plain = reliableChange(50, 60, 15, 0.75);
    const adjusted = reliableChange(50, 60, 15, 0.75, 4);
    expect(adjusted.rci).toBeLessThan(plain.rci);
    expect(adjusted.threshold).toBeGreaterThan(plain.threshold);
  });
  it('estimates practice from anchor gains beyond form gains', () => {
    const pairs = [
      { pre: { anchor: 50, form: 50 }, post: { anchor: 70, form: 60 } },
      { pre: { anchor: 40, form: 40 }, post: { anchor: 60, form: 50 } },
      { pre: { anchor: null, form: 40 }, post: { anchor: 60, form: 50 } },
    ];
    expect(practiceEffect(pairs)).toEqual({ n: 2, points: 5 });
    expect(practiceEffect([{ pre: { anchor: 60, form: 40 }, post: { anchor: 50, form: 60 } }]).points).toBe(0);
  });
});

describe('equating', () => {
  it('needs enough people on both forms', () => {
    expect(formOffsets([{ form: 'A', dims: {} }], { minN: 2 })).toBeNull();
  });
  it('moves each form to the shared mean', () => {
    const res = [
      { form: 'A', dims: { milestone: { knowledge: 60, skill: 50 } } },
      { form: 'A', dims: { milestone: { knowledge: 70, skill: 50 } } },
      { form: 'B', dims: { milestone: { knowledge: 50, skill: 50 } } },
      { form: 'B', dims: { milestone: { knowledge: 60, skill: 50 } } },
    ];
    const o = formOffsets(res, { minN: 2 });
    expect(o.A.milestone).toEqual({ knowledge: 5, skill: 0 });
    expect(o.B.milestone.knowledge).toBe(-5);
    const r = equate({ milestone: { knowledge: 98, skill: 40, behavior: 70 } }, 'B', o);
    expect(r.milestone).toEqual({ knowledge: 100, skill: 40, behavior: 70 });
    expect(equate({ x: 1 }, null, o)).toEqual({ x: 1 });
  });
});

describe('compositeReliability', () => {
  it('pools forms and returns a stratified alpha per framework and overall', () => {
    const qs = [];
    for (const d of DIMS) {
      for (let i = 0; i < 3; i++) {
        qs.push(likert(`${d}-b${i}`, d));
        qs.push(choice(`${d}-s${i}`, d, 'skill'));
        qs.push(choice(`${d}-kA${i}`, d, 'knowledge', { form: 'A' }));
        qs.push(choice(`${d}-kB${i}`, d, 'knowledge', { form: 'B' }));
      }
    }
    const rows = [];
    const forms = {};
    for (let p = 0; p < 20; p++) {
      const aid = `a${p}`;
      forms[aid] = p % 2 ? 'B' : 'A';
      const ability = p / 19;
      for (const q of forForm(qs, forms[aid])) {
        const noise = ((p * 7 + q.id.length * 3) % 5) / 10;
        const score = q.tier === 'behavior' ? Math.round(4 * Math.min(1, ability + noise / 2)) : ability + noise > 0.6 ? 4 : 0;
        rows.push({ assessment_id: aid, question_id: q.id, score });
      }
    }
    const r = compositeReliability(qs, rows, { forms });
    for (const d of DIMS) {
      expect(r.dims[d].n).toBe(20);
      expect(r.dims[d].alpha).toBeGreaterThan(0.5);
      expect(r.dims[d].alpha).toBeLessThanOrEqual(1);
    }
    expect(r.overall.alpha).toBeGreaterThanOrEqual(Math.min(...DIMS.map((d) => r.dims[d].alpha)));
  });
  it('raises reliability with length by Spearman and Brown', () => {
    expect(spearmanBrown(0.75, 3)).toBe(0.9);
  });
});

describe('verdict sources', () => {
  it('confirms only with an external source not built on recall', () => {
    expect(impactVerdict({ self: 'up', rater: 'up' }).key).toBe('emerging');
    expect(impactVerdict({ self: 'up', rater: 'up', raterProspective: true }).key).toBe('confirmed');
    expect(impactVerdict({ self: 'up', test: 'up' }).key).toBe('confirmed');
  });
  it('rates the manager before and after on the same items', () => {
    const pre = [likert('b1', 'milestone', { text_rater_ar: 'x' })];
    const post = [likert('p1', 'milestone', { anchor_code: 'b1' })];
    const r = raterProspective(pre, { b1: { now: 1 } }, post, { p1: { now: 4 } });
    expect(r.milestone).toEqual({ now: 100, before: 25, prospective: true });
    expect(r.impact).toBeNull();
  });
});

describe('overallChange', () => {
  const dim = (pre, post, extra = {}) => ({ composite_pre: pre, composite_post: post, practice: 0, ...extra });
  it('judges the overall composite with its higher reliability', () => {
    const dims = [dim(50, 65), dim(50, 65), dim(50, 65)];
    const one = reliableChange(50, 65, 15, 0.75);
    const all = overallChange(dims, {});
    expect(one.direction).toBe('flat');
    expect(all.direction).toBe('up');
    expect(all.change).toBe(15);
  });
  it('needs all three frameworks', () => {
    expect(overallChange([dim(50, 60), dim(50, 60)], {})).toBeNull();
  });
  it('confirms with a prospective manager rating', () => {
    const r = { now: 80, before: 50, prospective: true };
    const dims = [0, 1, 2].map(() => dim(50, 60, { self_change: 20, rater: r }));
    expect(overallChange(dims, {}).verdict.key).toBe('confirmed');
    const retro = [0, 1, 2].map(() => dim(50, 60, { self_change: 20, rater: { ...r, prospective: false } }));
    expect(overallChange(retro, {}).verdict.key).toBe('emerging');
  });
});

describe('compareAssessments with practice', () => {
  it('subtracts the configured practice points', () => {
    const pre = { milestone: { knowledge: 50, skill: 50, behavior: 50 } };
    const post = { milestone: { knowledge: 60, skill: 70, behavior: 60 } };
    const m = (impact) => compareAssessments({ pre, post, impact }).find((y) => y.dimension === 'milestone');
    expect(m({ rci_practice: 10 }).practice).toBeGreaterThan(0);
    expect(m({ rci_practice: 10 }).rci).toBeLessThan(m({}).rci);
    expect(m({ rci_practice: 10, practice: { milestone: 0 } }).practice).toBe(0);
  });
});

describe('itemAnalysis by form', () => {
  it('computes alpha within each form instead of across missing items', () => {
    const qs = [choice('a1', 'milestone', 'knowledge', { form: 'A' }), choice('a2', 'milestone', 'knowledge', { form: 'A' }),
      choice('b1', 'milestone', 'knowledge', { form: 'B' }), choice('b2', 'milestone', 'knowledge', { form: 'B' })];
    const rows = [];
    const forms = {};
    for (let p = 0; p < 12; p++) {
      const aid = `x${p}`;
      forms[aid] = p % 2 ? 'B' : 'A';
      const s = p < 6 ? 0 : 4;
      for (const q of forForm(qs, forms[aid])) rows.push({ assessment_id: aid, question_id: q.id, score: s });
    }
    const r = itemAnalysis(qs, rows, { minN: 3, forms });
    const d = r.dimensions.find((x) => x.dimension === 'milestone');
    expect(d.complete).toBe(12);
    expect(d.alpha).toBe(1);
  });
});
