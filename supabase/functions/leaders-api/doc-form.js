// شكل النسخة المؤسسية للمشارك: غلاف رقيق على trackManifest (track-manifest.js)، المصدر الوحيد للحل. منطق خالص للخادم والتطبيق.
import { FORMS } from './document-forms.js';
import { trackKey } from './logic.js';
import { trackManifest } from './track-manifest.js';

/**
 * يعيد { key, name, en, pages, sections, profile, track, source }.
 * @param {{ levels?: Record<string,string>|null, priority?: string|null, track?: string|null }} x
 */
export function docFormFor({ levels = null, priority = null, track = null } = {}) {
  const m = trackManifest(track || (levels ? trackKey(levels) : null), priority);
  return { ...m.document, profile: m.profile, track: m.track };
}

/** الشكل كما في الوثيقة: المجمَّد في لقطة الاعتماد أولًا، ثم ما أرسله الخادم، وإلا يُحل من المسار */
export function formOfDoc(doc) {
  const m = doc?.meta || {};
  const f = doc?.issued?.meta?.doc_form || m.doc_form;
  if (f && FORMS[f.key]) return { ...FORMS[f.key], ...f, pages: [...FORMS[f.key].pages] };
  return docFormFor({ track: m.track_key || null, priority: m.priority || null });
}
