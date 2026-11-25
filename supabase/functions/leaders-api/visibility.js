// ════════════════════════════════════════════════════════════════
// التحكم في الرؤية: ما يراه كل دور وما لا يراه، بمفاتيح يضبطها المالك (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لمفاتيح الرؤية وتسمياتها وافتراضاتها (تصور التحكم الديناميكي، اعتمده المالك 2026-11-13).
// ثلاث طبقات تُحسم هنا في resolveVisibility: الافتراضي العام (مجموعة visibility في app_settings)، ثم استثناء
// الدفعة (cohorts.visibility)، ثم صلاحيات المنسق الفردية كما هي في org_coordinators (logic.js coordPermissions).
// كل افتراض يطابق سلوك ما قبل المفاتيح، فلا يتغير شيء عند النشر حتى يغيّره المالك. ما لا يُفتح بمفتاح:
// موافقة المشارك على مشاركة مستواه مع جهته، وسرية إجابات مقيّمي 360؛ هذه حقوق أصحابها لا إعدادات.
// ولا مفتاح لمستوى المشارك المبدئي ولا لنقاطه ورتبته: يدخلان في بوابات التسجيل والدفع والتحفيز، وحجبهما تصميم لا مفتاح.
const key = (audience, label_ar, hint_ar, def = true) => ({ audience, label_ar, hint_ar, default: def });

export const AUDIENCE_AR = { advisor: 'مستشار الدفعة وخبير المجموعة', assigned: 'الخبير المسند بطلب خدمة', coordinator: 'مسؤول الجهة', participant: 'المشارك' };

export const VISIBILITY = {
  adv_contact: key('advisor', 'وسائل التواصل', 'بريد المشارك وجواله في ملفه عند المستشار.'),
  adv_answers: key('advisor', 'إجابات القياس', 'ورقة الإجابات سؤالًا سؤالًا، وكل فتح يُسجَّل.'),
  adv_effort: key('advisor', 'مؤشر الجهد', 'تنبيه «أجاب باستعجال» قبل اعتماد المستوى.'),
  adv_flags: key('advisor', 'ملخص الأعلام', 'ما يستحق النظر أعلى الملف: تأخر، غياب، نماذج معادة…'),
  adv_observations_read: key('advisor', 'قراءة ملاحظات الملف', 'الملاحظات والتنبيهات والإشادات المسجّلة على المشارك.'),
  adv_observations_write: key('advisor', 'إضافة ملاحظة إلى الملف', 'يكتب ملاحظة داخلية أو مرئية للمشارك.'),
  adv_admin_notes: key('advisor', 'تعليل الإدارة لتعديل المستوى', 'ملاحظة الإدارة حين خالفت مستوى القياس في بُعد.'),
  adv_final_edit: key('advisor', 'تعديل التقييم الختامي والتصويت فيه', 'بدونه يرى الدرجة والقرار ولا يحرر.'),
  adv_hall_control: key('advisor', 'إدارة القاعة الحية', 'فتح الجلسة وتسييرها وتوزيع الطاولات.'),
  asg_contact: key('assigned', 'وسائل التواصل', 'بريد المشارك وجواله عند الخبير المسند.'),
  asg_levels: key('assigned', 'المستويات ونتيجة القياس', 'مستوى المشارك في الأبعاد الثلاثة ومؤشره.'),
  asg_models: key('assigned', 'النماذج وتقييمها واختبارات الكتاب', 'ما سلّمه المشارك من نماذج ودرجاته في الأبواب.'),
  asg_final: key('assigned', 'ملخص التقييم الختامي', 'الدرجة والقرار وحالته.'),
  asg_continuous: key('assigned', 'التقييم المستمر', 'المؤشر المستمر ومكوناته وتعليقات الخبراء.'),
  // المستشار يقرأ تقرير 360 من إغلاق النافذة ليستعد لجلسة التسليم. بحجبه يبقى له التسليم دون القراءة
  adv_f360: key('advisor', 'قراءة تقرير 360 قبل تسليمه', 'تقرير المشارك من مقيّميه، مجمّعًا بلا أسماء. بحجبه يسلّمه المستشار دون أن يقرأه.'),
  // مسؤول الجهة: فوق صلاحياته الفردية في حسابه (القائمة والدرجات والتواصل…)، وهذه تحجب القسم عن كل مسؤولي الجهة في الدفعة
  coord_initiatives: key('coordinator', 'محفظة المبادرات وأثرها', 'المبادرات المعتمدة لمشاركي الجهة ومؤشرات متابعتها.'),
  coord_f360: key('coordinator', 'مجاميع تقييم 360', 'أعداد ونسبة استجابة ومتوسط كل إطار فوق حد الجهة، بلا أي صف فردي.'),
  // المشارك نفسه
  par_advisor: key('participant', 'اسم مستشاره', 'سطر «مستشارك» في رحلته بعد اعتماد مستواه.'),
  par_final_policy: key('participant', 'كيف يُقيَّم', 'أوزان التقييم الختامي وحدوده كما تُطبَّق على برنامجه.'),
  // المبادرات المحلولة (مرافق بناء المبادرة 4ب): تُعرض أو تُحجب عامةً أو لدفعة، وكل قطاع وحده، فيُحجب مثال قطاع
  // حتى يراجعه خبير المحتوى، أو تُحجب الأمثلة عن دفعة متقدمة. يحسمها الخادم في examplesView قبل أن تصل المشارك
  par_examples_field: key('participant', 'المثال المحلول بجانب الحقل', 'مثال من قطاعه تحت دليل كل حقل في فصول وثيقة المبادرة (للتأسيسي والمتوسط).'),
  par_examples_doc: key('participant', 'المبادرات المحلولة كاملة', 'زر «مبادرة محلولة كاملة» في صفحة المبادرة، يفتح الوثيقة الكاملة للمثال.'),
  par_example_gov: key('participant', 'مثال الخدمات الحكومية', '«تجديد الترخيص المهني رقميًا في يوم واحد». بحجبه لا يظهر بجانب الحقل ولا كاملًا.'),
  par_example_health: key('participant', 'مثال الصحة', '«موعد أول أقرب: خفض انتظار العيادات الخارجية». بحجبه لا يظهر بجانب الحقل ولا كاملًا.'),
  par_example_startup: key('participant', 'مثال ريادة الأعمال', '«سفرة متوازنة: اشتراك وجبات لمرضى السكري»، مبادرة ريادية بلا جهة مستضيفة. يُقدَّم لمن اختار سياقًا رياديًا. بحجبه لا يظهر بجانب الحقل ولا كاملًا.'),
  // مشاركة وثيقة المبادرة برابط خاص (share.ts، اعتمده المالك 2026-11-15). بحجب المشاركة تتوقف الروابط القائمة فورًا،
  // وبحجب الملاحظات لا يكتب القراء ولو فتحها المشارك في رابطه
  par_share: key('participant', 'مشاركة وثيقة المبادرة برابط خاص', 'رابط يعطيه المشارك لمن يشاء ليقرأ وثيقته دون حساب، بمدة يختارها ويلغيه متى شاء.'),
  par_share_notes: key('participant', 'ملاحظات من يفتح رابط المشاركة', 'يكتب القارئ ملاحظة لا يراها إلا قائد المبادرة، حين يسمح بها في رابطه.'),
  // نسبة الجاهزية في الوثيقة المشاركة (قرار المالك 2026-11-24، ب + ج): مخفية في كل رابط افتراضيًا، ويُظهرها صاحب الرابط
  // باختياره. وبحجب هذا المفتاح لا تظهر في أي رابط ولو اختارها صاحبه
  par_share_readiness: key('participant', 'نسبة الجاهزية في رابط المشاركة', 'يختار صاحب الرابط إظهار نسبة جاهزية وثيقته لقارئه، وهي مخفية افتراضيًا. بحجبه لا تظهر في أي رابط.'),
};
export const VISIBILITY_KEYS = Object.keys(VISIBILITY);
export const VISIBILITY_DEFAULTS = Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, VISIBILITY[k].default]));
export const visibilityLabel = (k) => (VISIBILITY[k] ? `${AUDIENCE_AR[VISIBILITY[k].audience]}: ${VISIBILITY[k].label_ar}` : k);

