// ════════════════════════════════════════════════════════════════
// المنهجية: الرحلة والقياس والمستويات والمسارات (منطق بلا واجهة)
// ════════════════════════════════════════════════════════════════
// الثوابت وحقول النماذج وحاسبة التسكين وإعادة الترتيب، مفصولة عن الشاشات
// لتُختبر وحدها. الاحتساب الرسمي للتسكين على الخادم؛ هنا نسخة العرض.
import { DIM, DIMS, LVL } from './leaders.js';
import { VERIFIED_KINDS } from '../../supabase/functions/leaders-api/logic.js';

export const LVLS = Object.keys(LVL);
export const TIER = { knowledge: 'معرفة', skill: 'مواقف', behavior: 'ممارسة', transfer: 'انتقال التعلم (بعدي، بلا درجة)' };
export const PHASE = { admission: 'القبول', qualification: 'التأهيل', impact: 'الأثر' };
export const KIND = {
  check: 'تأكيد إنجاز', upload: 'رفع ملف', form: 'نموذج', meeting: 'جلسة يسجلها المستشار', auto: 'تلقائي',
  reading: 'قراءة أبواب الكتاب', video: 'مشاهدة فيديو', workshop: 'جلسات جماعية بمواعيد', coaching: 'جلسات فردية بحجز', curriculum: 'منهج المسار',
  model: 'نموذج تعليمي', capstone: 'مشروع التخرج',
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
  curriculum: 'مقاطع وملفات وروابط من «بنك المحتوى» يختار النظام منها ما يخص مسار كل مشارك بحسب وسومها. يكتمل بمشاهدة المقاطع وفتح الملفات فعلًا.',
  coaching: 'توجيه أو استشارة فردية. يحجز المشارك من رابط Cal.com أو Calendly، أو يتصل فورًا حين تكون متاحًا، وتؤكد أنت حضوره.',
  model: 'نموذج من «كتيب القائد» يبنيه المشارك في المنصة، فيكتمل المتطلب بتسليمه أو بتقييمك له. لا رفع ملفات: النموذج نفسه هو المخرج وفصل في وثيقة مبادرته.',
  capstone: 'وثيقة المبادرة كاملة: يكتمل حين تعتمدها بالمعيار ويؤيدها راعيها. تراجعها من «مشاريع التخرج».',
};
export const VERIFY = { qr: 'رمز QR يعرضه المدرب (في القاعة أو على الشاشة المشتركة)', join: 'الانضمام من التطبيق (للجلسات عن بعد)', manual: 'يسجله المدرب يدويًا' };
export const COACH_MODE = { online: 'عن بعد', in_person: 'حضوري', any: 'حضوري أو عن بعد حسب الحجز' };
// أنواع يحسم النظام إكمالها بدليل، لا بنقرة المشارك: القائمة نفسها التي يحتسب بها الخادم
export const VERIFIED = new Set(VERIFIED_KINDS);
const ACCEPT = { reviewed: 'حين يقيّمه المستشار', submitted: 'بمجرد تسليمه' };
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

export const reqFields = (stages, models = []) => [
  { name: 'code', label: 'الرمز (فريد، مثل T-ATTEND)', dir: 'ltr' },
  { name: 'title_ar', label: 'نص المتطلب' },
  { name: 'help_ar', label: 'توضيح للمشارك', type: 'textarea', rows: 2 },
  { name: 'stage_key', label: 'المرحلة', type: 'select', options: Object.fromEntries(stages.map((s) => [s.key, s.title_ar])) },
  { name: 'kind', label: 'النوع', type: 'select', options: KIND, help: (v) => KIND_HELP[v.kind] },
  { name: 'dimension', label: 'خاص ببُعد', type: 'select', options: DIM, empty: 'للجميع' },
  { name: 'level', label: 'وبمستوى', type: 'select', options: LVL, empty: 'كل المستويات' },
  // إعداد النشاط الموثق بحسب نوعه (يُجمع في config عند الحفظ)
  { name: 'cfg_scope', label: 'الأبواب المطلوبة', type: 'select', options: READ_SCOPE, show: (v) => v.kind === 'reading' },
  { name: 'cfg_dimension', label: 'الإطار', type: 'select', options: DIM, empty: 'كل الأطر', show: (v) => (v.kind === 'reading' && v.cfg_scope === 'dimension') || v.kind === 'curriculum',
    help: (v) => (v.kind === 'curriculum' ? 'مواد إطار واحد لتوزيع المنهج على المراحل، أو كل المنهج في نشاط واحد.' : null) },
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
  { name: 'cfg_model_key', label: 'النموذج التعليمي', type: 'select', options: Object.fromEntries(models.map((m) => [m.key, m.title_ar])), show: (v) => v.kind === 'model',
    help: () => 'يراه المشارك بمستواه ونطاق عمله. إن لم يكن النموذج متاحًا له حُسب المتطلب منجزًا، فلا يُطالب بما لا يخصه.' },
  { name: 'cfg_accept', label: 'يكتمل', type: 'select', options: ACCEPT, show: (v) => v.kind === 'model' },
  { name: 'required', label: 'إلزامي لإكمال المرحلة', type: 'check' },
  { name: 'needs_review', label: 'يعتمده المستشار بعد الإنجاز', type: 'check', show: (v) => !VERIFIED.has(v.kind) },
  { name: 'active', label: 'مفعّل', type: 'check' },
];

