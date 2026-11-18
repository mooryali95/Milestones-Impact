// ════════════════════════════════════════════════════════════════
// تصنيف أفعال الدوال: قراءة أو كتابة (تصور التحديث بلا أثر، المرحلة 3، ش9)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لسؤالين يطرحهما العميل والخادم معًا:
// 1) هل يُعاد الطلب تلقائيًا بعد خطأ شبكة أو مهلة؟ القراءة نعم بميزانية 20 ثانية (src/lib/api.js fetchRetry). والكتابة لا،
//    إلا بمفتاح منع التكرار وقد أعلن الخادم أنه يحفظه (الترويسة x-idem).
// 2) هل يحفظ الخادم نتيجة الكتابة بمفتاحها ليعيدها بدل تنفيذها مرة ثانية؟ (leaders-api/idempotency.ts)
// القاعدة: ما لم يُذكر هنا قراءةً فهو كتابة. القائمة صريحة لا تُستنتج من الاسم، واختبار action-kinds.test.js يتحقق أن كل
// قراءة فعل موجود في خريطة الخادم، وأن جسم دالته المباشر لا يكتب (insert أو update أو upsert أو delete أو بريد).

// أفعال leaders-api التي تُقرأ بلا أثر: المفتوحة والمشارك والخبير والمنسق.
// ما يسجّل اطلاعًا (قراءة الكتاب، فتح ملف مشارك، شهادة التحقق) ليس هنا، فإعادته تكرر سجله
export const LEADERS_READS = new Set([
  // مفتوحة (بلا جلسة)
  'system.ping', 'org.info', 'rater.get', 'sponsor.get', 'outcome.get', 'offer.get',
  // المشارك. me يحمل الرئيسية كلها في الإقلاع (with_home)، وهو الطلب الذي صُمم له هذا كله
  'me', 'sus.state', 'org.logo', 'me.privacy', 'guide.state', 'pay.access', 'org.visibility', 'ratings.pending', 'katon.mine',
  'hall.state', 'peer.list', 'sessions.list', 'passkey.list', 'handbook.toc', 'models.list', 'models.get', 'lab.list', 'achievements',
  'impact.mine', 'f360.mine', 'capstone.get', 'capstone.shares', 'capstone.doc', 'tracking.get',
  // الخبير
  'xp.dashboard', 'xp.reviews', 'xp.participants', 'xp.peer-list', 'xp.sus-state', 'xp.f360', 'xp.workshops', 'xp.nudge-preview', 'xp.nudge-ledger',
  // المنسق
  'coord.dashboard', 'coord.sus-state', 'coord.nudge-preview',
]);

