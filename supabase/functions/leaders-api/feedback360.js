// ════════════════════════════════════════════════════════════════
// تقييم 360 للتطوير: المنطق الصافي (تصور 2026-11-11، اعتمده المالك)
// ════════════════════════════════════════════════════════════════
// docs/content/2026-11-11-تصور-تقييم-360-v1.md. بلا قاعدة ولا Deno، يُختبر في vitest (leaders-app/src/eval360.test.js).
// 360 للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد.
import { CONTACT_FREQ_AR, FEEDBACK_GROUP_AR, FEEDBACK_OPEN_AR, FEEDBACK_OPEN_MAX } from './labels.js';
import { DIMENSIONS } from './logic.js';

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

// ── المرحلة 3: التقرير ──
// للتطوير وحده، ولا ترتيب بين المشاركين. القيم القابلة للضبط (حد الإخفاء، وحد الإصدار، وفرق الفجوة، ومراسي السلم)
// من الإعدادات العامة في s. المصدر الواحد للتقرير: يقرؤه المشارك والمستشار والإدارة من هذه الدالة نفسها.
const OTHER_GROUPS = ['peer', 'report', 'stakeholder'];
// عبارات التقرير: ما عُرض على مجموعة واحدة من المقيّمين على الأقل (المعكوسة للذات وحدها فلا تدخله)
/** @param {any[]} questions @returns {any[]} */
export const reportItems = (questions = []) => questions.filter((q) => NOMINEE_GROUPS.some((g) => raterItems([q], g).length));
// الدرجة على سلم 1 إلى 5 من درجة الخيار المخزنة (0 إلى 4)، و«لا أستطيع الحكم» (سالبة) بلا قيمة
export function scaleValue(q, k) {
  const sc = Number(q?.options?.[k]?.score);
  return k == null || !Number.isFinite(sc) || sc < 0 ? null : sc + 1;
}
const r1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
// ترتيب ثابت للملاحظات يبدو عشوائيًا ولا يتغير بين فتح وآخر (ولا يتبع ترتيب الإرسال فيكشف صاحبه)
function seeded(list, seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const key = (t) => { let x = h; for (const ch of t) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };
  return [...list].sort((a, b) => key(a) - key(b));
}
export const SPREAD_AR = { agree: 'متفقون', mixed: 'متباينون قليلًا', split: 'مختلفون' };
const spreadOf = (vals) => {
  if (vals.length < 2) return null;
  const range = Math.max(...vals) - Math.min(...vals);
  return { range, key: range <= 1 ? 'agree' : range <= 2 ? 'mixed' : 'split' };
};

// أعمدة التقرير بقواعد الإخفاء: المدير وحده باسم دوره، وكل مجموعة بلغت min_group وحدها، وما دونه يُجمع في «آخرون»
// إن بلغ الحد، وإلا يُضم إلى أكبر مجموعة ظاهرة (فلا يُستنتج بالطرح من عمود «كل المقيّمين»)، ثم «كل المقيّمين».
/** @param {any[]} submitted @param {any} s @returns {any[]} */
export function reportColumns(submitted, s) {
  const by = (g) => submitted.filter((r) => r.relation === g);
  const cols = [];
  const mgr = by('manager');
  if (mgr.length) cols.push({ key: 'manager', label_ar: FEEDBACK_GROUP_AR.manager, members: mgr, min: 1 });
  const shown = OTHER_GROUPS.filter((g) => by(g).length >= s.min_group).map((g) => ({ key: g, label_ar: FEEDBACK_GROUP_AR[g], members: by(g), min: s.min_group }));
  const small = OTHER_GROUPS.filter((g) => by(g).length && by(g).length < s.min_group);
  const pool = small.flatMap(by);
  cols.push(...shown);
  if (pool.length >= s.min_group) cols.push({ key: 'others', label_ar: FEEDBACK_GROUP_AR.others, members: pool, min: s.min_group, merged: small });
  else if (pool.length) {
    const target = [...shown].sort((a, b) => b.members.length - a.members.length)[0];
    if (target) { target.members = [...target.members, ...pool]; target.merged = small; target.label_ar = `${target.label_ar} ومن ضُمّ إليهم`; }
  }
  cols.push({ key: 'all', label_ar: 'كل المقيّمين', members: submitted, min: s.min_group });
  return cols;
}

