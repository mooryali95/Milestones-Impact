// ════════════════════════════════════════════════════════════════
// CONFIG — brand tokens, tracks, phases, and the 16-operation matrix
// ════════════════════════════════════════════════════════════════

// AWS Lambda used only for the (optional, best-effort) consultant notify email.
export const API_URL = 'https://wmfbw7ff71.execute-api.us-east-1.amazonaws.com';

export const BRAND = {
  color: "#14495E",
  dark: "#0A2A3D",
  light: "#2A6478",
  deep: "#061E2C"
};

export const TRACKS = [
  { id: "creation", nameAr: "الخلق", weight: 19, color: "#8B6914", contentAr: "الإرث التاريخي", icon: "◈" },
  { id: "innovation", nameAr: "الإبداع", weight: 21, color: "#5B7B3A", contentAr: "إعادة التعريف", icon: "◉" },
  { id: "establishment", nameAr: "الإنشاء", weight: 47, color: "#2E6B8A", contentAr: "تكوين المنتج", icon: "◆" },
  { id: "making", nameAr: "الجعل", weight: 13, color: "#6B4E3D", contentAr: "الاندماج", icon: "◇" },
];

export const PHASES = [
  { id: 1, nameAr: "المرحلة الأولى", group: "current", groupAr: "الهوية الحالية" },
  { id: 2, nameAr: "المرحلة الثانية", group: "current", groupAr: "الهوية الحالية" },
  { id: 3, nameAr: "المرحلة الثالثة", group: "new", groupAr: "الهوية الاعتبارية الجديدة" },
  { id: 4, nameAr: "المرحلة الرابعة", group: "new", groupAr: "الهوية الاعتبارية الجديدة" },
];

export const OPERATIONS = {
  creation: [
    { nameAr: "تحليل ديموغرافي", dur: 5 },
    { nameAr: "تحليل المنتجات", dur: 4 },
    { nameAr: "تكوين الهوية الجديدة", dur: 6 },
    { nameAr: "تكوين القيمة التاريخية", dur: 3 },
  ],
  innovation: [
    { nameAr: "تكوين معرفي", dur: 4 },
    { nameAr: "إعادة تشكيل العلاقات", dur: 5 },
    { nameAr: "الدمج مع الهوية الجديدة", dur: 6 },
    { nameAr: "تكوين أنواع القيم", dur: 4 },
  ],
  establishment: [
    { nameAr: "القدرات المؤسسية", dur: 5 },
    { nameAr: "القدرات القيادية", dur: 4 },
    { nameAr: "بداية البراند", dur: 7 },
    { nameAr: "القيمة المستقبلية", dur: 3 },
  ],
  making: [
    { nameAr: "الاندماج مع مجالس الإدارة", dur: 5 },
    { nameAr: "قيادة المنتج", dur: 4 },
    { nameAr: "الاندماج مع منتجات أخرى", dur: 6 },
    { nameAr: "الإطلاق", dur: 3 },
  ],
};
