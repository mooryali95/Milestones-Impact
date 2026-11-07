// سياسة حصة البريد (D15 في سجل قرارات لجنة الخبراء): عداد واحد لكل بريد تُرسله الدوال الأربع،
// يقرأ leaders.mail_events. منطق بلا شبكة يقرؤه _shared/mail.ts واختبار سيناريو صباح الورشة.
//
// - code: رموز الدخول والتسجيل في البوابات كلها، وalert: تنبيه المالك. لهما السقف كاملًا.
// - notify وbulk وcontact: كل ما سواهما، ولا يتجاوز نصيبها نصف السقف، فيبقى النصف لرموز الدخول.
// - bulk (التذكيرات والملخصات) يدخل الطابور حين يُحجب، وتفرغه المهمة الساعية.
export const MAIL_KINDS = ['code', 'alert', 'notify', 'bulk', 'contact'];
export const PRIORITY_KINDS = new Set(['code', 'alert']);
export const CODE_RESERVE = 0.5;
export const ALERT_AT = 0.7;
export const RETENTION_DAYS = 180;

// sent: ما أُرسل في آخر 24 ساعة، وnonCode: ما أُرسل منه بغير الرموز والتنبيه
export function mailDecision(kind, { sent, nonCode }, cap) {
  if (!MAIL_KINDS.includes(kind)) return { ok: false, reason: 'mail_kind' };
  if (sent >= cap) return { ok: false, reason: 'mail_cap' };
  if (!PRIORITY_KINDS.has(kind) && nonCode >= Math.floor(cap * (1 - CODE_RESERVE))) return { ok: false, reason: 'mail_share' };
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
