// ════════════════════════════════════════════════════════════════
// تحرير خطة الدفعة وأثره (R2a في تصور محرر رحلة الدفعة): منطق نقي بلا قاعدة ولا واجهة
// ════════════════════════════════════════════════════════════════
// يقرؤه الإجراء admin.cohort-plan (cohort-plan.ts) قبل الحفظ وتبويب «الرحلة» في اللوحة لمعاينته الحية، فتعديل المدة
// يُحسب في مكان واحد: planEdit يكتب الخطة الجديدة، وcohortPlan (stage-windows.js) يحسب تواريخها، وplanImpact يقول من
// يتأثر. لا حساب تاريخ هنا: كل تاريخ من cohortPlan وmilestoneDueInfo وmilestoneStatuses.
// في R2a تملك الدفعة المدة وحدها (days)، و«حرّر التواريخ لتتبع المدد» للمثبت قديمًا. الإيقاف (off) في R2b والتوازي
// (with وoffset) في R3a: المنظف يحفظها ولا يمحوها، وهذا الملف لا يكتبها.
import { cohortPlan, PLAN_DAYS_MAX, planDaysMin, planDaysOf, planDaysOnly, planPinned, planSchedule } from './stage-windows.js';
import { addDays, daysBetween, distributeSchedule, lateNoticeAllowed, MILESTONE_GRACE_DAYS, milestoneDueInfo, milestoneStatuses } from './milestones.js';
import { stageRules, daysAr, durationAr } from './journey.js';
import { latinDigits } from './digits.js';

// الوحدات (القرار 9): أيام وأسابيع، والأسبوع 7 أيام. «أيام العمل» في R5
export const PLAN_UNITS = Object.freeze({ days: 1, weeks: 7 });
export const PLAN_UNIT_AR = Object.freeze({ days: 'أيام', weeks: 'أسابيع' });
export const PLAN_SOURCE_AR = Object.freeze({ program: 'من البرنامج', cohort: 'معدّلة لهذه الدفعة', pinned: 'مثبتة بتاريخ' });
// وحدة العرض الأنسب لمدة: أسابيع إن كانت أسابيع تامة، وإلا أيام
export const unitFor = (days) => (Number(days) > 0 && Number(days) % 7 === 0 ? 'weeks' : 'days');
export const planDurationAr = (d) => (Number(d) ? durationAr(d) || daysAr(d) : 'بلا مدة');

// مقارنة خطتين بلا اعتبار لترتيب المفاتيح: «لم يتغير شيء»، و«تغيّرت الخطة بعد آخر حفظ» قبل التراجع
const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
export const sameSchedule = (a, b) => JSON.stringify(stable(a || {})) === JSON.stringify(stable(b || {}));

/** الخطة بعد تعديل المدير، وأسباب الرفض إن وُجدت. لا يمس ما لا يعرفه (off وwith وoffset وما للمراحل الموقوفة)
 * @param {{ stages: any[], schedule?: any, edit?: { days?: Record<string, any>, follow?: boolean }, cohort?: any }} o
 *  stages: مراحل تعريف الدفعة الظاهرة بمدد النسخة. days: { مفتاح: عدد أيام، أو null لـ«ارجع لمدة البرنامج» }.
 *  follow: «حرّر التواريخ لتتبع المدد»: كل مرحلة مثبتة تصير مدة بطولها الحالي فتتبع ما قبلها */
