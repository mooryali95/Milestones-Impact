// ════════════════════════════════════════════════════════════════
// مفاتيح الميزات قيد البناء: القاعة الحية وكاتون وتقييم 360 (تصور 2026-11-16، اعتمده المالك، المرحلة P1)
// ════════════════════════════════════════════════════════════════
// مفتاح واحد لكل ميزة في المخزن الواحد (settings.js): features.hall وfeatures.katon وfeedback360.enabled.
// هنا المنطق الصافي (vitest وDeno): قراءة المفاتيح من الإعدادات، وأي فعل تحكمه أي ميزة، وما يُرد حين تُطفأ.
// الخادم هو الحارس الحقيقي (features.ts وindex.ts)، وإخفاء الواجهة تجميل. أفعال المدير مستثناة ليبني الميزة،
// إلا فتح القاعة: لا يُفتح ما لا يدخله أحد فيُظن أن جلسة انعقدت.
// المفتاح للظهور وحده: لا يمس الدرجة ولا الاكتمال (وزن كاتون في final.js وcontinuous.js مستقل عنه)، إلا بنود 360 في الرحلة:
// إخفاؤها كإخفاء الدفعة يغير ما يكمل المرحلة، فيمس اكتمال المعالم المربوطة بمرحلة والمؤشر المستمر ومكوّن المعالم في الختامي.
// وذلك مقصود: لا يُحاسب المشارك على بند لا يستطيعه. والختامي المعتمد لا يُعاد حسابه إن أُظهر 360 بعده.
// ومفتاح 360 كان يضم تقدير المدير والزملاء قبل البرنامج وبعده (قرار المالك 2026-11-16). فصله تصور المرحلة 3 (القرار 2،
// 2026-11-26): تقدير المدير قياسي بخانة واحدة والمفتاح مطفأ (manager-rating.js)، وحين يُطفأ يختفي E-360 وحده ودورة 360 كلها،
// ويتوقف رابط مقيّم 360 مؤقتًا. ما أُرسل من تقديرات باقٍ كما هو ويدخل حساب الأثر.

export const FEATURE_KEYS = ['hall', 'katon', 'f360'];
export const FEATURE_OFF_CODE = { hall: 'hall_off', katon: 'katon_off', f360: 'f360_off' };
// رسالة الرفض لا تسمّي الميزة: من ليس مديرًا لا يُذكر له ما أُخفي عنه
export const FEATURE_OFF_AR = 'هذا غير متاح الآن.';
export const HALL_OPEN_OFF_AR = 'القاعة الحية مخفية عن المستخدمين، فلا يدخلها أحد. أظهرها من «الميزات قيد البناء» في الإعدادات العامة أولًا.';
// مقيّم 360 الخارجي برابطه: الدورة متجمدة، وبياناته باقية، ولا يُطلب منه شيء الآن
export const RATER_PAUSED_AR = 'هذا التقدير متوقف مؤقتًا، ولا يلزمك شيء الآن. شكرًا لاستعدادك.';

// المفاتيح من الإعدادات المحلولة (resolveSettings). ما غاب أو لم يكن true فمطفأ
export function featureFlags(settings) {
  return {
    hall: settings?.features?.hall === true,
    katon: settings?.features?.katon === true,
    f360: settings?.feedback360?.enabled === true,
  };
}

// الأفعال المرفوضة حين تُطفأ ميزتها. katon.answer ليس هنا: داخل القاعة يحكمه مفتاح القاعة (hallGate)،
// وخارجها مفتاح كاتون (katon.ts)
const REFUSED = {
  hall: ['hall.state', 'hall.join', 'hall.hand', 'hall.pick', 'xp.hall-open', 'xp.hall-step', 'xp.hall-split', 'xp.hall-assign', 'xp.hall-close', 'admin.hall-open'],
  katon: ['katon.mine'],
  // مقيّمو الأثر (pre وpost) خرجوا من المفتاح (تصور المرحلة 3، القرار 2): rater.invite وrater.revoke وxp.rater-confirm
  // تمر والمفتاح مطفأ بخانة المدير وحدها (impact.ts)، وأفعال دورة 360 هنا مرفوضة كما كانت
  f360: ['f360.start', 'f360.self', 'f360.nominate', 'f360.remove', 'f360.submit', 'f360.report', 'f360.plan', 'xp.f360-decide', 'xp.f360-report', 'xp.f360-release'],
};
// قراءات تُجاب بحال «لا شيء» لا بخطأ: الواجهة القائمة تخفي بطاقتها بنفسها (Feedback360Entry وAdvisor360 وExpertHall)
const SOFT = {
  'f360.mine': { feature: 'f360', reply: () => ({ success: true, enabled: false, ready: true }) },
  'xp.f360': { feature: 'f360', reply: () => ({ success: true, approvals: [], reports: [] }) },
  'xp.hall': { feature: 'hall', reply: () => ({ success: true, session: null, topics: [], workshops: [], off: true }) },
};
export const FEATURE_ACTIONS = Object.fromEntries(Object.entries(REFUSED).flatMap(([f, list]) => list.map((a) => [a, f])));
export const FEATURE_SOFT_ACTIONS = Object.keys(SOFT);

// حكم الفعل: null (يمر)، أو { soft } (رد جاهز بلا خطأ)، أو { fail: { message, status, code } }
export function featureGate(action, flags) {
  const soft = SOFT[action];
  if (soft) return flags[soft.feature] ? null : { soft: soft.reply() };
  const f = FEATURE_ACTIONS[action];
  if (!f || flags[f]) return null;
  if (action === 'admin.hall-open') return { fail: { message: HALL_OPEN_OFF_AR, status: 409, code: FEATURE_OFF_CODE.hall } };
  return { fail: { message: FEATURE_OFF_AR, status: 404, code: FEATURE_OFF_CODE[f] } };
}

