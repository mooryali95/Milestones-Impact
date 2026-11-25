// ════════════════════════════════════════════════════════════════
// بيان المسار: كل ما يُحل بالمسار في دالة صرفة واحدة (قرار المالك 2026-11-25)
// ════════════════════════════════════════════════════════════════
// المسارات الـ27 (M{m}I{i}L{l}) تُطوى في 9 ملفات تعريف (إطار الأولوية × مستواه فيه). ما يُعرض للمشارك حول وثيقته
// يُحل من هنا وحده، من البيانات وحدها: عدسة كل إطار (مستواه فيه ← وحدات العرض وزمن الفصل)، وكثافة الصفحة بملف التعريف
// (lens.json density.by_level، ويتجاوزها density.profiles لملف بعينه، ثم tracks لمسار بعينه). لا مستوى ملخص.
// يقرؤه تطبيق المشارك (خط الوثيقة والبطاقات الجانبية)، ولوحة الإدارة، وقالب الوثيقة المطبوعة لشكلها واسمها.
//
// الحقول: { key, levels: { milestone, impact, leadership }, priority, profile: { key, level, dimension },
//   frameworks: { [dimension]: { level, units, chapter_hours } }, density: { examples, case, summary, rubric, checks, panels },
//   estimate_hours: [أدنى، أعلى] لوثيقة هذا المسار كاملة، readiness: { questions, chapters }، rubric_lines، case3 }
import LENS from '../../content/initiative-guide/v1/lens.json' with { type: 'json' };
import { DIMENSIONS, priorityFor, profileKey, trackLevels } from './logic.js';

export { LENS };
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));

/** زمن الفصل بالساعات بمستوى إطاره: منتصف مدى الوثيقة ÷ عدد فصولها المعتاد */
export function chapterHours(level) {
  const e = LENS.estimate_hours[level] || LENS.estimate_hours.intermediate;
  return (e.range[0] + e.range[1]) / 2 / e.chapters;
}

/**
 * بيان المسار. priority: إطار الأولوية إن حُسم بمؤشرات القياس (participantPriority)، وإلا الأضعف بترتيب الأطر (priorityFor).
 * مفتاح غير صالح: null
 */
/** @param {string} trackKey @param {string | null} [priority] */
export function trackManifest(trackKey, priority = null) {
  const levels = trackLevels(trackKey);
  if (!levels) return null;
  const pr = priority && levels[priority] ? priority : priorityFor(levels);
  const profile = { key: profileKey(levels, pr), level: levels[pr], dimension: pr };
  const D = LENS.density;
  const density = { ...D.by_level[profile.level], ...clean(D.profiles?.[profile.key]), ...clean(D.tracks?.[trackKey]) };
  const frameworks = Object.fromEntries(DIMENSIONS.map((d) => [d, { level: levels[d], units: LENS.units[levels[d]] || null, chapter_hours: chapterHours(levels[d]) }]));
  // مدى الوثيقة: متوسط مدى مستويات الأطر الثلاثة
  const rng = DIMENSIONS.map((d) => LENS.estimate_hours[levels[d]].range);
  const estimate_hours = [0, 1].map((i) => Math.round(rng.reduce((a, r) => a + r[i], 0) / rng.length));
  return {
    key: trackKey, levels, priority: pr, profile, frameworks, density, estimate_hours,
    readiness: { questions: D.readiness_questions, chapters: D.readiness_chapters }, rubric_lines: D.rubric_lines, case3: D.case3,
  };
}

/** عدسة فصل: مستواه بإطاره في البيان، وإلا مستوى المحتوى الذي يرسله الخادم للفصل (دفعة موحدة المستوى) */
export const chapterLens = (manifest, section) => section?.level || manifest?.frameworks?.[section?.dimension]?.level || 'advanced';
