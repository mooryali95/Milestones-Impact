// ════════════════════════════════════════════════════════════════
// أدلة القياس: ما يثبت أن الأداة تعمل، محسوبًا من بيانات الدفعة
// ════════════════════════════════════════════════════════════════
// منطق صافٍ بلا قاعدة بيانات (يُختبر في leaders-app/src/evidence.test.js). كل ما هنا استشاري:
// لا يدخل درجة ولا يغيّر مستوى ولا قرارًا، ويحرس ذلك الاختبار نفسه. المرجع: خارطة آفاق القياس
// (docs/audit/2026-11-13-خارطة-تنفيذ-آفاق-القياس-v1.md)، البنود 1 و4 و9 إلى 15 و20.

import { DEFAULT_MODEL, DIMENSIONS, LEVELS, trackKey } from './logic.js';
import { TRACK_COUNT } from './labels.js';

// عتبات العدد: دونها يُعرض الرقم «مؤشرًا أوليًا» أو لا يُحسب
export const EVIDENCE_GATES = Object.freeze({ first: 30, forms: 50, fairness: 100 });
// دقة التصنيف التي دونها يُنظر في إطالة الأداة (البند 17)
export const ACCURACY_TARGET = 0.8;
// هدف اتفاق المقيّمين على السلّم الرباعي (السلّم الرباعي الموحد §5)
export const AGREEMENT_TARGET = 0.7;

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

// التوزيع الطبيعي التراكمي (تقريب Abramowitz و Stegun 26.2.17، خطؤه دون 1e-7)
export function normalCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// خطأ القياس المعياري من الانحراف والثبات
export const semOf = (sdev, reliability) => (sdev == null || reliability == null ? null : Number(sdev) * Math.sqrt(Math.max(0, 1 - Number(reliability))));

// دقة التصنيف المتوقعة: لكل مشارك احتمال أن يقع مؤشره الحقيقي في المستوى الذي سُكّن فيه،
// بافتراض خطأ طبيعي حول مؤشره المرصود. تقريب يتجاهل أرضيات الجوانب، فهو حد أعلى متفائل قليلًا.
// cuts: حدود المستويات تصاعديًا (55 و80 في النموذج الافتراضي)
export function classificationAccuracy(composites, sem, cuts) {
  const xs = (composites || []).map(Number).filter(Number.isFinite);
  const cs = [...(cuts || [])].map(Number).sort((a, b) => a - b);
  if (!xs.length || !(sem > 0) || !cs.length) return { n: xs.length, accuracy: null };
  const bounds = [-Infinity, ...cs, Infinity];
  const ps = xs.map((x) => {
    const i = cs.filter((c) => x >= c).length;
    return normalCdf((bounds[i + 1] - x) / sem) - normalCdf((bounds[i] - x) / sem);
  });
  return { n: xs.length, accuracy: r2(mean(ps)) };
}

// ما يقوله المستشار في المستوى الآلي: كم مرة خالفه، وإلى أين.
// placements: [{ dimension, level, approved_at, assessment_id }] · computed: { `${assessment_id}:${dimension}`: level }
// معدل قريب من الصفر مع أداة بهذا الطول يعني أن الاعتماد توقيع لا مراجعة.
export function overrideStats(placements, computed) {
  const rank = (l) => LEVELS.indexOf(l);
  const rows = (placements || []).filter((p) => p.approved_at && computed?.[`${p.assessment_id}:${p.dimension}`]);
  let up = 0, down = 0;
  for (const p of rows) {
    const c = rank(computed[`${p.assessment_id}:${p.dimension}`]), a = rank(p.level);
    if (a > c) up += 1; else if (a < c) down += 1;
  }
  const n = rows.length;
  return { n, overridden: up + down, up, down, rate: n ? r2((up + down) / n) : null };
}

