// ════════════════════════════════════════════════════════════════
// خصوصية المشارك: ما يدخل نسخة بياناته وما يُحجب منها (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لقائمة الجداول التي تحمل بيانات المشارك. جدول جديد فيه participant_id يُضاف هنا،
// واختبار privacy.test.js يفشل إن ظهر في المخطط جدول بهذا العمود ولم يُذكر هنا ولا في المستثنى.

// الجداول التي تُصدَّر بعمود المشارك فيها. القيمة: الأعمدة المحجوبة من ذلك الجدول فوق الحجب العام.
export const EXPORT_TABLES = {
  enrollments: [], placements: [], assessments: [], entitlements: ['granted_by', 'revoked_by'], payments: ['customer_id'],
  participant_requirements: ['reviewed_by'], participant_milestones: [], participant_stage_overrides: [],
  handbook_progress: [], handbook_views: [], handbook_exports: [], reading_progress: [], video_progress: [], content_progress: [],
  lab_attempts: [], lab_grants: [], model_submissions: [], katon_answers: [], points_ledger: [],
  capstones: ['reviewed_by', 'approved_by'], capstone_updates: [], certificates: ['issued_by', 'revoked_by'], reports: [],
  coaching_sessions: ['confirmed_by'], expert_requests: ['created_by'], expert_ratings: [], peer_requests: ['closed_by'],
  cohort_group_members: [], cohort_roles: [], hall_presence: [], workshop_attendance: [],
  sponsor_requests: ['decided_by'],
  // المقيّمون: ما أدخله المشارك عنهم وحالة الدعوة. إجاباتهم وتعليقاتهم سرية لأصحابها فلا تخرج
  raters: ['answers', 'comment', 'verification', 'verification_flags', 'verified_by'],
  // التقييم الختامي: القرار والدرجة. أصوات المقيّمين وأسماؤهم لا تخرج
  final_evaluations: ['votes', 'submitted_by'],
  auth_sessions: [], passkeys: [],
};
// جداول فيها participant_id ولا تُصدَّر، وسبب كل منها
export const EXPORT_SKIPPED = {
  webauthn_challenges: 'تحديات دخول مؤقتة تنتهي بدقائق ولا تحمل بيانات',
  erasure_requests: 'تُعرض حالته في me.privacy',
};

// حجب عام في كل جدول: الرموز وبصماتها ومفاتيح الدخول. لا تفيد صاحبها وتضر إن تسربت
const SECRET = /(token|_hash$|^signature$|^public_key$|^credential_id$|^sign_count$|^aaguid$)/;
export const isSecretColumn = (name) => SECRET.test(String(name));

export function scrubRow(table, row) {
  const extra = new Set(EXPORT_TABLES[table] || []);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) if (!isSecretColumn(k) && !extra.has(k)) out[k] = v;
  return out;
}

export const EXPORT_PER_DAY = 3;
export const EXPORT_ROW_CAP = 5000;

// طلب الحذف: السبب اختياري ومحدود، ولا يُقبل طلب ثانٍ ومعه طلب قائم
export const ERASE_REASON_MAX = 500;
export const cleanReason = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, ERASE_REASON_MAX) || null;
// المهلة النظامية للرد (نظام حماية البيانات الشخصية: 30 يومًا)
export const ERASE_REPLY_DAYS = 30;
export const eraseDue = (createdAt) => new Date(Date.parse(createdAt) + ERASE_REPLY_DAYS * 864e5).toISOString();

export function eraseView(row) {
  if (!row) return null;
  return { id: row.id, status: row.status, created_at: row.created_at, due_at: eraseDue(row.created_at), reason: row.reason ?? null };
}
