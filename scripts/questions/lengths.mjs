// قرينة طول الخيار في فقرات الاختيار (D03): مقاييس صافية يقرؤها المتحقق والاختبارات.
// رتبة المفتاح: موضعه بين الخيارات مرتبةً بطولها تنازليًا (التعادل بالموضع)، 1 = الأطول. والمجيب الآلي يختار
// بالترتيب نفسه، فحصة الرتبة في خلية هي بالضبط ما يحصده مجيب تلك الرتبة من المفاتيح.
import { DEFAULT_MODEL, DIMENSIONS, evaluatePlacement, forForm, tierPercents } from '../../supabase/functions/leaders-api/logic.js';

export const MAX_RANK_SHARE = 0.35;
export const KEY_MEDIAN_BAND = 0.1;
export const CHI2_CRIT_DF3 = 7.815;   // α = 0.05
export const OVER_CHANCE = 10;
export const MAX_GAIN = 5;   // أقل من خطأ القياس: نصف فقرة معرفة تقريبًا، وتؤكده اللجنة
export const FORMS = ['A', 'B'];
export const INSTRUMENTS = ['baseline-v5', 'post-v3'];

export const len = (s) => [...String(s)].length;
export const keyIndex = (q) => q.options.findIndex((o) => Number(o.score) === 4);
export const order = (q) => q.options.map((o, i) => [len(o.label), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
export const keyRank = (q) => order(q).indexOf(keyIndex(q)) + 1;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return (s[1] + s[2]) / 2; };
export const keyBand = (q) => { const l = q.options.map((o) => len(o.label)); const m = median(l); return Math.round((l[keyIndex(q)] / m - 1) * 1000) / 10; };
export const isChoice = (q) => q.kind === 'choice' && q.options?.length === 4 && keyIndex(q) >= 0;

// الخلية: أداة × جانب × صيغة (الفقرات المشتركة بلا صيغة تدخل الصيغتين)
export function cells(items) {
  const out = [];
  for (const inst of INSTRUMENTS) for (const dim of DIMENSIONS) for (const form of FORMS) {
    const qs = forForm(items.filter((q) => q.instrument === inst && q.dimension === dim && isChoice(q)), form);
    if (!qs.length) continue;
    const counts = [0, 0, 0, 0];
    for (const q of qs) counts[keyRank(q) - 1]++;
    const e = qs.length / 4;
    const chi2 = Math.round(counts.reduce((a, c) => a + (c - e) ** 2 / e, 0) * 100) / 100;
    out.push({ cell: `${inst}|${dim}|${form}`, n: qs.length, counts, max_share: Math.max(...counts) / qs.length, chi2 });
  }
  return out;
}

// المجيبون الآليون: الأطول، وثاني الأطول، والأقصر، والأوسط (الأقرب إلى وسيط الأطوال). في عبارات السلوك الذاتية
// يختار أعلى درجة، وهو أسوأ الاحتمالات للتسكين
export const STRATEGIES = {
  longest: (q) => order(q)[0],
  second: (q) => order(q)[1],
  shortest: (q) => order(q)[3],
  middle: (q) => { const l = q.options.map((o) => len(o.label)); const m = median(l); return l.map((v, i) => [Math.abs(v - m), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0][1]; },
};
const top = (q) => q.options.reduce((b, o, i, a) => (Number(o.score) > Number(a[b].score) ? i : b), 0);
export function answersFor(qs, strategy) {
  return Object.fromEntries(qs.map((q) => [q.id, isChoice(q) ? STRATEGIES[strategy](q) : top(q)]));
}
const chanceOf = (qs) => { const got = qs.reduce((a, q) => a + q.options.reduce((s, o) => s + Math.max(0, Number(o.score)), 0) / q.options.length, 0); return Math.round((100 * got) / (qs.length * 4) * 10) / 10; };

export function responders(items, model = DEFAULT_MODEL) {
  const out = [];
  for (const inst of INSTRUMENTS) for (const form of FORMS) {
    const qs = forForm(items.filter((q) => q.instrument === inst && ['knowledge', 'skill', 'behavior'].includes(q.tier)), form)
      .map((q) => ({ ...q, options: q.options.map((o) => ({ ...o, score: Number(o.score) })) }));
    for (const s of Object.keys(STRATEGIES)) {
      const answers = answersFor(qs, s);
      const pcts = tierPercents(qs, answers);
      const levels = Object.fromEntries(DIMENSIONS.map((d) => [d, evaluatePlacement(pcts[d] || {}, model).level]));
      const cellsOut = DIMENSIONS.flatMap((d) => ['knowledge', 'skill'].map((t) => {
        const tq = qs.filter((q) => q.dimension === d && q.tier === t && isChoice(q));
        return tq.length ? { dim: d, tier: t, pct: pcts[d]?.[t] ?? null, chance: chanceOf(tq) } : null;
      }).filter(Boolean));
      out.push({ instrument: inst, form, strategy: s, levels, cells: cellsOut });
    }
  }
  return out;
}

// المكسب الآلي: المجيب نفسه على القبلي بصيغة والبعدي بالأخرى، بالمعرفة والمواقف (القياس النهائي بالإتقان)
export function gains(items) {
  const rs = responders(items);
  const objective = (r, d) => { const c = r.cells.filter((x) => x.dim === d && x.pct != null); return c.length ? c.reduce((a, x) => a + x.pct, 0) / c.length : null; };
  const out = [];
  for (const s of Object.keys(STRATEGIES)) for (const [fa, fb] of [['A', 'B'], ['B', 'A']]) {
    const pre = rs.find((r) => r.instrument === 'baseline-v5' && r.form === fa && r.strategy === s);
    const post = rs.find((r) => r.instrument === 'post-v3' && r.form === fb && r.strategy === s);
    for (const d of DIMENSIONS) {
      const a = objective(pre, d), b = objective(post, d);
      if (a != null && b != null) out.push({ strategy: s, pre_form: fa, dim: d, gain: Math.round((b - a) * 10) / 10 });
    }
  }
  return out;
}
