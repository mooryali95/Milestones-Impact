// ════════════════════════════════════════════════════════════════
// الرحلة في لمحة (J1b): نموذج عرض الخط الزمني للبرنامج والدفعة
// ════════════════════════════════════════════════════════════════
// دالة نقية واحدة journeyTimeline(resolved, { cohort, sessions, today }) تحول الرحلة كما تسري إلى نموذج عرض،
// والمكوّن (shared/ui/JourneyTimeline.jsx) يرسمه فقط بلا أي حساب.
// المصادر: النوافذ من stageWindows (stage-windows.js) التي تقرؤها خريطة الجهة أيضًا، والنصوص من labels.js،
// والمدة من durationAr، والجلسة بلا موعد «يُحدد لاحقًا» (J1) لا تاريخ 1970.
// البرنامج بلا دفعة: أسابيع نسبية من بداية افتراضية. الدفعة: تواريخها الحقيقية وخط اليوم وعداد ما ينقصه موعد.
// المراحل التي «تبدأ مع» مرجعها (P1) تُرسم في خانة واحدة بمسارات مكدسة («تسير معًا»).
import {
  ACTIVITY_KIND_AR, ACTIVITY_OWNER_AR, countAr, DIM_AR, LEVEL_AR, MODE_AR, PHASE_AR, TIMELINE_AR, TIMELINE_STATUS_AR,
} from './labels.js';
import { daysAr, durationAr, renderJourneyText, stageRules } from './journey.js';
import { completionSource, isUndated, SESSION_TBD_AR } from './logic.js';
import { addDays, daysBetween } from './milestones.js';
import { cohortPlan, planDaysOnly, planOffKeys } from './stage-windows.js';

// بداية افتراضية لسياق البرنامج: النوافذ تُحسب بالدالة نفسها ثم تُقرأ أيامًا من البداية
const EPOCH = '2000-01-03';
const PHASES = ['admission', 'qualification', 'impact'];

// أيقونة كل نوع (J1b): التدريب لوحة عرض، والقراءة كتاب، واللقاء تقويم، والتوجيه شخص وفقاعة...
export const ACTIVITY_ICON = Object.freeze({
  workshop: 'training', check: 'training', meeting: 'meeting', reading: 'book', coaching: 'coaching', upload: 'upload',
  form: 'form', auto: 'auto', video: 'video', curriculum: 'book', model: 'form', capstone: 'flag', survey: 'form', lab: 'target',
});

// المقياس الهجين الصريح: عرض المرحلة = max(14، min(المدة،28) + 40% مما زاد على 28) يومًا
export const timelineWeight = (days) => {
  const d = Math.max(0, Number(days) || 0);
  return Math.max(14, Math.min(d, 28) + 0.4 * Math.max(0, d - 28));
};

const fmtDay = (iso, opts = { day: 'numeric', month: 'long' }) => (iso
  ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { ...opts, timeZone: 'UTC' }) : '');
// يوم الجلسة بتوقيت الرياض، فلا ترجع جلسة مسائية يومًا
const sessionDay = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
const isoToday = (t) => sessionDay(t ?? Date.now());
// بعد «نحو» المثنى مجرور: «نحو أسبوعين»
const aboutWeeksAr = (n) => `نحو ${countAr(n, 'أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا')}`;
const round = (x) => Math.round(x * 100) / 100;
// «موعد واحد يُحدد لاحقًا»، «موعدان يُحددان لاحقًا»، «3 مواعيد تُحدد لاحقًا»، «12 موعدًا يُحدد لاحقًا»
export const undatedAr = (n) => (n === 1 ? 'موعد واحد يُحدد لاحقًا' : n === 2 ? 'موعدان يُحددان لاحقًا' : n <= 10 ? `${n} مواعيد تُحدد لاحقًا` : `${n} موعدًا يُحدد لاحقًا`);
// مدة المحور: بالحروف إن كانت أسابيع أو أشهرًا تامة، وإلا تقريبًا «نحو 3 أشهر» بدل «97 يومًا»
const approxAr = (d) => (d % 30 === 0 || d % 7 === 0 || d < 14 ? durationAr(d) || daysAr(d)
  : d >= 56 ? `نحو ${countAr(Math.round(d / 30), 'شهر', 'شهرين', 'أشهر', 'شهرًا')}` : aboutWeeksAr(Math.round(d / 7)));
