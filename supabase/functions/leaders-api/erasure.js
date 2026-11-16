// ════════════════════════════════════════════════════════════════
// قرار طلب حذف البيانات (منطق خالص بلا قاعدة): الأسباب، والمهلة بالأيام، ومراحل التذكير، ونصوص ما يُحذف وما يبقى
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لنصوص القرار: تقرؤها ورقة الطلب في الإدارة (Erasure.jsx) وبُرُد المشارك (core.ts) والخادم (erasure.ts)،
// فلا تقول الورقة شيئًا وتقول الرسالة غيره. قرارات المالك (2026-11-16): الشهادة تُلغى وتُحذف عند التنفيذ، والقرار للمدير
// الأعلى وحده، وسجل الدفع يبقى 10 سنوات، ولا تمديد الآن، والتذكير قبل 10 أيام وقبل 3 ويوم المهلة ثم يوميًا بعد التأخر.
import { ERASE_REPLY_DAYS, eraseDue } from './privacy.js';

const DAY = 864e5;
// أيام الرياض (UTC+3 بلا توقيت صيفي): «بقي يومان» تُحسب بتقويم المالك لا بفارق الساعات
const RIYADH_MS = 3 * 36e5;
const dayIndex = (t) => Math.floor((t + RIYADH_MS) / DAY);

// أسباب الرفض: قائمة مغلقة، كل منها بأساسه النظامي. other يلزمه نص
export const ERASE_GROUNDS = Object.freeze({
  repeat: { ar: 'طلب مكرر بعد تنفيذ طلب سابق أو الرد عليه', basis: 'اللائحة التنفيذية لنظام حماية البيانات الشخصية، المادة 3' },
  litigation: { ar: 'بيانات مرتبطة بقضية قائمة أمام جهة قضائية', basis: 'نظام حماية البيانات الشخصية، المادة 18' },
  legal_retention: { ar: 'التزام نظامي يوجب الاحتفاظ بها', basis: 'نظام حماية البيانات الشخصية، المادة 18، واللائحة التنفيذية، المادة 8' },
  other: { ar: 'سبب آخر', basis: null },
});
export const ERASE_NOTE_MIN = 10;
export const ERASE_NOTE_MAX = 1000;
// أقل نص لملاحظة السحب (ما قاله المشارك)، للورقة والخادم معًا
export const WITHDRAW_NOTE_MIN = 5;
// كيف أبلغ المشارك المدير بسحب طلبه
export const WITHDRAW_VIA = Object.freeze({ email: 'بالبريد', phone: 'باتصال', message: 'برسالة' });

export const ERASE_STATUS_AR = Object.freeze({ pending: 'ينتظر قرارك', done: 'نُفّذ', rejected: 'رُفض', cancelled: 'سُحب' });

// ما يُحذف عند التنفيذ وما يبقى، بنص واحد للورقة والبريد والسياسة
export const ERASE_DELETED = Object.freeze([
  'الحساب وبيانات الدخول والجلسات ومفاتيح المرور',
  'القياسات وإجاباتها ونتائجها',
  'النماذج والتسليمات والمبادرة وجلسات الإرشاد',
  'الملفات المرفوعة',
  'الشهادة ورقم تحققها: تُلغى وتُحذف، فيظهر التحقق برقمها «غير موجودة»',
  'التقدم في الرحلة والنقاط وما ينتظر في طابور البريد',
]);
export const PAYMENT_RETENTION_YEARS = 10;
export const BACKUP_DAILY_DAYS = 30;
export const BACKUP_MONTHLY_DAYS = 365;
export const ERASE_KEPT = Object.freeze([
  // ما يبقى من صف الدفع المؤكد أو المسترد بعد erasure_purge (يُمحى الاسم والملاحظات، ويُحذف ما لم يكتمل)
  { key: 'payments', title: 'سجل الدفع', text: `المبلغ والضريبة والتاريخ ورقم الطلب والعملية والبريد والدولة للدفعات المكتملة وحدها، بلا اسم، ${PAYMENT_RETENTION_YEARS} سنوات كما يلزم نظام الدفاتر التجارية، منفصلًا عن أي بيانات أخرى` },
  { key: 'request', title: 'أثر الطلب', text: 'تاريخه وقراره ومن نفذه، بلا اسم ولا بريد ولا سبب، دليلًا على الالتزام بالمهلة' },
  { key: 'audit', title: 'سجل التدقيق والموافقات والبريد', text: 'سطر بلا اسم ولا بريد يثبت أن الحذف نُفّذ، وسجل الموافقات بمعرّف بلا اسم دليلًا عليها، وسجل البريد يُحذف بعد 180 يومًا' },
  { key: 'backups', title: 'النسخ الاحتياطية', text: `تزول منها البيانات بانقضاء مدتها: اليومية ${BACKUP_DAILY_DAYS} يومًا والشهرية سنة، ولا تُستعاد منها` },
]);

