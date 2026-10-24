// ════════════════════════════════════════════════════════════════
// المنهجية: الرحلة والقياس والمستويات والمسارات (منطق بلا واجهة)
// ════════════════════════════════════════════════════════════════
// الثوابت وحقول النماذج وحاسبة التسكين وإعادة الترتيب، مفصولة عن الشاشات
// لتُختبر وحدها. الاحتساب الرسمي للتسكين على الخادم؛ هنا نسخة العرض.
import { DIM, DIMS, LVL } from './leaders.js';

export const LVLS = Object.keys(LVL);
export const TIER = { knowledge: 'معرفة', skill: 'مواقف', behavior: 'ممارسة' };
export const PHASE = { admission: 'القبول', qualification: 'التأهيل', impact: 'الأثر' };
export const KIND = {
  check: 'تأكيد إنجاز', upload: 'رفع ملف', form: 'نموذج', meeting: 'جلسة يسجلها المستشار', auto: 'تلقائي',
  reading: 'قراءة أبواب الكتاب', video: 'مشاهدة فيديو', workshop: 'جلسات جماعية بمواعيد', coaching: 'جلسات فردية بحجز',
};
// ما يعنيه كل نوع، يظهر تحت اختيار النوع
export const KIND_HELP = {
  check: 'يضغط المشارك «أنجزته»، ويمكن أن يعتمده المستشار.',
  upload: 'يرفع المشارك ملفًا، ويمكن أن يراجعه المستشار.',
  form: 'نموذج يملؤه المشارك.',
  meeting: 'يسجله المستشار يدويًا.',
  auto: 'يحسمه النظام من حالة المشارك.',
  reading: 'يُقاس وقت القراءة الفعلي لكل باب، فيُميَّز القارئ من المتصفح، مع اختبار الباب إن شئت.',
  video: 'يُحتسب ما شوهد فعلًا من يوتيوب أو ملف mp4، والتقديم السريع لا يُحتسب.',
  workshop: 'ورشة أو محاضرة أو لقاء جماعي. تضيف مواعيده من «الحضور والجلسات»، ولكل موعد طريقته: حضوري بمكان، أو عن بعد برابط اجتماع.',
  coaching: 'توجيه أو استشارة فردية. يحجز المشارك من رابط Cal.com أو Calendly، أو يتصل فورًا حين تكون متاحًا، وتؤكد أنت حضوره.',
};
const VERIFY = { qr: 'رمز QR يعرضه المدرب (في القاعة أو على الشاشة المشتركة)', join: 'الانضمام من التطبيق (للجلسات عن بعد)', manual: 'يسجله المدرب يدويًا' };
const COACH_MODE = { online: 'عن بعد', in_person: 'حضوري', any: 'حضوري أو عن بعد حسب الحجز' };
// أنواع يحسم النظام إكمالها بدليل، لا بنقرة المشارك
export const VERIFIED = new Set(['reading', 'video', 'workshop', 'coaching']);
const READ_SCOPE = { all: 'كل أبواب مسار المشارك', first: 'الباب الأول من كل إطار', dimension: 'أبواب إطار واحد' };
export const MODE = { in_person: 'حضوري', online: 'عن بعد', hybrid: 'مدمج', self: 'ذاتي عبر المنصة' };
export const ROMAN = { beginner: 'I', intermediate: 'II', advanced: 'III' };
const LNUM = { beginner: 1, intermediate: 2, advanced: 3 };

// ── حقول النماذج (صيغة Form.jsx) ──
export const STAGE_FIELDS = [
  { name: 'title_ar', label: 'اسم المرحلة' },
  { name: 'phase', label: 'المحور', type: 'select', options: PHASE },
  { name: 'duration_label', label: 'المدة كما تظهر للمشارك' },
  { name: 'duration_days', label: 'المدة بالأيام', type: 'number' },
  { name: 'mode', label: 'طريقة التنفيذ', type: 'select', options: MODE, empty: 'غير محددة' },
  { name: 'mode_note_ar', label: 'تفصيل الطريقة (مثال: حضوري في الرياض أو مباشر عن بعد)' },
  { name: 'description_ar', label: 'الوصف', type: 'textarea', rows: 3 },
  { name: 'builds_on_ar', label: 'تنطلق من (مخرج المرحلة السابقة)' },
  { name: 'activities_ar', label: 'ماذا يتم (كل سطر بند)', type: 'textarea', rows: 5 },
  { name: 'outcome_ar', label: 'ما يخرج به المشارك', type: 'textarea', rows: 3 },
  { name: 'active', label: 'ظاهرة للمشاركين', type: 'check' },
];

