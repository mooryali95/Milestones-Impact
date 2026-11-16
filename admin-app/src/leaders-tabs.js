// أقسام تطبيق القادة في اللوحة: المفتاح والاسم. ملف صغير مستقل يقرؤه شريط البحث (Palette) وقسم القادة معًا، فلا
// يجرّ استيراده من Leaders.jsx الأقسام كلها إلى الحزمة الرئيسية (التدقيق 2026-11-10، البند 9.13)
import { TRACK_COUNT } from '../../supabase/functions/leaders-api/labels.js';

export const TABS = [
  ['overview', 'نظرة عامة'], ['insight', 'الرؤية الشاملة'], ['participants', 'المشاركون'], ['orgs', 'الجهات'], ['tracks', `المسارات الـ${TRACK_COUNT}`],
  ['programs', 'البرامج والدفعات'], ['hall', 'القاعة الحية'], ['journey', 'الرحلة والمتطلبات'], ['content', 'بنك المحتوى'], ['activities', 'الحضور والجلسات'], ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والتسكين'], ['book', 'الكتاب الأم'], ['handbook', 'كتاب القائد'], ['katon', 'بنك كاتون'], ['capstones', 'مشاريع التخرج'], ['lab', 'مختبر القائد'], ['experts', 'الخبراء'], ['mailcenter', 'مركز البريد'], ['mail', 'قوالب البريد'], ['impact', 'قياس الأثر'], ['f360', 'تقييم 360'], ['certs', 'الشهادات'], ['payments', 'المدفوعات'], ['settings', 'الإعدادات العامة'], ['agent', 'المساعد الآلي'], ['guidance', 'التوجيه والإرشاد'], ['guidance-access', 'إتاحة التوجيه'],
];
// أقسام ميزات قيد البناء ومفتاح كل منها (features.js على الخادم): عليها شارة «مخفي عن المستخدمين» حين تُطفأ
export const FEATURE_TABS = { hall: 'hall', katon: 'katon', f360: 'f360' };
// أقسام لا تظهر إلا للمدير الأعلى أو المالك (والخادم يرفض غيرهما على كل حال)
export const OWNER_TABS = new Set(['agent', 'guidance', 'guidance-access']);
