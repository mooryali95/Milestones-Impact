// ════════════════════════════════════════════════════════════════
// خصوصية المشارك: ما يدخل نسخة بياناته وما يُحجب منها (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لقائمة الجداول التي تحمل بيانات المشارك. جدول جديد فيه participant_id يُضاف هنا،
// واختبار privacy.test.js يفشل إن ظهر في المخطط جدول بهذا العمود ولم يُذكر هنا ولا في المستثنى.

// الجداول التي تُصدَّر بعمود المشارك فيها. القيمة: الأعمدة المحجوبة من ذلك الجدول فوق الحجب العام.
export const EXPORT_TABLES = {
  // رموز الرعاية: متى استُخدم رمز لربط المشارك بجهته (معرّف الرمز محجوب، والجهة ظاهرة في ملفه)
  sponsor_code_uses: ['code_id'],
  enrollments: [], placements: ['admin_note'], assessments: ['retake_requested_by'], entitlements: ['granted_by', 'revoked_by'], payments: ['customer_id', 'admin_note'],
  participant_requirements: ['reviewed_by'], participant_milestones: [], participant_stage_overrides: [],
  // فتح الخدمات (20261128150000): متى فُتحت الاستشارة له ولماذا
  service_unlocks: [],
  // سجل إلحاقه بدفعة ومصدره (20261128160000): من أُلحق به ومتى. بريد المدير المنفّذ داخلي
  cohort_placements: ['actor'],
  handbook_progress: [], handbook_views: [], handbook_exports: [], reading_progress: [], video_progress: [], content_progress: [],
  lab_attempts: [], lab_grants: [], model_submissions: [], katon_answers: [], points_ledger: [],
  capstones: ['reviewed_by', 'approved_by'], capstone_updates: [], capstone_shares: [], capstone_share_notes: ['ip_hash'], certificates: ['issued_by', 'revoked_by'], reports: [],
  coaching_sessions: ['confirmed_by'], expert_requests: ['created_by', 'tried'], expert_ratings: [], peer_requests: ['closed_by'],
  cohort_group_members: [], cohort_roles: [], hall_presence: [],
  // سبب التسجيل اليدوي (note، 20261119110000) ملاحظة داخلية يكتبها المدير أو المدرب: لا تخرج، ويخرج الحضور وطريقته ووقته كما كان
  workshop_attendance: ['note'],
  // التزاماته بعد الورش ومراجعتها (20261129200000، تصور المرحلة 3): ملك له كاملًا
  workshop_commitments: [],
  sponsor_requests: ['decided_by'],
  // التذكيرات التي وصلته (nudges.ts): نصها ومرسلها ومرحلتها. بريد المدير المرسل ولقطة القياس الداخلية لا يخرجان
  nudges: ['sender_ref', 'snapshot'],
  // محادثته مع «التوجيه والإرشاد» (guide.ts): السؤال والرد والحكم والمصدر. النموذج والرموز والكلفة داخلية
  guidance_messages: ['model', 'input_tokens', 'cache_read_tokens', 'output_tokens', 'cost_micros'],
  // المقيّمون: ما أدخله المشارك عنهم وحالة الدعوة. إجاباتهم وتعليقاتهم سرية لأصحابها فلا تخرج
  raters: ['answers', 'comment', 'verification', 'verification_flags', 'verified_by'],
  // التقييم الختامي: القرار والدرجة. أصوات المقيّمين وأسماؤهم لا تخرج
  // والمسودة وتعديلات المقيّمين ولقطة الحساب داخلية: يخرج المعتمد وحده بقراره ودرجته (exportable)
  final_evaluations: ['votes', 'submitted_by', 'adjust', 'snapshot'],
  auth_sessions: [], passkeys: [],
  // بريده البديل (20261128190000): بريد ثانٍ رُبط بحسابه فيدخل به إليه. مصدر الربط داخلي
  participant_emails: ['source'],
  // مركز الرسائل (20261128200000): ما وصله من إشعارات وحالة قراءتها، وفئات البريد التي كتمها. ملك له، ويُمسح مع «أعد من البداية»
  // والجدولان نفساهما يحملان صندوق الخبير والمنسق وتفضيلاتهما (20261129130000): التصدير بعمود participant_id وحده فلا تخرج صفوفهم
  // في نسخة المشارك، وما كتب عنه في صندوق خبير (about_participant_id) ملك الخبير ويُمحى بحذف حسابه (on delete cascade)
  participant_notifications: [], participant_mail_prefs: [],
  // سجل المسار و«جديد في مستواك» (20261129120000): متى تغيّر مساره وما أضيف إليه، وما لم يره بعد. من اعتمد التغيير داخلي
  participant_track_history: ['decided_by'], participant_new_items: [],
  // سجل الدمج (participant_merges وparticipant_merge_rows) ونسخة الترحيل backup_20261128_account_merge لا تُصدَّر (داخلية)، ويمحوها
  // حذف المشارك: السجل بمفتاحه الأجنبي، والنسخة والحساب المدموج فيه بمشغّل participant_merge_erase قبل الحذف (erasure_purge وغيرها)
  // ونسخة ترحيل تنظيف المجموعات backup_20261129_group_members_cleanup (20261129250000): عضويات مجموعات قديمة حُذفت بعد النقل،
  // داخلية لا تُصدَّر، وتُمحى مع حذف المشارك بمفتاحها الأجنبي (on delete cascade)
  // ونسخة ترحيل الدفعة الواحدة backup_20261129_single_cohort (20261129230000): إلحاقات سُحبت لأنها ثانية، ومن أُلحق بالتعبئة،
  // داخلية لا تُصدَّر، وتُمحى مع حذف المشارك بمفتاحها الأجنبي (on delete cascade)
};
// أعمدة ترحيلات لم تُطبَّق بعد فليست في المخطط المرجعي (baseline.sql): تُحجب من الآن، وتنتقل إلى EXPORT_TABLES
// حين يلتقطها المخطط. تقييم 360 (20261111130000): الأسئلة المفتوحة وسؤال الصلة وحجب الإدارة سرية لأصحابها
export const EXPORT_HIDDEN_PENDING = { raters: ['open_answers', 'contact_freq', 'comment_hidden'] };
// تقييم 360 (20261111130200): دورة المشارك وتقديره الذاتي وخطته ملك له، تُقرأ في privacy.ts بأعمدتها هذه وحدها
// (من اعتمد القائمة وسلّم التقرير لا يخرج)، وغياب الجدول قبل ترحيله لا يفشل النسخة
export const EXPORT_FEEDBACK_COLUMNS = 'wave, status, self_answers, self_submitted_at, submitted_at, opens_at, closes_at, closed_at, released_at, plan, plan_at, created_at';
// جداول فيها participant_id ولا تُصدَّر، وسبب كل منها
export const EXPORT_SKIPPED = {
  webauthn_challenges: 'تحديات دخول مؤقتة تنتهي بدقائق ولا تحمل بيانات',
  erasure_requests: 'تُعرض حالته في me.privacy',
  feedback_cycles: 'يُصدَّر بأعمدة EXPORT_FEEDBACK_COLUMNS وحدها في privacy.ts لا بالتصدير العام',
  participant_observations: 'يُصدَّر منه المرئي للمشارك وحده في privacy.ts (الملاحظات الداخلية للإدارة لا تخرج)',
  workshop_scan_receipts: 'إيصال مسح مؤقت (ربع ساعة) أثره الحضور نفسه، وهو يُصدَّر في workshop_attendance، ويُحذف بعد انتهائه بيوم',
};