export const reqFields = (stages) => [
  { name: 'code', label: 'الرمز (فريد، مثل T-ATTEND)', dir: 'ltr' },
  { name: 'title_ar', label: 'نص المتطلب' },
  { name: 'help_ar', label: 'توضيح للمشارك', type: 'textarea', rows: 2 },
  { name: 'stage_key', label: 'المرحلة', type: 'select', options: Object.fromEntries(stages.map((s) => [s.key, s.title_ar])) },
  { name: 'kind', label: 'النوع', type: 'select', options: KIND, help: (v) => KIND_HELP[v.kind] },
  { name: 'dimension', label: 'خاص ببُعد', type: 'select', options: DIM, empty: 'للجميع' },
  { name: 'level', label: 'وبمستوى', type: 'select', options: LVL, empty: 'كل المستويات' },
  // إعداد النشاط الموثق بحسب نوعه (يُجمع في config عند الحفظ)
  { name: 'cfg_scope', label: 'الأبواب المطلوبة', type: 'select', options: READ_SCOPE, show: (v) => v.kind === 'reading' },
  { name: 'cfg_dimension', label: 'الإطار', type: 'select', options: DIM, show: (v) => v.kind === 'reading' && v.cfg_scope === 'dimension' },
  { name: 'cfg_quiz', label: 'يشترط اجتياز أسئلة كل باب', type: 'check', show: (v) => v.kind === 'reading' },
  { name: 'cfg_url', label: 'رابط الفيديو (يوتيوب أو ملف mp4 يبدأ بـ https)', dir: 'ltr', show: (v) => v.kind === 'video' },
  { name: 'cfg_title', label: 'عنوان الفيديو كما يراه المشارك', show: (v) => v.kind === 'video' },
  { name: 'cfg_min_pct', label: 'نسبة المشاهدة المطلوبة %', type: 'number', show: (v) => v.kind === 'video' },
  { name: 'cfg_sessions_required', label: 'عدد الجلسات المطلوب حضورها', type: 'number', show: (v) => v.kind === 'workshop' || v.kind === 'coaching' },
  { name: 'cfg_verify', label: 'توثيق الحضور', type: 'select', options: VERIFY, show: (v) => v.kind === 'workshop' },
  { name: 'cfg_mode', label: 'طريقة الجلسة', type: 'select', options: COACH_MODE, show: (v) => v.kind === 'coaching' },
  { name: 'cfg_location_ar', label: 'المكان للجلسات الحضورية', show: (v) => v.kind === 'coaching' && v.cfg_mode !== 'online' },
  { name: 'cfg_minutes', label: 'مدة الجلسة بالدقائق', type: 'number', show: (v) => v.kind === 'coaching' },
  { name: 'cfg_booking_url', label: 'رابط الحجز (Cal.com أو Calendly)', dir: 'ltr', show: (v) => v.kind === 'coaching' },
  { name: 'cfg_instant_url', label: 'رابط غرفة الاتصال الفوري (Google Meet أو Zoom الثابت)', dir: 'ltr', show: (v) => v.kind === 'coaching' && v.cfg_mode !== 'in_person' },
  { name: 'cfg_coach_email', label: 'بريد الموجّه لتنبيه الاتصال الفوري', type: 'email', dir: 'ltr', show: (v) => v.kind === 'coaching' },
  { name: 'required', label: 'إلزامي لإكمال المرحلة', type: 'check' },
  { name: 'needs_review', label: 'يعتمده المستشار بعد الإنجاز', type: 'check', show: (v) => !VERIFIED.has(v.kind) },
  { name: 'active', label: 'مفعّل', type: 'check' },
];

// المتطلب ← قيم النموذج: حقول config تُفرد بأسماء cfg_*
const CFG_DEFAULTS = { scope: 'all', quiz: true, min_pct: 90, sessions_required: 1, minutes: 60, verify: 'qr', mode: 'online' };
export function reqToForm(r) {
  const c = { ...CFG_DEFAULTS, ...(r.config || {}) };
  return { ...r, ...Object.fromEntries(Object.entries(c).map(([k, x]) => [`cfg_${k}`, x])) };
}
// قيم النموذج ← المتطلب: config من حقول cfg_* الظاهرة لنوعه
export function formToReq(v) {
  const config = {};
  const row = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('cfg_')) { if (x !== null && x !== '') config[k.slice(4)] = x; } else row[k] = x;
  }
  return { ...row, config };
}

