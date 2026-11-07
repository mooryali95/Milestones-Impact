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
// قواعد المرحلة (يضبطها الأدمن لكل مرحلة في كل برنامج). الفارغ = السلوك الأصلي:
// إلزامية، تُفتح بعد اكتمال ما قبلها، وتكتمل بمتطلباتها الإلزامية.
export const STAGE_MODE_AR = { required: 'إلزامية', on_demand: 'عند الطلب', optional: 'اختيارية مقترحة' };
export const STAGE_UNLOCK_AR = {
  previous: 'بعد اكتمال المراحل الإلزامية قبلها', always: 'متاحة من البداية', stages: 'بعد اكتمال مراحل أختارها',
  day: 'بعد عدد أيام من بداية الدفعة', approval: 'حين يفتحها الأدمن أو الخبير',
};
export const STAGE_COMPLETE_AR = { required: 'بإنجاز متطلباتها الإلزامية', any: 'بإنجاز أي متطلب فيها', approval: 'باعتماد الأدمن أو الخبير' };
export const STAGE_STATUS_AR = { done: 'مكتملة', active: 'الحالية', available: 'متاحة عند الحاجة', locked: 'مقفلة' };
// تدخل الأدمن لمشارك بعينه في مرحلة: يفتحها أو يعتمد اكتمالها أو يعفيه منها
export const STAGE_OVERRIDE_AR = { open: 'فُتحت له', complete: 'اعتُمد اكتمالها', skip: 'أُعفي منها' };
// طريقة تنفيذ المرحلة، وطريقة انعقاد الجلسة (any: يختار المشارك عند الحجز)
export const MODE_AR = { in_person: 'حضوري', online: 'عن بعد', hybrid: 'مدمج', self: 'ذاتي عبر المنصة' };
export const SESSION_MODE_AR = { in_person: 'حضوري', online: 'عن بعد', any: 'حضوري أو عن بعد' };
export const VERIFY_AR = { qr: 'رمز QR يعرضه المدرب (في القاعة أو على الشاشة المشتركة)', join: 'الانضمام من التطبيق (للجلسات عن بعد)', manual: 'يسجله المدرب يدويًا', auto: 'آلي: يُحتسب لكل أعضاء الدفعة بانتهاء الجلسة' };
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
  handbook: 'كتيب القائد',        // لا «الكتاب» ولا «كتاب القائد»
  capstone: 'وثيقة المبادرة',      // المشروع نفسه «المبادرة»؛ و«مشروع التخرج» تعريف يظهر مرة واحدة في رأس شاشته
  capstoneEyebrow: 'مشروع التخرج',
  framework: 'الإطار',            // milestone وimpact وleadership؛ «بُعد» لأبعاد معيار التقييم فقط
};

// وسيلة التواصل العامة الوحيدة: البريد. لا رقم هاتف منشور.
export const CONTACT_EMAIL = 'mi@sunkvalue.com';
// رسالة واحدة لكل خطأ لا يستطيع المستخدم فعل شيء حياله (الخادم يحتفظ برمز HTTP ويسجّل السبب)
export const UNEXPECTED_ERROR = `حدث خطأ غير متوقع. حدّث الصفحة، وإن تكرر راسل ${CONTACT_EMAIL}.`;

// الخصوصية والشروط: نسخة السياسة النافذة (تُسجَّل مع موافقة كل مشارك) ومساراتها في تطبيق القادة
export const POLICY_VERSION = '2026-11-06';
export const LEGAL_PATH = { index: '/legal', privacy: '/legal/privacy', terms: '/legal/terms', refund: '/legal/refund' };
// تمييز العدد بالأرقام كما تكتبها الواجهة: 1 و2 بالاسم، و3–10 بالجمع، و11 فأكثر بالمفرد
export const countAr = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);

