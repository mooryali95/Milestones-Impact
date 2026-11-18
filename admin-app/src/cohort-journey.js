// ════════════════════════════════════════════════════════════════
// الرحلة في لمحة للدفعة (R1 في تصور محرر رحلة الدفعة): نموذج عرض تبويب «الرحلة» في ملف الدفعة، للقراءة فقط
// ════════════════════════════════════════════════════════════════
// لا حساب تاريخ هنا: النوافذ والحالات والمدد والخط الزمني كلها من journeyTimeline (وهو يقرأ stageWindows)، ومواعيد
// المعالم من milestoneDueInfo بالنوافذ نفسها كما يقرؤها milestoneStatuses، وأعداد الناس من خريطة الرحلة (admin.cohort-journey).
// هذا الملف يجمع الثلاثة في رأس وممرات وبطاقات، فلا يختلف تاريخ بين الخط والبطاقة والمعلم.
import { journeyTimeline, scaleDay, scalePos, STAGE_TAG_AR } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { daysAr, renderJourneyText, stageRules, untilOptions } from '../../supabase/functions/leaders-api/journey.js';
import { countAr } from '../../supabase/functions/leaders-api/labels.js';
import { daysBetween, MILESTONE_ANCHOR_AR, milestoneDueInfo, milestoneOff } from '../../supabase/functions/leaders-api/milestones.js';
import { cohortPlan, PLAN_DAYS_MAX, planDaysMin, planOffKeys, planSchedule } from '../../supabase/functions/leaders-api/stage-windows.js';
import { PHASE_AR } from '../../supabase/functions/leaders-api/labels.js';
import {
  impactLines, PLAN_SOURCE_AR, PLAN_UNITS, planDurationAr, planEdit, planLock, planOffBlock, planRestartBlock, planWithCandidates, planWithLock, sameSchedule,
  suggestDays, unitFor,
} from '../../supabase/functions/leaders-api/cohort-plan.js';
import { dateOnly, dayLong } from './dates.js';

// تبويبا ملف الدفعة، والمختار في العنوان (?view=journey) فيُفتح الرابط عليه ويبقى بعد التحديث
export const COHORT_TABS = [['overview', 'الملف'], ['journey', 'الرحلة']];
export const cohortTab = (qs = '') => (new URLSearchParams(String(qs)).get('view') === 'journey' ? 'journey' : 'overview');

// من أين جاء موعد المعلم (مصدر milestoneDueInfo)، بكلمات المدير
export const DUE_SOURCE_AR = Object.freeze({
  schedule: 'من جدول الدفعة', window: 'محسوب من مدد المراحل', cohort: 'من تاريخ الدفعة', date: 'تاريخ محدد في البرنامج',
});
// من أين جاءت نافذة المرحلة
export const WINDOW_SOURCE_AR = Object.freeze({ schedule: 'مثبتة بتاريخ (لا تتبع المدد)', plan: 'محسوبة من بداية الدفعة ومدد المراحل' });

