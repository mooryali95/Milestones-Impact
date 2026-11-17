// ════════════════════════════════════════════════════════════════
// المدة الحرة والمعالم: جدول الدفعة، واستحقاق كل معلم، وتأخر المشارك
// ════════════════════════════════════════════════════════════════
// منطق بلا قاعدة بيانات، يستعمله الخادم واللوحتان فلا يرى أحد تاريخًا غير الآخر.
//
// جدول الدفعة (cohorts.schedule): { [stage_key]: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } }
//   مدة الدفعة حرة بالكامل (تاريخا البداية والنهاية)، وتواريخ كل مرحلة يضعها الأدمن،
//   أو يوزعها النظام نسبيًا على المدة بحسب duration_days ثم يعدّلها الأدمن.
// المعلم (program_milestones): مرتبط بحدث في مرحلة، أو بتاريخ يحدده الأدمن.
//   anchor: stage_end | stage_start | cohort_start | cohort_end | date
//   offset_days: إزاحة بالأيام (موجبة أو سالبة) عن نقطة الارتكاز
//   complete: stage (يكتمل آليًا باكتمال مرحلته) | manual (يعتمده الأدمن أو الخبير)
import { latinDigits } from './digits.js';   // الأرقام كما يكتبها الإنسان: مصدر واحد
import { stageWindows } from './stage-windows.js';   // النوافذ المحسوبة: مصدر واحد مع الخريطة والخط الزمني
const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toMs = (d) => new Date(`${d}T00:00:00Z`).getTime();
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => toIso(toMs(d) + Math.round(n) * DAY);
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const todayIso = (t) => toIso(new Date(t ?? Date.now()).getTime());

export const MILESTONE_ANCHOR_AR = {
  stage_end: 'نهاية مرحلة', stage_start: 'بداية مرحلة', cohort_start: 'بداية الدفعة', cohort_end: 'نهاية الدفعة', date: 'تاريخ محدد',
};
export const MILESTONE_COMPLETE_AR = { stage: 'آليًا باكتمال مرحلته', manual: 'باعتماد الأدمن أو الخبير' };
export const MILESTONE_STATUS_AR = { done: 'منجز', on_time: 'في الموعد', due_soon: 'يستحق قريبًا', late: 'متأخر', unscheduled: 'بلا موعد بعد' };

