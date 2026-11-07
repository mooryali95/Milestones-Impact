// تحقق الكتاب v3 قبل الترحيل، ويجري في CI وفي npm run verify
//   node scripts/handbook/verify.mjs [handbook.json] [questions-live.json]
// 1) لا أخطاء في كتل المستوى ولا في الاختبار لكل باب ولكل مستوى، وسؤالان على
//    الأقل لكل مستوى ونطاق، ومثال في متن ch1/ch3/ch5/ch6 لكل مستوى، وتأمل مفتوح
// 2) عدد الكلمات قبل وبعد لكل مستوى (القديم من تفريغ الإنتاج إن وُجد)
// 3) الأسئلة الثلاثة البديلة لا تشبه بنود التسكين (Jaccard < 0.15)
import { existsSync, readFileSync } from 'node:fs';
import { filterHandbookMd, lintHandbookMd, lintQuiz, parseQuiz } from '../../supabase/functions/leaders-api/logic.js';
import { loadChapters } from './content.mjs';

// التفريغان اختياريان (تصدير قراءة من الإنتاج). بدونهما يجري الفحص (1) كاملًا ويُتخطى ما يحتاجهما.
const OLD = process.argv[2] || '';
const BANK = process.argv[3] || '';
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const RANK = { beginner: 1, intermediate: 2, advanced: 3 };

const chapters = loadChapters();
const old = existsSync(OLD) ? JSON.parse(readFileSync(OLD, 'utf8')) : [];
// مستوى الباب: من ترويسة ملفه (min_level) إن وُجد، وإلا من التفريغ، وإلا التأسيسي (الأشد فحصًا)
const minOf = { ...Object.fromEntries(old.map((r) => [`${r.dimension}/${r.chapter_key}`, r.min_level])),
  ...Object.fromEntries(chapters.filter((c) => c.min_level).map((c) => [`${c.dimension}/${c.chapter_key}`, c.min_level])) };
const oldOf = Object.fromEntries(old.map((r) => [`${r.dimension}/${r.chapter_key}`, r]));
let failed = 0;
const fail = (msg) => { failed++; console.error(`✗ ${msg}`); };

// ── 1) الفحص ──
if (chapters.length !== 27) fail(`المتوقع 27 بابًا، والموجود ${chapters.length}`);
let warns = 0;
for (const c of chapters) {
  const id = `${c.dimension}/${c.chapter_key}`;
  const min = minOf[id] || 'beginner';
  const all = [...lintHandbookMd(c.body_md, min), ...lintHandbookMd(c.quiz_md, min), ...lintQuiz(c.quiz_md)];
  for (const level of LEVELS) {
    if (RANK[level] < RANK[min]) continue;
    for (const scope of [null, 'project', 'program', 'portfolio']) {
      const quiz = filterHandbookMd(c.quiz_md, level, scope);
      all.push(...lintHandbookMd(filterHandbookMd(c.body_md, level, scope), level), ...lintQuiz(quiz));
      if (parseQuiz(quiz).length < 2) fail(`${id} (${level}/${scope}): أقل من سؤالين يظهران`);
      if (/^ch[1356]$/.test(c.chapter_key) && !/^مثال:/m.test(filterHandbookMd(c.body_md, level, scope))) fail(`${id} (${level}/${scope}): لا مثال في المتن`);
    }
  }
  all.filter((x) => x.level === 'error').forEach((x) => fail(`${id}: ${x.msg}`));
  const w = [...new Set(all.filter((x) => x.level === 'warn').map((x) => `${x.q ? `س${x.q}` : `سطر ${x.line}`}: ${x.msg}`))];
  w.forEach((x) => console.warn(`! ${id} ${x}`));
  warns += w.length;
  if (!c.reflection_ar) fail(`${id}: تأمل فارغ`);
  if (/^هل\s/.test(c.reflection_ar) && !/\sأم\s/.test(c.reflection_ar)) fail(`${id}: التأمل سؤال نعم/لا`);
}

// ── 2) الكلمات ──
const words = (md) => (String(md || '').replace(/^:::.*$/gm, '').match(/\S+/g) || []).length;
const total = (rows, level, get) => rows.filter((r) => RANK[level] >= RANK[minOf[`${r.dimension}/${r.chapter_key}`] || 'beginner'])
  .reduce((n, r) => n + words(filterHandbookMd(get(r), level)), 0);
