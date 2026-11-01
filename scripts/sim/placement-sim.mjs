// ════════════════════════════════════════════════════════════════
// محاكاة المجيبين على القياس المبدئي baseline-v4 (ملحق التدقيق 1، §2)
// ════════════════════════════════════════════════════════════════
// تقارن سياسة التسكين قبل المرحلة ب (الأرضية على كل جانب ومنها الممارسة)
// وبعدها (الأرضية على المعرفة والمواقف فقط، والممارسة علم للمستشار).
// التشغيل: node scripts/sim/placement-sim.mjs [التكرارات=2000] [البذرة=1] [البنك=v4.1] [الأداة=baseline-v4]
//   مثال v5: node scripts/sim/placement-sim.mjs 2000 1 v5 baseline-v5
// البنك: supabase/content/questions/<البنك>/items.json مصفّى بالأداة،
// والنموذج DEFAULT_MODEL (يطابق placement_model الحي: 35/50/15، 55/80، 40/60، 8، 3).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_MODEL, DIMENSIONS, TIERS, acquiescenceFor, evaluatePlacement, forForm, tierPercents,
} from '../../supabase/functions/leaders-api/logic.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BANK = process.argv[4] || 'v4.1';
const INSTRUMENT = process.argv[5] || 'baseline-v4';
const ITEMS = JSON.parse(readFileSync(resolve(root, `supabase/content/questions/${BANK}/items.json`), 'utf8'))
  .filter((q) => q.instrument === INSTRUMENT && TIERS.includes(q.tier))
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
  // المذعن: يختار «في كل المرات تقريبًا» (الخيار الخامس) في كل عبارة ممارسة، معكوسة أو لا
  'yea-sayer': (q) => (q.tier === 'behavior' ? 4 : pick(idx(q, () => true))),
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
console.log(`${INSTRUMENT} (${BANK})، ${N} تكرار لكل صيغة، النسب beginner / intermediate / advanced %`);
console.log('| المجيب | الصيغة | البُعد | قبل (أرضية على كل جانب) | بعد (أرضية على المعرفة والمواقف) | low_practice % | acquiescence % |');
console.log('|---|---|---|---|---|---|---|');
for (const r of out) {
  for (const d of DIMENSIONS) {
    const t = r.tally[d];
    console.log(`| ${r.name} | ${r.form} | ${d} | ${dist(t.before)} | ${dist(t.after)} | ${pct(t.low_practice)} | ${pct(t.acquiescence)} |`);
  }
}

// ── خطوة القياس والجمهور الواقعي (ملحق التدقيق 1، §4) ──
// خطوة الجانب = 100 / مجموع الدرجات العليا في الجانب لكل بُعد وصيغة (درجة واحدة).
// الجمهور: θ~N(0,1)؛ احتمال الصواب لوجستي بأرضية تخمين 25%؛ المواقف تُعطى 4 عند
// الصواب وإلا درجة جزئية عشوائية؛ الممارسة مرتبطة بالقدرة مع تضخيم. الحدّي من
// evaluatePlacement، و«على بُعد بند» = تغيير إجابة بند معرفة أو مواقف واحد يبدّل المستوى.
const gauss = () => { const u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
console.log(`\nخطوة الجانب (${INSTRUMENT}):`);
for (const form of ['A', 'B']) {
  const qs = forForm(ITEMS, form);
  for (const d of DIMENSIONS) {
    const line = TIERS.map((t) => {
      const its = qs.filter((q) => q.dimension === d && q.tier === t);
      const max = its.reduce((a, q) => a + top(q), 0);
      return `${t} ${its.length} بندًا، ${(100 / max).toFixed(2)}%`;
    }).join(' · ');
    console.log(`  ${form}/${d}: ${line}`);
  }
}
const P = Number(process.env.SIM_POP || 5000);
const res = { level: {}, borderline: 0, flip: 0, n: 0 };
for (const form of ['A', 'B']) {
  const qs = forForm(ITEMS, form);
  for (let i = 0; i < P; i += 1) {
    const th = Object.fromEntries(DIMENSIONS.map((d) => [d, gauss()]));
    const answers = {};
    for (const q of qs) {
      const t = th[q.dimension];
      if (q.tier === 'behavior') {
        const lvl = Math.max(0, Math.min(4, Math.round(2.4 + 0.8 * t + 0.5 + gauss() * 0.8)));
        answers[q.id] = q.options.findIndex((o) => o.score === (Number(q.options[0].score) === 4 ? 4 - lvl : lvl));
        continue;
      }
      const p = 0.25 + 0.75 / (1 + Math.exp(-(1.2 * t - (q.tier === 'skill' ? 0.1 : 0))));
      answers[q.id] = rand() < p ? idx(q, (s) => s === top(q))[0] : pick(idx(q, (s) => s < top(q)));
    }
    const pcts = tierPercents(qs, answers, { minBehavior: model.min_behavior_items });
    for (const d of DIMENSIONS) {
      const ev = evaluatePlacement(pcts[d], model);
      res.level[ev.level] = (res.level[ev.level] || 0) + 1;
      res.n += 1;
      if (ev.borderline) res.borderline += 1;
      // بند واحد يبدّل المستوى؟ جرّب رفع أو خفض أول بند قابل للتغيير في المعرفة ثم المواقف
      let flips = false;
      for (const tier of ['knowledge', 'skill']) {
        const its = qs.filter((q) => q.dimension === d && q.tier === tier);
        const up = its.find((q) => q.options[answers[q.id]].score < top(q));
        const down = its.find((q) => q.options[answers[q.id]].score === top(q));
        for (const [q, k] of [[up, up && idx(up, (s) => s === top(up))[0]], [down, down && idx(down, (s) => s === 0)[0]]]) {
          if (!q || flips) continue;
          const alt = { ...answers, [q.id]: k };
          if (evaluatePlacement(tierPercents(qs, alt, { minBehavior: model.min_behavior_items })[d], model).level !== ev.level) flips = true;
        }
      }
      if (flips) res.flip += 1;
    }
  }
}
const pp = (n) => (n / res.n * 100).toFixed(1);
console.log(`\nجمهور واقعي (${P} × صيغتين × 3 أبعاد = ${res.n} حكمًا):`);
console.log(`  التوزيع beginner / intermediate / advanced: ${['beginner', 'intermediate', 'advanced'].map((l) => pp(res.level[l] || 0)).join(' / ')} %`);
console.log(`  حدّي: ${pp(res.borderline)}% · على بُعد بند واحد من مستوى آخر: ${pp(res.flip)}%`);
