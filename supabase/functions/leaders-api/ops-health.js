// ════════════════════════════════════════════════════════════════
// صحة البريد والتنبيه: الحكم بالأخضر أو الكهرماني أو الأحمر من حقائق admin.ops-health
// ════════════════════════════════════════════════════════════════
// منطق بلا شبكة يقرؤه الخادم (system.ts opsHealth) وبطاقة النظرة العامة وشريط اللوحة معًا، فالعتبات نفسها
// تحكم باللون والشريط. الحقائق من الخادم، والحكم هنا وحده.
//   أحمر: عطل الآن يمنع الدخول (لا مفتاح بريد، أو السقف امتلأ، أو رموز الدخول تتعذّر متتالية).
//   كهرماني: ما يستحق المتابعة ولا يوقف الدخول (اقتراب السقف، رسائل تعذّرت، نصيب المصفوفة، طابور متأخر، سلاك متعثر، لا قناة تنبيه).
//   أخضر: ما سواهما.
import { ALERT_AT } from '../_shared/mail-budget.js';

export const OPS = {
  // رموز متتالية لم تصل (تعذّرت أو حُجبت) من آخرها: من هذا العدد فأكثر عطل لا عنوان خاطئ
  codeStreakRed: 3,
  // السلسلة تُحسب عطلًا قائمًا ما دام آخرها في هذه المدة (بالدقائق)
  codeRecentMin: 60,
  // رموز لم تصل في 24 ساعة، من هذا العدد فأكثر تُتابع ولو عاد الإرسال
  codeLostWatch: 3,
  // عمر أقدم رسالة في الطابور بالساعات (QUEUE_ALERT_HOURS في core.ts، ويفحص الاختبار تطابقهما)
  queueWatchHours: 6,
  // كم رمزًا يُقرأ من آخرها لحساب السلسلة
  codeWindow: 20,
};

// رموز الدخول الأخيرة من الأحدث: كم منها متتاليًا لم يُرسل، ومنذ متى (أقدمها في السلسلة)، ومتى آخر نجاح
export function codeStreak(events) {
  const list = (events || []).filter((e) => e && e.created_at);
  let count = 0;
  while (count < list.length && list[count].status !== 'sent') count++;
  return {
    count,
    since: count ? list[count - 1].created_at : null,
    last_at: list[0]?.created_at ?? null,
    last_ok_at: list.find((e) => e.status === 'sent')?.created_at ?? null,
    // كل ما قُرئ لم يُرسل: السلسلة أطول مما قُرئ
    open: count > 0 && count === list.length,
  };
}

export const minutesAr = (m) => {
  const n = Math.max(1, Math.round(m));
  if (n >= 60) return hoursAr(Math.floor(n / 60));
  return n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتين' : n <= 10 ? `${n} دقائق` : `${n} دقيقة`;
};
export const hoursAr = (h) => (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h >= 3 && h <= 10 ? `${h} ساعات` : `${h} ساعة`);

// رمز خطأ سلاك كما يرده chat.postMessage: معناه بالعربية (يتصدر السطر) وإرشاد إصلاحه، والرمز نفسه تفصيل ثانوي
export const SLACK_LABEL = {
  invalid_auth: 'رمز البوت غير صالح',
  not_authed: 'لم يصل رمز البوت',
  token_revoked: 'أُلغي رمز البوت',
  account_inactive: 'حساب البوت معطل',
  channel_not_found: 'القناة غير موجودة',
  not_in_channel: 'البوت ليس عضوًا في القناة',
  is_archived: 'القناة مؤرشفة',
  missing_scope: 'تنقص البوت صلاحية النشر',
  rate_limited: 'طلب سلاك التمهل لكثرة الرسائل',
  timeout: 'لم يرد سلاك في المهلة',
};
export const SLACK_HINTS = {
  invalid_auth: 'أنشئ رمزًا جديدًا (xoxb) من صفحة التطبيق في سلاك، وضعه في السر LEADERS_SLACK_BOT_TOKEN',
  not_authed: 'تأكد من السر LEADERS_SLACK_BOT_TOKEN في دالة leaders-api',
  token_revoked: 'أعد تثبيت التطبيق في مساحة العمل، وضع الرمز الجديد في LEADERS_SLACK_BOT_TOKEN',
  account_inactive: 'أعد تثبيت التطبيق في مساحة العمل، وضع الرمز الجديد في LEADERS_SLACK_BOT_TOKEN',
  channel_not_found: 'ضع في LEADERS_SLACK_CHANNEL معرّف القناة (يبدأ بحرف C) من تفاصيل القناة في سلاك',
  not_in_channel: 'أضفه من تفاصيل القناة في سلاك، تبويب «التكاملات»، ثم «إضافة تطبيق»',
  is_archived: 'أعدها من الأرشيف، أو ضع قناة أخرى في LEADERS_SLACK_CHANNEL',
  missing_scope: 'أضف صلاحية chat:write في صفحة التطبيق ثم أعد تثبيته',
  rate_limited: 'يعود النشر وحده بعد قليل',
  timeout: 'غالبًا عارض مؤقت يزول وحده',
};
export const slackLabel = (code) => SLACK_LABEL[code] || 'رفض سلاك النشر';
export const slackHint = (code) => SLACK_HINTS[code] || 'راجع سجل الدالة leaders-api في Supabase لمعرفة السبب';

