// خريطة الرحلة للجهة (قرار المالك 2026-11-11): التجميع من رحلة كل مشارك نفسها، والوقت في المرحلة، والصلاحيات.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { journeyMap, needsOf, positionOf, stageEntry, stageWindows, STAGE_GRACE_DAYS, todayStage } from '../../supabase/functions/leaders-api/journey-map.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const STAGES = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', duration_days: 0, sort: 1 },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', duration_days: 2, sort: 2 },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', duration_days: 4, sort: 3 },
  { key: 'report', title_ar: 'التقرير النهائي', phase: 'impact', duration_days: 7, sort: 4 },
];
const item = (title_ar, status, completed_at = null, required = true) => ({ title_ar, status, completed_at, required });
// رحلة مشارك يقف عند المرحلة at (فهرس)، وما قبلها منجز بتاريخ إتمام
const journeyAt = (at, doneOn = '2026-11-01') => STAGES.map((s, i) => ({
  key: s.key, stage_mode: 'required',
  status: i < at ? 'done' : i === at ? 'active' : 'locked',
  items: i < at ? [item(`بند ${s.title_ar}`, 'done', `${doneOn}T09:00:00Z`)] : [item(`بند ${s.title_ar}`, 'pending')],
}));
const finished = () => STAGES.map((s) => ({ key: s.key, stage_mode: 'required', status: 'done', items: [item('x', 'done', '2026-11-01T00:00:00Z')] }));
const TODAY = new Date('2026-11-11T10:00:00Z');

describe('النوافذ وموقع الدفعة على جدولها', () => {
  it('النوافذ متتابعة بالمدد من بداية الدفعة، وجدول الدفعة يغلب', () => {
    const w = stageWindows(STAGES, { starts_on: '2026-11-01' });
    expect(w.profile).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(w.approval).toEqual({ from: '2026-11-01', to: '2026-11-03' });
    expect(w.training).toEqual({ from: '2026-11-03', to: '2026-11-07' });
    const fixed = stageWindows(STAGES, { starts_on: '2026-11-01', schedule: { training: { start: '2026-11-10', end: '2026-11-14' } } });
    expect(fixed.training).toEqual({ from: '2026-11-10', to: '2026-11-14' });
    expect(fixed.report).toEqual({ from: '2026-11-14', to: '2026-11-21' });
    expect(stageWindows(STAGES, {})).toEqual({});
  });
  it('اليوم عند آخر مرحلة بدأت نافذتها، ولا موقع قبل البداية ولا بعد نهاية الرحلة', () => {
    const w = stageWindows(STAGES, { starts_on: '2026-11-01' });
    expect(todayStage(STAGES, w, new Date('2026-11-05T00:00:00Z'))).toBe('training');
    expect(todayStage(STAGES, w, new Date('2026-10-20T00:00:00Z'))).toBeNull();
    expect(todayStage(STAGES, w, new Date('2026-12-30T00:00:00Z'))).toBeNull();
  });
});

describe('موضع المشارك ومنذ متى', () => {
  it('المرحلة النشطة، وإلا أول إلزامية لم تكتمل (مقفلة بانتظار اعتماد)، و-1 لمن أنهى', () => {
    expect(positionOf(journeyAt(2))).toBe(2);
    const waiting = journeyAt(1).map((s, i) => (i === 1 ? { ...s, status: 'locked', lock_reason: 'تُفتح حين يفتحها لك فريق البرنامج' } : s));
    expect(positionOf(waiting)).toBe(1);
    expect(needsOf(waiting[1])).toBe('تُفتح حين يفتحها لك فريق البرنامج');
    expect(positionOf(finished())).toBe(-1);
  });
  it('الدخول أحدث إتمام قبل المرحلة، والتواريخ المعروفة (الملف والقياس والاعتماد) تُحسب', () => {
    expect(stageEntry(journeyAt(2, '2026-11-03'), 2)).toBe('2026-11-03T09:00:00Z');
    expect(stageEntry(journeyAt(2, '2026-11-03'), 2, ['2026-11-06T00:00:00Z', null])).toBe('2026-11-06T00:00:00Z');
    expect(stageEntry(journeyAt(0), 0, ['2026-11-06T00:00:00Z'])).toBeNull();
  });
});

