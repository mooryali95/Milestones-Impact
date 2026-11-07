// تحقق طبقة الموازنة v5.2 (D03) — يفشل (رمز خروج 1) عند أي خرق
//   node scripts/questions/verify-v5_2.mjs            الفحوص
//   node scripts/questions/verify-v5_2.mjs --report   تقرير الخلايا والفقرات للمراجعة والموازنة
// الفحوص: v5.2 = v5.1 + edits-v5_2.mjs لا غير (الدرجات ومواضع المفاتيح ثابتة، والملف المودع مولَّد) ·
// لا رتبة طول للمفتاح فوق 35% في أي أداة × جانب × صيغة، ومربع كاي للتجانس دون 7.815 · المفتاح في حدود ±10%
// من وسيط أطوال خيارات فقرته في الخلايا كلها · الخيار المعدل في حدود ±40% من طوله في v5.1، بلا قرائن مطلقة،
// وأربعة خيارات مختلفة · المجيبون الآليون (الأطول، وثاني الأطول، والأقصر، والأوسط) لا يتجاوزون التخمين بأكثر
// من 10 نقاط في أي خلية، ولا يُسكَّنون فوق التأسيسي في أي إطار، ولا يصنعون مكسبًا بين القبلي والبعدي.
import { readFileSync } from 'node:fs';
import { EDITS } from './edits-v5_2.mjs';
import { applyBalance, V51 } from './build-v5_2.mjs';
import { CHI2_CRIT_DF3, cells, gains, isChoice, KEY_MEDIAN_BAND, keyBand, keyRank, len, MAX_GAIN, MAX_RANK_SHARE, OVER_CHANCE, responders } from './lengths.mjs';

const ROOT = new URL('../../', import.meta.url);
const V52 = JSON.parse(readFileSync(new URL('supabase/content/questions/v5.2/items.json', ROOT), 'utf8'));
const ABSOLUTE = /(دائمًا|أبدًا|مطلقًا|إطلاقًا|حصرًا|فقط|تمامًا|بالكامل|لا شيء مما|كل ما سبق)/;
const POS = 'ABCD';

export function check(v51 = V51, v52 = V52, edits = EDITS) {
  const fails = [];
  const fail = (m) => fails.push(m);
  // 0) المودع مولَّد من v5.1 والطبقة لا غير
  if (JSON.stringify(applyBalance(v51, edits)) !== JSON.stringify(v52)) fail('v5.2/items.json لا يطابق v5.1 + edits-v5_2.mjs: شغّل node scripts/questions/build-v5_2.mjs');
  v51.forEach((a, i) => {
    const b = v52[i];
    if (!b || a.id !== b.id || a.code !== b.code) return fail(`${a.code}: الترتيب أو المعرّف تغيّر`);
    if (JSON.stringify(a.options.map((o) => o.score)) !== JSON.stringify(b.options.map((o) => o.score))) fail(`${a.code}: الدرجات أو مواضع المفتاح تغيّرت`);
    const e = edits[a.code];
    if (!e) return;
    POS.split('').forEach((k, j) => {
      if (e[k] == null) return;
      const was = len(a.options[j].label), now = len(b.options[j].label);
      if (now < was * 0.6 || now > was * 1.4) fail(`${a.code}/${k}: الطول ${now} خارج ±40% من ${was}`);
      if (ABSOLUTE.test(b.options[j].label) && !ABSOLUTE.test(a.options[j].label)) fail(`${a.code}/${k}: قرينة مطلقة`);
      if (b.options[j].label === a.options[j].label) fail(`${a.code}/${k}: النص لم يتغير`);
    });
    if (new Set(b.options.map((o) => o.label.trim())).size !== b.options.length) fail(`${a.code}: خياران متطابقان`);
  });
  // 1) رتبة المفتاح لكل خلية
  for (const c of cells(v52)) {
    if (c.max_share > MAX_RANK_SHARE) fail(`${c.cell}: حصة رتبة ${Math.round(c.max_share * 100)}% (${c.counts.join('/')}) فوق 35%`);
    if (c.chi2 >= CHI2_CRIT_DF3) fail(`${c.cell}: مربع كاي ${c.chi2} ≥ ${CHI2_CRIT_DF3}`);
  }
  // 2) المفتاح قرب وسيط الأطوال
  for (const q of v52.filter(isChoice)) {
    const b = keyBand(q);
    if (Math.abs(b) > KEY_MEDIAN_BAND * 100) fail(`${q.instrument}/${q.code}: المفتاح ${b > 0 ? '+' : ''}${b}% عن وسيط الأطوال`);
  }
  // 3) المجيبون الآليون
  for (const r of responders(v52)) {
    for (const [d, l] of Object.entries(r.levels)) if (l !== 'beginner') fail(`${r.instrument}/${r.form}/${r.strategy}: سُكّن ${l} في ${d}`);
    for (const c of r.cells) if (c.pct != null && c.pct > c.chance + OVER_CHANCE) fail(`${r.instrument}/${r.form}/${r.strategy}/${c.dim}/${c.tier}: ${c.pct}% والتخمين ${c.chance}%`);
  }
  for (const g of gains(v52)) if (g.gain > MAX_GAIN) fail(`المجيب ${g.strategy} (القبلي ${g.pre_form})/${g.dim}: مكسب ${g.gain}`);
  return fails;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--report')) {
    for (const c of cells(V52)) console.log(`${c.cell.padEnd(30)} n=${String(c.n).padStart(2)} ranks=${c.counts.join('/')} max=${Math.round(c.max_share * 100)}% chi2=${c.chi2}`);
    const off = V52.filter(isChoice).filter((q) => Math.abs(keyBand(q)) > KEY_MEDIAN_BAND * 100);
    console.log(`\nخارج ±10% من الوسيط: ${off.length}`);
    for (const q of off) console.log(`  ${q.instrument}/${q.code} form=${q.form || '-'} rank=${keyRank(q)} band=${keyBand(q)}% lens=${q.options.map((o) => len(o.label)).join(',')} key=${'ABCD'[q.options.findIndex((o) => Number(o.score) === 4)]}`);
    console.log('');
    for (const r of responders(V52)) console.log(`${r.instrument}/${r.form}/${r.strategy}: ${Object.values(r.levels).join(',')} ${r.cells.map((c) => `${c.dim[0]}${c.tier[0]}=${c.pct}/${c.chance}`).join(' ')}`);
    console.log(gains(V52).map((g) => `${g.strategy}:${g.pre_form}:${g.dim}=${g.gain}`).join(' '));
  }
  const fails = check();
  if (fails.length) { console.error(`v5.2: ${fails.length} خرقًا\n${fails.slice(0, 400).join('\n')}`); process.exit(1); }
  console.log('v5.2: كل الفحوص ناجحة');
}
