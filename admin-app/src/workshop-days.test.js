// أيام الورشة في بطاقة المرحلة (W3) وعرض غير الإلزامية (T0)، تصور الرحلة بالسحب والورش والحضور 2026-11-18 (ب5.2 وب5.4)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPACITY_FIELD, capacityAr, capacityOver, capacityOverAr, stageWorkshopReqs, VERIFY_AR, withCapacity, workshopDays } from './workshop-days.js';
import { cohortTimeline, journeyLanes } from './cohort-journey.js';
import { STAGE_TAG_AR } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { MIGRATION_GATES, MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';
import { SESSION_LINK_LATER_AR } from '../../supabase/functions/leaders-api/logic.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const stages = [
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 1, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 14, active: true },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 3, duration_days: 14, active: true, rules: { unlock: 'with', with: 'training', mode: 'on_demand' } },
  { key: 'extra', title_ar: 'قراءات إضافية', phase: 'qualification', sort: 4, duration_days: 7, active: true, rules: { mode: 'optional' } },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 5, duration_days: 7, active: true },
];
const requirements = [
  { id: 'r1', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', active: true, config: { sessions_required: 4, verify: 'qr' }, sort: 1 },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة', active: true, sort: 2 },
  { id: 'r3', code: 'F-MEET', stage_key: 'final', kind: 'workshop', required: true, title_ar: 'لقاء ختامي', active: true, hidden: true, config: {}, sort: 1 },
];
const cohort = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-02', ends_on: '2027-01-31', schedule: {} };
const day = (id, at, extra = {}) => ({
  id, requirement_id: 'r1', cohort_id: 'c1', title_ar: `يوم ${id}`, mode: 'in_person', location_ar: 'قاعة الملك فهد', join_url: null,
  starts_at: at ? `${at}T06:00:00Z` : null, ends_at: at ? `${at}T12:00:00Z` : null, active: true, verify: 'qr', expected: 18, attended: 0, ...extra,
});
const NOW = Date.parse('2026-11-16T09:00:00Z');
const daysFor = (sessions, key = 'training', title = 'التدريب') => {
  const def = { stages, requirements, sessions };
  const model = cohortTimeline(def, cohort, '2026-11-16T09:00:00Z');
  return workshopDays({ def, stage: { key, title }, sessions, model, cohortId: 'c1', now: NOW });
};

