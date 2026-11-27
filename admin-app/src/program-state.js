import { countAr } from '../../supabase/functions/leaders-api/labels.js';
// حالة البرامج في شاشة «البرامج والدفعات» (المرحلة 11): دوال خالصة تقرأ رد admin.programs القائم، بلا طلب ولا ترحيل.
// versionState: شارة نسخة واحدة بدل ثلاث متنافسة، بالأولوية: مؤرشف، بلا متطلبات، بلا نسخة، مسودة معدلة، محفوظ.
export function versionState(p) {
  if (!p) return 'no_reqs';
  if (p.archived_at) return 'archived';
  if (!Number(p.requirements)) return 'no_reqs';
  if (!(p.versions || []).length) return 'no_version';
  if (p.draft_changed) return 'draft';
  return 'saved';
}
// زر «احفظ نسخة» بجانب الشارة: حيث يغيّر الحفظ شيئًا (مسودة معدلة أو بلا نسخة بعد)
export const canSaveVersion = (state) => state === 'draft' || state === 'no_version';
// سطر الملخص: عدد البرامج الفعالة بمسودة غير محفوظة (المؤرشف لا يُعد)
export function draftCount(programs = []) {
  return programs.filter((p) => versionState(p) === 'draft').length;
}
export function draftSummaryAr(n) {
  return n ? `${countAr(n, 'برنامج واحد', 'برنامجان', 'برامج', 'برنامجًا')} بمسودة غير محفوظة` : '';
}
// الفعّال أولًا بترتيبه، والمؤرشف في قسمه آخر الصفحة
export function splitArchived(programs = []) {
  return { active: programs.filter((p) => !p.archived_at), archived: programs.filter((p) => p.archived_at) };
}
// طي شرح الخطوات: مفتوح حين لا برامج (من البيانات، فيعمل ولو مُسح التخزين)، وإلا تفضيل المدير اليدوي، والافتراضي مطوي
export const HOW_KEY = 'la.programs.how';
export function howOpen(count, stored) {
  if (!count) return true;
  return stored === '1';
}
export function readHow() {
  try { return window.localStorage.getItem(HOW_KEY); } catch { return null; }
}
export function writeHow(open) {
  try { window.localStorage.setItem(HOW_KEY, open ? '1' : '0'); } catch { /* التفضيل اختياري */ }
}
