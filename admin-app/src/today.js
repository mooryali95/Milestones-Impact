// ════════════════════════════════════════════════════════════════
// مكتب اليوم (المرحلة 3أ من تصور لوحة الإدارة 4.3): منطق خالص بلا واجهة
// ════════════════════════════════════════════════════════════════
// لا يطلب شيئًا ولا يحسب ما يحسبه الخادم: الأرقام الأربعة من رد admin.inbox (مخزن pending.js نفسه) ورد admin.overview
// الذي تحمّله الشاشة أصلًا، وأحكام شارة الصحة من الحقائق نفسها التي ترسم بطاقاتها (ops-health.js وadmin.health وorg-hub.js).
import { orgReadiness } from './org-hub.js';

// ── الأرقام الأربعة ──
// المنتظر طويلًا: أكثر من سبعة أيام بعمر البند نفسه في الصندوق (days من inbox.js)
export const STALE_DAYS = 7;

/**
 * الأرقام الأربعة من الصندوق والنظرة العامة. الرقم المجهول null (لا صفر كاذب): صندوق متعذر، أو بنود بلا عمر.
 * رد ناجح بلا قائمة (خادم أقدم من الواجهة) يُقرأ كما يقرؤه الصندوق: العدد من total، وما يحتاج القائمة مجهول.
 * partial: نوع متعذر في الصندوق (skipped)، فالأرقام الثلاثة الأولى أقل من الحقيقة وتُعلَّم «+».
 * @param {any} inbox رد admin.inbox
 * @param {any} o رد admin.overview
 */
export function todayNumbers(inbox, o) {
  const ok = !!inbox?.success;
  const listed = ok && Array.isArray(inbox.items);
  const items = listed ? inbox.items : [];
  const ages = items.map((i) => i.days).filter((d) => typeof d === 'number');
  // عمر البند من الخادم: بنود بلا عمر (خادم أقدم) لا تُعدّ «أقدم من سبعة أيام» صفرًا
  const aged = items.length === 0 || ages.length > 0;
  const st = (k) => o?.by_status?.[k] || 0;
  return {
    partial: ok && (inbox.skipped || []).length > 0,
    waiting: ok ? { n: inbox.total ?? items.length, oldest: ages.length ? Math.max(...ages) : null } : null,
    late: ok ? (inbox.late ?? (listed ? items.filter((i) => i.late).length : null)) : null,
    stale: listed && aged ? items.filter((i) => (i.days ?? -1) > STALE_DAYS).length : null,
    program: o?.success ? { n: st('placed') + st('enrolled'), of: o.total ?? 0 } : null,
  };
}

/**
 * سطر تحت رقم «القرارات المنتظرة»: لا يقول «لا شيء ينتظر» إلا وهو يعلم ذلك.
 * @param {ReturnType<typeof todayNumbers>} nums
 * @param {(days: number) => string} age صيغة العمر (ageAr)
 */
export function waitingSub(nums, age) {
  const w = nums.waiting;
  if (!w) return 'تعذّرت قراءة الصندوق';
  if (w.n === 0 && !nums.partial) return 'لا شيء ينتظر';
  if (w.oldest == null || !w.n) return '';
  return `أقدمها ${age(w.oldest)}`;
}

// عروض الصندوق التي تقود إليها الأرقام: فلتر فوق فلتر النوع، لا رابط جديد
export const INBOX_VIEWS = {
  late: { label: 'المتجاوز للمهلة', test: (i) => !!i.late },
  stale: { label: `المنتظر منذ أكثر من ${STALE_DAYS} أيام`, test: (i) => (i.days ?? -1) > STALE_DAYS },
};
export const inboxView = (items, view) => (INBOX_VIEWS[view] ? (items || []).filter(INBOX_VIEWS[view].test) : items || []);

// ── شارة الصحة ──
// ترحيلات لم تُطبَّق بوسمها من الخادم، وخادم قبل pending_migrations يُقرأ كل ما فيه حاجبًا كما كان
const pendingOf = (h) => h.pending_migrations || (h.missing_migrations || []).map((name) => ({ name, gate: 'blocking' }));
// حالة النظام من admin.health: ترحيلات لم تُطبَّق، وأسرار ناقصة، واقتراب البريد من سقفه، وما تعذّرت قراءته.
// المؤجل بقرار (gate: deferred) ليس خللًا: يبقى سطرًا في البطاقة ولا يفتح الشارة، وإلا بقيت مفتوحة ما دام التأجيل
export function systemIssues(h) {
  if (!h?.success) return false;
  const near = h.mail?.today >= h.mail?.cap * 0.8;
  const unread = h.migrations_ledger === false || h.mail?.today == null;
  return pendingOf(h).some((m) => m.gate !== 'deferred') || (h.missing_secrets || []).length > 0 || near || unread;
}
// هل تُرسم بطاقة «حالة النظام»؟ الخلل، أو المؤجل بقرار وحده سطرًا للعلم (الحكم الذي كانت البطاقة تظهر به)
export const systemNotes = (h) => !!h?.success && (systemIssues(h) || pendingOf(h).length > 0);

