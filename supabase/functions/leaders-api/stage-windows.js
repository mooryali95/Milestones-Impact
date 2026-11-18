// ════════════════════════════════════════════════════════════════
// خطة الدفعة ونوافذ المراحل: المصدر الواحد لتواريخ كل مرحلة في دفعة ومددها
// ════════════════════════════════════════════════════════════════
// cohortPlan(stages, cohort) هو المكان الوحيد الذي يُحسب فيه تاريخ مرحلة أو مدتها في دفعة (تصور محرر رحلة الدفعة، R2a):
// يقرؤه الخادم (رحلة المشارك والمعالم والخريطة والإجراء admin.cohort-plan) واللوحة (تبويب «الرحلة» ومعاينته الحية)، فلا
// يختلف تاريخ بين شاشة وأخرى. وstageWindows اسمه القديم لمن يستورده، يرجع النوافذ { from, to } وحدها كما كان.
// دالة نقية بلا قاعدة بيانات.
//
// خطة الدفعة في cohorts.schedule (البند 4.4 في التصور)، فروق الدفعة فوق نسختها فقط:
//   { [stage_key]: { days?, start?, end?, off?, with?, offset? } }
//   days          مدة خاصة بالدفعة بالأيام، وإلا مدة النسخة (duration_days)
//   start [, end] تاريخ مثبت: المرحلة مرساة يُزاح ما بعدها منها. المدخل القديم {start,end} يُقرأ هكذا من اليوم الأول
//   off           موقوفة في هذه الدفعة (R2b): لا نافذة لها ولا تأخذ من المسار يومًا، ويُزاح ما بعدها. تُرجع بعلامة off
//   with، offset  التوازي الخاص بالدفعة (R3a): with مفتاح مرحلة سابقة في المحور تسير معها، أو false لـ«لا تسير مع شيء»،
//                 وoffset أيام من بداية مرجعها (0 إلى مدته). بلاهما قاعدة النسخة (rules.with وrules.offset). الإزاحة تخطيط
//                 للتواريخ وحدها: الفتح يبقى مع بداية المرجع (القرار 6)
// قاعدة النهاية (القرار 18): النافذة شاملة الطرفين، فمرحلة بـN يوم من يوم س تنتهي س + N - 1 وما بعدها يبدأ في اليوم التالي.
// والمرحلة بلا مدة (0) نقطة في يوم بدايتها لا تأخذ من المسار شيئًا.
import { addDays, daysBetween } from './milestones.js';
import { daysAr, stagePhase, stageRules, untilOf } from './journey.js';
import { PHASE_AR } from './labels.js';

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

// حدود المدة (البند 4.6): من 1 إلى 365 يومًا للإلزامية، ومن 0 للاختيارية وعند الطلب
export const PLAN_DAYS_MAX = 365;
export const planDaysMin = (s) => (stageRules(s).mode === 'required' ? 1 : 0);

// المدة الخاصة بالدفعة من مدخل الخطة إن صلحت، وإلا null (تعود لمدة النسخة)
export function planDaysOf(entry) {
  const n = entry && typeof entry === 'object' ? entry.days : undefined;
  if (n === undefined || n === null || n === '') return null;
  const v = Number(n);
  return Number.isInteger(v) && v >= 0 && v <= PLAN_DAYS_MAX ? v : null;
}
// هل المدخل مثبت بتاريخ (المدخل القديم {start,end} أو تثبيت صريح)
export const planPinned = (entry) => !!(entry && (ISO.test(entry.start || '') || ISO.test(entry.end || '')));

// المراحل بمدتها الفعلية في الدفعة: duration_days يُعاد كتابته من days الخاص بها، فيصح نص {duration} عند المشارك
// وكل ما يقرأ المدة من المرحلة. التطبيق مرتين لا يغير شيئًا لأن days قيمة لا إضافة
export function planStages(stages, schedule) {
  const sched = schedule && typeof schedule === 'object' ? schedule : {};
  return (stages || []).map((s) => {
    const d = planDaysOf(sched[s.key]);
    return d == null ? s : { ...s, duration_days: d };
  });
}
// موقوفة في هذه الدفعة (R2b): off صريح وحده، فلا يوقف مرحلةً مدخلٌ تالف
export const planOff = (entry) => !!(entry && typeof entry === 'object' && entry.off === true);
/** مفاتيح المراحل الموقوفة في خطة @param {any} schedule @returns {Set<string>} */
export function planOffKeys(schedule) {
  const out = new Set();
  for (const [k, v] of Object.entries(schedule && typeof schedule === 'object' ? schedule : {})) if (planOff(v)) out.add(k);
  return out;
}

