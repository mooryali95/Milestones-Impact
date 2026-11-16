// ════════════════════════════════════════════════════════════════
// جدول توجيه الإشعارات: المصدر الواحد لـ«أين يصل كل إشعار للإدارة»
// ════════════════════════════════════════════════════════════════
// تصور مركز الإشعارات (docs/ops/2026-11-16-تصور-مركز-الإشعارات-v1.md، الأقسام 4 و5 و6). وحدة نقية بلا شبكة ولا قاعدة،
// على نمط mail-budget.js: تقرؤها الدوال (leaders-api اليوم، وadmin-api وuser-api وsend-otp وagent-chat في المراحل التالية)،
// وتستوردها لوحة الإدارة لرسم المركز (المرحلة 4). وroute هي الموضع الوحيد الذي يقرر القناة، فلا يبقى في أي دالة شرط
// توجيه خاص بنوع (كاستثناء mail_queue_stuck القديم في raiseAlert).
//
// الطبقات (القسم 4):
// - critical (حرج): أمن ومال وفقد بيانات والتزام نظامي وتعطل يمنع الدخول. بريد وSlack معًا دائمًا.
// - important (مهم): خطأ تشغيلي يحتاج تصرفًا اليوم. Slack فورًا، والبريد احتياط عند فشل Slack أو غيابه.
// - info (معلوماتي): نشاط وطلبات تُعالج في يوم العمل. الملخص اليومي.
// - log (سجل فقط): لا يُرسل، ويبقى في سجل التدقيق.
//
// «Slack» هنا قناة التشغيل غير البريد: سلسلة التنبيهات في Slack أو رابط التنبيه (LEADERS_ALERT_WEBHOOK)، فكلاهما قناة
// كافية (readiness.js ALERT_CHANNELS). وحالها في الإرسال الواحد إحدى ثلاث (SLACK_STATES):
// - ok: وصل السطر من إحداهما.
// - failed: إحداهما مضبوطة ولم يصل منها شيء (رفض أو مهلة أو توقف بعد 429).
// - unconfigured: لا شيء منهما مضبوط.
// وأي حال غير معروفة تُعامل «failed»: الشك يرسل البريد ولا يُسكت تنبيهًا.
//
// الصف المقفل (locked): بريده لا يُطفأ مهما كان الإعداد المخزن (رسائل الأمان والمال والحذف). والقنوات المسموحة (allow)
// تحذف ما لا يليق بالحدث: مفتاح المساعد مثلًا لا بريد احتياطيًا له، لأن بريد الملاك الأمني (agent_key_mail) يغطيه.

export const TIERS = ['critical', 'important', 'info', 'log'];
export const TIER_AR = { critical: 'حرج', important: 'مهم', info: 'معلوماتي', log: 'سجل فقط' };
export const CHANNELS = ['email', 'slack', 'digest'];
export const CHANNEL_AR = { email: 'بريد', slack: 'Slack فوري', digest: 'الملخص اليومي', log: 'السجل فقط' };
export const SLACK_STATES = ['ok', 'failed', 'unconfigured'];
export const CATEGORIES = {
  security: 'الأمان والخصوصية',
  money: 'المال',
  ops: 'التشغيل',
  requests: 'الطلبات',
  activity: 'النشاط',
};

// الإعدادات الجاهزة (6.2). القيمة لكل طبقة القنوات المطلوبة حين يعمل Slack، والتحويل عند فشله في route
const ES = { email: true, slack: true };
export const PRESETS = {
  quiet: { label: 'هادئ', tiers: { critical: ES, important: { slack: true }, info: {}, log: {} } },
  balanced: { label: 'متوازن', tiers: { critical: ES, important: { slack: true }, info: { digest: true }, log: {} } },
  all: { label: 'كل شيء', tiers: { critical: ES, important: ES, info: { slack: true }, log: { digest: true } } },
};
// قرار المالك 2026-11-16 (القسم 11)
export const DEFAULT_PRESET = 'balanced';
export const DEFAULT_SETTINGS = Object.freeze({ preset: DEFAULT_PRESET, rows: Object.freeze({}) });

const ALL = ['email', 'slack', 'digest'];
const NO_EMAIL = ['slack', 'digest'];
const ev = (key, category, tier, label, extra = {}) => ({ key, category, tier, label, locked: false, allow: ALL, digest: false, ...extra });