/** الأيام المتبقية حتى المهلة بتقويم الرياض: 0 يوم المهلة، وسالب بعد التأخر */
export function daysLeft(createdAt, now = Date.now()) {
  return dayIndex(Date.parse(eraseDue(createdAt))) - dayIndex(now);
}

// مراحل التذكير: 1 قبل 10 أيام، 2 قبل 3، 3 يوم المهلة، ثم 3 + أيام التأخر (تذكير كل يوم). 0: لا تذكير بعد
export const REMIND_AT = Object.freeze([10, 3, 0]);
export function reminderStage(left) {
  if (left > REMIND_AT[0]) return 0;
  if (left > REMIND_AT[1]) return 1;
  if (left > REMIND_AT[2]) return 2;
  return 3 + Math.max(0, -left);
}
/** المرحلة الواجبة الآن إن تجاوزت آخر ما أُرسل، وإلا null */
export function reminderDue(row, now = Date.now()) {
  if (!row || row.status !== 'pending') return null;
  const stage = reminderStage(daysLeft(row.created_at, now));
  return stage > (Number(row.reminder_stage) || 0) ? stage : null;
}

const dayWord = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`);
const daysAfter = (n) => (n === 1 ? 'بيوم' : n === 2 ? 'بيومين' : n <= 10 ? `بـ${n} أيام` : `بـ${n} يومًا`);
/** سطر المهلة: «بقي 24 يومًا»، «اليوم آخر المهلة»، «تجاوز المهلة بيومين» */
export function leftAr(left) {
  if (left > 0) return `بقي ${dayWord(left)}`;
  if (left === 0) return 'اليوم آخر المهلة';
  return `تجاوز المهلة ${daysAfter(-left)}`;
}
// قريب: بقي أسبوع أو أقل، ومتأخر: بعد المهلة
export const SOON_DAYS = 7;
export const urgency = (left) => (left < 0 ? 'late' : left <= SOON_DAYS ? 'soon' : 'ok');

// تطبيع الاسم للتأكيد بكتابته: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والتطويل والمسافات وحالة الحروف
export function normName(s) {
  return String(s ?? '').normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
export const nameMatches = (typed, name) => !!normName(name) && normName(typed) === normName(name);

/** نص الشريط أعلى قائمة المشاركين: يقول ماذا تفعل. items من admin.erasures بأيامها.
 * decide: هل يقرر من يقرأ (المدير الأعلى). غيره لا يُقال له «قرر الآن» ثم تُعطَّل أزراره، بل لمن القرار */
export function bannerAr(items, { decide = true } = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a.days_left - b.days_left);
  const first = sorted[0];
  const who = first.name || first.email || 'مشارك';
  const tone = urgency(first.days_left);
  const whose = decide ? 'قرارك' : 'قرار المدير الأعلى';
  if (list.length === 1) {
    if (first.days_left < 0) return { tone, text: `تجاوز طلب حذف بيانات ${who} المهلة النظامية ${daysAfter(-first.days_left)}. ${decide ? 'قرر الآن.' : 'القرار للمدير الأعلى، فذكّره به.'}` };
    return { tone, text: `طلب حذف بيانات ينتظر ${whose}: ${who}، ${leftAr(first.days_left)}. ${decide ? 'افتح الطلب لتنفّذه أو ترفضه بسبب.' : 'لك أن تقرأه وتراسل صاحبه.'}` };
  }
  const late = list.filter((x) => x.days_left < 0).length;
  const n = list.length;
  const count = n === 2 ? `طلبا حذف بيانات ينتظران ${whose}` : `${n} طلبات حذف بيانات تنتظر ${whose}`;
  const nearest = first.days_left < 0 ? `منها ${late} تجاوز المهلة` : first.days_left === 0 ? 'أقربها ينتهي اليوم' : `أقربها ينتهي بعد ${dayWord(first.days_left)}`;
  return { tone, text: `${count}، ${nearest}.` };
}

export { ERASE_REPLY_DAYS };
