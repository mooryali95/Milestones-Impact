// تحقق من بنك الأسئلة v4.2 — يفشل (رمز خروج 1) عند أي خرق
//   node scripts/questions/verify-v4.2.mjs
// الفحوص: مفتاح واحد (درجة 4) في كل فقرة · بنية الخيارات · جدول تغطية الباب × المستوى
// في post-v2 (الباب الخامس والسادس غير صفريين في الأطر الثلاثة) · توازي التوأمين
// (توائم المشتركة مع أصولها، وA/B لفقرات المستوى) · توازن موقع المفتاح · أطوال
// الخيارات (±40%) · لا قرائن مطلقة · لا تقارب (Jaccard ≥ 0.5) مع أي فقرة قائمة
// أو سؤال اختبار في الكتيب v2.
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const BEFORE = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.1/items.json', ROOT), 'utf8'));
const AFTER = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.2/items.json', ROOT), 'utf8'));
const HB = new URL('supabase/content/handbook/v2/', ROOT);
const POS = 'ABCD';
const DIMS = ['milestone', 'impact', 'leadership'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];

const fails = [];
const fail = (m) => fails.push(m);
const key = (q) => q.options.findIndex((o) => Number(o.score) === 4);
const profile = (q) => q.options.map((o) => Number(o.score)).sort().join('');
const oldIds = new Set(BEFORE.map((q) => q.id));
const NEW = AFTER.filter((q) => !oldIds.has(q.id));
const POST = AFTER.filter((q) => q.instrument === 'post-v2');

// 0) القديم لم يتغير
if (AFTER.length - NEW.length !== BEFORE.length) fail('صفوف v4.1 ناقصة');
for (const q of BEFORE) {
  const n = AFTER.find((x) => x.id === q.id);
  const { min_level, ...rest } = n || {};
  if (!n || min_level != null || JSON.stringify(rest) !== JSON.stringify(q)) fail(`${q.instrument}/${q.code}: تغيّر صف قائم`);
}
if (NEW.some((q) => q.instrument !== 'post-v2')) fail('فقرة جديدة خارج post-v2');
const codes = new Set();
for (const q of POST) { if (codes.has(q.code)) fail(`${q.code}: رمز مكرر`); codes.add(q.code); }
if (new Set(AFTER.map((q) => q.id)).size !== AFTER.length) fail('معرّف مكرر');

