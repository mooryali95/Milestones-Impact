/* ════════ هوية Milestone Impact — Petrol · Gold · Sand ════════ */
export const B = {
  petrol: "#061E2C",
  petrolSoft: "#3E6E8C",
  gold: "#C8A45C",
  goldText: "#8A6432",
  goldSoft: "#F3E9D7",
  sand: "#FBF8EF",
  card: "#FFFFFF",
  line: "#E7E0CF",
  lineSoft: "#F0EAD9",
  muted: "#5C6B74",
  ok: "#1C6B4F",
  warn: "#8A6A1F",
  bad: "#A13A2C",
};

export const SERVICES0 = [
  { id: "S1", ar: "تدريب", en: "Training" },
  { id: "S2", ar: "ورشة تنفيذية", en: "Executive Workshop" },
  { id: "S3", ar: "كوتشينج", en: "Coaching" },
  { id: "S4", ar: "استشارة توجيهية", en: "Advisory" },
  { id: "S5", ar: "استشارات", en: "Consulting" },
  { id: "S6", ar: "تمكين مكاتب المشاريع", en: "PMO Enablement" },
  { id: "S7", ar: "تحول مؤسسي", en: "Org. Transformation" },
];

export const SEGMENTS0 = [
  { id: "C1", ar: "الرؤساء التنفيذيون", en: "CEOs" },
  { id: "C2", ar: "القيادات التنفيذية", en: "Executives" },
  { id: "C3", ar: "مديرو مكاتب المشاريع", en: "PMO Managers" },
  { id: "C4", ar: "مديرو المشاريع", en: "Project Managers" },
  { id: "C5", ar: "الجهات الحكومية", en: "Government" },
  { id: "C6", ar: "الشركات الكبرى", en: "Enterprises" },
  { id: "C7", ar: "القطاع غير الربحي", en: "NGOs" },
  { id: "C8", ar: "الجامعات", en: "Universities" },
  { id: "C9", ar: "الشركات العائلية", en: "Family Business" },
  { id: "C10", ar: "مؤسسو الشركات الناشئة", en: "Founders" },
];

export const CRITERIA0 = [
  { id: "c1", ar: "حجم السوق", en: "Market Size", w: 14, g: "جاذبية السوق" },
  { id: "c2", ar: "سهولة الوصول للعملاء", en: "Customer Access", w: 10, g: "جاذبية السوق" },
  { id: "c3", ar: "سرعة تحقيق الإيراد", en: "Revenue Speed", w: 12, g: "جاذبية السوق" },
  { id: "c4", ar: "الربحية المتوقعة", en: "Profitability", w: 14, g: "جاذبية السوق" },
  { id: "c5", ar: "توافق خبرات الفريق", en: "Team Fit", w: 10, g: "القدرة على الفوز" },
  { id: "c6", ar: "سهولة التنفيذ", en: "Ease of Delivery", w: 8, g: "القدرة على الفوز" },
  { id: "c7", ar: "قابلية التوسع", en: "Scalability", w: 10, g: "جاذبية السوق" },
  { id: "c8", ar: "قوة الأثر", en: "Impact", w: 6, g: "القدرة على الفوز" },
  { id: "c9", ar: "التميز التنافسي", en: "Differentiation", w: 8, g: "القدرة على الفوز" },
  { id: "c10", ar: "علاقات طويلة الأمد", en: "Long-term Relations", w: 8, g: "القدرة على الفوز" },
];

