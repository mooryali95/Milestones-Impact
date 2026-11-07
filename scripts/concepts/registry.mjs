#!/usr/bin/env node
// سجل المفاهيم بمعرّفات ثابتة (D10، المرحلة الأولى): supabase/content/concepts/registry.json
//   node scripts/concepts/registry.mjs --seed     يبذر السجل من وسوم بنك القياس الحالي إن لم يوجد (مرة واحدة)
//   node scripts/concepts/registry.mjs --check    المتحقق (npm run verify وCI)
//   node scripts/concepts/registry.mjs --report   يكتب تقرير الربط للخبراء في docs/content
// قواعد المعرّف: لا يُعاد ترقيمه، وإعادة التسمية تغيّر label_ar وتنقل القديم إلى aliases_ar، والإلغاء
// deprecated لا حذف. ids.lock يحفظ كل معرّف صدر، فيفشل المتحقق إن غاب أحدها من السجل.
// الصيغ (label_ar وdefinition_ar) يوقعها خبراء المحتوى؛ البذرة مسودة من وسوم البنك كما هي.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChapters, ROOT, VERSION } from '../handbook/content.mjs';

const DIR = join(ROOT, 'supabase/content/concepts');
const REG = join(DIR, 'registry.json');
const LOCK = join(DIR, 'ids.lock');
export const BANK = 'v5.1';   // أداة الدفعة الأولى (D03)
const PREFIX = { milestone: 'M', impact: 'I', leadership: 'L' };
const RANK = { beginner: 1, intermediate: 2, advanced: 3 };
export const SCORED_TIERS = new Set(['knowledge', 'skill', 'behavior']);

// المفاهيم الحاكمة التي يطلب D10 صيغتها الواحدة قبل مراجعة الخبراء وقبل تجميد D03
export const CORE = [
  ['VC-01', 'value_chain', 'سلسلة القيمة'],
  ['BN-01', 'benefit', 'المنفعة ومالكها'],
  ['MD-01', 'milestone_decision', 'خيارات القرار عند المعلم'],
  ['TY-01', 'types', 'الأنواع الأربعة'],
  ['IM-01', 'impact_meaning', 'معاني «الأثر»'],
  ['LF-01', 'framework_name', 'اسم إطار القيادة'],
  ['PS-01', 'public_sector', 'مصطلحات القطاع العام (D12)'],
];

export const bankItems = (root = ROOT) => JSON.parse(readFileSync(join(root, `supabase/content/questions/${BANK}/items.json`), 'utf8'));

export function seed(items) {
  const comps = [];
  const seen = new Map();
  for (const it of items.filter((x) => SCORED_TIERS.has(x.tier) && x.competency_ar)) {
    const k = `${it.dimension}|${it.competency_ar}`;
    if (!seen.has(k)) {
      const n = comps.filter((c) => c.dimension === it.dimension).length + 1;
      const c = { id: `${PREFIX[it.dimension]}-C${String(n).padStart(2, '0')}`, dimension: it.dimension, label_ar: it.competency_ar, aliases_ar: [], chapters: [], status: 'draft' };
      seen.set(k, c);
      comps.push(c);
    }
    const c = seen.get(k);
    if (it.chapter_key && !c.chapters.includes(it.chapter_key)) c.chapters.push(it.chapter_key);
  }
  comps.forEach((c) => c.chapters.sort());
  return {
    version: '0.1',
    status: 'مسودة: المعرّفات ثابتة، والصيغ والتعريفات لخبراء المحتوى (D10)',
    bank: BANK,
    competencies: comps,
    concepts: CORE.map(([id, kind, label_ar]) => ({ id, kind, label_ar, definition_ar: null, status: 'awaiting_experts' })),
  };
}

// ما يرفضه المتحقق: [{ msg }]. chapterLevel: مستوى كل باب إن عُرف ('dimension/ch' ← مستوى)
export function check(reg, items, chapters, lock = []) {
  const issues = [];
  const ids = [...reg.competencies.map((c) => c.id), ...reg.concepts.map((c) => c.id)];
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) issues.push({ msg: `معرّفات مكررة: ${[...new Set(dup)].join('، ')}` });
  for (const id of lock) if (!ids.includes(id)) issues.push({ msg: `المعرّف ${id} صدر من قبل وغاب من السجل: الإلغاء deprecated لا حذف` });
  for (const c of reg.competencies) if (!/^[MIL]-C\d{2,}$/.test(c.id) || PREFIX[c.dimension] !== c.id[0]) issues.push({ msg: `${c.id}: معرّف لا يطابق إطاره` });
  const chapterSet = new Set(chapters.map((c) => `${c.dimension}/${c.chapter_key}`));
  const levelOf = Object.fromEntries(chapters.filter((c) => c.min_level).map((c) => [`${c.dimension}/${c.chapter_key}`, c.min_level]));
  const byLabel = new Map();
  for (const c of reg.competencies.filter((x) => !x.deprecated)) for (const l of [c.label_ar, ...(c.aliases_ar || [])]) byLabel.set(`${c.dimension}|${l}`, c);
  for (const c of reg.competencies) for (const ch of c.chapters) if (!chapterSet.has(`${c.dimension}/${ch}`)) issues.push({ msg: `${c.id}: الباب ${c.dimension}/${ch} غير موجود في الكتاب` });
  for (const it of items.filter((x) => SCORED_TIERS.has(x.tier))) {
    const where = `${it.instrument}/${it.code}`;
    const comp = byLabel.get(`${it.dimension}|${it.competency_ar}`);
    if (!comp) { issues.push({ msg: `${where}: الوسم «${it.competency_ar}» لا يقابله معرّف جدارة` }); continue; }
    if (!it.chapter_key) { issues.push({ msg: `${where}: بلا باب يعلّمه` }); continue; }
    if (!chapterSet.has(`${it.dimension}/${it.chapter_key}`)) issues.push({ msg: `${where}: الباب ${it.chapter_key} غير موجود` });
    else if (!comp.chapters.includes(it.chapter_key)) issues.push({ msg: `${where}: الباب ${it.chapter_key} ليس من أبواب ${comp.id}` });
    const ch = levelOf[`${it.dimension}/${it.chapter_key}`];
    if (ch && (RANK[it.min_level] || 1) < RANK[ch]) issues.push({ msg: `${where}: تُعرض لمستوى ${it.min_level || 'beginner'} وبابها ${it.chapter_key} يبدأ من ${ch}` });
  }
  return issues;
}