// التقرير كاملًا. items: عبارات reportItems بخياراتها · selfAnswers: { [qid]: k } · raters: صفوف الدورة (كل الحالات)
// previous: تقرير الموجة الأولى (للموجة الثانية): يُضاف إلى كل إطار ما كان فيها لك وللمقيّمين
/** @param {{ items?: any[], selfAnswers?: Record<string, number>, raters?: any[], s: any, seed?: string, previous?: any }} d @returns {any} */
export function feedbackReport({ items = [], selfAnswers = {}, raters = [], s, seed = '', previous = null }) {
  const counts = groupCounts(raters);
  const submitted = raters.filter((r) => r.status === 'submitted');
  const nonManager = submitted.filter((r) => r.relation !== 'manager').length;
  const invited = NOMINEE_GROUPS.reduce((n, g) => n + counts[g].invited, 0);
  const base = { counts, response: { invited, submitted: submitted.length }, scale: s.scale_labels, gap_points: s.gap_points };
  if (nonManager < s.min_others) return { ...base, releasable: false, need: s.min_others - nonManager };
  const cols = reportColumns(submitted, s);
  const cell = (col, vals, raterCount) => (raterCount >= col.min && vals.length ? { avg: mean(vals), n: raterCount } : null);
  const rows = items.map((q) => {
    const cells = {};
    let allVals = [];
    for (const col of cols) {
      const rated = col.members.filter((r) => scaleValue(q, r.answers?.[q.id]?.now) != null);
      const vals = rated.map((r) => scaleValue(q, r.answers[q.id].now));
      // خلية العبارة تُحجب إن قلّ من قدّرها عن حد عمودها («لا أستطيع الحكم» تُنقص العدد). و«كل المقيّمين» يحتاج
      // الحد من غير المدير، وإلا استُنتج بالطرح متوسط من قلّوا عنه بمعرفة تقدير المدير الظاهر
      cells[col.key] = cell(col, vals, col.key === 'all' ? rated.filter((r) => r.relation !== 'manager').length : rated.length);
      if (col.key === 'all') allVals = vals;
    }
    return { id: q.id, code: q.code || null, dimension: q.dimension, text: q.text_rater_ar || q.text_ar || q.text || '', self: scaleValue(q, selfAnswers?.[q.id]), cells,
      na: submitted.length - allVals.length, spread: allVals.length >= s.min_group ? spreadOf(allVals) : null };
  });
  const dims = DIMENSIONS.map((d) => {
    const own = items.filter((q) => q.dimension === d);
    if (!own.length) return null;
    const selfVals = own.map((q) => scaleValue(q, selfAnswers?.[q.id])).filter((v) => v != null);
    const cells = {};
    for (const col of cols) {
      const vals = [];
      let raterCount = 0;
      for (const r of col.members) {
        const mine = own.map((q) => scaleValue(q, r.answers?.[q.id]?.now)).filter((v) => v != null);
        if (mine.length) { if (col.key !== 'all' || r.relation !== 'manager') raterCount += 1; vals.push(...mine); }
      }
      cells[col.key] = cell(col, vals, raterCount);
    }
    const prev = previous?.dims?.find((x) => x.dimension === d) || null;
    return { dimension: d, self: mean(selfVals), cells, prev: prev ? { self: prev.self, all: prev.cells?.all?.avg ?? null } : null };
  }).filter(Boolean);
  const scored = rows.filter((x) => x.cells.all);
  const gapOf = (x) => (x.self == null ? null : r1(x.cells.all.avg - x.self));
  const pick = (x) => ({ id: x.id, text: x.text, dimension: x.dimension, self: x.self, others: x.cells.all.avg, diff: gapOf(x), spread: x.spread });
  const strengths = scored.filter((x) => gapOf(x) != null && gapOf(x) >= s.gap_points).sort((a, b) => gapOf(b) - gapOf(a)).map(pick);
  const blind = scored.filter((x) => gapOf(x) != null && gapOf(x) <= -s.gap_points).sort((a, b) => gapOf(a) - gapOf(b)).map(pick);
  const ranked = [...scored].sort((a, b) => b.cells.all.avg - a.cells.all.avg || String(a.id).localeCompare(String(b.id)));
  const top = ranked.slice(0, 3);
  const bottom = ranked.slice(3).reverse().slice(0, 3);
  const comments = Object.fromEntries(OPEN_KEYS.map((k) => [k, seeded(submitted.filter((r) => !r.comment_hidden).map((r) => r.open_answers?.[k]).filter(Boolean), `${seed}:${k}`)]));
  return {
    ...base, releasable: true,
    columns: cols.map(({ key, label_ar, members, merged }) => ({ key, label_ar, n: members.length, ...(merged ? { merged: merged.map((g) => FEEDBACK_GROUP_AR[g]) } : {}) })),
    dims, items: rows, strengths, blind, top: top.map(pick), bottom: bottom.map(pick), comments,
  };
}

// ما تراه الجهة: أعداد ونسبة استجابة دائمًا، ومتوسط كل إطار (الذات وكل المقيّمين) إن بلغ عدد التقارير org_min.
// لا صف فردي ولو وافق المشارك على اطلاع جهته على مستوياته (360 مستثنى منه)
/** @param {any[]} reports @param {any} s @returns {any} */
export function orgTotals(reports = [], s) {
  const ok = reports.filter((r) => r?.releasable);
  const invited = reports.reduce((n, r) => n + (r?.response?.invited || 0), 0);
  const submitted = reports.reduce((n, r) => n + (r?.response?.submitted || 0), 0);
  const out = { reports: ok.length, min: s.org_min, invited, submitted, response_pct: invited ? Math.round((submitted / invited) * 100) : null, dims: null };
  if (ok.length < s.org_min) return out;
  out.dims = DIMENSIONS.map((d) => {
    const xs = ok.map((r) => r.dims.find((x) => x.dimension === d)).filter(Boolean);
    return { dimension: d, self: mean(xs.map((x) => x.self).filter((v) => v != null)), all: mean(xs.map((x) => x.cells?.all?.avg).filter((v) => v != null)) };
  });
  return out;
}