// فهرس الأحداث (جرد القسم 5). المفتاح ثابت: نوع التنبيه في raiseAlert كما هو، أو اسم الحدث للإشعارات التي تمر
// بالوحدة في المراحل التالية. digest: يدخل الملخص اليومي بعدده حين يصل Slack فورًا (طابور عمل)
export const EVENTS = [
  // ── الأمان والخصوصية ──
  ev('owner_login_new_device', 'security', 'critical', 'دخول المالك من جهاز جديد', { locked: true }),
  ev('owner_login_known_device', 'security', 'important', 'دخول المالك من جهاز معروف', { digest: true }),
  ev('admin_security_change', 'security', 'critical', 'تغيير وسيلة الدخول أو الدور أو إضافة حساب إدارة', { locked: true }),
  ev('admin_recovery_request', 'security', 'critical', 'طلب استعادة وصول', { locked: true }),
  ev('admin_access_restored', 'security', 'critical', 'أُعيد وصول حساب إدارة', { locked: true }),
  ev('agent_key_mail', 'security', 'critical', 'بريد الملاك الأمني لتغيير مفتاح المساعد', { locked: true }),
  ev('agent_key_changed', 'security', 'important', 'تغيير مفتاح المساعد (سطر التشغيل)', { allow: NO_EMAIL }),
  ev('agent_key_reverted', 'security', 'important', 'إعادة مفتاح المساعد إلى سر الخادم (سطر التشغيل)', { allow: NO_EMAIL }),
  ev('erase_request', 'security', 'critical', 'طلب حذف بيانات', { locked: true }),
  ev('erase_reminder', 'security', 'critical', 'تذكير بمهلة طلب حذف', { locked: true }),
  ev('erase_files_failed', 'security', 'critical', 'تعذر حذف ملفات مشارك', { locked: true }),
  ev('erase_close_failed', 'security', 'critical', 'تعذر إغلاق طلب حذف', { locked: true }),
  ev('erase_audit_failed', 'security', 'critical', 'تعذر تسجيل حذف في السجل', { locked: true }),
  ev('slack_down', 'ops', 'critical', 'Slack لا يستقبل التنبيهات', { locked: true, allow: ['email'] }),
  // ── المال ──
  ev('payment_mismatch', 'money', 'critical', 'دفعة لا تطابق المطلوب', { locked: true }),
  ev('payment_unmatched', 'money', 'critical', 'دفعة بلا مشارك معروف', { locked: true }),
  ev('creem-webhook', 'money', 'critical', 'خطأ في خطاف الدفع', { locked: true }),
  // قرار المالك: سطر فوري في Slack لكل دفعة، ويدخل الملخص اليومي
  ev('payment_new', 'money', 'important', 'دفعة جديدة', { digest: true }),
  ev('payment_refund', 'money', 'important', 'استرداد دفعة', { digest: true }),
  ev('agent_spend_cap', 'money', 'critical', 'بلغ المساعد سقف إنفاقه اليومي'),
  ev('agent_spend_80', 'money', 'important', 'بلغ المساعد 80% من سقف إنفاقه'),
  ev('agent_ledger_error', 'money', 'critical', 'تعذر تسجيل إنفاق المساعد'),
  // ── التشغيل ──
  ev('mail_failed', 'ops', 'critical', 'تعذر إرسال البريد'),
  ev('mail_unconfigured', 'ops', 'critical', 'خدمة البريد غير مهيأة'),
  ev('mail_cap', 'ops', 'critical', 'بلغ البريد سقفه اليومي'),
  ev('captcha_unconfigured', 'ops', 'critical', 'التحقق البشري غير مهيأ'),
  ev('audit_failed', 'ops', 'critical', 'تعذر الكتابة في سجل التدقيق'),
  ev('cert_key_missing', 'ops', 'critical', 'مفتاح توقيع الشهادات ناقص'),
  ev('certificate_issue', 'ops', 'critical', 'تعذر إصدار شهادة بعد قرار النجاح', { locked: true }),
  ev('agent_model_unknown', 'ops', 'critical', 'نموذج المساعد غير معروف'),
  ev('agent_model_config', 'ops', 'critical', 'إعداد نموذج المساعد غير صالح'),
  ev('weekly_health_action', 'ops', 'critical', 'تقرير الأسبوع وفيه ما يحتاج تدخلًا'),
  ev('internal', 'ops', 'important', 'خطأ داخلي غير معالج'),
  ev('mail_rejected', 'ops', 'important', 'رفض مزود البريد رسالة'),
  ev('mail_counter_unavailable', 'ops', 'important', 'تعذرت قراءة عداد البريد'),
  ev('mail_quota_70', 'ops', 'important', 'تجاوز البريد 70% من حصة اليوم'),
  ev('mail_queue_stuck', 'ops', 'important', 'رسائل عالقة في طابور البريد'),
  ev('mail_queue_carryover', 'ops', 'important', 'رسائل مرحلة إلى الغد بالحصة'),
  ev('booking_not_eligible', 'ops', 'important', 'حجز من غير مؤهل', { digest: true }),
  ev('seat_check_unavailable', 'ops', 'important', 'تعذر فحص المقاعد'),
  ev('leaders-hooks', 'ops', 'important', 'خطأ في خطاف الحجوزات'),
  ev('agent_enabled', 'ops', 'important', 'تشغيل المساعد'),
  ev('agent_disabled', 'ops', 'important', 'إيقاف المساعد'),
  ev('agent_eval_stale', 'ops', 'important', 'تقييم المساعد قديم'),
  ev('alert_test', 'ops', 'important', 'تجربة قناة التنبيه'),
  ev('weekly_health', 'ops', 'important', 'تقرير الأسبوع بلا ما يحتاج تدخلًا'),
  // ── الطلبات ──
  // قرار المالك: طلب التواصل بالبريد وSlack معًا (وعد الرد خلال 4 ساعات عمل)
  ev('contact_request', 'requests', 'critical', 'طلب تواصل جديد أو مساعد يطلب إنسانًا'),
  ev('expert_application', 'requests', 'important', 'طلب انضمام خبير أو عضوية لجنة', { digest: true }),
  ev('expert_no_match', 'requests', 'important', 'لا خبير متاح لطلب'),
  ev('sponsor_request', 'requests', 'important', 'طلب رعاية', { digest: true }),
  ev('seat_limit_owner', 'requests', 'important', 'حدود المقاعد (نسخة المالك)'),
  // ── النشاط ──
  ev('expert_profile_done', 'activity', 'info', 'خبير مدعو استكمل ملفه'),
  ev('matrix_plan', 'activity', 'info', 'خطة مقدمة في مصفوفة التأثير'),
];
export const EVENT_INDEX = Object.freeze(Object.fromEntries(EVENTS.map((e) => [e.key, Object.freeze(e)])));

