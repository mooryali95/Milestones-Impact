// ════════════════════════════════════════════════════════════════
// قاموس المسميات: المصدر الوحيد لكل اسم يظهر في المنصة
// ════════════════════════════════════════════════════════════════
// يستورده الخادم وتطبيق المشارك ولوحة الإدارة ووثائق الطباعة. لا يُعرَّف أي
// من هذه الأسماء في ملف آخر؛ فحص tests/single-source يمنع النسخ.
// المفاتيح تطابق قيود قاعدة البيانات (leaders.dimensions وleaders.levels وقيود الحالة).

export const DIMENSIONS = [
  { key: 'milestone', short: 'Milestone', en: 'Milestone · Execution', title: 'إدارة المشروعات' },
  { key: 'impact', short: 'Impact', en: 'Impact · Value', title: 'تحويل المشروع إلى أثر' },
  { key: 'leadership', short: 'Leadership', en: 'Leadership · People', title: 'تمكين القائد' },
];
export const DIM_AR = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.title]));
export const DIM_SHORT = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.short]));

export const LEVELS = [
  { key: 'beginner', title: 'تأسيسي', en: 'Foundation', step: 1 },
  { key: 'intermediate', title: 'متوسط', en: 'Intermediate', step: 2 },
  { key: 'advanced', title: 'احترافي', en: 'Professional', step: 3 },
];
export const LEVEL_AR = Object.fromEntries(LEVELS.map((l) => [l.key, l.title]));

export const TIER_AR = { knowledge: 'المعرفة', skill: 'المواقف', behavior: 'الممارسة' };

export const PARTICIPANT_STATUS = {
  registered: 'مسجّل', profiled: 'أكمل الملف', assessing: 'يجيب على القياس', pending_approval: 'بانتظار الاعتماد',
  placed: 'معتمد المستوى', enrolled: 'في البرنامج', completed: 'أنهى البرنامج', withdrawn: 'منسحب', suspended: 'موقوف',
};
export const FUNNEL = [['registered', 'سجّل'], ['profiled', 'أكمل الملف'], ['assessed', 'أنهى القياس'], ['approved', 'اعتُمد مساره'], ['completed', 'أنهى البرنامج']];

export const REQ_STATUS = { pending: 'لم يُنجز', submitted: 'بانتظار المراجعة', done: 'منجز', returned: 'أُعيد للتعديل' };

export const PHASE_AR = { admission: 'القبول', qualification: 'التأهيل', impact: 'الأثر' };
// طريقة تنفيذ المرحلة، وطريقة انعقاد الجلسة (any: يختار المشارك عند الحجز)
export const MODE_AR = { in_person: 'حضوري', online: 'عن بعد', hybrid: 'مدمج', self: 'ذاتي عبر المنصة' };
export const SESSION_MODE_AR = { in_person: 'حضوري', online: 'عن بعد', any: 'حضوري أو عن بعد' };
export const VERIFY_AR = { qr: 'رمز QR يعرضه المدرب (في القاعة أو على الشاشة المشتركة)', join: 'الانضمام من التطبيق (للجلسات عن بعد)', manual: 'يسجله المدرب يدويًا' };
// عدد المسارات مشتق: كل تركيبة من مستوى لكل بُعد
export const TRACK_COUNT = LEVELS.length ** DIMENSIONS.length;

// حالات العمل المسلَّم (نموذج تعليمي أو فصل): بصوت المشارك، وما تقوله الإدارة يختلف في المخاطَب فقط
export const SUBMISSION_STATUS = { draft: 'قيد العمل', submitted: 'بانتظار تقييم المستشار', returned: 'أُعيد إليك للتطوير', reviewed: 'قيّمه المستشار' };
export const SUBMISSION_STATUS_ADMIN = { ...SUBMISSION_STATUS, draft: 'مسودة', submitted: 'بانتظار تقييمك', returned: 'أُعيد للتطوير', reviewed: 'قُيّم' };
// جلسات التوجيه
export const COACH_STATUS = { booked: 'محجوزة', requested: 'اتصال فوري', attended: 'حضرت', no_show: 'لم تحضر', cancelled: 'أُلغيت' };
export const COACH_STATUS_ADMIN = { ...COACH_STATUS, attended: 'حضر', no_show: 'لم يحضر' };
// حالة قراءة الباب كما يقيسها الخادم من وقت القراءة وتمريرها
export const READ_STATUS = { read: 'قرأته', skimmed: 'تصفّح سريع', partial: 'قراءة جزئية', unread: 'لم تقرأه' };
export const READ_STATUS_ADMIN = { ...READ_STATUS, read: 'قرأ', unread: 'لم يقرأ' };

// ── المصطلحات المعتمدة: اسم واحد لكل مفهوم في الواجهات والمحتوى ──
// المستشار يقيّم ويعتمد، والموجّه يرافق جلسات التوجيه، والمدرب يقود أيام التدريب، والخبير يقدّم الاستشارة.
// الصيغ المرفوضة يمنعها leaders-app/src/single-source.test.js في الكود.
export const TERMS = {
  coaching: 'التوجيه',            // لا «الكوتشينغ»
  community: 'مجتمع الممارسة',    // لا «مجتمع الأقران»
  handbook: 'كتيب القائد',
  capstone: 'وثيقة المبادرة (مشروع التخرج)',
  framework: 'الإطار',            // milestone وimpact وleadership
};