export const Q_FIELDS = [
  { name: 'code', label: 'الرمز (مثل M-K5)', dir: 'ltr' },
  { name: 'tier', label: 'المستوى المقيس', type: 'select', options: TIER },
  { name: 'kind', label: 'نوع الإجابة', type: 'select', options: { choice: 'اختيار من متعدد', likert: 'مقياس تكرار' } },
  { name: 'text_ar', label: 'نص السؤال', type: 'textarea', rows: 3 },
  { name: 'help_ar', label: 'تلميح يظهر تحته', type: 'textarea', rows: 2 },
  { name: 'options', label: 'الخيارات والدرجات (الأعلى = الأفضل)', type: 'options' },
  { name: 'weight', label: 'الوزن', type: 'number' },
  { name: 'active', label: 'مفعّل', type: 'check' },
];
// إصدار له نتائج: الصياغة فقط، فلا تختل درجات من أجاب
export const Q_SAFE = Q_FIELDS.filter((f) => ['text_ar', 'help_ar'].includes(f.name));

export const INST_FIELDS = [
  { name: 'title_ar', label: 'العنوان' },
  { name: 'intro_ar', label: 'المقدمة للمشارك', type: 'textarea', rows: 4 },
  { name: 'est_minutes', label: 'المدة التقديرية بالدقائق', type: 'number' },
];

export const CELL_FIELDS = [
  { name: 'path_title_ar', label: 'عنوان المسار' },
  { name: 'description_ar', label: 'الوصف للمشارك', type: 'textarea', rows: 5 },
];

export const TRACK_FIELDS = [
  { name: 'title_ar', label: 'اسم المسار' },
  { name: 'summary_ar', label: 'لمن صُمّم المسار', type: 'textarea', rows: 3 },
  { name: 'focus_ar', label: 'أولويات التطوير (كل سطر بند)', type: 'textarea', rows: 4 },
  { name: 'project_ar', label: 'المشروع التطبيقي', type: 'textarea', rows: 2 },
  { name: 'journey_ar', label: 'كيف تتوجه الرحلة: التدريب والكوتشينغ والأقران (كل سطر بند)', type: 'textarea', rows: 4 },
  { name: 'priority_dimension', label: 'محور التركيز الأول', type: 'select', options: DIM },
];

// ── المسارات ──
// M2I1L3 ← { milestone: intermediate, impact: beginner, leadership: advanced }
export const trackLevels = (key) => Object.fromEntries(DIMS.map((d, i) => [d, LVLS[Number(String(key)[i * 2 + 1]) - 1]]));
export const trackKey = (m, i, l) => `M${LNUM[m]}I${LNUM[i]}L${LNUM[l]}`;
export const shortTitle = (t) => String(t || '').replace(/^مسار\s+/, '');
export const lines = (x) => String(x || '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);

// ── معيار التسكين المركّب ──
export const MODEL_DEFAULT = { w_knowledge: 35, w_skill: 50, w_behavior: 15, min_intermediate: 55, min_advanced: 80, floor_intermediate: 40, floor_advanced: 60, borderline: 8 };
export function evaluate(p, m) {
  const w = { knowledge: +m.w_knowledge, skill: +m.w_skill, behavior: +m.w_behavior };
  const tiers = ['knowledge', 'skill', 'behavior'].filter((t) => p[t] != null && p[t] !== '' && w[t] > 0);
  const ws = tiers.reduce((a, t) => a + w[t], 0);
  if (!ws) return null;
  const composite = Math.round(tiers.reduce((a, t) => a + w[t] * p[t], 0) / ws * 10) / 10;
  const low = Math.min(...tiers.map((t) => +p[t]));
  const level = composite >= +m.min_advanced && low >= +m.floor_advanced ? 'advanced'
    : composite >= +m.min_intermediate && low >= +m.floor_intermediate ? 'intermediate' : 'beginner';
  return { composite, level, low };
}

// ── إعادة الترتيب ──
// يعيد ترتيب المعرّفات بعد تبديل العنصر مع جاره داخل مجموعته، أو null إن كان على الطرف
const GROUP = { stage_requirements: 'stage_key', questions: 'instrument_id', handbook_modules: 'dimension', learning_models: 'dimension' };
export function reorderIds(rows, entity, id, dir) {
  const key = entity === 'journey_stages' ? 'key' : 'id';
  const me = rows.find((x) => x[key] === id);
  if (!me) return null;
  const g = GROUP[entity];
  const list = rows.filter((x) => !g || x[g] === me[g]).sort((a, b) => a.sort - b.sort);
  const i = list.indexOf(me);
  const j = i + Number(dir);
  if (j < 0 || j >= list.length) return null;
  [list[i], list[j]] = [list[j], list[i]];
  return list.map((x) => x[key]);
}
