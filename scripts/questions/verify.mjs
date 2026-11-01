// تحقق من بنك الأسئلة v4.1 — يفشل (رمز خروج 1) عند أي خرق
//   node scripts/questions/verify.mjs
// الفحوص: مفتاح واحد (درجة 4) في كل فقرة · 4 خيارات في الاختيارية · التوأمان
// (baseline-v4 ↔ post-v2) متطابقان نصًا وخيارات · جدول موقع المفتاح لكل بُعد
// ضمن الهدف (D ≥ 15%، B ≤ 35%) · أخطاء لغوية موحّدة · ملخص التغييرات قبل/بعد.
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const BEFORE = JSON.parse(readFileSync(new URL('supabase/content/questions/v4/items.json', ROOT), 'utf8'));
const AFTER = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.1/items.json', ROOT), 'utf8'));
const ACTIVE = ['baseline-v4', 'post-v2'];
const POS = 'ABCDEF';
const D_MIN = 0.15, B_MAX = 0.35;

const fails = [];
const fail = (m) => fails.push(m);
const key = (q) => q.options.findIndex((o) => Number(o.score) === 4);

// 1) البنية
if (AFTER.length !== 155) fail(`عدد الصفوف ${AFTER.length} ≠ 155`);
const ids = new Set(BEFORE.map((q) => q.id));
for (const q of AFTER) {
  if (!ids.has(q.id)) fail(`${q.code}: id جديد ${q.id}`);
  if (!ACTIVE.includes(q.instrument)) fail(`${q.code}: أداة غير نشطة ${q.instrument}`);
  const keys = q.options.filter((o) => Number(o.score) === 4);
  if (keys.length !== 1) fail(`${q.instrument}/${q.code}: ${keys.length} مفتاح بدرجة 4`);
  if (q.kind === 'choice') {
    if (q.options.length !== 4) fail(`${q.instrument}/${q.code}: ${q.options.length} خيارات`);
    const partial = q.options.filter((o) => [1, 2].includes(Number(o.score)));
    if (q.tier === 'knowledge' && partial.length) fail(`${q.instrument}/${q.code}: درجة جزئية في فقرة معرفة`);
    const labels = new Set(q.options.map((o) => o.label));
    if (labels.size !== q.options.length) fail(`${q.instrument}/${q.code}: خيارات مكررة`);
  }
  for (const o of q.options) if (!o.label || typeof o.label !== 'string') fail(`${q.instrument}/${q.code}: خيار بلا نص`);
}

// 2) التوأمان
const by = {};
for (const q of AFTER) (by[q.code] ??= {})[q.instrument] = q;
for (const [code, t] of Object.entries(by)) {
  const a = t['baseline-v4'], b = t['post-v2'];
  if (!a || !b) { if (!code.startsWith('T-')) fail(`${code}: بلا توأم`); continue; }
  for (const f of ['text_ar', 'text_rater_ar', 'tier', 'dimension', 'form', 'kind'])
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) fail(`${code}: ${f} يختلف بين التوأمين`);
  if (a.tier !== 'behavior' && a.help_ar !== b.help_ar) fail(`${code}: help_ar يختلف بين التوأمين`);
  if (JSON.stringify(a.options) !== JSON.stringify(b.options)) fail(`${code}: الخيارات تختلف بين التوأمين`);
}