// المطّلعون من الجهة: القوالب والصلاحيات بأسمائها، لوحة الإدارة وبطاقة «ماذا ترى جهتك»
export const VIEWER_TEMPLATE_AR = { executive: 'راعٍ تنفيذي', program: 'منسّق البرنامج', hr: 'الموارد البشرية', custom: 'مخصّص' };
export const VIEWER_PERM_AR = {
  list: ['قائمة المشاركين', 'الاسم والمسمى والمسار والمرحلة ونسبة الإنجاز'],
  activity: ['نشاط المشاركين', 'آخر دخول لكل مشارك'],
  scores: ['المستويات', 'تأسيسي أو متوسط أو احترافي لكل بُعد'],
  contact: ['التواصل', 'البريد والجوال'],
  export: ['التصدير', 'Excel وطباعة التقرير'],
};

// الخبراء: الأدوار والحالات (المصدر الوحيد لأسمائها)
export const EXPERT_ROLE_AR = {
  coach: ['موجّه', 'جلسات التوجيه الفردية'],
  advisor: ['مستشار', 'تقييم النماذج ووثيقة المبادرة'],
  specialist: ['خبير موضوعي', 'ورش وجلسات تخصصية في بُعد'],
  assessor: ['مقيّم', 'تقييم المبادرة والعرض في ختام البرنامج'],
  mentor: ['مرشد', 'متابعة مشارك طوال رحلته'],
};
// الاستشارة يطلبها المشارك متى احتاجها: أدوارها ومواضعها في الرحلة
export const CONSULT_ROLES = ['coach', 'mentor', 'specialist', 'advisor'];
export const CONSULT_CONTEXT = { program: 'خلال البرنامج', capstone: 'أثناء بناء المبادرة', tracking: 'أثناء تنفيذ المبادرة' };
export const EXPERT_STATUS = {
  applied: 'طلب انضمام', invited: 'مدعو', active: 'نشط', paused: 'متوقف مؤقتًا', suspended: 'موقوف', rejected: 'لم يُقبل',
};
export const EXPERT_REQUEST_STATUS = {
  open: 'يبحث عن خبير', offered: 'معروض على خبير', accepted: 'قبِله الخبير', unmatched: 'لا خبير مطابق', cancelled: 'أُلغي', completed: 'اكتمل',
};
// معايير التقييم (1 إلى 5): ما يسأله المشارك عن خبيره، وما يسأله الخبير عن المشارك
export const RATE_TO_EXPERT = { useful: 'أفادتني الجلسة فعلًا', clear: 'كان واضحًا ومحددًا', committed: 'التزم بالموعد والمتابعة' };
export const RATE_TO_PARTICIPANT = { ready: 'جاء مستعدًا', engaged: 'تفاعل بجدية', progress: 'يتقدّم في هدفه' };

// معيار المعلم الوصفي (تقييم مستمر): خمسة معايير بأربعة مستويات، يقيّم بها الأدمن أو الخبير المعلم حين يعتمد إنجازه
export const MILESTONE_RUBRIC = {
  understanding: { title: 'الفهم', levels: ['لم يتضح فهمه للمطلوب', 'فهم جزئي يحتاج توجيهًا', 'فهم واضح للمطلوب وأسبابه', 'فهم عميق يربطه بسياق جهته'] },
  structure: { title: 'الهيكلة', levels: ['بلا هيكل', 'هيكل ناقص أو غير مترابط', 'هيكل مكتمل ومترابط', 'هيكل محكم يسهل البناء عليه'] },
  execution: { title: 'التنفيذ', levels: ['لم يبدأ', 'بدأ ولم يكتمل', 'اكتمل كما خُطط', 'اكتمل وتجاوز المخطط'] },
  impact: { title: 'الأثر', levels: ['لا أثر ظاهر', 'أثر محتمل غير مقيس', 'أثر ظاهر بدليل', 'أثر مقيس يتبناه أصحاب المصلحة'] },
  presentation: { title: 'العرض', levels: ['غير واضح', 'واضح جزئيًا', 'واضح ومقنع', 'احترافي يصلح للراعي مباشرة'] },
};
// مصادر التقييم المستمر
// «كاتون» مخفي عن المشاركين: أُعيد تصميمه على CBM الثلاثي (المرحلة ط، 2026-11-04) ويبقى مخفيًا حتى يراجع
// المالك المحتوى والجدول ويقرر تفعيله. المصدر الواحد لإخفائه في الواجهة واستبعاده من التقييم المستمر معًا
export const KATON_ENABLED = false;