// الخطة بالمدد والإيقاف وحدهما، بلا تواريخ مثبتة: لما يُرسم نسبيًا من بداية افتراضية (الخط الزمني لدفعة بلا تاريخ بداية)،
// وللدفعة المفتوحة التي تملك الإيقاف والمدة بلا تواريخ (القرار 21)
export function planDaysOnly(schedule) {
  const out = {};
  for (const [k, v] of Object.entries(schedule && typeof schedule === 'object' ? schedule : {})) {
    const d = planDaysOf(v);
    // التوازي (R3a) ليس تاريخًا: يبقى مع المدد، فالمفتوحة تملكه (البند 4.5 القاعدة 7) والخط بلا تاريخ يرسمه
    const e = { ...(planOff(v) ? { off: true } : {}), ...(d != null ? { days: d } : {}), ...planWithOf(v) };
    if (Object.keys(e).length) out[k] = e;
  }
  return out;
}

// ══ التوازي الخاص بالدفعة (R3a) ══
// القواعد التي تقبل «تسير مع» في دفعة: ما يُفتح بعد ما قبله أو مع غيره. قواعد الفتح الأخرى (يوم ثابت، بعد مراحل، دائمًا،
// بيد الأدمن) للبرنامج وحده (القرار 2)، فلا تحولها خطة الدفعة إلى توازٍ
export const PLAN_WITH_UNLOCKS = Object.freeze(['previous', 'with']);
/** التوازي في مدخل الخطة إن صلح: { with?: مفتاح أو false، offset?: أيام } @param {any} entry */
export function planWithOf(entry) {
  if (!entry || typeof entry !== 'object') return {};
  /** @type {{ with?: string|false, offset?: number }} */
  const out = {};
  if (entry.with === false) out.with = false;
  else if (typeof entry.with === 'string' && entry.with) out.with = entry.with;
  const n = entry.offset;
  if (n !== undefined && n !== null && n !== '' && out.with !== false) {
    const v = Number(n);
    if (Number.isInteger(v) && v >= 0 && v <= PLAN_DAYS_MAX) out.offset = v;
  }
  // نهاية المسار المستمر لهذه الدفعة (T1): تخطيط للتواريخ مع with وoffset، فيمر معهما في كل ما يقرأ التوازي
  const u = untilOf(entry.until);
  if (u) out.until = u;
  return out;
}
const laneOfStage = (s) => stageRules(s).lane || 'stage';
/** هل المرحلة مسار مستمر (T1) @param {any} s */
export const planTrack = (s) => laneOfStage(s) === 'track';
/** هل المرحلة خدمة (T2، ب5.2): لا نافذة لها في الخطة ولا أيام ولا موضع في السلسلة @param {any} s */
export const planService = (s) => laneOfStage(s) === 'service';
const sortOf = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
/** المراحل بقواعد التوازي الفعلية في الدفعة: with وoffset من خطتها فوق قاعدة النسخة. يقرؤها cohortPlan (المجموعات والإزاحة)
 * والخط الزمني (الممرات) وتعريف الدفعة (cohortDefinition: «تسير مع» تُفتح مع بداية مرجعها، والإزاحة لا تقفل، القرار 6).
 * مرجع لا يسبقها في الترتيب أو من محور آخر أو غائب عن القائمة (موقوف، أو نسخة رُقّيت) يُتجاهل فتبقى قاعدة النسخة،
 * فلا يُقفل أحد إلى الأبد بمرجع لاحق. والحارس (planWithIssues) يرفضه قبل الحفظ. التطبيق مرتين لا يغير شيئًا
 * @param {any[]} stages @param {any} schedule */