// أفعال الإدارة في leaders-api للقراءة وحدها: تُفتح لكل أدوار اللوحة بما فيها «عرض فقط» (المصدر الذي كان في
// authz-actions.test.js، ويحرس هناك أن كل فعل إدارة غيرها يفحص صلاحية الكتابة)
export const LEADERS_ADMIN_READS = new Set(['health', 'inbox', 'today', 'insight', 'changes', 'mail-gallery', 'visits', 'trends', 'item-analysis', 'overview', 'participants', 'participant', 'peer', 'reviews',
  'participant-impact', 'sus', 'erasures', 'erasure-get', 'catalog', 'nudge-preview', 'nudge-ledger', 'nudge-report', 'track', 'orgs', 'org', 'org-impact', 'org-finance', 'coordinator', 'coordinator-preview', 'org-journey', 'cohort-journey', 'book-preview',
  'submissions', 'submission', 'lab', 'lab-preview', 'lab-cards', 'certificates', 'certificate', 'cert-preview', 'cert-settings', 'activities', 'workshop-qr', 'workshop-attendance', 'cohort-workshops', 'impact',
  'curriculum', 'programs', 'payments', 'payment', 'sponsor-requests', 'experts', 'expert', 'expert-match', 'expert-requests', 'program', 'program-compare', 'milestones', 'cohort-definition',
  'hall', 'katon', 'final-eval', 'cohort-groups', 'cohort-team', 'cohort-visibility', 'org-team', 'capstones', 'capstone', 'outcomes',
  // الكتاب الأم: قراءة لكل مدير، والتعليق والحسم بغلاف writer (master-book.ts)
  'book',
  // مركز البريد: الحصة والأعداد وحدها قراءة. تشخيص العنوان ونص الرسالة والإرسال بغلاف writer، ورابط الدخول بغلاف superWriter
  'mail-center',
  // الإعدادات العامة: التعريف والقيم لكل مدير، والحفظ (settings-save) بغلاف writer وفحوص المجموعة في دالته
  'settings',
  // قسم «التوجيه» في مركز البريد: الإعداد المحفوظ وأعداد أحداث 7 أيام بمفاتيحها، بلا أسماء ولا عناوين. حفظه بـ settings-save
  // للمالك وحده (notify_center_test.ts يحرس الفحص)
  'notify-routing',
  // صحة البريد والتنبيه: أعداد وحالات بلا عناوين ولا قيم أسرار، يحصرها الخادم في المدير ذي الكتابة (ops_health_test.ts يحرس الفحص)
  'ops-health',
  // تقييم 360: حالة الدورات وأعدادها بلا نتيجة فرد
  'f360',
  // شاشة المساعد الآلي: قراءة يحصرها الخادم في المدير الأعلى والمالك (requireAgentRead، agent_admin_test.ts يحرس الفحص)،
  // وفتح نص محادثة أو تشغيل يُسجَّل. الكتابة كلها بغلاف superWriter
  'agent-state', 'agent-usage', 'agent-conversations', 'agent-eval-runs',
  // «التوجيه والإرشاد»: أعداد وإنفاق بلا نص، يحصرها الخادم في المدير الأعلى والمالك (requireAgentRead)
  'guide-report', 'guide-eval', 'guide-eval-results', 'guide-pilots', 'guide-dashboard', 'guide-orgs', 'guide-eval-cases',
  // H3 سجل المحادثات: القراءة يحصرها الخادم في المالك والمدير الأعلى بمنحه وبالعامل الثاني، وكل فتح نص يُسجَّل (guide_transcripts_test.ts)
  'guide-transcript-access', 'guide-transcripts', 'guide-transcript-grants'].map((k) => `admin.${k}`));

// اطلاع إدارة يُسجَّل في كل مرة: قراءة في الصلاحيات (لا غلاف writer، authz-actions.test.js يقرؤها مع قراءات الإدارة)، وكتابة
// في الإعادة: إعادته بعد مهلة أو 504 تكرر سطر السجل («فتح مرتين») فلا تُعاد تلقائيًا، وردها رابط موقّع أو نص أو مفتاح
// إجابات فلا يُحفظ (NO_REPLAY)
export const LEADERS_ADMIN_LOGGED_READS = new Set([
  // فتح ملف خاص برابط موقّع (admin.file-open)
  'evidence-url',
  // إجابات القياس بمفتاحها، يحصرها الخادم في المدير ذي الكتابة (answer-review.test.js يحرس الفحص)
  'assessment-answers',
  // نص محادثة المساعد (admin.agent-transcript-view)، ونتائج تشغيل تقييمه بنصوص ردوده (admin.agent-eval-view)، ونص محادثة
  // التوجيه (guide.transcript-read)
  'agent-transcript', 'agent-eval-run', 'guide-transcript',
].map((k) => `admin.${k}`));

// أفعال admin-api للقراءة (فروع index.ts التي لا تكتب). الدخول والرموز والمفاتيح والجلسات كتابة
export const ADMIN_API_READS = new Set(['ping', 'me', 'security-status', 'sessions-list', 'list-regs', 'list-contacts', 'list-users']);

// أفعال user-api للقراءة (تطبيق المصفوفة)
export const USER_API_READS = new Set(['get', 'passkey-status']);