// مصادر المؤشر: جدارة تُقاس. تقدير الخبراء بعد الجلسات (جاء مستعدًا، تفاعل، يتقدم) انخراط لا جدارة،
// فيُعرض منفصلًا (ENGAGEMENT_AR) ولا يدخل المؤشر (الملحق 5 §3.2)
export const CONTINUOUS_SOURCE_AR = { quizzes: 'اختبارات الكتيب', models: 'النماذج التطبيقية', milestones: 'المعالم', lab: 'إتقان الأدوات في المختبر', katon: 'دقة التحليل في «كاتون»', peer: 'الإسهام المؤكَّد في طلبات الأقران' };
export const ENGAGEMENT_AR = 'الانخراط بتقدير الخبراء بعد الجلسات والاستشارات';
// السلّم الرباعي الواحد (D08): لكل ما يقيّمه إنسان من عمل المشارك، أي النماذج والتمارين ومعيار المعلم ومعيار الوثيقة.
// الأسماء والنسب وحد الاستيفاء والإصدار هنا وحدها، يقرؤها الخادم والواجهتان. «يُعاد للتطوير» حالة returned لا درجة.
// المراسي العامة مسودة يوقعها خبراء المحتوى قبل الإطلاق، ومراسي النماذج الـ22 قبل أول تسليم يُقيَّم.
export const RUBRIC_SCALE = Object.freeze({
  version: 1, pass: 3,
  levels: Object.freeze([
    { n: 1, key: 'below', ar: 'دون المطلوب', pct: 0, anchor_ar: 'لا يستوفي الحد الأدنى: عناصر جوهرية غائبة أو غير صحيحة' },
    { n: 2, key: 'acceptable', ar: 'مقبول', pct: 40, anchor_ar: 'يستوفي جزءًا: العناصر حاضرة وبعضها سطحي أو لا يرتبط بعمله' },
    { n: 3, key: 'proficient', ar: 'متقن', pct: 75, anchor_ar: 'يستوفي المطلوب: مكتمل ومرتبط بعمله الحقيقي وقابل للتطبيق' },
    { n: 4, key: 'distinguished', ar: 'متميز', pct: 100, anchor_ar: 'يتجاوز المطلوب: عميق ومسوَّغ بأدلة ويصلح مرجعًا لغيره' },
  ]),
});
// توحيد المقاييس قبل الجمع (الملحق 5 §3.1): خريطة صريحة «مستوى ← نسبة» من السلّم نفسه، لا تحويلًا خطيًا ضمنيًا
export const RUBRIC_PCT = Object.freeze(Object.fromEntries(RUBRIC_SCALE.levels.map((l) => [l.n, l.pct])));
export const RUBRIC_LEVEL_AR = Object.freeze(Object.fromEntries(RUBRIC_SCALE.levels.map((l) => [l.n, l.ar])));
// اسم الدرجة لتقدير نموذج مخزّن؛ 5 من السلّم الخماسي السابق تُقرأ «متميز» حتى يُطبَّق التحويل
export const rubricLevelAr = (n) => RUBRIC_LEVEL_AR[Math.min(RUBRIC_SCALE.levels.length, Math.round(Number(n)))] || null;
// تقييمات الخبراء للمشارك بعد الجلسات (expert_ratings.overall من 1 إلى 5) وحدها بخريطة خماسية، انخراطًا لا جدارة
export const EXPERT_RATING_PCT = Object.freeze({ 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 });

// كيف يكتمل بند الرحلة (completionSource)
export const COMPLETION_AR = { auto: 'آلي من حالة المشارك', evidence: 'مرتبط بمكانه ودليله', manual: 'يدوي' };
