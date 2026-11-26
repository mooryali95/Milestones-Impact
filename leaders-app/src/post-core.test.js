// تصور طول القياس البعدي (docs/content/2026-11-26-تصور-طول-القياس-البعدي-v1.md)، المرحلتان 2 و3:
// الصيغة القصيرة تقدم النواة وحدها خلف مفتاح مطفأ، والفرق يُحسب على تقاطع ما قُدّم في القياسين، و«لم تُقس» لمكتسبات المستوى.
import { describe, expect, it } from 'vitest';
import {
  anchorRepeat, LEVEL_RANK, levelGainReport, NOT_MEASURED_AR, placementFromAnswers, postPool, postShortOn, preOnPost, servedPost, isTwin,
} from '../../supabase/functions/leaders-api/logic.js';
import { resolveSettings } from '../../supabase/functions/leaders-api/settings.js';
import BANK from '../../supabase/content/questions/v4.2/items.json';
import CORE_SQL from '../../supabase/migrations/20261130010000_leaders_post_core.sql?raw';
import FORM_SQL from '../../supabase/migrations/20261130020000_leaders_post_form.sql?raw';

// نسخة servedPost قبل الصيغة القصيرة حرفيًا: المرجع الذي يُقارن به السلوك والمفتاح مطفأ
function legacyServedPost(questions, { levels = {}, repeat = false } = {}) {
  const qs = questions || [];
  const twinned = new Set(qs.filter(isTwin).map((q) => q.anchor_code));
  return qs.filter((q) => {
    if (q.min_level && (LEVEL_RANK[q.min_level] ?? 9) > (LEVEL_RANK[levels[q.dimension]] ?? LEVEL_RANK.beginner)) return false;
    if (isTwin(q)) return !repeat;
    if (twinned.has(q.code)) return repeat;
    return true;
  });
}

const choice = (id, dimension, tier, extra = {}) => ({ id, code: id, dimension, tier, kind: 'choice', options: [{ score: 0 }, { score: 4 }], ...extra });
const POST = BANK.filter((q) => q.instrument === 'post-v2' && q.active !== false);

describe('servedPost والمفتاح مطفأ: السلوك نفسه حرفيًا', () => {
  const cases = [{}, { levels: { milestone: 'advanced' } }, { levels: { impact: 'intermediate', leadership: 'advanced' }, repeat: true }, { repeat: false }];
  it.each(cases.map((c, i) => [i, c]))('الحالة %s: short غائب أو false يعيد ما كان يعيده', (_i, opts) => {
    // نواة معلّمة على بعض الفقرات لا تغير شيئًا ما دامت القصيرة غير مطلوبة
    const bank = POST.map((q, i) => ({ ...q, core: i % 3 === 0 }));
    const before = legacyServedPost(bank, opts);
    expect(servedPost(bank, opts)).toEqual(before);
    expect(servedPost(bank, { ...opts, short: false })).toEqual(before);
  });
});

describe('servedPost القصيرة: النواة وحدها، والتوأم والتكرار داخلها', () => {
  const qs = [
    choice('s1', 'milestone', 'skill', { code: 'M-S1', anchor_code: 'M-S1', core: true }),
    choice('s1t', 'milestone', 'skill', { code: 'M-S1T', anchor_code: 'M-S1', core: true }),
    choice('s2', 'milestone', 'skill', { code: 'M-S2', anchor_code: 'M-S2' }),
    choice('k1', 'milestone', 'knowledge', { code: 'M-K1', anchor_code: 'M-K1', core: true }),
    choice('k9', 'milestone', 'knowledge', { code: 'M-K9', min_level: 'intermediate', core: false }),
    choice('t1', 'leadership', 'transfer', { code: 'T-1', core: true }),
  ];
  it('الأغلبية ترى التوأم داخل النواة، ومجموعة التكرار ترى الأصل', () => {
    expect(servedPost(qs, { short: true }).map((q) => q.id)).toEqual(['s1t', 'k1', 't1']);
    expect(servedPost(qs, { short: true, repeat: true }).map((q) => q.id)).toEqual(['s1', 'k1', 't1']);
  });
  it('فقرة المستوى خارج النواة لا تُقدم ولو اعتُمد المستوى، والممتدة تبقى في الكاملة', () => {
    expect(servedPost(qs, { short: true, levels: { milestone: 'advanced' } }).some((q) => q.id === 'k9')).toBe(false);
    expect(servedPost(qs, { levels: { milestone: 'advanced' } }).map((q) => q.id)).toEqual(['s1t', 's2', 'k1', 'k9', 't1']);
  });
  it('القصيرة جزء من الكاملة دائمًا، فالتحقق عند الإجابة بالكاملة يقبل النواة والممتدة', () => {
    for (const repeat of [true, false]) {
      const full = new Set(servedPost(qs, { repeat, levels: { milestone: 'advanced' } }).map((q) => q.id));
      expect(servedPost(qs, { short: true, repeat }).every((q) => full.has(q.id))).toBe(true);
    }
  });
  it('anchorRepeat ثابت ولا يتغير بالصيغة', () => {
    expect(anchorRepeat('p1')).toBe(anchorRepeat('p1'));
  });
});

