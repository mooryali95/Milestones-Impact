// ════════════════════════════════════════════════════════════════
// المنهجية: الرحلة والقياس والمستويات والمسارات (منطق بلا واجهة)
// ════════════════════════════════════════════════════════════════
// الثوابت وحقول النماذج وحاسبة التسكين وإعادة الترتيب، مفصولة عن الشاشات
// لتُختبر وحدها. الاحتساب الرسمي للتسكين على الخادم؛ هنا نسخة العرض.
import { DIM, DIMS, LVL } from './leaders.js';
import { CONTENT_LOCK, REPO_EDIT_AR } from '../../supabase/functions/leaders-api/content-lock.js';
import { countAr, MODE_AR, PHASE_AR, SESSION_MODE_AR, STAGE_COMPLETE_AR, STAGE_MODE_AR, STAGE_UNLOCK_AR, TIER_AR, VERIFY_AR } from '../../supabase/functions/leaders-api/labels.js';
import { evaluatePlacement, CODE_FEATURES, DEFAULT_MODEL, hideBreaksMessage, hideBreaksStage, newlyBroken, renderJourneyText, stageRules, withCandidates, SESSIONS_MAX_LIMIT, LEVEL_MODE_AR, PROJECT_MODE_AR, SUPERVISION_AR, trackKey as trackKeyOf, trackLevels as trackLevelsOf, VERIFIED_KINDS, LAB_ACCEPT_AR } from '../../supabase/functions/leaders-api/logic.js';
import { READY_MIN } from '../../supabase/functions/leaders-api/capstone.js';
import { CONSULT_ANY_DEFAULT, GATE_STAGE_KEYS, SERVICE_NOTE_AR, SERVICE_UNLOCK_DEFAULT, TRACK_UNTIL_DEFAULT, untilOptions } from '../../supabase/functions/leaders-api/journey.js';

export const LVLS = Object.keys(LVL);
export const TIER = { ...TIER_AR, transfer: 'انتقال التعلم (بعدي، بلا درجة)' };
export const PHASE = PHASE_AR;
export const KIND = {
  check: 'تأكيد إنجاز', upload: 'رفع ملف', form: 'نموذج', meeting: 'جلسة يسجلها المستشار', auto: 'تلقائي',
  reading: 'قراءة أبواب الكتاب', video: 'مشاهدة فيديو', workshop: 'جلسات جماعية بمواعيد', coaching: 'جلسات فردية بحجز', curriculum: 'منهج المسار',
  model: 'نموذج تعليمي', capstone: 'مشروع التخرج', survey: 'استبانة', lab: 'أداة من المختبر',
};
// ما يعنيه كل نوع، يظهر تحت اختيار النوع
export const KIND_HELP = {
  check: 'يضغط المشارك «أنجزته»، ويمكن أن يعتمده المستشار. فضّل نوعًا يكتمل من مكانه (نموذج، استبانة، قراءة) متى أمكن.',
  upload: 'يرفع المشارك ملفًا، ويمكن أن يراجعه المستشار.',
  form: 'نموذج يملؤه المشارك.',
  meeting: 'يسجله المستشار يدويًا.',
  auto: 'يحسمه النظام من حالة المشارك.',
  reading: 'يُقاس وقت القراءة الفعلي لكل باب، فيُميَّز القارئ من المتصفح، مع اختبار الباب إن شئت.',
  video: 'يُحتسب ما شوهد فعلًا من يوتيوب أو ملف mp4، والتقديم السريع لا يُحتسب.',
  workshop: 'ورشة أو محاضرة أو لقاء جماعي. تضيف مواعيده من «الحضور والجلسات»، ولكل موعد طريقته: حضوري بمكان، أو عن بعد برابط اجتماع. الموعد والرابط يمكن أن يُحددا لاحقًا، فيرى المشارك «يُحدد لاحقًا» حتى تضيفهما.',
  curriculum: 'مقاطع وملفات وروابط من «بنك المحتوى» يختار النظام منها ما يخص مسار كل مشارك بحسب وسومها. يكتمل بمشاهدة المقاطع وفتح الملفات فعلًا.',
  coaching: 'توجيه أو استشارة فردية. يحجز المشارك من رابط Cal.com أو Calendly، أو يتصل فورًا حين تكون متاحًا، وتؤكد أنت حضوره.',
  model: 'نموذج من «كتاب القائد» يبنيه المشارك في المنصة، فيكتمل المتطلب بتسليمه أو بتقييمك له. لا رفع ملفات: النموذج نفسه هو المخرج وفصل في وثيقة مبادرته.',
  capstone: 'وثيقة المبادرة: يكتمل حين تعتمدها بالمعيار (ويؤيدها راعيها إن سُمّي)، أو حين يحفظ المشارك فصولًا تختارها منها، كخطة التطبيق. تراجعها من «مشاريع التخرج».',
  survey: 'أسئلة تكتبها أنت، يكتمل المتطلب بإرسال المشارك إجاباته لا بنقرة. إن أخفيته من دفعة اختفى من رحلات أعضائها وبقيت الإجابات.',
  lab: 'أداة من «مختبر القائد» تُصحَّح آليًا. يكتمل من محاولات المشارك فيها، ويفتحها المتطلب لمن يخصه بلا منح. إن أوقفت الأداة حُسب المتطلب منجزًا، فلا يُطالب أحد بما لا يراه.',
};
export const VERIFY = VERIFY_AR;
export const COACH_MODE = SESSION_MODE_AR;
// أنواع يحسم النظام إكمالها بدليل، لا بنقرة المشارك: القائمة نفسها التي يحتسب بها الخادم
export const VERIFIED = new Set(VERIFIED_KINDS);
const ACCEPT = { reviewed: 'حين يقيّمه المستشار', submitted: 'بمجرد تسليمه' };
const READ_SCOPE = { all: 'كل أبواب مسار المشارك', first: 'الباب الأول من كل إطار', dimension: 'أبواب إطار واحد' };
export const MODE = MODE_AR;
export const ROMAN = { beginner: 'I', intermediate: 'II', advanced: 'III' };