export const SEED = {
  "S2|C5": {
    scores: [8, 7, 7, 8, 9, 7, 6, 8, 7, 8],
    conf: ["H", "M", "M", "M", "H", "M", "M", "H", "M", "H"],
    risk: 4, riskNote: "اعتماد على دورات الاعتماد الحكومية للمدربين",
    evidence: {
      c1: "أكثر من 300 جهة حكومية ضمن برامج التحول الوطني تحتاج بناء قدرات قيادية في المشاريع",
      c4: "ميزانيات تدريب حكومية مرتفعة وإمكانية عقود إطارية",
      c8: "أثر مباشر على تمكين تنفيذ مستهدفات رؤية 2030",
    },
  },
  "S1|C2": {
    scores: [8, 7, 8, 7, 9, 8, 7, 7, 6, 7],
    conf: ["H", "H", "M", "M", "H", "H", "M", "M", "M", "M"],
    risk: 3, riskNote: "منافسة متزايدة من بيوت التدريب الكبرى",
    evidence: {
      c1: "آلاف القيادات التنفيذية في القطاعين الحكومي والخاص بالسعودية",
      c5: "المحتوى الحالي مصمم أصلاً للقادة وجاهز (Good Enough)",
      c3: "دورة بيع قصيرة نسبياً عبر إدارات التدريب والموارد البشرية",
    },
  },
  "S1|C4": {
    scores: [9, 8, 8, 5, 9, 9, 8, 5, 4, 5],
    conf: ["M", "M", "M", "L", "H", "H", "M", "L", "L", "M"],
    risk: 5, riskNote: "حساسية سعرية عالية وحرب أسعار محتملة",
    evidence: {
      c1: "أكبر شريحة عدداً في سوق إدارة المشاريع",
      c9: "منافسة شديدة من مزودي شهادات PMP وCAPM",
      c4: "حساسية سعرية تضغط الهوامش الربحية",
    },
  },
  "S6|C5": {
    scores: [7, 6, 5, 8, 8, 5, 6, 9, 8, 9],
    conf: ["M", "M", "M", "H", "H", "M", "M", "H", "H", "H"],
    risk: 6, riskNote: "دورات شراء حكومية طويلة وتعقيد تعاقدي",
    evidence: {
      c8: "مكاتب إدارة المشاريع ركيزة أساسية في هياكل الجهات الحكومية",
      c10: "عقود تمكين طويلة الأمد تمتد من 6 إلى 18 شهراً",
      c3: "دورات الشراء الحكومية تبطئ تحقيق الإيراد",
    },
  },
  "S3|C3": {
    scores: [6, 7, 7, 7, 8, 8, 6, 7, 6, 8],
    conf: ["M", "M", "M", "M", "H", "M", "M", "M", "M", "M"],
    risk: 3, riskNote: "صعوبة إثبات العائد الملموس للكوتشينج",
    evidence: {
      c5: "خبرة الفريق المباشرة في قيادة وتأسيس مكاتب المشاريع",
      c2: "مجتمعات مهنية نشطة تسهّل الوصول للشريحة",
    },
  },
  "S4|C1": {
    scores: [6, 5, 6, 8, 8, 7, 5, 8, 7, 9],
    conf: ["L", "M", "M", "M", "H", "M", "L", "M", "M", "H"],
    risk: 5, riskNote: "الاعتماد على العلاقات الشخصية يصعّب التوسع",
    evidence: {
      c4: "أتعاب استشارية توجيهية مرتفعة لكل عميل",
      c10: "علاقة مستمرة بصفة المستشار الموثوق للرئيس التنفيذي",
      c2: "الوصول للرؤساء التنفيذيين يتطلب شبكة علاقات قوية",
    },
  },
  "S6|C6": {
    scores: [7, 5, 5, 8, 8, 5, 6, 8, 7, 8],
    conf: ["M", "M", "M", "M", "M", "M", "M", "M", "M", "M"],
    risk: 5, riskNote: "تفضيل الشركات الكبرى للمكاتب الاستشارية العالمية",
    evidence: {
      c1: "توجه الشركات الكبرى لتأسيس مكاتب مشاريع ناضجة",
      c10: "عقود سنوية متجددة للتشغيل والتمكين",
    },
  },
  "S7|C6": {
    scores: [7, 4, 3, 9, 7, 4, 5, 9, 8, 9],
    conf: ["M", "M", "H", "M", "M", "M", "M", "H", "M", "H"],
    risk: 8, riskNote: "دورة بيع طويلة جداً وتنفيذ مكثف الموارد",
    evidence: {
      c4: "مشاريع التحول تحمل عقوداً كبيرة القيمة",
      c3: "دورة بيع تمتد من 6 إلى 12 شهراً",
      c6: "يتطلب فريقاً كبيراً وحضوراً ميدانياً مستمراً",
    },
  },
  "S2|C9": {
    scores: [5, 5, 6, 6, 7, 7, 5, 6, 6, 7],
    conf: ["M", "M", "M", "M", "M", "M", "M", "M", "M", "M"],
    risk: 4, riskNote: "قرارات الشراء مرتبطة بديناميكية العائلة",
    evidence: {
      c2: "الوصول عبر مجالس العائلات والغرف التجارية",
      c1: "شريحة واعدة لكنها أصغر حجماً من الشرائح المؤسسية",
    },
  },
  "S5|C7": {
    scores: [5, 6, 5, 5, 7, 6, 5, 8, 6, 7],
    conf: ["L", "M", "M", "L", "M", "M", "M", "H", "M", "M"],
    risk: 6, riskNote: "تقلب التمويل في القطاع غير الربحي",
    evidence: {
      c4: "ميزانيات محدودة لدى أغلب الجهات غير الربحية",
      c8: "أثر تنموي واضح يعزز السمعة والمسؤولية المجتمعية",
    },
  },
};

