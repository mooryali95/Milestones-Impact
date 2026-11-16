// ════════════════════════════════════════════════════════════════
// مركز البريد: الحصة وما بقي منها، وتشخيص «لماذا لم يصل البريد» (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد للسقف وحصة الرموز: _shared/mail-budget.js (القرار نفسه الذي يحكم الإرسال). هنا العرض والتشخيص فقط.
import { ALERT_AT, CODE_RESERVE, FLUSH_FROM_UTC_HOUR, FLUSH_KEEP, inFlush, mailDayStart, nextMailDay } from '../_shared/mail-budget.js';

export const KIND_AR = { code: 'رمز دخول', alert: 'تنبيه للإدارة', notify: 'إشعار', bulk: 'إرسال جماعي', contact: 'نموذج التواصل' };
export const SOURCE_AR = { 'leaders-api': 'تطبيق القادة', 'admin-api': 'لوحة الإدارة', 'user-api': 'مصفوفة التأثير', 'send-otp': 'موقع التواصل' };
export const STATUS_AR = { sent: 'خرج من المنصة', failed: 'رفضه مزوّد البريد', blocked: 'حُجب بالسقف اليومي' };
// حالة التسليم عند Resend (last_event)
export const DELIVERY_AR = {
  delivered: ['وصل إلى خادم المستلم', 'ok'], opened: ['فُتح', 'ok'], clicked: ['فُتح وضُغط رابطه', 'ok'],
  sent: ['في الطريق إلى خادم المستلم', 'info'], queued: ['في طابور المزوّد', 'info'], scheduled: ['مجدول', 'info'], delivery_delayed: ['تأخر عند خادم المستلم', 'warn'],
  bounced: ['ارتدّ: العنوان لا يستقبل', 'bad'], complained: ['علّمه المستلم بريدًا مزعجًا', 'bad'], failed: ['فشل عند المزوّد', 'bad'], canceled: ['أُلغي', 'warn'], suppressed: ['محجوب عند المزوّد بعد ارتداد سابق', 'bad'],
};
export const deliveryAr = (ev) => DELIVERY_AR[ev] || [ev || 'غير معروف', 'info'];

/** الحصة كما يراها حارس الإرسال: المستخدم والمتبقي، وحصة غير الرموز، والمحجوز للرموز */
export function mailBudget({ sent = 0, nonCode = 0 } = {}, cap = 80) {
  const nonCodeLimit = Math.floor(cap * (1 - CODE_RESERVE));
  const remaining = Math.max(0, cap - sent);
  const nonCodeLeft = Math.max(0, Math.min(nonCodeLimit - nonCode, remaining));
  const state = remaining === 0 ? 'full' : nonCodeLeft === 0 ? 'share' : sent >= Math.ceil(cap * ALERT_AT) ? 'warn' : 'ok';
  return { cap, sent, remaining, pct: cap ? Math.min(100, Math.round((sent / cap) * 100)) : 0, codes: sent - nonCode, nonCode, nonCodeLimit, nonCodeLeft, state };
}
export const BUDGET_AR = {
  ok: 'الحصة تتسع',
  warn: 'اقتربت الحصة من سقفها',
  share: 'حصة الإشعارات انتهت: رموز الدخول وحدها تخرج، والإشعارات تنتظر في الصندوق',
  full: 'السقف اليومي بلغ نهايته: لا بريد يخرج حتى تُصفَّر الحصة 03:00 بتوقيت الرياض',
};

/** متى تتحرر الحصة: بداية يوم المزوّد التالي (03:00 بالرياض) إن أُرسل شيء اليوم، وإلا null */
export function nextFreeAt(sentTimes = [], now = Date.now()) {
  const start = Date.parse(mailDayStart(now));
  return (sentTimes || []).some((x) => Date.parse(x) >= start) ? new Date(nextMailDay(now)).toISOString() : null;
}

/** سلسلة يومية بتوقيت الرياض لآخر days يومًا: المُرسل والمحجوب والمرفوض */
export function dailySeries(events = [], days = 14, now = Date.now()) {
  const day = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ day: day(now - i * 864e5), sent: 0, blocked: 0, failed: 0 });
  const at = Object.fromEntries(out.map((d) => [d.day, d]));
  for (const e of events) { const d = at[day(Date.parse(e.created_at))]; if (d && d[e.status] != null) d[e.status]++; }
  return out;
}

/** عدّ بمفتاح */
export const tally = (rows, key) => rows.reduce((m, r) => { const k = r[key] || 'غير معروف'; m[k] = (m[k] || 0) + 1; return m; }, {});

