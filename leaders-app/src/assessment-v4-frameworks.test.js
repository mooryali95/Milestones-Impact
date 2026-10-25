// مواءمة baseline-v4 مع إطار القيادة v2: الأسئلة المستبدلة تحفظ مخطط البنك
import { describe, expect, it } from 'vitest';
import { forForm } from '../../supabase/functions/leaders-api/logic.js';
import V4_SQL from '../../supabase/migrations/20261026090000_leaders_assessment_v4.sql?raw';
import FIX_SQL from '../../supabase/migrations/20261026100000_leaders_assessment_v4_frameworks.sql?raw';
import V2_SQL from '../../supabase/migrations/20261025230000_leaders_frameworks_v2.sql?raw';

const S = "'((?:[^']|'')*)'";
const unq = (x) => x.replace(/''/g, "'");
const V4 = [...V4_SQL.matchAll(new RegExp(`^  \\('(\\w+)', '([\\w-]+)', '(\\w+)', (?:null|'([AB])'), (\\d+), ${S}, (?:null|${S}), ${S}, '(\\w+)', (?:null|${S})\\)`, 'gm'))]
  .map(([, dimension, code, tier, form, , text, opts, competency, chapter]) => ({
    dimension, code, tier, form: form || null, text: unq(text), competency: unq(competency), chapter,
    options: opts ? JSON.parse(unq(opts)) : null,
  }));
const FIX = [...FIX_SQL.matchAll(new RegExp(`^  \\('([\\w-]+)', ${S}, ${S}, ${S}, ${S}, '(\\w+)'\\)`, 'gm'))]
  .map(([, code, old, text, opts, competency, chapter]) => ({
    code, old: unq(old), text: unq(text), options: JSON.parse(unq(opts)), competency: unq(competency), chapter,
  }));
const BANK = V4.map((q) => {
  const f = FIX.find((x) => x.code === q.code);
  return f ? { ...q, text: f.text, options: f.options, competency: f.competency, chapter: f.chapter } : q;
});
const keyIndex = (q) => q.options.findIndex((o) => o.score === Math.max(...q.options.map((x) => x.score)));
const lengthRank = (q, k) => [...q.options.keys()].sort((a, b) => q.options[b].label.length - q.options[a].label.length).indexOf(k);

describe('baseline-v4 aligned with leadership v2', () => {
  it('replaces only existing items, matching their original text', () => {
    expect(FIX.map((f) => f.code)).toEqual(['L-K7', 'L-K7B', 'L-K8', 'L-K8B']);
    for (const f of FIX) expect(V4.find((q) => q.code === f.code)?.text, f.code).toBe(f.old);
  });
  it('keeps one keyed option and twins on the same competency and chapter', () => {
    for (const f of FIX) {
      expect(f.options).toHaveLength(4);
      expect(f.options.filter((o) => o.score === 4)).toHaveLength(1);
    }
    for (const b of BANK.filter((q) => q.form === 'B')) {
      const a = BANK.find((q) => q.code === b.code.replace(/B$/, ''));
      expect([a.competency, a.chapter], b.code).toEqual([b.competency, b.chapter]);
    }
  });
  it('still spreads the key across option length ranks', () => {
    for (const t of ['skill', 'knowledge']) {
      for (const f of ['A', 'B']) {
        const ranks = [0, 0, 0, 0];
        for (const q of forForm(BANK, f).filter((x) => x.dimension === 'leadership' && x.tier === t)) ranks[lengthRank(q, keyIndex(q))] += 1;
        expect(Math.max(...ranks), `${t} ${f}`).toBeLessThanOrEqual(2);
      }
    }
  });
  it('asks only about what the leadership handbook teaches', () => {
    const lead = BANK.filter((q) => q.dimension === 'leadership').map((q) => q.text).join(' ');
    expect(lead).not.toMatch(/RACI|كوتر/);
    expect(V2_SQL).toMatch(/Bass و Avolio/);
    expect(V2_SQL).toMatch(/\*\*توجيه\*\*[\s\S]*\*\*مواءمة\*\*[\s\S]*\*\*التزام\*\*/);
  });
});