// حجب عام في كل جدول: الرموز وبصماتها ومفاتيح الدخول. لا تفيد صاحبها وتضر إن تسربت
const SECRET = /(token|_hash$|^signature$|^public_key$|^credential_id$|^sign_count$|^aaguid$)/;
export const isSecretColumn = (name) => SECRET.test(String(name));

// صفوف لا تخرج أصلًا، وأعمدة تُحجب بحسب الصف، فوق حجب الأعمدة:
// - تقييم الخبير للمشارك (to_participant) لا يُعرض له في أي موضع، فلا يخرج في نسخته. تقييمه هو للخبير ملكه فيخرج.
// - التقييم الختامي قبل اعتماده مسودة داخلية.
// - مقيّمو 360: يخرج من سمّاهم، ولا يخرج من استجاب منهم ومتى (الوعد: أعداد لا أسماء).
export function exportable(table, row) {
  if (table === 'expert_ratings') return row?.direction === 'to_expert';
  if (table === 'final_evaluations') return row?.status === 'approved';
  return true;
}
const F360_RATER_HIDDEN = ['status', 'opened_at', 'submitted_at', 'verified_at'];
// إجابات القياس: للقياس المُرسَل وحده، وبلا درجة السؤال. الدرجة أثناء القياس تكشف مفتاح الإجابة سؤالًا سؤالًا
export const EXPORT_ANSWER_COLUMNS = 'assessment_id, question_id, value, answered_at';
export const answersExportable = (assessment) => assessment?.status === 'submitted';

export function scrubRow(table, row) {
  const extra = new Set([...(EXPORT_TABLES[table] || []), ...(EXPORT_HIDDEN_PENDING[table] || [])]);
  const out = {};
  if (table === 'raters' && row?.phase === 'f360') for (const k of F360_RATER_HIDDEN) extra.add(k);
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