// توزيع المشاركين المعتمدين على المسارات الـ27: كم خلية مستعملة، وحصة أكثر ست خلايا.
// levelsList: [{ milestone, impact, leadership }] لكل مشارك اعتُمدت تسكيناته الثلاثة
export function trackDistribution(levelsList) {
  const counts = {};
  for (const l of levelsList || []) { const k = trackKey(l); if (k) counts[k] = (counts[k] || 0) + 1; }
  const list = Object.entries(counts).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  const total = list.reduce((a, x) => a + x.n, 0);
  const top6 = list.slice(0, 6).reduce((a, x) => a + x.n, 0);
  return { total, cells: TRACK_COUNT, used: list.length, top6_share: total ? r2(top6 / total) : null, list };
}

// خلاصة الأدلة لأداة القياس المبدئي.
// reliability: ناتج compositeReliability · composites: { dimension: [مؤشر كل مشارك] }
/** @param {{ reliability?: any, composites?: Record<string, number[]>, model?: any, placements?: any[], computed?: Record<string, string>, levelsList?: any[], respondents?: number }} [d] */
export function measurementEvidence({ reliability, composites = {}, model = DEFAULT_MODEL, placements = [], computed = {}, levelsList = [], respondents = 0 } = {}) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const cuts = [Number(m.min_intermediate), Number(m.min_advanced)];
  const dims = DIMENSIONS.map((d) => {
    const rel = reliability?.dims?.[d] || {};
    const xs = (composites[d] || []).map(Number).filter(Number.isFinite);
    const sem = semOf(rel.sd, rel.alpha);
    const acc = classificationAccuracy(xs, sem, cuts);
    return {
      dimension: d, n: rel.n ?? xs.length, alpha: rel.alpha ?? null, sd: rel.sd ?? null, sem: r1(sem),
      // الهامش الحدّي المقترح خطأ قياس واحد (مقرّبًا إلى الأعلى)، مقابل المضبوط في النموذج
      borderline_now: Number(m.borderline), borderline_suggested: sem == null ? null : Math.ceil(sem),
      accuracy: acc.accuracy, below_target: acc.accuracy != null && acc.accuracy < ACCURACY_TARGET,
    };
  });
  const accs = dims.map((x) => x.accuracy);
  // دقة المسار كله: أن تصح الأطر الثلاثة معًا (بافتراض استقلال الأخطاء بين الأطر)
  const joint = accs.every((a) => a != null) ? r2(accs.reduce((a, b) => a * b, 1)) : null;
  const n = Number(respondents) || 0;
  return {
    respondents: n,
    gates: {
      first: { need: EVIDENCE_GATES.first, met: n >= EVIDENCE_GATES.first },
      forms: { need: EVIDENCE_GATES.forms, met: n >= EVIDENCE_GATES.forms * 2 },
      fairness: { need: EVIDENCE_GATES.fairness, met: n >= EVIDENCE_GATES.fairness },
    },
    cuts, accuracy_target: ACCURACY_TARGET,
    dimensions: dims, joint_accuracy: joint,
    overrides: overrideStats(placements, computed),
    tracks: trackDistribution(levelsList),
  };
}

