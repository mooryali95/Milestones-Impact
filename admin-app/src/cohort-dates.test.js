// ملاحظات المالك 2026-11-19 على محرر رحلة الدفعة:
// 1) اللوحة: لا عمود أضيق من حده المقروء ولو سارت ثلاث مراحل معًا (boardMinWidth).
// 2) التواريخ المباشرة: بداية المرحلة ونهايتها من بطاقتها في المسودة نفسها (datesPatch ثم mergeEdit ثم planEdit)، بحراسها.
// 3) المحور الزمني الكامل: خطي من نوافذ الخط نفسه (timelineAxis)، صف لكل مرحلة، واليوم، ونهاية الدفعة، ونقاط الورش.
import { describe, expect, it } from 'vitest';
import { cohortPlan } from '../../supabase/functions/leaders-api/stage-windows.js';
import { impactLines, planDatesResolve, planEdit, planImpact } from '../../supabase/functions/leaders-api/cohort-plan.js';
import { BOARD_COL_MIN, BOARD_TOGETHER_MIN, BOARD_TRACK_MIN, boardMinWidth, timelineAxis } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { applyDrop, cohortTimeline, datesPatch, mergeEdit, planBody, planDraft, unpinPatch } from './cohort-journey.js';

const WITH = (k, offset = 0) => ({ unlock: 'with', with: k, ...(offset ? { offset } : {}) });
const S = (key, sort, days, title, phase, rules) => ({ key, sort, duration_days: days, title_ar: title, phase, active: true, ...(rules ? { rules } : {}) });
const stages = [
  S('profile', 1, 4, 'الملف الشخصي', 'admission'),
  S('approval', 2, 4, 'اعتماد المستوى', 'admission'),
  S('training', 3, 14, 'التدريب', 'qualification'),
  S('reading', 3.3, 7, 'القراءة الموجهة', 'qualification', WITH('training')),
  S('ojt', 3.6, 3, 'التوجيه على رأس العمل', 'qualification', WITH('training', 1)),
  S('lead', 4, 4, 'التوجيه القيادي', 'qualification'),
  S('club', 4.5, 28, 'نادي القادة', 'qualification', { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end' }),
  S('support', 5, 14, 'الدعم والتمكين', 'impact'),
  S('evaluation', 6, 2, 'التقييم والقياس', 'impact', WITH('support', 14)),
  S('final', 7, 1, 'التقرير النهائي', 'impact'),
];
const requirements = [{ id: 'r2', code: 'T-WS', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'ورشة القيادة', sort: 1, active: true }];
const sessions = [{ id: 's1', requirement_id: 'r2', cohort_id: 'c1', title_ar: 'اليوم 1', starts_at: '2026-11-18T06:00:00Z', ends_at: '2026-11-18T12:00:00Z', active: true }];
const def = { stages, requirements, sessions };
// جدول سابق مثبت بتاريخ: التدريب يوم واحد، فتبقى خانته (أسبوع بمن يسير معه) أضيق ما في اللوحة
const PINNED = { training: { start: '2026-11-18', end: '2026-11-18' } };
const cohort = { id: 'c1', starts_on: '2026-11-10', ends_on: '2026-12-15', schedule: PINNED, updated_at: 'u0' };
const today = new Date('2026-11-19T09:00:00Z');
const EMPTY = { days: {}, off: {}, with: {}, offset: {}, until: {} };
const edit = (dates, sched = PINNED, extra = {}) => planEdit({ stages, schedule: sched, cohort: { ...cohort, schedule: sched }, requirements, edit: { dates, ...extra } });

describe('اللوحة: أقل عرض لعمود المرحلة', () => {
  const model = cohortTimeline(def, cohort, today);
  const min = boardMinWidth(model.slots);
  it('ثلاث تسير معًا وخانتان من مرحلتين: لا خانة أضيق من حدها على أقل عرض للمسار', () => {
    const three = model.slots.find((x) => x.stages.length === 3);
    expect(three.stages).toEqual(['training', 'reading', 'ojt']);
    expect(model.slots.some((x) => x.stages.length === 2)).toBe(true);
    for (const x of model.slots) {
      const px = (min * x.width) / 100;
      expect(px).toBeGreaterThanOrEqual((x.together ? BOARD_TOGETHER_MIN : BOARD_COL_MIN) - 0.5);
    }
    // والممر داخل خانة «تسير معًا» يتسع لحد العمود بعد إطارها (حشو 6 وحد 1 من كل جهة)
    expect(BOARD_TOGETHER_MIN - 14).toBeGreaterThanOrEqual(BOARD_COL_MIN);
  });
  it('اللوحة الواسعة أصلًا تبقى على عرضها، والخانة الصغيرة جدًا بين طويلات توسع المسار', () => {
    expect(boardMinWidth([{ width: 50 }, { width: 50 }])).toBe(BOARD_TRACK_MIN);
    expect(boardMinWidth([{ width: 5, together: true }, { width: 95 }])).toBe(4000);
    expect(boardMinWidth([])).toBe(BOARD_TRACK_MIN);
  });
});

describe('التواريخ المباشرة: planDatesResolve وplanEdit', () => {
  it('مثبتة بتاريخ: تاريخان جديدان يثبتانها بهما، وما بعدها يُزاح منها', () => {
    const r = edit({ training: { start: '2026-11-19', end: '2026-11-25' } });
    expect(r.errors).toEqual([]);
    expect(r.schedule.training).toEqual({ start: '2026-11-19', end: '2026-11-25' });
    const p = cohortPlan(stages, { ...cohort, schedule: r.schedule });
    expect(p.byKey.training).toMatchObject({ from: '2026-11-19', to: '2026-11-25', days: 7, source: 'pinned' });
    expect(p.byKey.reading.from).toBe('2026-11-19');
    expect(p.byKey.lead.from).toBe('2026-11-26');
  });
  it('غير مثبتة لم تتحرك بدايتها: النهاية مدة وحدها، فتبقى تتبع ما قبلها', () => {
    const r = edit({ lead: { start: '2026-11-25', end: '2026-11-30' } });
    expect(r.errors).toEqual([]);
    expect(r.schedule.lead).toEqual({ days: 6 });
    // وإن طابقت مدة البرنامج فلا فرق يُكتب
    expect(edit({ lead: { start: '2026-11-25', end: '2026-11-28' } }).changed).toBe(false);
  });
  it('غير مثبتة تحركت بدايتها: تثبيت بتاريخين', () => {
    const r = edit({ lead: { start: '2026-11-27', end: '2026-11-30' } });
    expect(r.schedule.lead).toEqual({ start: '2026-11-27', end: '2026-11-30' });
    expect(cohortPlan(stages, { ...cohort, schedule: r.schedule }).byKey.support.from).toBe('2026-12-01');
  });
  it('«تسير مع» مرجعًا: البداية إزاحة من بدايته والنهاية مدة، بلا تثبيت', () => {
    const sched = { training: { start: '2026-11-18', end: '2026-11-24' } };
    const r = edit({ reading: { start: '2026-11-20', end: '2026-11-29' } }, sched);
    expect(r.errors).toEqual([]);
    expect(r.schedule.reading).toEqual({ offset: 2, days: 10 });
    // إزاحة النسخة نفسها لا تُكتب
    expect(edit({ ojt: { start: '2026-11-19', end: '2026-11-21' } }, sched).changed).toBe(false);
  });
  it('قيد التوازي باقٍ: بداية خارج مدى المرجع تُرفض برسالة تسمي المدى', () => {
    const r = edit({ reading: { start: '2026-11-25', end: '2026-11-30' } });
    expect(r.errors.map((e) => e.code)).toEqual(['dates_with']);
    expect(r.errors[0].msg).toContain('«القراءة الموجهة» تسير مع «التدريب»، فبدايتها من 18 نوفمبر 2026 إلى 19 نوفمبر 2026');
    expect(r.schedule).toEqual(PINNED);
    expect(edit({ reading: { start: '2026-11-17', end: '2026-11-20' } }).errors[0].code).toBe('dates_with');
  });
  it('الحراس: قبل بداية الدفعة، ونهاية قبل البداية، وتاريخ غير صحيح، ومسار مستمر، ومدة فوق الحد', () => {
    const code = (v, k = 'training') => edit({ [k]: v }).errors.map((e) => e.code);
    expect(code({ start: '2026-11-09', end: '2026-11-12' })).toEqual(['dates_before']);
    expect(code({ start: '2026-11-20', end: '2026-11-19' })).toEqual(['dates_order']);
    expect(code({ start: '2026-02-30', end: '2026-11-19' })).toEqual(['dates_value']);
    expect(code({ start: '2026-11-20' })).toEqual(['dates_value']);
    expect(code({ start: '2026-11-20', end: '2028-11-20' })).toEqual(['range']);
    expect(code({ start: '2026-11-20', end: '2026-11-25' }, 'club')).toEqual(['dates_track']);
    expect(code({ start: '2026-11-20', end: '2026-11-25' }, 'nope')).toEqual(['unknown']);
    expect(edit({ training: { start: '2026-11-09', end: '2026-11-12' } }).errors[0].msg).toBe('بداية «التدريب» قبل بداية الدفعة (10 نوفمبر 2026)');
  });
  it('الدفعة المفتوحة وبلا بداية والموقوفة: لا تواريخ', () => {
    const at = (c, sched = {}) => planEdit({ stages, schedule: sched, cohort: { ...c, schedule: sched }, requirements, edit: { dates: { lead: { start: '2026-11-27', end: '2026-11-30' } } } }).errors.map((e) => e.code);
    expect(at({ ...cohort, is_default: true })).toEqual(['dates_open']);
    expect(at({ ...cohort, starts_on: null })).toEqual(['dates_undated']);
    expect(at(cohort, { lead: { off: true } })).toEqual(['dates_off']);
  });
  it('«اتبع المدد» لمرحلة واحدة: تصير مدة بطولها الحالي، وتُعدَّل مدتها في التعديل نفسه', () => {
    const sched = { training: { start: '2026-11-20', end: '2026-11-24' } };
    const r = edit({ training: null }, sched);
    expect(r.schedule).toEqual({ training: { days: 5 } });
    expect(cohortPlan(stages, { ...cohort, schedule: r.schedule }).byKey.training).toMatchObject({ from: '2026-11-18', to: '2026-11-22', source: 'cohort' });
    expect(edit({ training: null }, sched, { days: { training: 9 } }).schedule).toEqual({ training: { days: 9 } });
    // لا أثر على غير المثبتة
    expect(edit({ lead: null }).changed).toBe(false);
  });
  it('planDatesResolve مصدر واحد: الأنواع الثلاثة', () => {
    const plan = cohortPlan(stages, cohort);
    const of = (k, start, end) => planDatesResolve({ stage: stages.find((s) => s.key === k), plan, cohort, entry: cohort.schedule[k], start, end, title: (x) => x });
    expect(of('training', '2026-11-18', '2026-11-20')).toEqual({ kind: 'pin', start: '2026-11-18', end: '2026-11-20' });
    expect(of('lead', '2026-11-25', '2026-11-26')).toEqual({ kind: 'days', days: 2 });
    expect(of('ojt', '2026-11-18', '2026-11-19')).toEqual({ kind: 'offset', offset: 0, days: 2 });
  });
  it('نافذة الأثر تسمي التثبيت وتحريره', () => {
    const r = edit({ lead: { start: '2026-11-27', end: '2026-11-30' } });
    const lines = impactLines(planImpact({ stages, before: PINNED, after: r.schedule, cohort, milestones: [], people: [], today })).filter((x) => x.kind === 'change').map((x) => x.text);
    expect(lines[0]).toBe('التوجيه القيادي: بمدتها نفسها، وتصير من 2026-11-27 إلى 2026-11-30، مثبتة بتاريخها فلا تتبع ما قبلها');
    const was = { training: { start: '2026-11-20', end: '2026-11-24' } };
    const back = edit({ training: null }, was);
    const l2 = impactLines(planImpact({ stages, before: was, after: back.schedule, cohort: { ...cohort, schedule: was }, milestones: [], people: [], today })).find((x) => x.key === 'c-training').text;
    expect(l2).toContain('وتتبع المدد بعد أن كانت مثبتة بتاريخ');
  });
});

describe('التواريخ المباشرة في المسودة: المسار نفسه الذي تكتبه العدادات والسحب', () => {
  const draft0 = planDraft({ def, cohort, edit: EMPTY });
  it('صف كل مرحلة متتابعة مؤرخة يحمل تاريخيه وحدودهما، والمسار المستمر والدفعة المفتوحة بلا حقلين', () => {
    expect(draft0.rows.training.dates).toEqual({ from: '2026-11-18', to: '2026-11-18', min: '2026-11-10' });
    expect(draft0.rows.reading.dates).toMatchObject({ from: '2026-11-18', to: '2026-11-24', with_title: 'التدريب', with_min: '2026-11-18', with_max: '2026-11-19' });
    expect(draft0.rows.club.dates).toBeNull();
    expect(planDraft({ def, cohort: { ...cohort, is_default: true }, edit: EMPTY }).rows.lead.dates).toBeNull();
  });
  it('المثبتة: dates في المسودة، ثم جسم المعاينة والحفظ يحملها', () => {
    const { patch } = datesPatch({ def, draft: draft0, key: 'training', start: '2026-11-18', end: '2026-11-20' });
    expect(patch).toEqual({ dates: { training: { start: '2026-11-18', end: '2026-11-20' } } });
    const r = applyDrop({ def, cohort, edit: EMPTY, patch });
    expect(r.reject).toBeUndefined();
    expect(r.draft.rows.training).toMatchObject({ pinned: true, days: 3, edited: true, to: '2026-11-20' });
    expect(r.draft.edits).toBe(1);
    expect(planBody(cohort, r.edit, 'preview')).toMatchObject({ cohort_id: 'c1', op: 'preview', dates: { training: { start: '2026-11-18', end: '2026-11-20' } }, base_updated_at: 'u0' });
    expect(planBody(cohort, EMPTY, 'preview').dates).toBeUndefined();
  });
  it('غير المثبتة: مدة أو إزاحة بما تكتبه العدادات، فلا تثبيت', () => {
    expect(datesPatch({ def, draft: draft0, key: 'lead', start: '2026-11-25', end: '2026-11-30' }).patch).toEqual({ days: { lead: 6 } });
    expect(datesPatch({ def, draft: draft0, key: 'ojt', start: '2026-11-18', end: '2026-11-22' }).patch).toEqual({ offset: { ojt: 0 }, days: { ojt: 5 } });
  });
  it('المرفوض بسببه ولا تتغير المسودة', () => {
    const res = datesPatch({ def, draft: draft0, key: 'reading', start: '2026-11-25', end: '2026-11-30' });
    expect(res.patch).toBeUndefined();
    expect(res.reject.code).toBe('dates_with');
  });
  it('mergeEdit: التثبيت يغلب مدة قبله، والمدة بعده تحرر المثبتة أولًا، و«اتبع المدد» لغير المثبتة لا يبقى تعديلًا', () => {
    const a = mergeEdit({ ...EMPTY, days: { lead: 9 } }, { dates: { lead: { start: '2026-11-27', end: '2026-11-30' } } }, PINNED);
    expect(a.days).toEqual({});
    expect(a.dates).toEqual({ lead: { start: '2026-11-27', end: '2026-11-30' } });
    // مدة بعد تثبيت في المسودة لمرحلة غير مثبتة في المحفوظ: يسقط التثبيت
    expect(mergeEdit(a, { days: { lead: 5 } }, PINNED).dates).toEqual({});
    // ولمثبتة في المحفوظ: تُحرر أولًا ثم تُكتب المدة
    const b = mergeEdit({ ...EMPTY, dates: { training: { start: '2026-11-18', end: '2026-11-20' } } }, { days: { training: 4 } }, PINNED);
    expect(b.dates).toEqual({ training: null });
    expect(planDraft({ def, cohort, edit: b }).rows.training).toMatchObject({ pinned: false, days: 4 });
    expect(mergeEdit(EMPTY, unpinPatch('lead'), PINNED).dates).toEqual({});
    expect(mergeEdit(EMPTY, unpinPatch('training'), PINNED).dates).toEqual({ training: null });
  });
});

describe('المحور الزمني الكامل: timelineAxis', () => {
  const model = cohortTimeline(def, cohort, today);
  const axis = timelineAxis(model);
  const row = (k) => axis.rows.find((r) => r.key === k);
  it('خطي من أول يوم إلى نهاية الدفعة: كل يوم بالعرض نفسه، والشريط من تاريخي المرحلة في الخطة', () => {
    expect(axis.dated).toBe(true);
    expect(axis.days).toBe(36);
    const plan = cohortPlan(stages, cohort);
    for (const r of axis.rows) {
      const w = plan.byKey[r.key];
      const from = Math.round((new Date(w.from) - new Date(cohort.starts_on)) / 864e5);
      expect(r.from).toBe(from);
      expect(r.at).toBeCloseTo((from / 36) * 100, 1);
      expect(r.width).toBeCloseTo(((r.to - r.from) / 36) * 100, 1);
    }
    expect(row('training')).toMatchObject({ from: 8, to: 9, when_ar: '18 نوفمبر' });
  });
  it('صف لكل مرحلة، وما يسير معًا يتراكب في الزمن في صفوف مختلفة، والمسار المستمر صف بنوعه', () => {
    expect(axis.rows.map((r) => r.key)).toEqual(['profile', 'approval', 'training', 'reading', 'ojt', 'lead', 'support', 'evaluation', 'final', 'club']);
    expect(row('reading').from).toBeLessThan(row('ojt').to);
    expect(row('ojt').from).toBeLessThan(row('reading').to);
    expect(row('club')).toMatchObject({ kind: 'track', to: 36 });
    expect(row('lead').together).toBe(false);
  });
  it('الأشهر والأسابيع: قطعة لكل شهر، وعلامة كل سبعة أيام برقمها', () => {
    expect(axis.months.map((m) => [m.label, m.days])).toEqual([['نوفمبر 2026', 21], ['ديسمبر', 15]]);
    expect(axis.weeks.map((w) => w.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(axis.weeks[1].at).toBeCloseTo((7 / 36) * 100, 1);
    expect(axis.months[0].width + axis.months[1].width).toBeCloseTo(100, 1);
  });
  it('اليوم في وسط يومه، ونهاية الدفعة والرحلة علامة واحدة إن تطابقتا وعلامتان إن اختلفتا', () => {
    expect(axis.today).toEqual({ at: 26.39, label: 'اليوم 19 نوفمبر' });
    expect(axis.markers).toEqual([{ key: 'end', kind: 'cohort', at: 100, label: 'نهاية الدفعة والرحلة 15 ديسمبر' }]);
    const later = timelineAxis(cohortTimeline(def, { ...cohort, ends_on: '2026-12-20' }, today));
    expect(later.days).toBe(41);
    expect(later.markers.map((m) => [m.kind, m.label])).toEqual([['chain', 'نهاية الرحلة 15 ديسمبر'], ['cohort', 'نهاية الدفعة 20 ديسمبر']]);
    expect(later.markers[0].at).toBeCloseTo((36 / 41) * 100, 1);
  });
  it('أيام الورش نقاط في صف مرحلتها، ونص الشريط يسميها', () => {
    expect(row('training').dots).toEqual([{ at: 23.61, date: '2026-11-18', label: '18 نوفمبر', title: 'ورشة القيادة', required: true, outside: false }]);
    expect(row('training').text).toContain('يوم ورشة: 18 نوفمبر');
    expect(row('lead').dots).toEqual([]);
  });
  it('يتبع المسودة: تاريخ كُتب في البطاقة يحرك الشريط وما بعده', () => {
    const d = planDraft({ def, cohort, edit: { ...EMPTY, dates: { training: { start: '2026-11-18', end: '2026-11-20' } } } });
    const a2 = timelineAxis(cohortTimeline(def, d.cohort, today));
    expect(a2.rows.find((r) => r.key === 'training')).toMatchObject({ from: 8, to: 11 });
  });
  it('بلا تواريخ (دفعة بلا بداية): أسابيع نسبية بلا أشهر ولا يوم ولا علامات، والفارغ لا محور له', () => {
    const u = timelineAxis(cohortTimeline(def, { ...cohort, starts_on: null, schedule: {} }, today));
    expect(u.dated).toBe(false);
    expect(u.months).toEqual([]);
    expect(u.today).toBeNull();
    expect(u.markers).toEqual([]);
    expect(u.rows.length).toBe(10);
    expect(timelineAxis(cohortTimeline({ stages: [], requirements: [] }, cohort, today))).toBeNull();
    expect(timelineAxis(null)).toBeNull();
  });
});