export function planWithRules(stages, schedule) {
  const sched = schedule && typeof schedule === 'object' ? schedule : {};
  const list = stages || [];
  if (!list.some((s) => { const p = planWithOf(sched[s.key]); return p.with !== undefined || p.offset !== undefined || (p.until !== undefined && planTrack(s)); })) return list;
  const idx = new Map([...list].sort(sortOf).map((s, i) => [s.key, i]));
  const byKey = new Map(list.map((s) => [s.key, s]));
  return list.map((s) => {
    const p = planWithOf(sched[s.key]);
    // المسار المستمر (T1): مرجعه مرحلة متتابعة سابقة من أي طور، وإزاحته بلا سقف، ونهايته من خطة الدفعة فوق قاعدة النسخة.
    // و«لا شيء» لا يُقبل له (يبدأ مع مرجع دائمًا)، فتبقى قاعدة النسخة
    if (planTrack(s)) return trackRules(s, p, byKey, idx);
    // الخدمة (T2) لا تسير مع شيء في دفعة: إتاحتها من البرنامج
    if (planService(s)) return s;
    if (p.with === undefined && p.offset === undefined) return s;
    const r = stageRules(s);
    if (!PLAN_WITH_UNLOCKS.includes(r.unlock)) return s;
    const raw = s.rules && typeof s.rules === 'object' ? s.rules : {};
    const { unlock: _u, with: _w, offset: _o, ...rest } = raw;
    if (p.with === false) return { ...s, rules: rest };
    const target = p.with !== undefined ? p.with : r.unlock === 'with' ? r.with : null;
    if (!target) return s;
    const ref = byKey.get(target);
    if (!ref || target === s.key || !(idx.get(target) < idx.get(s.key)) || stagePhase(ref) !== stagePhase(s) || planTrack(ref) || planService(ref)) return s;
    // إزاحة الدفعة، وإلا إزاحة النسخة إن بقي مرجعها نفسه، وإلا من بدايته
    const off = p.offset !== undefined ? p.offset : target === r.with ? r.offset : 0;
    return { ...s, rules: { ...rest, unlock: 'with', with: target, ...(off ? { offset: off } : {}) } };
  });
}

function trackRules(s, p, byKey, idx) {
  if (p.with === undefined && p.offset === undefined && p.until === undefined) return s;
  const r = stageRules(s);
  const raw = s.rules && typeof s.rules === 'object' ? s.rules : {};
  let target = r.unlock === 'with' ? r.with : null;
  let off = r.offset;
  if (typeof p.with === 'string') {
    const ref = byKey.get(p.with);
    if (ref && p.with !== s.key && idx.get(p.with) < idx.get(s.key) && !planTrack(ref) && !planService(ref)) { target = p.with; off = p.with === r.with ? r.offset : 0; }
  }
  if (p.offset !== undefined && target) off = p.offset;
  const { unlock: _u, with: _w, offset: _o, until: _t, ...rest } = raw;
  const until = p.until !== undefined ? p.until : r.until;
  if (!target) return { ...s, rules: { ...rest, until } };
  return { ...s, rules: { ...rest, unlock: 'with', with: target, ...(off ? { offset: off } : {}), until } };
}

/** قواعد الفتح بعد إسقاط الموقوف (البند 4.4 والقرار 22): «بعد مراحل» يُحذف منها مفتاح الموقوفة، وإن فرغت صارت «بعد السابقة»،
 * فلا يُقفل أحد إلى الأبد. و«تبدأ مع» موقوفة يمنعها الحارس، فإن وُجدت (نسخة رُقّيت بعد الإيقاف) صارت «بعد السابقة» لا قفلًا دائمًا.
 * @param {any[]} stages المراحل الظاهرة بلا الموقوفة @param {Set<string>|string[]} offKeys
 * rule: القاعدة التي أُعيدت كتابتها («stages» بعد مراحل أو «with» تبدأ مع)، فتسمي نافذة الأثر كلًّا بكلماته
 * @returns {{ stages: any[], rewrites: { key: string, title: string, dropped: string[], to: string, rule: string }[] }} */