// ── عدالة الفقرات: Mantel و Haenszel للفقرات الثنائية ──
// هل يختلف أداء الفقرة بين فئتين متساويتي القدرة؟ تُطابق القدرة بطبقات الدرجة الكلية.
// rows: [{ group: 'ref' | 'focal', total (الدرجة الكلية)، correct: boolean }]
// التصنيف بمقياس ETS: |Δ| دون 1 مهمل (A)، ومن 1.5 كبير (C)، وما بينهما متوسط (B). بلا اختبار دلالة،
// فهو فرز لما يراجعه إنسان لا حكم.
export function mantelHaenszel(rows, { strata = 4 } = {}) {
  const ok = (rows || []).filter((r) => (r.group === 'ref' || r.group === 'focal') && Number.isFinite(Number(r.total)));
  const nRef = ok.filter((r) => r.group === 'ref').length, nFocal = ok.length - nRef;
  if (nRef < 2 || nFocal < 2) return { n_ref: nRef, n_focal: nFocal, alpha: null, delta: null, cls: null };
  const sorted = [...ok].sort((a, b) => Number(a.total) - Number(b.total));
  const size = Math.ceil(sorted.length / Math.max(1, strata));
  let num = 0, den = 0;
  for (let i = 0; i < sorted.length; i += size) {
    const part = sorted.slice(i, i + size);
    const a = part.filter((r) => r.group === 'ref' && r.correct).length;
    const b = part.filter((r) => r.group === 'ref' && !r.correct).length;
    const c = part.filter((r) => r.group === 'focal' && r.correct).length;
    const d = part.filter((r) => r.group === 'focal' && !r.correct).length;
    const t = a + b + c + d;
    if (t) { num += (a * d) / t; den += (b * c) / t; }
  }
  if (!(num > 0) || !(den > 0)) return { n_ref: nRef, n_focal: nFocal, alpha: null, delta: null, cls: null };
  const alpha = num / den;
  const delta = -2.35 * Math.log(alpha);
  const abs = Math.abs(delta);
  return { n_ref: nRef, n_focal: nFocal, alpha: r2(alpha), delta: r2(delta), cls: abs < 1 ? 'A' : abs >= 1.5 ? 'C' : 'B' };
}

// تقرير العدالة لفقرات المعرفة (الثنائية) بين فئتين. لا يُحسب قبل بلوغ العتبة في الفئتين معًا.
// questions: أسئلة الأداة · answers: Map(assessment_id -> Map(question_id -> score)) · groupOf: { assessment_id: 'ref' | 'focal' }
export function fairnessReport(questions, answers, groupOf, { minN = EVIDENCE_GATES.fairness } = {}) {
  const ids = [...(answers?.keys?.() || [])].filter((id) => groupOf?.[id] === 'ref' || groupOf?.[id] === 'focal');
  const nRef = ids.filter((id) => groupOf[id] === 'ref').length, nFocal = ids.length - nRef;
  const base = { n_ref: nRef, n_focal: nFocal, need: minN, ready: nRef >= minN / 2 && nFocal >= minN / 2 && ids.length >= minN };
  if (!base.ready) return { ...base, items: [] };
  const maxOf = (q) => Math.max(0, ...(q.options || []).map((o) => Number(o.score) || 0));
  const items = [];
  for (const q of (questions || []).filter((x) => x.tier === 'knowledge' && x.active !== false)) {
    const own = (questions || []).filter((x) => x.dimension === q.dimension && x.tier !== 'behavior' && x.id !== q.id);
    const rows = [];
    for (const id of ids) {
      const a = answers.get(id);
      if (!a.has(q.id)) continue;
      rows.push({ group: groupOf[id], correct: a.get(q.id) >= maxOf(q), total: own.reduce((s, o) => s + (a.has(o.id) ? a.get(o.id) / (maxOf(o) || 1) : 0), 0) });
    }
    const mh = mantelHaenszel(rows);
    if (mh.cls && mh.cls !== 'A') items.push({ id: q.id, code: q.code || null, dimension: q.dimension, ...mh, favors: mh.delta < 0 ? 'ref' : 'focal' });
  }
  return { ...base, items: items.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)) };
}

