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
//   card           بطاقة المسار (supabase/content/tracks/v2/cards.json وslices.json): الهوية، والكتاب (النوع وترتيب الأطر والإطار المعمَّق
//                  ومسرد كل إطار بعمق مستواه فيه)، والوثيقة (الشكل والوحدات وحد الحقول المطلوبة)، والرحلة (المتطلبات والمختبرات)،
//                  والدعم (الأمثلة أو أسئلة الجاهزية، وأسئلة صاحب القرار بمستوى الأثر، والزمن)، والجسور. انظر cardFor أدناه
// بلا مسار معروف: الشكل الكامل (case) وكثافة المتوسط، فلا يُحذف من وثيقة شيء بغياب القياس.
import LENS from '../../content/initiative-guide/v1/lens.json' with { type: 'json' };
import CARDS from '../../content/tracks/v2/cards.json' with { type: 'json' };
import SLICES from '../../content/tracks/v2/slices.json' with { type: 'json' };
import TRACKS from '../../content/tracks/v2/tracks.json' with { type: 'json' };
import PROFILES from '../../content/tracks/v2/profiles.json' with { type: 'json' };
import { DEFAULT_BY_LEVEL, FORMS, PROFILE_FORMS, TRACK_FORMS } from './document-forms.js';
import { DIMENSIONS, LEVELS, priorityFor, profileKey, trackLevels } from './logic.js';

export { CARDS, LENS, SLICES };

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
  // افتراض المسار عند التعادل بلا مؤشرات (tracks.priority_dimension)، كما يحسبه الخادم (participantPriority)
  const fallback = track ? TRACK_BY_KEY[track]?.priority_dimension || null : null;
  const pr = levels ? (priority && levels[priority] ? priority : priorityFor(levels, null, fallback)) : null;
  const profile = levels ? profileKey(levels, pr) : null;
  const profileLevel = levels && pr ? levels[pr] : null;
  let key = null, source = 'none';
  if (track && FORMS[TRACK_FORMS[track]]) { key = TRACK_FORMS[track]; source = 'track'; }
  else if (profile && FORMS[PROFILE_FORMS[profile]]) { key = PROFILE_FORMS[profile]; source = 'profile'; }
  else if (pr && DEFAULT_BY_LEVEL[levels[pr]]) { key = DEFAULT_BY_LEVEL[levels[pr]]; source = 'default'; }
  const f = FORMS[key] || FORMS.case;
  const D = LENS.density;
  const density = { ...clean(D.by_level[profileLevel] || D.by_level.intermediate), ...clean(profile && D.profiles?.[profile]), ...clean(track && D.tracks?.[track]) };
  // أسئلة صاحب القرار بمستوى المشارك في الأثر لا بملف التعريف (قرار المالك 2026-11-25): الجاهزية، ثم المسوغات الثلاثة، ثم الخمسة
  if (levels && SLICES.frameworks.impact.case?.[levels.impact]?.form) density.case = SLICES.frameworks.impact.case[levels.impact].form;
  const frameworks = levels ? Object.fromEntries(DIMENSIONS.map((d) => [d, { level: levels[d], units: LENS.units[levels[d]] || null, chapter_hours: chapterHours(levels[d]) }])) : null;
  const rng = (levels ? DIMENSIONS.map((d) => levels[d]) : ['intermediate']).map((l) => LENS.estimate_hours[l].range);
  const estimate_hours = [0, 1].map((i) => Math.round(rng.reduce((a, r) => a + r[i], 0) / rng.length));
  return {
    track, levels, priority: pr, profile, profile_level: profileLevel,
    document: { key: f.key, name: f.name, en: f.en, pages: [...f.pages], sections: [...FORM_SECTIONS[f.key]], source },
    frameworks, density, estimate_hours,
    readiness: { questions: D.readiness_questions, chapters: D.readiness_chapters }, rubric_lines: D.rubric_lines, case3: D.case3,
    card: levels ? cardFor({ track, levels, priority: pr, profile, profileLevel, form: f, density, estimate_hours }) : null,
  };
}