export function planRules(stages, offKeys) {
  const off = offKeys instanceof Set ? offKeys : new Set(offKeys || []);
  const rewrites = [];
  if (!off.size) return { stages: stages || [], rewrites };
  const out = (stages || []).map((s) => {
    const r = stageRules(s);
    const raw = s.rules && typeof s.rules === 'object' ? s.rules : {};
    if (r.unlock === 'stages' && r.after.some((k) => off.has(k))) {
      const after = r.after.filter((k) => !off.has(k));
      const { unlock: _u, after: _a, ...rest } = raw;
      rewrites.push({ key: s.key, title: s.title_ar || s.key, dropped: r.after.filter((k) => off.has(k)), to: after.length ? 'stages' : 'previous', rule: 'stages' });
      return { ...s, rules: after.length ? { ...rest, unlock: 'stages', after } : rest };
    }
    if (r.unlock === 'with' && r.with && off.has(r.with)) {
      const { unlock: _u, with: _w, ...rest } = raw;
      rewrites.push({ key: s.key, title: s.title_ar || s.key, dropped: [r.with], to: 'previous', rule: 'with' });
      return { ...s, rules: rest };
    }
    return s;
  });
  return { stages: out, rewrites };
}
// الخطة كما تُقرأ فعلًا لدفعة: المفتوحة (is_default) بمددها وحدها بلا تواريخ مثبتة (القرار 21)، وغيرها كما هي.
// يقرؤها cohortPlan ومواعيد المعالم (milestoneStatuses وplanImpact وتبويب «الرحلة») فلا يؤرَّخ معلم بتثبيت تتجاهله الخطة
export function planSchedule(cohort) {
  const c = cohort || {};
  return c.is_default ? planDaysOnly(c.schedule) : (c.schedule && typeof c.schedule === 'object' ? c.schedule : {});
}

// مجموعات «تبدأ مع» بترتيب أول ظهورها، كما يجمعها distributeSchedule: المرحلة تنضم إلى مجموعة مرجعها إن كان قبلها،
// والسلسلة (C مع B وB مع A) تُحل إلى A. المرجع اللاحق أو الغائب يجعلها مجموعة وحدها («بعد السابقة»)
export function withGroups(stages) {
  const groups = [], groupOf = new Map();
  for (const s of stages) {
    // المسار المستمر (T1) يسير بجانب السلسلة لا في مجموعة منها، فلا يصنع مجموعة ولا ينضم إليها
    // والخدمة (T2) خارج السلسلة كلها
    if (planTrack(s) || planService(s)) continue;
    const r = stageRules(s);
    const g = r.unlock === 'with' && r.with ? groupOf.get(r.with) : null;
    if (g) g.push(s); else groups.push([s]);
    groupOf.set(s.key, g || groups.at(-1));
  }
  return groups;
}

/** خطة الدفعة محسوبة: لكل مرحلة مدتها الفعلية ومصدرها ونافذتها إن عُرفت بداية، وتنبيهات الخطة.
 * المجموعة تبدأ معًا: أولها من المؤشر، وكل من «تبدأ مع» X من بداية X وتمتد بمدتها. المجموعة التالية تبدأ في اليوم التالي
 * لنهاية أطول مراحل المجموعة. المثبت مرساة: نافذته من تاريخه، وما بعده يُزاح منه.
 * الدفعة المفتوحة (is_default) بلا بداية واحدة: مددها نسبية من دخول كل مشارك، فلا تواريخ لها ولو ضُبط لها starts_on (القرار 21)
 * @param {any[]} stages مراحل تعريف الدفعة الظاهرة بترتيبها، بمدد النسخة
 * @param {any} [cohort] { starts_on, ends_on, schedule, is_default } */