describe('أيام الورشة في البطاقة (W3)', () => {
  it('المرحلة بلا بند حضور ظاهر بلا قسم، والمخفي لا يُعد', () => {
    expect(stageWorkshopReqs({ requirements }, 'training')).toEqual([{ id: 'r1', title: 'حضور الأيام التدريبية', need: 4, verify: 'qr' }]);
    expect(stageWorkshopReqs({ requirements }, 'final')).toEqual([]);
    expect(daysFor([], 'final', 'التقرير النهائي')).toBeNull();
  });
  it('العداد «X من Y محددة» بالمؤرخ العامل وحده، والقسم الفارغ يدعو إلى أول يوم', () => {
    const none = daysFor([]);
    expect([none.head_ar, none.count_ar, none.tone, none.rows.length]).toEqual(['أيام التدريب', '0 من 4 محددة', 'warn', 0]);
    expect(none.empty_ar).toMatch(/أضف أول يوم أو ورشة/);
    const d = daysFor([day('a', '2026-11-03'), day('b', '2026-11-10'), day('c', null), day('d', '2026-11-12', { active: false })]);
    expect([d.set, d.need, d.count_ar]).toEqual([2, 4, '2 من 4 محددة']);
    const all = daysFor(['a', 'b', 'c', 'd', 'e'].map((k, i) => day(k, `2026-11-0${i + 3}`)));
    expect([all.count_ar, all.tone]).toEqual(['5 أيام محددة، والمطلوب حضور 4', 'ok']);
  });
  it('لكل يوم موعده ومكانه وطريقته، والحاضر بعد البدء وحده، والمتوقع قبله', () => {
    const d = daysFor([day('a', '2026-11-03', { attended: 14 }), day('b', '2026-11-20', { mode: 'online', location_ar: null }), day('c', null, { verify: 'join' })]);
    const [held, next, tbd] = d.rows;
    expect([held.held, held.counts_ar, held.place_ar, held.verify_ar, held.qr]).toEqual([true, 'حضر 14 من 18', 'قاعة الملك فهد', VERIFY_AR.qr, true]);
    expect([next.upcoming, next.counts_ar, next.place_ar]).toEqual([true, 'المتوقع 18', `عن بعد، ${SESSION_LINK_LATER_AR}`]);
    expect(next.when_ar).toMatch(/إلى/);
    expect([tbd.undated, tbd.when_ar, tbd.qr, tbd.can_invite]).toEqual([true, 'يُحدد لاحقًا', false, false]);
    expect(held.can_invite).toBe(false);
    expect(next.can_invite).toBe(true);
  });
  it('السعة: «X من السعة»، وتنبيه لا منع إن زاد المتوقع عليها، وبلا سعة لا سطر', () => {
    expect(capacityAr(18, 20)).toBe('18 من السعة 20');
    expect(capacityAr(18, null)).toBe('');
    expect([capacityOver(22, 20), capacityOver(20, 20), capacityOver(5, null)]).toEqual([true, false, false]);
    expect(capacityOverAr(22, 20)).toMatch(/^المتوقع \(22\) أكثر مما تسعه \(20\)\. الحضور لا يُمنع/);
    const d = daysFor([day('a', '2026-11-20', { capacity: 20, expected: 22 }), day('b', '2026-11-21', { capacity: 30 })]);
    expect([d.rows[0].capacity_ar, d.rows[0].over, d.rows[1].over]).toEqual(['22 من السعة 20', true, false]);
  });
  it('«خارج نافذة المرحلة» من الخط نفسه (journeyTimeline)، لا حساب ثانٍ', () => {
    // التدريب من 5 إلى 18 نوفمبر بعد اعتماد ثلاثة أيام
    const d = daysFor([day('in', '2026-11-10'), day('out', '2026-12-20')]);
    expect(d.rows.map((r) => [r.id, r.outside])).toEqual([['in', false], ['out', true]]);
  });
  it('قبل قراءة الأيام: من جلسات التعريف بلا أعداد، وجلسة دفعة أخرى لا تظهر', () => {
    const def = { stages, requirements, sessions: [day('a', '2026-11-03', { expected: undefined, attended: undefined }), day('x', '2026-11-04', { cohort_id: 'c2' })] };
    const d = workshopDays({ def, stage: { key: 'training', title: 'التدريب' }, sessions: null, cohortId: 'c1', now: NOW });
    expect(d.rows.map((r) => [r.id, r.counts_ar, r.expected])).toEqual([['a', '', null]]);
  });
  it('حقل السعة في نموذج الجلسة نفسه بعد الترحيل وحده، قبل «مفعّلة»', () => {
    const base = [{ name: 'title_ar' }, { name: 'active', type: 'check' }];
    expect(withCapacity(base, false)).toBe(base);
    expect(withCapacity(base, true).map((f) => f.name)).toEqual(['title_ar', 'capacity', 'active']);
    expect(CAPACITY_FIELD.type).toBe('number');
    expect(CAPACITY_FIELD.help).toMatch(/للعرض والتنبيه فقط/);
  });
  it('مسار كتابة واحد: البطاقة تحفظ بـadmin.workshop-save ونموذج «الحضور والجلسات»، والترحيل متسامح', () => {
    const ui = read('admin-app/src/screens/CohortJourney.jsx');
    expect(ui).toMatch(/import \{ Attendance, inviteSession, QrScreen, sessionFields \} from '\.\/Activities\.jsx'/);
    expect(ui.match(/L\('admin\.workshop-save'/g).length).toBeGreaterThanOrEqual(3);
    expect(ui).not.toMatch(/from\('workshop_sessions'\)|admin\.workshop-create|admin\.day-/);
    // أدوات الكتابة لمن يكتب وحده (وضع القراءة فقط)
    expect(ui).toMatch(/act\.canWrite && <button type="button" className="btn-sm primary cj-day-add"/);
    const acts = read('admin-app/src/screens/Activities.jsx');
    // المرحلة 4 أضافت إلى السطر نفسه حقول المدرب والبريد (sessionExtras وأخواتها): المصدر ما زال workshop-days.js وحده
    expect(acts).toMatch(/import \{ [^}]*\bVERIFY_AR, withCapacity \} from '\.\.\/workshop-days\.js'/);
    expect(acts).not.toMatch(/const VERIFY_AR = /);
    const name = '20261118130000_leaders_workshop_capacity';
    expect(MIGRATIONS).toContain(name);
    expect(MIGRATION_GATES[name][0]).toBe('tolerant');
    expect(read(`supabase/migrations/${name}.sql`)).toMatch(/check \(capacity is null or \(capacity >= 1 and capacity <= 10000\)\)/);
  });
});