describe('مفتاح الصيغة القصيرة', () => {
  it('مطفأ افتراضيًا، ومن مخزن غائب أو تالف', () => {
    expect(postShortOn(resolveSettings([]))).toBe(false);
    expect(postShortOn(null)).toBe(false);
    expect(postShortOn(resolveSettings([{ key: 'post_form', value: { short: 'yes' } }]))).toBe(false);
    expect(postShortOn(resolveSettings([{ key: 'post_form', value: { short: true } }]))).toBe(true);
  });
});

describe('الفرق على التقاطع', () => {
  const pre = [
    choice('p1', 'milestone', 'knowledge', { code: 'M-K1' }),
    choice('p2', 'milestone', 'knowledge', { code: 'M-K2', form: 'A' }),
    choice('p2b', 'milestone', 'knowledge', { code: 'M-K2B', form: 'B' }),
    choice('p3', 'milestone', 'skill', { code: 'M-S1' }),
  ];
  const post = [
    choice('q1', 'milestone', 'knowledge', { code: 'M-K1', anchor_code: 'M-K1', core: true }),
    choice('q2', 'milestone', 'knowledge', { code: 'M-K2', anchor_code: 'M-K2', form: 'A' }),
    choice('q2b', 'milestone', 'knowledge', { code: 'M-K2B', anchor_code: 'M-K2B', form: 'B' }),
    choice('q3', 'milestone', 'skill', { code: 'M-S1', anchor_code: 'M-S1', core: true }),
    choice('q3t', 'milestone', 'skill', { code: 'M-S1T', anchor_code: 'M-S1', core: true }),
  ];
  it('الكاملة (أو null) تبقي القبلي كله، فالبعدي الكامل الحالي لا يتغير', () => {
    expect(preOnPost(pre, postPool(post, null))).toEqual(pre);
    expect(preOnPost(pre, postPool(post, 'full'))).toEqual(pre);
  });
  it('القصيرة تقصر القبلي على مقابلات النواة، والتوأم يقابل أصله', () => {
    expect(preOnPost(pre, postPool(post, 'short')).map((q) => q.id)).toEqual(['p1', 'p3']);
  });
  it('النسب على التقاطع: القبلي المقصور يساوي حساب القبلي الكامل حين يكون التقاطع كله', () => {
    const ans = { p1: 1, p2: 1, p3: 0 };
    const model = undefined;
    const all = placementFromAnswers(pre, ans, [], model);
    expect(placementFromAnswers(preOnPost(pre, postPool(post, 'full')), ans, [], model)).toEqual(all);
    const short = placementFromAnswers(preOnPost(pre, postPool(post, 'short')), ans, [], model);
    expect(short.find((r) => r.dimension === 'milestone').knowledge).toBe(100);
  });
});

describe('مكتسبات المستوى في القصيرة: «لم تُقس»', () => {
  it('بلا صيغة أو بالكاملة لا يتغير شيء', () => {
    const post = { milestone: { level_gain: 50, level_gain_n: 4, level_gain_level: 'advanced' } };
    expect(levelGainReport(post)).toEqual(levelGainReport(post, { form: 'full' }));
    expect(levelGainReport({}).milestone).toBeNull();
  });
  it('القصيرة بلا إجابة ممتدة تُعرض «لم تُقس» دون رقم، ومن أجاب الممتدة يُعرض رقمه', () => {
    const r = levelGainReport({ milestone: { level_gain: null } }, { form: 'short' });
    expect(NOT_MEASURED_AR).toBe('لم تُقس');
    expect(r.milestone).toMatchObject({ pct: null, not_measured: true, text_ar: 'لم تُقس' });
    expect(r.impact).toMatchObject({ not_measured: true });
    expect(levelGainReport({ milestone: { level_gain: 60, level_gain_n: 2 } }, { form: 'short' }).milestone.pct).toBe(60);
  });
});

describe('الترحيلان', () => {
  it('علم النواة: عمود بقيمة افتراضية وفهرس، متسامح، وسجل الترحيل', () => {
    expect(CORE_SQL).toMatch(/^-- deploy-gate: tolerant/);
    expect(CORE_SQL).toMatch(/add column if not exists core boolean not null default false/);
    expect(CORE_SQL).toMatch(/create index if not exists \w+ on leaders\.questions \(instrument_id, core\)/);
    expect(CORE_SQL).toMatch(/insert into leaders\.schema_migrations \(name\) values \('20261130010000_leaders_post_core'\)/);
  });
  it('عمود الصيغة بقيده وعدد المقدم، ولا يغير صفًا', () => {
    expect(FORM_SQL).toMatch(/^-- deploy-gate: tolerant/);
    expect(FORM_SQL).toMatch(/add column if not exists post_form text/);
    expect(FORM_SQL).toMatch(/post_form in \('short', 'full'\)/);
    expect(FORM_SQL).toMatch(/add column if not exists served_count integer/);
    expect(FORM_SQL).not.toMatch(/\bupdate\s+leaders\./i);
    expect(FORM_SQL).toMatch(/insert into leaders\.schema_migrations \(name\) values \('20261130020000_leaders_post_form'\)/);
  });
});
