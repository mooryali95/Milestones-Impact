#!/usr/bin/env node
// تقرير الأثر بين إصدارين من الكتاب (المرحلة 3، الخطوة 2 من «الكتاب الأم»، اعتمدها المالك 2026-11-15)
//   node scripts/handbook/impact.mjs --from=v3 --to=v3.1     يطبع التقرير ويكتبه في <to>/IMPACT.md
// يكتبه build-version.mjs مع كل إصدار جديد، ويرفض البناء ما يكسر شيئًا (إحالة إلى قسم أُلغي).
// المصادر كلها في المستودع: الأبواب، وسجل هويات الأقسام، وبنك القياس الأحدث، وأدوات المختبر، والمسارات، ووثيقة المبادرة.
// ما في القاعدة وحدها (من أكمل الباب، والتعليقات المفتوحة) تعرضه لوحة «ما يعتمد على هذا» في الكتاب الأم.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filterHandbookMd } from '../../supabase/functions/leaders-api/logic.js';
import { headingsOf } from '../../supabase/functions/leaders-api/master-book.js';
import { DIM_AR, LEVEL_AR } from '../../supabase/functions/leaders-api/labels.js';
import { dirOf, loadChapters, ROOT } from './content.mjs';
import { anatomyRefs } from './sections.mjs';
import { ITEMS as P1 } from '../lab/phase1.mjs';
import { ITEMS as P2 } from '../lab/phase2.mjs';
import { ITEMS as P3 } from '../lab/phase3.mjs';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CH_AR = { intro: 'التمهيد', ch1: 'الباب الأول', ch2: 'الباب الثاني', ch3: 'الباب الثالث', ch4: 'الباب الرابع', ch5: 'الباب الخامس', ch6: 'الباب السادس', labs: 'المختبر', close: 'الخاتمة' };
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const chName = (c) => `${DIM_AR[c.dimension]} · ${CH_AR[c.chapter_key] || c.chapter_key}`;

// بنك القياس الأحدث (آخر مجلد بترتيب الإصدار)
function latestBank() {
  const dir = join(ROOT, 'supabase/content/questions');
  const vs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    .sort((a, b) => a.slice(1).split('.').map(Number).reduce((r, n, i) => r || n - (b.slice(1).split('.').map(Number)[i] ?? -1), 0) || a.length - b.length);
  const v = vs.at(-1);
  return { version: v, items: read(`supabase/content/questions/${v}/items.json`) };
}
// أدوات المختبر من مصادرها (scripts/lab/phase*.mjs)، كما يولّد منها ترحيلها
const labItems = async () => [...(P1 || []), ...(P2 || []), ...(P3 || [])];

/** الأثر بين إصدارين: لكل باب تغيّر ما تغيّر فيه ومن يتأثر به، والأخطاء الكاسرة */
export async function versionImpact(from, to, { registry = read('supabase/content/handbook/sections.json'), refs = anatomyRefs() } = {}) {
  const a = Object.fromEntries(loadChapters(from).map((c) => [`${c.dimension}/${c.chapter_key}`, c]));
  const bank = latestBank();
  const labs = await labItems();
  const { profiles } = read('supabase/content/tracks/v2/profiles.json');
  const regById = Object.fromEntries((registry.sections || []).map((s) => [s.id, s]));
  const chapters = [];
  const errors = [];
  for (const c of loadChapters(to)) {
    const p = a[`${c.dimension}/${c.chapter_key}`];
    if (!p) { chapters.push({ c, isNew: true }); continue; }
    const changed = { body: p.body_md !== c.body_md, quiz: p.quiz_md !== c.quiz_md, reflection: p.reflection_ar !== c.reflection_ar, level: (p.min_level || null) !== (c.min_level || null) };
    if (!Object.values(changed).some(Boolean)) continue;
    const oldKeys = headingsOf(p.body_md).map((h) => h.key);
    const newKeys = headingsOf(c.body_md).map((h) => h.key);
    const reg = (registry.sections || []).filter((s) => s.dim === c.dimension && s.chapter === c.chapter_key);
    const renamed = reg.filter((s) => !s.retired && newKeys.includes(s.key) && !oldKeys.includes(s.key) && (s.aliases || []).some((x) => oldKeys.includes(x)))
      .map((s) => ({ id: s.id, from: s.aliases.find((x) => oldKeys.includes(x)), to: s.key }));
    const renamedOld = new Set(renamed.map((r) => r.from));
    const added = newKeys.filter((k) => !oldKeys.includes(k) && !renamed.some((r) => r.to === k));
    const removed = oldKeys.filter((k) => !newKeys.includes(k) && !renamedOld.has(k));
    // من يتغير عليه ما يقرأ: النص بعد تصفية كل مستوى (filterHandbookMd، كما يصل المشارك)
    const readers = LEVELS.filter((l) => filterHandbookMd(p.body_md, l) !== filterHandbookMd(c.body_md, l));
    const questions = bank.items.filter((q) => q.dimension === c.dimension && q.chapter_key === c.chapter_key);
    const chLabs = labs.filter((l) => l.dimension === c.dimension && l.chapter_key === c.chapter_key);
    const tracks = profiles.filter((t) => t.priority_dimension === c.dimension && (t.promises || []).some((x) => x.kind === 'chapter' && x.chapter === c.chapter_key));
    const chRefs = refs.filter((r) => regById[r.id]?.dim === c.dimension && regById[r.id]?.chapter === c.chapter_key);
    for (const r of chRefs) {
      const s = regById[r.id];
      if (s.retired || !newKeys.includes(s.key)) errors.push(`${r.from} يحيل إلى «${s.key}» (${r.id}) في ${chName(c)}، ولا قسم بهذا العنوان في ${to}`);
    }
    chapters.push({ c, changed, renamed, added, removed, readers, questions: questions.length, labs: chLabs.map((l) => l.title_ar || l.key), tracks: tracks.map((t) => t.title_ar), refs: chRefs.map((r) => ({ from: r.from, key: regById[r.id]?.key })) });
  }
  for (const k of Object.keys(a)) if (!loadChapters(to).some((c) => `${c.dimension}/${c.chapter_key}` === k)) errors.push(`الباب ${k} في ${from} وليس في ${to}: حذف باب ترحيل صريح لا إصدار`);
  return { from, to, bank: bank.version, chapters, errors };
}