export function cohortPlan(stages, cohort = {}) {
  const c = cohort || {};
  const sched = planSchedule(c);
  let cursor = c.is_default ? null : (ISO.test(String(c.starts_on || '').slice(0, 10)) ? String(c.starts_on).slice(0, 10) : null);
  const byKey = {};
  const order = [];
  const issues = [];
  // الموقوفة في هذه الدفعة (R2b) لا نافذة لها ولا تأخذ من المسار يومًا، فما بعدها يُزاح إلى مكانها
  const offRows = [];
  const onStages = [];
  for (const s of stages || []) {
    if (planOff(sched[s.key])) {
      const programDays = Math.max(0, Math.round(Number(s.duration_days) || 0));
      const row = { key: s.key, days: 0, program_days: programDays, own_days: planDaysOf(sched[s.key]), source: 'off', off: true, from: null, to: null, next: null };
      byKey[s.key] = row;
      offRows.push(row);
    } else onStages.push(s);
  }
  // التوازي الفعلي (R3a): with وoffset من الخطة فوق قاعدة النسخة
  const effAll = planWithRules(onStages, sched);
  // المسار المستمر (T1): تُحسب السلسلة أولًا وحدها، ثم صفوفه، فلا يدخل في المجموعات ولا المؤشر ولا النهاية ولا المدة
  const effTracks = effAll.filter(planTrack);
  // والخدمة (T2، ب5.2): لا نافذة لها ولا أيام، فلا تدخل السلسلة ولا النهاية ولا المدة. صفها بلا تواريخ بعلامتها
  const effServices = effAll.filter(planService);
  const effStages = effTracks.length || effServices.length ? effAll.filter((x) => !planTrack(x) && !planService(x)) : effAll;
  const titleOf = new Map((stages || []).map((s) => [s.key, s.title_ar || s.key]));
  for (const group of withGroups(effStages)) {
    let next = null;
    // البداية والنهاية النسبيتان داخل المجموعة (من أول يومها، والنهاية مفتوحة): منهما تنبيه التجاوز بتاريخ أو بلا تاريخ
    const rel = new Map();
    group.forEach((s, i) => {
      const entry = sched[s.key];
      const rr = stageRules(s);
      const refRow = i > 0 ? byKey[rr.with] : null;
      // الإزاحة من 0 إلى مدة المرجع (البند 4.6): ما زاد عليها (مدة المرجع قصرت بعد ضبطها) يُحصر في مدته ويُنبَّه
      const cap = refRow ? Math.max(0, refRow.days) : 0;
      const shift = refRow ? Math.min(rr.offset, cap) : 0;
      if (refRow && rr.offset > cap) issues.push({ level: 'warn', stage: s.key, code: 'offset_range', msg: `إزاحة «${titleOf.get(s.key)}» (${daysAr(rr.offset)}) أكبر من مدة «${titleOf.get(rr.with)}» (${cap ? daysAr(cap) : 'صفر'})، فتُحسب بمدتها` });
      const programDays = Math.max(0, Math.round(Number(s.duration_days) || 0));
      const own = planDaysOf(entry);
      let days = own ?? programDays;
      let source = own != null && own !== programDays ? 'cohort' : 'program';
      let from = null, to = null, nxt = null;
      if (planPinned(entry)) {
        // التاريخ المثبت (المدخل القديم {start,end}): البداية المكتوبة، والنهاية المكتوبة أو البداية بمدتها شاملة
        source = 'pinned';
        const start = ISO.test(entry.start || '') ? entry.start : null;
        const end = ISO.test(entry.end || '') ? entry.end : null;
        from = start || (refRow?.from ? addDays(refRow.from, shift) : cursor);
        if (from) {
          if (end) {
            // نهاية مكتوبة بلا بداية تسبق بدايتها المحسوبة: تُقرأ يومًا واحدًا عند نهايتها، وتُنبَّه
            if (!start && end < from) { issues.push({ level: 'warn', stage: s.key, code: 'pinned_order', msg: `نهاية «${s.title_ar || s.key}» المثبتة (${end}) قبل بدايتها المحسوبة (${from})` }); from = end; }
            to = end;
            days = daysBetween(from, to) + 1;
          } else to = days > 0 ? addDays(from, days - 1) : from;
          nxt = days > 0 ? addDays(to, 1) : from;
          if (start && cursor && i === 0 && start < cursor) issues.push({ level: 'warn', stage: s.key, code: 'pinned_order', msg: `تاريخ «${s.title_ar || s.key}» المثبت (${start}) يسبق نهاية ما قبلها` });
        }
      } else {
        from = i === 0 ? cursor : refRow ? (refRow.from ? addDays(refRow.from, shift) : null) : cursor;
        if (from) {
          to = days > 0 ? addDays(from, days - 1) : from;
          nxt = days > 0 ? addDays(to, 1) : from;
        }
      }
      if (stageRules(s).mode === 'required' && days === 0 && source !== 'pinned' && own != null) {
        issues.push({ level: 'warn', stage: s.key, code: 'zero_required', msg: `«${s.title_ar || s.key}» إلزامية بمدة صفر` });
      }
      const par = planWithOf(entry);
      const row = {
        key: s.key, days, program_days: programDays, source, from, to, next: nxt,
        // التوازي الفعلي: المرجع وإزاحته، ومصدره (خطة الدفعة أو النسخة)
        with: refRow ? rr.with : null, offset: shift, par_source: par.with !== undefined || par.offset !== undefined ? 'cohort' : 'program',
      };
      byKey[s.key] = row;
      order.push(row);
      const g0from = i === 0 ? from : byKey[group[0].key].from;
      const r0 = from && g0from ? daysBetween(g0from, from) : refRow ? (rel.get(rr.with)?.[0] ?? 0) + shift : 0;
      rel.set(s.key, [r0, r0 + days, source === 'pinned' && !from]);
      // أول المجموعة مثبتًا يضع نهايتها كما هو ولو سبق المؤشر، والبقية تمدها إن طالت
      if (nxt) next = source === 'pinned' && i === 0 ? nxt : later(next, nxt);
    });
    // تنبيه التجاوز (البند 4.2 د): «تسير مع» تنتهي بعد مرجعها. مسموح، والمجموعة تنتهي بأطول أعضائها فيطول محورها.
    // بالتواريخ إن عُرفت، وإلا بالأيام النسبية. المثبت بتاريخ بلا تواريخ لا يُقاس
    // مدى العضو في المجموعة [بداية، نهاية مفتوحة) بالأيام من أول يومها
    const spanOf = (k) => { const [a, e, unknown] = rel.get(k); return unknown ? null : [a, e]; };
    for (const s of group.slice(1)) {
      const row = byKey[s.key];
      if (!row.with) continue;
      const mine = spanOf(s.key), theirs = spanOf(row.with);
      if (!mine || !theirs) continue;
      const over = mine[1] - theirs[1];
      if (over <= 0) continue;
      const others = group.filter((x) => x.key !== s.key).map((x) => spanOf(x.key)).filter(Boolean).map((x) => x[1]);
      const ext = others.length ? mine[1] - Math.max(...others) : 0;
      issues.push({
        level: 'warn', stage: s.key, code: 'with_over', over, extends: Math.max(0, ext),
        msg: `«${titleOf.get(s.key)}» تنتهي بعد «${titleOf.get(row.with)}» بـ${daysAr(over)}${ext > 0 ? `، فيطول محور «${PHASE_AR[stagePhase(s)] || ''}» ${daysAr(ext)}` : ''}`,
      });
    }
    if (next) cursor = next;
  }
  // قاعدة «تُفتح يوم N» تبقى بتاريخها ولا تتبع المدد (القرار 20): تنبيه إن وقع يومها خارج نافذتها المخططة
  const start0 = c.is_default ? null : (ISO.test(String(c.starts_on || '').slice(0, 10)) ? String(c.starts_on).slice(0, 10) : null);
  for (const s of onStages) {
    const r = stageRules(s);
    const w = byKey[s.key];
    if (r.unlock !== 'day' || r.day == null || !start0 || !w?.from) continue;
    const open = addDays(start0, r.day);
    if (open < w.from || open > w.to) issues.push({ level: 'warn', stage: s.key, code: 'day_rule', msg: `«${s.title_ar || s.key}» تُفتح ${open} بقاعدة البرنامج، خارج نافذتها المخططة (${w.from} إلى ${w.to})` });
  }
  const dated = order.filter((x) => x.from);
  const first = dated.reduce((m, x) => (!m || x.from < m ? x.from : m), null);
  const end = dated.reduce((m, x) => later(m, x.to), null);
  const endsOn = ISO.test(String(c.ends_on || '').slice(0, 10)) ? String(c.ends_on).slice(0, 10) : null;
  const over = end && endsOn && !c.is_default && end > endsOn ? daysBetween(endsOn, end) : 0;
  if (over) issues.push({ level: 'warn', stage: null, code: 'over_end', msg: `تنتهي الرحلة بعد نهاية الدفعة بـ${daysAr(over)}` });
  const windows = {};
  for (const x of dated) windows[x.key] = { from: x.from, to: x.to };
  const trackRows = effTracks.length ? trackPlan(effTracks, { sched, byKey, order, first, end, endsOn: c.is_default ? null : endsOn, titleOf, issues, phaseOf: new Map((stages || []).map((x) => [x.key, stagePhase(x)])) }) : [];
  // بلا تواريخ (المفتوحة أو بلا بداية): مدة المسار إلى نهاية السلسلة أو طور أو مرحلة نسبية، من الخطة نفسها من بداية افتراضية
  // كما يرسمها الخط (journeyTimeline)، لا مدة البرنامج
  if (!c.relative_span && trackRows.some((x) => !x.from && x.until !== 'days')) {
    const rel = cohortPlan(stages, { starts_on: SPAN_EPOCH, schedule: planDaysOnly(c.schedule), relative_span: true });
    for (const x of trackRows) if (!x.from && x.until !== 'days') x.days = rel.byKey[x.key]?.days ?? null;
  }
  for (const x of trackRows) { byKey[x.key] = x; if (x.from) windows[x.key] = { from: x.from, to: x.to }; }
  const serviceRows = effServices.map((s) => ({
    key: s.key, lane: 'service', days: 0, program_days: Math.max(0, Math.round(Number(s.duration_days) || 0)), source: 'program',
    from: null, to: null, next: null, with: null, offset: 0, par_source: 'program',
  }));
  for (const x of serviceRows) byKey[x.key] = x;
  // الصفوف بترتيب المراحل، والموقوفة في مكانها بعلامتها (تُعرض باهتة وتعود بنقرة)
  const at = new Map((stages || []).map((s, i) => [s.key, i]));
  const all = [...order, ...trackRows, ...serviceRows, ...offRows].sort((a, b) => at.get(a.key) - at.get(b.key));
  return {
    dated: dated.length > 0 && dated.length === order.length, start: first, end, over,
    total_days: first && end ? daysBetween(first, end) + 1 : null,
    stages: all, byKey, windows, issues, off: offRows.map((x) => x.key),
    changed: all.filter((x) => x.source !== 'program' || x.par_source === 'cohort' || x.until_source === 'cohort').length,
    ...(trackRows.length ? { tracks: trackRows.map((x) => x.key) } : {}),
    ...(serviceRows.length ? { services: serviceRows.map((x) => x.key) } : {}),
  };
}

