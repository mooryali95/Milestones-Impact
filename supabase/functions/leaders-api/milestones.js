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
  const w = known.map((d) => d || avg);
  const total = w.reduce((a, b) => a + b, 0);
  const span = daysBetween(startsOn, endsOn) + 1;
  let cursor = 0, acc = 0;
  seq.forEach((s, i) => {
    acc += w[i];
    const endIdx = i === seq.length - 1 ? span - 1 : Math.max(cursor, Math.round((acc / total) * span) - 1);
    out[s.key] = { start: addDays(startsOn, cursor), end: addDays(startsOn, endIdx) };
    cursor = Math.min(span - 1, endIdx + 1);
  });
  return out;
}

// جدول كما يُحفظ: مراحل معروفة فقط، وتواريخ صحيحة، ونهاية لا تسبق البداية
export function cleanSchedule(raw, stageKeys) {
  const keys = new Set(stageKeys || []);
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!keys.has(k) || !v || typeof v !== 'object') continue;
    const start = ISO.test(v.start || '') ? v.start : null;
    const end = ISO.test(v.end || '') ? v.end : null;
    if (!start && !end) continue;
    if (start && end && end < start) throw new Error('نهاية مرحلة قبل بدايتها');
    out[k] = { ...(start ? { start } : {}), ...(end ? { end } : {}) };
  }
  return out;
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
export function milestoneDue(m, { startsOn = null, endsOn = null, schedule = {} } = {}) {
  let base = null;
  if (m.anchor === 'date') return m.fixed_date || null;
  if (m.anchor === 'cohort_start') base = startsOn;
  else if (m.anchor === 'cohort_end') base = endsOn;
  else if (m.anchor === 'stage_start') base = schedule?.[m.stage_key]?.start || null;
  else base = schedule?.[m.stage_key]?.end || null;
  return base && ISO.test(base) ? addDays(base, Number(m.offset_days) || 0) : null;
}

// حالة كل معلم لمشارك: منجز، أو في الموعد، أو يستحق خلال 7 أيام، أو متأخر بعدد أيام.
// ctx: { stagesDone: Set, records: { [milestone_id]: { done_at, due_override } }, cohort: { starts_on, ends_on, schedule }, today }
export function milestoneStatuses(milestones, { stagesDone = new Set(), records = {}, cohort = {}, today = null } = {}) {
  const t = todayIso(today);
  const ctx = { startsOn: cohort.starts_on || null, endsOn: cohort.ends_on || null, schedule: cohort.schedule || {} };
  return (milestones || []).filter((m) => m.active !== false).map((m) => {
    const rec = records[m.id] || {};
    const due = rec.due_override || milestoneDue(m, ctx);
    const done = !!rec.done_at || (m.complete === 'stage' && m.stage_key && stagesDone.has(m.stage_key));
    let status, late_days = 0;
    // المنجز بعد موعده يبقى «منجزًا» ويحمل تأخره (done_at − due) فلا يختفي الخصم بالإنجاز
    if (done) { status = 'done'; if (rec.done_at && due) late_days = Math.max(0, daysBetween(due, String(rec.done_at).slice(0, 10))); }
    else if (!due) status = 'unscheduled';
    else if (t > due) { status = 'late'; late_days = daysBetween(due, t); }
    else status = daysBetween(t, due) <= 7 ? 'due_soon' : 'on_time';
    return { ...m, due, done, done_at: rec.done_at || null, extended: !!rec.due_override, status, late_days, note: rec.note || null, scores: rec.scores || {} };
  }).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || (a.sort ?? 0) - (b.sort ?? 0));
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