const andAr = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join('، ')} و${list.at(-1)}`);

// من يكمل النشاط: من مصدر إكماله
function ownerOf(r) {
  if (completionSource(r) === 'auto') return 'system';
  if (r.kind === 'workshop') return 'admin';
  if (r.kind === 'coaching') return 'coach';
  if (r.kind === 'meeting') return 'expert';
  return 'participant';
}

/**
 * @param {{ stages?: any[], requirements?: any[] }} resolved الرحلة كما تسري: مراحل البرنامج ومتطلباته، أو تعريف الدفعة
 * @param {{ cohort?: any, sessions?: any[], today?: any, title?: string }} [opts]
 */
export function journeyTimeline(resolved, { cohort = null, sessions = [], today = null, title = '' } = {}) {
  // الموقوفة في هذه الدفعة (R2b) تختفي من الخط ويُزاح ما بعدها، وتبقى بطاقتها باهتة في تبويب «الرحلة»
  const offKeys = cohort ? planOffKeys(cohort.schedule) : new Set();
  const stages = (resolved?.stages || []).filter((s) => s.active !== false && !offKeys.has(s.key)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const reqs = resolved?.requirements || [];
  const t = isoToday(today);
  const isCohort = !!cohort;
  const base = { title: title || TIMELINE_AR.title, context: isCohort ? 'cohort' : 'program', dated: false, notice: null };
  if (!stages.length) {
    return { ...base, empty: true, empty_ar: TIMELINE_AR.no_stages, total_days: 0, total_label: '', phases: [], slots: [], stages: [], activities: [],
      ticks: [], today: null, counts: { stages: 0, phases: 0, activities: 0, optional: 0, undated: 0 }, cards: [], selected: null };
  }

  // النوافذ: تواريخ الدفعة إن عُرفت كلها، وإلا نسبية من بداية افتراضية (البرنامج، أو دفعة بلا تاريخ بداية ولا جدول)
  // خطة الدفعة (cohortPlan) مصدر النوافذ والمدد، بقاعدة النهاية الشاملة (القرار 18). الدفعة بلا تاريخ ترسم مددها هي
  // (days في خطتها) نسبيًا من البداية الافتراضية، لا مدد البرنامج
  const realPlan = isCohort ? cohortPlan(stages, cohort) : null;
  const dated = isCohort && stages.every((s) => realPlan.windows[s.key]);
  const plan = dated ? realPlan : cohortPlan(stages, { starts_on: EPOCH, schedule: isCohort ? planDaysOnly(cohort?.schedule) : {} });
  const windows = plan.byKey;
  const start = dated ? stages.map((s) => windows[s.key].from).sort()[0] : EPOCH;
  const day = (iso) => daysBetween(start, iso);
  if (isCohort && !dated) base.notice = TIMELINE_AR.no_dates;

  // الخانات: كل مرحلة خانة، والمرحلة التي «تبدأ مع» مرجعًا قبلها تنضم إلى خانة مرجعها (والسلسلة إلى أولها)
  const slotOf = new Map();
  const slots = [];
  for (const s of stages) {
    const r = stageRules(s);
    const ref = r.unlock === 'with' && r.with ? slotOf.get(r.with) : null;
    if (ref) { ref.stages.push(s.key); slotOf.set(s.key, ref); continue; }
    const slot = { key: s.key, stages: [s.key] };
    slots.push(slot);
    slotOf.set(s.key, slot);
  }
  // مدى كل خانة على المسار من مراحلها الإلزامية: المرحلة عند الطلب أو الاختيارية يمتد جدولها غالبًا على الدفعة كلها
  // (distributeSchedule)، فلو حُسبت لابتلعت خانتها ما بعدها ورُسم اليوم والجلسات في غير مرحلتها. خانة بلا إلزامية
  // تأخذ نافذتها محصورة بين نهاية ما قبلها وبداية ما بعدها، والخانات بعدها متتالية لا ترجع إلى الخلف
  const byKey = new Map(stages.map((s) => [s.key, s]));
  // المدى على المسار بنهاية مفتوحة: من أول يوم إلى اليوم التالي لآخر يوم (next)، فمرحلة بأسبوع تأخذ سبعة أيام من المسار
  const span = (k) => [day(windows[k].from), day(windows[k].next)];
  const required = (k) => stageRules(byKey.get(k)).mode === 'required';
  for (const slot of slots) {
    const req = slot.stages.filter(required);
    slot.anchored = req.length > 0;
    const w = (slot.anchored ? req : slot.stages).map(span);
    slot.from = Math.min(...w.map((x) => x[0]));
    slot.to = Math.max(...w.map((x) => x[1]));
  }
  let prevTo = null;
  slots.forEach((slot, i) => {
    if (prevTo != null) slot.from = Math.max(slot.from, prevTo);
    const next = slot.anchored ? null : slots.slice(i + 1).find((x) => x.anchored);
    if (next) slot.to = Math.min(slot.to, Math.max(next.from, slot.from));
    slot.to = Math.max(slot.to, slot.from);
    prevTo = slot.to;
  });
  // موضع المرحلة داخل خانتها: نافذتها محصورة في مدى الخانة
  const place = (k) => {
    const sl = slotOf.get(k);
    const [f, e] = span(k);
    const from = Math.min(Math.max(f, sl.from), sl.to);
    return [from, Math.min(Math.max(e, from), sl.to)];
  };
  let acc = 0;
  for (const slot of slots) {
    slot.days = slot.to - slot.from;
    slot.weight = timelineWeight(slot.days);
    slot.together = slot.stages.length > 1;
    slot.start = acc;
    acc += slot.weight;
  }
  const totalWeight = acc || 1;
  for (const slot of slots) { slot.at = round((slot.start / totalWeight) * 100); slot.width = round((slot.weight / totalWeight) * 100); }
  // موضع يوم على المسار بالدالة نفسها: داخل خانته بنسبة أيامها، وما بين الخانات يلتصق بحدها
  const pos = (d) => {
    for (const s of slots) {
      if (d < s.from) return s.at;
      if (d <= s.to) return round(s.at + (s.days ? ((d - s.from) / s.days) * s.width : 0));
    }
    return 100;
  };
  // النهاية والمدة من النوافذ نفسها لا من الخانات: أبعد نهاية بين كل المراحل
  const end = Math.max(...stages.map((s) => span(s.key)[1]));
  const totalDays = end - Math.min(...stages.map((s) => span(s.key)[0]));
  const titleOf = new Map(stages.map((s) => [s.key, renderJourneyText(s.title_ar, { reqs })]));

  // المراحل
  const statusOf = (w) => (!dated ? null : w.to < t ? 'done' : w.from <= t ? 'active' : 'upcoming');
  const stageOut = stages.map((s) => {
    const w = windows[s.key];
    const slot = slotOf.get(s.key);
    const d = w.days;
    const days = span(s.key)[1] - span(s.key)[0];
    const r = stageRules(s);
    const label = d ? durationAr(d) : renderJourneyText(s.duration_label || '', { reqs, durationDays: d }) || 'آنية';
    const refKey = slot.together && slot.stages[0] !== s.key ? slot.stages[0] : null;
    const withNote = refKey && r.with ? `تبدأ مع «${titleOf.get(r.with)}»` : slot.together ? 'تبدأ البقية معها' : '';
    const status = statusOf(w);
    const left = status === 'active' ? daysBetween(t, w.to) : null;
    return {
      key: s.key, title: titleOf.get(s.key), phase: PHASES.includes(s.phase) ? s.phase : 'qualification', days, label,
      weight: round(timelineWeight(days)), slot: slot.key, lane: slot.stages.indexOf(s.key), together: slot.together, with_note: withNote,
      // داخل الخانة: بداية المسار وعرضه بنسبة أيامه من أيام الخانة
      lane_at: slot.days ? round(((place(s.key)[0] - slot.from) / slot.days) * 100) : 0,
      lane_width: slot.days ? Math.max(8, round(((place(s.key)[1] - place(s.key)[0]) / slot.days) * 100)) : 100,
      bar: totalDays ? Math.max(4, round((Math.max(days, 1) / totalDays) * 100)) : 100,
      window: dated ? { from: w.from, to: w.to } : null, days_source: w.source, window_ar: dated ? (w.from === w.to ? fmtDay(w.from) : `${fmtDay(w.from)} إلى ${fmtDay(w.to)}`) : '',
      status, status_ar: status ? TIMELINE_STATUS_AR[status] : '', optional: r.mode !== 'required',
      today_ar: status === 'active' ? `اليوم ${fmtDay(t)}، ${left > 0 ? `بقي على نهاية المرحلة ${daysAr(left)}` : 'آخر يوم في المرحلة'}` : '',
      empty: false,
    };
  });
  const stageByKey = new Map(stageOut.map((s) => [s.key, s]));

  // المحاور: من أول مراحلها إلى آخرها على المقياس نفسه
  const phases = PHASES.map((key) => {
    const list = stageOut.filter((s) => s.phase === key);
    if (!list.length) return null;
    const from = Math.min(...list.map((s) => place(s.key)[0]));
    const to = Math.max(...list.map((s) => place(s.key)[1]));
    const ss = [...new Set(list.map((s) => s.slot))].map((k) => slots.find((x) => x.key === k));
    const at = Math.min(...ss.map((x) => x.at));
    const width = round(Math.max(...ss.map((x) => x.at + x.width)) - at);
    const together = ss.some((x) => x.together);
    const days = to - from;
    return { key, title: PHASE_AR[key], days, label: `${days ? approxAr(days) : 'آنية'}${together ? `، مراحل ${TIMELINE_AR.together}` : ''}`,
      // to على المسار نهاية مفتوحة (اليوم التالي لآخر يوم)، فتاريخ نهاية المحور آخر أيامه شاملًا (القرار 18)، والمحور الآني نقطة
      from: dated ? addDays(start, from) : null, to: dated ? addDays(start, Math.max(from, to - 1)) : null, at, width, together };
  }).filter(Boolean);

  // الأنشطة: المتطلبات الظاهرة في مراحل الرحلة، بترتيب المرحلة ثم ترتيبها
  const order = new Map(stages.map((s, i) => [s.key, i]));
  const list = reqs.filter((r) => r.active !== false && !r.hidden && order.has(r.stage_key))
    .sort((a, b) => order.get(a.stage_key) - order.get(b.stage_key) || (a.sort ?? 0) - (b.sort ?? 0));
  const mine = (sessions || []).filter((x) => x.active !== false && (!x.cohort_id || x.cohort_id === cohort?.id));
  const activities = list.map((r) => {
    const st = stageByKey.get(r.stage_key);
    const w = windows[r.stage_key];
    const own = isCohort ? mine.filter((x) => x.requirement_id === r.id) : [];
    const datedS = own.filter((x) => !isUndated(x));
    const undatedN = r.kind === 'workshop' && isCohort ? own.length - datedS.length + (own.length ? 0 : 1) : 0;
    const modes = [...new Set(own.map((x) => (x.mode === 'online' ? 'online' : 'in_person')))];
    const mode = modes.length > 1 ? 'hybrid' : modes[0] || (MODE_AR[r.config?.mode] && r.config.mode !== 'self' ? r.config.mode : null);
    const owner = ownerOf(r);
    const dates = datedS.map((x) => {
      const d = sessionDay(x.starts_at);
      const out = dated && (d < w.from || d > w.to);
      return { date: d, at: pos(day(d)), label: fmtDay(d), required: !!r.required, outside: out, session: x.id || null };
    }).sort((a, b) => a.date.localeCompare(b.date));
    const timing = owner === 'system' ? 'auto' : r.kind === 'workshop' ? (undatedN || !dates.length ? 'undated' : 'dated') : r.kind === 'coaching' ? 'booked' : 'self';
    const until = dated ? ` حتى ${fmtDay(w.to)}` : '';
    const when = timing === 'auto' ? `من حالة المشارك${dated ? ` خلال المرحلة حتى ${fmtDay(w.to)}` : ''}`
      : timing === 'booked' ? `يحجزه المشارك خلال المرحلة${until}`
        : timing === 'self' ? `خلال المرحلة${until}`
          : !isCohort ? TIMELINE_AR.program_undated
            : dates.length ? `${andAr(dates.map((x) => x.label))}${undatedN ? `، و${countAr(undatedN, 'موعد واحد', 'موعدان', 'مواعيد', 'موعدًا')} ${SESSION_TBD_AR}` : ''}`
              : SESSION_TBD_AR;
    const kindAr = ACTIVITY_KIND_AR[r.kind] || r.kind;
    const reqAr = r.required ? TIMELINE_AR.required : TIMELINE_AR.optional;
    const title = renderJourneyText(r.title_ar, { reqs: list });
    const level = r.level ? [r.dimension && DIM_AR[r.dimension], `المستوى ${LEVEL_AR[r.level] || r.level}`].filter(Boolean).join(' · ') : '';
    return {
      id: String(r.id || r.code), code: r.code || '', requirement_id: r.id || null, stage: r.stage_key, stage_title: st.title, title, kind: r.kind, kind_ar: kindAr,
      icon: ACTIVITY_ICON[r.kind] || 'form', required: !!r.required, mode, mode_ar: mode ? MODE_AR[mode] : '', owner, owner_ar: ACTIVITY_OWNER_AR[owner],
      level_ar: level, timing, undated: isCohort && timing === 'undated', undated_count: undatedN, dates, when_ar: when,
      outside: dates.some((x) => x.outside),
      aria_ar: [title, `مرحلة ${st.title}`, kindAr, reqAr, mode ? MODE_AR[mode] : '', when, ACTIVITY_OWNER_AR[owner], level].filter(Boolean).join('، '),
    };
  });
  for (const s of stageOut) {
    s.activities = activities.filter((a) => a.stage === s.key).map((a) => a.id);
    s.empty = !s.activities.length;
    s.undated = activities.some((a) => a.stage === s.key && a.undated);
  }

  // المسطرة: أسابيع نسبية في البرنامج، وأول كل شهر في الدفعة، ولا تتزاحم العلامات (فاصل 6% على الأقل)
  const raw = [{ d: 0, label: dated ? fmtDay(start) : 'البداية', edge: true }];
  if (dated) {
    let m = addDays(start, 0).slice(0, 8) + '01';
    for (let i = 0; i < 48; i++) {
      const [y, mo] = m.split('-').map(Number);
      m = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01`;
      if (day(m) >= end) break;
      raw.push({ d: day(m), label: fmtDay(m, { month: 'long' }) });
    }
  } else {
    for (let k = 1; k * 7 < end; k++) raw.push({ d: k * 7, label: k === 1 ? 'الأسبوع 1' : `الأسبوع ${k}` });
  }
  // آخر يوم في الرحلة شاملًا (القرار 18): اليوم الذي قبل نهاية المسار المفتوحة
  const endIso = addDays(start, Math.max(0, end - 1));
  raw.push({ d: end, label: dated ? fmtDay(endIso) : 'النهاية', edge: true });
  const ticks = [];
  for (const x of raw) {
    const at = pos(x.d);
    const prev = ticks.at(-1);
    if (prev && at - prev.at < 6) { if (x.edge) ticks[ticks.length - 1] = { at, label: x.label }; continue; }
    ticks.push({ at, label: x.label });
  }

  // اليوم: في الدفعة الجارية وحدها خط، وقبلها «تبدأ بعد» وبعدها «انتهت الدفعة»
  const running = dated && t >= start && t <= endIso;
  const todayOut = running ? { at: pos(day(t)), date: t, label: `اليوم ${fmtDay(t)}` } : null;
  const activeStages = stageOut.filter((s) => s.status === 'active');

  const counts = {
    stages: stageOut.length, phases: phases.length, activities: activities.length,
    optional: activities.filter((a) => !a.required).length, undated: activities.reduce((n, a) => n + (a.undated ? Math.max(1, a.undated_count) : 0), 0),
  };
  const sequential = (key) => stageOut.filter((s) => s.phase === key).reduce((n, s) => n + s.days, 0);
  const totalLabel = `${daysAr(totalDays)}${totalDays >= 14 ? `، ${aboutWeeksAr(Math.round(totalDays / 7))}` : ''}`;
  const cards = [];
  if (!isCohort || !dated) {
    cards.push({ key: 'duration', label: 'المدة', value: totalLabel });
    for (const ph of phases.filter((p) => p.together)) {
      const seq = sequential(ph.key);
      if (seq > ph.days) cards.push({ key: `phase-${ph.key}`, label: ph.title, value: `${durationAr(ph.days) || daysAr(ph.days)} بدل ${durationAr(seq) || daysAr(seq)} لو كانت متتابعة` });
    }
    cards.push({ key: 'stages', label: 'المراحل', value: `${stageOut.length} في ${countAr(phases.length, 'محور واحد', 'محورين', 'محاور', 'محورًا')}` });
    cards.push({ key: 'activities', label: 'الأنشطة', value: `${activities.length}${counts.optional ? `، منها ${counts.optional} اختيارية` : ''}` });
  } else {
    cards.push({ key: 'window', label: 'النافذة', value: `${fmtDay(start, { day: 'numeric', month: 'long', year: 'numeric' })} إلى ${fmtDay(endIso, { day: 'numeric', month: 'long', year: 'numeric' })}` });
    const now = t < start ? `تبدأ بعد ${daysAr(daysBetween(t, start))}` : t > endIso ? TIMELINE_AR.ended
      : `الأسبوع ${Math.floor(day(t) / 7) + 1}، ${activeStages.length > 1 ? `${countAr(activeStages.length, 'مرحلة', 'مرحلتان', 'مراحل', 'مرحلة')} ${TIMELINE_AR.together}` : activeStages[0]?.title || 'بين مرحلتين'}`;
    cards.push({ key: 'now', label: 'الآن', value: now });
  }
  if (isCohort) {
    cards.push({ key: 'undated', label: 'ينقص', value: counts.undated ? undatedAr(counts.undated) : 'كل المواعيد محددة', tone: counts.undated ? 'warn' : 'ok' });
  }

  // اللوحة تبدأ بأول نشاط ينقصه موعد في الدفعة، وإلا أول نشاط في المرحلة الجارية، وإلا أول نشاط
  const selected = (activities.find((a) => a.undated) || activities.find((a) => stageByKey.get(a.stage).status === 'active') || activities[0])?.id || null;

  return {
    ...base, dated, empty: false, total_days: totalDays, total_label: totalLabel,
    start: dated ? start : null, end: dated ? endIso : null,
    together_ar: TIMELINE_AR.together, outside_ar: TIMELINE_AR.outside,
    phases, slots: slots.map(({ key, stages: ks, at, width, together, days }) => ({ key, stages: ks, at, width, together, days,
      note_ar: together ? `${titleOf.get(ks[0])} و${countAr(ks.length - 1, 'مرحلة تبدأ', 'مرحلتان تبدآن', 'مراحل تبدأ', 'مرحلة تبدأ')} معها في الأسابيع نفسها` : '' })),
    stages: stageOut, activities, ticks, today: todayOut, counts, cards, selected,
  };
}