// صفوف المسار المستمر (T1، ب5.1): يبدأ مع مرجعه بعد إزاحته (بلا سقف بمدته)، وينتهي بـuntil: نهاية الرحلة (نهاية الدفعة في
// ملفها، وإلا نهاية السلسلة بالأيام النسبية)، أو مدته، أو نهاية طور، أو نهاية مرحلة. لا يطيل الرحلة ولا يحرك ما بعده.
// تنبيه واحد chain_end_mismatch إن انتهت السلسلة قبل نهاية الدفعة والمسار ممتد إليها (وبعدها يقوله over_end القائم)
function trackPlan(tracks, { sched, byKey, order, first, end, endsOn, titleOf, issues, phaseOf }) {
  const out = [];
  let warned = false;
  const phaseEnd = (ph) => order.filter((x) => x.to && phaseOf.get(x.key) === ph).reduce((m, x) => later(m, x.to), null);
  for (const s of tracks) {
    const r = stageRules(s);
    const entry = sched[s.key];
    const par = planWithOf(entry);
    const programDays = Math.max(0, Math.round(Number(s.duration_days) || 0));
    const own = planDaysOf(entry);
    const ref = r.unlock === 'with' && r.with ? byKey[r.with] : null;
    const shift = ref ? r.offset : 0;
    const from = ref ? (ref.from ? addDays(ref.from, shift) : null) : first;
    const until = r.until;
    let to = null;
    if (from) {
      if (until === 'days') { const d = own ?? programDays; to = d > 0 ? addDays(from, d - 1) : from; }
      else if (until.startsWith('stage:')) to = byKey[until.slice(6)]?.to || end;
      else if (until.startsWith('phase:')) to = phaseEnd(until.slice(6)) || end;
      else to = endsOn || end;
      if (!to) to = from;
      if (to < from) {
        issues.push({ level: 'warn', stage: s.key, code: 'until_before', msg: `نهاية «${titleOf.get(s.key)}» (${to}) قبل بدايته (${from})، فيُرسم يومًا واحدًا` });
        to = from;
      }
      if (until === 'journey_end' && endsOn && end && end < endsOn && !warned) {
        warned = true;
        issues.push({ level: 'warn', stage: null, code: 'chain_end_mismatch', msg: `تنتهي المراحل المتتابعة قبل نهاية الدفعة بـ${daysAr(daysBetween(end, endsOn))}، و«${titleOf.get(s.key)}» يمتد إلى نهاية الدفعة (${endsOn})` });
      }
    }
    const days = from && to ? daysBetween(from, to) + 1 : (until === 'days' ? own ?? programDays : programDays);
    out.push({
      key: s.key, lane: 'track', days, program_days: programDays, source: own != null && own !== programDays ? 'cohort' : 'program',
      from, to, next: to ? addDays(to, 1) : null,
      with: ref ? r.with : null, offset: shift, par_source: par.with !== undefined || par.offset !== undefined ? 'cohort' : 'program',
      until, until_source: par.until !== undefined ? 'cohort' : 'program',
    });
  }
  return out;
}

