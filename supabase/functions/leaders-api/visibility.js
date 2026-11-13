// ════════════════════════════════════════════════════════════════
// التحكم في الرؤية: ما يراه كل دور وما لا يراه، بمفاتيح يضبطها المالك (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لمفاتيح الرؤية وتسمياتها وافتراضاتها (تصور التحكم الديناميكي، اعتمده المالك 2026-11-13).
// ثلاث طبقات تُحسم هنا في resolveVisibility: الافتراضي العام (مجموعة visibility في app_settings)، ثم استثناء
// الدفعة (cohorts.visibility)، ثم صلاحيات المنسق الفردية كما هي في org_coordinators (logic.js coordPermissions).
// كل افتراض يطابق سلوك ما قبل المفاتيح، فلا يتغير شيء عند النشر حتى يغيّره المالك. ما لا يُفتح بمفتاح:
// موافقة المشارك على مشاركة مستواه مع جهته، وسرية إجابات مقيّمي 360؛ هذه حقوق أصحابها لا إعدادات.
const key = (audience, label_ar, hint_ar, def = true) => ({ audience, label_ar, hint_ar, default: def });

export const AUDIENCE_AR = { advisor: 'مستشار الدفعة وخبير المجموعة', assigned: 'الخبير المسند بطلب خدمة' };

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
  asg_models: key('assigned', 'النماذج وتقييمها واختبارات الكتيب', 'ما سلّمه المشارك من نماذج ودرجاته في الأبواب.'),
  asg_final: key('assigned', 'ملخص التقييم الختامي', 'الدرجة والقرار وحالته.'),
  asg_continuous: key('assigned', 'التقييم المستمر', 'المؤشر المستمر ومكوناته وتعليقات الخبراء.'),
};
export const VISIBILITY_KEYS = Object.keys(VISIBILITY);
export const VISIBILITY_DEFAULTS = Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, VISIBILITY[k].default]));
export const visibilityLabel = (k) => (VISIBILITY[k] ? `${AUDIENCE_AR[VISIBILITY[k].audience]}: ${VISIBILITY[k].label_ar}` : k);

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
