// ════════════════════════════════════════════════════════════════
// بيان المسار: دالة خالصة واحدة تقرأ البيانات وحدها، للخادم والتطبيق (عدسة العرض والوثيقة المطبوعة)
// ════════════════════════════════════════════════════════════════
// لا مكوّن يحسب الشكل من المستويات مباشرة: كل من يحتاج اسم الوثيقة أو حجمها أو أبوابها، أو عدسة عرضها حول الخط
// (الوحدات والكثافة والزمن وأسئلة الجاهزية)، يسأل trackManifest. لا مستوى ملخص (قرار المالك 2026-11-25).
// البيانات: document-forms.js (افتراض ملف التعريف PROFILE_FORMS، واستثناء المسار TRACK_FORMS، والأشكال FORMS)،
// وsupabase/content/initiative-guide/v1/lens.json (العدسة: وحدات كل مستوى، وزمن الفصل، وكثافة الصفحة بملف التعريف).
//
// trackManifest(trackKey, priority?) يعيد:
//   track          مفتاح المسار M{m}I{i}L{l} أو null
//   levels         { milestone, impact, leadership } من المفتاح، أو null
//   priority       إطار الأولوية: الممرَّر (من مؤشرات المشارك عند التعادل) أو الأضعف (priorityFor)
//   profile        ملف التعريف من التسعة: «<إطار الأولوية>-<مستواه فيه>»
//   profile_level  مستوى المشارك في إطار الأولوية (منه كثافة الصفحة)
//   document       { key: card|charter|case, name, en, pages: [أدنى، أعلى], sections: أبواب النسخة المؤسسية بالترتيب, source: track|profile|default|none }
//   frameworks     { [إطار]: { level, units, chapter_hours } }: عدسة فصول كل إطار بمستوى المشارك فيه
//   density        { examples, case, summary, rubric, checks, panels }: كثافة الصفحة (by_level ثم profiles ثم tracks في lens.json)
//   estimate_hours [أدنى، أعلى] لوثيقة هذا المسار كاملة
//   readiness      { questions, chapters }، rubric_lines، case3
// بلا مسار معروف: الشكل الكامل (case) وكثافة المتوسط، فلا يُحذف من وثيقة شيء بغياب القياس.
import LENS from '../../content/initiative-guide/v1/lens.json' with { type: 'json' };
import { DEFAULT_BY_LEVEL, FORMS, PROFILE_FORMS, TRACK_FORMS } from './document-forms.js';
import { DIMENSIONS, priorityFor, profileKey, trackLevels } from './logic.js';

export { LENS };

// أبواب كل شكل بالترتيب (src/lib/brand/institutional.js يبنيها بهذه المفاتيح)
export const FORM_SECTIONS = Object.freeze({
  card: Object.freeze(['decision', 'card', 'first-90-days', 'approval']),
  charter: Object.freeze(['decision', 'overview', 'why', 'value', 'plan', 'governance', 'approval']),
  case: Object.freeze(['decision', 'overview', 'why', 'value', 'plan', 'governance', 'impact', 'approval']),
});

const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));

/** زمن الفصل بالساعات بمستوى إطاره: منتصف مدى الوثيقة ÷ عدد فصولها المعتاد (lens.json estimate_hours) */
export function chapterHours(level) {
  const e = LENS.estimate_hours[level] || LENS.estimate_hours.intermediate;
  return (e.range[0] + e.range[1]) / 2 / e.chapters;
}

/** @param {string | null | undefined} trackKey @param {string | null} [priority] */
export function trackManifest(trackKey, priority = null) {
  const levels = trackLevels(trackKey);
  const track = levels ? String(trackKey) : null;
  const pr = levels ? (priority && levels[priority] ? priority : priorityFor(levels)) : null;
  const profile = levels ? profileKey(levels, pr) : null;
  const profileLevel = levels && pr ? levels[pr] : null;
  let key = null, source = 'none';
  if (track && FORMS[TRACK_FORMS[track]]) { key = TRACK_FORMS[track]; source = 'track'; }
  else if (profile && FORMS[PROFILE_FORMS[profile]]) { key = PROFILE_FORMS[profile]; source = 'profile'; }
  else if (pr && DEFAULT_BY_LEVEL[levels[pr]]) { key = DEFAULT_BY_LEVEL[levels[pr]]; source = 'default'; }
  const f = FORMS[key] || FORMS.case;
  const D = LENS.density;
  const density = { ...clean(D.by_level[profileLevel] || D.by_level.intermediate), ...clean(profile && D.profiles?.[profile]), ...clean(track && D.tracks?.[track]) };
  const frameworks = levels ? Object.fromEntries(DIMENSIONS.map((d) => [d, { level: levels[d], units: LENS.units[levels[d]] || null, chapter_hours: chapterHours(levels[d]) }])) : null;
  const rng = (levels ? DIMENSIONS.map((d) => levels[d]) : ['intermediate']).map((l) => LENS.estimate_hours[l].range);
  const estimate_hours = [0, 1].map((i) => Math.round(rng.reduce((a, r) => a + r[i], 0) / rng.length));
  return {
    track, levels, priority: pr, profile, profile_level: profileLevel,
    document: { key: f.key, name: f.name, en: f.en, pages: [...f.pages], sections: [...FORM_SECTIONS[f.key]], source },
    frameworks, density, estimate_hours,
    readiness: { questions: D.readiness_questions, chapters: D.readiness_chapters }, rubric_lines: D.rubric_lines, case3: D.case3,
  };
}

/** عدسة فصل: مستوى المحتوى الذي يرسله الخادم للفصل، وإلا مستواه بإطاره في البيان */
export const chapterLens = (manifest, section) => section?.level || manifest?.frameworks?.[section?.dimension]?.level || 'advanced';
