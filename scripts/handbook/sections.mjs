#!/usr/bin/env node
// سجل هويات أقسام الكتاب (المرحلة 2 من «الكتاب الأم»، اعتمدها المالك 2026-11-15): لكل عنوان (## و###) في الإصدار
// الحالي هوية ثابتة لا تتغير بتعديل العنوان، فما يحيل إلى قسم (وثيقة المبادرة، وتعليقات الكتاب الأم) يحيل بالهوية.
//   node scripts/handbook/sections.mjs --sync     يعطي القسم الجديد هوية، ويكتب الوحدة المولّدة للخادم والتطبيقات
//   node scripts/handbook/sections.mjs --check    يفشل إن غاب قسم عن السجل، أو بقيت هوية فاعلة بلا قسم، أو اختلف المولَّد
// القواعد (كسجل المفاهيم):
//   - الهوية لا يُعاد ترقيمها ولا تُستعمل لغير قسمها، وsections.lock يحفظ كل هوية صدرت.
//   - تغيير عنوان القسم: عدّل key في السجل إلى العنوان الجديد، وانقل القديم إلى aliases. الإحالات كلها تتبعه.
//   - حذف القسم: retired: true، ولا يُحذف السطر. المتحقق يرفض الحذف إن أحالت إليه وثيقة المبادرة.
// المفتاح من headingsOf (master-book.js): العنوان، والمكرر لكل مستوى بمستواه، وهو مرساة التعليق نفسها في الكتاب الأم.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headingsOf } from '../../supabase/functions/leaders-api/master-book.js';
import { loadChapters, ROOT, VERSION } from './content.mjs';

export const REG = join(ROOT, 'supabase/content/handbook/sections.json');
export const LOCK = join(ROOT, 'supabase/content/handbook/sections.lock');
export const OUT = join(ROOT, 'supabase/functions/leaders-api/handbook-section-ids.js');
const DIM = { milestone: 'M', impact: 'I', leadership: 'L' };
const idPrefix = (dim, ch) => `${DIM[dim]}-${String(ch).toUpperCase()}-`;

const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
export const readLock = () => (existsSync(LOCK) ? readFileSync(LOCK, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean) : []);

// أقسام الإصدار الحالي: { dim, chapter, level, key }
export function currentHeadings(ver = VERSION) {
  return loadChapters(ver).flatMap((c) => headingsOf(c.body_md).map((h) => ({ dim: c.dimension, chapter: c.chapter_key, level: h.level, key: h.key })));
}
const same = (s, h) => s.dim === h.dim && s.chapter === h.chapter && (s.key === h.key || (s.aliases || []).includes(h.key));

// المزامنة: كل قسم جديد هوية جديدة بعد أعلى رقم صدر لبابه (من القفل، فلا يُعاد رقم ولو أُلغي قسمه)
export function sync(reg, heads, lock) {
  const sections = [...(reg.sections || [])];
  const issued = new Set(lock);
  const added = [];
  for (const h of heads) {
    if (sections.some((s) => !s.retired && same(s, h))) continue;
    const pre = idPrefix(h.dim, h.chapter);
    const max = Math.max(0, ...[...issued].filter((i) => i.startsWith(pre)).map((i) => Number(i.slice(pre.length)) || 0));
    const id = `${pre}${String(max + 1).padStart(2, '0')}`;
    issued.add(id);
    const row = { id, dim: h.dim, chapter: h.chapter, level: h.level, key: h.key, aliases: [] };
    sections.push(row);
    added.push(row);
  }
  return { reg: { ...reg, version: VERSION, sections }, lock: [...issued].sort(), added };
}

