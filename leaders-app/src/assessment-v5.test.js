// القياس v5 (المرحلة ج): 8 معرفة و8 مواقف لكل بُعد في كل صيغة، وعبارة ممارسة معكوسة
// لكل بُعد تُحسب بدرجات الخيارات وحدها (4→0) دون تغيير في المحرك.
import { describe, expect, it } from 'vitest';
import { acquiescenceFor, forForm, pairComparable, scoreFor, tierPercents } from '../../supabase/functions/leaders-api/logic.js';
import BANK from '../../supabase/content/questions/v5/items.json';
import V5_SQL from '../../supabase/migrations/20261102100000_leaders_instruments_v5.sql?raw';
import ACT_SQL from '../../supabase/migrations/20261102100100_leaders_activate_v5.sql?raw';

const BASE = BANK.filter((q) => q.instrument === 'baseline-v5');
const POST = BANK.filter((q) => q.instrument === 'post-v3');
const isReverse = (q) => q.kind === 'likert' && Number(q.options[0].score) === 4;

describe('بنية v5', () => {
  it('8 معرفة و8 مواقف لكل بُعد في كل صيغة من المبدئي', () => {
    for (const form of ['A', 'B']) for (const d of ['milestone', 'impact', 'leadership']) {
      const qs = forForm(BASE, form).filter((q) => q.dimension === d);
      expect(qs.filter((q) => q.tier === 'knowledge')).toHaveLength(8);
      expect(qs.filter((q) => q.tier === 'skill')).toHaveLength(8);
      expect(qs.filter((q) => q.tier === 'behavior')).toHaveLength(5);
    }
  });
  it('عبارة معكوسة واحدة لكل بُعد في الأداتين، بصيغة الغائب وإرشاد', () => {
    for (const set of [BASE, POST]) {
      const rev = set.filter(isReverse);
      expect(rev.map((q) => q.dimension).sort()).toEqual(['impact', 'leadership', 'milestone']);
      for (const q of rev) {
        expect(q.options.map((o) => o.score)).toEqual([4, 3, 2, 1, 0, -1]);
        expect(q.help_ar).toBeTruthy();
        expect(q.text_rater_ar).toBeTruthy();
      }
    }
    expect(POST.filter(isReverse).every((q) => q.retro && q.anchor_code === q.code)).toBe(true);
  });
});

describe('العبارة المعكوسة في الحساب', () => {
  const qs = BASE.filter((q) => q.dimension === 'leadership' && q.tier === 'behavior');
  const rev = qs.find(isReverse);
  it('«نادرًا أو أبدًا» على المعكوسة = 4، و«في كل المرات تقريبًا» = 0', () => {
    expect(scoreFor(rev, 0)).toBe(4);
    expect(scoreFor(rev, 4)).toBe(0);
    expect(scoreFor(rev, 5)).toBe(-1);
  });
  it('المذعن (الخيار الخامس في كل العبارات) لا يبلغ 100% في الممارسة ويُعلَّم مذعنًا', () => {
    const answers = Object.fromEntries(qs.map((q) => [q.id, 4]));
    expect(tierPercents(qs, answers).leadership.behavior).toBe(80);
    expect(acquiescenceFor(qs, answers).leadership).toBe(true);
  });
  it('«لا ينطبق» على المعكوسة يستبعدها كغيرها', () => {
    const answers = Object.fromEntries(qs.map((q) => [q.id, q === rev ? 5 : 4]));
    expect(tierPercents(qs, answers).leadership.behavior).toBe(100);
  });
});

describe('ترحيلا v5', () => {
  it('الأداتان تُنشآن غير مفعّلتين، وpost-v3 يقابل baseline-v5', () => {
    expect(V5_SQL).toMatch(/'baseline-v5', title_ar, kind, false, 5/);
    expect(V5_SQL).toMatch(/'post-v3', title_ar, kind, false, 3, intro_ar, est_minutes \+ 4, 'baseline-v5'/);
    expect(V5_SQL).not.toMatch(/set active/);
    expect(pairComparable({ key: 'baseline-v5' }, { pairs_with: 'baseline-v5' }).comparable).toBe(true);
    expect(pairComparable({ key: 'baseline-v4' }, { pairs_with: 'baseline-v5' }).comparable).toBe(false);
  });
  it('التفعيل يُبقي post-v2 لمن بدأ على baseline-v4', () => {
    expect(ACT_SQL).toMatch(/active = \(key = 'baseline-v5'\) where kind = 'baseline'/);
    expect(ACT_SQL).toMatch(/active = \(key in \('post-v3', 'post-v2'\)\) where kind = 'post'/);
  });
  it('كل فقرة في الترحيل بمعرّفها من البنك', () => {
    for (const q of BANK) expect(V5_SQL).toContain(q.id);
  });
});

import { acquiescenceFor as acqFor, topLabelIndex } from '../../supabase/functions/leaders-api/logic.js';
describe('الإذعان مع العبارة المعكوسة', () => {
  const labels = ['نادرًا', 'أقل من النصف', 'النصف', 'أغلب', 'كل المرات'];
  const fwd = (id) => ({ id, dimension: 'impact', tier: 'behavior', options: [...labels.map((label, i) => ({ label, score: i })), { label: 'لا ينطبق', score: -1 }] });
  const rev = (id) => ({ id, dimension: 'impact', tier: 'behavior', options: [...labels.map((label, i) => ({ label, score: 4 - i })), { label: 'لا ينطبق', score: -1 }] });
  const qs = [fwd('a'), fwd('b'), fwd('c'), fwd('d'), rev('r')];
  it('موضع «أعلى تكرار» واحد في المباشرة والمعكوسة', () => {
    expect(topLabelIndex(fwd('x'))).toBe(4);
    expect(topLabelIndex(rev('x'))).toBe(4);
  });
  it('من يختار «كل المرات» في كل العبارات يُعلَّم مذعنًا رغم العبارة المعكوسة', () => {
    expect(acqFor(qs, { a: 4, b: 4, c: 4, d: 4, r: 4 }).impact).toBe(true);
  });
  it('من يجيب المعكوسة بصدق لا يُعلَّم', () => {
    expect(acqFor(qs, { a: 4, b: 4, c: 4, d: 4, r: 0 }).impact).toBe(false);
  });
});