// توزيع المراحل على مدة الدفعة نسبيًا بحسب duration_days (مرحلة بلا أيام تأخذ نصيبًا متوسطًا).
// المراحل عند الطلب والاختيارية تمتد على مدة الدفعة كلها فلا تأخذ من نصيب غيرها.
// المراحل التي تسير معًا («تبدأ مع») تأخذ نصيبًا واحدًا بطول أطولها، كما في stageWindows.
export function distributeSchedule(stages, startsOn, endsOn) {
  if (!ISO.test(startsOn || '') || !ISO.test(endsOn || '') || endsOn < startsOn) return {};
  const live = (stages || []).filter((s) => s.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const mode = (s) => (s.rules && s.rules.mode) || 'required';
  const seq = live.filter((s) => mode(s) === 'required');
  const out = {};
  for (const s of live.filter((x) => mode(x) !== 'required')) out[s.key] = { start: startsOn, end: endsOn };
  if (!seq.length) return out;
  const known = seq.map((s) => Number(s.duration_days) || 0);
  const avg = known.filter(Boolean).length ? known.filter(Boolean).reduce((a, b) => a + b, 0) / known.filter(Boolean).length : 1;
  const weight = new Map(seq.map((s, i) => [s.key, known[i] || avg]));
  // «تبدأ مع» X (rules.with): المرحلة تنضم إلى مجموعة مرجعها إن كان إلزاميًا قبلها، والسلسلة (C مع B وB مع A) تُحل إلى A.
  // المجموعة نصيب واحد بطول أطول مراحلها، وكل مرحلة فيها تبدأ ببدايتها وتمتد بنسبة مدتها من أطولها
  const groups = [], groupOf = new Map();
  for (const s of seq) {
    const ref = s.rules && s.rules.unlock === 'with' && s.rules.with != null ? String(s.rules.with) : null;
    const g = ref != null ? groupOf.get(ref) : null;
    if (g) g.push(s); else groups.push([s]);
    groupOf.set(s.key, g || groups.at(-1));
  }
  const w = groups.map((g) => Math.max(...g.map((s) => weight.get(s.key))));
  const total = w.reduce((a, b) => a + b, 0);
  const span = daysBetween(startsOn, endsOn) + 1;
  let cursor = 0, acc = 0;
  groups.forEach((g, i) => {
    acc += w[i];
    const endIdx = i === groups.length - 1 ? span - 1 : Math.max(cursor, Math.round((acc / total) * span) - 1);
    const len = endIdx - cursor + 1;
    for (const s of g) {
      const own = weight.get(s.key) >= w[i] ? endIdx : Math.min(endIdx, cursor + Math.max(1, Math.round((weight.get(s.key) / w[i]) * len)) - 1);
      out[s.key] = { start: addDays(startsOn, cursor), end: addDays(startsOn, own) };
    }
    cursor = Math.min(span - 1, endIdx + 1);
  });
  return out;
}

// خطة الدفعة كما تُحفظ: مراحل معروفة فقط، وتواريخ صحيحة، ونهاية لا تسبق البداية، ومدة وإيقاف وتوازٍ بقيم صالحة
export function cleanSchedule(raw, stageKeys) {
  return cleanScheduleReport(raw, stageKeys).schedule;
}
// الصيغة الموسعة (البند 4.4 في تصور محرر رحلة الدفعة، الفجوة 6أ): لكل مرحلة days وstart وend وoff وwith وoffset، وكل
// مفتاح غيرها يُسقط. المدخل بلا أي قيمة صالحة ليس إسقاطًا (خانة فارغة). ولا يُمحى مدخل لأنه بلا تاريخ: المدة وحدها
// خطة كاملة، فحفظ أي إعداد أو ترقية نسخة لا يمحو خطة الدفعة. «تسير مع» مرحلة ليست في التعريف تُسقط مع إزاحتها.
// مع ما أُسقط منه (P5): مواعيد مكتوبة لمرحلة ليست في تعريف الدفعة (نسختها المثبتة أو برنامجها) لا تُحفظ،
// ويُقال ذلك برسالة بدل الإسقاط الصامت. titles: اسم كل مرحلة يُعرف اسمها
/** @param {any} raw @param {string[]} stageKeys @param {Record<string, string>} [titles] */
export function cleanScheduleReport(raw, stageKeys, titles = {}) {
  const keys = new Set(stageKeys || []);
  const schedule = {}, dropped = [];
  const int = (v, lo, hi, msg) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(latinDigits(v));
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(msg);
    return n;
  };
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!v || typeof v !== 'object') continue;
    const start = ISO.test(v.start || '') ? v.start : null;
    const end = ISO.test(v.end || '') ? v.end : null;
    const days = int(v.days, 0, 365, 'مدة المرحلة من 0 إلى 365 يومًا');
    const off = v.off === true ? true : undefined;
    let wth = v.with != null && v.with !== '' ? String(v.with) : undefined;
    let offset = int(v.offset, 0, 365, 'الإزاحة من 0 إلى 365 يومًا');
    if (!start && !end && days === undefined && !off && wth === undefined && offset === undefined) continue;
    if (!keys.has(k)) { dropped.push(k); continue; }
    if (start && end && end < start) throw new Error('نهاية مرحلة قبل بدايتها');
    if (wth !== undefined && (wth === k || !keys.has(wth))) { wth = undefined; offset = undefined; }
    const e = {
      ...(off ? { off } : {}), ...(days !== undefined ? { days } : {}), ...(wth !== undefined ? { with: wth } : {}),
      ...(offset !== undefined ? { offset } : {}), ...(start ? { start } : {}), ...(end ? { end } : {}),
    };
    if (Object.keys(e).length) schedule[k] = e;
  }
  const names = dropped.map((k) => `«${titles[k] || k}»`).join('، ');
  const message = dropped.length
    ? `لم تُحفظ مواعيد ${dropped.length === 1 ? `مرحلة ${names}` : `${dropped.length === 2 ? 'مرحلتين' : `${dropped.length} مراحل`}: ${names}`}، لأنها ليست من مراحل برنامج الدفعة أو نسختها المثبتة. بقية الجدول حُفظ.`
    : '';
  return { schedule, dropped, message };
}