describe('غير الإلزامية في الخط والبطاقة (T0)', () => {
  const def = { stages, requirements, sessions: [] };
  const model = cohortTimeline(def, cohort, '2026-11-16T09:00:00Z');
  it('الخط: «عند الحاجة» و«اختيارية» بنمطها، والإلزامية بلا وسم', () => {
    const by = Object.fromEntries(model.stages.map((s) => [s.key, [s.mode, s.mode_ar, s.optional]]));
    expect(by).toEqual({
      approval: ['required', '', false], training: ['required', '', false], consult: ['on_demand', 'عند الحاجة', true],
      extra: ['optional', 'اختيارية', true], final: ['required', '', false],
    });
    expect(STAGE_TAG_AR).toEqual({ on_demand: 'عند الحاجة', optional: 'اختيارية' });
  });
  it('البطاقة من الخط نفسه، والموقوفة بنمطها أيضًا', () => {
    const lanes = journeyLanes(model, { def, cohort, milestones: [] });
    const cards = lanes.phases.flatMap((p) => p.groups.flatMap((g) => g.stages));
    expect(cards.filter((c) => c.mode_ar).map((c) => [c.key, c.mode_ar])).toEqual([['consult', 'عند الحاجة'], ['extra', 'اختيارية']]);
    const off = { ...cohort, schedule: { extra: { off: true } } };
    const m2 = cohortTimeline(def, off, '2026-11-16T09:00:00Z');
    const c2 = journeyLanes(m2, { def, cohort: off, milestones: [] }).phases.flatMap((p) => p.groups.flatMap((g) => g.stages)).find((c) => c.key === 'extra');
    expect([c2.off, c2.mode_ar]).toEqual([true, 'اختيارية']);
  });
  it('الرسم: إطار متقطع ووسم في المكوّن والبطاقة، لا «اختيارية» ثابتة لكل ما ليس إلزاميًا', () => {
    const jt = read('shared/ui/JourneyTimeline.jsx');
    expect(jt).toMatch(/\$\{s\.mode_ar \? ` nonreq md-\$\{s\.mode\}` : ''\}/);
    expect(jt.match(/<span className="jt-mode">\{s\.mode_ar\}<\/span>/g)).toHaveLength(2);
    expect(read('shared/css/journey-timeline.css')).toMatch(/\.jt-stage\.nonreq \{ border-style: dashed;/);
    const ui = read('admin-app/src/screens/CohortJourney.jsx');
    expect(ui).toMatch(/<span className="cj-tag cj-mode">\{s\.mode_ar\}<\/span>/);
    expect(ui).not.toMatch(/<span className="cj-tag">اختيارية<\/span>/);
  });
});
