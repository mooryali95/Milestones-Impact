// ════════════════════════════════════════════════════════════════
// محاكاة المجيبين على القياس المبدئي baseline-v4 (ملحق التدقيق 1، §2)
// ════════════════════════════════════════════════════════════════
// تقارن سياسة التسكين قبل المرحلة ب (الأرضية على كل جانب ومنها الممارسة)
// وبعدها (الأرضية على المعرفة والمواقف فقط، والممارسة علم للمستشار).
// التشغيل: node scripts/sim/placement-sim.mjs [التكرارات=2000] [البذرة=1]
// البنك: supabase/content/questions/v4.1/items.json مصفّى بالأداة baseline-v4،
// والنموذج DEFAULT_MODEL (يطابق placement_model الحي: 35/50/15، 55/80، 40/60، 8، 3).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_MODEL, DIMENSIONS, TIERS, acquiescenceFor, evaluatePlacement, forForm, tierPercents,
} from '../../supabase/functions/leaders-api/logic.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ITEMS = JSON.parse(readFileSync(resolve(root, 'supabase/content/questions/v4.1/items.json'), 'utf8'))
  .filter((q) => q.instrument === 'baseline-v4' && TIERS.includes(q.tier))
  .map((q) => ({ ...q, options: q.options.map((o) => ({ ...o, score: Number(o.score) })) }));
const N = Number(process.argv[2] || 2000);
let seed = Number(process.argv[3] || 1);
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

// السياسة السابقة كما كانت في logic.js قبل المرحلة ب: البوابة على أضعف جانب أيًّا كان
function legacy(pcts, m = DEFAULT_MODEL) {
  const w = { knowledge: m.w_knowledge, skill: m.w_skill, behavior: m.w_behavior };
  const tiers = TIERS.filter((t) => pcts[t] != null && w[t] > 0);
  const wsum = tiers.reduce((a, t) => a + w[t], 0);
  if (!wsum) return 'beginner';
  const composite = Math.round(tiers.reduce((a, t) => a + w[t] * pcts[t], 0) / wsum * 10) / 10;
  const low = Math.min(...tiers.map((t) => pcts[t]));
  const gate = (min, floor) => composite >= min && low >= floor;
  return gate(m.min_advanced, m.floor_advanced) ? 'advanced' : gate(m.min_intermediate, m.floor_intermediate) ? 'intermediate' : 'beginner';
}

// الفهارس (k) حسب الدرجة، دون «لا ينطبق» (السالبة)
const idx = (q, f) => q.options.map((o, k) => [o.score, k]).filter(([s]) => s >= 0 && f(s)).map(([, k]) => k);
const top = (q) => Math.max(...q.options.map((o) => o.score));
const RESPONDERS = {
  'random': (q) => pick(idx(q, () => true)),
  // المزيّف: يخمّن في الاختبار ويضع أعلى درجة في كل عبارة ممارسة
  'faker': (q) => (q.tier === 'behavior' ? idx(q, (s) => s === top(q))[0] : pick(idx(q, () => true))),
  // الخبير المعرفي المتواضع: المعرفة كاملة، المواقف تخمين، الممارسة «نادرًا» (25%)
  'knowledge-only expert': (q) => (q.tier === 'knowledge' ? idx(q, (s) => s === top(q))[0]
    : q.tier === 'behavior' ? idx(q, (s) => s === 1)[0] : pick(idx(q, () => true))),
};

const model = { ...DEFAULT_MODEL };
const out = [];
for (const [name, answer] of Object.entries(RESPONDERS)) {
  for (const form of ['A', 'B']) {
    const qs = forForm(ITEMS, form);
    const tally = Object.fromEntries(DIMENSIONS.map((d) => [d, { before: {}, after: {}, low_practice: 0, acquiescence: 0 }]));
    for (let i = 0; i < N; i += 1) {
      const answers = Object.fromEntries(qs.map((q) => [q.id, answer(q)]));
      const pcts = tierPercents(qs, answers, { minBehavior: model.min_behavior_items });
      const acq = acquiescenceFor(qs, answers);
      for (const d of DIMENSIONS) {
        const t = tally[d];
        const b = legacy(pcts[d], model);
        const a = evaluatePlacement(pcts[d], model, { acquiescence: acq[d] });
        t.before[b] = (t.before[b] || 0) + 1;
        t.after[a.level] = (t.after[a.level] || 0) + 1;
        if (a.low_practice) t.low_practice += 1;
        if (a.acquiescence) t.acquiescence += 1;
      }
    }
    out.push({ name, form, tally });
  }
}

const pct = (n) => (Math.round(n / N * 1000) / 10).toFixed(1);
const dist = (c) => ['beginner', 'intermediate', 'advanced'].map((l) => pct(c[l] || 0)).join(' / ');
console.log(`baseline-v4 (v4.1)، ${N} تكرار لكل صيغة، النسب beginner / intermediate / advanced %`);
console.log('| المجيب | الصيغة | البُعد | قبل (أرضية على كل جانب) | بعد (أرضية على المعرفة والمواقف) | low_practice % | acquiescence % |');
console.log('|---|---|---|---|---|---|---|');
for (const r of out) {
  for (const d of DIMENSIONS) {
    const t = r.tally[d];
    console.log(`| ${r.name} | ${r.form} | ${d} | ${dist(t.before)} | ${dist(t.after)} | ${pct(t.low_practice)} | ${pct(t.acquiescence)} |`);
  }
}