// معلم كما يُحفظ
export function cleanMilestone(raw, stageKeys) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const title_ar = String(r.title_ar || '').trim().slice(0, 160);
  if (!title_ar) throw new Error('اسم المعلم مطلوب');
  const anchor = Object.hasOwn(MILESTONE_ANCHOR_AR, r.anchor) ? r.anchor : 'stage_end';
  const stage_key = r.stage_key ? String(r.stage_key) : null;
  if (stage_key && !(stageKeys || []).includes(stage_key)) throw new Error('المرحلة غير موجودة في البرنامج');
  if ((anchor === 'stage_end' || anchor === 'stage_start') && !stage_key) throw new Error('اختر المرحلة التي يرتبط بها المعلم');
  const fixed_date = anchor === 'date' ? (ISO.test(r.fixed_date || '') ? r.fixed_date : null) : null;
  if (anchor === 'date' && !fixed_date) throw new Error('اختر تاريخ المعلم');
  const off = Number(r.offset_days);
  const offset_days = anchor === 'date' || !Number.isFinite(off) ? 0 : Math.max(-365, Math.min(365, Math.round(off)));
  const complete = r.complete === 'manual' || !stage_key ? 'manual' : 'stage';
  return {
    title_ar, description_ar: String(r.description_ar || '').trim().slice(0, 1000) || null,
    stage_key, anchor, offset_days, fixed_date, complete,
    weight: Number.isFinite(Number(r.weight)) && r.weight !== '' && r.weight != null ? Math.max(0, Math.min(100, Math.round(Number(r.weight)))) : null,
    active: r.active !== false,
  };
}


// تمديد موعد معلم لمشارك: فارغ = إلغاء التمديد (null)، وإلا يوم صحيح بصيغة 2026-12-01 بأي أرقام.
// غير ذلك يُرفض برسالة، ولا يُحفظ null بصمت فيُلغى التمديد ويقال «تم» (التدقيق 2026-11-11، admin-program-6)
export function cleanDueOverride(raw) {
  const s = latinDigits(raw).trim();
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!ISO.test(s) || toIso(Date.UTC(y, m - 1, d)) !== s) throw new Error('اكتب الموعد الجديد يومًا صحيحًا بصيغة سنة-شهر-يوم، مثل 2026-12-01');
  return s;
}

// تاريخ استحقاق المعلم لدفعة: من نقطة ارتكازه في جدولها، أو null إن لم يتحدد بعد
export function milestoneDue(m, ctx = {}) {
  return milestoneDueInfo(m, ctx).due;
}
// الاستحقاق ومصدره (تصور محرر رحلة الدفعة، R0 «تاريخ واحد»): الجدول المكتوب للمرحلة أولًا، وإلا نافذتها المحسوبة
// من بداية الدفعة ومدد المراحل (stageWindows، المصدر نفسه الذي تعرضه الخريطة والخط الزمني)، فلا تبقى «نهاية X» بلا موعد
// وللدفعة تاريخ بداية. source: date | cohort | schedule | window | null، ويقرؤه حارس البريد (lateNoticeAllowed)
export function milestoneDueInfo(m, { startsOn = null, endsOn = null, schedule = {}, windows = null } = {}) {
  if (m.anchor === 'date') return { due: m.fixed_date || null, source: m.fixed_date ? 'date' : null };
  let base = null, source = null;
  if (m.anchor === 'cohort_start') { base = startsOn; source = 'cohort'; }
  else if (m.anchor === 'cohort_end') { base = endsOn; source = 'cohort'; }
  else {
    const start = m.anchor === 'stage_start';
    const own = schedule?.[m.stage_key]?.[start ? 'start' : 'end'] || null;
    const win = windows?.[m.stage_key]?.[start ? 'from' : 'to'] || null;
    base = own || win;
    source = own ? 'schedule' : win ? 'window' : null;
  }
  return base && ISO.test(base) ? { due: addDays(base, Number(m.offset_days) || 0), source } : { due: null, source: null };
}

