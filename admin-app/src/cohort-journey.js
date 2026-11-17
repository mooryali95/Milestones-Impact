// ════════════════════════════════════════════════════════════════
// الرحلة في لمحة للدفعة (R1 في تصور محرر رحلة الدفعة): نموذج عرض تبويب «الرحلة» في ملف الدفعة، للقراءة فقط
// ════════════════════════════════════════════════════════════════
// لا حساب تاريخ هنا: النوافذ والحالات والمدد والخط الزمني كلها من journeyTimeline (وهو يقرأ stageWindows)، ومواعيد
// المعالم من milestoneDueInfo بالنوافذ نفسها كما يقرؤها milestoneStatuses، وأعداد الناس من خريطة الرحلة (admin.cohort-journey).
// هذا الملف يجمع الثلاثة في رأس وممرات وبطاقات، فلا يختلف تاريخ بين الخط والبطاقة والمعلم.
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { daysAr, renderJourneyText, stageRules } from '../../supabase/functions/leaders-api/journey.js';
import { countAr } from '../../supabase/functions/leaders-api/labels.js';
import { daysBetween, MILESTONE_ANCHOR_AR, milestoneDueInfo } from '../../supabase/functions/leaders-api/milestones.js';
import { dateOnly, dayLong } from './dates.js';

// تبويبا ملف الدفعة، والمختار في العنوان (?view=journey) فيُفتح الرابط عليه ويبقى بعد التحديث
export const COHORT_TABS = [['overview', 'الملف'], ['journey', 'الرحلة']];
export const cohortTab = (qs = '') => (new URLSearchParams(String(qs)).get('view') === 'journey' ? 'journey' : 'overview');

// من أين جاء موعد المعلم (مصدر milestoneDueInfo)، بكلمات المدير
export const DUE_SOURCE_AR = Object.freeze({
  schedule: 'من جدول الدفعة', window: 'محسوب من مدد المراحل', cohort: 'من تاريخ الدفعة', date: 'تاريخ محدد في البرنامج',
});
// من أين جاءت نافذة المرحلة
export const WINDOW_SOURCE_AR = Object.freeze({ schedule: 'من جدول الدفعة المكتوب', plan: 'محسوبة من بداية الدفعة ومدد المراحل' });