/**
 * تشخيص عنوان واحد: ما الذي جرى لبريده، وما العمل. events: صفوف mail_events له (الأحدث أولًا)،
 * delivery: { resend_id: last_event }، known: هل للعنوان حساب، budget: حالة الحصة الآن.
 * @param {{ events?: any[], delivery?: Record<string, string>, known?: boolean, budget?: any, traceable?: boolean }} o
 */
export function diagnose({ events = [], delivery = {}, known = true, budget = null, traceable = true }) {
  if (!traceable) return { tone: 'info', title: 'السجل لا يحمل بصمة العناوين بعد', advice: 'يعمل البحث بالعنوان بعد تطبيق ترحيل مركز البريد، وعلى ما يُرسل بعده.' };
  if (!events.length) {
    return known
      ? { tone: 'warn', title: 'لم تُرسل المنصة إلى هذا العنوان شيئًا في المدة المحفوظة', advice: 'اطلب منه طلب رمز الدخول من صفحة الدخول، ثم أعد البحث. إن كتب عنوانًا آخر عند التسجيل فابحث به.' }
      : { tone: 'warn', title: 'العنوان غير مسجل، ولم يُرسل إليه شيء', advice: 'تأكد من كتابة العنوان، أو أنه سجّل ببريد آخر.' };
  }
  const last = events[0];
  if (last.status === 'blocked') {
    return { tone: 'bad', title: 'آخر رسالة له حُجبت بالسقف اليومي ولم تخرج',
      advice: last.kind === 'code'
        ? (budget?.state === 'full' ? 'السقف ممتلئ الآن. أنشئ له رابط دخول يدويًّا وأرسله بواتساب.' : 'الحصة تتسع الآن: اطلب منه طلب الرمز من جديد، أو أنشئ له رابط دخول.')
        : 'الإشعار في صندوق «لم يُرسل»: أرسله الآن من هناك، أو انسخ نصه وأرسله بنفسك.' };
  }
  if (last.status === 'failed') return { tone: 'bad', title: 'مزوّد البريد رفض آخر رسالة له', advice: 'تحقق من صحة العنوان. إن كان صحيحًا فأنشئ له رابط دخول وأرسله بواتساب، وراجع حالة النطاق أسفل الصفحة.' };
  const ev = last.resend_id ? delivery[last.resend_id] : null;
  if (ev === 'bounced' || ev === 'suppressed') return { tone: 'bad', title: 'الرسالة ارتدّت: عنوانه لا يستقبل منا', advice: 'العنوان خاطئ أو صندوقه ممتلئ أو محجوب. اطلب منه بريدًا آخر، أو أنشئ له رابط دخول وأرسله بواتساب.' };
  if (ev === 'complained') return { tone: 'bad', title: 'علّم رسالتنا بريدًا مزعجًا', advice: 'المزوّد يوقف الإرسال إليه. اطلب منه إزالة العلامة، وأرسل له رابط الدخول بواتساب.' };
  if (ev === 'delivery_delayed') return { tone: 'warn', title: 'الرسالة متأخرة عند خادم بريده', advice: 'خادم جهته يؤخر الاستلام. ينتظر دقائق، أو تنشئ له رابط دخول يدويًّا.' };
  if (ev === 'delivered' || ev === 'opened' || ev === 'clicked') return { tone: 'ok', title: 'آخر رسالة وصلت إلى خادم بريده', advice: 'اطلب منه البحث في «البريد غير المرغوب» و«العروض»، وإضافة عنوان المنصة إلى جهات الاتصال. بريد الجهات قد يحجزه في العزل.' };
  return { tone: 'info', title: 'آخر رسالة خرجت من المنصة', advice: ev ? 'ما زالت في الطريق. أعد البحث بعد دقيقة.' : 'حالة التسليم غير متاحة من المزوّد لهذه الرسالة. اطلب منه البحث في «البريد غير المرغوب».' };
}