// بنود الرحلة التي يخفيها مفتاح 360 وهو مطفأ: تقدير الزملاء بعد البرنامج (E-360) وحده. تقدير المدير قبل البرنامج (T-360)
// وإفادته بعده (E-MGR) خرجا من المفتاح (تصور المرحلة 3، القرار 2، manager-rating.js)، إلا القبلي لدفعة جارية بدأت قبل
// الإطلاق (preAllowed false). تُخفى في طبقة التعريف (journeyDefinition) كبنود الدفعة المخفية، فلا تُعد في التقدم ولا تحبس مرحلة
export const F360_JOURNEY_CODES = ['E-360'];
export const MANAGER_JOURNEY_CODES = ['T-360', 'E-MGR'];
/** @param {{ f360?: boolean } | null | undefined} flags @param {{ preAllowed?: boolean }} [o] @returns {string[]} */
export const featureHiddenCodes = (flags, { preAllowed = true } = {}) => (flags?.f360 ? [] : [...F360_JOURNEY_CODES, ...(preAllowed ? [] : ['T-360'])]);
// ما يُخفى فعلًا من رموز المفتاح فوق إخفاء الدفعة: رمز يترك إخفاؤه مرحلة بلا بند يكملها يبقى ظاهرًا (kept)، احتياط لا يقع في
// البرنامج الحالي. والباقي ظاهرًا لا يكتمل ما دام المفتاح مطفأ (الدعوة مرفوضة)، فمرحلته تنتظر الإظهار: لذلك لا تقبل الدفعة إخفاءً
// يجعله وحده ما يكملها (guardLive في programs.ts)، ويُسجَّل في السجل إن وقع من شكل البرنامج نفسه.
// breaks هو hideBreaksStage من logic.js (يُمرَّر حتى لا تحمل الواجهة منطق الرحلة كله)
/** @param {{ stages?: any[], requirements?: any[], cohortHidden?: string[], flags: any, preAllowed?: boolean, breaks: (stages: any[], reqs: any[], hidden: string[]) => { key: string }[] }} a */
export function featureHiddenFor({ stages = [], requirements = [], cohortHidden = [], flags, breaks, preAllowed = true }) {
  const codes = featureHiddenCodes(flags, { preAllowed }).filter((c) => !cohortHidden.includes(c) && requirements.some((r) => r.code === c));
  if (!codes.length) return { hidden: [], kept: [] };
  const was = new Set(breaks(stages, requirements, cohortHidden).map((s) => s.key));
  const now = breaks(stages, requirements, [...cohortHidden, ...codes]).filter((s) => !was.has(s.key)).map((s) => s.key);
  if (!now.length) return { hidden: codes, kept: [] };
  const stageOf = new Map(requirements.map((r) => [r.code, r.stage_key]));
  const kept = codes.filter((c) => now.includes(stageOf.get(c)));
  return { hidden: codes.filter((c) => !kept.includes(c)), kept };
}

// ملاحظة رسائل الورشة حين تُخفى القاعة، بطريقة توثيق حضور الجلسة نفسها (config.verify في متطلبها) بلا ذكر القاعة:
// qr برمز يعرضه المدرب (workshop.checkin)، وjoin بالانضمام من الرحلة (workshop.join) لجلسة عن بعد برابطها، وما سواهما
// (يدوي أو آلي، أو بريد قديم في الطابور لا تُعرف طريقته) ملاحظة عامة لا تَعِد بطريقة
export const WORKSHOP_NO_HALL_NOTE = {
  qr: {
    invite: 'أضف الموعد إلى تقويمك من المرفق. يوم الجلسة سجّل حضورك برمز QR الذي يعرضه المدرب.',
    day: 'أحضر جوالك مشحونًا، فحضورك يُسجَّل برمز QR الذي يعرضه المدرب.',
    hour: 'حين تصل سجّل حضورك برمز QR الذي يعرضه المدرب.',
  },
  join: {
    invite: 'أضف الموعد إلى تقويمك من المرفق. يوم الجلسة انضم من زر الانضمام في رحلتك، فبه يُسجَّل حضورك.',
    day: 'جهّز جهازك واتصالك، وانضم غدًا من زر الانضمام في رحلتك، فبه يُسجَّل حضورك.',
    hour: 'انضم في موعدها من زر الانضمام في رحلتك، فبه يُسجَّل حضورك.',
  },
  other: {
    invite: 'أضف الموعد إلى تقويمك من المرفق، وتجد تفاصيل الجلسة في رحلتك.',
    day: 'نلقاك غدًا في موعدك، وتجد تفاصيل الجلسة في رحلتك.',
    hour: 'تجد تفاصيل الجلسة في رحلتك، ونلقاك بعد قليل.',
  },
};
/** طريقة الملاحظة من توثيق الحضور ونوع الجلسة: join لا يصح إلا لجلسة عن بعد يصل المشارك رابطها
 * @param {string | null | undefined} verify @param {boolean} onlineWithLink @returns {'qr' | 'join' | 'other'} */
export const attendNoteMethod = (verify, onlineWithLink) => {
  const v = verify || 'qr';
  if (v === 'qr') return 'qr';
  if (v === 'join' && onlineWithLink) return 'join';
  return 'other';
};

// بطاقة 360 عند منسق الجهة: صلاحية الدرجات، ومفتاح الرؤية coord_f360 (لكل دفعة)، ومفتاح 360 العام معًا.
// المفتاح العام يُضاف ولا يحل محل الرؤية، فإظهار 360 لاحقًا يعيد ما ضبطه المالك لكل دفعة كما كان
export const coordFeedbackShown = (scores, vis, flags) => !!scores && !!vis?.coord_f360 && !!flags?.f360;