// نوع لا يعرفه الفهرس (تنبيه جديد لم يُضف بعد): «مهم»، فيصل Slack، والبريد احتياطه إن فشل. لا يُسكت ولا يُغرق البريد
export const UNKNOWN_TIER = 'important';
// النوع بلاحقة معرّف (booking_not_eligible:<id>) يأخذ صف أصله
export function eventOf(kind) {
  if (kind && typeof kind === 'object') return kind;
  const k = String(kind ?? '');
  const hit = EVENT_INDEX[k] ?? EVENT_INDEX[k.split(':')[0]];
  return hit ?? { key: k, category: 'ops', tier: UNKNOWN_TIER, label: k, locked: false, allow: ALL, digest: false, unknown: true };
}

// الإعداد المخزن (leaders.app_settings، المفتاح notifications، المرحلة 4): الإعداد الجاهز وما عُدّل من صفوف فقط.
// ما لا يُفهم منه يسقط إلى الافتراضي، فتعذّر القراءة أو قيمة تالفة يطبقان «متوازن»
export function normalizeSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const preset = Object.hasOwn(PRESETS, s.preset) ? s.preset : DEFAULT_PRESET;
  const rows = {};
  if (s.rows && typeof s.rows === 'object') {
    for (const [key, row] of Object.entries(s.rows)) {
      if (!Object.hasOwn(EVENT_INDEX, key) || !row || typeof row !== 'object') continue;
      rows[key] = Object.fromEntries(CHANNELS.map((c) => [c, row[c] === true]));
    }
  }
  return { preset, rows };
}

// القنوات المطلوبة للحدث بالإعداد وحده، قبل حال Slack
export function wanted(event, settings = DEFAULT_SETTINGS) {
  const e = eventOf(event);
  const s = normalizeSettings(settings);
  const row = s.rows[e.key];
  const base = row ?? PRESETS[s.preset].tiers[e.tier] ?? PRESETS[s.preset].tiers[UNKNOWN_TIER];
  const want = { email: !!base.email, slack: !!base.slack, digest: !!base.digest || (!row && !!base.slack && e.digest) };
  for (const c of CHANNELS) if (!e.allow.includes(c)) want[c] = false;
  if (e.locked) want.email = true;
  return want;
}

// القرار: القنوات الفعلية لهذا الإرسال {email, slack, digest, log}. log دائمًا: كل حدث يبقى في سجل التدقيق.
// Slack مطلوب ولم يصل (أو غير مضبوط): البريد بدله إن سُمح به (القسم 6.4). والملخص له احتياطه البريدي الواحد في مهمته
export function route(event, settings = DEFAULT_SETTINGS, slackState = 'ok') {
  const e = eventOf(event);
  const want = wanted(e, settings);
  const state = SLACK_STATES.includes(slackState) ? slackState : 'failed';
  const slack = want.slack && state === 'ok';
  const email = want.email || (want.slack && state !== 'ok' && e.allow.includes('email'));
  return { email, slack, digest: want.digest, log: true, tier: e.tier, locked: !!e.locked };
}

// حال Slack من نتيجة الإرسال: وصل من إحدى القناتين، أو ضُبطت إحداهما ولم يصل، أو لم تُضبط أي منهما
export const slackStateOf = ({ delivered, configured }) => (delivered ? 'ok' : configured ? 'failed' : 'unconfigured');

// بريد «Slack لا يستقبل التنبيهات»: مرة كل ست ساعات على الأكثر (6.4)
export const SLACK_DOWN_MS = 6 * 36e5;
export const SLACK_DOWN_SUBJECT = 'تنبيه: Slack لا يستقبل التنبيهات';
