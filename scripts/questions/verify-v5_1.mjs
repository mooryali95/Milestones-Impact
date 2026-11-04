// تحقق من القياس v5.1 (ما قبل تفعيل v5) — يفشل (رمز خروج 1) عند أي خرق
//   node scripts/questions/verify-v5_1.mjs
// الفحوص: v5.1 = v5 + تعديلات edits-v5_1.mjs لا غير (الدرجات ومواضع المفاتيح ثابتة) ·
// قاعدة الطول (الملحق 5 §1.4.1) على كل فقرات الاختيار في الأداتين: المفتاح ≤ وسيط الأطوال + 10%،
// و«المفتاح هو الأطول» ≤ 30% في كل أداة × جانب · الفقرات المعدلة والمستبدلة: ±40%، لا قرائن مطلقة،
// «»، أربعة خيارات مختلفة · المستبدلة: بلا مسميات أُطر، توأمان متوازيان، لا تقارب (Jaccard ≥ 0.5) مع
// أي فقرة قائمة أو اختبار في كتيب v3 · أولوية الأبواب كما في v5 · الزمن التقديري بين 45 و60 دقيقة.
import { readdirSync, readFileSync } from 'node:fs';
import { EDITS, EST_MINUTES, REPLACE } from './edits-v5_1.mjs';

const ROOT = new URL('../../', import.meta.url);
const V5 = JSON.parse(readFileSync(new URL('supabase/content/questions/v5/items.json', ROOT), 'utf8'));
const V51 = JSON.parse(readFileSync(new URL('supabase/content/questions/v5.1/items.json', ROOT), 'utf8'));
const HB = new URL('supabase/content/handbook/v3/', ROOT);
const INSTRUMENTS = ['baseline-v5', 'post-v3'];
const DIMS = ['milestone', 'impact', 'leadership'];
const POS = 'ABCD';
const MAX_LONGEST_SHARE = 0.3;

const fails = [];
const fail = (m) => fails.push(m);
const key = (q) => q.options.findIndex((o) => Number(o.score) === 4);
const lens = (q) => q.options.map((o) => o.label.length);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const h = s.length / 2; return s.length % 2 ? s[(s.length - 1) / 2] : (s[h - 1] + s[h]) / 2; };
export const keyLongest = (q) => { const l = lens(q), k = key(q); return l[k] > Math.max(...l.filter((_, i) => i !== k)); };
export const keyOverMedian = (q) => { const l = lens(q); return l[key(q)] > median(l) * 1.1; };
const ABSOLUTE = /(دائمًا|أبدًا|مطلقًا|إطلاقًا|حصرًا|فقط|تمامًا|بالكامل|لا شيء مما|كل ما سبق)/;
const FRAMEWORK = /PMI|Axelos|RBM|BRM|MSP|DAC|OKR|SROI|Kotter|PRINCE|PMBOK|الخماسية|مثلث المواهب/;

// 0) v5.1 = v5 + التعديلات لا غير
if (V51.length !== V5.length) fail(`عدد الصفوف ${V51.length} ≠ ${V5.length}`);
const touched = new Set([...Object.keys(EDITS), ...Object.keys(REPLACE)]);
V5.forEach((o, i) => {
  const n = V51[i];
  if (!n || n.id !== o.id || n.instrument !== o.instrument || n.code !== o.code) { fail(`الصف ${i}: الهوية تغيرت`); return; }
  const same = (f) => JSON.stringify(n[f]) === JSON.stringify(o[f]);
  const fixed = Object.keys(o).filter((f) => !['text_ar', 'options', 'competency_ar', 'chapter_key'].includes(f));
  for (const f of fixed) if (!same(f)) fail(`${o.instrument}/${o.code}: ${f} تغير`);
  if (!touched.has(o.code)) { for (const f of ['text_ar', 'options', 'competency_ar', 'chapter_key']) if (!same(f)) fail(`${o.instrument}/${o.code}: تغير بلا تعديل مسجل (${f})`); return; }
  if (o.options.length !== n.options.length) fail(`${o.code}: عدد الخيارات تغير`);
  o.options.forEach((x, j) => { if (Number(x.score) !== Number(n.options[j].score)) fail(`${o.code}/${POS[j]}: الدرجة تغيرت`); });
  if (EDITS[o.code]) {
    if (!same('text_ar') || !same('competency_ar') || !same('chapter_key')) fail(`${o.code}: EDITS يغيّر غير الخيارات`);
    o.options.forEach((x, j) => { const want = EDITS[o.code][POS[j]] ?? x.label; if (n.options[j].label !== want) fail(`${o.code}/${POS[j]}: لا يطابق EDITS`); });
  } else {
    const r = REPLACE[o.code];
    if (n.text_ar !== r.text_ar || n.competency_ar !== r.competency_ar || n.chapter_key !== r.chapter_key) fail(`${o.code}: لا يطابق REPLACE`);
    if (n.options[key(o)].label !== r.opts[0][0]) fail(`${o.code}: المفتاح ليس في موضعه القديم`);
    if (o.tier !== 'knowledge') fail(`${o.code}: الاستبدال للمعرفة الجديدة فقط`);
  }
});