export function planEdit({ stages = [], schedule = {}, edit = {}, cohort = {} }) {
  const next = JSON.parse(JSON.stringify(schedule && typeof schedule === 'object' ? schedule : {}));
  const errors = [];
  const anchored = [];
  const byKey = new Map((stages || []).map((s) => [s.key, s]));
  const title = (k) => byKey.get(k)?.title_ar || k;
  const setDays = (k, d) => {
    const s = byKey.get(k);
    const e = { ...(next[k] || {}) };
    delete e.days;
    if (d != null && d !== (Math.round(Number(s.duration_days) || 0))) e.days = d;
    if (Object.keys(e).length) next[k] = e; else delete next[k];
  };
  if (edit.follow) {
    // كل مرحلة مثبتة تصير مدة بطولها الحالي فتتبع ما قبلها. ذلك لا يحرك تاريخًا إلا إن كانت تبدأ في اليوم التالي لنهاية
    // ما قبلها: بين المثبتة وما قبلها فجوة أو تداخل (جدول «وزّع» القديم أو يدوي) تبقى بدايتها مرساة وتُحرر نهايتها وحدها
    // (مدة بطولها)، فلا يتحرك تاريخ أي مرحلة بالتحرير. ما بقي مرساة يُسمّى في anchored
    const plan = cohortPlan(stages, { ...cohort, schedule: next });
    const same = (a, b) => (a?.from || null) === (b?.from || null) && (a?.to || null) === (b?.to || null);
    for (const s of stages) {
      const e = next[s.key];
      if (!planPinned(e)) continue;
      const row = plan.byKey[s.key];
      const { start, end, ...rest } = e;
      const keep = JSON.parse(JSON.stringify(next));
      next[s.key] = rest;
      setDays(s.key, row?.from ? row.days : planDaysOf(e) ?? null);
      if (!row?.from) continue;
      const now = cohortPlan(stages, { ...cohort, schedule: next });
      const moved = stages.some((x) => !same(now.byKey[x.key], plan.byKey[x.key]));
      if (!moved) continue;
      // البداية تبقى مرساة (من الخطة الحالية)، والمدة بطولها، فلا تثبت النهاية ولا يتحرك شيء
      Object.keys(next).forEach((k) => delete next[k]);
      Object.assign(next, keep);
      const { end: _e, days: _d, ...anchor } = keep[s.key];
      next[s.key] = { ...anchor, start: row.from, days: row.days };
      if (row.days === Math.round(Number(byKey.get(s.key)?.duration_days) || 0)) delete next[s.key].days;
      anchored.push(s.key);
    }
  }
  for (const [k, raw] of Object.entries(edit.days && typeof edit.days === 'object' ? edit.days : {})) {
    const s = byKey.get(k);
    if (!s) { errors.push({ stage: k, code: 'unknown', msg: `«${k}» ليست من مراحل رحلة الدفعة الظاهرة` }); continue; }
    if (raw === null || raw === '') { setDays(k, null); continue; }
    const n = Number(latinDigits(raw));
    const min = planDaysMin(s);
    if (!Number.isInteger(n) || n < min || n > PLAN_DAYS_MAX) {
      errors.push({ stage: k, code: 'range', msg: `مدة «${title(k)}» من ${min} إلى ${PLAN_DAYS_MAX} يومًا${min ? '، لأنها إلزامية' : ''}` });
      continue;
    }
    const e = next[k];
    if (e && ISO_PAIR(e)) {
      errors.push({ stage: k, code: 'pinned', msg: `«${title(k)}» مثبتة بتاريخين، فلا تتبع مدتها. حرّر التواريخ لتتبع المدد أولًا` });
      continue;
    }
    setDays(k, n);
  }
  return { schedule: next, errors, anchored, changed: !sameSchedule(schedule, next) };
}
const ISO_PAIR = (e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(e.end || '');

// «اقترح مددًا تملأ مدة الدفعة» (كان «وزّع على مدة الدفعة»): التوزيع النسبي نفسه (distributeSchedule) لكن مددًا لا تواريخ،
// فتبقى الخطة نسبية ويتبع ما بعد كل مرحلة مدتها. يقترح للإلزامية وحدها، والاختيارية وعند الطلب تبقى بمدتها. وcohortPlan
// يضع كل مجموعة بعد سابقتها، الاختيارية منها أيضًا، فما تأخذه غير الإلزامية من المسار يُطرح من مدة الدفعة قبل التوزيع،
// ويُتحقق بcohortPlan نفسه أن الرحلة تنتهي يوم نهاية الدفعة. schedule: خطة الدفعة الحالية (مددها وحدها تُقرأ هنا)
export function suggestDays(stages, startsOn, endsOn, schedule = {}) {
  const live = (stages || []).filter((s) => s.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const required = live.filter((s) => stageRules(s).mode === 'required');
  const own = planDaysOnly(schedule);
  const daysFor = (end) => {
    const d = distributeSchedule(live, startsOn, end);
    const out = {};
    for (const s of required) if (d[s.key]) out[s.key] = daysBetween(d[s.key].start, d[s.key].end) + 1;
    return out;
  };
  let out = daysFor(endsOn);
  if (!required.length || !Object.keys(out).length) return out;
  let reserve = 0;
  for (let i = 0; i < 6; i += 1) {
    const sched = { ...own };
    for (const [k, n] of Object.entries(out)) sched[k] = { days: n };
    const p = cohortPlan(live, { starts_on: startsOn, ends_on: endsOn, schedule: sched });
    const diff = p.end ? daysBetween(endsOn, p.end) : 0;
    if (!diff) break;
    const next = reserve + diff;
    // لا يتسع ما بقي للإلزامية بيوم لكل منها: يبقى أقرب اقتراح، وتنبيه «تنتهي الرحلة بعد نهاية الدفعة» يقول الفرق
    if (next < 0 || daysBetween(startsOn, endsOn) + 1 - next < required.length) break;
    reserve = next;
    out = daysFor(addDays(endsOn, -reserve));
  }
  return out;
}

// لماذا لا تُحفظ خطة هذه الدفعة، أو '' (البند 4.5 والقرار 21)
export function planLock(cohort) {
  const c = cohort || {};
  if (c.status === 'closed') return { code: 'cohort_closed', msg: 'الدفعة مغلقة: خطتها للقراءة فقط.' };
  if (c.is_default && !c.program_version_id) {
    return { code: 'open_unpinned', msg: 'الدفعة المفتوحة يدخلها كل من ليس في دفعة، فأي تعديل في خطتها يمس الجميع. لا تُعدَّل قبل تثبيتها على نسخة من برنامجها: ثبّتها من ملفها أولًا.' };
  }
  return null;
}

const windowsFor = (stages, cohort) => (cohort?.starts_on && !cohort?.is_default ? cohortPlan(stages, cohort).windows : null);

/** أثر تعديل الخطة قبل الحفظ (نافذة الأثر، البند 4.2 هـ): ما تغيّر سطرًا سطرًا، ومن يقف في كل مرحلة تغيّرت، والمعالم
 * التي يتغير موعدها أو تنقلب متأخرة، وبريد «معلم متأخر» الذي يمنعه الحارس. people: [{ id, at, stagesDone, records }]
 * (من رحلة كل عضو كما يراها، journeyFor) أو null إن لم تُحسب (دفعة أكبر من السقف)
 * @param {{ stages: any[], before?: any, after?: any, cohort?: any, milestones?: any[], people?: any[]|null, today?: any, cutoff?: string }} o */
export function planImpact({ stages = [], before = {}, after = {}, cohort = {}, milestones = [], people = null, today = null, cutoff = undefined }) {
  const c0 = { ...cohort, schedule: before || {} };
  const c1 = { ...cohort, schedule: after || {} };
  const p0 = cohortPlan(stages, c0), p1 = cohortPlan(stages, c1);
  const titleOf = new Map(stages.map((s) => [s.key, s.title_ar || s.key]));
  const changes = stages.map((s) => {
    const a = p0.byKey[s.key], b = p1.byKey[s.key];
    if (!a || !b || (a.days === b.days && a.from === b.from && a.to === b.to)) return null;
    return { key: s.key, title: titleOf.get(s.key), before: { days: a.days, from: a.from, to: a.to, source: a.source },
      after: { days: b.days, from: b.from, to: b.to, source: b.source }, days_changed: a.days !== b.days };
  }).filter(Boolean);
  const shift = p0.end && p1.end ? daysBetween(p0.end, p1.end) : 0;
  // «تُفتح يوم N» لا تتبع المدد (القرار 20): تُسمّى صراحة إن تحركت نافذتها
  const dayRules = changes.filter((x) => stageRules(stages.find((s) => s.key === x.key)).unlock === 'day').map((x) => x.title);
  const w0 = windowsFor(stages, c0), w1 = windowsFor(stages, c1);
  const live = (milestones || []).filter((m) => m.active !== false);
  // الخطة كما تقرؤها المعالم (planSchedule): المفتوحة بلا تواريخ مثبتة، كما في milestoneStatuses
  const ctx = (w, cc) => ({ startsOn: cohort.starts_on || null, endsOn: cohort.ends_on || null, schedule: planSchedule(cc), windows: w });
  const moved = live.map((m) => {
    const a = milestoneDueInfo(m, ctx(w0, c0)).due, b = milestoneDueInfo(m, ctx(w1, c1)).due;
    return a === b ? null : { id: m.id, title: m.title_ar, before: a, after: b };
  }).filter(Boolean);

  let who = null, late = null, mail = null;
  if (Array.isArray(people)) {
    const here = {};
    let flips = 0, held = 0, cleared = 0;
    const flipped = new Set();
    const t = today ? String(new Date(today).toISOString()).slice(0, 10) : undefined;
    for (const p of people) {
      if (p.at) here[p.at] = (here[p.at] || 0) + 1;
      if (!live.length) continue;
      const o = { stagesDone: p.stagesDone instanceof Set ? p.stagesDone : new Set(p.stagesDone || []), records: p.records || {}, stages, today: t };
      const s0 = new Map(milestoneStatuses(live, { ...o, cohort: c0 }).map((m) => [m.id, m]));
      for (const m of milestoneStatuses(live, { ...o, cohort: c1 })) {
        const was = s0.get(m.id);
        if (m.status === 'late' && was?.status !== 'late') { flips += 1; flipped.add(p.id); }
        if (was?.status === 'late' && m.status !== 'late') cleared += 1;
        // بريد كان سيُرسل في التشغيلة التالية بلا حارس الخطة: صار متأخرًا فوق المهلة بهذا التعديل. موعده قبل يوم الحفظ
        // دائمًا، فيمنعه الحارس (يوم آخر حفظ للخطة في lateMilestoneNotices)، ويبقى ظاهرًا متأخرًا في الرحلة واللوحة
        if (lateNoticeAllowed(m, MILESTONE_GRACE_DAYS, cutoff) && !(was && lateNoticeAllowed(was, MILESTONE_GRACE_DAYS, cutoff))) held += 1;
      }
    }
    who = { total: people.length, by_stage: changes.map((x) => ({ key: x.key, title: x.title, here: here[x.key] || 0 })).filter((x) => x.here > 0) };
    late = { milestones: flips, people: flipped.size, cleared };
    mail = { send: 0, held };
  }
  return {
    changes, end: { before: p0.end, after: p1.end, shift }, total: { before: p0.total_days, after: p1.total_days },
    day_rules: dayRules, milestones: moved, people: who, late, mail, issues: p1.issues,
    open: cohort.is_default ? { members: Array.isArray(people) ? people.length : null } : null,
  };
}

// سطور نافذة الأثر بالعربية، من planImpact وحده، فتقول اللوحة ما يقوله الخادم بالكلمات نفسها
export const peopleAr = (n) => (n === 1 ? 'مشارك واحد' : n === 2 ? 'مشاركان' : n <= 10 ? `${n} مشاركين` : `${n} مشاركًا`);
const msAr = (n) => (n === 1 ? 'معلم واحد' : n === 2 ? 'معلمان' : n <= 10 ? `${n} معالم` : `${n} معلمًا`);
const msgAr = (n) => (n === 1 ? 'رسالة واحدة' : n === 2 ? 'رسالتان' : n <= 10 ? `${n} رسائل` : `${n} رسالة`);
export function impactLines(impact, fmt = (d) => d) {
  if (!impact) return [];
  const out = [];
  for (const x of impact.changes) {
    const dur = x.days_changed ? `${planDurationAr(x.before.days)} إلى ${planDurationAr(x.after.days)}` : 'بمدتها نفسها';
    const when = x.after.from ? `${x.days_changed ? '، فتصير' : '، وتصير'} ${x.after.from === x.after.to ? fmt(x.after.from) : `من ${fmt(x.after.from)} إلى ${fmt(x.after.to)}`}` : '';
    out.push({ key: `c-${x.key}`, kind: 'change', text: `${x.title}: ${dur}${when}` });
  }
  const sh = impact.end.shift;
  if (sh) out.push({ key: 'end', kind: 'end', text: `${sh > 0 ? 'تتأخر' : 'تتقدم'} نهاية الرحلة ${daysAr(Math.abs(sh))}${impact.end.after ? `، فتنتهي ${fmt(impact.end.after)}` : ''}` });
  if (impact.day_rules.length) out.push({ key: 'day', kind: 'note', text: `${impact.day_rules.map((t) => `«${t}»`).join(' و')} تُفتح بيوم ثابت من بداية الدفعة (قاعدة البرنامج)، فلا يتحرك فتحها مع المدد` });
  if (impact.open) out.push({ key: 'open', kind: 'warn', text: `الدفعة المفتوحة: يمس التعديل ${impact.open.members == null ? 'كل من ليس في دفعة' : `${peopleAr(impact.open.members)} ليسوا في دفعة`}، والمدد نسبية من دخول كل منهم` });
  if (impact.people) {
    const by = impact.people.by_stage;
    // بصيغة التصور (4.2 هـ): «12 مشاركًا في التدريب الآن، و3 في التوجيه». المراحل هنا كل ما تتغير مواعيده، لا ما تغيّرت مدته وحده
    out.push({ key: 'people', kind: 'people', text: by.length
      ? `في المراحل التي تتغير مواعيدها: ${by.map((x, i) => (i ? `${x.here} في ${x.title}` : `${peopleAr(x.here)} في ${x.title} الآن`)).join('، و')}`
      : 'لا أحد الآن في المراحل التي تتغير مواعيدها' });
  } else out.push({ key: 'people', kind: 'note', text: 'لم يُحسب أثره على كل عضو (الدفعة أكبر من أن تُحسب هنا). المعالم والمواعيد تتبع الخطة الجديدة' });
  out.push({ key: 'ms', kind: impact.milestones.length ? 'ms' : 'note', text: impact.milestones.length ? `${msAr(impact.milestones.length)} ${impact.milestones.length === 1 ? 'يتغير موعده' : impact.milestones.length === 2 ? 'يتغير موعدهما' : 'تتغير مواعيدها'}` : 'لا يتغير موعد أي معلم' });
  if (impact.late) {
    if (impact.late.milestones) out.push({ key: 'late', kind: 'warn', text: `${msAr(impact.late.milestones)} ${impact.late.milestones === 1 ? 'يصير متأخرًا' : impact.late.milestones === 2 ? 'يصيران متأخرين' : 'تصير متأخرة'} على أصحابها (عدد من يتأثر: ${impact.late.people})` });
    if (impact.late.cleared) out.push({ key: 'cleared', kind: 'ok', text: `ويعود في الموعد ما كان متأخرًا: ${msAr(impact.late.cleared)}` });
  }
  out.push({ key: 'mail', kind: 'mail', text: impact.mail?.held
    ? `البريد: لن يُرسل شيء الآن. ${msgAr(impact.mail.held)} «معلم متأخر» عن مواعيد صارت في الماضي تُحجب بحارس البريد، والتذكيرات تُحسب من المواعيد الجديدة`
    : 'البريد: لن يُرسل شيء الآن، والتذكيرات تُحسب من المواعيد الجديدة' });
  return out;
}

// ملخص الأثر الذي يُكتب في السجل مع كل حفظ (البند 4.6): أعداد لا أسماء
export const impactSummary = (impact) => (impact ? {
  changes: impact.changes.map((x) => ({ key: x.key, before: x.before.days, after: x.after.days })),
  shift: impact.end.shift, milestones: impact.milestones.length,
  late: impact.late ? impact.late.milestones : null, held: impact.mail ? impact.mail.held : null,
  people: impact.people ? impact.people.total : null,
} : null);

// أفعال حفظ خطة الدفعة في السجل: حارس بريد «معلم متأخر» يقرؤها (lateMilestoneNotices)
export const PLAN_ACTIONS = Object.freeze(['cohort.plan', 'cohort.plan-undo']);
// الحارس لدفعة: الأحدث بين يوم البيئة (cutoffFrom) ويوم آخر حفظ لخطتها، فما صار متأخرًا بتعديل الخطة لا يُرسل عنه
export const planCutoff = (cutoff, planDay) => (planDay && (!cutoff || planDay > cutoff) ? planDay : cutoff);
/** حارس الخطة لدفعة من صفوف سجلها (cohort.plan وcohort.plan-undo، بعمود after): لكل معلم يوم آخر حفظ حرّك موعده
 * (after.moved_ids)، وما حفظه سطر بلا moved_ids (قبل تسجيلها) يُعامل كأنه حرّك كل المعالم يومها
 * @param {any[]} rows @returns {{ moved: Record<string, string>, all: string | null }} */
export function planGuard(rows) {
  /** @type {Record<string, string>} */
  const moved = {};
  let all = null;
  for (const r of rows || []) {
    const d = String(r.created_at || '').slice(0, 10);
    if (!d) continue;
    const ids = r.after && Array.isArray(r.after.moved_ids) ? r.after.moved_ids : null;
    if (!ids) { if (!all || d > all) all = d; continue; }
    for (const id of ids) { const k = String(id); if (!moved[k] || d > moved[k]) moved[k] = d; }
  }
  return { moved, all };
}
// يوم الحارس لمعلم واحد: الأحدث بين يوم البيئة ويوم آخر حفظ حرّك موعده. ما لم يحركه حفظ يبقى على يوم البيئة،
// فمعلم متأخر داخل المهلة في مرحلة لم يمسها التعديل يُرسل عنه كالمعتاد
export const planCutoffFor = (cutoff, guard, id) => {
  const a = guard?.moved?.[String(id)] || null, b = guard?.all || null;
  return planCutoff(cutoff, a && b ? (a > b ? a : b) : a || b);
};
