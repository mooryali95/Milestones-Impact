import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanDueOverride, cleanMilestone, cleanSchedule, distributeSchedule, latinDigits, milestoneDue, milestoneStatuses, milestoneSummary } from '../../supabase/functions/leaders-api/logic.js';

const stages = [
  { key: 'intro', sort: 1, duration_days: 1 },
  { key: 'training', sort: 2, duration_days: 0 },
  { key: 'consult', sort: 3, rules: { mode: 'on_demand' } },
  { key: 'coaching', sort: 4, duration_days: 20 },
];

describe('المدة الحرة والمعالم', () => {
  it('يوزع المراحل الإلزامية على المدة بلا فجوة ولا تداخل، وعند الطلب على المدة كلها', () => {
    const s = distributeSchedule(stages, '2026-01-01', '2026-01-31');
    expect(s.intro.start).toBe('2026-01-01');
    expect(s.coaching.end).toBe('2026-01-31');
    expect(s.consult).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(s.training.start > s.intro.end).toBe(true);
    expect(s.coaching.start > s.training.end).toBe(true);
    expect(distributeSchedule(stages, '2026-02-01', '2026-01-01')).toEqual({});
  });

  it('يعمل لمدة يوم واحد ولمدة سنة', () => {
    const one = distributeSchedule(stages, '2026-01-01', '2026-01-01');
    expect(one.coaching.end).toBe('2026-01-01');
    const year = distributeSchedule(stages, '2026-01-01', '2026-12-31');
    expect(year.coaching.end).toBe('2026-12-31');
  });

  it('ينظف الجدول والمعلم ويرفض الخطأ', () => {
    expect(cleanSchedule({ intro: { start: '2026-01-01', end: '2026-01-02' }, ghost: { start: '2026-01-01' } }, ['intro'])).toEqual({ intro: { start: '2026-01-01', end: '2026-01-02' } });
    expect(() => cleanSchedule({ intro: { start: '2026-01-05', end: '2026-01-01' } }, ['intro'])).toThrow();
    expect(() => cleanMilestone({ title_ar: '' }, [])).toThrow();
    expect(() => cleanMilestone({ title_ar: 'م', anchor: 'stage_end' }, ['a'])).toThrow();
    expect(cleanMilestone({ title_ar: 'م', anchor: 'cohort_end', offset_days: -3 }, [])).toMatchObject({ complete: 'manual', offset_days: -3 });
  });

  it('يحسب الاستحقاق من ارتكازه، والتأخر بالأيام، والتمديد لمشارك', () => {
    const cohort = { starts_on: '2026-01-01', ends_on: '2026-01-31', schedule: { training: { start: '2026-01-02', end: '2026-01-10' } } };
    const ms = [
      { id: 'a', title_ar: 'نهاية التدريب', stage_key: 'training', anchor: 'stage_end', offset_days: 2, complete: 'stage' },
      { id: 'b', title_ar: 'تسليم', anchor: 'date', fixed_date: '2026-01-20', complete: 'manual' },
      { id: 'c', title_ar: 'بلا جدول', stage_key: 'coaching', anchor: 'stage_end', offset_days: 0, complete: 'stage' },
    ];
    expect(milestoneDue(ms[0], { schedule: cohort.schedule })).toBe('2026-01-12');
    const r = milestoneStatuses(ms, { cohort, today: '2026-01-15T10:00:00Z' });
    const by = Object.fromEntries(r.map((m) => [m.id, m]));
    expect(by.a).toMatchObject({ status: 'late', late_days: 3 });
    expect(by.b.status).toBe('due_soon');
    expect(by.c.status).toBe('unscheduled');
    const done = milestoneStatuses(ms, { cohort, today: '2026-01-15', stagesDone: new Set(['training']), records: { b: { due_override: '2026-01-10' } } });
    const d = Object.fromEntries(done.map((m) => [m.id, m]));
    expect(d.a.status).toBe('done');
    expect(d.b).toMatchObject({ status: 'late', extended: true, late_days: 5 });
    expect(milestoneSummary(done)).toMatchObject({ total: 3, done: 1, late: 1, max_late: 5, done_late: 0 });
  });

  it('المنجز بعد موعده يبقى منجزًا ويحمل تأخره، ويُعدّ متأخرًا بعد مهلة ثلاثة أيام', () => {
    const ms = [
      { id: 'b', title_ar: 'تسليم', anchor: 'date', fixed_date: '2026-01-20', complete: 'manual' },
      { id: 'c', title_ar: 'عرض', anchor: 'date', fixed_date: '2026-01-10', complete: 'manual' },
    ];
    const r = milestoneStatuses(ms, { today: '2026-02-01', records: { b: { done_at: '2026-01-30T09:00:00Z' }, c: { done_at: '2026-01-12T09:00:00Z' } } });
    const by = Object.fromEntries(r.map((m) => [m.id, m]));
    expect(by.b).toMatchObject({ status: 'done', late_days: 10 });
    expect(by.c).toMatchObject({ status: 'done', late_days: 2 });
    expect(milestoneSummary(r)).toMatchObject({ total: 2, done: 2, late: 0, done_late: 1, max_done_late: 10 });
  });

  // التدقيق 2026-11-11 (admin-program-6): تاريخ التمديد بأرقام عربية كان يُحفظ null فيُلغى التمديد ويقال «تم»
  it('تمديد المعلم لمشارك: الأرقام العربية تُقبل، والفارغ يلغي التمديد، وغير الصالح يُرفض برسالة', () => {
    expect(latinDigits('٢٠٢٦-١٢-٠١')).toBe('2026-12-01');
    expect(latinDigits('۲۰۲۶')).toBe('2026');
    expect(cleanDueOverride('٢٠٢٦-١٢-٠١')).toBe('2026-12-01');
    expect(cleanDueOverride(' 2026-12-01 ')).toBe('2026-12-01');
    expect(cleanDueOverride('')).toBeNull();
    expect(cleanDueOverride(null)).toBeNull();
    for (const bad of ['2026/12/01', '2026-02-30', '2026-13-01', '١/١٢/٢٠٢٦', 'غدًا']) expect(() => cleanDueOverride(bad), bad).toThrow(/2026-12-01/);
  });
  it('الخادم يرفض التاريخ غير الصالح برسالة بدل حفظ null، والواجهة تمدد بحقل تاريخ وتلغي بزر صريح', () => {
    const root = join(__dirname, '../..');
    const server = readFileSync(join(root, 'supabase/functions/leaders-api/programs.ts'), 'utf8');
    expect(server).toMatch(/if \('due_override' in b\) \{\s*try \{ rec\.due_override = cleanDueOverride\(b\.due_override\); \} catch \(err\) \{ throw new Fail/);
    expect(server).not.toMatch(/due_override = \/\^\\d\{4\}/);
    const ui = readFileSync(join(root, 'admin-app/src/screens/Milestones.jsx'), 'utf8');
    expect(ui).toMatch(/\{ name: 'due_override', label: 'الموعد الجديد', type: 'date' \}/);
    expect(ui).not.toMatch(/\(YYYY-MM-DD\)/);
    expect(ui).toMatch(/due_override: null \}\)/);
  });
});
