// ════════════════════════════════════════════════════════════════
// مفاتيح الميزات قيد البناء: القاعة الحية وكاتون وتقييم 360 (تصور 2026-11-16، اعتمده المالك، المرحلة P1)
// ════════════════════════════════════════════════════════════════
// مفتاح واحد لكل ميزة في المخزن الواحد (settings.js): features.hall وfeatures.katon وfeedback360.enabled.
// هنا المنطق الصافي (vitest وDeno): قراءة المفاتيح من الإعدادات، وأي فعل تحكمه أي ميزة، وما يُرد حين تُطفأ.
// الخادم هو الحارس الحقيقي (features.ts وindex.ts)، وإخفاء الواجهة تجميل. أفعال المدير مستثناة ليبني الميزة،
// إلا فتح القاعة: لا يُفتح ما لا يدخله أحد فيُظن أن جلسة انعقدت.
// المفتاح للظهور وحده: لا يمس الدرجة ولا الاكتمال (وزن كاتون في final.js وcontinuous.js مستقل عنه).

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

// ملاحظة رسائل الورشة حين تُخفى القاعة: الحضور برمز QR الذي يعرضه المدرب (workshop.checkin)، بلا ذكر القاعة
export const WORKSHOP_NO_HALL_NOTE = {
  invite: 'أضف الموعد إلى تقويمك من المرفق. يوم الجلسة سجّل حضورك برمز QR الذي يعرضه المدرب.',
  day: 'أحضر جوالك مشحونًا، فحضورك يُسجَّل برمز QR الذي يعرضه المدرب.',
  hour: 'حين تصل سجّل حضورك برمز QR الذي يعرضه المدرب.',
};

// بطاقة 360 عند منسق الجهة: صلاحية الدرجات، ومفتاح الرؤية coord_f360 (لكل دفعة)، ومفتاح 360 العام معًا.
// المفتاح العام يُضاف ولا يحل محل الرؤية، فإظهار 360 لاحقًا يعيد ما ضبطه المالك لكل دفعة كما كان
export const coordFeedbackShown = (scores, vis, flags) => !!scores && !!vis?.coord_f360 && !!flags?.f360;