/** نص الرسالة للنسخ والإرسال اليدوي: بلا وسوم */
export const mailtoUrl = (to, subject, text) => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(String(text || '').slice(0, 1800))}`;

// ── متى يُتوقع أن تخرج رسائل الطابور (منطق خالص بلا قاعدة) ──
// المهمة الساعية تفرّغ الطابور في الدقيقة 17 من كل ساعة (cron.expert-offers)
export const DRAIN_MINUTE = 17;
/** أول تشغيلة للمهمة الساعية في الوقت ms أو بعده */
export function nextDrainAt(ms) {
  const d = new Date(ms);
  d.setUTCMinutes(DRAIN_MINUTE, 0, 0);
  if (d.getTime() < ms) d.setUTCHours(d.getUTCHours() + 1);
  return d.getTime();
}
const byDrainOrder = (a, b) => (a.kind === b.kind ? String(a.created_at).localeCompare(String(b.created_at)) : a.kind === 'notify' ? -1 : 1);
const DAY_MS = 864e5;
const at17 = (dayStart, hour) => dayStart + hour * 36e5 + DRAIN_MINUTE * 60e3;
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/**
 * الموعد المتوقع لكل رسالة منتظرة، بالترتيب الذي يفرّغ به الخادم (الإشعار قبل الجماعي، ثم الأقدم)، محاكاةً ليوم المزوّد
 * (يُصفَّر 00:00 UTC، أي 03:00 بالرياض):
 * - التشغيلة التالية: ما بقي من حصة غير الرموز (budget.nonCodeLeft)، أو في ساعات المساء (inFlush) ما بقي من السقف إلا FLUSH_KEEP.
 * - تفريغ المساء اليوم (22:17 بالرياض) إن لم يأت بعد: ما بقي من السقف إلا FLUSH_KEEP.
 * - كل يوم بعده: نصيب غير الرموز كاملًا في 03:17 بالرياض، ثم إلى السقف إلا FLUSH_KEEP في 22:17.
 * تقدير لا وعد: بريد مباشر ورموز دخول تُرسل بين التشغيلات تأخذ من الحصة قبل الطابور. بعد ثلاثين يومًا: لا موعد.
 * @param {{ id: string, kind?: string, created_at?: string, expires_at?: string | null }[]} rows المنتظرة غير الممسَكة
 * @param {{ budget?: { cap?: number, sent?: number, nonCodeLeft?: number, nonCodeLimit?: number }, now?: number }} o
 * @returns {Record<string, { at: string | null, expires: boolean }>}
 */
export function queueEta(rows = [], { budget = {}, now = Date.now() } = {}) {
  const limit = num(budget.nonCodeLimit) ?? (num(budget.cap) == null ? null : Math.floor(num(budget.cap) * (1 - CODE_RESERVE)));
  const cap = num(budget.cap) ?? (limit == null ? null : Math.round(limit / (1 - CODE_RESERVE)));
  const sent = Math.max(0, num(budget.sent) ?? 0);
  const left = Math.max(0, num(budget.nonCodeLeft) ?? 0);
  const today = nextMailDay(now) - DAY_MS;
  const t0 = nextDrainAt(now);
  /** @type {[number, number][]} [الموعد، عدد الأماكن] بترتيب الزمن */
  const slots = [];
  // اليوم: ما لم تأت تشغيلته بعد قبل التصفير
  if (t0 < today + DAY_MS) {
    const first = inFlush(now) && cap != null ? Math.max(left, cap - FLUSH_KEEP - sent) : left;
    slots.push([t0, first]);
    const flushAt = at17(today, FLUSH_FROM_UTC_HOUR);
    if (cap != null && flushAt >= t0) slots.push([flushAt, Math.max(0, cap - FLUSH_KEEP - sent - first)]);
  }
  if (cap != null && limit != null) {
    for (let k = 1; k <= 30; k++) {
      const d = today + k * DAY_MS;
      slots.push([at17(d, 0), Math.min(limit, cap)], [at17(d, FLUSH_FROM_UTC_HOUR), Math.max(0, cap - FLUSH_KEEP - limit)]);
    }
  }
  const out = {};
  let i = 0, used = 0;
  for (const m of [...rows].sort(byDrainOrder)) {
    while (i < slots.length && used >= slots[i][1]) { i++; used = 0; }
    if (i >= slots.length) { out[m.id] = { at: null, expires: false }; continue; }
    used++;
    const at = slots[i][0];
    const exp = m.expires_at ? Date.parse(m.expires_at) : NaN;
    out[m.id] = { at: new Date(at).toISOString(), expires: Number.isFinite(exp) && exp <= at };
  }
  return out;
}
/** يوم الموعد بتوقيت الرياض بالنسبة إلى الآن: today أو tomorrow أو تاريخه */
export function etaDay(iso, now = Date.now()) {
  if (!iso) return null;
  const day = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
  const d = day(Date.parse(iso));
  return d === day(now) ? 'today' : d === day(now + 864e5) ? 'tomorrow' : d;
}
/** الموعد المتوقع بالعربية: «اليوم نحو 14:17» أو «غدًا نحو 08:17» أو «2026-11-19 نحو 08:17» بتوقيت الرياض */
export function etaAr(iso, now = Date.now()) {
  if (!iso) return 'حين تتحرر الحصة';
  const d = etaDay(iso, now);
  const hm = new Date(Date.parse(iso) + 3 * 36e5).toISOString().slice(11, 16);
  return `${d === 'today' ? 'اليوم' : d === 'tomorrow' ? 'غدًا' : d} نحو ${hm}`;
}