// 3) اللغة
for (const q of AFTER) {
  const all = [q.text_ar, q.help_ar, q.text_rater_ar, ...q.options.map((o) => o.label)].filter(Boolean).join(' | ');
  if (/["“”]/.test(all)) fail(`${q.instrument}/${q.code}: علامات اقتباس غير «»`);
  if (/لاطلاع/.test(all)) fail(`${q.instrument}/${q.code}: «لاطلاعه»`);
  if (/استبيان/.test(all)) fail(`${q.instrument}/${q.code}: «الاستبيان»`);
  if (/Bass و /.test(all)) fail(`${q.instrument}/${q.code}: «Bass و Avolio»`);
  if (/لا شيء من/.test(all)) fail(`${q.instrument}/${q.code}: خيار «لا شيء مما سبق»`);
  if (q.tier === 'transfer' && q.help_ar !== 'تصف هذه العبارات تجربتك في البرنامج وبيئة عملك، لا أداءك.') fail(`${q.code}: help النقل`);
}

// 4) موقع المفتاح لكل بُعد (baseline-v4 يكفي لأن التوأمين متطابقان)
function table(items) {
  const t = {};
  for (const q of items.filter((x) => x.instrument === 'baseline-v4' && x.kind === 'choice')) {
    const r = (t[q.dimension] ??= { A: 0, B: 0, C: 0, D: 0, n: 0 });
    r[POS[key(q)]] += 1; r.n += 1;
  }
  return t;
}
const pct = (v, n) => `${v} (${Math.round((100 * v) / n)}%)`;
function printTable(title, t) {
  console.log(`\n${title}`);
  console.log('| البُعد | A | B | C | D | n |');
  console.log('|---|---|---|---|---|---|');
  const tot = { A: 0, B: 0, C: 0, D: 0, n: 0 };
  for (const [d, r] of Object.entries(t)) {
    console.log(`| ${d} | ${pct(r.A, r.n)} | ${pct(r.B, r.n)} | ${pct(r.C, r.n)} | ${pct(r.D, r.n)} | ${r.n} |`);
    for (const k of Object.keys(tot)) tot[k] += r[k];
  }
  console.log(`| الإجمالي | ${pct(tot.A, tot.n)} | ${pct(tot.B, tot.n)} | ${pct(tot.C, tot.n)} | ${pct(tot.D, tot.n)} | ${tot.n} |`);
}
const tBefore = table(BEFORE), tAfter = table(AFTER);
printTable('موقع المفتاح قبل (v4):', tBefore);
printTable('موقع المفتاح بعد (v4.1):', tAfter);
for (const [d, r] of Object.entries(tAfter)) {
  if (r.D / r.n < D_MIN) fail(`${d}: D = ${r.D}/${r.n} أقل من 15%`);
  if (r.B / r.n > B_MAX) fail(`${d}: B = ${r.B}/${r.n} أكثر من 35%`);
}

// 5) ملخص التغييرات
const beforeById = Object.fromEntries(BEFORE.map((q) => [q.id, q]));
const changed = [];
const seenCode = new Set();
for (const q of AFTER) {
  const o = beforeById[q.id];
  const diff = [];
  if (o.text_ar !== q.text_ar) diff.push(`النص: «${o.text_ar}» → «${q.text_ar}»`);
  if (o.help_ar !== q.help_ar) diff.push(`help: «${o.help_ar}» → «${q.help_ar}»`);
  if (o.text_rater_ar !== q.text_rater_ar) diff.push(`rater: «${o.text_rater_ar}» → «${q.text_rater_ar}»`);
  const oldKey = POS[key(o)], newKey = POS[key(q)];
  const oldLabels = o.options.map((x) => x.label), newLabels = q.options.map((x) => x.label);
  const sameSet = JSON.stringify([...oldLabels].sort()) === JSON.stringify([...newLabels].sort());
  if (sameSet && JSON.stringify(oldLabels) !== JSON.stringify(newLabels)) diff.push(`إعادة ترتيب: المفتاح ${oldKey} → ${newKey}`);
  q.options.forEach((n, i) => {
    const j = oldLabels.indexOf(n.label);
    if (j === -1) {
      // خيار بنص جديد: نقارنه بالخيار القديم الذي حلّ محله (نفس الموضع بعد عكس الترتيب إن وُجد)
      const replaced = o.options.find((x) => !newLabels.includes(x.label) && !diff.some((d) => d.includes(`«${x.label}»`)));
      diff.push(`خيار ${POS[i]}: «${replaced?.label ?? '?'}» (${replaced?.score ?? '?'}) → «${n.label}» (${n.score})`);
    } else if (Number(o.options[j].score) !== Number(n.score)) diff.push(`درجة «${n.label}»: ${o.options[j].score} → ${n.score}`);
  });
  if (!sameSet && JSON.stringify(oldLabels) !== JSON.stringify(newLabels) && oldKey !== newKey) diff.push(`موقع المفتاح: ${oldKey} → ${newKey}`);
  if (JSON.stringify(o) !== JSON.stringify(q) && !diff.length) diff.push('تغيير حقل آخر');
  if (diff.length) {
    changed.push({ instrument: q.instrument, code: q.code, diff });
    seenCode.add(q.code);
  }
}
console.log(`\nالصفوف المتغيرة: ${changed.length} (${seenCode.size} رمزًا)`);
for (const c of changed.filter((x) => x.instrument === 'baseline-v4' || x.code.startsWith('T-'))) {
  console.log(`\n${c.code}`);
  for (const d of c.diff) console.log(`  - ${d}`);
}
// كل رمز متغير في baseline-v4 يجب أن يتغير في post-v2 أيضًا (ما عدا T)
for (const code of seenCode) {
  if (code.startsWith('T-')) continue;
  const n = changed.filter((c) => c.code === code).length;
  if (n !== 2) fail(`${code}: تغيّر في أداة واحدة فقط`);
}

if (fails.length) {
  console.error(`\nفشل التحقق (${fails.length}):`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✓ التحقق سليم');