// 1) قاعدة الطول على كل فقرات الاختيار في الأداتين
const lines = [];
for (const inst of INSTRUMENTS) for (const t of ['knowledge', 'skill']) {
  const qs = V51.filter((q) => q.instrument === inst && q.kind === 'choice' && q.tier === t);
  const longest = qs.filter(keyLongest), over = qs.filter(keyOverMedian);
  lines.push(`${inst}/${t}: n=${qs.length} المفتاح الأطول ${longest.length} (${Math.round(100 * longest.length / qs.length)}%)، فوق الوسيط+10%: ${over.length}`);
  if (longest.length / qs.length > MAX_LONGEST_SHARE) fail(`${inst}/${t}: «المفتاح هو الأطول» ${longest.length}/${qs.length} فوق 30%`);
  for (const q of over) fail(`${inst}/${q.code}: المفتاح ${lens(q)[key(q)]} فوق وسيط الأطوال ${median(lens(q))} + 10%`);
}
// الفقرات المعدلة لا يكون مفتاحها الأطول (هذا ما عُدّلت لأجله)
for (const q of V51.filter((x) => touched.has(x.code))) if (keyLongest(q)) fail(`${q.instrument}/${q.code}: ما زال المفتاح الأطول بعد التعديل`);

// 2) سلامة الفقرات المعدلة والمستبدلة
const changed = [...new Map(V51.filter((q) => touched.has(q.code)).map((q) => [q.code, q])).values()];
for (const q of changed) {
  const l = lens(q), mean = l.reduce((a, b) => a + b, 0) / l.length;
  l.forEach((x, i) => { if (Math.abs(x - mean) / mean > 0.4) fail(`${q.code}: طول الخيار ${POS[i]} (${x}) خارج ±40% من ${mean.toFixed(1)}`); });
  if (q.options.filter((o) => Number(o.score) === 4).length !== 1) fail(`${q.code}: ليس مفتاحًا واحدًا`);
  if (new Set(q.options.map((o) => o.label)).size !== 4) fail(`${q.code}: خيارات مكررة`);
  if (ABSOLUTE.test(q.options.map((o) => o.label).join(' | '))) fail(`${q.code}: قرينة مطلقة`);
  if (/["“”]/.test([q.text_ar, ...q.options.map((o) => o.label)].join(' '))) fail(`${q.code}: اقتباس غير «»`);
}
const replaced = changed.filter((q) => REPLACE[q.code]);
for (const q of replaced) {
  if (FRAMEWORK.test([q.text_ar, ...q.options.map((o) => o.label)].join(' '))) fail(`${q.code}: مسمى إطار في فقرة مفاهيم عامة`);
  if (q.options.some((o) => Number(o.score) !== 0 && Number(o.score) !== 4)) fail(`${q.code}: درجة جزئية في معرفة`);
}
for (const a of replaced.filter((q) => q.form === 'A')) {
  const b = replaced.find((q) => q.code === `${a.code}B`);
  if (!b) { fail(`${a.code}: استُبدل بلا توأمه B`); continue; }
  for (const f of ['dimension', 'tier', 'competency_ar', 'chapter_key', 'sort']) if (a[f] !== b[f]) fail(`${a.code}/${b.code}: ${f} يختلف`);
}
// التوأمان في الأداتين متطابقان نصًا وخيارات (كما يشترط verify-v5 للجديد)
for (const q of V51.filter((x) => x.instrument === 'baseline-v5' && touched.has(x.code))) {
  const p = V51.find((x) => x.instrument === 'post-v3' && x.code === q.code);
  if (p && (p.text_ar !== q.text_ar || JSON.stringify(p.options) !== JSON.stringify(q.options))) fail(`${q.code}: يختلف بين الأداتين`);
}

// 3) أولوية الأبواب كما في v5، ولا معرفة قيادة على ch4
const newCodes = (d) => V51.filter((q) => q.instrument === 'baseline-v5' && q.kind === 'choice' && q.dimension === d && /1[23]B?$/.test(q.code));
if (!newCodes('impact').some((q) => q.chapter_key === 'ch1')) fail('impact: لا جديد على ch1');
if (!newCodes('leadership').some((q) => q.chapter_key === 'ch1')) fail('leadership: لا جديد على ch1');
if (!newCodes('milestone').some((q) => q.chapter_key === 'ch2')) fail('milestone: لا جديد على ch2');
if (newCodes('leadership').some((q) => q.tier === 'knowledge' && q.chapter_key === 'ch4')) fail('leadership: معرفة جديدة على ch4');
for (const q of replaced) if (!['ch1', 'ch2', 'ch3', 'ch4'].includes(q.chapter_key)) fail(`${q.code}: باب خارج ch1–ch4`);

// 4) لا تقارب مع القائم ولا مع اختبارات كتيب v3 (الحي)
const norm = (s) => s.replace(/[«»"(),.؟?:؛،!\-–—]/g, ' ').replace(/[ً-ْ]/g, '').split(/\s+/)
  .map((w) => w.replace(/^(و|ف)?(ال)/, '')).filter((w) => w.length > 1);
const jac = (a, b) => { const A = new Set(norm(a)), B = new Set(norm(b)); const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1); };
const quiz = [];
for (const f of readdirSync(HB).filter((x) => x.endsWith('.md'))) {
  for (const m of readFileSync(new URL(f, HB), 'utf8').matchAll(/^س:\s*(.+)$/gm)) quiz.push({ src: f, text: m[1] });
}
const others = [...new Map(V51.filter((q) => q.kind === 'choice' && !REPLACE[q.code]).map((q) => [q.text_ar, q])).values()];
let worst = 0;
for (const q of replaced) {
  for (const o of others) { const j = jac(q.text_ar, o.text_ar); worst = Math.max(worst, j); if (j >= 0.5) fail(`${q.code} ≈ ${o.instrument}/${o.code} (${j.toFixed(2)})`); }
  for (const z of quiz) { const j = jac(q.text_ar, z.text); worst = Math.max(worst, j); if (j >= 0.5) fail(`${q.code} ≈ اختبار ${z.src} (${j.toFixed(2)})`); }
  for (const o of replaced) if (o !== q) { const j = jac(q.text_ar, o.text_ar); if (j >= 0.5) fail(`${q.code} ≈ ${o.code} (${j.toFixed(2)})`); }
}

// 5) الزمن التقديري
for (const inst of INSTRUMENTS) if (!(EST_MINUTES[inst] >= 45 && EST_MINUTES[inst] <= 60)) fail(`${inst}: الزمن ${EST_MINUTES[inst]} خارج 45–60`);

console.log(lines.join('\n'));
console.log(`المعدلة: ${Object.keys(EDITS).length} فقرة أطوال، ${Object.keys(REPLACE).length} استبدال؛ أعلى تشابه للمستبدلة مع القائم أو اختبارات كتيب v3 (${quiz.length} سؤالًا): ${worst.toFixed(2)}`);
if (fails.length) {
  console.error(`\nفشل التحقق (${fails.length}):`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✓ التحقق سليم');