export function renderImpact(r) {
  const out = [`# تقرير الأثر: كتاب القائد ${r.to} من ${r.from}`, '',
    `> مولَّد بـ \`scripts/handbook/impact.mjs\` مع بناء الإصدار. لا يُحرَّر يدويًا. بنك القياس المقارن: ${r.bank}.`,
    '> ما في القاعدة وحدها (من أكمل الباب فاختباره مقفل، وتعليقات الخبراء المفتوحة) تعرضه لوحة «ما يعتمد على هذا» في الكتاب الأم.', ''];
  out.push(`**الأبواب المتغيرة:** ${r.chapters.length}${r.errors.length ? ` · **أخطاء كاسرة:** ${r.errors.length}` : ' · لا شيء ينكسر'}`, '');
  if (r.errors.length) out.push('## ما ينكسر (يرفض البناء)', '', ...r.errors.map((e) => `- ${e}`), '');
  for (const x of r.chapters) {
    out.push(`## ${chName(x.c)}`, '');
    if (x.isNew) { out.push('- باب جديد في هذا الإصدار.', ''); continue; }
    const what = [x.changed.body && 'المتن', x.changed.quiz && 'الاختبار', x.changed.reflection && 'التأمل', x.changed.level && 'مستوى الباب'].filter(Boolean);
    out.push(`- **ما تغيّر:** ${what.join('، ')}`);
    out.push(`- **من يتغير عليه ما يقرأ:** ${x.readers.length ? x.readers.map((l) => LEVEL_AR[l]).join('، ') : 'لا أحد (تغيير لا يظهر في نص أي مستوى)'}`);
    if (x.changed.quiz) out.push('- **تنبيه:** اختبار الباب تغيّر. يرفضه الترحيل على الإنتاج إن كان للباب نتائج، فيلزم إصدار اختبار جديد لا تعديل القائم.');
    if (x.renamed.length) out.push(`- **عناوين غُيّرت (الإحالات تتبعها بالهوية):** ${x.renamed.map((y) => `«${y.from}» ← «${y.to}» (${y.id})`).join('، ')}`);
    if (x.added.length) out.push(`- **أقسام جديدة:** ${x.added.map((k) => `«${k}»`).join('، ')}`);
    if (x.removed.length) out.push(`- **أقسام أُزيلت:** ${x.removed.map((k) => `«${k}»`).join('، ')}`);
    out.push(`- **فقرات القياس المربوطة بالباب:** ${x.questions}`);
    if (x.labs.length) out.push(`- **أدوات المختبر:** ${x.labs.join('، ')}`);
    if (x.tracks.length) out.push(`- **مسارات تعد به:** ${x.tracks.join('، ')}`);
    if (x.refs.length) out.push(`- **إحالات وثيقة المبادرة:** ${x.refs.map((y) => `${y.from.replace('anatomy.json · ', '')} ← «${y.key}»`).join('، ')}`);
    out.push('');
  }
  return `${out.join('\n').trim()}\n`;
}

export const impactPath = (ver) => join(dirOf(ver), 'IMPACT.md');

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => (process.argv.find((x) => x.startsWith(`--${k}=`)) || '').split('=')[1];
  const from = arg('from'), to = arg('to');
  if (!from || !to) { console.error('--from و--to مطلوبان'); process.exit(2); }
  const r = await versionImpact(from, to);
  const md = renderImpact(r);
  writeFileSync(impactPath(to), md);
  console.log(md);
  if (r.errors.length) process.exit(1);
}
export const hasImpact = (ver) => existsSync(impactPath(ver));