// ── اتفاق المقيّمين على سلّم ترتيبي (السلّم الرباعي) ──
// pairs: [[تقدير المقيّم الأول, تقدير الثاني]] · التطابق التام، والتطابق بفرق درجة، وكابا الموزون تربيعيًا
export function agreement(pairs, { max = 4, min = 1 } = {}) {
  const ok = (pairs || []).map(([a, b]) => [Math.round(Number(a)), Math.round(Number(b))]).filter(([a, b]) => a >= min && a <= max && b >= min && b <= max);
  const n = ok.length;
  if (!n) return { n: 0, exact: null, adjacent: null, kappa: null, meets_target: null };
  const k = max - min + 1;
  const exact = ok.filter(([a, b]) => a === b).length / n;
  const adjacent = ok.filter(([a, b]) => Math.abs(a - b) <= 1).length / n;
  const rowM = Array(k).fill(0), colM = Array(k).fill(0);
  for (const [a, b] of ok) { rowM[a - min] += 1 / n; colM[b - min] += 1 / n; }
  let obs = 0, exp = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const w = ((i - j) ** 2) / ((k - 1) ** 2);
    obs += w * (ok.filter(([a, b]) => a - min === i && b - min === j).length / n);
    exp += w * rowM[i] * colM[j];
  }
  const kappa = exp > 0 ? 1 - obs / exp : null;
  return { n, exact: r2(exact), adjacent: r2(adjacent), kappa: r2(kappa), meets_target: kappa == null ? null : kappa >= AGREEMENT_TARGET };
}

// عيّنة التقييم المزدوج: حصة ثابتة تُختار ببذرة، فلا يختارها المقيّم ولا تتغير بإعادة التشغيل
export function doubleMarkSample(ids, seed, share = 0.2) {
  const key = (id) => { let h = 2166136261; for (const ch of `${seed}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  const sorted = [...new Set(ids || [])].sort((a, b) => key(a) - key(b) || String(a).localeCompare(String(b)));
  return sorted.slice(0, Math.max(sorted.length ? 1 : 0, Math.ceil(sorted.length * share)));
}

// ── الضبط المعياري بطريقة Angoff المعدّلة ──
// كل محكّم يقدّر لكل فقرة النسبة المتوقعة من درجتها عند «الحد الأدنى للمستوى» (0 إلى 1).
// ratings: [{ judge, code, p }] · items: [{ code, dimension, tier }] · الحد لكل جانب متوسط تقديرات فقراته،
// ثم المؤشر المركّب بأوزان النموذج. se: الخطأ المعياري بين المحكّمين (تشتت أحكامهم على عددهم).
export function angoffCut(ratings, items, model = DEFAULT_MODEL) {
  const m = { ...DEFAULT_MODEL, ...(model || {}) };
  const w = { knowledge: Number(m.w_knowledge), skill: Number(m.w_skill), behavior: Number(m.w_behavior) };
  const byCode = new Map((items || []).map((q) => [q.code, q]));
  const judges = [...new Set((ratings || []).map((r) => r.judge))];
  const perJudge = judges.map((j) => {
    const acc = {};
    for (const r of ratings.filter((x) => x.judge === j)) {
      const q = byCode.get(r.code), p = Number(r.p);
      if (!q || !(p >= 0 && p <= 1)) continue;
      const t = ((acc[q.dimension] ||= {})[q.tier] ||= { s: 0, n: 0 });
      t.s += p; t.n += 1;
    }
    return { judge: j, acc };
  });
  const out = { judges: judges.length, dimensions: {} };
  for (const d of DIMENSIONS) {
    const comps = [], tiers = {};
    for (const { acc } of perJudge) {
      const present = Object.keys(w).filter((t) => acc[d]?.[t]?.n && w[t] > 0);
      if (!present.length) continue;
      const W = present.reduce((a, t) => a + w[t], 0);
      comps.push(present.reduce((a, t) => a + w[t] * (acc[d][t].s / acc[d][t].n) * 100, 0) / W);
      for (const t of present) (tiers[t] ||= []).push((acc[d][t].s / acc[d][t].n) * 100);
    }
    const s = sd(comps);
    out.dimensions[d] = {
      judges: comps.length, cut: r1(mean(comps)), se: s == null ? null : r1(s / Math.sqrt(comps.length)),
      range: comps.length ? [r1(Math.min(...comps)), r1(Math.max(...comps))] : null,
      tiers: Object.fromEntries(Object.entries(tiers).map(([t, xs]) => [t, r1(mean(xs))])),
    };
  }
  const all = DIMENSIONS.map((d) => out.dimensions[d].cut).filter((x) => x != null);
  out.cut = all.length ? r1(mean(all)) : null;
  return out;
}