export const TEAM0 = [
  { id: 1, name: "أنت", role: "admin" },
  { id: 2, name: "م. سارة العتيبي", role: "evaluator" },
  { id: 3, name: "د. خالد الحربي", role: "analyst" },
  { id: 4, name: "أ. نورة القحطاني", role: "viewer" },
];

export const ROLES = {
  admin: { ar: "مدير النظام", en: "Admin", chip: { background: B.gold, color: B.petrol }, can: { structure: true, weights: true, score: true, risk: true, analyze: true, team: true } },
  evaluator: { ar: "مقيّم", en: "Evaluator", chip: { background: B.petrolSoft, color: "#fff" }, can: { structure: false, weights: false, score: true, risk: true, analyze: true, team: false } },
  analyst: { ar: "محلل", en: "Analyst", chip: { background: B.ok, color: "#fff" }, can: { structure: false, weights: false, score: false, risk: false, analyze: true, team: false } },
  viewer: { ar: "مشاهد", en: "Viewer", chip: { background: B.muted, color: "#fff" }, can: { structure: false, weights: false, score: false, risk: false, analyze: false, team: false } },
};

/** قراءة آمنة دائماً — لا تُسقط التطبيق أبداً مهما كانت قيمة الدور غير متوقعة */
export const roleInfo = (key) => ROLES[key] || ROLES.viewer;

export const CONF = {
  H: { f: 1.0, ar: "عالٍ", color: B.ok },
  M: { f: 0.92, ar: "متوسط", color: B.warn },
  L: { f: 0.8, ar: "منخفض", color: B.bad },
};

export const SCENARIOS = {
  conservative: { ar: "متحفظ", en: "Conservative", mult: { c2: 1.5, c3: 1.5, c5: 1.4, c6: 1.4 }, desc: "يرفع وزن سرعة الإيراد وسهولة التنفيذ والوصول" },
  expected: { ar: "متوقع", en: "Expected", mult: {}, desc: "الأوزان المعتمدة كما هي" },
  aggressive: { ar: "متفائل", en: "Aggressive", mult: { c1: 1.5, c4: 1.4, c7: 1.5 }, desc: "يرفع وزن حجم السوق والربحية والتوسع" },
};

export const AUDIT0 = [
  { ts: "2026-07-01 09:15", user: "أنت", action: "إنشاء المشروع", detail: "برنامج إدارة المشروعات للقادة" },
  { ts: "2026-07-01 10:40", user: "أنت", action: "اعتماد المعايير", detail: "10 معايير وفق منهجية GE-McKinsey" },
  { ts: "2026-07-02 13:22", user: "م. سارة العتيبي", action: "تقييم", detail: "ورشة تنفيذية × الجهات الحكومية — اكتمل التقييم مع الأدلة" },
  { ts: "2026-07-02 15:05", user: "م. سارة العتيبي", action: "تقييم", detail: "تدريب × القيادات التنفيذية — اكتمل التقييم" },
  { ts: "2026-07-03 08:30", user: "د. خالد الحربي", action: "تحليل", detail: "تشغيل تحليل السيناريوهات الثلاثة" },
];

/* مقياس ساعاتي (Saaty Scale) لمنهجية AHP */
export const SAATY = [
  { v: 1 / 9, label: "الثاني أهم بشكل مطلق (1/9)" },
  { v: 1 / 7, label: "الثاني أهم جداً (1/7)" },
  { v: 1 / 5, label: "الثاني أهم بوضوح (1/5)" },
  { v: 1 / 3, label: "الثاني أهم قليلاً (1/3)" },
  { v: 1, label: "متساويان في الأهمية (1)" },
  { v: 3, label: "الأول أهم قليلاً (3)" },
  { v: 5, label: "الأول أهم بوضوح (5)" },
  { v: 7, label: "الأول أهم جداً (7)" },
  { v: 9, label: "الأول أهم بشكل مطلق (9)" },
];

export const BUCKETS = {
  launch: { ar: "ابدأ الآن", color: B.ok },
  next: { ar: "الموجة التالية", color: B.petrolSoft },
  defer: { ar: "أجّل", color: B.goldText },
  exclude: { ar: "استبعد حالياً", color: B.bad },
  unscored: { ar: "لم تُقيَّم بعد", color: "#9B9690" },
};