// جاهزية الجهات: سطر لكل جهة فعّالة بما بقي فيها (org-hub.js نفسه الذي في رأس صفحتها)، الأكثر نقصًا أولًا
export const orgsReadinessRows = (orgs) => (orgs || []).filter((o) => o.status === 'active')
  .map((o) => ({ o, r: orgReadiness({ org: o, access: o.access || null, journey: o.cohort_setup || null, members: o.stats?.total || 0, seatsUsed: o.seats_used ?? null, pending: o.stats?.pending_approval || 0 }) }))
  .sort((a, b) => b.r.missing - a.r.missing);

/**
 * ما يحتاج الانتباه في شارة الصحة، بالترتيب الذي تُعرض به بطاقاته. كل بند باسمه، ولا بند لما لا يُعرض لهذا المدير
 * (البوابات نفسها: صحة البريد والجاهزيتان لمن يكتب، وحالة النظام للجميع).
 * @param {{ ops?: {verdict?: any, failed?: boolean}|null, h?: any, orgs?: any[], canWrite?: boolean, withOrgs?: boolean }} d
 */
export function healthProblems({ ops = null, h = null, orgs = [], canWrite = true, withOrgs = true }) {
  const out = [];
  // المفتاح يحمل الدرجة: طيّ الشارة على الكهرماني لا يُبقيها مطوية حين يصير أحمر
  if (canWrite && ops) {
    if (ops.failed) out.push({ key: 'ops-unread', label: 'صحة البريد غير مقروءة' });
    else if (ops.verdict && ops.verdict.level !== 'green') out.push({ key: `ops-${ops.verdict.level}`, label: ops.verdict.level === 'red' ? 'عطل في البريد' : 'البريد والتنبيه' });
  }
  // admin.health متعذر: لا يُقال «سليم» عما لم يُقرأ
  if (!h?.success) out.push({ key: 'system-unread', label: 'حالة النظام غير مقروءة' });
  else if (systemIssues(h)) out.push({ key: 'system', label: 'حالة النظام' });
  if (canWrite && (h?.readiness || []).some((x) => !x.ok)) out.push({ key: 'launch', label: 'جاهزية الإطلاق' });
  if (canWrite && withOrgs && orgsReadinessRows(orgs).some((x) => x.r.missing > 0)) out.push({ key: 'orgs', label: 'جاهزية الجهات' });
  return out;
}

const needAr = (n) => (n === 1 ? 'أمر واحد يحتاج انتباهك' : n === 2 ? 'أمران يحتاجان انتباهك' : `${n} تحتاج انتباهك`);
// سطر الشارة: «كل شيء سليم»، أو العدد بأسماء ما فيه
// ومن لم تصل كل مصادره بعد «جارٍ الفحص»، فلا يظهر «سليم» ثم ينقلب
export const healthLine = (problems, checking = false) => (problems.length ? `${needAr(problems.length)}: ${problems.map((p) => p.label).join('، ')}` : checking ? 'جارٍ الفحص…' : 'كل شيء سليم');

// بصمة ما يحتاج الانتباه: اختيار المدير (طي أو فتح) مقرون بها، فخلل جديد يفتح الشارة ولو طواها قبله
export const problemsSig = (problems) => problems.map((p) => p.key).join(',');
/**
 * الشارة مطوية حين يسلم كل شيء، ومفتوحة عند الخلل، إلا أن يكون المدير اختار غير ذلك لهذه الحال نفسها في هذه الجلسة.
 * @param {string} sig بصمة الحال الآن
 * @param {{sig: string, open: boolean}|null} chosen آخر اختيار محفوظ للجلسة
 */
export const healthOpen = (sig, chosen = null) => (chosen && chosen.sig === sig ? !!chosen.open : sig !== '');

// ── الرأس ──
// التحية بساعة الرياض (UTC+3 طوال العام، بلا توقيت صيفي)
export const riyadhHour = (now = new Date()) => (new Date(now).getUTCHours() + 3) % 24;
export const greetingAr = (now = new Date()) => (riyadhHour(now) < 12 ? 'صباح الخير' : 'مساء الخير');