// عدد الأمور بالعربية: أمر واحد، أمران، 3 إلى 10 أمور، 11 فأكثر أمرًا
export const countAr = (n) => (n === 1 ? 'أمر واحد' : n === 2 ? 'أمران' : n >= 3 && n <= 10 ? `${n} أمور` : `${n} أمرًا`);
// عدد المحاولات: محاولة واحدة، محاولتان، 3 إلى 10 محاولات، 11 فأكثر محاولة
export const attemptsAr = (n) => (n === 1 ? 'محاولة واحدة' : n === 2 ? 'محاولتان' : n >= 3 && n <= 10 ? `${n} محاولات` : `${n} محاولة`);
// آخر رموز دخول لم تصل: المفرد والمثنى بأفعالهما، ثم الجمع (3 إلى 10) والتمييز المفرد (11 فأكثر)
export const lostCodesAr = (n) => (n === 1 ? 'آخر رمز دخول لم يصل (تعذّر أو حُجب)'
  : n === 2 ? 'آخر رمزي دخول لم يصلا (تعذّرا أو حُجبا)'
  : n >= 3 && n <= 10 ? `آخر ${n} رموز دخول لم تصل (تعذّرت أو حُجبت)` : `آخر ${n} رمز دخول لم تصل (تعذّرت أو حُجبت)`);

export const LEVEL_AR = { green: 'يعمل', amber: 'يحتاج متابعة', red: 'عطل الآن' };
export const TITLE_AR = { green: 'البريد والتنبيه يعملان', amber: 'البريد والتنبيه: يحتاج متابعتك', red: 'البريد والتنبيه: عطل الآن' };

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

