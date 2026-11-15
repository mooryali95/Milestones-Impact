// ════════════════════════════════════════════════════════════════
// ما يعتمد على باب أو قسم من الكتاب (المرحلة 3 من «الكتاب الأم»، اعتمدها المالك 2026-11-15): منطق خالص
// ════════════════════════════════════════════════════════════════
// قبل أي تعديل يُعرف حجمه: فقرات القياس وأدوات المختبر ومن أكمل الباب (من القاعدة عبر admin.book ← deps)،
// والمسارات التسعة ووثيقة المبادرة (من مصدرهما في المستودع)، وتعليقات الخبراء المفتوحة. لا نسخة ثانية من أي منها.
import PROFILES from '../../supabase/content/tracks/v2/profiles.json';
import ANATOMY from '../../supabase/content/initiative-guide/v1/anatomy.json';
import { sectionById } from '../../supabase/functions/leaders-api/section-refs.js';
import { LEVEL_AR } from '../../supabase/functions/leaders-api/labels.js';

// المسارات التي تعد المشارك بالباب: الوعد { kind: 'chapter', chapter } في ملف تعريف إطار الأولوية
export const trackPromises = (dim, chapterKey, profiles = PROFILES.profiles) => profiles
  .filter((p) => p.priority_dimension === dim && (p.promises || []).some((x) => x.kind === 'chapter' && x.chapter === chapterKey))
  .map((p) => ({ key: p.key, title: p.title_ar, level: LEVEL_AR[p.level] || p.level }));

// فصول وثيقة المبادرة التي تحيل إلى الباب (أو إلى قسم بعينه بمفتاحه) بهوية القسم
export function initiativeRefs(dim, chapterKey, sectionKey = null, anatomy = ANATOMY) {
  const refs = [['meaning', anatomy.meaning?.handbook], ...Object.entries(anatomy.chapters || {}).map(([k, c]) => [k, c.handbook])];
  return refs.flatMap(([k, h]) => {
    const s = h?.section_id ? sectionById(h.section_id) : null;
    if (!s || s.dim !== dim || s.chapter !== chapterKey || (sectionKey && s.key !== sectionKey)) return [];
    return [{ chapter: k === 'meaning' ? 'معنى المبادرة' : k, section: s.key, section_id: s.id }];
  });
}

/** كل ما يعتمد على الباب (وعلى القسم إن سُمّي)
 * @param {{ chapter: any, section?: string|null, deps?: any, counts?: any }} d */
export function chapterDeps({ chapter: c, section = null, deps = null, counts = null }) {
  const qs = (deps?.questions || []).filter((q) => q.dimension === c.dimension && q.chapter_key === c.chapter_key);
  const byInstrument = {};
  for (const q of qs) byInstrument[q.instrument] = (byInstrument[q.instrument] || 0) + 1;
  const competencies = [...new Set(qs.map((q) => q.competency).filter(Boolean))];
  const labs = (deps?.labs || []).filter((l) => l.dimension === c.dimension && l.chapter_key === c.chapter_key);
  const done = deps?.completions?.[c.id] || 0;
  const open = section != null ? counts?.bySection?.[`${c.id}|${section}`] || 0 : counts?.byModule?.[c.id] || 0;
  const refs = initiativeRefs(c.dimension, c.chapter_key, section);
  const tracks = section ? [] : trackPromises(c.dimension, c.chapter_key);
  return {
    live: !!deps,
    questions: { total: qs.length, byInstrument, competencies },
    labs,
    tracks,
    refs,
    comments: open,
    quiz: { completed: done, locked: done > 0 },
    // جملة واحدة لرأس اللوحة: كم شيئًا يتأثر بتعديل الباب
    total: (section ? 0 : qs.length + labs.length + tracks.length) + refs.length + open,
  };
}