// المتطلب ← قيم النموذج: حقول config تُفرد بأسماء cfg_*
const CFG_DEFAULTS = { accept: 'reviewed', scope: 'all', quiz: true, min_pct: 90, sessions_required: 1, minutes: 60, verify: 'qr', mode: 'online' };
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
  { name: 'anchor_code', label: 'سؤال الربط في القياس المبدئي (للبعدي، مثل M-S2)', dir: 'ltr' },
  { name: 'retro', label: 'يُسأل أيضًا: كيف كان قبل البرنامج (ممارسة في البعدي)', type: 'check' },
  { name: 'text_rater_ar', label: 'صيغة الغائب لتقدير المدير', type: 'textarea', rows: 2 },
  { name: 'active', label: 'مفعّل', type: 'check' },
];
// إصدار له نتائج: الصياغة فقط، فلا تختل درجات من أجاب
export const Q_SAFE = Q_FIELDS.filter((f) => ['text_ar', 'help_ar', 'text_rater_ar'].includes(f.name));

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
const GROUP = { stage_requirements: 'stage_key', questions: 'instrument_id', handbook_modules: 'dimension', learning_models: 'dimension', content_items: 'dimension' };
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

// ══ البرامج والدفعات ══
export const COHORT_STATUS = { planned: 'مخطط لها', open: 'التسجيل مفتوح', running: 'جارية', closed: 'مغلقة' };
const INHERIT = 'كما في البرنامج';

// حقول نموذج الدفعة: الأساسيات، ثم طريقة تنفيذ كل نشاط جماعي أو فردي في البرنامج
export function cohortFields({ orgs = [], programs = [], versions = [], reqs = [], isDefault = false }) {
  const verN = Object.fromEntries(versions.map((x) => [x.id, `مثبتة على النسخة ${x.number}: ${x.label}`]));
  const base = [
    { name: 'name', label: 'اسم الدفعة' },
    ...(isDefault ? [] : [{ name: 'organization_id', label: 'الجهة', type: 'select', empty: 'بلا جهة (أفراد)', options: Object.fromEntries(orgs.map((o) => [o.id, o.name])) }]),
    { name: 'program_id', label: 'البرنامج', type: 'select', options: Object.fromEntries(programs.filter((p) => !p.archived_at).map((p) => [p.id, p.name])) },
    {
      name: 'program_version_id', label: 'نسخة البرنامج', type: 'select', empty: 'تتبع آخر تعديل على البرنامج', options: verN,
      help: 'التثبيت على نسخة يحمي الدفعة الجارية من أي تعديل لاحق على البرنامج حتى ترقيها بنفسك.',
    },
    { name: 'starts_on', label: 'تبدأ', type: 'date' },
    { name: 'ends_on', label: 'تنتهي', type: 'date' },
    { name: 'status', label: 'الحالة', type: 'select', options: isDefault ? { open: COHORT_STATUS.open, running: COHORT_STATUS.running } : COHORT_STATUS },
    { name: 'capacity', label: 'المقاعد', type: 'number' },
    { name: 'notes_ar', label: 'ملاحظات', type: 'textarea', rows: 2 },
  ];
  const delivery = [];
  for (const r of reqs.filter((x) => x.active !== false)) {
    const t = `${r.code} · ${r.title_ar}`;
    if (r.kind === 'workshop') {
      delivery.push({ name: `d:${r.code}:verify`, label: `${t}: توثيق الحضور`, type: 'select', empty: `${INHERIT} (${VERIFY[r.config?.verify || 'qr']})`, options: VERIFY });
    }
    if (r.kind === 'coaching') {
      delivery.push(
        { name: `d:${r.code}:mode`, label: `${t}: طريقة الجلسة`, type: 'select', empty: `${INHERIT} (${COACH_MODE[r.config?.mode || 'online']})`, options: COACH_MODE },
        { name: `d:${r.code}:location_ar`, label: `${t}: المكان`, show: (v) => (v[`d:${r.code}:mode`] || r.config?.mode) !== 'online' },
        { name: `d:${r.code}:booking_url`, label: `${t}: رابط حجز مدربي هذه الدفعة`, dir: 'ltr', help: 'فارغ: رابط البرنامج' },
        { name: `d:${r.code}:coach_email`, label: `${t}: بريد الموجّه`, type: 'email', dir: 'ltr' },
      );
    }
  }
  if (delivery.length) delivery[0] = { ...delivery[0], help: 'التنفيذ في هذه الدفعة. اتركه فارغًا ليبقى كما في البرنامج.' };
  return [...base, ...delivery];
}

