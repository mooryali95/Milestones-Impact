// ════════════════════════════════════════════════════════════════
// تصنيف المتطلب عند المراجعة (تصور المرحلة 2، 2.4): ثابت واحد يقرؤه الخادم (admin.review) والإدارة (صندوق «ينتظرني»)
// ════════════════════════════════════════════════════════════════
// من kind القائم في stage_requirements بلا حقل جديد. ذاتي الإقرار يُعتمد جماعيًا، وبدليل يُعتمد منفردًا بعد رؤية دليله،
// والآلي يكتمل وحده (حضور أو جلسة) فلا يُعتمد جماعيًا. ما يحمل دليلًا مرفقًا (ملفًا أو إجابات نموذج) بدليل مهما كان نوعه،
// ونوع لا يعرفه الثابت بدليل احتياطًا: الخطأ في التصنيف يبطئ الاعتماد ولا يعتمد ما لم يُر.

export const REVIEW_CLASS = Object.freeze({
  self: Object.freeze(['check', 'reading', 'video', 'meeting']),
  evidence: Object.freeze(['upload', 'form', 'model', 'capstone', 'curriculum']),
  auto: Object.freeze(['auto', 'workshop', 'coaching']),
});

const hasAnswers = (a) => !!a && typeof a === 'object' && Object.values(a).some((v) => v != null && String(v).trim() !== '');

/** @param {string | null | undefined} kind @param {{ evidence_path?: string | null, answers?: any }} [sub] @returns {'self' | 'evidence' | 'auto'} */
export function reviewClass(kind, sub = {}) {
  if (REVIEW_CLASS.auto.includes(String(kind))) return 'auto';
  if (sub?.evidence_path || hasAnswers(sub?.answers)) return 'evidence';
  return REVIEW_CLASS.self.includes(String(kind)) ? 'self' : 'evidence';
}

export const BULK_REVIEW_REFUSED_AR = 'الاعتماد الجماعي للمتطلبات ذاتية الإقرار وحدها. افتح دليل هذا المتطلب واعتمده منفردًا';

// الدليل المضمّن في سطر المتطلب: اسم الملف، أو أول سطور إجابات النموذج مختصرة. لا دليل: null
/** @param {{ evidence_path?: string | null, answers?: any } | null | undefined} sub */
export function evidencePreview(sub, max = 160) {
  if (sub?.evidence_path) return { file: String(sub.evidence_path).split('/').pop() || String(sub.evidence_path) };
  if (!hasAnswers(sub?.answers)) return null;
  const text = Object.values(sub.answers).filter((v) => v != null && String(v).trim() !== '')
    .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)).trim()).join(' · ');
  return { text: text.length > max ? `${text.slice(0, max)}…` : text };
}
