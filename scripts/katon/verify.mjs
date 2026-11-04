// تحقق من بنك «كاتون» (المرحلة ط) — يفشل (رمز خروج 1) عند أي خرق
//   node scripts/katon/verify.mjs
// لكل موضوع: ست جمل بأسئلتها الست، جملتان خاطئتان على الأقل بلا قرائن إطلاق، جملة صحيحة حازمة
// واحدة على الأقل، وشرح لكل خاطئة؛ وكل جملة تجتاز cleanSentence.
import { readFileSync } from 'node:fs';
import { cleanSentence, topicIssues } from '../../supabase/functions/leaders-api/katon.js';
const topics = JSON.parse(readFileSync(new URL('../../supabase/content/katon/v1/topics.json', import.meta.url), 'utf8'));
const fails = [];
for (const t of topics) {
  if (t.sentences.map((s) => s.question).join(',') !== 'why,what,how,absent,who,when') fails.push(`${t.key}: الأسئلة الست بترتيبها`);
  for (const s of t.sentences) {
    try { cleanSentence(s); } catch (e) { fails.push(`${t.key}/${s.question}: ${e.message}`); }
    if (s.key === 'false' && !s.explain_ar) fails.push(`${t.key}/${s.question}: الخاطئة بلا شرح`);
  }
  for (const i of topicIssues(t.sentences)) fails.push(`${t.key}: ${i}`);
}
const falses = topics.flatMap((t) => t.sentences.filter((s) => s.key === 'false'));
console.log(`${topics.length} مواضيع، ${topics.reduce((a, t) => a + t.sentences.length, 0)} جملة، ${falses.length} خاطئة`);
if (fails.length) { console.error(`فشل التحقق (${fails.length}):`); for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1); }
console.log('✓ التحقق سليم');
