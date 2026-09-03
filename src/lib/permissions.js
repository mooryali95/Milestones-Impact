// ════════════════════════════════════════════════════════════════
// الصلاحيات — أذونات مفصّلة بلا أدوار
// ════════════════════════════════════════════════════════════════
// لكل مستخدمٍ مصفوفةُ أذونات صريحة: مصدر × فعل. لا أدوار جاهزة،
// فالدور تجميعٌ يُخفي ما يملكه الشخص فعلاً، وهنا يُقرأ من الجدول
// مباشرة: من يرى ماذا، ومن يعدّل ماذا.
//
// ══ تحذيرٌ يجب أن يبقى مكتوباً ══
// ما في هذا الملف يحكم *ما يُعرض* لا *ما يُسمح به*. إخفاء زرٍّ في
// المتصفّح ليس منعاً: من يملك رمز جلسة يستطيع نداء admin-api
// مباشرةً. فالفرض الحقيقي مكانه الخادم، وكل إجراء في admin-api
// عليه أن يعيد فحص إذن صاحب الرمز قبل أن يردّ ببيانات.
// هذا الملف يجعل الواجهة صادقة، والخادم يجعلها آمنة.

export const CAN = {
  VIEW: 'view',      // رؤية المصدر وقائمته
  EDIT: 'edit',      // تغيير حالة طلب، فتح تعديل، إلخ
  EXPORT: 'export',  // تنزيل أو طباعة
  DELETE: 'delete',  // حذف طلب
};

export const CAN_LIST = [
  { id: CAN.VIEW, labelAr: 'عرض', descAr: 'رؤية الطلبات وتفاصيلها' },
  { id: CAN.EDIT, labelAr: 'تعديل', descAr: 'تغيير الحالة وفتح التعديل' },
  { id: CAN.EXPORT, labelAr: 'تصدير', descAr: 'تنزيل البيانات أو طباعتها' },
  { id: CAN.DELETE, labelAr: 'حذف', descAr: 'حذف طلب نهائياً' },
];

// إذنٌ عابر للمصادر: من يملكه يدير أذونات الآخرين.
export const MANAGE_ACCESS = 'manage_access';

// الشكل الذي يرسله الخادم:
//   { manage_access: false, sources: { matrix: ['view','edit'], 'home-contact': ['view'] } }
//
// وغيابُه ليس «كل شيء مسموح» ولا «كل شيء ممنوع» بلا تمييز — بل
// حالةٌ ثالثة صريحة: لم تصل الأذونات بعد. الواجهة تعرض انتظاراً،
// لا لوحةً فارغة ولا لوحةً مفتوحة.
export const UNKNOWN = null;

export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return UNKNOWN;
  const sources = {};
  const rawSources = raw.sources && typeof raw.sources === 'object' ? raw.sources : {};
  for (const [id, list] of Object.entries(rawSources)) {
    if (!Array.isArray(list)) continue;
    // نقبل المعروف فقط — إذنٌ لا نعرفه لا يُمنح صامتاً
    sources[id] = list.filter((c) => Object.values(CAN).includes(c));
  }
  return { manage_access: raw[MANAGE_ACCESS] === true, sources };
}

// هل يملك هذا الإذن على هذا المصدر؟
// perms === UNKNOWN تعني «لا نعرف بعد» فنمنع — الانتظار أأمن من الفتح.
export function can(perms, sourceId, action) {
  if (!perms) return false;
  const list = perms.sources?.[sourceId];
  return Array.isArray(list) && list.includes(action);
}

export function canManageAccess(perms) {
  return !!perms?.manage_access;
}

// المصادر التي يراها هذا المستخدم — بها تُبنى التبويبات.
// من لا يرى مصدراً لا يرى تبويبه أصلاً، لا تبويباً فارغاً.
export function visibleSources(perms, sources) {
  if (!perms) return [];
  return sources.filter((s) => can(perms, s.id, CAN.VIEW));
}

// ملخّصٌ يُقرأ بلغة البشر — يظهر في شاشة إدارة الوصول بجوار كل شخص،
// فيُعرف ما يملكه بنظرة بدل قراءة مصفوفة مربّعات.
export function summarize(perms, sources) {
  if (!perms) return 'الأذونات لم تصل بعد';
  const parts = [];
  if (perms.manage_access) parts.push('إدارة الوصول');
  for (const s of sources) {
    const list = perms.sources?.[s.id] || [];
    if (!list.length) continue;
    const labels = CAN_LIST.filter((c) => list.includes(c.id)).map((c) => c.labelAr);
    parts.push(`${s.nameAr}: ${labels.join('، ')}`);
  }
  return parts.length ? parts.join(' · ') : 'بلا أي صلاحية';
}
