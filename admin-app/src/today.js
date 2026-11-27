// ════════════════════════════════════════════════════════════════
// مكتب اليوم (المرحلة 3أ من تصور لوحة الإدارة 4.3): منطق خالص بلا واجهة
// ════════════════════════════════════════════════════════════════
// لا يطلب شيئًا ولا يحسب ما يحسبه الخادم: الأرقام الأربعة من رد admin.inbox (مخزن pending.js نفسه) ورد admin.overview
// الذي تحمّله الشاشة أصلًا، وأحكام شارة الصحة من الحقائق نفسها التي ترسم بطاقاتها (ops-health.js وadmin.health وorg-hub.js).
import { orgReadinessOf } from './org-hub.js';
import { SOURCE_AR, ALERT_KINDS } from '../../supabase/functions/leaders-api/today-desk.js';
import { formatRoute } from './route.js';

// ── الأرقام الأربعة ──
// المنتظر طويلًا: أكثر من سبعة أيام بعمر البند نفسه في الصندوق (days من inbox.js)
export const STALE_DAYS = 7;
// «المشاركون في البرنامج»: الحالتان اللتان يعدّهما الرقم الرابع، وهما مرشح «في البرنامج» في المشاركين (البطاقة تفتحه)
export const IN_PROGRAM = ['placed', 'enrolled'];
export const PROGRAM_VIEW = 'inprogram';

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
    program: o?.success ? { n: IN_PROGRAM.reduce((a, k) => a + st(k), 0), of: o.total ?? 0 } : null,
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
  .map((o) => ({ o, r: orgReadinessOf(o) }))
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

// ── شريط «يحتاج انتباهك» في نظرة عامة (تصور تبويبات الإدارة 2026-11-24، المرحلة أ) ──
// «نظرة عامة» لا ترسم مكوّن مجال آخر: تقرأ حكمه وحده (healthProblems وفحوص admin.platform-health) سطرًا برابط إلى مكان
// إصلاحه. المصدر واحد: البنود نفسها التي تعرضها «الإعداد › صحة المنصة» ومركز البريد بتفاصيلها
export const HEALTH_HREF = '#/leaders/health';
export const STRIP_MAX = 5;
const tabHref = (k) => `#/leaders/${k}`;
// مرساة موضع الإصلاح في «صحة المنصة» من مفتاح البند نفسه (المرحلة 8): PlatformHealth.jsx يضع هذه المعرّفات على أقسامه وفحوصه
export function phAnchor(key) {
  if (key === 'system' || key === 'system-unread') return 'ph-system';
  if (key === 'launch') return 'ph-launch';
  if (key === 'orgs') return 'ph-orgs';
  if (key === 'ph-unread') return 'ph-checks';
  if (String(key).startsWith('ph-')) return `ph-check-${String(key).slice(3)}`;
  return null;
}
const healthAt = (key) => `${HEALTH_HREF}#${phAnchor(key)}`;
/**
 * أسطر الاستثناءات: ما المشكلة · أين تُصلح. قائمة فارغة حين يسلم كل شيء (والشريط يختفي كله).
 * @param {{ ops?: any, h?: any, orgs?: any[], canWrite?: boolean, withOrgs?: boolean, ph?: any }} d
 * @returns {{key: string, text: string, where: string, href: string, level: 'bad'|'warn'}[]}
 */
export function exceptionRows({ ops = null, h = null, orgs = [], canWrite = true, withOrgs = true, ph = null }) {
  const out = [];
  for (const p of healthProblems({ ops, h, orgs, canWrite, withOrgs })) {
    if (p.key.startsWith('ops-')) {
      const red = p.key === 'ops-red';
      out.push({ key: p.key, level: red ? 'bad' : 'warn', where: 'مركز البريد', href: tabHref('mailcenter'),
        text: p.key === 'ops-unread' ? 'تعذّرت قراءة صحة البريد والتنبيه' : ops.verdict.title || p.label });
    } else if (p.key === 'system-unread') out.push({ key: p.key, level: 'warn', where: 'حالة النظام', href: healthAt(p.key), text: 'تعذّرت قراءة حالة النظام، فلا يُعرف إن كانت سليمة' });
    else if (p.key === 'system') {
      const blocking = pendingOf(h).filter((m) => m.gate === 'blocking').length;
      out.push({ key: p.key, level: blocking ? 'bad' : 'warn', where: 'حالة النظام', href: healthAt(p.key),
        text: blocking ? `حالة النظام: ${blocking === 1 ? 'ترحيل لم يُطبَّق' : `${blocking} ترحيلات لم تُطبَّق`} على الإنتاج` : 'حالة النظام تحتاج انتباهًا' });
    } else if (p.key === 'launch') {
      const all = h.readiness || [];
      out.push({ key: p.key, level: 'warn', where: 'جاهزية الإطلاق', href: healthAt(p.key), text: `جاهزية الإطلاق ${all.filter((x) => x.ok).length} من ${all.length}` });
    } else if (p.key === 'orgs') {
      const n = orgsReadinessRows(orgs).filter((x) => x.r.missing > 0).length;
      out.push({ key: p.key, level: 'warn', where: 'جاهزية الجهات', href: healthAt(p.key), text: n === 1 ? 'جهة واحدة غير جاهزة' : `${n} جهات غير جاهزة` });
    }
  }
  if (ph && !ph.success) out.push({ key: 'ph-unread', level: 'warn', where: 'الفحوص التشغيلية', href: healthAt('ph-unread'), text: 'تعذّرت قراءة فحوص المنصة' });
  for (const c of ph?.success && Array.isArray(ph.checks) ? ph.checks : []) {
    if (c.level === 'warn' || c.level === 'bad') out.push({ key: `ph-${c.key}`, level: c.level, where: c.label || 'الفحوص التشغيلية', href: healthAt(`ph-${c.key}`), text: `${c.label}: ${c.line}` });
  }
  // الأشد أولًا، والترتيب داخل الدرجة كما جاء
  return out.filter((x) => x.level === 'bad').concat(out.filter((x) => x.level !== 'bad'));
}