// المتحقق: كل قسم له هوية واحدة، وكل هوية فاعلة لها قسم، والقفل يحوي كل هوية، ولا تكرار
export function check(reg, heads, lock, refs = []) {
  const errs = [];
  const live = (reg.sections || []).filter((s) => !s.retired);
  const ids = (reg.sections || []).map((s) => s.id);
  if (new Set(ids).size !== ids.length) errs.push('هوية مكررة في السجل');
  for (const id of ids) if (!lock.includes(id)) errs.push(`${id} ليست في sections.lock`);
  for (const id of lock) if (!ids.includes(id)) errs.push(`${id} صدرت ثم حُذفت من السجل: الإلغاء retired: true لا الحذف`);
  for (const h of heads) {
    const m = live.filter((s) => same(s, h));
    if (m.length !== 1) errs.push(`${h.dim}/${h.chapter} «${h.key}»: ${m.length ? 'له أكثر من هوية' : 'بلا هوية، شغّل --sync، أو إن كان عنوانًا معدَّلًا فعدّل key في السجل وانقل القديم إلى aliases'}`);
  }
  for (const s of live) if (!heads.some((h) => same(s, h))) errs.push(`${s.id} «${s.key}»: لا قسم بهذا العنوان في ${VERSION}. إن تغيّر العنوان فعدّل key، وإن حُذف القسم فـ retired: true`);
  const byId = Object.fromEntries((reg.sections || []).map((s) => [s.id, s]));
  for (const r of refs) {
    const s = byId[r.id];
    if (!s) errs.push(`${r.from}: الهوية ${r.id} غير موجودة`);
    else if (s.retired) errs.push(`${r.from}: يحيل إلى ${r.id} «${s.key}» وقد أُلغي القسم. انقل الإحالة إلى قسم قائم قبل إلغائه`);
  }
  return errs;
}

// الإحالات المعروفة إلى الأقسام: وثيقة المبادرة (وتعليقات الكتاب الأم في القاعدة، والقارئ يعرض ما أُلغي قسمه)
export function anatomyRefs() {
  const A = JSON.parse(readFileSync(join(ROOT, 'supabase/content/initiative-guide/v1/anatomy.json'), 'utf8'));
  const refs = [];
  if (A.meaning?.handbook?.section_id) refs.push({ id: A.meaning.handbook.section_id, from: 'anatomy.json · meaning' });
  for (const [k, c] of Object.entries(A.chapters || {})) if (c.handbook?.section_id) refs.push({ id: c.handbook.section_id, from: `anatomy.json · ${k}` });
  return refs;
}

export const moduleJs = (reg) => `// مولَّد من supabase/content/handbook/sections.json بـ scripts/handbook/sections.mjs. لا تحرّره يدويًا.\n// هوية كل قسم في الكتاب (${reg.version}): المفتاح الحالي ومستواه، والقديم في aliases، والملغى retired.\nexport const SECTION_IDS = ${JSON.stringify(reg.sections.map((s) => ({ id: s.id, dim: s.dim, chapter: s.chapter, level: s.level, key: s.key, ...(s.aliases?.length ? { aliases: s.aliases } : {}), ...(s.retired ? { retired: true } : {}) })), null, 2)};\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const reg = readJson(REG, { version: VERSION, about: 'هوية ثابتة لكل قسم في الكتاب. القواعد في scripts/handbook/sections.mjs', sections: [] });
  const heads = currentHeadings();
  const lock = readLock();
  if (process.argv.includes('--sync')) {
    const r = sync(reg, heads, lock);
    writeFileSync(REG, `${JSON.stringify(r.reg, null, 2)}\n`);
    writeFileSync(LOCK, `${r.lock.join('\n')}\n`);
    writeFileSync(OUT, moduleJs(r.reg));
    console.log(`السجل: ${r.reg.sections.length} قسمًا، أُضيف ${r.added.length}`);
  } else if (process.argv.includes('--check')) {
    const errs = check(reg, heads, lock, anatomyRefs());
    const gen = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (gen !== moduleJs(reg)) errs.push('handbook-section-ids.js لا يطابق sections.json: شغّل --sync');
    if (errs.length) { console.error(errs.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
    console.log(`✓ هويات الأقسام: ${reg.sections.filter((s) => !s.retired).length} قسمًا فاعلًا في ${VERSION}، وكل إحالة قائمة`);
  } else { console.error('--sync أو --check'); process.exit(2); }
}