const stagesAr = (n) => countAr(n, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة');
const milestonesAr = (n) => countAr(n, 'معلم واحد', 'معلمان', 'معالم', 'معلمًا');
const actsAr = (n) => countAr(n, 'نشاط واحد', 'نشاطان', 'أنشطة', 'نشاطًا');

// الدفعة المؤرخة: لها بداية واحدة وليست المفتوحة. المفتوحة مددها نسبية من دخول كل مشارك (القرار 21)، كما في milestoneStatuses
export const cohortDated = (cohort) => !!cohort?.starts_on && !cohort?.is_default;

/** الخط الزمني للدفعة: journeyTimeline نفسه بتعريفها وجلساتها. المفتوحة بلا تواريخ مطلقة ولو ضُبط لها starts_on أو جدول
 * @param {{ stages?: any[], requirements?: any[], sessions?: any[] }} def @param {any} cohort @param {any} [today] */
export function cohortTimeline(def, cohort, today = null) {
  const c = cohort || {};
  const open = !!c.is_default;
  return journeyTimeline({ stages: def?.stages || [], requirements: def?.requirements || [] }, {
    cohort: { ...c, starts_on: open ? null : c.starts_on || null, schedule: open ? {} : c.schedule || {} },
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
  return {
    kind: 'dated', start: model.start, end: model.end, start_ar: dayLong(model.start), end_ar: dayLong(model.end), total,
    now: model.cards.find((x) => x.key === 'now')?.value || '', today: model.today || null,
    over, over_ar: over ? `نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة (${dateOnly(c.ends_on)}). الفرق: ${daysAr(over)}.` : '',
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
  const sched = cohortDated(cohort) ? cohort?.schedule || {} : {};
  // النوافذ التي رسمها الخط بعينها، فلا تُحسب مرة ثانية. المفتوحة لا نوافذ لها (milestoneStatuses)
  const windows = model.dated && cohortDated(cohort) ? Object.fromEntries(model.stages.filter((s) => s.window).map((s) => [s.key, s.window])) : null;
  const ctx = { startsOn: cohort?.starts_on || null, endsOn: cohort?.ends_on || null, schedule: cohort?.schedule || {}, windows };
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

  const card = (s, lead) => {
    const rs = reqs.filter((r) => r.stage_key === s.key && r.active !== false);
    const shown = rs.filter((r) => !r.hidden).length;
    const p = mapStage.get(s.key);
    const ms = stageMs(s.key);
    return {
      key: s.key, title: s.title, phase: s.phase, status: s.status, status_ar: s.status_ar, optional: s.optional,
      label: s.label, window_ar: s.window_ar, today_ar: s.today_ar, lead,
      window_source: s.window ? (sched[s.key]?.start ? 'schedule' : 'plan') : null,
      window_source_ar: s.window ? WINDOW_SOURCE_AR[sched[s.key]?.start ? 'schedule' : 'plan'] : '',
      with_ar: s.with_note || '', rule_ar: ruleAr(raw.get(s.key) || {}, titleOf),
      acts: { shown, total: rs.length, text: rs.length ? (shown === rs.length ? actsAr(rs.length) : `${actsAr(rs.length)}، الظاهر منها ${shown}`) : 'لا أنشطة بعد' },
      undated: !!s.undated,
      people: p ? { here: p.here, late: p.late, done: p.done } : null,
      milestones: ms, late_milestones: ms.reduce((n, m) => n + (m.late || 0), 0),
    };
  };

  const stageBy = new Map(model.stages.map((s) => [s.key, s]));
  const phases = model.phases.map((ph) => {
    const groups = model.slots.map((slot) => {
      const ks = slot.stages.filter((k) => stageBy.get(k)?.phase === ph.key);
      if (!ks.length) return null;
      const stages = ks.map((k, i) => card(stageBy.get(k), i === 0));
      const together = stages.length > 1;
      return {
        key: slot.key, together, stages,
        note_ar: together ? `${stages[0].title}، ومعها ${stages.slice(1).map((x) => `«${x.title}»`).join(' و')}، في الأسابيع نفسها` : '',
      };
    }).filter(Boolean);
    return { key: ph.key, title: ph.title, label: ph.label, groups, count: groups.reduce((n, g) => n + g.stages.length, 0) };
  }).filter((p) => p.groups.length);

  const cohortMs = live.filter((m) => !['stage_end', 'stage_start'].includes(m.anchor) || !stageBy.has(m.stage_key)).map(msOut);
  const together = phases.reduce((n, p) => n + p.groups.filter((g) => g.together).length, 0);
  return { phases, cohort_milestones: cohortMs, counts: { stages: model.stages.length, together, milestones: live.length } };
}

/** صف المؤشرات تحت الرأس: المدة والمراحل وما يسير معًا والمعالم، والناس من الخريطة إن قُرئت
 * @param {any} model @param {any} lanes @param {any} [map] */
export function journeyKpis(model, lanes, map = null) {
  if (!model || model.empty) return [];
  const out = [
    { key: 'total', label: 'المدة', value: model.total_label },
    { key: 'stages', label: 'المراحل', value: `${stagesAr(lanes.counts.stages)} في ${countAr(lanes.phases.length, 'محور واحد', 'محورين', 'محاور', 'محورًا')}` },
    { key: 'together', label: 'تسير معًا', value: lanes.counts.together ? countAr(lanes.counts.together, 'مجموعة واحدة', 'مجموعتان', 'مجموعات', 'مجموعة') : 'لا توازي' },
    { key: 'milestones', label: 'المعالم', value: lanes.counts.milestones ? milestonesAr(lanes.counts.milestones) : 'لا معالم' },
  ];
  if (map?.totals) {
    const t = map.totals;
    out.push({ key: 'people', label: 'في الرحلة', value: `${t.total}${t.late ? `، منهم ${t.late} تجاوز موعده` : ''}`, tone: t.late ? 'warn' : '' });
  }
  return out;
}