const stagesAr = (n) => countAr(n, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة');
const milestonesAr = (n) => countAr(n, 'معلم واحد', 'معلمان', 'معالم', 'معلمًا');
const actsAr = (n) => countAr(n, 'نشاط واحد', 'نشاطان', 'أنشطة', 'نشاطًا');
export const membersAr = (n) => countAr(n, 'عضو واحد', 'عضوان', 'أعضاء', 'عضوًا');
const quoteList = (xs) => xs.map((x) => `«${x}»`).join(' و');

// بطاقات الخط الزمني التي يحملها رأس التبويب ومؤشراته (المدة والمراحل والنافذة والآن)، فلا تتكرر تحته. يبقى منها ما لا يقوله غيرها
export const TAB_TIMELINE_OMIT = Object.freeze(['duration', 'stages', 'window', 'now']);

// الدفعة المؤرخة: لها بداية واحدة وليست المفتوحة. المفتوحة مددها نسبية من دخول كل مشارك (القرار 21)، كما في milestoneStatuses
export const cohortDated = (cohort) => !!cohort?.starts_on && !cohort?.is_default;

/** الخط الزمني للدفعة: journeyTimeline نفسه بتعريفها وجلساتها. المفتوحة بلا تواريخ مطلقة ولو ضُبط لها starts_on أو جدول
 * @param {{ stages?: any[], requirements?: any[], sessions?: any[] }} def @param {any} cohort @param {any} [today] */
export function cohortTimeline(def, cohort, today = null) {
  const c = cohort || {};
  const open = !!c.is_default;
  return journeyTimeline({ stages: def?.stages || [], requirements: def?.requirements || [] }, {
    // المفتوحة: مدد خطتها نسبية (cohortPlan يتجاهل تواريخها المثبتة وبدايتها)، فتُرسم المدد الخاصة بها لا مدد البرنامج
    cohort: { ...c, starts_on: open ? null : c.starts_on || null, schedule: c.schedule || {} },
    sessions: def?.sessions || [], today, title: 'الخط الزمني للدفعة',
  });
}

/** الرأس: البداية والنهاية والمدة واليوم، وتنبيه إن تجاوزت النهاية المحسوبة نهاية الدفعة المسجلة
 * @param {any} model نموذج cohortTimeline @param {any} cohort */
export function journeyHeader(model, cohort) {
  const c = cohort || {};
  const total = model?.total_label || '';
  if (!model || model.empty) return { kind: 'empty', text: 'لا مراحل معرّفة لبرنامج هذه الدفعة بعد.', total: '' };
  if (c.is_default) return { kind: 'open', text: 'دفعة مفتوحة: المدد نسبية من دخول كل مشارك، ولا تواريخ مطلقة.', total };
  if (!model.dated) return { kind: 'undated', text: 'لم يُحدد تاريخ بداية الدفعة بعد، فالمدد تُعرض بالأسابيع من البداية.', total };
  const over = c.ends_on && model.end > String(c.ends_on).slice(0, 10) ? daysBetween(c.ends_on, model.end) : 0;
  // المسار المستمر (T1) يمتد إلى نهاية الدفعة: إن انتهت المراحل المتتابعة قبلها يُقال الفرق مرة واحدة (chain_end_mismatch)
  const gap = (model.tracks || []).some((x) => x.until === 'journey_end') && c.ends_on && model.end < String(c.ends_on).slice(0, 10) ? daysBetween(model.end, c.ends_on) : 0;
  return {
    kind: 'dated', start: model.start, end: model.end, start_ar: dayLong(model.start), end_ar: dayLong(model.end), total,
    now: model.cards.find((x) => x.key === 'now')?.value || '', today: model.today || null,
    over, over_ar: over ? `نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة (${dateOnly(c.ends_on)}). الفرق: ${daysAr(over)}.` : '',
    ...(gap ? { gap, gap_ar: `تنتهي المراحل المتتابعة قبل نهاية الدفعة (${dateOnly(c.ends_on)}) بـ${daysAr(gap)}، والمسار المستمر يمتد إلى نهايتها. اقترح مددًا تملأ مدة الدفعة إن أردت أن تنتهي معًا.` } : {}),
  };
}

// قاعدة فتح المرحلة كما في البرنامج، بجملة تُقرأ. «تُفتح يوم N» لا تتبع المدد (القرار 20)، فتُقال صراحة
function ruleAr(s, titleOf) {
  const r = stageRules(s);
  if (r.unlock === 'day' && r.day != null) return `تُفتح بعد ${daysAr(r.day)} من بداية الدفعة (قاعدة البرنامج، لا تتبع المدد)`;
  if (r.unlock === 'stages' && r.after.length) return `تُفتح بعد اكتمال ${r.after.map((k) => `«${titleOf(k)}»`).join(' و')}`;
  return '';
}

/** الممرات والبطاقات: لكل محور مجموعاته بترتيب الخط، والمجموعة مرحلة واحدة أو مراحل «تسير معًا» ممرات تحت بعضها.
 * كل قيمة تاريخية من نموذج الخط نفسه، ومواعيد المعالم من milestoneDueInfo بنوافذه.
 * @param {any} model نموذج cohortTimeline
 * @param {{ def?: any, cohort?: any, milestones?: any[], map?: any }} [o] */
export function journeyLanes(model, { def = {}, cohort = {}, milestones = [], map = null } = {}) {
  if (!model || model.empty) return { phases: [], cohort_milestones: [], counts: { stages: 0, together: 0, milestones: 0 } };
  const raw = new Map((def?.stages || []).map((s) => [s.key, s]));
  const reqs = def?.requirements || [];
  const titleOf = (k) => model.stages.find((s) => s.key === k)?.title || renderJourneyText(raw.get(k)?.title_ar || k, { reqs });
  // النوافذ التي رسمها الخط بعينها، فلا تُحسب مرة ثانية. المفتوحة لا نوافذ لها (milestoneStatuses)
  const windows = model.dated && cohortDated(cohort) ? Object.fromEntries([...model.stages, ...(model.tracks || [])].filter((s) => s.window).map((s) => [s.key, s.window])) : null;
  const ctx = { startsOn: cohort?.starts_on || null, endsOn: cohort?.ends_on || null, schedule: planSchedule(cohort), windows };
  const mapStage = new Map((map?.stages || []).map((s) => [s.key, s]));
  const mapMs = new Map((map?.milestones || []).map((m) => [m.id, m]));
  const live = (milestones || []).filter((m) => m.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const msOut = (m) => {
    const info = milestoneDueInfo(m, ctx);
    const x = mapMs.get(m.id);
    const off = Number(m.offset_days) || 0;
    return {
      id: m.id, title: m.title_ar, due: info.due, due_ar: info.due ? dateOnly(info.due) : 'بلا موعد بعد', source: info.source,
      source_ar: info.source ? DUE_SOURCE_AR[info.source] : '',
      anchor_ar: `${MILESTONE_ANCHOR_AR[m.anchor] || ''}${off ? ` ${off > 0 ? 'بعد' : 'قبل'} ${daysAr(Math.abs(off))}` : ''}`,
      done: x ? x.done : null, late: x ? x.late : null,
    };
  };
  const stageMs = (k) => live.filter((m) => (m.anchor === 'stage_end' || m.anchor === 'stage_start') && m.stage_key === k).map(msOut);
  // الموقوفة لهذه الدفعة (R2b): خارج الخط، وبطاقتها باهتة في مكانها، ومعالمها مستبعدة من الدفعة (milestoneOff، القرار 15)
  const offKeys = planOffKeys(planSchedule(cohort));
  const offMs = (k) => live.filter((m) => milestoneOff(m, new Set([k]))).map((m) => ({
    id: m.id, title: m.title_ar, due: null, due_ar: 'مستبعد لهذه الدفعة', source: 'off', source_ar: 'لا يُعد في درجة المعالم',
    anchor_ar: `${MILESTONE_ANCHOR_AR[m.anchor] || ''}`, done: null, late: null, excluded: true,
  }));
  const offCard = (s) => {
    const rs = reqs.filter((r) => r.stage_key === s.key && r.active !== false);
    return {
      key: s.key, title: titleOf(s.key), phase: s.phase && PHASE_AR[s.phase] ? s.phase : 'qualification', status: 'off', status_ar: 'موقوفة لهذه الدفعة',
      optional: stageRules(s).mode !== 'required', mode: stageRules(s).mode, mode_ar: STAGE_TAG_AR[stageRules(s).mode] || '', label: 'لا تأخذ من الرحلة وقتًا', window_ar: '', today_ar: '', lead: true, off: true,
      window_source: null, window_source_ar: '', with_ar: '', rule_ar: '', undated: false, people: null,
      acts: { shown: 0, total: rs.length, text: rs.length ? `${actsAr(rs.length)} لا تظهر لأعضاء الدفعة ما دامت موقوفة، وما أُنجز منها محفوظ` : 'لا أنشطة' },
      milestones: offMs(s.key), late_milestones: 0, sort: s.sort ?? 0,
    };
  };

  // مع الإزاحة سطر «تُفتح مع … في … ومخطط من …» (offset_ar) يقول الموعدين، فلا يتكرر معه سطر «تسير مع»
  const card = (s, lead, withAr = s.offset_ar ? '' : s.with_note || '') => {
    const rs = reqs.filter((r) => r.stage_key === s.key && r.active !== false);
    const shown = rs.filter((r) => !r.hidden).length;
    const p = mapStage.get(s.key);
    const ms = stageMs(s.key);
    return {
      key: s.key, title: s.title, phase: s.phase, status: s.status, status_ar: s.status_ar, optional: s.optional,
      // غير الإلزامية (T0): «عند الحاجة» أو «اختيارية» بنمطها من الخط نفسه، لا «اختيارية» لكل ما ليس إلزاميًا
      mode: s.mode, mode_ar: s.mode_ar || '',
      label: s.label, window_ar: s.window_ar, today_ar: s.today_ar, lead,
      // مصدر النافذة من الخطة نفسها (cohortPlan عبر الخط): المثبت بتاريخ، ومنه النهاية وحدها، وإلا المحسوبة
      window_source: s.window ? (s.days_source === 'pinned' ? 'schedule' : 'plan') : null,
      window_source_ar: s.window ? WINDOW_SOURCE_AR[s.days_source === 'pinned' ? 'schedule' : 'plan'] : '',
      with_ar: withAr, rule_ar: ruleAr(raw.get(s.key) || {}, titleOf),
      // الإزاحة (R3a): «تُفتح في …» و«مخطط من …» بلغة واحدة (البند 2.4)
      offset_ar: s.offset_ar || '',
      acts: { shown, total: rs.length, text: rs.length ? (shown === rs.length ? actsAr(rs.length) : `${actsAr(rs.length)}، الظاهر منها ${shown}`) : 'لا أنشطة بعد' },
      undated: !!s.undated,
      people: p ? { here: p.here, late: p.late, done: p.done } : null,
      milestones: ms, late_milestones: ms.reduce((n, m) => n + (m.late || 0), 0),
    };
  };

  const stageBy = new Map(model.stages.map((s) => [s.key, s]));
  const phaseTitle = new Map(model.phases.map((p) => [p.key, p.title]));
  // الخانة (slot) هي مجموعة «تبدأ مع» كما في stageWindows، وقد تمتد على محورين: تُقطع بالمحور للعرض، والقائد قائد الخانة كلها
  // لا أول ما وقع منها في المحور، والجمل تُبنى من الخانة كلها فلا تناقض بطاقاتها
  const phases = model.phases.map((ph) => {
    const groups = model.slots.map((slot) => {
      const ks = slot.stages.filter((k) => stageBy.get(k)?.phase === ph.key);
      if (!ks.length) return null;
      const leadKey = slot.stages[0];
      const lead = stageBy.get(leadKey);
      const here = ks.includes(leadKey);
      const away = slot.stages.filter((k) => !ks.includes(k)).map((k) => stageBy.get(k)).filter(Boolean);
      const stages = ks.map((k) => {
        const s = stageBy.get(k);
        // القائد وحده في محوره وبقية خانته في محور آخر: تُسمى البقية بمحورها بدل «تبدأ البقية معها»
        const awayAr = k === leadKey && ks.length === 1 && away.length
          ? `تبدأ معها ${quoteList(away.map((x) => x.title))} في ${[...new Set(away.map((x) => `محور «${phaseTitle.get(x.phase) || ''}»`))].join(' و')}`
          : undefined;
        return card(s, k === leadKey, awayAr);
      });
      const together = stages.length > 1;
      let note = '';
      if (together && here) note = `«${lead.title}»، ومعها ${quoteList(stages.slice(1).map((x) => x.title))}، في الأسابيع نفسها`;
      else if (together) note = `${quoteList(stages.map((x) => x.title))} تبدأ مع «${lead?.title || ''}» في محور «${phaseTitle.get(lead?.phase) || ''}»، في الأسابيع نفسها`;
      return { key: `${slot.key}-${ph.key}`, together, stages, note_ar: note };
    }).filter(Boolean);
    return { key: ph.key, title: ph.title, label: ph.label, groups, count: groups.reduce((n, g) => n + g.stages.length, 0) };
  }).filter((p) => p.groups.length);

  // البطاقات الموقوفة في محاورها بترتيب المراحل، والمحور الذي كل مراحله موقوفة يظهر بها وحدها
  const sortOf = (k) => raw.get(k)?.sort ?? 0;
  const offStages = [...raw.values()].filter((s) => s.active !== false && offKeys.has(s.key)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for (const s of offStages) {
    const c = offCard(s);
    let ph = phases.find((p) => p.key === c.phase);
    if (!ph) {
      ph = { key: c.phase, title: PHASE_AR[c.phase] || c.phase, label: 'كل مراحله موقوفة لهذه الدفعة', groups: [], count: 0 };
      const order = ['admission', 'qualification', 'impact'];
      const at = phases.findIndex((p) => order.indexOf(p.key) > order.indexOf(c.phase));
      phases.splice(at < 0 ? phases.length : at, 0, ph);
    }
    const at = ph.groups.findIndex((g) => Math.min(...g.stages.map((x) => sortOf(x.key))) > c.sort);
    ph.groups.splice(at < 0 ? ph.groups.length : at, 0, { key: `off-${s.key}`, together: false, off: true, stages: [c], note_ar: '' });
  }
  // المسار المستمر (T1): بطاقاته في «مسارات مستمرة» بجانب المحاور، ببدايته ونهايته وما يشترطه، ومعالمه من نافذته
  const tracks = (model.tracks || []).map((s) => ({ ...card({ ...s, offset_ar: '', with_note: '' }, true, ''), lane: 'track', lane_ar: s.lane_ar,
    with_ar: s.start_ar, until_ar: s.until_ar, due_ar: s.due_ar, window_source: s.window ? 'plan' : null, window_source_ar: s.window ? 'من بداية مرجعه حتى نهايته في خطة الدفعة' : '' }));
  for (const x of model.tracks || []) stageBy.set(x.key, x);
  const cohortMs = live.filter((m) => (!['stage_end', 'stage_start'].includes(m.anchor) || !stageBy.has(m.stage_key)) && !milestoneOff(m, offKeys)).map(msOut);
  const together = phases.reduce((n, p) => n + p.groups.filter((g) => g.together).length, 0);
  return { phases, cohort_milestones: cohortMs, counts: { stages: model.stages.length, off: offStages.length, together, milestones: live.filter((m) => !milestoneOff(m, offKeys)).length },
    ...(tracks.length ? { tracks } : {}) };
}

/** صف المؤشرات تحت الرأس: المدة والمراحل وما يسير معًا والمعالم، والناس من الخريطة إن قُرئت
 * msError: قراءة المعالم فشلت، فلا يُقال «لا معالم» عن برنامج قد تكون له معالم
 * @param {any} model @param {any} lanes @param {any} [map] @param {{ msError?: boolean }} [o] */
export function journeyKpis(model, lanes, map = null, { msError = false } = {}) {
  if (!model || model.empty) return [];
  const out = [
    { key: 'total', label: 'المدة', value: model.total_label },
    { key: 'stages', label: 'المراحل', value: `${stagesAr(lanes.counts.stages)} في ${countAr(lanes.phases.length, 'محور واحد', 'محورين', 'محاور', 'محورًا')}${lanes.counts.off ? `، و${countAr(lanes.counts.off, 'واحدة موقوفة', 'اثنتان موقوفتان', 'موقوفة', 'موقوفة')}` : ''}` },
    { key: 'together', label: 'تسير معًا', value: lanes.counts.together ? countAr(lanes.counts.together, 'مجموعة واحدة', 'مجموعتان', 'مجموعات', 'مجموعة') : 'لا توازي' },
    { key: 'milestones', label: 'المعالم', value: msError ? 'تعذّرت القراءة' : lanes.counts.milestones ? milestonesAr(lanes.counts.milestones) : 'لا معالم', tone: msError ? 'warn' : '' },
  ];
  if (lanes.tracks?.length) out.splice(3, 0, { key: 'tracks', label: 'مسارات مستمرة', value: lanes.tracks.map((x) => x.title).join('، ') });
  if (map?.totals) {
    const t = map.totals;
    out.push({ key: 'people', label: 'في الرحلة', value: `${membersAr(t.total)}${t.late ? `، منهم ${t.late} تجاوز موعده` : ''}`, tone: t.late ? 'warn' : '' });
  }
  return out;
}


// ══ وضع التحرير (R2a): المدة لكل مرحلة، بمعاينة حية من cohortPlan نفسه وأثر من الخادم قبل الحفظ ══
// لا حساب تاريخ هنا: الخطة الجديدة من planEdit، وتواريخها من cohortPlan، والأثر من admin.cohort-plan (planImpact).

// الدفعة كما تُحسب خطتها: صفها من قائمة الدفعات وفوقه خطتها الحالية كما قرأها التبويب أو حفظها (cohort_plan)
// الخطة المقروءة لا تغلب صفًا أحدث منها: تعديل الدفعة من ملفها (تاريخ البداية أو الحالة) يحدّث الصف، فيُقرأ هو
export const planCohort = (c, cp) => {
  const row = c || {};
  if (!cp) return { ...row };
  if (row.updated_at && cp.updated_at && String(row.updated_at) > String(cp.updated_at)) return { ...row };
  return { ...row, ...cp };
};
const liveStages = (def) => [...(def?.stages || [])].filter((s) => s.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

/** الخطة في المسودة: الجديدة بعد تعديل المدير، وصف لكل مرحلة (المدة ومصدرها ومدة البرنامج والتثبيت والإيقاف وسبب منعه)،
 * وعدد التعديلات. edit.off: { مفتاح: true أو false } (R2b). edit.with وedit.offset (R3a): «تسير مع» وإزاحتها، ولكل صف
 * المرجع الفعلي وإزاحته ومصدرهما، والمراجع المقبولة (planWithCandidates) وسبب المنع، وحد الإزاحة (مدة المرجع) وتنبيه التجاوز
 * @param {{ def: any, cohort: any, edit?: { days?: Record<string, any>, follow?: boolean, off?: Record<string, boolean>, with?: Record<string, any>, offset?: Record<string, any>, until?: Record<string, any> } | null }} o */
export function planDraft({ def, cohort, edit = null }) {
  const stages = liveStages(def);
  const requirements = def?.requirements || [];
  const saved = cohort?.schedule || {};
  const r = edit ? planEdit({ stages, schedule: saved, edit, cohort, requirements }) : { schedule: saved, errors: [] };
  const plan = cohortPlan(stages, { ...cohort, schedule: r.schedule });
  const was = cohortPlan(stages, { ...cohort, schedule: saved });
  const rows = {};
  const stageBy = new Map(stages.map((s) => [s.key, s]));
  for (const x of plan.stages) {
    const before = was.byKey[x.key];
    // سبب منع الإيقاف للمرحلة العاملة على الخطة كما هي في المسودة، فما يُوقف معها مرجعه يُفتح زره. وللموقوفة سبب منع
    // إعادتها: «تبدأ مع» مرجعًا يبقى موقوفًا (القرار 22)، فيُفتح زرها حين يُعاد مرجعها في المسودة
    const block = x.off
      ? planRestartBlock(stageBy.get(x.key), { stages, schedule: r.schedule })
      : planOffBlock(stageBy.get(x.key), { stages, requirements, schedule: { ...r.schedule, [x.key]: { ...(r.schedule[x.key] || {}), off: true } } });
    const st = stageBy.get(x.key);
    const pr = stageRules(st || {});
    const over = plan.issues.find((i) => i.code === 'with_over' && i.stage === x.key) || null;
    // المسار المستمر (T1): نهايته لهذه الدفعة وخياراتها، وقاعدة البرنامج للمقارنة، وإزاحته بلا سقف بمدة مرجعه
    const track = x.lane === 'track';
    const trackRow = track ? {
      track: true, until: x.until, until_source: x.until_source, program_until: pr.until,
      until_options: untilOptions(stages.filter((y) => !(r.schedule[y.key]?.off === true)), x.key),
    } : {};
    rows[x.key] = {
      ...x, ...trackRow, pinned: x.source === 'pinned', off: !!x.off, block,
      // التوازي (R3a): المرجع الفعلي وإزاحته، وقاعدة البرنامج للمقارنة، والقائمة وسبب منعها، وحد الإزاحة وتنبيه التجاوز
      with: x.with || null, offset: x.offset || 0, with_lock: x.off ? null : planWithLock(st),
      with_options: x.off ? [] : planWithCandidates(stages, r.schedule, x.key).map((c) => ({ key: c.key, title: c.title_ar || c.key })),
      program_with: pr.unlock === 'with' ? pr.with : null, program_offset: pr.offset,
      offset_max: track ? PLAN_DAYS_MAX : x.with ? Math.max(0, plan.byKey[x.with]?.days ?? 0) : 0, over,
      source_ar: x.off ? 'موقوفة لهذه الدفعة' : x.source === 'cohort' ? `معدّلة: البرنامج ${planDurationAr(x.program_days)}` : PLAN_SOURCE_AR[x.source],
      days_ar: x.off ? 'موقوفة' : planDurationAr(x.days), edited: !sameSchedule(saved[x.key] || {}, r.schedule[x.key] || {}),
      was_ar: before && !before.off && !x.off && before.days !== x.days ? `كانت ${planDurationAr(before.days)}` : before && !!before.off !== !!x.off ? (x.off ? 'كانت تعمل' : 'كانت موقوفة') : '',
    };
  }
  const edits = stages.filter((s) => rows[s.key]?.edited).length;
  return {
    schedule: r.schedule, errors: r.errors, anchored: r.anchored || [], rows, edits, issues: plan.issues,
    pinned: stages.filter((s) => rows[s.key]?.pinned).length,
    changed: plan.stages.filter((x) => x.source === 'cohort').length,
    off: plan.stages.filter((x) => x.off).length,
    cohort: { ...cohort, schedule: r.schedule },
  };
}

// العداد: خطوة بوحدته (يوم أو أسبوع)، والأسبوع يقفز إلى الأسبوع التام التالي أو السابق، ولا ينزل عن حد المرحلة
export function stepDays(days, unit, dir, min = 0, max = 365) {
  const d = Math.max(0, Math.round(Number(days) || 0));
  const step = PLAN_UNITS[unit] || 1;
  let n = step === 1 ? d + dir : dir > 0 ? (Math.floor(d / step) + 1) * step : (Math.ceil(d / step) - 1) * step;
  if (n < min) n = min;
  return Math.min(max, n);
}
// قيمة الحقل بوحدته، والأيام من قيمته: الأسبوع 7 أيام (القرار 9)، وكسر الأسبوع بمنزلة عشرية واحدة
export const inUnit = (days, unit) => (unit === 'weeks' ? Math.round((Number(days) / 7) * 10) / 10 : Number(days));
export const fromUnit = (v, unit) => {
  const n = Number(String(v).replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 1632)));
  if (!Number.isFinite(n)) return null;
  return Math.round(unit === 'weeks' ? n * 7 : n);
};
export { planLock, suggestDays, unitFor, impactLines };
// جسم المعاينة والحفظ: المدد المعدّلة وحدها، و«حرّر التواريخ لتتبع المدد»، وما بُنيت عليه المسودة
// opts: «أبلغ المشاركين» (القرار 13، مطفأ افتراضيًا) وإعادة التشغيل بعد التجاوز (القرار 12، «اعفِ» افتراضيًا) في الحفظ وحده
export const planBody = (cohort, edit, op, opts = {}) => ({
  cohort_id: cohort.id, op, days: edit?.days || {}, ...(edit?.follow ? { follow: true } : {}),
  ...(edit?.off && Object.keys(edit.off).length ? { off: edit.off } : {}),
  // التوازي (R3a): «تسير مع» وإزاحتها لما عُدّل وحده
  ...(edit?.with && Object.keys(edit.with).length ? { with: edit.with } : {}),
  ...(edit?.offset && Object.keys(edit.offset).length ? { offset: edit.offset } : {}),
  // نهاية المسار المستمر (T1) لما عُدّل وحده
  ...(edit?.until && Object.keys(edit.until).length ? { until: edit.until } : {}),
  ...(op === 'save' && opts.notify ? { notify: true } : {}), ...(op === 'save' && opts.reenable === 'apply' ? { reenable: 'apply' } : {}),
  ...(cohort.updated_at ? { base_updated_at: cohort.updated_at } : {}),
});
// سطور السجل: من حفظ ومتى وماذا غيّر، بلا أسماء مشاركين
export function historyRows(list) {
  return (list || []).map((r) => {
    // ما تغيّرت مدته وحده، لا ما تحرك تاريخه لأن ما قبله طال أو قصر
    const n = (r.summary?.changes || []).filter((x) => !x.off && !x.track && x.before !== x.after).length;
    // المسار المستمر (T1): امتداده لا مدته
    const tr = (r.summary?.changes || []).filter((x) => x.track).length;
    // ما تغيّر توازيه (R3a): مرجعه أو إزاحته
    const p = (r.summary?.changes || []).filter((x) => !x.off && !x.track && Array.isArray(x.with)).length;
    const parAr = !p ? '' : `${countAr(p, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')} ${p === 1 ? 'تغيّر توازيها' : p === 2 ? 'تغيّر توازيهما' : 'تغيّر توازيها'}`;
    const stopped = (r.summary?.stopped || []).length, started = (r.summary?.started || []).length;
    const offAr = [stopped ? `${countAr(stopped, 'أُوقفت مرحلة', 'أُوقفت مرحلتان', 'مراحل أُوقفت', 'مرحلة أُوقفت')}` : '', started ? `${countAr(started, 'أُعيدت مرحلة', 'أُعيدت مرحلتان', 'مراحل أُعيدت', 'مرحلة أُعيدت')}` : ''].filter(Boolean).join('، و');
    const durAr = !n ? '' : n === 2 ? 'مرحلتان تغيّرت مدتهما' : `${countAr(n, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')} ${n === 1 ? 'تغيّرت مدتها' : 'تغيّرت مددها'}`;
    const trAr = tr ? `${countAr(tr, 'مسار مستمر واحد', 'مساران مستمران', 'مسارات مستمرة', 'مسارًا مستمرًا')} ${tr === 1 ? 'تغيّر امتداده' : 'تغيّر امتدادها'}` : '';
    const what = r.action === 'cohort.plan-undo' ? 'تراجع عن آخر حفظ' : offAr || durAr || parAr || trAr ? [offAr, durAr, parAr, trAr].filter(Boolean).join('، و') : r.summary?.changes ? 'حفظ الخطة بلا تغيير في المدد' : 'حفظ الخطة';
    const sh = r.summary?.shift ? `، ${r.summary.shift > 0 ? 'تأخرت' : 'تقدمت'} النهاية ${daysAr(Math.abs(r.summary.shift))}` : '';
    return { id: r.id, at: r.at, by: r.actor || '', text: `${what}${sh}`, undo: r.action === 'cohort.plan-undo' };
  });
}
// سطور نافذة الأثر بتاريخ اللوحة
export const impactAr = (impact, opts = {}) => impactLines(impact, dateOnly, opts);

// ══ السحب في الدفعة (D1، تصور 2026-11-18 ب5.3): طبقة تكتب في المسودة نفسها، لا مسار حفظ ثانٍ ══
// كل حركة تُترجم إلى edit={days,off,with,offset,until} (dropToEdit)، ثم تُدمج بالدالة التي تدمج بها العدادات (mergeEdit)،
// ثم تُفحص بـplanDraft نفسه (applyDrop): ما يخالف حراس R2b وR3a يُرفض بسببه ولا تتغير المسودة. والحفظ بنافذة الأثر كما هو.

/** دمج تعديل في المسودة، وهو ما تناديه العدادات والسحب معًا فلا يختلف أثرهما:
 * المدة والإزاحة تُكتبان، وتغيير المرجع يعيد إزاحته إلى قاعدته ما لم تُكتب معه، والإيقاف والنهاية ما يطابق المحفوظ منهما لا يبقى تعديلًا
 * @param {any} edit المسودة الحالية @param {{ days?: any, offset?: any, with?: any, until?: any, off?: any }} patch @param {any} [saved] جدول الدفعة المحفوظ */
export function mergeEdit(edit, patch = {}, saved = {}) {
  const e = { ...(edit || {}) };
  if (patch.days) e.days = { ...(e.days || {}), ...patch.days };
  if (patch.with) {
    const offset = { ...(e.offset || {}) };
    for (const k of Object.keys(patch.with)) if (!(patch.offset && k in patch.offset)) delete offset[k];
    e.with = { ...(e.with || {}), ...patch.with };
    e.offset = offset;
  }
  if (patch.offset) e.offset = { ...(e.offset || {}), ...patch.offset };
  if (patch.until) {
    const until = { ...(e.until || {}) };
    for (const [k, v] of Object.entries(patch.until)) {
      if ((v ?? null) === (saved?.[k]?.until ?? null)) delete until[k]; else until[k] = v;
    }
    e.until = until;
  }
  if (patch.off) {
    const off = { ...(e.off || {}) };
    for (const [k, v] of Object.entries(patch.off)) {
      if (v === (saved?.[k]?.off === true)) delete off[k]; else off[k] = v;
    }
    e.off = off;
  }
  return e;
}

// قرب الالتصاق بالحدود بالنقاط المئوية على المسار (السحب بالمؤشر)، ولوحة المفاتيح تلتصق باليوم المطابق وحده
export const DRAG_SNAP_PCT = 1.2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** حركة السحب إلى تعديل في المسودة، باليوم الصحيح وبالحدود. لا تقرأ بكسلًا: الإزاحة بالأيام من المقياس (scaleDay)
 * @param {{ scale: any, draft: any, key: string, kind: 'move' | 'end', shift?: number, pct?: number | null, over?: { zone?: string | null, key?: string | null } | null,
 *   snap?: 'near' | 'exact', stage?: any, title?: (k: string) => string }} o
 *  shift: الأيام (من لوحة المفاتيح)، أو pct: النقاط المئوية التي تحرّكها المؤشر من موضع الالتقاط (يُحوَّل بعكس المقياس)
 * @returns {{ none?: true, patch?: any, ghost?: [number, number], reject?: { code: string, msg: string, program?: boolean } }} */
export function dropToEdit({ scale, draft, key, kind, shift = 0, pct = null, over = null, snap = 'near', stage = null, title = (k) => k }) {
  const row = draft?.rows?.[key];
  const sp = scale?.spans?.[key];
  if (!row || !sp || row.off) return { reject: { code: 'off', msg: `«${title(key)}» موقوفة لهذه الدفعة، فلا تُسحب. أعدها بمفتاحها أولًا` } };
  const [f, e] = sp;
  const pos = (d) => scalePos(scale.slots, d);
  // النقطة الجديدة بالأيام: من لوحة المفاتيح مباشرة، ومن المؤشر بعكس المقياس من موضع الطرف أو البداية
  const moved = (d0) => (pct == null ? d0 + shift : scaleDay(scale.slots, pos(d0) + pct));
  const lane = row.track ? 'track' : 'stage';
  const programMsg = row.track
    ? `«${title(key)}» مسار مستمر في البرنامج، وطبيعته يقررها البرنامج لكل دفعاته`
    : `«${title(key)}» مرحلة متتابعة في البرنامج، وطبيعتها (مرحلة أو مسار مستمر أو خدمة) يقررها البرنامج لكل دفعاته`;
  if (kind === 'move') {
    // الإفلات في صف غير صفه: «مسارات مستمرة» أو «الخدمات» لمرحلة، أو صف المراحل لمسار بلا مرحلة تحته
    const zone = over?.zone || null;
    if ((zone === 'tracks' || zone === 'services') && lane !== 'track') return { reject: { code: 'lane', msg: programMsg, program: true } };
    if (zone === 'services' || (zone === 'stages' && lane === 'track' && !over?.key)) return { reject: { code: 'lane', msg: programMsg, program: true } };
    // الإفلات على شريط مرحلة أخرى: «تسير مع» (أو «يبدأ مع» للمسار)، والمرشحون من planWithCandidates
    if (over?.key && over.key !== key && over.key !== row.with) {
      if (row.with_lock) return { reject: { code: 'with_lock', msg: row.with_lock.msg } };
      if (!row.with_options.some((o) => o.key === over.key)) {
        return { reject: { code: 'with_target', msg: `لا ${lane === 'track' ? 'يبدأ' : 'تسير'} «${title(key)}» مع «${title(over.key)}»: المرجع مرحلة متتابعة تعمل قبلها في الترتيب${lane === 'track' ? '' : ' من محورها، وليست بوابة قبول'}` } };
      }
      const ts = scale.spans[over.key]?.[0] ?? f;
      return { patch: { with: { [key]: over.key } }, ghost: [ts, ts + (e - f)] };
    }
    if (!row.with) {
      if (Math.round(moved(f) - f) === 0) return { none: true, ghost: [f, e] };
      return { reject: { code: 'sequential', msg: `«${title(key)}» تبدأ بعد ما قبلها، فلا تُسحب بدايتها. غيّر مدة ما قبلها، أو اسحب طرفها لتغيير مدتها` } };
    }
    const d = Math.round(moved(f) - f);
    const offset = clamp(row.offset + d, 0, row.offset_max);
    if (offset === row.offset) return { none: true, ghost: [f, e] };
    const dd = offset - row.offset;
    return { patch: { offset: { [key]: offset } }, ghost: [f + dd, e + dd] };
  }
  // سحب الطرف: المدة، أو نهاية المسار
  if (row.pinned) return { reject: { code: 'pinned', msg: `«${title(key)}» مثبتة بتاريخ (${row.days_ar})، فلا تتبع المدد. حرّرها بـ«حرّر التواريخ لتتبع المدد»` } };
  const raw = moved(e);
  const near = (target) => (snap === 'near' ? Math.abs(pos(target) - pos(raw)) <= DRAG_SNAP_PCT || Math.abs(target - raw) < 0.5 : Math.round(raw) === target);
  if (row.track) {
    // يلتصق بنهاية الرحلة ثم بنهاية طور (بنهاية مفتوحة: اليوم التالي لآخر يوم)
    const targets = [['journey_end', scale.journey_end], ...Object.entries(scale.phase_ends || {}).map(([k, v]) => [`phase:${k}`, v])];
    for (const [u, t] of targets) {
      if (t > f && near(t)) {
        if (row.until === u) return { none: true, ghost: [f, t] };
        return { patch: { until: { [key]: u } }, ghost: [f, t] };
      }
    }
    const n = clamp(Math.round(raw) - f, 1, PLAN_DAYS_MAX);
    if (row.until === 'days' && n === row.days) return { none: true, ghost: [f, f + n] };
    return { patch: { ...(row.until === 'days' ? {} : { until: { [key]: 'days' } }), days: { [key]: n } }, ghost: [f, f + n] };
  }
  // المرحلة: يلتصق بحدود الخانات (بداية خانة أو نهايتها)، ثم باليوم الصحيح، ولا ينزل عن حدها
  let end = Math.round(raw);
  if (snap === 'near') {
    const bounds = [...new Set(scale.slots.flatMap((x) => [x.from, x.to]))].filter((b) => b > f && b !== e);
    const hit = bounds.find((b) => Math.abs(pos(b) - pos(raw)) <= DRAG_SNAP_PCT / 2);
    if (hit != null) end = hit;
  }
  const min = stage ? planDaysMin(stage) : 0;
  const n = clamp(end - f, min, PLAN_DAYS_MAX);
  if (n === row.days) return { none: true, ghost: [f, f + n] };
  return { patch: { days: { [key]: n } }, ghost: [f, f + n] };
}

/** تطبيق الحركة على المسودة بالفحص نفسه: المسودة الجديدة من planDraft، وما يظهر فيها من خطأ جديد (حارس الإيقاف أو التوازي
 * أو المدى) يرفض الحركة بسببه، فلا تتغير المسودة
 * @param {{ def: any, cohort: any, edit: any, patch: any }} o
 * @returns {{ edit?: any, draft: any, reject?: { code: string, msg: string } }} */
export function applyDrop({ def, cohort, edit, patch }) {
  const base = edit || { days: {}, off: {}, with: {}, offset: {}, until: {} };
  const before = planDraft({ def, cohort, edit: base });
  const next = mergeEdit(base, patch, cohort?.schedule || {});
  const after = planDraft({ def, cohort, edit: next });
  const had = new Set(before.errors.map((x) => `${x.stage}:${x.code}:${x.msg}`));
  const fresh = after.errors.filter((x) => !had.has(`${x.stage}:${x.code}:${x.msg}`));
  if (fresh.length) return { draft: before, reject: { code: fresh[0].code, msg: fresh[0].msg } };
  return { edit: next, draft: after };
}

/** سطر الشبح أثناء السحب: التواريخ الناتجة من المسودة بعد الحركة (planDraft)، أو المدة إن كانت الدفعة بلا تواريخ
 * @param {any} row صف المرحلة في المسودة بعد الحركة @param {string} title */
export function dragGhostAr(row, title) {
  if (!row) return '';
  const when = row.from && row.to ? (row.from === row.to ? dateOnly(row.from) : `${dateOnly(row.from)} إلى ${dateOnly(row.to)}`) : '';
  const off = row.with && row.offset ? `، تبدأ بعد ${daysAr(row.offset)} من بداية مرجعها` : '';
  return `«${title}»: ${when ? `${when}، ` : ''}${row.days_ar}${off}`;
}
