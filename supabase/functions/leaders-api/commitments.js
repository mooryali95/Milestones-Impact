// ════════════════════════════════════════════════════════════════
// حلقة الالتزام بعد الورشة (تصور المرحلة 3 §5.2، اعتمده المالك 2026-11-26): منطق خالص بلا قاعدة
// ════════════════════════════════════════════════════════════════
// عند تسجيل الحضور سؤال واحد: الفعل والموعد. بعد 14 يومًا تذكير واحد بسؤال «طبقته؟» بثلاثة خيارات وسطر «ماذا تعلمت».
// المنجز يُقترح صفًا في جدول الأنشطة من وثيقة المبادرة بنقرة، والمستشار يرى «طبّق» و«لم يطبق» لحديث الجلسة.
// ليس بند رحلة ولا نوع متطلب: لا يحبس مرحلة ولا يدخل نسبة التقدم (منطق الرحلة في logic.js لا يقرؤه).
// المصدر الواحد: جدول leaders.workshop_commitments (20261129200000)، والنقاط في logic.js (POINTS.commitment وcommitmentReview).
import { meaningful, TEXTAREA_MIN } from './logic.js';

export const COMMITMENT_REVIEW_DAYS = 14;
export const COMMITMENT_OUTCOMES = ['yes', 'partial', 'no'];
export const COMMITMENT_OUTCOME_AR = { yes: 'نعم', partial: 'جزئيًا', no: 'لا' };
export const COMMITMENT_Q_AR = 'ما الشيء الواحد الذي ستطبقه في عملك خلال أسبوعين؟ ومتى؟';
export const COMMITMENT_REVIEW_Q_AR = 'طبقته؟';
export const COMMITMENT_LEARNED_AR = 'ماذا تعلمت';
// جدول الأنشطة في فصل الجدول الزمني من وثيقة المبادرة: الرمز، النشاط، البداية، النهاية، يعتمد على
export const COMMITMENT_STEP_FIELD = 'activities';

const DAY = 86400e3;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// يُطفأ من إعداد البرنامج (settings.commitments.enabled = false)، ومفعّل ما لم يُطفأ صراحة
export const commitmentsOn = (/** @type {any} */ settings) => settings?.commitments?.enabled !== false;

// الفعل بحد حقول النماذج (له معنى)، والموعد تاريخ من أمس إلى ستين يومًا
/** @param {any} b @param {number} [now] */
export function cleanCommitment(b, now = Date.now()) {
  const action = String(b?.action ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!meaningful(action, TEXTAREA_MIN)) return { error: 'اكتب الشيء الذي ستطبقه في جملة واضحة' };
  const due = String(b?.due_on ?? '').trim();
  const t = ISO_DATE.test(due) ? Date.parse(`${due}T12:00:00Z`) : NaN;
  if (!Number.isFinite(t)) return { error: 'اختر موعدًا للتطبيق' };
  if (t < now - 2 * DAY || t > now + 60 * DAY) return { error: 'اختر موعدًا خلال الأسابيع القادمة' };
  return { action, due_on: due };
}

/** @param {any} b */
export function cleanReview(b) {
  const outcome = String(b?.outcome ?? '');
  if (!COMMITMENT_OUTCOMES.includes(outcome)) return { error: 'اختر: نعم أو جزئيًا أو لا' };
  return { outcome, learned: String(b?.learned ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000) || null };
}

// المراجعة مفتوحة ما لم تُسجَّل، والتذكير مرة واحدة بعد 14 يومًا من الكتابة
export const reviewOpen = (/** @type {any} */ row) => !!row && !row.reviewed_at;
/** @param {any} row @param {number} [now] */
export const reviewDue = (row, now = Date.now()) => reviewOpen(row) && !row.reminded_at
  && now - Date.parse(row.created_at) >= COMMITMENT_REVIEW_DAYS * DAY;

// صف جدول الأنشطة لما طُبّق كليًا أو جزئيًا، وnull لما لم يُطبَّق أو لم يُراجَع
/** @param {any} row @param {number} cols */
export function commitmentStepRow(row, cols) {
  if (!['yes', 'partial'].includes(row?.outcome)) return null;
  const out = ['', String(row.action || ''), String(row.due_on || ''), String(row.due_on || ''), ''];
  return Array.from({ length: Math.max(1, cols) }, (_, i) => out[i] ?? '');
}

// لشاشة المستشار: من طبّق ومن لم يطبق ومن ينتظر المراجعة (أسلوب حالة النجاح)
/** @param {any[]} rows */
export function coachBuckets(rows) {
  const list = rows || [];
  return {
    applied: list.filter((r) => r.outcome === 'yes' || r.outcome === 'partial'),
    not_applied: list.filter((r) => r.outcome === 'no'),
    pending: list.filter((r) => !r.outcome),
  };
}
