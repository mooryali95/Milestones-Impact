// أقسام تطبيق القادة في اللوحة: المفتاح والاسم. ملف صغير مستقل يقرؤه شريط البحث (Palette) وقسم القادة معًا، فلا
// يجرّ استيراده من Leaders.jsx الأقسام كلها إلى الحزمة الرئيسية (التدقيق 2026-11-10، البند 9.13)
import { TRACK_COUNT } from '../../supabase/functions/leaders-api/labels.js';

export const TABS = [
  ['overview', 'نظرة عامة'], ['insight', 'الرؤية الشاملة'], ['participants', 'المشاركون'], ['orgs', 'الجهات'], ['tracks', `المسارات الـ${TRACK_COUNT}`],
  ['programs', 'البرامج والدفعات'], ['hall', 'القاعة الحية'], ['journey', 'الرحلة والمتطلبات'], ['content', 'بنك المحتوى'], ['activities', 'الحضور والجلسات'], ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والتسكين'], ['book', 'الكتاب الأم'], ['handbook', 'كتاب القائد'], ['katon', 'بنك كاتون'], ['capstones', 'مشاريع التخرج'], ['lab', 'مختبر القائد'], ['experts', 'الخبراء'], ['mailcenter', 'مركز البريد'], ['mail', 'قوالب البريد'], ['impact', 'قياس الأثر'], ['f360', 'تقييم 360'], ['certs', 'الشهادات'], ['payments', 'المدفوعات'], ['settings', 'الإعدادات العامة'], ['ai', 'المساعد الذكي'],
];
// أقسام ميزات قيد البناء ومفتاح كل منها (features.js على الخادم): عليها شارة «مخفي عن المستخدمين» حين تُطفأ
export const FEATURE_TABS = { hall: 'hall', katon: 'katon', f360: 'f360' };
// أقسام لا تظهر إلا للمدير الأعلى أو المالك (والخادم يرفض غيرهما على كل حال)
export const OWNER_TABS = new Set(['ai']);
// «المساعد الذكي» قسم واحد في الشريط بثلاثة تبويبات داخلية (قرار المالك 2026-11-17)، والتبويب الداخلي في العنوان:
// #/leaders/ai/<site|guidance|access>. الاسم القديم في keys ليجده البحث (Ctrl K) بأي من الاسمين
export const AI_TABS = [['site', 'مساعد الموقع', ['المساعد الآلي']], ['guidance', 'التوجيه والإرشاد', []], ['access', 'الإتاحة', ['إتاحة التوجيه']]];
// الروابط القديمة (بريد التنبيه والإشارات المحفوظة) تصل إلى تبويبها الداخلي: القسم القديم ← [القسم، التبويب الداخلي]
export const TAB_ALIASES = { agent: ['ai', 'site'], guidance: ['ai', 'guidance'], 'guidance-access': ['ai', 'access'] };
// معمارية الشريط (تدقيق لوحة الإدارة 2026-11-23، المرحلة 2): خمس مجموعات بحسب تكرار الاستعمال، العمل اليومي أعلاها والإعداد
// النادر أسفلها مطويًا. كل قسم في مجموعة واحدة، والمفاتيح نفسها فتبقى الروابط القديمة (#/leaders/<القسم>) كما هي
export const SETUP_GROUP = 'الإعداد';
export const NAV_GROUPS = [
  ['العمل', ['overview', 'participants', 'orgs', 'programs', 'activities', 'capstones', 'hall']],
  ['الأشخاص', ['experts']],
  ['المنهج والمحتوى', ['journey', 'book', 'handbook', 'content', 'katon', 'lab', 'assessment', 'levels', 'tracks']],
  ['التقارير', ['insight', 'impact', 'f360']],
  [SETUP_GROUP, ['mailcenter', 'mail', 'certs', 'payments', 'ai', 'settings']],
];
// مجموعة القسم: يقرؤها الشريط والبحث (Ctrl K) فيظهر كل قسم باسم مجموعته
export const GROUP_OF = Object.fromEntries(NAV_GROUPS.flatMap(([g, keys]) => keys.map((k) => [k, g])));
// حال المجموعة: المفتوح فيه القسم الحالي مفتوحة دائمًا، وإلا ما اختاره المدير، وإلا الافتراضي (الإعداد مطوي وحده)
export const groupOpen = (g, keys, tab, saved) => keys.includes(tab) || (saved && g in saved ? !!saved[g] : g !== SETUP_GROUP);
