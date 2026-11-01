// تحقق من زوج القياس v5 (baseline-v5 وpost-v3) — يفشل (رمز خروج 1) عند أي خرق
//   node scripts/questions/verify-v5.mjs
// الفحوص: محتوى v4.2 منقول كما هو · مفتاح واحد (4) في كل اختيار · العبارات المعكوسة
// (تسميات المقياس نفسها، الدرجات 4→0، help_ar وtext_rater_ar) · 8 معرفة و8 مواقف لكل
// بُعد في كل صيغة · توازي التوأمين A/B · أولوية الأبواب · توازن موقع المفتاح · أطوال
// الخيارات (±40%) · لا قرائن مطلقة · «» · لا تقارب (Jaccard ≥ 0.5) مع أي فقرة أو اختبار.
import { readdirSync, readFileSync } from 'node:fs';
import { LIKERT } from './new-v5.mjs';

const ROOT = new URL('../../', import.meta.url);
const V42 = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.2/items.json', ROOT), 'utf8'));
const V5 = JSON.parse(readFileSync(new URL('supabase/content/questions/v5/items.json', ROOT), 'utf8'));
const HB = new URL('supabase/content/handbook/v2/', ROOT);
const POS = 'ABCD';
const DIMS = ['milestone', 'impact', 'leadership'];
const PAIR = { 'baseline-v5': 'baseline-v4', 'post-v3': 'post-v2' };

const fails = [];
const fail = (m) => fails.push(m);
const key = (q) => q.options.findIndex((o) => Number(o.score) === 4);
const profile = (q) => q.options.map((o) => Number(o.score)).sort().join('');
const strip = ({ id, instrument, ...r }) => JSON.stringify(r);

// 0) المنقول كما هو، والمعرّفات فريدة وجديدة
const oldIds = new Set(V42.map((q) => q.id));
if (V5.some((q) => oldIds.has(q.id))) fail('معرّف من v4.2 أُعيد استعماله');
if (new Set(V5.map((q) => q.id)).size !== V5.length) fail('معرّف مكرر');
const NEW = {};
for (const [inst, src] of Object.entries(PAIR)) {
  const rows = V5.filter((q) => q.instrument === inst);
  const old = V42.filter((q) => q.instrument === src);
  const codes = new Set(rows.map((q) => q.code));
  if (codes.size !== rows.length) fail(`${inst}: رمز مكرر`);
  for (const o of old) {
    const n = rows.find((q) => q.code === o.code);
    if (!n || strip(n) !== strip(o)) fail(`${inst}/${o.code}: لا يطابق ${src}`);
  }
  const oldCodes = new Set(old.map((q) => q.code));
  NEW[inst] = rows.filter((q) => !oldCodes.has(q.code));
}
const [NB, NP] = [NEW['baseline-v5'], NEW['post-v3']];
if (NB.length !== 27 || NP.length !== 27) fail(`عدد الجديد ${NB.length}/${NP.length} (≠ 27)`);
for (const b of NB) {
  const p = NP.find((q) => q.code === b.code);
  if (!p) { fail(`${b.code}: ليس في post-v3`); continue; }
  for (const f of ['text_ar', 'options', 'tier', 'form', 'dimension', 'competency_ar', 'chapter_key', 'text_rater_ar', 'sort', 'kind'])
    if (JSON.stringify(b[f]) !== JSON.stringify(p[f])) fail(`${b.code}: ${f} يختلف بين الأداتين`);
  if (b.anchor_code != null || b.retro) fail(`${b.code}: baseline بلا anchor_code ولا retro`);
  if (p.anchor_code !== p.code || p.retro !== (p.tier === 'behavior')) fail(`${p.code}: anchor_code/retro في post-v3`);
}