// نافذة كل مرحلة { from, to } من خطة الدفعة (cohortPlan)، بالاسم القديم والشكل القديم لكل من يستورده
export function stageWindows(stages, cohort = {}) {
  return cohortPlan(stages, cohort).windows;
}

// أين يقول الجدول إن الدفعة اليوم: المراحل التي تحوي نافذتها اليوم بترتيبها (أكثر من واحدة حين تسير معًا)، وإلا آخر مرحلة
// بدأت (بين مرحلتين). الرحلة تنتهي بأبعد نهاية بين كل المراحل لا بنافذة آخرها في الترتيب، فمرحلة قصيرة تسير مع أطول منها
// لا تنهيها
export function todayStages(stages, windows, today) {
  const t = isoDay(today);
  const inside = [];
  let started = null, end = null;
  for (const s of stages) {
    const w = windows[s.key];
    // المسار المستمر (T1) ليس «مرحلة اليوم» في الخريطة والتذكير، ولا يمد نهاية الرحلة
    if (!w || planTrack(s) || planService(s)) continue;
    if (!end || w.to > end) end = w.to;
    if (w.from <= t) started = s.key;
    if (w.from <= t && t <= w.to) inside.push(s.key);
  }
  if (!started || (end && t > end)) return [];
  return inside.length ? inside : [started];
}
// قيمة واحدة لموقع الدفعة (R3b، التوازي 2): أول الجارية اليوم في الترتيب، أي أول مجموعتها «تسير معًا»، كما يرى المشارك
// مرحلته الحالية أول مجموعته (currentStages في journey-map.js)
export function todayStage(stages, windows, today) {
  return todayStages(stages, windows, today)[0] || null;
}