// 1) المفتاح والبنية
for (const q of AFTER) {
  const keys = q.options.filter((o) => Number(o.score) === 4);
  if (keys.length !== 1) fail(`${q.instrument}/${q.code}: ${keys.length} مفتاح بدرجة 4`);
  if (q.min_level != null && !LEVELS.includes(q.min_level)) fail(`${q.code}: min_level غير صالح`);
}
for (const q of NEW) {
  if (q.kind !== 'choice' || q.options.length !== 4) fail(`${q.code}: ليست اختيارًا من أربعة`);
  if (q.tier === 'knowledge' && q.options.some((o) => [1, 2, 3].includes(Number(o.score)))) fail(`${q.code}: درجة جزئية في فقرة معرفة`);
  if (q.tier === 'skill' && q.options.some((o) => ![0, 1, 2, 4].includes(Number(o.score)))) fail(`${q.code}: درجة غير 0/1/2/4`);
  if (new Set(q.options.map((o) => o.label)).size !== 4) fail(`${q.code}: خيارات مكررة`);
  if (!q.competency_ar || !q.chapter_key) fail(`${q.code}: بلا جدارة أو باب`);
  // أطوال الخيارات ضمن ±40% من متوسطها
  const lens = q.options.map((o) => o.label.length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  lens.forEach((l, i) => { if (Math.abs(l - mean) / mean > 0.4) fail(`${q.code}: طول الخيار ${POS[i]} (${l}) خارج ±40% من ${mean.toFixed(1)}`); });
  // المفتاح ليس الأطول وحده بفارق واضح
  const k = key(q);
  if (lens[k] > Math.max(...lens.filter((_, i) => i !== k)) * 1.25) fail(`${q.code}: المفتاح أطول بوضوح`);
  const all = [q.text_ar, ...q.options.map((o) => o.label)].join(' | ');
  if (/["“”]/.test(all)) fail(`${q.code}: علامات اقتباس غير «»`);
  if (/(دائمًا|أبدًا|مطلقًا|إطلاقًا|حصرًا|فقط|تمامًا|بالكامل|لا شيء مما|كل ما سبق)/.test(q.options.map((o) => o.label).join(' | '))) fail(`${q.code}: قرينة مطلقة في الخيارات`);
}

// 2) جدول التغطية: الباب × المستوى لكل بُعد (فقرات الاختيار في post-v2)
const chapters = [...new Set(POST.filter((q) => q.kind === 'choice').map((q) => q.chapter_key))].sort();
const cols = ['عام', 'intermediate', 'advanced'];
console.log('\nتغطية post-v2 (فقرات المعرفة والمواقف): الباب × المستوى');
for (const d of DIMS) {
  console.log(`\n${d}`);
  console.log(`| الباب | ${cols.join(' | ')} |`);
  console.log(`|---|${cols.map(() => '---').join('|')}|`);
  for (const ch of chapters) {
    const cell = (c) => POST.filter((q) => q.kind === 'choice' && q.dimension === d && q.chapter_key === ch && (c === 'عام' ? !q.min_level : q.min_level === c)).length;
    console.log(`| ${ch} | ${cols.map(cell).join(' | ')} |`);
  }
  for (const [ch, lv] of [['ch5', 'intermediate'], ['ch6', 'advanced']]) {
    const n = POST.filter((q) => q.dimension === d && q.chapter_key === ch && q.min_level === lv).length;
    if (n < 4) fail(`${d}: ${ch}×${lv} = ${n} (< 4)`);
  }
}

// 3) التوازي
// 3أ) توائم المشتركة: نفس البُعد والجانب والجدارة والباب والصيغة الفارغة وملمح الدرجات
const twins = POST.filter((q) => q.anchor_code && q.anchor_code !== q.code);
console.log(`\nتوائم المشتركة: ${twins.length}`);
for (const t of twins) {
  const o = POST.find((q) => q.code === t.anchor_code);
  const b = AFTER.find((q) => q.instrument === 'baseline-v4' && q.code === t.anchor_code);
  if (!o || !b) { fail(`${t.code}: الأصل ${t.anchor_code} غير موجود في الأداتين`); continue; }
  for (const f of ['dimension', 'tier', 'competency_ar', 'chapter_key', 'kind', 'form', 'min_level']) if (o[f] !== t[f]) fail(`${t.code}: ${f} يختلف عن ${o.code}`);
  if (o.form != null) fail(`${t.code}: الأصل ليس مشتركًا`);
  if (profile(o) !== profile(t)) fail(`${t.code}: ملمح الدرجات ${profile(t)} ≠ ${profile(o)}`);
  console.log(`  ${o.code} → ${t.code} (${profile(t)})`);
}
for (const c of ['M-S1', 'M-S3', 'M-S4', 'I-S1', 'I-S4', 'I-S5', 'L-S3', 'L-S4', 'L-S6'])
  if (!twins.some((t) => t.anchor_code === c)) fail(`${c}: بلا توأم`);
// 3ب) فقرات المستوى: زوج A/B لكل جدارة
const gated = POST.filter((q) => q.min_level);
const byComp = {};
for (const q of gated) (byComp[`${q.dimension}|${q.chapter_key}|${q.competency_ar}`] ??= []).push(q);
for (const [k, list] of Object.entries(byComp)) {
  const a = list.filter((q) => q.form === 'A'), b = list.filter((q) => q.form === 'B');
  if (a.length !== 1 || b.length !== 1) { fail(`${k}: ليس زوج A/B`); continue; }
  for (const f of ['tier', 'min_level', 'kind']) if (a[0][f] !== b[0][f]) fail(`${a[0].code}/${b[0].code}: ${f} يختلف`);
  if (profile(a[0]) !== profile(b[0])) fail(`${a[0].code}/${b[0].code}: ملمح الدرجات يختلف`);
}
for (const d of DIMS) for (const f of ['A', 'B']) {
  const n = gated.filter((q) => q.dimension === d && q.form === f).length;
  if (n !== 4) fail(`${d}: صيغة ${f} فيها ${n} فقرات مستوى (≠ 4)`);
}

// 4) موقع المفتاح
function table(items, title) {
  const t = {};
  for (const q of items.filter((x) => x.kind === 'choice')) {
    const r = (t[q.dimension] ??= { A: 0, B: 0, C: 0, D: 0, n: 0 });
    r[POS[key(q)]] += 1; r.n += 1;
  }
  console.log(`\n${title}`);
  console.log('| البُعد | A | B | C | D | n |');
  console.log('|---|---|---|---|---|---|');
  for (const [d, r] of Object.entries(t)) console.log(`| ${d} | ${r.A} | ${r.B} | ${r.C} | ${r.D} | ${r.n} |`);
  return t;
}
const tNew = table(NEW, 'موقع المفتاح في الفقرات الجديدة:');
const tot = { A: 0, B: 0, C: 0, D: 0, n: 0 };
for (const r of Object.values(tNew)) for (const k of Object.keys(tot)) tot[k] += r[k];
for (const p of POS) if (tot[p] / tot.n < 0.2 || tot[p] / tot.n > 0.3) fail(`الجديدة: الموضع ${p} = ${tot[p]}/${tot.n} خارج 20–30%`);
const tPost = table(POST, 'موقع المفتاح في post-v2 كاملًا:');
for (const [d, r] of Object.entries(tPost)) {
  if (r.D / r.n < 0.15) fail(`post-v2/${d}: D = ${r.D}/${r.n} أقل من 15%`);
  if (r.B / r.n > 0.35) fail(`post-v2/${d}: B = ${r.B}/${r.n} أكثر من 35%`);
}

// 5) لا تقارب مع القائم ولا مع اختبارات الكتيب (Jaccard على كلمات الجذع)
const norm = (s) => s.replace(/[«»"(),.؟?:؛،!\-–—]/g, ' ').replace(/[ً-ْ]/g, '').split(/\s+/)
  .map((w) => w.replace(/^(و|ف)?(ال)/, '')).filter((w) => w.length > 1);
const jac = (a, b) => { const A = new Set(norm(a)), B = new Set(norm(b)); const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1); };
const quiz = [];
for (const f of readdirSync(HB).filter((x) => x.endsWith('.md'))) {
  const txt = readFileSync(new URL(f, HB), 'utf8');
  for (const m of txt.matchAll(/^س:\s*(.+)$/gm)) quiz.push({ src: f, text: m[1] });
}
const existing = [...new Map(BEFORE.map((q) => [q.text_ar, q])).values()];
let worst = 0;
for (const q of NEW) {
  for (const o of existing) { const j = jac(q.text_ar, o.text_ar); worst = Math.max(worst, j); if (j >= 0.5) fail(`${q.code} ≈ ${o.instrument}/${o.code} (Jaccard ${j.toFixed(2)})`); }
  for (const z of quiz) { const j = jac(q.text_ar, z.text); worst = Math.max(worst, j); if (j >= 0.5) fail(`${q.code} ≈ اختبار ${z.src} (Jaccard ${j.toFixed(2)})`); }
  for (const o of NEW) if (o !== q) { const j = jac(q.text_ar, o.text_ar); if (j >= 0.5) fail(`${q.code} ≈ ${o.code} (Jaccard ${j.toFixed(2)})`); }
}
console.log(`\nأعلى تشابه مع القائم أو اختبارات الكتيب (${quiz.length} سؤالًا): ${worst.toFixed(2)}`);
console.log(`post-v2: ${POST.length} صفًا (${NEW.length} جديدًا: ${gated.length} فقرة مستوى، ${twins.length} توائم)`);

if (fails.length) {
  console.error(`\nفشل التحقق (${fails.length}):`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✓ التحقق سليم');