// ── بطاقة المسار ──
const TRACK_BY_KEY = Object.fromEntries(TRACKS.tracks.map((t) => [t.key, t]));
const PROFILE_BY_KEY = Object.fromEntries(PROFILES.profiles.map((p) => [p.key, p]));
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// دمج طبقات البطاقة: الكائنات تُدمج، وغيرها يُستبدل، والمفاتيح التي تبدأ بـ_ تعليقات لا تُدمج
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (k.startsWith('_')) continue;
    out[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  }
  return out;
}
/** طبقات البطاقة بالترتيب: base ← by_level ← profiles ← tracks */
export function cardLayers(track, profile, profileLevel) {
  return [CARDS.base, CARDS.by_level?.[profileLevel], CARDS.profiles?.[profile], CARDS.tracks?.[track]].reduce((a, l) => merge(a, l), {});
}
/** مسرد إطار بعمق مستوى المشارك فيه: كل مصطلح بلغ مستواه، بتعريف ذلك المستوى */
export function termsAt(dimension, level) {
  return (SLICES.frameworks[dimension]?.terms || [])
    .filter((t) => RANK[level] >= RANK[t.from || 'beginner'])
    .map((t) => ({ term: t.term, en: t.en, dimension, level, def: t[level] || t.advanced || t.intermediate || t.beginner, since: t.from || 'beginner' }));
}
/** مختبرات إطار حتى مستواه (يُجمع ما دونه)، ومتطلباته بمستواه بالضبط */
export const labsAt = (dimension, level) => LEVELS.filter((l) => RANK[l] <= RANK[level]).flatMap((l) => SLICES.frameworks[dimension]?.labs?.[l] || []);
export const journeyAt = (dimension, level) => [...(SLICES.frameworks[dimension]?.journey?.[level] || [])];
/** حد الحقول المطلوبة: متوسط حدود مستويات الأطر الثلاثة */
export const requiredCap = (levels, caps = CARDS.base.initiative.required_cap) => Math.round(DIMENSIONS.reduce((a, d) => a + caps[levels[d]], 0) / DIMENSIONS.length);

function cardFor({ track, levels, priority, profile, profileLevel, form, density, estimate_hours }) {
  const L = cardLayers(track, profile, profileLevel);
  const t = TRACK_BY_KEY[track] || {};
  const p = PROFILE_BY_KEY[profile] || {};
  const order = L.handbook?.order === 'priority_first' && priority ? [priority, ...DIMENSIONS.filter((d) => d !== priority)] : [...DIMENSIONS];
  const caseDef = SLICES.frameworks.impact.case?.[levels.impact] || {};
  return {
    identity: { name: t.title_ar || null, title: p.title_ar || null, description: p.summary_ar || null },
    handbook: {
      type: L.handbook?.type || 'applied', order, deepened: priority,
      frameworks: Object.fromEntries(DIMENSIONS.map((d) => [d, { level: levels[d], terms: termsAt(d, levels[d]) }])),
    },
    initiative: {
      form: form.key, name: form.name, pages: [...form.pages],
      // وحدات العرض لفصول كل إطار بمستواه فيه (lens.json units): مجمّعة، أو فصلًا فصلًا للاحترافي
      units: Object.fromEntries(DIMENSIONS.map((d) => { const keys = (LENS.units[levels[d]] || []).map((u) => u.key); return [d, { mode: keys.length ? 'grouped' : 'chapters', keys }]; })),
      required_cap: requiredCap(levels, L.initiative?.required_cap),
    },
    journey: {
      requirements: DIMENSIONS.flatMap((d) => journeyAt(d, levels[d])),
      labs: DIMENSIONS.flatMap((d) => labsAt(d, levels[d])),
      by_framework: Object.fromEntries(DIMENSIONS.map((d) => [d, { requirements: journeyAt(d, levels[d]), labs: labsAt(d, levels[d]) }])),
    },
    support: {
      mode: L.support?.mode || 'examples', examples: density.examples,
      case: { form: caseDef.form || density.case, questions: caseDef.questions ? { ...caseDef.questions } : null, readiness: caseDef.form === 'readiness' ? [...LENS.density.readiness_questions] : null },
      estimate_hours: [...estimate_hours],
    },
    bridges: [],
  };
}

/** عدسة فصل: مستوى المحتوى الذي يرسله الخادم للفصل، وإلا مستواه بإطاره في البيان */
export const chapterLens = (manifest, section) => section?.level || manifest?.frameworks?.[section?.dimension]?.level || 'advanced';
