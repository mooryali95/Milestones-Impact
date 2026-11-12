// ════════════════════════════════════════════════════════════════
// تقييم 360 للتطوير: المنطق الصافي (تصور 2026-11-11، اعتمده المالك)
// ════════════════════════════════════════════════════════════════
// docs/content/2026-11-11-تصور-تقييم-360-v1.md. بلا قاعدة ولا Deno، يُختبر في vitest (leaders-app/src/eval360.test.js).
// 360 للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد.
import { CONTACT_FREQ_AR, FEEDBACK_OPEN_AR, FEEDBACK_OPEN_MAX } from './labels.js';

// ── المرحلة 1: نموذج المقيّم ──
// مجموعات المقيّمين، والذات تجيب على ما يجيب عليه المقيّم حرفيًا
export const FEEDBACK_GROUPS = ['manager', 'peer', 'report', 'stakeholder'];

// عبارة معكوسة: أعلى درجاتها لأول خياراتها (M-B5 وI-B5 وL-B5 في v5). تبقى في القياس الذاتي لضبط ميل الموافقة،
// ولا تُعرض على المقيّم لأنها تربكه أكثر مما تضبطه
export function reversedItem(q) {
  const s = (q?.options || []).map((o) => Number(o.score)).filter((n) => Number.isFinite(n) && n >= 0);
  return s.length > 1 && s[0] > s[s.length - 1];
}

// ما يُعرض على مقيّم من مجموعة relation: observable_by إن عُلِّم (null = الجميع)، وإلا كل عبارة غير معكوسة.
// العكس يُستثنى بالترتيب نفسه ولو لم يُطبَّق ترحيل العمود بعد
export function raterItems(questions = [], relation) {
  return questions.filter((q) => (Array.isArray(q.observable_by) ? q.observable_by.includes(relation) : !reversedItem(q)));
}

export const CONTACT_FREQ = Object.keys(CONTACT_FREQ_AR);
export const OPEN_KEYS = Object.keys(FEEDBACK_OPEN_AR);

// الأسئلة المفتوحة: نص مقصوص لكل مفتاح معروف، وnull إن خلت كلها
export function cleanOpenAnswers(o) {
  const out = {};
  for (const k of OPEN_KEYS) {
    const v = String(o?.[k] ?? '').trim().slice(0, FEEDBACK_OPEN_MAX);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// ── المرحلة 2: الدورة والمجموعات ──
// القيم القابلة للضبط (الحدود والسقوف والنافذة والتذكير والفاصل بين الموجتين) من الإعدادات العامة
// (settings.js، المجموعة feedback360)، ويمررها الخادم في s. لا رقم منها هنا.
export const WAVES = ['t1', 't2'];
export const NOMINEE_GROUPS = FEEDBACK_GROUPS;   // من يُرشَّح: المدير والزملاء والفريق وأصحاب المصلحة (الذات ليست ترشيحًا)
// حالات الدورة بترتيبها: الترشيح، ثم اعتماد المستشار، ثم النافذة، ثم الإغلاق، ثم التسليم في الجلسة
export const CYCLE_STATUS = ['nominating', 'approval', 'open', 'closed', 'released', 'cancelled'];
export const CYCLE_STATUS_AR = {
  nominating: 'الترشيح', approval: 'بانتظار اعتماد المستشار', open: 'مفتوح للمقيّمين', closed: 'أُغلق، بانتظار جلسة الاستلام', released: 'سُلّم لك', cancelled: 'أُلغي',
};
const day = 864e5;

// سقف كل مجموعة: المدير واحد، وغيره من الإعدادات
export const groupCaps = (s) => ({ manager: 1, peer: s.max_peer, report: s.max_report, stakeholder: s.max_stakeholder });

// العدد في كل مجموعة من صفوف المقيّمين (بلا أسماء): المرشح أو المدعو، ومن أرسل
export function groupCounts(raters = []) {
  const out = Object.fromEntries(NOMINEE_GROUPS.map((g) => [g, { invited: 0, submitted: 0 }]));
  for (const r of raters) {
    if (!out[r.relation] || r.status === 'revoked') continue;
    out[r.relation].invited += 1;
    if (r.status === 'submitted') out[r.relation].submitted += 1;
  }
  return out;
}

// هل تكفي القائمة لإرسالها إلى المستشار: لا تتجاوز سقفًا، ومن غير المدير ما يكفي لإصدار التقرير (min_others).
// الإرسال يحتاج كذلك تقديرك الذاتي، فالتقرير يقارن به
export function nominationCheck(nominees, s, { selfDone = true } = {}) {
  const counts = groupCounts(nominees);
  const caps = groupCaps(s);
  for (const g of NOMINEE_GROUPS) if (counts[g].invited > caps[g]) return { ok: false, reason: 'over_cap', group: g, counts };
  const others = NOMINEE_GROUPS.filter((g) => g !== 'manager').reduce((n, g) => n + counts[g].invited, 0);
  if (others < s.min_others) return { ok: false, reason: 'too_few', need: s.min_others - others, counts };
  if (!selfDone) return { ok: false, reason: 'self', counts };
  return { ok: true, counts };
}

// هل يبدأ المشارك موجة: الأولى إن لم تكن، والثانية بعد إغلاق الأولى بفاصل round_gap_days على الأقل
export function nextWave(cycles = [], s, now = Date.now()) {
  const live = cycles.filter((c) => c.status !== 'cancelled');
  const t1 = live.find((c) => c.wave === 't1');
  if (!t1) return { ok: true, wave: 't1' };
  if (live.some((c) => c.wave === 't2')) return { ok: false, reason: 'done' };
  if (!['closed', 'released'].includes(t1.status) || !t1.closed_at) return { ok: false, reason: 't1_running' };
  const at = Date.parse(t1.closed_at) + s.round_gap_days * day;
  return now >= at ? { ok: true, wave: 't2' } : { ok: false, reason: 'gap', at: new Date(at).toISOString() };
}

// أيام التذكير التي حلّت ولم يُرسل تذكيرها بعد، من فتح النافذة
export function remindersDue(cycle, s, now = Date.now()) {
  if (cycle?.status !== 'open' || !cycle.opens_at) return [];
  const passed = (now - Date.parse(cycle.opens_at)) / day;
  const sent = new Set(cycle.reminded_days || []);
  return s.remind_days.filter((d) => passed >= d && !sent.has(d));
}

// وعد الإخفاء للمقيّم بحسب مجموعته: المدير يظهر باسم دوره (معلن له مسبقًا)، وغيره مجمّعًا مع min_group - 1 على الأقل
export function feedbackPromiseAr(relation, s) {
  if (relation === 'manager') return 'تقديرك يظهر للمشارك باسم دورك (المدير المباشر)، ولا يظهر اسمك. والملاحظات المكتوبة تظهر حرفيًا بلا نسبة إلى أحد.';
  const more = Math.max(1, s.min_group - 1);
  return `يُجمع تقديرك مع ${more === 1 ? 'مقيّم آخر' : more === 2 ? 'مقيّمَين آخرين' : `${more} مقيّمين آخرين`} على الأقل من مجموعتك، ولا يظهر منفردًا. والملاحظات المكتوبة تظهر حرفيًا بلا نسبة إلى أحد.`;
}