// ── حقول النماذج (صيغة Form.jsx) ──
// أرقام الجلسات والمدد لا تُكتب في النص؛ رموز تُملأ من إعداد النشاط فلا يتباعد الوصف عن الواقع
export const TOKEN_HELP = 'للأرقام رموز تُملأ تلقائيًا: {duration} مدة المرحلة، {sessions:الرمز} عدد جلسات النشاط، {minutes:الرمز} مدة جلسته، {days:الرمز} عدد أيامه، {ready_min} عتبة مشروع التخرج، {assessment_minutes} مدة القياس.';
const preview = (reqs, f) => (v) => {
  const out = renderJourneyText(v[f] || '', { reqs, durationDays: v.duration_days, readyMin: READY_MIN });
  return out && out !== v[f] ? `يظهر للمشارك: ${out}` : TOKEN_HELP;
};
// قواعد المرحلة في النموذج: حقول rule_* تُجمع في rules عند الحفظ
// والطبيعة (T1، تصور 2026-11-18 ب5.1): «مرحلة متتابعة» أو «مسار مستمر» يبدأ مع مرحلة قبله وينتهي بـuntil، وتُشترط بنوده
// الإلزامية قبل due_before وحدها. الخادم يفحص بـcleanStageRules ويرد السبب بالعربية
export function stageToForm(s) {
  const r = stageRules(s);
  const track = r.lane === 'track';
  const service = r.lane === 'service';
  // المسار يبدأ مع مرجعه دائمًا (حقله rule_with_track)، فحقل «متى تُفتح» المخفي له يبدأ «بعد السابقة»: إن عاد المدير بها
  // مرحلة متتابعة وصلت قاعدة صالحة، لا «تبدأ مع» بلا مرجع يرفضها الخادم (مرجع المسار قد يكون من طور آخر فلا يصلح لها)
  return { ...s, rule_mode: r.mode, rule_unlock: track ? 'previous' : r.unlock, rule_after: r.after, rule_with: track ? '' : r.with ?? '', rule_offset: r.offset || '', rule_day: r.day ?? '', rule_complete: r.complete,
    rule_lane: track ? 'track' : service ? 'service' : 'stage', rule_with_track: track ? r.with ?? '' : '', rule_until: track ? r.until : TRACK_UNTIL_DEFAULT,
    rule_due_before: track ? (s.rules?.due_before ?? '') : '', rule_any: anyToForm(r.unlock === 'any' ? r.any : CONSULT_ANY_DEFAULT) };
}
// شروط «أي من» في النموذج مفاتيح مسطحة: reading_started، وstage:<المرحلة>
const anyToForm = (any) => (any || []).map((c) => (c.type === 'stage_done' ? `stage:${c.stage}` : c.type));
const anyFromForm = (list) => (list || []).map((k) => (k.startsWith('stage:') ? { type: 'stage_done', stage: k.slice(6) } : { type: k }));
export function formToStage(v) {
  const { rule_mode, rule_unlock, rule_after, rule_with, rule_offset, rule_day, rule_complete, rule_lane, rule_with_track, rule_until, rule_due_before, rule_any, ...rest } = v;
  if (rule_lane === 'track') {
    // المسار يبدأ مع مرجعه دائمًا، والإزاحة بلا سقف بمدة المرجع، والنهاية وما يشترطه من حقليهما
    const rules = { mode: rule_mode, unlock: 'with', with: rule_with_track || null, complete: rule_complete, lane: 'track', until: rule_until || TRACK_UNTIL_DEFAULT };
    if (rule_offset !== '' && rule_offset != null && Number(rule_offset) !== 0) rules.offset = rule_offset;
    if (rule_due_before) rules.due_before = rule_due_before;
    return { ...rest, rules };
  }
  // الخدمة (T2، ب5.2): «عند الحاجة» دائمًا، وإتاحتها بشرط فتح. و«بعد ما قبلها» لها تعني الموصى به: من بعد اعتماد المستوى
  if (rule_lane === 'service') {
    const unlock = !rule_unlock || rule_unlock === 'previous' ? SERVICE_UNLOCK_DEFAULT.unlock : rule_unlock;
    const rules = { mode: rule_mode === 'optional' ? 'optional' : 'on_demand', unlock, complete: rule_complete, lane: 'service' };
    if (unlock === 'stages') rules.after = rule_unlock === 'stages' && rule_after?.length ? rule_after : [...SERVICE_UNLOCK_DEFAULT.after];
    if (unlock === 'day') rules.day = rule_day;
    if (unlock === 'any') rules.any = rule_any?.length ? anyFromForm(rule_any) : CONSULT_ANY_DEFAULT.map((c) => ({ ...c }));
    return { ...rest, rules };
  }
  const rules = { mode: rule_mode, unlock: rule_unlock, complete: rule_complete };
  if (rule_unlock === 'stages') rules.after = rule_after || [];
  if (rule_unlock === 'with') {
    rules.with = rule_with || null;
    // الإزاحة (R3a): تخطيط للتواريخ وحدها، وصفر أو فراغ هو الافتراضي فلا يُرسل
    if (rule_offset !== '' && rule_offset != null && Number(rule_offset) !== 0) rules.offset = rule_offset;
  }
  if (rule_unlock === 'day') rules.day = rule_day;
  return { ...rest, rules };
}
const RULE_HELP = {
  required: 'يمر بها كل مشارك، وما بعدها ينتظرها.',
  on_demand: 'تظهر للمشارك متاحة، يدخلها حين يحتاجها (مثل التوجيه على رأس العمل أو الاستشارة)، ولا توقف ما بعدها.',
  optional: 'مقترحة للمشارك، ولا تُنقص تقدمه إن تركها.',
};
// «تبدأ مع»: المرجع مرحلة ظاهرة قبل هذه من محورها، لا يفصلها عنها إلا من يسير معها (withCandidates، والخادم يفحص بالدالة نفسها)
export function withOptions(stages = [], selfKey = null) {
  return Object.fromEntries(withCandidates(stages, selfKey).map((s) => [s.key, s.title_ar]));
}
// مراجع المسار المستمر: كل مرحلة متتابعة ظاهرة قبله من أي طور (withCandidates بالمرحلة نفسها مسارًا)
export function trackWithOptions(stages = [], selfKey = null) {
  const as = stages.map((x) => (x.key === selfKey ? { ...x, rules: { ...(x.rules || {}), lane: 'track', unlock: 'with' } } : x));
  return Object.fromEntries(withCandidates(as, selfKey).map((s) => [s.key, s.title_ar]));
}
export const LANE_FORM_AR = Object.freeze({ stage: 'مرحلة متتابعة', track: 'مسار مستمر يسير بجانب المراحل', service: 'خدمة لمن يريد' });
const LANE_HELP = {
  stage: 'تأخذ أيامها من الرحلة بترتيبها، وما بعدها يبدأ بعدها.',
  track: 'يبدأ مع مرحلة قبله ويمتد بجانب المراحل (التوجيه على رأس العمل مثلًا)، فلا يؤخر ما بعده ولا يقفله، ولا يُعد في «المرحلة X من Y» ولا في نسبة التقدم. بنوده الإلزامية تُشترط قبل مرحلة واحدة تختارها.',
  service: `يحجزها من يريد حتى نهاية الرحلة (الاستشارة مثلًا)، بعدد جلسات تحدده في نشاطها. ${SERVICE_NOTE_AR}. تُتاح افتراضيًا بعد اعتماد المستوى.`,
};
// الخدمة لا يُشترط اكتمالها لفتح غيرها، ولا يبدأ معها شيء ولا تُشترط قبلها بنود مسار
const notService = (s) => stageRules(s).lane !== 'service';
export const stageFields = (reqs = [], stages = [], selfKey = null) => [
  { name: 'rule_lane', label: 'طبيعتها في الرحلة', type: 'select', options: LANE_FORM_AR, help: (v) => LANE_HELP[v.rule_lane || 'stage'],
    show: () => !GATE_STAGE_KEYS.includes(selfKey) },
  { name: 'rule_mode', label: 'نوع المرحلة', type: 'select', options: STAGE_MODE_AR, help: (v) => RULE_HELP[v.rule_mode], show: (v) => v.rule_lane !== 'service' },
  { name: 'rule_with_track', label: 'يبدأ مع', type: 'select', show: (v) => v.rule_lane === 'track', empty: 'اختر المرحلة',
    options: trackWithOptions(stages, selfKey),
    help: 'يُفتح مع بداية المرحلة المختارة، من أي محور، ويبدأ في الخط بعد الأيام المكتوبة أدناه.' },
  { name: 'rule_until', label: 'يمتد حتى', type: 'select', show: (v) => v.rule_lane === 'track', options: untilOptions(stages, selfKey),
    help: 'نهاية الرحلة هي نهاية الدفعة في ملفها، وإن لم يكن لها تاريخ فنهاية المراحل المتتابعة. المسار لا يطيل الرحلة، وتعدّل كل دفعة نهايته من تبويب «الرحلة».' },
  { name: 'rule_due_before', label: 'بنوده الإلزامية مطلوبة قبل', type: 'select', show: (v) => v.rule_lane === 'track', empty: 'التقرير النهائي (الافتراضي)',
    options: Object.fromEntries(stages.filter((s) => s.key !== selfKey && s.active !== false && stageRules(s).lane !== 'track' && notService(s) && !GATE_STAGE_KEYS.includes(s.key)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((s) => [s.key, s.title_ar])),
    help: 'هذه المرحلة وحدها تنتظر اكتمال بنود المسار الإلزامية، وما سواها (الدعم والتقييم مثلًا) لا ينتظره.' },
  { name: 'rule_unlock', label: (v) => (v.rule_lane === 'service' ? 'متى تُتاح' : 'متى تُفتح'), type: 'select', show: (v) => v.rule_lane !== 'track',
    // «أي من» للخدمة وحدها، فلا تُعرض لمرحلة متتابعة (والخادم يرفضها)
    options: (v) => (v.rule_lane === 'service' ? STAGE_UNLOCK_AR : Object.fromEntries(Object.entries(STAGE_UNLOCK_AR).filter(([k]) => k !== 'any'))),
    help: (v) => (v.rule_lane === 'service' ? 'للاستشارة: «حين يتحقق أي شرط» ببدء القراءة أو إنهاء التدريب (يكفي أحدهما). والفتح لا رجعة فيه، ويبقى للفريق فتحها لمشارك استثناءً من ملفه.' : null) },
  { name: 'rule_any', label: 'تُتاح حين (يكفي أحدها)', type: 'multi', show: (v) => v.rule_lane === 'service' && v.rule_unlock === 'any',
    options: { reading_started: 'بدأ قراءة أول كتاب (دقيقة فعلية أو 200 كلمة)',
      ...Object.fromEntries(stages.filter((s) => s.key !== selfKey && s.active !== false && notService(s) && stageRules(s).lane !== 'track').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((s) => [`stage:${s.key}`, `أنهى «${s.title_ar}»`])) } },
  { name: 'rule_after', label: 'تُفتح بعد اكتمال', type: 'multi', show: (v) => v.rule_lane !== 'track' && v.rule_unlock === 'stages',
    options: Object.fromEntries(stages.filter((s) => s.key !== selfKey && s.active !== false && notService(s)).map((s) => [s.key, s.title_ar])) },
  { name: 'rule_with', label: 'تبدأ مع', type: 'select', show: (v) => v.rule_lane !== 'track' && v.rule_unlock === 'with', empty: 'اختر المرحلة',
    options: withOptions(stages, selfKey),
    help: 'تُفتح مع بداية المرحلة المختارة وتسير معها في الأسابيع نفسها، والمرحلة التي بعد المجموعة تنتظر اكتمالها كلها. القائمة تعرض المراحل الظاهرة قبل هذه في محورها نفسه، بشرط ألا تفصل بينهما مرحلة لا تسير معهما.' },
  { name: 'rule_offset', label: 'مخطط بعد كم يومًا من بدايتها', type: 'number', show: (v) => v.rule_lane === 'track' || v.rule_unlock === 'with',
    help: 'تخطيط للتواريخ وحدها: تُفتح مع بداية المرحلة المختارة كما هي، وتُرسم في الخط وتُحسب مواعيدها بعد هذا العدد من الأيام. من 0 إلى مدة المرحلة المختارة، وفراغ يعني من بدايتها.' },
  { name: 'rule_day', label: 'بعد كم يومًا من بداية الدفعة', type: 'number', show: (v) => v.rule_lane !== 'track' && v.rule_unlock === 'day',
    help: 'يُحسب من تاريخ بداية دفعة المشارك. إن لم يكن للدفعة تاريخ بداية تُفتح بعد ما قبلها.' },
  { name: 'rule_complete', label: 'متى تكتمل', type: 'select', options: STAGE_COMPLETE_AR },
  { name: 'title_ar', label: 'اسم المرحلة' },
  { name: 'phase', label: 'المحور', type: 'select', options: PHASE },
  { name: 'duration_label', label: 'المدة كما تظهر للمشارك', help: preview(reqs, 'duration_label') },
  { name: 'duration_days', label: 'المدة بالأيام (مصدر {duration})', type: 'number' },
  { name: 'mode', label: 'طريقة التنفيذ', type: 'select', options: MODE, empty: 'غير محددة' },
  { name: 'mode_note_ar', label: 'تفصيل الطريقة (مثال: حضوري في الرياض أو مباشر عن بعد)' },
  { name: 'description_ar', label: 'الوصف', type: 'textarea', rows: 3 },
  { name: 'builds_on_ar', label: 'تنطلق من (مخرج المرحلة السابقة)' },
  { name: 'activities_ar', label: 'ماذا يتم (كل سطر بند)', type: 'textarea', rows: 5, help: preview(reqs, 'activities_ar') },
  { name: 'outcome_ar', label: 'ما يخرج به المشارك', type: 'textarea', rows: 3 },
  { name: 'active', label: 'ظاهرة للمشاركين', type: 'check' },
];

export const reqFields = (stages, models = [], labs = []) => [
  { name: 'code', label: 'الرمز (فريد، مثل T-ATTEND)', dir: 'ltr' },
  { name: 'title_ar', label: 'نص المتطلب' },
  { name: 'help_ar', label: 'توضيح للمشارك', type: 'textarea', rows: 2, help: TOKEN_HELP },
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
  // حد الحجز (T2): للخدمة خاصة. يُخفى زر الحجز عند بلوغه، والحجز الزائد من منصة الحجز يُنبَّه عليه ولا يُرفض
  { name: 'cfg_max_sessions', label: 'حد الجلسات للمشارك', type: 'number', show: (v) => v.kind === 'coaching',
    help: () => `فارغ: بلا حد غير المطلوب حضوره. من 1 إلى ${SESSIONS_MAX_LIMIT}، ولا يقل عن المطلوب حضوره. يُخفى زر الحجز عند بلوغه، وما يصل زائدًا من منصة الحجز يُنبَّه عليه.` },
  { name: 'cfg_verify', label: 'توثيق الحضور', type: 'select', options: VERIFY, show: (v) => v.kind === 'workshop' },
  { name: 'cfg_mode', label: 'طريقة الجلسة', type: 'select', options: COACH_MODE, show: (v) => v.kind === 'coaching' },
  { name: 'cfg_location_ar', label: 'المكان للجلسات الحضورية', show: (v) => v.kind === 'coaching' && v.cfg_mode !== 'online' },
  { name: 'cfg_minutes', label: 'مدة الجلسة بالدقائق (منها تُحسب ساعات الشهادة)', type: 'number', show: (v) => v.kind === 'coaching' || v.kind === 'workshop' || v.kind === 'meeting' },
  { name: 'cfg_booking_url', label: 'رابط الحجز (Cal.com أو Calendly)', dir: 'ltr', show: (v) => v.kind === 'coaching' },
  { name: 'cfg_instant_url', label: 'رابط غرفة الاتصال الفوري (Google Meet أو Zoom الثابت)', dir: 'ltr', show: (v) => v.kind === 'coaching' && v.cfg_mode !== 'in_person' },
  { name: 'cfg_coach_email', label: 'بريد الموجّه لتنبيه الاتصال الفوري', type: 'email', dir: 'ltr', show: (v) => v.kind === 'coaching' },
  { name: 'cfg_model_key', label: 'النموذج التعليمي', type: 'select', options: Object.fromEntries(models.map((m) => [m.key, m.title_ar])), show: (v) => v.kind === 'model',
    help: () => 'يراه المشارك بمستواه ونطاق عمله. إن لم يكن النموذج متاحًا له حُسب المتطلب منجزًا، فلا يُطالب بما لا يخصه.' },
  { name: 'cfg_accept', label: 'يكتمل', type: 'select', options: ACCEPT, show: (v) => v.kind === 'model' },
  { name: 'cfg_lab_key', label: 'أداة المختبر', type: 'select', options: Object.fromEntries(labs.map((l) => [l.key, `${l.title_ar}${l.active === false ? ' (موقوفة)' : ''}`])), show: (v) => v.kind === 'lab',
    help: () => 'يراها المشارك في المختبر وفي بطاقة المتطلب بزر «افتح في المختبر». والسقالة فيها بحسب مستواه في إطارها.' },
  { name: 'cfg_lab_accept', label: 'يكتمل', type: 'select', options: LAB_ACCEPT_AR, show: (v) => v.kind === 'lab' },
  { name: 'cfg_sections', label: 'فصول من وثيقة المبادرة (اتركها فارغة ليكتمل باعتماد الوثيقة كلها)', type: 'multi', options: Object.fromEntries(models.map((m) => [m.key, m.title_ar])), show: (v) => v.kind === 'capstone',
    help: () => 'يكتمل حين يحفظ المشارك الفصول المختارة، فتصير خطة التطبيق جزءًا من وثيقته لا ملفًا مرفوعًا.' },
  { name: 'cfg_questions', label: 'أسئلة الاستبانة (سطر لكل سؤال)', type: 'textarea', rows: 6, show: (v) => v.kind === 'survey',
    help: () => 'كل سطر تقدير من 1 إلى 5. ابدأ السطر بـ «(نص)» لسؤال مفتوح إلزامي، أو «(نص اختياري)» لسؤال مفتوح غير إلزامي.' },
  { name: 'required', label: 'إلزامي لإكمال المرحلة', type: 'check' },
  { name: 'needs_review', label: 'يعتمده المستشار بعد الإنجاز', type: 'check', show: (v) => !VERIFIED.has(v.kind) },
  { name: 'active', label: 'مفعّل', type: 'check' },
];

// المتطلب ← قيم النموذج: حقول config تُفرد بأسماء cfg_*
const CFG_DEFAULTS = { accept: 'reviewed', scope: 'all', quiz: true, min_pct: 90, sessions_required: 1, minutes: 60, verify: 'qr', mode: 'online' };
export function reqToForm(r) {
  const c = { ...CFG_DEFAULTS, ...(r.config || {}) };
  // قبول أداة المختبر حقل مستقل عن «يكتمل» في النموذج التعليمي، لأن خياراته غيرها
  const lab = { cfg_lab_accept: r.kind === 'lab' && r.config?.accept in LAB_ACCEPT_AR ? r.config.accept : 'mastery' };
  return { ...r, ...Object.fromEntries(Object.entries(c).map(([k, x]) => [`cfg_${k}`, x])), ...lab };
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
// D01: نص الفقرة وخياراتها ودرجاتها محتوى مُقاس يُعدَّل من المستودع؛ اللوحة تحرر التلميح وحده (والترتيب بالأسهم)
export const Q_SAFE = Q_FIELDS.filter((f) => CONTENT_LOCK.questions.editable.includes(f.name));
export const QUESTIONS_LOCK_AR = `${REPO_EDIT_AR}. تحرر اللوحة التلميح والترتيب، والإصدار والتفعيل بترحيل محروس بعد توقيع لجنة القياس.`;
// رمز المتطلب ثابت بعد إنشائه (D01): الرحلة والتقارير تقرأ التقدم به
export const lockReqCode = (fields) => fields.map((f) => (f.name === 'code' ? { ...f, readOnly: true, label: 'الرمز (ثابت بعد الإنشاء)' } : f));

export const INST_FIELDS = [
  { name: 'title_ar', label: 'العنوان' },
  { name: 'intro_ar', label: 'المقدمة للمشارك', type: 'textarea', rows: 4 },
  { name: 'est_minutes', label: 'المدة التقديرية بالدقائق', type: 'number' },
];

export const CELL_FIELDS = [
  { name: 'path_title_ar', label: 'عنوان المسار' },
  { name: 'description_ar', label: 'وصف المستوى (مرجع الفريق، لا يظهر للمشارك)', type: 'textarea', rows: 5 },
];

export const TRACK_FIELDS = [
  { name: 'title_ar', label: 'اسم المسار' },
  { name: 'summary_ar', label: 'لمن صُمّم المسار', type: 'textarea', rows: 3 },
  { name: 'focus_ar', label: 'أولويات التطوير (كل سطر بند)', type: 'textarea', rows: 4 },
  { name: 'journey_ar', label: 'كيف تتوجه الرحلة: التدريب والتوجيه ومجتمع الممارسة (كل سطر بند)', type: 'textarea', rows: 4 },
  { name: 'priority_dimension', label: 'محور التركيز الأول', type: 'select', options: DIM },
];

// ── المسارات ──
// M2I1L3 ← { milestone: intermediate, impact: beginner, leadership: advanced }
export const trackLevels = (key) => trackLevelsOf(key) || {};
export const trackKey = (m, i, l) => trackKeyOf({ milestone: m, impact: i, leadership: l });
export const shortTitle = (t) => String(t || '').replace(/^مسار\s+/, '');
export const lines = (x) => String(x || '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);

// ── معيار التسكين المركّب ──
// المعيار والحساب من الخادم نفسه (logic.js)، فما يراه المستشار في المعاينة هو ما يُحسب للمشارك
export const MODEL_DEFAULT = DEFAULT_MODEL;
export function evaluate(p, m) {
  const pcts = Object.fromEntries(['knowledge', 'skill', 'behavior'].filter((t) => p[t] != null && p[t] !== '').map((t) => [t, +p[t]]));
  const r = evaluatePlacement(pcts, m);
  if (r.composite == null) return null;
  // أضعف جانب مُقيَّد بأرضية: المعرفة أو المواقف (الممارسة ليست بوابة)
  const gated = ['knowledge', 'skill'].filter((t) => pcts[t] != null).map((t) => pcts[t]);
  return { ...r, low: gated.length ? Math.min(...gated) : null };
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
// أسماء حالات الدفعة و«جارية» من مصدر واحد (cohort-running.js، P10)
export { COHORT_STATUS, cohortStateAr } from '../../supabase/functions/leaders-api/cohort-running.js';
import { COHORT_STATUS } from '../../supabase/functions/leaders-api/cohort-running.js';
const INHERIT = 'كما في البرنامج';

// حقول نموذج الدفعة: الأساسيات، ثم طريقة تنفيذ كل نشاط جماعي أو فردي في البرنامج
// المستشار الأساسي وفريق الخبراء ليسا هنا: يُحرَّران من «الفريق والمجموعات» وحده (CohortTeam.jsx)، مصدر واحد للتحرير
// اسم البند كما يقرؤه المدير: رموزه محوَّلة (renderJourneyText بإعدادات متطلبات البرنامج كلها) ثم مرحلته بين قوسين،
// فيتميز عنوانان متطابقان، ولا يظهر الرمز الداخلي
export function reqLabel(r, reqs = []) {
  const t = renderJourneyText(r.title_ar || r.code, { reqs });
  const st = r.stage_title_ar ? renderJourneyText(r.stage_title_ar, { reqs }) : '';
  return st ? `${t} (${st})` : t;
}
// مراحل البرنامج من متطلباته (admin.program يرفق بكل متطلب مرحلته وقاعدتها)، لفحص الإخفاء قبل الحفظ
const stagesOfReqs = (reqs) => [...new Map(reqs.filter((r) => r.stage_key).map((r) => [r.stage_key, { key: r.stage_key, title_ar: r.stage_title_ar || r.stage_key, rules: r.stage_rules || {}, active: r.stage_active !== false }])).values()];
const HIDE_HELP = 'يختفي البند فورًا من رحلات أعضاء الدفعة وتقدّمهم، ويبقى ما أنجزوه منه محفوظًا ويعود إن أظهرته.';
// defVersion: النسخة التي قُرئت منها البنود (admin.cohort-definition). ما دامت هي نسخة الدفعة فالحكم قاطع، وإن غيّرها
// المدير في النموذج قبل الحفظ فالبنود من غيرها، فيُشار ولا يُقطع، والخادم يفحص عند الحفظ
export function hiddenHelp(v, reqs = [], defVersion) {
  const hidden = Array.isArray(v?.hidden_requirements) ? v.hidden_requirements : [];
  // ما كان مكسورًا قبل فتح النموذج لا يمنع الحفظ، كما في cohortSave
  const stages = stagesOfReqs(reqs);
  const broken = newlyBroken(hideBreaksStage(stages, reqs, hidden), hideBreaksStage(stages, reqs, v?.hidden_before || []));
  const notes = hidden.filter((c) => CODE_FEATURES[c]).map((c) => {
    const r = reqs.find((x) => x.code === c);
    return `تنبيه: «${r ? reqLabel(r, reqs) : c}» ${CODE_FEATURES[c]}.`;
  });
  const exact = defVersion !== undefined && (v?.program_version_id || '') === (defVersion || '');
  const verdict = !exact && v?.program_version_id
    ? `يُفحص الإخفاء عند الحفظ على النسخة المثبتة.${broken.length ? ` وحسب آخر تعديل على البرنامج: ${hideBreaksMessage(broken)}` : ''}`
    : broken.length ? `لن يُحفظ: ${hideBreaksMessage(broken)}` : '';
  return [HIDE_HELP, verdict, ...notes].filter(Boolean).join(' ');
}

// سطر عقد الجهة في نموذج دفعتها: المقاعد معلومة الجهة كلها من عقدها (seats_used من entitlements.ts)، لا من الدفعة.
// ومعه الدفعة التي يدخلها أعضاء الجهة الجدد الآن تلقائيًا (pickCohort)، فلا يُفهم أن الدفعات تتقاسم المقاعد
// وحال العقد كما يفحصها pin_sponsor_seat: الجهة غير النشطة، والعقد قبل بدئه أو بعد نهايته، لا يُعفى فيها أحد
const isoDay = (d) => String(d).slice(0, 10);
const ltr = (d) => `\u2066${isoDay(d)}\u2069`; // التاريخ معزول باتجاه لاتيني فلا تنقلب أجزاؤه داخل السطر العربي
export function contractLine(org, today = new Date().toISOString().slice(0, 10)) {
  if (!org) return '';
  const used = org.seats_used == null ? '' : `، المستهلك ${org.seats_used} من العقد كله`;
  const seats = org.seats == null ? 'بلا حد في العقد' : `${org.seats} مقعدًا`;
  const ended = org.contract_ends && isoDay(org.contract_ends) < today;
  const ends = org.contract_ends && !ended ? `، ينتهي ${ltr(org.contract_ends)}` : '';
  const state = org.status && org.status !== 'active' ? ' الجهة غير نشطة، فلا يُعفى أحد.'
    : org.contract_starts && isoDay(org.contract_starts) > today ? ` العقد لم يبدأ بعد (يبدأ ${ltr(org.contract_starts)})، فلا يُعفى أحد قبله.`
      : ended ? ` انتهى العقد في ${ltr(org.contract_ends)}، فلا يُعفى أعضاء جدد.` : '';
  const auto = org.auto_cohort?.via === 'organization' ? ` أعضاء الجهة الجدد يدخلون الآن تلقائيًا دفعة «${org.auto_cohort.name}».`
    : org.auto_cohort ? ' لا دفعة مفتوحة أو جارية للجهة الآن، فيدخل أعضاؤها الجدد الدفعة المفتوحة العامة.' : '';
  return `عقد الجهة: ${seats}${used}${ends}.${state}${auto}`;
}
// السعة التشغيلية تنبيهية، والعقد هو الحد الملزم: تجاوزه يُحذَّر منه ولا يُعدَّل آليًا
export function capacityWarning(org, capacity) {
  const n = Number(capacity);
  if (!org || org.seats == null || capacity === '' || capacity == null || !(n > org.seats)) return '';
  return `تنبيه: السعة ${n} تتجاوز مقاعد عقد الجهة (${org.seats}). العقد هو الحد الملزم على الجهة كلها، فلن يُعفى أكثر منه.`;
}

// أقسام محرر الدفعة (CohortEditor.jsx): الأساسيات ظاهرة، والرحلة، ثم التنفيذ والمتقدم مطويان. لكل حقل قسم واحد
export const COHORT_SECTIONS = [
  { key: 'basics', title: 'الأساسيات' },
  { key: 'journey', title: 'الرحلة' },
  { key: 'delivery', title: 'التنفيذ' },
  { key: 'advanced', title: 'متقدم' },
];

export const VERSION_ON_SAVE = 'أحدث نسخة عند الحفظ (تُنشأ النسخة 1 إن لم توجد)';
// الخيار الفارغ لدفعة قائمة غير مثبتة على برنامجها: الحفظ يتركها كما هي، والتثبيت على نسخة قائمة بالترقية من ملفها
export const UNPINNED_UPGRADE = 'غير مثبتة (تُثبَّت من ملف الدفعة بعد مراجعة الفرق)';
export const UNPINNED_EMPTY = 'غير مثبتة حتى تُبنى رحلة البرنامج';
// دفعة جديدة (أو برنامج آخر) على برنامج بلا متطلبات: لا نسخة تُثبَّت عليها، ويرفض الخادم الحفظ
export const NEW_EMPTY = 'لا نسخة: البرنامج بلا متطلبات بعد';

// حقول الدفعة: المصدر الواحد لتعريف كل حقل، يقرؤه المحرر (CohortEditor.jsx) والمعالج (CohortWizard.jsx) معًا.
// section: قسمه في المحرر. req: رمز المتطلب لحقول التنفيذ، فتُجمع بالنشاط. isNew: دفعة تُنشأ الآن فلا تُعرض «مغلقة».
// versionEmpty: خيار «أحدث نسخة عند الحفظ» للنسخة، لما ليس له نسخة مثبتة في النموذج بعد (دفعة جديدة، أو برنامج
// آخر). نص بدل true يسمّي ما يعنيه الفارغ (UNPINNED_UPGRADE وأخواتها). الدفعة المثبتة لا خيار فارغ لها: لا يُلغى
// تثبيتها، ونسختها تتغير بالترقية وحدها
export function cohortFields({ orgs = [], programs = [], versions = [], reqs = [], isDefault = false, defVersion, isNew = false, versionEmpty = false }) {
  const orgOf = (v) => orgs.find((o) => o.id === v.organization_id);
  const verN = Object.fromEntries(versions.map((x) => [x.id, `مثبتة على النسخة ${x.number}: ${x.label}`]));
  const status = isDefault ? { open: COHORT_STATUS.open, running: COHORT_STATUS.running }
    : isNew ? { planned: COHORT_STATUS.planned, open: COHORT_STATUS.open, running: COHORT_STATUS.running } : COHORT_STATUS;
  const base = [
    { name: 'name', label: 'اسم الدفعة', section: 'basics' },
    ...(isDefault ? [] : [{ name: 'organization_id', label: 'الجهة', type: 'select', empty: 'بلا جهة (أفراد)', options: Object.fromEntries(orgs.map((o) => [o.id, o.name])),
      help: (v) => contractLine(orgOf(v)), section: 'basics' }]),
    // البرنامج المؤرشف لا يُعرض خيارًا أبدًا
    { name: 'program_id', label: 'البرنامج', type: 'select', options: Object.fromEntries(programs.filter((p) => !p.archived_at).map((p) => [p.id, p.name])), section: 'basics' },
    { name: 'starts_on', label: 'تبدأ', type: 'date', section: 'basics' },
    { name: 'ends_on', label: 'تنتهي', type: 'date', section: 'basics' },
    { name: 'status', label: 'الحالة', type: 'select', options: status, section: 'basics' },
    // دفعة الأفراد والمفتوحة: المقاعد هي المصدر الوحيد للسعة فتبقى ظاهرة. دفعة الجهة: مقاعدها من العقد في سطر الجهة
    { name: 'capacity', label: 'المقاعد', type: 'number', show: (v) => !v.organization_id, section: 'basics' },
    // المخفي كما حُفظ: حقل لا يُعرض ولا يُرسل (show دائمًا false)، يبقى في حال النموذج لمقارنة الإخفاء به
    { name: 'hidden_before', label: '', type: 'multi', options: {}, show: () => false, section: 'journey' },
    { name: 'hidden_requirements', label: 'بنود مخفية من رحلة هذه الدفعة', type: 'multi',
      options: Object.fromEntries(reqs.filter((r) => r.active !== false).map((r) => [r.code, reqLabel(r, reqs)])),
      help: (v) => hiddenHelp(v, reqs, defVersion), section: 'journey' },
    {
      name: 'program_version_id', label: 'نسخة البرنامج', type: 'select', empty: typeof versionEmpty === 'string' ? versionEmpty : versionEmpty || !versions.length ? VERSION_ON_SAVE : undefined, options: verN,
      help: 'الدفعة تبقى على نسختها حتى ترقيها بنفسك، فلا يصل إليها أي تعديل لاحق على البرنامج.', section: 'advanced',
    },
    { name: 'level_mode', label: 'مستويات المشاركين', type: 'select', options: LEVEL_MODE_AR, section: 'advanced',
      help: 'المتجانس يوحّد المحتوى (الرحلة والكتاب والنماذج) للجميع، ويبقى قياس كل مشارك ومساره من نتيجته.' },
    { name: 'content_level', label: 'مستوى المحتوى للدفعة', type: 'select', empty: 'اختر المستوى', options: LVL, show: (v) => v.level_mode === 'uniform', section: 'advanced' },
    { name: 'project_mode', label: 'المشروع', type: 'select', options: PROJECT_MODE_AR, section: 'advanced' },
    { name: 'supervision', label: 'الإشراف في طلبات التوجيه', type: 'select', options: SUPERVISION_AR, section: 'advanced',
      help: 'يرفع المشارك طلب توجيه فيجيب فريقه ويؤكّد المستشار (الافتراضي)، أو يجيب المستشار وحده، أو معًا. الإسهام المؤكَّد يُحسب لصاحبه في التقييم المستمر.' },
    // دفعة الجهة: السعة التشغيلية مطوية خلف اختيار، والحد الملزم مقاعد العقد
    { name: 'capacity_on', label: 'حدد سعة تشغيلية لهذه الدفعة (اختياري)', type: 'check', show: (v) => !!v.organization_id, section: 'advanced' },
    { name: 'capacity', label: 'سعة تشغيلية (اختياري)', type: 'number', show: (v) => !!v.organization_id && !!v.capacity_on, section: 'advanced',
      help: (v) => capacityWarning(orgOf(v), v.capacity) || 'تنبيهية لتنظيم الدفعة. الحد الملزم هو مقاعد عقد الجهة.' },
    { name: 'notes_ar', label: 'ملاحظات', type: 'textarea', rows: 2, section: 'advanced' },
  ];
  const delivery = [];
  for (const r of reqs.filter((x) => x.active !== false)) {
    const t = reqLabel(r, reqs);
    // رأس مجموعة النشاط في المحرر: اسمه ثم مرحلته، بلا قوسين متتاليين
    const d = { section: 'delivery', req: r.code, group: renderJourneyText(r.title_ar || r.code, { reqs }), groupStage: r.stage_title_ar ? renderJourneyText(r.stage_title_ar, { reqs }) : '' };
    if (r.kind === 'workshop') {
      delivery.push(
        { ...d, name: `d:${r.code}:format`, label: `${t}: الصيغة`, type: 'select', empty: 'أيام حضورية أو عن بعد (كما في البرنامج)', options: { handbook: 'تدريب ذاتي بالكتاب: كل باب يوم' },
          help: 'بالكتاب: يكتمل البند بقراءة أبواب الكتاب واجتياز أسئلتها بدل الحضور، وما أُنجز يبقى. أخفِ «قراءة كتابك» من الدفعة إن صار مكررًا.' },
        { ...d, name: `d:${r.code}:verify`, label: `${t}: توثيق الحضور`, type: 'select', empty: `${INHERIT} (${VERIFY[r.config?.verify || 'qr']})`, options: VERIFY, show: (v) => v[`d:${r.code}:format`] !== 'handbook' },
      );
    }
    if (r.kind === 'coaching') {
      delivery.push(
        { ...d, name: `d:${r.code}:mode`, label: `${t}: طريقة الجلسة`, type: 'select', empty: `${INHERIT} (${COACH_MODE[r.config?.mode || 'online']})`, options: COACH_MODE },
        { ...d, name: `d:${r.code}:location_ar`, label: `${t}: المكان`, show: (v) => (v[`d:${r.code}:mode`] || r.config?.mode) !== 'online' },
        { ...d, name: `d:${r.code}:booking_url`, label: `${t}: رابط حجز مدربي هذه الدفعة`, dir: 'ltr', help: 'فارغ: رابط البرنامج' },
        { ...d, name: `d:${r.code}:coach_email`, label: `${t}: بريد الموجّه`, type: 'email', dir: 'ltr' },
      );
    }
  }
  if (delivery.length) delivery[0] = { ...delivery[0], help: 'التنفيذ في هذه الدفعة. ما تبقيه على «كما في البرنامج» يتبع إعداد البرنامج.' };
  return [...base, ...delivery];
}

// تحقق الدفعة، واحد للمعالج والمحرر وبرسائل الخادم نفسها: لكل حقل خطؤه أو لا شيء
/** @param {any} v */
// أعداد الرحلة بتمييز عربي صحيح: «بند واحد»، «بندان»، «5 بنود»، «11 بندًا»
export const itemsAr = (n) => (n ? countAr(n, 'بند واحد', 'بندان', 'بنود', 'بندًا') : 'لا بنود');
export const stagesAr = (n) => (n ? countAr(n, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة') : 'لا مراحل');

export function cohortErrors(v = {}) {
  const e = {};
  if (!String(v.name || '').trim()) e.name = 'اكتب اسم الدفعة';
  if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) e.ends_on = 'تاريخ النهاية قبل البداية';
  if (v.level_mode === 'uniform' && !v.content_level) e.content_level = 'اختر مستوى المحتوى للدفعة المتجانسة';
  return e;
}

// قيم النموذج كما تُرسل: الحقول الظاهرة وحدها (show)، بأنواعها، كما يرسلها Form.jsx
/** @param {any[]} fields @param {any} v */
export function cohortOut(fields, v) {
  const out = {};
  for (const f of fields) {
    if (f.show && !f.show(v)) continue;
    const x = v[f.name];
    out[f.name] = f.type === 'number' ? (x === '' || x == null ? null : Number(x))
      : f.type === 'check' ? !!x : f.type === 'multi' ? (Array.isArray(x) ? x : [])
        : (String(x ?? '').trim() || null);
  }
  return out;
}

// رحلة الدفعة كما يراها المحرر: لكل مرحلة بنودها بأسمائها المقروءة، وما ظهر منها «3 ظاهرة من 4»، ومجموع الدفعة.
// lock: سبب منع إخفاء بند ظاهر لأن إخفاءه يكسر مرحلة لم تكن مكسورة قبل فتح المحرر (hideBreaksStage كالخادم).
// warn: ميزة تعتمد على رمز البند (CODE_FEATURES). الإخفاء لا يحذف شيئًا: البند يبقى في القائمة بعلامته
/** @param {{ stages?: any[], requirements?: any[] }} def @param {string[]} hidden @param {string[]} before */
export function journeyView(def = {}, hidden = [], before = []) {
  const stages = def.stages || [];
  const reqs = (def.requirements || []).filter((r) => r.active !== false);
  const h = new Set(hidden || []);
  const was = hideBreaksStage(stages, reqs, before || []);
  const out = stages.map((st) => {
    const items = reqs.filter((r) => r.stage_key === st.key).map((r) => {
      const shown = !h.has(r.code);
      const broken = shown ? newlyBroken(hideBreaksStage(stages, reqs, [...h, r.code]), was) : [];
      return {
        code: r.code, kind: r.kind, required: r.required !== false, shown,
        title: renderJourneyText(r.title_ar || r.code, { reqs }), label: reqLabel(r, reqs),
        lock: !broken.length ? '' : broken.length === 1 && broken[0].key === st.key ? 'آخر ما يكمل هذه المرحلة'
          : `يكمل مرحلة «${broken.map((s) => s.title_ar || s.key).join('»، «')}»`,
        broken,
        warn: CODE_FEATURES[r.code] ? `«${reqLabel(r, reqs)}» ${CODE_FEATURES[r.code]}.` : '',
      };
    });
    // سبب المنع يُقال مرة للمرحلة لا تحت كل بند: ما يُقفل فيها ولماذا، وكيف يُفك
    const hit = [...new Map(items.flatMap((x) => x.broken).map((b) => [b.key, b])).values()];
    const one = items.filter((x) => x.lock).length === 1;
    const lockNote = hit.length ? `${one ? 'البند المقفل هنا لا يُخفى لأن إخفاءه' : 'البنود المقفلة هنا لا تُخفى لأن إخفاء أي منها'} يترك مرحلة «${hit.map((b) => b.title_ar || b.key).join('»، «')}» بلا بند ظاهر يكملها لبعض الأعضاء أو كلهم، فلا تكتمل لهم وتُقفل ما بعدها. ${one ? 'لإخفائه' : 'لإخفائها'} غيّر قاعدة اكتمالها في رحلة البرنامج أولًا.` : '';
    for (const x of items) delete x.broken;
    return { key: st.key, title: renderJourneyText(st.title_ar || st.key, { reqs }), items, lockNote, shown: items.filter((x) => x.shown).length, total: items.length };
  }).filter((st) => st.total);
  return { stages: out, shown: out.reduce((n, st) => n + st.shown, 0), total: out.reduce((n, st) => n + st.total, 0) };
}

export function cohortToForm(c = {}) {
  const v = { ...c, program_version_id: c.program_version_id || '', organization_id: c.organization_id || '',
    capacity_on: c.capacity != null && c.capacity !== '',
    level_mode: c.level_mode || 'mixed', content_level: c.content_level || '', project_mode: c.project_mode || 'individual', hidden_requirements: c.hidden_requirements || [], supervision: c.supervision || 'peers_expert',
    // المخفي كما حُفظ، للمقارنة وحدها فلا يُرسل
    hidden_before: c.hidden_requirements || [] };
  // الفريق والمستشار لا يُرسَلان من نموذج الدفعة: حفظه كان يستبدل الفريق بنسخة قديمة لو تغيّر من «الفريق والمجموعات» بعد فتحه
  delete v.schedule; delete v.stage_modes; delete v.advisor_expert_id; delete v.team_expert_ids; delete v.team_ready;
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
  // إلغاء اختيار السعة التشغيلية في دفعة الجهة يمحوها، فلا تبقى قيمة مخفية تحذّر بلا سبب
  if ('capacity_on' in out) { if (!out.capacity_on) out.capacity = null; delete out.capacity_on; }
  delete out.hidden_before;
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
