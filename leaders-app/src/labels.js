import { DIMENSIONS, LEVELS, MODE_AR, PHASE_AR, TIER_AR, REQ_STATUS } from '../../supabase/functions/leaders-api/labels.js';

export { DIMENSIONS, LEVELS, REQ_STATUS };
export const dimOf = (k) => DIMENSIONS.find((d) => d.key === k) || { key: k, short: k, title: k };

// وصف المستوى الملخص الذي يراه المشارك (التفصيل لكل بُعد للإدارة فقط)
export const LEVEL_SUMMARY = {
  beginner: 'تبني أساسك: لغة مشتركة وأدوات عملية تربط التنفيذ بالأثر والقيادة.',
  intermediate: 'تطبّق بثبات، ورحلتك تعمّق الربط بين إدارة التنفيذ وصناعة الأثر وقيادة الفريق.',
  advanced: 'تقود بنضج، ورحلتك تنقلك إلى بناء الأنظمة ونقل الخبرة إلى فريقك وجهتك.',
};

export const levelOf = (k) => LEVELS.find((l) => l.key === k) || { key: k, title: k, step: 0 };

export const TIERS = TIER_AR;

// مهلة «أعد إرسال الرمز» في خطوة الرمز، واحدة لدخول المشارك ومنسق الجهة
export const RESEND_SECONDS = 45;

export const PHASES = [
  { key: 'admission', title: PHASE_AR.admission, hint: 'نتعرّف عليك ونحدد نقطة انطلاقك' },
  { key: 'qualification', title: PHASE_AR.qualification, hint: 'تدريب وتطبيق على عملك الحقيقي' },
  { key: 'impact', title: PHASE_AR.impact, hint: 'دعم حتى الاستقلال ثم قياس ما تغيّر' },
];

// طريقة تنفيذ المرحلة كما تظهر للمشارك
export const MODES = {
  in_person: { title: MODE_AR.in_person, icon: '◉' },
  online: { title: MODE_AR.online, icon: '◎' },
  hybrid: { title: MODE_AR.hybrid, icon: '◐' },
  self: { title: MODE_AR.self, icon: '○' },
};