// حالة كل معلم لمشارك: منجز، أو في الموعد، أو يستحق خلال 7 أيام، أو متأخر بعدد أيام.
// ctx: { stagesDone: Set, records: { [milestone_id]: { done_at, due_override } }, cohort: { starts_on, ends_on, schedule }, stages, today }
// stages: مراحل تعريف الدفعة، تُحسب منها النوافذ لما لم يُكتب له جدول. بلاها يبقى الحساب من الجدول المكتوب وحده
export function milestoneStatuses(milestones, { stagesDone = new Set(), records = {}, cohort = {}, stages = null, today = null } = {}) {
  const t = todayIso(today);
  const live = (stages || []).filter((s) => s.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  // الدفعة المفتوحة (is_default) بلا بداية واحدة (القرار 21 والبند 10 في التصور): مددها نسبية من دخول كل مشارك، فلا تؤرَّخ
  // معالمها بنافذة محسوبة من starts_on ولو ضُبط لها، وإلا صار كل من دخلها متأخرًا لحظة دخوله
  const windows = live.length && cohort?.starts_on && !cohort?.is_default ? stageWindows(live, cohort) : null;
  const ctx = { startsOn: cohort.starts_on || null, endsOn: cohort.ends_on || null, schedule: cohort.schedule || {}, windows };
  return (milestones || []).filter((m) => m.active !== false).map((m) => {
    const rec = records[m.id] || {};
    const info = milestoneDueInfo(m, ctx);
    const due = rec.due_override || info.due;
    const due_source = rec.due_override ? 'override' : info.source;
    const done = !!rec.done_at || (m.complete === 'stage' && m.stage_key && stagesDone.has(m.stage_key));
    let status, late_days = 0;
    // المنجز بعد موعده يبقى «منجزًا» ويحمل تأخره (done_at − due) فلا يختفي الخصم بالإنجاز
    if (done) { status = 'done'; if (rec.done_at && due) late_days = Math.max(0, daysBetween(due, String(rec.done_at).slice(0, 10))); }
    else if (!due) status = 'unscheduled';
    else if (t > due) { status = 'late'; late_days = daysBetween(due, t); }
    else status = daysBetween(t, due) <= 7 ? 'due_soon' : 'on_time';
    return { ...m, due, due_source, done, done_at: rec.done_at || null, extended: !!rec.due_override, status, late_days, note: rec.note || null, scores: rec.scores || {} };
  }).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || (a.sort ?? 0) - (b.sort ?? 0));
}

// حارس بريد «معلم متأخر» (القرار 19 في تصور محرر رحلة الدفعة): المعالم التي صارت مؤرخة بنافذة المرحلة (R0) لا يُرسل
// عنها ما تأخر قبل تاريخ النشر، فلا تنطلق موجة بريد عن الماضي. يُرسل فقط ما يقع موعده في هذا التاريخ أو بعده، أي ما
// صار متأخرًا بعد النشر. ويبقى المتأخر ظاهرًا في رحلة المشارك ولوحة الإدارة وخريطة الجهة كما هو، فالحارس للبريد وحده.
// والمعالم المؤرخة بالجدول المكتوب أو بتاريخ ثابت أو بتمديد كانت مؤرخة قبل R0 فلا يمسها
// R0_DATED_SINCE يوم البناء، ويُحدَّث إلى يوم الدمج الفعلي ضمن قائمة الدمج. ولمن نشر بعده بأيام فـcutoffFrom يقبل يومًا
// أحدث من البيئة (MILESTONE_R0_CUTOFF في admin.ts) ولا يقبل أقدم منه، فلا يُفتح البريد عن الماضي بخطأ في الإعداد
export const R0_DATED_SINCE = '2026-11-17';
export function cutoffFrom(value) {
  const v = String(value || '').trim();
  return ISO.test(v) && v > R0_DATED_SINCE ? v : R0_DATED_SINCE;
}
export function lateNoticeAllowed(m, grace = MILESTONE_GRACE_DAYS, since = R0_DATED_SINCE) {
  if (!m || m.status !== 'late' || !(m.late_days > grace)) return false;
  if (m.due_source === 'window' && String(m.due || '') < cutoffFrom(since)) return false;
  return true;
}

// ملخص المعالم في سطر: كم أُنجز، وكم تأخر، وأقرب استحقاق
// مهلة سماح: إنجاز خلال ثلاثة أيام من الموعد لا يُعدّ تأخرًا
export const MILESTONE_GRACE_DAYS = 3;
export function milestoneSummary(list) {
  const done = list.filter((m) => m.status === 'done').length;
  const late = list.filter((m) => m.status === 'late');
  const doneLate = list.filter((m) => m.status === 'done' && m.late_days > MILESTONE_GRACE_DAYS);
  const next = list.find((m) => m.status !== 'done' && m.due);
  return {
    total: list.length, done, late: late.length, max_late: late.reduce((a, m) => Math.max(a, m.late_days), 0),
    done_late: doneLate.length, max_done_late: doneLate.reduce((a, m) => Math.max(a, m.late_days), 0),
    next: next ? { id: next.id, title: next.title_ar, due: next.due, status: next.status } : null,
    pct: list.length ? Math.round((done / list.length) * 100) : null,
  };
}
