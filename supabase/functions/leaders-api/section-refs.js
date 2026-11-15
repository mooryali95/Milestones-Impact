// ════════════════════════════════════════════════════════════════
// الإحالة إلى أقسام الكتاب بالهوية (المرحلة 2 من «الكتاب الأم»): الهوية ثابتة، والعنوان والباب يُقرآن منها الآن
// ════════════════════════════════════════════════════════════════
// السجل: supabase/content/handbook/sections.json، والوحدة المولّدة منه handbook-section-ids.js (scripts/handbook/sections.mjs).
// تعديل عنوان قسم يغيّر key في السجل وحده، فتتبعه كل إحالة: وثيقة المبادرة، وتعليقات الكتاب الأم.
import { SECTION_IDS } from './handbook-section-ids.js';

/** @typedef {{ id: string, dim: string, chapter: string, level: number, key: string, aliases?: string[], retired?: boolean }} SectionId */
/** @type {SectionId[]} */
const LIST = SECTION_IDS;
/** @type {Record<string, SectionId>} */
const BY_ID = Object.fromEntries(LIST.map((s) => [s.id, s]));
/** @param {string} id @returns {SectionId | null} */
export const sectionById = (id) => BY_ID[id] || null;
/** هوية القسم من بابه ومفتاحه (العنوان الحالي أو قديم في aliases)، أو null */
export const sectionIdOf = (dim, chapter, key) => LIST.find((s) => !s.retired && s.dim === dim && s.chapter === chapter
  && (s.key === key || (s.aliases || []).includes(key)))?.id || null;
/** إحالة إلى الكتيب بالهوية ← الباب والعنوان الحاليان، بالصيغة التي يقرؤها القارئ ({ dimension, chapter_key, look_for }) */
export function handbookRef(h) {
  if (!h?.section_id) return null;
  const s = BY_ID[h.section_id];
  return s && !s.retired ? { section_id: s.id, dimension: s.dim, chapter_key: s.chapter, look_for: s.key } : null;
}
