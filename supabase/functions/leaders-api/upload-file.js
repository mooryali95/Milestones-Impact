// ════════════════════════════════════════════════════════════════
// الملف المرفوع لبند في الرحلة: اسمه ووقت رفعه، ومتى يُستبدل
// ════════════════════════════════════════════════════════════════
// دوال صرفة يقرؤها الخادم (requirementUpdate في participant.ts، وbuildJourney في logic.js) وواجهة المشارك (Journey.jsx).
// الاسم ووقت الرفع يُحفظان مع صف البند نفسه في participant_requirements.answers تحت المفتاح file، فلا عمود جديد ولا ترحيل:
// answers لبند الاستبانة إجاباته، ولبند الرفع وصف ملفه. المسار في المخزن يبقى <المشارك>/evidence/<uuid>.<امتداد> كما
// تتحقق منه guards.js (privateFile)، فلا يدخل اسم يكتبه المشارك في مسار.
// (جولة المشارك 2026-11-19، البند 13: بعد الرفع لا اسم للملف ولا طريق لتصحيح ملف خاطئ)

export const FILE_NAME_MAX = 120;

/** اسم الملف كما يُحفظ ويُعرض: بلا مسار ولا محارف تحكم ولا محارف اتجاه خفية، وبطول محدود. '' لما لا اسم له
 * @param {unknown} name */
export function cleanFileName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  // محارف التحكم، ومحارف الاتجاه الخفية (قد تقلب الامتداد في العرض)
  // eslint-disable-next-line no-control-regex
  const t = base.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= FILE_NAME_MAX) return t;
  // الطويل يُقص من وسطه فيبقى امتداده ظاهرًا
  const dot = t.lastIndexOf('.');
  const ext = dot > 0 && t.length - dot <= 8 ? t.slice(dot) : '';
  return `${t.slice(0, FILE_NAME_MAX - ext.length - 1)}…${ext}`;
}

/** ما يُكتب في answers لبند الرفع @param {unknown} name @param {string} at وقت الرفع ISO */
export const fileAnswers = (name, at) => ({ file: { name: cleanFileName(name) || null, at } });

const EXT_AR = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', png: 'صورة', jpg: 'صورة', jpeg: 'صورة' };
/** نوع الملف من امتداد مساره، لما رُفع قبل حفظ الأسماء: «ملف PDF» بدل اسم لا نعرفه @param {unknown} path */
export function fileKindAr(path) {
  const ext = String(path || '').split('.').pop()?.toLowerCase() || '';
  const k = EXT_AR[ext];
  return k ? (k === 'صورة' ? 'صورة' : `ملف ${k}`) : 'ملف';
}

/** الملف المرفوع كما يراه صاحبه، من صف البند: { name, at, kind } أو null إن لم يُرفع شيء.
 * name قد يكون null (رُفع قبل حفظ الأسماء) فيُعرض نوعه. at وقت الرفع المحفوظ، وإلا وقت التسليم أو الإتمام من الصف نفسه
 * @param {any} row صف participant_requirements */
export function uploadedFile(row) {
  if (!row?.evidence_path) return null;
  const f = row.answers && typeof row.answers === 'object' ? row.answers.file : null;
  return { name: cleanFileName(f?.name) || null, at: f?.at || row.submitted_at || row.completed_at || null, kind: fileKindAr(row.evidence_path) };
}

/** هل يُستبدل الملف؟ ما دام البند مفتوحًا للتعديل: لم يُراجع بعد (بانتظار المراجعة)، أو أُعيد للتعديل، أو بند بلا مراجعة.
 * ما اعتمده المستشار لا يُستبدل. الحكم نفسه في الخادم (يرفض) والواجهة (تخفي الزر)
 * @param {{ status?: string, needs_review?: boolean }} item */
export function canReplaceFile(item) {
  const s = item?.status;
  if (s === 'submitted' || s === 'returned') return true;
  return s === 'done' && !item?.needs_review;
}
export const REPLACE_REFUSED_AR = 'اعتمد مستشارك هذا البند، فلا يُستبدل ملفه. إن احتجت تعديله فراسل مستشارك.';
