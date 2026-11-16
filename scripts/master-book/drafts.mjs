#!/usr/bin/env node
// مسودات الكتاب الأم: وثائق المحتوى المعروضة على اللجنة تُقرأ في الكتاب الأم نفسه ويُعلَّق عليها هناك.
// المصدر الواحد وثيقة المسودة في docs/content، وهذا المولّد يحوّلها إلى صيغة الكتاب ويكتبها في
// supabase/functions/leaders-api/master-book-drafts.js (تُضم في حزمة الدالة). لا تحرّر الملف المولَّد يدويًا.
//   node scripts/master-book/drafts.mjs           يولّد
//   node scripts/master-book/drafts.mjs --check   يتحقق أن المولَّد يطابق المصادر (الاختبارات وCI)
// التحويل: جداول Markdown إلى @compare، وكتلة الشيفرة إلى فقرات، و### إلى ## (مرساة تعليق لكل جدارة)،
// ويُحذف العنوان الأول والفواصل ---.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIMENSIONS } from '../../supabase/functions/leaders-api/logic.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
// part: إطار المسودة (أحد الأطر الثلاثة) أو null، ومنه يُعرف أن تعليق عضو لجنة المحتوى عليها من خارج مقعده (seatOf في master-book.js)
export const DRAFTS = [
  { key: 'seven-competencies', title: 'مسودة: الجدارات القيادية السبع', part: 'leadership', source: 'docs/content/2026-11-15-مسودة-الجدارات-القيادية-السبع-v1.md', status: 'للعرض على لجنة المحتوى' },
];
export const OUT = join(ROOT, 'supabase/functions/leaders-api/master-book-drafts.js');

const cells = (l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim().replace(/`([^`]+)`/g, '$1'));
export function toBookMd(md) {
  const out = [];
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let fence = false, table = null, first = true;
  const endTable = () => { if (table) { out.push('', ...table, ''); table = null; } };
  for (const line of lines) {
    if (/^```/.test(line.trim())) { fence = !fence; endTable(); out.push(''); continue; }
    if (fence) { if (line.trim()) out.push(line.trim(), ''); continue; }
    if (first && /^#\s/.test(line)) { first = false; continue; }
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      const c = cells(line.trim());
      if (!table) table = ['@compare', c.slice(1).join(' | ')];
      else table.push(c.join(' | '));
      continue;
    }
    endTable();
    if (/^-{3,}\s*$/.test(line.trim())) { out.push(''); continue; }
    // كل عنوان فرعي (###) قسم مستقل في الكتاب، فيعلّق الخبير على الجدارة الواحدة لا على القسم كله
    out.push(line.replace(/^###\s/, '## ').replace(/`([^`]+)`/g, '$1'));
  }
  endTable();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function build() {
  for (const d of DRAFTS) if (d.part !== null && !DIMENSIONS.includes(d.part)) throw new Error(`إطار المسودة ${d.key} غير معروف: ${d.part}`);
  const items = DRAFTS.map((d) => ({ ...d, md: toBookMd(readFileSync(join(ROOT, d.source), 'utf8')) }));
  return `// مولَّد من وثائق المسودات بـ scripts/master-book/drafts.mjs. لا تحرّره يدويًا: عدّل الوثيقة ثم أعد التوليد.\nexport const DRAFTS = ${JSON.stringify(items, null, 2)};\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const js = build();
  if (process.argv.includes('--check')) {
    let now = '';
    try { now = readFileSync(OUT, 'utf8'); } catch { /* غائب */ }
    if (now !== js) { console.error('master-book-drafts.js لا يطابق وثائق المسودات: شغّل node scripts/master-book/drafts.mjs'); process.exit(1); }
    console.log(`✓ مسودات الكتاب الأم مطابقة (${DRAFTS.length})`);
  } else { writeFileSync(OUT, js); console.log(`كُتبت ${DRAFTS.length} مسودة في master-book-drafts.js`); }
}
