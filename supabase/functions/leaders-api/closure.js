// ════════════════════════════════════════════════════════════════
// المرحلة الخامسة: سجل قرارات البوابات، وتقرير إغلاق المبادرة (منطق خالص، عرضان مولّدان)
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-بناء-المبادرة-وحالة-العمل-v1.md (م5). لا جدول ولا حقل جديد:
//   سجل القرارات يُقرأ من سجل التدقيق (audit_log، لا يُعدَّل ولا يُحذف) ومن لحظة الاعتماد في الوثيقة نفسها.
//   تقرير الإغلاق يُبنى من الوثيقة المعتمدة (الخطة)، ومن المتابعة (الفعلي)، ومن فصلي تقرير الأثر وقصة التحول (الدروس).
// لا يظهر في السجل بريد أحد ولا اسمه: الدور وحده (القائد، المستشار، الراعي).

import { CHECKPOINT_STATUS_AR } from './tracking.js';

const ROLE = { participant: 'القائد', admin: 'المستشار', coordinator: 'منسق الجهة' };

// كل فعل في سجل التدقيق يخص البوابات: البوابة، ونص القرار، ومن اتخذه
const GATES = {
  'submission.review': (e) => (e.after?.status === 'returned'
    ? { gate: 'بوابة البطاقة', decision: 'أعاد بطاقة المبادرة للتحسين', by: ROLE.admin }
    : { gate: 'بوابة البطاقة', decision: 'اعتمد اختيار المبادرة', by: ROLE.admin }),
  'capstone.submit': () => ({ gate: 'بوابة الاعتماد', decision: 'سلّم الوثيقة للمراجعة', by: ROLE.participant }),
  'capstone.return': (e) => ({ gate: 'بوابة الاعتماد', decision: `أعاد الوثيقة للتحسين${e.after?.revisions ? ` (التحسين ${e.after.revisions})` : ''}`, by: ROLE.admin }),
  'capstone.accept': (e) => ({ gate: 'بوابة الاعتماد', decision: `قبل الوثيقة بمعيار${e.after?.score != null ? ` ${e.after.score} من 100` : 'ه'}`, by: ROLE.admin }),
  'capstone.sponsor-invite': () => ({ gate: 'بوابة الاعتماد', decision: 'أُرسل طلب التأييد إلى الراعي', by: ROLE.admin }),
  'capstone.sponsor-endorse': () => ({ gate: 'بوابة الاعتماد', decision: 'أيّد المبادرة', by: 'الراعي' }),
  'capstone.sponsor-decline': () => ({ gate: 'بوابة الاعتماد', decision: 'طلب تعديلًا قبل التأييد', by: 'الراعي' }),
  'capstone.approve-waived': () => ({ gate: 'بوابة الاعتماد', decision: 'اعتمد الوثيقة دون تأييد الراعي', by: ROLE.admin }),
  'tracking.checkpoint': (e) => ({ gate: e.after?.checkpoint === 'd180' ? 'مراجعة اليوم 180' : 'مراجعة اليوم 90', decision: 'أرسل أرقام المراجعة للتأكيد', by: ROLE.participant }),
  'tracking.verify-confirmed': () => ({ gate: 'مراجعة الأثر', decision: 'أكّد أرقام المراجعة', by: 'الراعي' }),
  'tracking.verify-disputed': () => ({ gate: 'مراجعة الأثر', decision: 'اعترض على أرقام المراجعة', by: 'الراعي' }),
};
export const GATE_ACTIONS = Object.freeze(Object.keys(GATES));

/**
 * سجل قرارات البوابات بترتيب زمني
 * @param {{ action: string, created_at: string, after?: any }[]} events صفوف سجل التدقيق
 * @param {{ approved_at?: string | null }} [capstone] لحظة الاعتماد من الوثيقة نفسها
 */
export function gateDecisions(events = [], capstone = {}) {
  const out = (events || []).filter((e) => GATES[e.action]).map((e) => ({ at: e.created_at, ...GATES[e.action](e) }));
  if (capstone?.approved_at) out.push({ at: capstone.approved_at, gate: 'بوابة الاعتماد', decision: 'اعتُمدت الوثيقة', by: 'المنصة' });
  return out.filter((x) => x.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// ── تقرير الإغلاق ──
const text = (doc, key, field) => {
  const v = (doc?.sections || []).find((s) => s.key === key)?.fields?.find((f) => f.key === field)?.value;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/**
 * تقرير إغلاق المبادرة: ما سُلّم، وما تحقق من المنافع، وما لم يتحقق ولماذا، ومن يشغّل، والدروس، وتأكيد الراعي.
 * يُبنى للوثيقة المعتمدة التي لها متابعة، ويكون نهائيًا حين يؤكد الراعي مراجعة اليوم 180 أو تنتهي المتابعة.
 */
export function closureData(doc) {
  const t = doc?.tracking;
  if (doc?.meta?.status !== 'approved' || !t?.summary) return null;
  const s = t.summary;
  const d180 = (s.checkpoints || []).find((c) => c.key === 'd180') || null;
  const final = d180?.status === 'verified' || s.health === 'closed';
  const milestones = t.state?.milestones || [];
  const benefits = (t.state?.benefits || []).map((b) => ({ title: b.title, baseline: b.baseline ?? null, target: b.target ?? null, value: b.value ?? null,
    pct: b.realization == null ? null : Math.round(b.realization * 100) }));
  return {
    final,
    status: final ? 'نهائي' : `مؤقت حتى ${d180 ? 'مراجعة اليوم 180' : 'نهاية المتابعة'}`,
    delivered: { done: s.milestones?.done ?? 0, total: s.milestones?.total ?? milestones.length, on_time: s.milestones?.on_time ?? null },
    realization: s.benefits?.realization ?? null,
    benefits,
    open: milestones.filter((m) => m.status !== 'done' && m.status !== 'dropped').map((m) => m.title),
    dropped: milestones.filter((m) => m.status === 'dropped').map((m) => m.title),
    not_achieved: text(doc, 'impact-report', 'not_achieved'),
    handover: text(doc, 'change-sustain', 'handover'),
    operator: text(doc, 'initiative-charter', 'operator'),
    sustain: text(doc, 'change-sustain', 'sustain'),
    lessons: [text(doc, 'impact-report', 'lessons'), text(doc, 'transformation-story', 'lessons')].filter(Boolean),
    sponsor: d180 ? ((d180.status === 'submitted' && d180.verify_title) || CHECKPOINT_STATUS_AR[d180.status] || null) : null,
  };
}