console.log('\nالكلمات (المتن) قبل ← بعد');
for (const level of LEVELS) {
  const a = total(old, level, (r) => r.body_md);
  const b = total(chapters, level, (r) => r.body_md);
  console.log(`  ${level.padEnd(12)} ${a} ← ${b} (${b - a >= 0 ? '+' : ''}${b - a})`);
}
console.log('\nلكل باب (المتقدم):');
for (const c of chapters) {
  const id = `${c.dimension}/${c.chapter_key}`;
  const a = words(filterHandbookMd(oldOf[id]?.body_md, 'advanced'));
  const b = words(filterHandbookMd(c.body_md, 'advanced'));
  console.log(`  ${id.padEnd(20)} ${String(a).padStart(4)} ← ${String(b).padStart(4)}  مبتدئ ${words(filterHandbookMd(oldOf[id]?.body_md, 'beginner'))} ← ${words(filterHandbookMd(c.body_md, 'beginner'))}`);
}

// ── 3) التداخل مع بنك التسكين ──
const norm = (s) => new Set(String(s).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1));
const jaccard = (a, b) => { const x = norm(a); const y = norm(b); const i = [...x].filter((t) => y.has(t)).length; return i / (x.size + y.size - i || 1); };
const PAIRS = [['M-K3', 'milestone/ch4', 0], ['I-K5B', 'impact/ch4', 2], ['L-K9B', 'leadership/ch4', 1]];
if (existsSync(BANK)) {
  const bank = JSON.parse(readFileSync(BANK, 'utf8'));
  const qbank = existsSync(`${SCRATCH}/questions.json`) ? JSON.parse(readFileSync(`${SCRATCH}/questions.json`, 'utf8')) : [];
  console.log('\nالتشابه مع بنود التسكين (Jaccard):');
  for (const [code, id, i] of PAIRS) {
    const item = bank.find((b) => b.code === code) || qbank.find((b) => b.code === code);
    const c = chapters.find((x) => `${x.dimension}/${x.chapter_key}` === id);
    const qz = parseQuiz(filterHandbookMd(c.quiz_md, 'advanced'))[i];
    if (!item || !qz) { fail(`${code}: لم يُعثر على البند أو السؤال`); continue; }
    const j = jaccard(`${item.text_ar} ${(item.options || []).map((o) => o.label).join(' ')}`, `${qz.q} ${qz.options.join(' ')}`);
    const js = jaccard(item.text_ar, qz.q);
    console.log(`  ${code.padEnd(6)} ↔ ${id} س${i + 1}: الجذع ${js.toFixed(3)} · مع الخيارات ${j.toFixed(3)}`);
    if (js >= 0.15) fail(`${code}: الجذع ما زال يشبه بند التسكين (${js.toFixed(3)})`);
    const before = parseQuiz(filterHandbookMd(oldOf[id]?.quiz_md, 'advanced'))[i];
    if (before && before.q === qz.q) fail(`${code}: السؤال لم يُستبدل`);
  }
} else console.warn(`! ${BANK ? `لم يُعثر على ${BANK}` : 'بلا تفريغ لبنك الإنتاج'}، فتُخطّى فحص التداخل`);

// ── 4) سؤال DIRECT في leadership/ch4: تطبيق لا استدعاء ──
{
  const v2 = loadChapters('v2').find((x) => x.dimension === 'leadership' && x.chapter_key === 'ch4');
  const v3 = chapters.find((x) => x.dimension === 'leadership' && x.chapter_key === 'ch4');
  const before = parseQuiz(filterHandbookMd(v2.quiz_md, 'advanced'))[3];
  const after = parseQuiz(filterHandbookMd(v3.quiz_md, 'advanced'))[3];
  if (!after || after.q === before.q) fail('leadership/ch4 س4: سؤال DIRECT لم يُستبدل');
  else if (after.options.some((o) => o.trim() === 'التشخيص')) fail('leadership/ch4 س4: ما زال خياراته أسماء خطوات (استدعاء)');
  else console.log('\nleadership/ch4 س4: سؤال DIRECT صار سيناريو تطبيق ✓');
}

console.log(`\n${failed ? `✗ ${failed} خطأ` : '✓ لا أخطاء'} · ${warns} تنبيه`);
process.exit(failed ? 1 : 0);