// ══ مدة الرحلة المخططة (R3b) ══
const SPAN_EPOCH = '2000-01-02';
/** مدة الرحلة بالأيام من خطتها، لا مجموع مدد مراحلها: المجموعة «تسير معًا» تأخذ أبعد نهاية بين أعضائها بإزاحاتهم (cohortPlan)،
 * والمرحلة بلا مدة لا تأخذ يومًا. نسبية من بداية افتراضية، فلا يدخلها تاريخ مثبت. المصدر الواحد لكل نص مدة كلية يراه المشارك
 * (Paywall: «نحو N أسابيع من بداية دفعتك»). stages: مراحل الرحلة بمددها وقواعدها الفعلية (رحلة المشارك بعد خطة دفعته)،
 * وschedule اختياري لمراحل نسخة لم تُطبق عليها خطة الدفعة بعد (مددها وتوازيها وإيقافها وحدها)
 * @param {any[]} stages @param {any} [schedule] @returns {number} */
export function planSpanDays(stages, schedule = {}) {
  const list = [...(stages || [])].filter((s) => s && s.active !== false);
  if (!list.length) return 0;
  const p = cohortPlan(list, { starts_on: SPAN_EPOCH, schedule: planDaysOnly(schedule) });
  // المسار المستمر (T1) لا يدخل في مدة الرحلة: ينتهي بنهايتها أو قبلها
  const last = p.stages.filter((x) => x.lane !== 'track' && x.lane !== 'service').reduce((m, x) => later(m, x.next), null);
  return last ? Math.max(0, daysBetween(SPAN_EPOCH, last)) : 0;
}

// ══ المسار المستمر عند المشارك (T1) ══
/** نافذة كل مسار مستمر في رحلة الدفعة، لشريط «يسير معك» في رحلة المشارك: من cohortPlan نفسه، فلا تاريخ ثانٍ.
 * الدفعة المفتوحة (is_default) بلا تواريخ: المدة النسبية وحدها. {} لبرنامج بلا مسار، فلا يتغير شيء في رحلته
 * @param {any[]} stages مراحل تعريف الدفعة @param {any} [cohort] @returns {Record<string, { from: string|null, to: string|null, days: number, until: string, due_before: string, with: string|null, offset: number }>} */
export function trackWindows(stages, cohort = {}) {
  const list = (stages || []).filter((s) => s && s.active !== false);
  if (!list.some(planTrack)) return {};
  const p = cohortPlan(list, cohort || {});
  const out = {};
  for (const s of list.filter(planTrack)) {
    const x = p.byKey[s.key];
    if (!x || x.off) continue;
    const r = stageRules(planWithRules(list, planSchedule(cohort || {})).find((y) => y.key === s.key) || s);
    out[s.key] = { from: x.from, to: x.to, days: x.days, until: x.until, due_before: r.due_before, with: x.with, offset: x.offset || 0 };
  }
  return out;
}