// ── الرأس ──
// التحية بساعة الرياض (UTC+3 طوال العام، بلا توقيت صيفي)
export const riyadhHour = (now = new Date()) => (new Date(now).getUTCHours() + 3) % 24;
export const greetingAr = (now = new Date()) => (riyadhHour(now) < 12 ? 'صباح الخير' : 'مساء الخير');

// ── التنبيهات ونبض الدفعات (المرحلة 3ب): الحساب كله في الخادم (admin.today ← today-desk.js)، وهنا العرض وحده ──

// وجهة التنبيه: ملف الجهة أو الدفعة أو الخبير بمعرّفه، في تبويبه القائم
// query: ما بعد «?» حين يفتح التنبيه عرضًا بعينه (المتأخرون في «المتابعة»)
export const alertHref = (a) => formatRoute({ ctx: 'leaders', tab: a.target?.tab, id: a.target?.id || undefined }) + (a.target?.query ? `?${a.target.query}` : '');

/**
 * سطر خافت بما لم يُقرأ: لا يُفهم غياب التنبيه أو النبض «لا شيء» وهو «لم يُفحص».
 * @param {any} t رد admin.today (أو null قبل وصوله)
 * @returns {string|null}
 */
export function deskNote(t) {
  if (!t) return null;
  if (!t.success) return 'تعذّرت قراءة التنبيهات الآن، فلا يُعرف إن كان فيها ما يحتاج انتباهك.';
  const src = (t.skipped || []).map((k) => SOURCE_AR[k] || k);
  if (!src.length) return null;
  const kinds = (t.unchecked || []).map((k) => ALERT_KINDS[k]?.label).filter(Boolean);
  return `تعذّرت قراءة: ${src.join('، ')}.${kinds.length ? ` لم يُفحص: ${kinds.join('، ')}.` : ''} ما يظهر هنا ناقص.`;
}

// ── «ما يحتاج انتباهك» (المرحلة 8، النظرة العامة البند 1): قسم عرض واحد من مصدرين كما هما ──
// exceptionRows (أحكام الصحة وموضع إصلاحها) وتنبيهات admin.today (deskOf في الخادم). لا يحسب حكمًا جديدًا: يوحّد الشكل
// {key, level, text, where, href}، ويرتب bad ثم warn (والترتيب داخل الدرجة كما جاء من كل مصدر، الاستثناءات أولًا)،
// ويزيل المكرر بالمفتاح الثابت (البند الواحد لا يظهر مرتين ولو جاء من المصدرين أو تكرر في أحدهما).
// الصندوق (قرارات اليوم) ليس مصدرًا هنا: القرارات أفعال، وهذا تنقل.
const ALERT_WHERE = { orgs: 'ملف الجهة', programs: 'ملف الدفعة', experts: 'ملف الخبير' };
export const alertKey = (a) => `alert:${a.id}`;
/**
 * @param {ReturnType<typeof exceptionRows>} exc
 * @param {any} t رد admin.today
 * @returns {{key: string, kind: string, level: 'bad'|'warn', text: string, where: string, href: string, source: 'health'|'alert'}[]}
 */
export function attentionRows(exc = [], t = null) {
  const alerts = (t?.success ? t.alerts || [] : []).map((a) => ({
    key: alertKey(a), kind: a.kind, level: a.severity === 'bad' ? 'bad' : 'warn', text: a.text, where: ALERT_WHERE[a.target?.tab] || 'افتحه', href: alertHref(a), source: 'alert',
  }));
  const all = [...(exc || []).map((x) => ({ ...x, kind: x.key, source: 'health' })), ...alerts];
  const seen = new Set();
  const uniq = all.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
  return uniq.filter((x) => x.level === 'bad').concat(uniq.filter((x) => x.level !== 'bad'));
}
