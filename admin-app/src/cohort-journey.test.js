import { describe, expect, it } from 'vitest';
import { cohortDated, cohortTab, cohortTimeline, journeyHeader, journeyKpis, journeyLanes, TAB_TIMELINE_OMIT } from './cohort-journey.js';
import { stageWindows } from '../../supabase/functions/leaders-api/stage-windows.js';
import { milestoneStatuses } from '../../supabase/functions/leaders-api/milestones.js';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 4, duration_days: 28, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 5, duration_days: 14, active: true, rules: { unlock: 'with', with: 'training', mode: 'optional' } },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 6, duration_days: 90, active: true, rules: { unlock: 'day', day: 60 } },
  { key: 'gone', title_ar: 'مرحلة موقوفة', phase: 'impact', sort: 7, duration_days: 7, active: false },
];
const requirements = [
  { id: 'r1', code: 'P-INFO', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', active: true, hidden: false },
  { id: 'r2', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'يوم ورشة', active: true, hidden: false },
  { id: 'r3', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة', active: true, hidden: true },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', active: true, hidden: false },
];
const def = { stages, requirements, sessions: [] };
const cohort = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-02', ends_on: '2026-12-31', schedule: {} };
const milestones = [
  { id: 'm1', title_ar: 'نهاية التدريب', anchor: 'stage_end', stage_key: 'training', offset_days: 0, active: true, sort: 1 },
  { id: 'm2', title_ar: 'خطة الأثر', anchor: 'stage_start', stage_key: 'support', offset_days: 7, active: true, sort: 2 },
  { id: 'm3', title_ar: 'التقرير الختامي', anchor: 'cohort_end', offset_days: 0, active: true, sort: 3 },
  { id: 'm4', title_ar: 'معطل', anchor: 'stage_end', stage_key: 'training', active: false, sort: 4 },
];
const today = new Date('2026-11-16T09:00:00Z');

describe('تبويب الرحلة في ملف الدفعة: التبويب من العنوان', () => {
  it('view=journey يفتح الرحلة، وما سواه الملف', () => {
    expect(cohortTab('view=journey')).toBe('journey');
    expect(cohortTab('view=x&y=1')).toBe('overview');
    expect(cohortTab('')).toBe('overview');
  });
  it('المؤرخة لها بداية وليست المفتوحة', () => {
    expect(cohortDated(cohort)).toBe(true);
    expect(cohortDated({ ...cohort, is_default: true })).toBe(false);
    expect(cohortDated({ ...cohort, starts_on: null })).toBe(false);
  });
});

describe('الممرات والبطاقات', () => {
  const model = cohortTimeline(def, cohort, today);
  const lanes = journeyLanes(model, { def, cohort, milestones, map: null });
  it('المراحل المتوازية ممرات في مجموعة واحدة بترتيبها، والموقوفة في البرنامج لا تظهر', () => {
    expect(lanes.phases.map((p) => p.key)).toEqual(['admission', 'qualification', 'impact']);
    const q = lanes.phases[1];
    expect(q.groups).toHaveLength(1);
    expect(q.groups[0].together).toBe(true);
    expect(q.groups[0].stages.map((s) => s.key)).toEqual(['training', 'ojt', 'consult']);
    expect(q.groups[0].stages.map((s) => s.lead)).toEqual([true, false, false]);
    expect(q.groups[0].note_ar).toBe('«التدريب»، ومعها «التوجيه على رأس العمل» و«الاستشارة»، في الأسابيع نفسها');
    expect(lanes.counts).toEqual({ stages: 6, together: 1, milestones: 3 });
    expect(JSON.stringify(lanes)).not.toContain('gone');
  });
  it('النافذة في البطاقة هي نافذة stageWindows نفسها، ومصدرها مسمى', () => {
    const live = stages.filter((s) => s.active !== false);
    const w = stageWindows(live, cohort);
    const tr = lanes.phases[1].groups[0].stages[0];
    expect(model.stages.find((s) => s.key === 'training').window).toEqual(w.training);
    expect(w.training).toEqual({ from: '2026-11-05', to: '2026-11-19' });
    expect(tr.window_ar).toBe('5 نوفمبر إلى 19 نوفمبر');
    expect(tr.window_source).toBe('plan');
    expect(tr.window_source_ar).toBe('محسوبة من بداية الدفعة ومدد المراحل');
    expect(tr.status).toBe('active');
    expect(tr.acts.text).toBe('نشاطان، الظاهر منها 1');
    const ojt = lanes.phases[1].groups[0].stages[1];
    expect(ojt.with_ar).toBe('تبدأ مع «التدريب»');
  });
  it('مواعيد المعالم تطابق ما يحسبه milestoneStatuses لرحلة المشارك', () => {
    const st = milestoneStatuses(milestones, { cohort, stages, today });
    const tr = lanes.phases[1].groups[0].stages[0];
    expect(tr.milestones.map((m) => m.id)).toEqual(['m1']);
    expect(tr.milestones[0].due).toBe(st.find((m) => m.id === 'm1').due);
    expect(tr.milestones[0].source_ar).toBe('محسوب من مدد المراحل');
    const sup = lanes.phases[2].groups[0].stages[0];
    expect(sup.milestones[0].due).toBe(st.find((m) => m.id === 'm2').due);
    expect(sup.milestones[0].anchor_ar).toBe('بداية مرحلة بعد سبعة أيام');
    expect(sup.rule_ar).toBe('تُفتح بعد 60 يومًا من بداية الدفعة (قاعدة البرنامج، لا تتبع المدد)');
    expect(lanes.cohort_milestones.map((m) => [m.id, m.due, m.source])).toEqual([['m3', '2026-12-31', 'cohort']]);
  });
  it('الجدول المكتوب يسمى مصدره في النافذة والمعلم', () => {
    const c = { ...cohort, schedule: { training: { start: '2026-11-05', end: '2026-11-20' } } };
    const m = cohortTimeline(def, c, today);
    const tr = journeyLanes(m, { def, cohort: c, milestones }).phases[1].groups[0].stages[0];
    expect(tr.window_source).toBe('schedule');
    expect(tr.milestones[0]).toMatchObject({ due: '2026-11-20', source: 'schedule', source_ar: 'من جدول الدفعة' });
  });
  it('بلا تاريخ بداية وجدول مكتوب كامل: الخط مؤرخ من الجدول، ومصدر كل نافذة «الجدول» لا «بداية الدفعة»', () => {
    const live = stages.filter((s) => s.active !== false);
    const full = stageWindows(live, cohort);
    const schedule = Object.fromEntries(Object.entries(full).map(([k, w]) => [k, { start: w.from, end: w.to }]));
    const c = { ...cohort, starts_on: null, schedule };
    const m = cohortTimeline(def, c, today);
    expect(m.dated).toBe(true);
    expect(journeyHeader(m, c).kind).toBe('dated');
    const cards = journeyLanes(m, { def, cohort: c, milestones }).phases.flatMap((p) => p.groups.flatMap((g) => g.stages));
    expect(cards.length).toBe(6);
    expect(new Set(cards.map((x) => x.window_source))).toEqual(new Set(['schedule']));
    expect(cards[0].window_source_ar).toBe('من جدول الدفعة المكتوب');
  });
  it('«تبدأ مع» عبر محورين: القائد قائد الخانة كلها، والجمل لا تناقض البطاقات', () => {
    const st = [
      { key: 'a', title_ar: 'أ', phase: 'qualification', sort: 1, duration_days: 14, active: true },
      { key: 'b', title_ar: 'ب', phase: 'impact', sort: 2, duration_days: 14, active: true, rules: { unlock: 'with', with: 'a' } },
      { key: 'c', title_ar: 'ج', phase: 'impact', sort: 3, duration_days: 7, active: true, rules: { unlock: 'with', with: 'a' } },
    ];
    const d = { stages: st, requirements: [], sessions: [] };
    const m = cohortTimeline(d, cohort, today);
    const l = journeyLanes(m, { def: d, cohort });
    const [q, im] = l.phases;
    expect(q.groups[0]).toMatchObject({ together: false, note_ar: '' });
    expect(q.groups[0].stages[0]).toMatchObject({ key: 'a', lead: true, with_ar: 'تبدأ معها «ب» و«ج» في محور «الأثر»' });
    expect(im.groups[0].together).toBe(true);
    expect(im.groups[0].stages.map((s) => s.lead)).toEqual([false, false]);
    expect(im.groups[0].stages.map((s) => s.with_ar)).toEqual(['تبدأ مع «أ»', 'تبدأ مع «أ»']);
    expect(im.groups[0].note_ar).toBe('«ب» و«ج» تبدأ مع «أ» في محور «التأهيل»، في الأسابيع نفسها');
    expect(new Set(l.phases.flatMap((p) => p.groups.map((g) => g.key))).size).toBe(2);
  });
  it('فشل قراءة المعالم لا يقال عنه «لا معالم»، وبطاقات الخط في التبويب بلا ما يحمله رأسه', () => {
    const l = journeyLanes(model, { def, cohort, milestones: [] });
    expect(journeyKpis(model, l).find((k) => k.key === 'milestones').value).toBe('لا معالم');
    expect(journeyKpis(model, l, null, { msError: true }).find((k) => k.key === 'milestones')).toMatchObject({ value: 'تعذّرت القراءة', tone: 'warn' });
    // المؤرخة: النافذة والآن في الرأس، ويبقى «ينقص». بلا بداية: المدة والمراحل في المؤشرات، وتبقى الأنشطة و«ينقص»
    const keep = (m) => m.cards.map((c) => c.key).filter((k) => !TAB_TIMELINE_OMIT.includes(k));
    expect(model.cards.map((c) => c.key)).toEqual(['window', 'now', 'undated']);
    expect(keep(model)).toEqual(['undated']);
    expect(keep(cohortTimeline(def, { ...cohort, starts_on: null }, today))).toEqual(expect.arrayContaining(['activities', 'undated']));
  });
  it('أعداد الناس من خريطة الرحلة: في المرحلة ومن تجاوز موعده وأنهاها، وعدادات المعالم', () => {
    const map = { totals: { total: 5, late: 1 }, stages: [{ key: 'training', here: 3, late: 1, done: 2 }], milestones: [{ id: 'm1', done: 2, late: 1 }] };
    const l = journeyLanes(model, { def, cohort, milestones, map });
    const tr = l.phases[1].groups[0].stages[0];
    expect(tr.people).toEqual({ here: 3, late: 1, done: 2 });
    expect(tr.milestones[0]).toMatchObject({ done: 2, late: 1 });
    expect(tr.late_milestones).toBe(1);
    expect(l.phases[1].groups[0].stages[1].people).toBeNull();
    const k = journeyKpis(model, l, map);
    expect(k.map((x) => x.key)).toEqual(['total', 'stages', 'together', 'milestones', 'people']);
    expect(k.at(-1)).toMatchObject({ value: '5 أعضاء، منهم 1 تجاوز موعده', tone: 'warn' });
    expect(journeyKpis(model, l, { totals: { total: 12, late: 0 } }).at(-1).value).toBe('12 عضوًا');
    expect(k[1].value).toBe('6 مراحل في 3 محاور');
  });
});

describe('الرأس', () => {
  it('المؤرخة: البداية والنهاية بأيامهما والمدة والآن، وتنبيه تجاوز نهاية الدفعة', () => {
    const model = cohortTimeline(def, cohort, today);
    const h = journeyHeader(model, cohort);
    expect(h.kind).toBe('dated');
    expect(h.start).toBe('2026-11-02');
    expect(h.start_ar).toBe('الاثنين، 2 نوفمبر 2026');
    expect(h.end).toBe(model.end);
    expect(h.total).toBe(model.total_label);
    expect(h.now).toMatch(/^الأسبوع 3/);
    expect(h.over).toBeGreaterThan(0);
    expect(h.over_ar).toMatch(/^نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة \(31 ديسمبر 2026\)\. الفرق: /);
    expect(journeyHeader(model, { ...cohort, ends_on: '2028-01-01' }).over).toBe(0);
  });
  it('المفتوحة بلا تواريخ مطلقة ولو كان لها تاريخ بداية وجدول', () => {
    const c = { ...cohort, is_default: true, schedule: { training: { start: '2026-11-05', end: '2026-11-20' } } };
    const model = cohortTimeline(def, c, today);
    expect(model.dated).toBe(false);
    expect(journeyHeader(model, c)).toMatchObject({ kind: 'open', text: 'دفعة مفتوحة: المدد نسبية من دخول كل مشارك، ولا تواريخ مطلقة.' });
    const l = journeyLanes(model, { def, cohort: c, milestones });
    expect(l.phases[1].groups[0].stages[0].window_source).toBeNull();
    // المعلم في المفتوحة لا يؤرَّخ بالنافذة المحسوبة (milestoneStatuses)
    expect(l.phases[2].groups[0].stages[0].milestones[0]).toMatchObject({ due: null, due_ar: 'بلا موعد بعد' });
  });
  it('بلا بداية: أسابيع نسبية وسطر واضح، وبرنامج بلا مراحل سطر فارغ', () => {
    const c = { ...cohort, starts_on: null };
    expect(journeyHeader(cohortTimeline(def, c, today), c).kind).toBe('undated');
    const empty = cohortTimeline({ stages: [] }, cohort, today);
    expect(journeyHeader(empty, cohort).kind).toBe('empty');
    expect(journeyLanes(empty, { def: {}, cohort }).phases).toEqual([]);
    expect(journeyKpis(empty, journeyLanes(empty, {}))).toEqual([]);
  });
});
