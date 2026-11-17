// ════════════════════════════════════════════════════════════════
// جاهزية الجهة: هل الجهة جاهزة لتستقبل مشاركيها وتتابعهم؟ (منطق خالص بلا واجهة)
// ════════════════════════════════════════════════════════════════
// لا يخزّن شيئًا ولا يكرر قاعدة: الحالة والرابط والعقد والشعار من صف الجهة نفسه، والمنسق من orgAccessState
// (قائمة الجهات)، والدفعة وجاهزيتها من admin.org-journey (pickCohort وcohortSetup نفسيهما)، والاعتماد من قمع الجهة.
// المستوى الثاني من ثلاثة: المنظومة ← الجهة ← الدفعة. تفاصيل الدفعة في ملفها، وهنا بند واحد يقود إليه.

// قواعد الجاهزية نفسها في الخادم (org-readiness.js)، يقرؤها رأس ملف الجهة وتنبيهات «مكتب اليوم»
export { orgReadiness, orgReadinessOf, readinessSummary, seatsFull } from '../../supabase/functions/leaders-api/org-readiness.js';

// المقاعد المستهلكة من مصدرها الواحد: seats_used من admin.orgs (seatsUsed في entitlements.ts: إعفاء حي من الجهة).
// تعذّر عدّها في الخادم يرسلها فارغة، فيُعرض عدد الأعضاء بدلها كما كان
export const seatsUsedOf = (o, members = 0) => o?.seats_used ?? members;

// سطر المقاعد في بطاقة الجهة ورأس ملفها: «31 من 50» بالمستهلك من العقد، وبلا مقاعد في العقد عدد المشاركين
export function seatsView(o, members = 0) {
  if (!o?.seats) return { label: 'المشاركون', value: String(members), hint: 'بلا حد في العقد', pct: null };
  const used = seatsUsedOf(o, members);
  return { label: 'المقاعد', value: `${used} من ${o.seats}`, hint: null, pct: Math.min(100, (used / o.seats) * 100) };
}

