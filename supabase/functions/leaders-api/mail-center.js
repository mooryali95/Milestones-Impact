// ════════════════════════════════════════════════════════════════
// مركز البريد: الحصة وما بقي منها، وتشخيص «لماذا لم يصل البريد» (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد للسقف وحصة الرموز: _shared/mail-budget.js (القرار نفسه الذي يحكم الإرسال). هنا العرض والتشخيص فقط.
import { ALERT_AT, CODE_RESERVE } from '../_shared/mail-budget.js';

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
  full: 'السقف اليومي بلغ نهايته: لا بريد يخرج حتى تتحرر الحصة',
};

/** متى تتحرر أول رسالة من نافذة الـ24 ساعة (أقدم مُرسل + 24 ساعة). null إن لم يُرسل شيء */
export function nextFreeAt(sentTimes = []) {
  const t = sentTimes.map((x) => Date.parse(x)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  return t ? new Date(t + 864e5).toISOString() : null;
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
/**
 * الموعد المتوقع لكل رسالة منتظرة، بالترتيب الذي يفرّغ به الخادم (الإشعار قبل الجماعي، ثم الأقدم).
 * حصة غير الرموز نافذة متحركة 24 ساعة: ما بقي منها الآن (budget.nonCodeLeft) يخرج في التشغيلة التالية، وكل رسالة
 * غير رمز أُرسلت في آخر 24 ساعة تحرر مكانها بعد 24 ساعة من إرسالها، وكل رسالة يرسلها الطابور تحرر مكانها بعد 24 ساعة كذلك.
 * تقدير لا وعد: بريد مباشر يُرسل بين التشغيلات يأخذ ما يتحرر قبل الطابور.
 * @param {{ id: string, kind?: string, created_at?: string, expires_at?: string | null }[]} rows المنتظرة غير الممسَكة
 * @param {{ nonCodeSent?: string[], budget?: { nonCodeLeft?: number, nonCodeLimit?: number, nonCode?: number }, now?: number }} o
 * @returns {Record<string, { at: string | null, expires: boolean }>}
 */
export function queueEta(rows = [], { nonCodeSent = [], budget = {}, now = Date.now() } = {}) {
  const free = [];
  for (let i = 0; i < Math.max(0, budget.nonCodeLeft ?? 0); i++) free.push(now);
  // ما أُرسل بقرار المدير فوق الحصة (force) يرفع العدد فوق نصيب غير الرموز: أول ما يتحرر منه يعيد العدد إلى النصيب
  // ولا يفتح مكانًا، فيُسقط من التقدير بقدر الزيادة (mailDecision يحجب ما دام العدد عند النصيب أو فوقه)
  const sentAt = nonCodeSent.map((t) => Date.parse(t)).filter(Number.isFinite).sort((x, y) => x - y);
  const limit = Number(budget.nonCodeLimit);
  const over = Number.isFinite(limit) ? Math.max(0, Number(budget.nonCode ?? sentAt.length) - limit) : 0;
  for (const ms of sentAt.slice(over)) free.push(Math.max(now, ms + 864e5));
  const out = {};
  for (const m of [...rows].sort(byDrainOrder)) {
    if (!free.length) { out[m.id] = { at: null, expires: false }; continue; }
    free.sort((a, b) => a - b);
    const at = nextDrainAt(free.shift());
    free.push(at + 864e5);
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