// الحكم من الحقائق. issues مرتبة: الأحمر أولًا، وbanner نص الشريط حين يكون الحكم أحمر وحده.
// banner جملة ثابتة لا تتغير بمرور الوقت (منطقة التنبيه تُقرأ لقارئ الشاشة كلما تغير نصها)، والمدة المتغيرة في bannerSince
// تُعرض بجوارها خارج منطقة التنبيه
export function opsVerdict(f, now = Date.now()) {
  const issues = [];
  const add = (level, key, text, hint, banner, code, bannerSince) => issues.push({ level, key, text, ...(hint ? { hint } : {}), ...(banner ? { banner } : {}), ...(code ? { code } : {}), ...(bannerSince ? { bannerSince } : {}) });
  const mail = f?.mail || {};
  const cap = Number(mail.cap) || 0;
  const sent = mail.sent;

  if (mail.key === false) add('red', 'mail_key', 'مفتاح البريد غير مضبوط: لا يخرج أي بريد ولا رمز دخول', 'أضف السر RESEND_API_KEY في دالة leaders-api', 'البريد متوقف: مفتاح البريد غير مضبوط، ورموز الدخول لا تخرج');
  if (sent != null && cap && sent >= cap) add('red', 'mail_cap', `بلغ البريد سقفه اليومي (${sent} من ${cap}): رموز الدخول لا تخرج حتى تُصفَّر حصة اليوم 03:00 بتوقيت الرياض`, 'يبقى الدخول بمفتاح المرور. إن تكرر فارفع LEADERS_MAIL_DAILY_CAP بعد التأكد من خطة Resend', 'البريد متوقف: بلغ السقف اليومي، ورموز الدخول لا تخرج');

  const s = mail.code_streak;
  const recent = s && s.count > 0 && now - ms(s.last_at) <= OPS.codeRecentMin * 60e3;
  if (recent && s.count >= OPS.codeStreakRed) {
    const since = minutesAr((now - ms(s.since)) / 60e3);
    add('red', 'codes_failing', `رموز الدخول لا تصل منذ ${since}: آخر ${attemptsAr(s.count)}${s.open ? ' أو أكثر' : ''} تعذّرت أو حُجبت متتالية`,
      'افتح مركز البريد وابحث بعنوان أحدهم لمعرفة السبب، ويبقى الدخول بمفتاح المرور أو برابط دخول يدوي', 'البريد متوقف: رموز الدخول لا تصل', null, `منذ ${since}`);
  } else if (recent) {
    add('amber', 'code_lost', lostCodesAr(s.count), 'قد يكون عنوانًا خاطئًا: ابحث به في مركز البريد');
  }

  if (sent == null) add('amber', 'mail_counter', 'تعذّرت قراءة عداد البريد: لا يخرج الآن إلا الرموز والتنبيه', 'غالبًا عارض في القاعدة يزول وحده؛ إن بقي فراجع سجل الدالة');
  else if (cap && sent < cap && sent >= Math.ceil(cap * ALERT_AT)) add('amber', 'mail_near', `البريد اليوم ${sent} من ${cap}: اقترب من السقف`, 'عند السقف تتوقف رموز الدخول، فأجّل الرسائل الجماعية إن أمكن');

  const lost = mail.codes ? (mail.codes.failed ?? 0) + (mail.codes.blocked ?? 0) : 0;
  if (!recent && lost >= OPS.codeLostWatch) add('amber', 'codes_lost_day', `رموز دخول لم تصل في آخر 24 ساعة: ${lost}`, 'عاد الإرسال بعدها، فراجع في مركز البريد سبب ما لم يصل');
  // رسائل غير الرموز تعذّر إرسالها (مهلة أو خطأ عند المزوّد أو رفض): الرموز لها سطرها، فلا تُعد مرتين
  if (mail.failed_24h > 0) add('amber', 'mail_failed', `تعذّر إرسال ${mail.failed_24h} من الرسائل غير رموز الدخول في آخر 24 ساعة`, 'افتح مركز البريد لمعرفة السبب: المهلة العابرة تزول وحدها، والرفض المتكرر يستدعي مراجعة النطاق');
  // رموز مصفوفة التأثير المحجوبة: لا تمس دخول القادة والمنسقين والخبراء، فمتابعة لا عطل. السجل لا يفرق بين حجب
  // نصيبها (خُمس السقف) وحجب السقف الكلي، وما حُجب بالسقف قبل ساعات يبقى في نافذة 24 ساعة بعد أن تخف، فالنص يذكر السببين
  const matrix = mail.codes?.matrix_blocked ?? 0;
  if (matrix > 0 && !(sent != null && cap && sent >= cap)) add('amber', 'matrix_share', `حُجب ${matrix} من رموز دخول مصفوفة التأثير في آخر 24 ساعة (لبلوغ نصيبها أو السقف اليومي)`, 'لا يمس دخول القادة ولا المنسقين ولا الخبراء. نصيب المصفوفة خُمس السقف اليومي، وإن امتلأ السقف كله حُجبت معه. إن تكرر فارفع LEADERS_MAIL_DAILY_CAP بعد التأكد من خطة Resend');

  const q = mail.queue || {};
  if (q.waiting == null) add('amber', 'queue_unread', 'تعذّرت قراءة طابور البريد');
  else if (q.waiting > 0 && q.oldest_minutes != null && q.oldest_minutes >= OPS.queueWatchHours * 60) add('amber', 'queue_stuck', `طابور البريد: ${q.waiting} تنتظر، أقدمها منذ ${minutesAr(q.oldest_minutes)}`, 'راجع صندوق «لم يُرسل» في مركز البريد');

  const al = f?.alerts || {};
  // سلاك قناة تنبيه أيضًا: كل تنبيه يصل سلسلة التنبيهات فيه (alertWebhook)
  const slackOn = f?.slack?.configured === true || al.slack === true;
  if (al.email === false && al.webhook === false && !slackOn) add('amber', 'no_alert_channel', 'لا قناة تنبيه مضبوطة: لن يصلك تنبيه حين يتعطل البريد', 'اضبط سلاك، أو أضف LEADERS_ALERT_WEBHOOK أو LEADERS_ALERT_EMAIL في دالة leaders-api');

  const sl = f?.slack || {};
  if (!sl.configured && (sl.missing || []).length === 1) add('amber', 'slack_half', `سلاك نصف مضبوط: ينقص السر ${sl.missing[0]}`, 'أضفه في دالة leaders-api، أو احذف الآخر إن لم ترد سلاك');
  if (sl.configured && sl.error_at && !(ms(sl.ok_at) >= ms(sl.error_at))) add('amber', 'slack_error', `آخر نشر في سلاك تعذّر: ${slackLabel(sl.error)}`, slackHint(sl.error), null, sl.error || null);

  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  const level = issues.some((i) => i.level === 'red') ? 'red' : issues.length ? 'amber' : 'green';
  const top = level === 'red' ? issues[0] : null;
  return { level, label: LEVEL_AR[level], title: TITLE_AR[level], issues, banner: top ? top.banner : null, bannerSince: top?.bannerSince ?? null };
}

// لون عداد البريد من عتبات الحكم نفسها لا من النسبة المقربة: full مع mail_cap، وnear مع mail_near
export function meterLevel(verdict) {
  const k = new Set((verdict?.issues || []).map((i) => i.key));
  return k.has('mail_cap') ? 'full' : k.has('mail_near') ? 'near' : '';
}

// «منذ 20 دقيقة» لما في اليوم، وnull لما هو أقدم (يعرض المستدعي تاريخه)
export function agoAr(iso, now = Date.now()) {
  const t = ms(iso);
  if (!Number.isFinite(t)) return null;
  const m = (now - t) / 60e3;
  if (m < 1) return 'الآن';
  if (m >= 24 * 60) return null;
  return `منذ ${minutesAr(m)}`;
}
