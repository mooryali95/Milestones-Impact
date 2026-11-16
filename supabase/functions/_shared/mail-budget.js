// سياسة حصة البريد (D15 في سجل قرارات لجنة الخبراء): عداد واحد لكل بريد تُرسله الدوال الأربع،
// يقرأ leaders.mail_events. منطق بلا شبكة يقرؤه _shared/mail.ts واختبار سيناريو صباح الورشة.
//
// - code: رموز الدخول والتسجيل في البوابات كلها، وalert: تنبيه المالك. لهما السقف كاملًا.
// - alert وحده يمر فوق السقف باحتياط صغير (ALERT_OVER_CAP): امتلاء اليوم لا يحجب التنبيه إليه، ويُحجب بعد الاحتياط.
// - notify وbulk وcontact: كل ما سواهما، ولا يتجاوز نصيبها نصف السقف، فيبقى النصف لرموز الدخول.
// - bulk (التذكيرات والملخصات) يدخل الطابور حين يُحجب، وتفرغه المهمة الساعية.
// - نافذة العد يوم المزوّد التقويمي (UTC، يبدأ 03:00 بتوقيت الرياض)، لا 24 ساعة متحركة: حصة Resend تُصفَّر فيه.
// - تفريغ المساء (FLUSH_FROM_UTC_HOUR): من 22:00 بالرياض يأخذ الطابور ما بقي من حصة اليوم قبل أن تُصفَّر،
//   ويُبقي FLUSH_KEEP لرموز الدخول ليلًا. التفريغ وحده يمرر flush، فالأقدم انتظارًا يأخذ مكان المساء قبل الجديد.
// - لا حارس شهري: السقف 80 في اليوم لا يبلغ في شهر 80×31 = 2480، دون حصة المزوّد الشهرية 3000.
export const MAIL_KINDS = ['code', 'alert', 'notify', 'bulk', 'contact'];
export const PRIORITY_KINDS = new Set(['code', 'alert']);
export const CODE_RESERVE = 0.5;
export const ALERT_AT = 0.7;
export const ALERT_OVER_CAP = 5;
export const RETENTION_DAYS = 180;
export const FLUSH_FROM_UTC_HOUR = 19;
export const FLUSH_KEEP = 10;

const DAY_MS = 864e5;
/** بداية يوم المزوّد الحالي (00:00 UTC، أي 03:00 بالرياض) نصًّا ISO: من هنا يُعد ما استُهلك من الحصة */
export const mailDayStart = (now = Date.now()) => new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString();
/** بداية يوم المزوّد التالي (ms): متى تُصفَّر الحصة */
export const nextMailDay = (now = Date.now()) => (Math.floor(now / DAY_MS) + 1) * DAY_MS;
/** هل نحن في ساعات تفريغ المساء (من 22:00 بالرياض حتى تصفير الحصة 03:00) */
export const inFlush = (now = Date.now()) => new Date(now).getUTCHours() >= FLUSH_FROM_UTC_HOUR;

// sent: ما أُرسل في يوم المزوّد الحالي، وnonCode: ما أُرسل منه بغير الرموز والتنبيه.
// flush (تفريغ الطابور في المساء وحده): نصيب غير الرموز يتسع إلى السقف إلا FLUSH_KEEP، والسقف الكلي كما هو.
// يوسّع ولا يضيّق: ما يمر بنصيب النهار يمر في المساء كذلك (فلا يُحجب الطابور ليلًا بما يمر به البريد المباشر)
export function mailDecision(kind, { sent, nonCode }, cap, { flush = false } = {}) {
  if (!MAIL_KINDS.includes(kind)) return { ok: false, reason: 'mail_kind' };
  if (sent >= cap + (kind === 'alert' ? ALERT_OVER_CAP : 0)) return { ok: false, reason: 'mail_cap' };
  if (!PRIORITY_KINDS.has(kind) && nonCode >= Math.floor(cap * (1 - CODE_RESERVE)) && (!flush || sent >= cap - FLUSH_KEEP)) return { ok: false, reason: 'mail_share' };
  return { ok: true };
}

// هل عبرت هذه الرسالة حد التنبيه (70% من السقف)؟ مرة واحدة عند العبور
export const crossesAlert = (sentBefore, cap) => sentBefore < Math.ceil(cap * ALERT_AT) && sentBefore + 1 >= Math.ceil(cap * ALERT_AT);

export const domainOf = (email) => String(email || '').trim().toLowerCase().split('@')[1] || null;

// صباح الورشة: كم رمزًا يمر من n طلبًا متتاليًا بالسقف والحصة، وقد أُرسل قبلها sent منها nonCode
export function simulateCodes(n, cap, { sent = 0, nonCode = 0 } = {}) {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    if (!mailDecision('code', { sent, nonCode }, cap).ok) break;
    ok++; sent++;
  }
  return ok;
}