// 1) المفاتيح والبنية في الأداتين كاملتين
for (const q of V5) {
  if (q.kind === 'choice' && q.options.filter((o) => Number(o.score) === 4).length !== 1) fail(`${q.instrument}/${q.code}: ليس مفتاحًا واحدًا`);
}
const choice = NB.filter((q) => q.kind === 'choice');
const reverse = NB.filter((q) => q.kind === 'likert');
for (const q of choice) {
  if (q.options.length !== 4) fail(`${q.code}: ليست أربعة خيارات`);
  if (q.tier === 'knowledge' && q.options.some((o) => Number(o.score) !== 0 && Number(o.score) !== 4)) fail(`${q.code}: درجة جزئية في معرفة`);
  if (q.tier === 'skill' && profile(q) !== '0124') fail(`${q.code}: ملمح المواقف ${profile(q)} ≠ 0124`);
  if (new Set(q.options.map((o) => o.label)).size !== 4) fail(`${q.code}: خيارات مكررة`);
  if (!q.competency_ar || !['ch1', 'ch2', 'ch3', 'ch4'].includes(q.chapter_key)) fail(`${q.code}: جدارة أو باب خارج ch1–ch4`);
  const lens = q.options.map((o) => o.label.length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  lens.forEach((l, i) => { if (Math.abs(l - mean) / mean > 0.4) fail(`${q.code}: طول الخيار ${POS[i]} (${l}) خارج ±40% من ${mean.toFixed(1)}`); });
  const k = key(q);
  if (lens[k] > Math.max(...lens.filter((_, i) => i !== k)) * 1.25) fail(`${q.code}: المفتاح أطول بوضوح`);
  if (/(دائمًا|أبدًا|مطلقًا|إطلاقًا|حصرًا|فقط|تمامًا|بالكامل|لا شيء مما|كل ما سبق)/.test(q.options.map((o) => o.label).join(' | '))) fail(`${q.code}: قرينة مطلقة`);
}
for (const q of NB) if (/["“”]/.test([q.text_ar, q.text_rater_ar || '', ...q.options.map((o) => o.label)].join(' '))) fail(`${q.code}: اقتباس غير «»`);
for (const d of DIMS) if (reverse.filter((q) => q.dimension === d).length !== 1) fail(`${d}: ليست عبارة معكوسة واحدة`);
for (const inst of Object.keys(PAIR)) for (const q of NEW[inst].filter((x) => x.kind === 'likert')) {
  const labels = q.options.map((o) => o.label), scores = q.options.map((o) => Number(o.score));
  if (JSON.stringify(labels) !== JSON.stringify([...LIKERT, 'لا ينطبق على عملي'])) fail(`${q.code}: تسميات المقياس تختلف`);
  if (scores.join(',') !== '4,3,2,1,0,-1') fail(`${q.code}: الدرجات ليست معكوسة 4→0`);
  if (q.tier !== 'behavior' || q.form != null || !q.help_ar || !q.text_rater_ar) fail(`${inst}/${q.code}: بنية العبارة المعكوسة`);
}
// تسميات مقياس التكرار في العبارات القائمة مطابقة (فالعكس في الدرجات وحدها)
const std = V42.find((q) => q.code === 'M-B1' && q.instrument === 'baseline-v4').options.map((o) => o.label);
if (JSON.stringify(std) !== JSON.stringify([...LIKERT, 'لا ينطبق على عملي'])) fail('تسميات LIKERT لا تطابق البنك');

// 2) العدد: 8 معرفة و8 مواقف لكل بُعد في كل صيغة، وتوازي التوأمين
for (const inst of Object.keys(PAIR)) for (const d of DIMS) for (const f of ['A', 'B']) {
  const qs = V5.filter((q) => q.instrument === inst && q.dimension === d && !q.min_level && (!q.form || q.form === f));
  const n = (t) => qs.filter((q) => q.tier === t && !(q.anchor_code && q.anchor_code !== q.code)).length;
  if (n('knowledge') !== 8 || n('skill') !== 8) fail(`${inst}/${d}/${f}: معرفة ${n('knowledge')} مواقف ${n('skill')} (≠ 8/8)`);
  const beh = qs.filter((q) => q.tier === 'behavior');
  if (beh.length !== 5 || beh.filter((q) => Number(q.options[0].score) === 4).length !== 1) fail(`${inst}/${d}/${f}: الممارسة ${beh.length} (≠ 4 + 1 معكوسة)`);
}
for (const a of choice.filter((q) => q.form === 'A')) {
  const b = choice.find((q) => q.code === `${a.code}B`);
  if (!b || b.form !== 'B') { fail(`${a.code}: بلا توأم B`); continue; }
  for (const f of ['dimension', 'tier', 'competency_ar', 'chapter_key', 'sort']) if (a[f] !== b[f]) fail(`${a.code}/${b.code}: ${f} يختلف`);
  if (profile(a) !== profile(b)) fail(`${a.code}/${b.code}: ملمح الدرجات يختلف`);
}

// 3) أولوية الأبواب
const chs = (d, t) => choice.filter((q) => q.dimension === d && (!t || q.tier === t)).map((q) => q.chapter_key);
if (!chs('impact').includes('ch1')) fail('impact: لا جديد على ch1');
if (!chs('leadership').includes('ch1')) fail('leadership: لا جديد على ch1');
if (!chs('milestone').includes('ch2')) fail('milestone: لا جديد على ch2');
if (chs('leadership', 'knowledge').includes('ch4')) fail('leadership: معرفة جديدة على ch4');
console.log('\nالأبواب في الجديد (اختيار، الفقرة × الصيغتين):');
for (const d of DIMS) console.log(`  ${d}: ${chs(d).join(' ')}`);
const cov = {};
for (const q of V5.filter((x) => x.instrument === 'baseline-v5' && x.kind === 'choice')) cov[`${q.dimension}|${q.chapter_key}`] = (cov[`${q.dimension}|${q.chapter_key}`] || 0) + 1;
console.log('تغطية baseline-v5 (اختيار):', JSON.stringify(cov));

// 4) موقع المفتاح
function table(items, title) {
  const t = {};
  for (const q of items.filter((x) => x.kind === 'choice')) { const r = (t[q.dimension] ??= { A: 0, B: 0, C: 0, D: 0, n: 0 }); r[POS[key(q)]] += 1; r.n += 1; }
  console.log(`\n${title}\n| البُعد | A | B | C | D | n |\n|---|---|---|---|---|---|`);
  for (const [d, r] of Object.entries(t)) console.log(`| ${d} | ${r.A} | ${r.B} | ${r.C} | ${r.D} | ${r.n} |`);
  return t;
}
const tNew = table(choice, 'موقع المفتاح في الجديد:');
const tot = { A: 0, B: 0, C: 0, D: 0, n: 0 };
for (const r of Object.values(tNew)) for (const k of Object.keys(tot)) tot[k] += r[k];
for (const p of POS) if (tot[p] / tot.n < 0.2 || tot[p] / tot.n > 0.3) fail(`الجديد: الموضع ${p} = ${tot[p]}/${tot.n} خارج 20–30%`);
for (const inst of Object.keys(PAIR)) for (const [d, r] of Object.entries(table(V5.filter((q) => q.instrument === inst), `موقع المفتاح في ${inst}:`))) {
  if (r.D / r.n < 0.15) fail(`${inst}/${d}: D = ${r.D}/${r.n} أقل من 15%`);
  if (r.B / r.n > 0.35) fail(`${inst}/${d}: B = ${r.B}/${r.n} أكثر من 35%`);
}

// 5) لا تقارب
const norm = (s) => s.replace(/[«»"(),.؟?:؛،!\-–—]/g, ' ').replace(/[ً-ْ]/g, '').split(/\s+/)
  .map((w) => w.replace(/^(و|ف)?(ال)/, '')).filter((w) => w.length > 1);
const jac = (a, b) => { const A = new Set(norm(a)), B = new Set(norm(b)); const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1); };
const quiz = [];
for (const f of readdirSync(HB).filter((x) => x.endsWith('.md'))) {
  for (const m of readFileSync(new URL(f, HB), 'utf8').matchAll(/^س:\s*(.+)$/gm)) quiz.push({ src: f, text: m[1] });
}
const existing = [...new Map(V42.map((q) => [q.text_ar, q])).values()];
let worst = 0;
for (const q of NB) {
  for (const o of existing) { const j = jac(q.text_ar, o.text_ar); worst = Math.max(worst, j); if (j >= 0.5) fail(`${q.code} ≈ ${o.instrument}/${o.code} (${j.toFixed(2)})`); }
  for (const z of quiz) { const j = jac(q.text_ar, z.text); worst = Math.max(worst, j); if (j >= 0.5) fail(`${q.code} ≈ اختبار ${z.src} (${j.toFixed(2)})`); }
  for (const o of NB) if (o !== q) { const j = jac(q.text_ar, o.text_ar); if (j >= 0.5) fail(`${q.code} ≈ ${o.code} (${j.toFixed(2)})`); }
}
console.log(`\nأعلى تشابه مع القائم أو اختبارات الكتيب (${quiz.length} سؤالًا): ${worst.toFixed(2)}`);
for (const inst of Object.keys(PAIR)) console.log(`${inst}: ${V5.filter((q) => q.instrument === inst).length} صفًا (${NEW[inst].length} جديدًا)`);

if (fails.length) {
  console.error(`\nفشل التحقق (${fails.length}):`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✓ التحقق سليم');