// قطاعات المبادرات المحلولة بترتيب العرض: لكل قطاع مفتاح par_example_<القطاع> (المحتوى في supabase/content/initiative-guide)
export const EXAMPLE_SECTORS = Object.freeze(['gov', 'health', 'startup']);

/**
 * ما يُعرض للمشارك من المبادرات المحلولة. يمرّر الخادم مفاتيحه بأسمائها (participant.ts examplesFor)
 * @param {{ field?: boolean, doc?: boolean, sectors?: Record<string, boolean | undefined> }} flags
 * @returns {{ field: boolean, doc: boolean, sectors: string[] }}
 */
export function examplesView(flags) {
  const sectors = EXAMPLE_SECTORS.filter((k) => flags?.sectors?.[k] !== false);
  return { field: flags?.field !== false && sectors.length > 0, doc: flags?.doc !== false && sectors.length > 0, sectors };
}

/** استثناء الدفعة: المفاتيح المعروفة بقيم منطقية وحدها. ما لم يُذكر يتبع الافتراضي العام */
export function cleanVisibility(v) {
  const out = {};
  if (v && typeof v === 'object') for (const k of VISIBILITY_KEYS) if (typeof v[k] === 'boolean') out[k] = v[k];
  return out;
}

/**
 * الرؤية النافذة: الافتراضي، ثم الإعداد العام، ثم استثناء الدفعة. يعيد قيمة منطقية لكل مفتاح.
 * @param {Record<string, any>|null} [settings] مجموعة visibility من app_settings
 * @param {Record<string, any>|null} [cohort] cohorts.visibility
 */
export function resolveVisibility(settings = null, cohort = null) {
  return { ...VISIBILITY_DEFAULTS, ...cleanVisibility(settings), ...cleanVisibility(cohort) };
}

/** ما وُسّع بين حالتين (كان محجوبًا فصار مرئيًا): يُسجَّل ويُبلَّغ به */
export const widened = (before, after) => VISIBILITY_KEYS.filter((k) => before?.[k] === false && after?.[k] === true);
