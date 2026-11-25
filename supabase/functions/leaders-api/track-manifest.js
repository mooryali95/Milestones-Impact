// ════════════════════════════════════════════════════════════════
// بيان المسار: دالة خالصة واحدة تقرأ البيانات وحدها، للخادم والتطبيق (عدسة العرض والوثيقة المطبوعة)
// ════════════════════════════════════════════════════════════════
// لا مكوّن يحسب الشكل من المستويات مباشرة: كل من يحتاج اسم الوثيقة أو حجمها أو أبوابها يسأل trackManifest.
// البيانات: document-forms.js (افتراض ملف التعريف PROFILE_FORMS، واستثناء المسار TRACK_FORMS، والأشكال FORMS).
//
// trackManifest(trackKey, priority?) يعيد:
//   track      مفتاح المسار M{m}I{i}L{l} أو null
//   levels     { milestone, impact, leadership } من المفتاح
//   priority   إطار الأولوية: الممرَّر (من مؤشرات المشارك عند التعادل) أو الأضعف (priorityFor)
//   profile    ملف التعريف من التسعة: «<إطار الأولوية>-<مستواه فيه>»
//   document   { key: card|charter|case, name, en, pages: [أدنى، أعلى], sections: أبواب النسخة المؤسسية بالترتيب, source: track|profile|default|none }
// بلا مسار معروف: الشكل الكامل (case)، فلا يُحذف من وثيقة شيء بغياب القياس.
import { DEFAULT_BY_LEVEL, FORMS, PROFILE_FORMS, TRACK_FORMS } from './document-forms.js';
import { priorityFor, profileKey, trackLevels } from './logic.js';

// أبواب كل شكل بالترتيب (src/lib/brand/institutional.js يبنيها بهذه المفاتيح)
export const FORM_SECTIONS = Object.freeze({
  card: Object.freeze(['decision', 'card', 'first-90-days', 'approval']),
  charter: Object.freeze(['decision', 'overview', 'why', 'value', 'plan', 'governance', 'approval']),
  case: Object.freeze(['decision', 'overview', 'why', 'value', 'plan', 'governance', 'impact', 'approval']),
});

export function trackManifest(trackKey, priority = null) {
  const levels = trackLevels(trackKey);
  const track = levels ? String(trackKey) : null;
  const pr = levels ? priority || priorityFor(levels) : null;
  const profile = levels ? profileKey(levels, pr) : null;
  let key = null, source = 'none';
  if (track && FORMS[TRACK_FORMS[track]]) { key = TRACK_FORMS[track]; source = 'track'; }
  else if (profile && FORMS[PROFILE_FORMS[profile]]) { key = PROFILE_FORMS[profile]; source = 'profile'; }
  else if (pr && DEFAULT_BY_LEVEL[levels[pr]]) { key = DEFAULT_BY_LEVEL[levels[pr]]; source = 'default'; }
  const f = FORMS[key] || FORMS.case;
  return { track, levels, priority: pr, profile, document: { key: f.key, name: f.name, en: f.en, pages: [...f.pages], sections: [...FORM_SECTIONS[f.key]], source } };
}