const READS = { 'leaders-api': [LEADERS_READS, LEADERS_ADMIN_READS], 'admin-api': [ADMIN_API_READS], 'user-api': [USER_API_READS] };
export const isReadAction = (fn, action) => (READS[fn] || []).some((s) => s.has(String(action || '')));

// كتابات leaders-api لا يحفظ الخادم نتيجتها بمفتاح منع التكرار:
// - المفتوحة: بلا جلسة فلا فاعل يُربط به المفتاح (الدخول والإرسال من روابط المقيّمين والرعاة والعروض والمهام المجدولة).
// - ما يحمل رده رمز دخول أو رابطًا بسر (جلسة جديدة، رابط رفع موقّع، رابط دفع، رابط مشاركة، رابط عرض أو دخول، رمز حضور):
//   الجدول لا يحفظ رمزًا ولا سرًا (ش9، الترحيل 20261118140000).
// - ما رده نسخة من بيانات شخصية أو وثيقة كاملة: الجدول لا يحفظ بيانات شخصية (نسخة بيانات المشارك، تصدير الكتاب).
// - اطلاع الإدارة المسجَّل (LEADERS_ADMIN_LOGGED_READS).
// هذه لا يعيدها العميل تلقائيًا بعد خطأ شبكة أبدًا، ويُعرض «تعذّر التأكد، تحقّق قبل الإعادة» (والدخول رسالة الشبكة، AUTH_ACTIONS)
export const NO_REPLAY = new Set([
  'me.export', 'handbook.export', ...LEADERS_ADMIN_LOGGED_READS,
  'auth.start', 'auth.verify', 'auth.google', 'coord.auth-start', 'coord.auth-verify', 'passkey.auth-options', 'passkey.auth-verify',
  'xp.auth-start', 'xp.auth-verify', 'xp.auth-google', 'workshop.scan', 'cert.verify', 'rater.submit', 'sponsor.submit', 'share.get', 'share.note',
  'outcome.submit', 'expert.apply', 'offer.respond', 'cron.reminders', 'cron.expert-offers',
  // أحداث الإخفاق من جهة العميل (المرحلة 4): مفتوحة، ويرسلها telemetry.js بـfetch مباشرة لا postAction، فلا إعادة ولا مفتاح
  'client.event',
  'me.switch', 'xp.switch', 'coord.switch', 'upload.url', 'pay.checkout', 'capstone.share-create', 'admin.demo-open', 'admin.mail-login-link', 'xp.workshop-qr',
]);
// أفعال الدخول: لا يُعاد طلبها تلقائيًا، لكن تعذّر الاتصال فيها يُعرض برسالة الشبكة لا «تعذّر التأكد» (لا شيء يُتحقق منه في
// شاشة الدخول، والرمز إن أُرسل يصل البريد). leaders-api ودخول لوحة admin-api
const AUTH_LEADERS = new Set(['auth.start', 'auth.verify', 'auth.google', 'coord.auth-start', 'coord.auth-verify', 'passkey.auth-options', 'passkey.auth-verify',
  'xp.auth-start', 'xp.auth-verify', 'xp.auth-google']);
export const isAuthAction = (fn, action) => {
  const a = String(action || '');
  if (fn === 'leaders-api') return AUTH_LEADERS.has(a);
  if (fn === 'admin-api') return /^(login|passkey-login)-|^recovery-request$/.test(a);
  if (fn === 'user-api') return /^(register|resume)-send$|^verify$|^passkey-login-/.test(a);
  return false;
};

// كتابة يحفظ الخادم نتيجتها بمفتاحها: في leaders-api، وليست قراءة، وليست في NO_REPLAY
export const replayable = (fn, action) => fn === 'leaders-api' && !isReadAction(fn, action) && !NO_REPLAY.has(String(action || ''));

// شكل المفتاح: 16 إلى 64 حرفًا من الحروف اللاتينية والأرقام و- و_ (UUID أو سداسي عشري من العميل)
export const IDEM_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