export function cohortToForm(c = {}) {
  const v = { ...c, program_version_id: c.program_version_id || '', organization_id: c.organization_id || '' };
  for (const [code, d] of Object.entries(c.delivery || {})) for (const [k, x] of Object.entries(d)) v[`d:${code}:${k}`] = x;
  delete v.delivery;
  return v;
}

export function formToCohort(v) {
  const out = {}, delivery = {};
  for (const [k, x] of Object.entries(v)) {
    const m = k.match(/^d:(.+):([a-z_]+)$/);
    if (m) { if (x != null && x !== '') (delivery[m[1]] ||= {})[m[2]] = x; } else out[k] = x;
  }
  return { ...out, delivery };
}

// ══ بنك المحتوى ══
export const CONTENT_KIND = { video: 'فيديو', file: 'ملف (PDF أو عرض)', link: 'رابط' };
export const CONTENT_FIELDS = [
  { name: 'kind', label: 'النوع', type: 'select', options: CONTENT_KIND },
  { name: 'title_ar', label: 'العنوان' },
  { name: 'description_ar', label: 'وصف قصير يظهر للمشارك', type: 'textarea', rows: 2 },
  { name: 'url', label: 'الرابط (https)', dir: 'ltr', help: (v) => (v.kind === 'video' ? 'يوتيوب أو ملف mp4 مباشر. تُحتسب المشاهدة الفعلية فقط.' : 'يُحتسب حين يفتحه المشارك من التطبيق.') },
  { name: 'minutes', label: 'المدة التقريبية بالدقائق', type: 'number' },
  { name: 'dimension', label: 'لمن', type: 'select', empty: 'للجميع', options: DIM, help: 'الوسم يحدد المسارات التي تظهر لها المادة تلقائيًا.' },
  { name: 'min_level', label: 'من مستوى', type: 'select', empty: 'كل المستويات', options: { beginner: 'تأسيسي فأعلى', intermediate: 'متوسط فأعلى', advanced: 'احترافي' }, show: (v) => !!v.dimension && !v.only_level },
  { name: 'only_level', label: 'أو لمستوى واحد فقط', type: 'select', empty: 'لا', options: LVL, show: (v) => !!v.dimension && !v.min_level },
  { name: 'track_keys', label: 'لمسارات بعينها فقط (اختياري)', dir: 'ltr', help: 'مفاتيح مثل M1I2L3 مفصولة بفواصل. تتقدم على الوسم.' },
  { name: 'exclude_tracks', label: 'استبعاد مسارات (اختياري)', dir: 'ltr' },
  { name: 'min_pct', label: 'نسبة المشاهدة المطلوبة %', type: 'number', show: (v) => v.kind === 'video' },
  { name: 'required', label: 'إلزامية', type: 'check' },
  { name: 'active', label: 'مفعّلة', type: 'check' },
];
export const contentToForm = (c) => ({ ...c, track_keys: (c.track_keys || []).join(', '), exclude_tracks: (c.exclude_tracks || []).join(', ') });
// وصف الجمهور بكلمات
export function audienceLabel(c) {
  const parts = [];
  if ((c.track_keys || []).length) parts.push(`مسارات: ${c.track_keys.join('، ')}`);
  else if (!c.dimension) parts.push('للجميع');
  else parts.push(`${DIM[c.dimension]}${c.only_level ? ` · ${LVL[c.only_level]} فقط` : c.min_level ? ` · ${LVL[c.min_level]} فأعلى` : ''}`);
  if ((c.exclude_tracks || []).length) parts.push(`عدا ${c.exclude_tracks.join('، ')}`);
  return parts.join(' · ');
}