export function report(reg, items, chapters) {
  const scored = items.filter((x) => SCORED_TIERS.has(x.tier));
  const known = chapters.filter((c) => c.min_level).length;
  const L = ['# سجل المفاهيم: تقرير الربط للخبراء', '',
    `مولَّد بـ \`node scripts/concepts/registry.mjs --report\` من \`supabase/content/concepts/registry.json\` وبنك ${BANK} والكتاب ${VERSION}. لا يُحرَّر يدويًا.`, '',
    'المطلوب من خبراء المحتوى (D10): صيغة واحدة لكل جدارة، وتعريف لكل مفهوم حاكم، وتأكيد الباب الذي يعلّم كل جدارة. المعرّف ثابت لا يُعاد ترقيمه، وإعادة التسمية تغيّر الصيغة وحدها.', '',
    `مستوى الأبواب معروف في المستودع لـ ${known} من ${chapters.length} بابًا. الباقي يُستورد من الإنتاج بالمصالحة (scripts/content/export-live.mjs)، وعندها يكتمل فحص «فقرة تُعرض لمستوى لا يرى بابها».`, ''];
  L.push('## المفاهيم الحاكمة', '', '| المعرّف | المفهوم | التعريف | الحالة |', '|---|---|---|---|');
  for (const c of reg.concepts) L.push(`| ${c.id} | ${c.label_ar} | ${c.definition_ar || 'بانتظار الخبراء'} | ${c.status} |`);
  for (const d of ['milestone', 'impact', 'leadership']) {
    L.push('', `## جدارات ${d}`, '', '| المعرّف | الصيغة الحالية | الأبواب | الفقرات المحتسبة | الحالة |', '|---|---|---|---|---|');
    for (const c of reg.competencies.filter((x) => x.dimension === d)) {
      const n = scored.filter((x) => x.dimension === d && [c.label_ar, ...(c.aliases_ar || [])].includes(x.competency_ar)).length;
      L.push(`| ${c.id} | ${c.label_ar} | ${c.chapters.join('، ')} | ${n} | ${c.deprecated ? 'مهمل' : c.status} |`);
    }
  }
  return `${L.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const items = bankItems();
  const chapters = loadChapters();
  if (process.argv.includes('--seed')) {
    if (existsSync(REG)) { console.error('السجل موجود: البذر مرة واحدة، والتعديل في الملف نفسه'); process.exit(2); }
    const reg = seed(items);
    writeFileSync(REG, `${JSON.stringify(reg, null, 2)}\n`);
    writeFileSync(LOCK, `${[...reg.competencies, ...reg.concepts].map((c) => c.id).join('\n')}\n`);
    console.log(`بُذر السجل: ${reg.competencies.length} جدارة و${reg.concepts.length} مفاهيم حاكمة`);
  } else {
    const reg = JSON.parse(readFileSync(REG, 'utf8'));
    const lock = readFileSync(LOCK, 'utf8').split('\n').filter(Boolean);
    if (process.argv.includes('--report')) {
      writeFileSync(join(ROOT, 'docs/content/سجل-المفاهيم-تقرير-الربط.md'), report(reg, items, chapters));
      console.log('كُتب docs/content/سجل-المفاهيم-تقرير-الربط.md');
    }
    // معرّف جديد في السجل يدخل القفل، فلا يُحذف لاحقًا
    const fresh = [...reg.competencies, ...reg.concepts].map((c) => c.id).filter((id) => !lock.includes(id));
    if (fresh.length && !process.argv.includes('--check')) writeFileSync(LOCK, `${[...lock, ...fresh].join('\n')}\n`);
    const issues = check(reg, items, chapters, lock);
    if (process.argv.includes('--check') && fresh.length) issues.push({ msg: `معرّفات جديدة خارج ids.lock: ${fresh.join('، ')}. شغّل الأمر بلا --check ليضيفها` });
    issues.forEach((x) => console.error(`✗ ${x.msg}`));
    if (issues.length) process.exit(1);
    console.log(`✓ سجل المفاهيم: ${reg.competencies.length} جدارة، وكل فقرة محتسبة في ${BANK} تحيل إلى جدارة وباب موجودين`);
  }
}
