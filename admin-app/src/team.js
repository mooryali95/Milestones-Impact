// ════════════════════════════════════════════════════════════════
// فريق الدفعة في اللوحة: صياغة واحدة للحمل والنطاق والحالة والتغطية
// ════════════════════════════════════════════════════════════════
// يقرؤها تبويب «الفريق» في الدفعة، وقسم الفريق في صفحة الجهة، و«تكليفاته» في ملف الخبير، فلا يُكتب السطر نفسه ثلاث مرات.
import { countAr, EXPERT_ROLE_AR, EXPERT_STATUS } from '../../supabase/functions/leaders-api/labels.js';
import { cohortPeriodAr } from '../../supabase/functions/leaders-api/logic.js';

export const roleAr = (r) => EXPERT_ROLE_AR[r]?.[0] || r;
export const rolesAr = (rs) => (rs || []).map(roleAr).join('، ');
export const APPROVED = ['active', 'paused'];
const cohortsAr = (n) => countAr(n, 'دفعة واحدة', 'دفعتين', 'دفعات', 'دفعة');
export const peopleAr = (n) => countAr(n, 'مشارك واحد', 'مشاركان', 'مشاركين', 'مشاركًا');
export const expertsAr = (n) => countAr(n, 'خبير واحد', 'خبيران', 'خبراء', 'خبيرًا');
const groupsAr = (n) => countAr(n, 'مجموعة واحدة', 'مجموعتان', 'مجموعات', 'مجموعة');

// مدة الدفعة، وهي مدة التكليف فيها (الصياغة نفسها في بريد التكليف وبوابة الخبير)
export const periodAr = cohortPeriodAr;

// الحمل بنظرة: الساعات المشغولة من المعلنة أسبوعيًا (طلب قائم أو جلسة قادمة = ساعة)، وعدد الدفعات غير المغلقة
export function loadText(load) {
  if (!load) return '';
  const hours = load.hours > 0 ? `الحمل ${load.used}/${load.hours} ساعة أسبوعيًا` : 'لم يعلن ساعاته الأسبوعية';
  return `${hours} · ${load.cohorts ? `مكلّف في ${cohortsAr(load.cohorts)}` : 'بلا تكليف في دفعة قائمة'}`;
}
// تجاوز السعة تنبيه لا منع (قرار المالك 2026-11-11)
export const OVER_AR = 'بلغ سعته المعلنة أو تجاوزها. التكليف ممكن، وهذا تنبيه فقط';

// ما يحمله الخبير في هذه الدفعة
export function scopeText(row) {
  const parts = [];
  if (row.advisor) parts.push('المستشار الأساسي');
  if (row.groups?.length) parts.push(`خبير ${row.groups.map((g) => g.name).join('، ')}`);
  if (!parts.length) parts.push('عضو الفريق');
  return parts.join(' · ');
}
// حالة ملفه: المعتمد يعمل، وغيره لا يحمل صلاحية حتى يُعتمد
export function statusChip(status) {
  if (status === 'active') return ['معتمد', 'ok'];
  if (status === 'paused') return ['متوقف مؤقتًا', 'warn'];
  if (status === 'invited') return ['مدعو، لم يُعتمد بعد', 'warn'];
  if (status === 'applied') return ['بانتظار اعتماد ملفه', 'warn'];
  return [EXPERT_STATUS[status] || status, 'bad'];
}
// ما ينقص تغطية الدفعة: من بلا مستشار فعلي، والمجموعات بلا خبير، ومن بلا مجموعة
export function coverageNotes(cv) {
  if (!cv) return [];
  const out = [];
  if (cv.without_advisor) out.push(`${peopleAr(cv.without_advisor)} بلا مستشار فعلي (تراجع الإدارة أعمالهم)`);
  if (cv.groups_without_expert) out.push(`${groupsAr(cv.groups_without_expert)} بلا خبير، فيتبع أعضاؤها مستشار الدفعة`);
  if (cv.groups && cv.ungrouped) out.push(`${peopleAr(cv.ungrouped)} بلا مجموعة`);
  return out;
}
// ترتيب البحث في «أضف إلى الفريق»: من يحمل الدور المطلوب، ثم من لم يبلغ سعته، ثم الأقل حملًا
export function rankForAdd(experts, { q = '', role = '' } = {}) {
  const s = q.trim().toLowerCase();
  return (experts || [])
    .filter((e) => !s || `${e.full_name} ${e.title || ''}`.toLowerCase().includes(s))
    .map((e) => ({ e, k: [role && !(e.roles || []).includes(role) ? 1 : 0, e.load?.full ? 1 : 0, e.load?.used || 0] }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || String(a.e.full_name).localeCompare(String(b.e.full_name), 'ar'))
    .map((x) => x.e);
}