describe('التجميع والصلاحيات', () => {
  const people = [
    { id: 'a', name: 'سارة', created_at: '2026-10-01T00:00:00Z', journey: journeyAt(2, '2026-11-01'), milestones: [{ id: 'm1', title_ar: 'معلم', due: '2026-11-05', done: false, status: 'late' }] },
    { id: 'b', name: 'خالد', created_at: '2026-10-01T00:00:00Z', journey: journeyAt(2, '2026-11-09'), milestones: [{ id: 'm1', title_ar: 'معلم', due: '2026-11-05', done: true, status: 'done' }] },
    { id: 'c', name: 'نورة', created_at: '2026-11-10T00:00:00Z', journey: journeyAt(0), milestones: [] },
    { id: 'd', name: 'فهد', created_at: '2026-09-01T00:00:00Z', journey: finished(), milestones: [] },
  ];
  const base = { stages: STAGES, people, cohort: { name: 'دفعة سفراء', starts_on: '2026-11-01' }, program: { name: 'برنامج القادة' }, today: TODAY };
  it('هنا وتجاوزوها وأنهوا، ومن تجاوز المدة بعد مهلة السماح، والاختناق', () => {
    const m = journeyMap(base);
    const by = Object.fromEntries(m.stages.map((s) => [s.key, s]));
    expect([by.profile.here, by.approval.here, by.training.here, by.report.here]).toEqual([1, 0, 2, 0]);
    expect([by.profile.done, by.approval.done, by.training.done, by.report.done]).toEqual([3, 3, 1, 1]);
    // سارة في التدريب منذ 10 أيام (المدة 4 + سماح 3) فمتأخرة، وخالد منذ يومين فلا
    expect(STAGE_GRACE_DAYS).toBe(3);
    expect(by.training.late).toBe(1);
    expect(m.totals).toEqual({ total: 4, finished: 1, late: 1, not_started: 0 });
    expect(m.bottleneck).toEqual({ stage: 'training' });
    expect(m.cohort).toEqual({ name: 'دفعة سفراء', starts_on: '2026-11-01', today_stage: 'report' });
    expect(m.milestones).toEqual([{ id: 'm1', title: 'معلم', due: '2026-11-05', done: 1, late: 1 }]);
  });
  it('بلا «القائمة»: أسباب مجمّعة بلا أسماء ولا معرّفات', () => {
    const m = journeyMap(base);
    const training = m.stages.find((s) => s.key === 'training');
    expect(training.people).toBeUndefined();
    expect(training.reasons).toEqual([{ text: 'بند التدريب', count: 2 }]);
    const json = JSON.stringify(m);
    for (const leak of ['سارة', 'خالد', 'نورة', 'فهد', '"id":"a"']) expect(json, leak).not.toContain(leak);
  });
  it('بـ«القائمة»: الأسماء والأيام الأطول مكوثًا أولًا، وما ينقص كل شخص بـ«النشاط» وحده', () => {
    const withList = journeyMap({ ...base, list: true }).stages.find((s) => s.key === 'training');
    expect(withList.people.map((p) => [p.name, p.days, p.late, p.needs])).toEqual([['سارة', 10, true, null], ['خالد', 2, false, null]]);
    expect(withList.reasons).toBeUndefined();
    const withActivity = journeyMap({ ...base, list: true, activity: true }).stages.find((s) => s.key === 'training');
    expect(withActivity.people[0].needs).toBe('بند التدريب');
  });
  it('لا درجات ولا مستويات في الخريطة أبدًا', () => {
    const json = JSON.stringify(journeyMap({ ...base, list: true, activity: true }));
    expect(json).not.toMatch(/level|score|dimension/);
  });
});

describe('الربط بلوحة الجهة', () => {
  it('الخادم يجمّع من رحلات journeyFor المحسوبة نفسها، بصلاحيتي القائمة والنشاط', () => {
    const c = read('supabase/functions/leaders-api/coordinator.ts');
    expect(c).toContain('journeys[r.id] = j;');
    expect(c).toContain("cohort: def.cohort, program, list: perms.list !== false, activity: perms.activity === true,");
    expect(c).toMatch(/participants,\n\s+journey_map,\n\s+\};/);
    // تاريخ إتمام كل بند يمر في الرحلة، ومنه أيام المكوث
    expect(read('supabase/functions/leaders-api/logic.js')).toContain('completed_at: p.completed_at || null,');
  });
  it('الواجهة تعرض الخريطة مكان أعمدة القمع، وتبقيها لمن لا خريطة له', () => {
    const o = read('leaders-app/src/screens/OrgPortal.jsx');
    expect(o).toContain('{d.journey_map && <JourneyMap map={d.journey_map} />}');
    expect(o).toContain('{!d.journey_map && <section className="card"><h3>مراحل الرحلة</h3>');
  });
});
