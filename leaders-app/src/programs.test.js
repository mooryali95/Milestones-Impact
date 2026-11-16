// البرامج والدفعات: اختيار الدفعة، تخصيص طريقة التنفيذ، النسخ والاسترجاع
import { describe, expect, it } from 'vitest';
import {
  applyDelivery, cleanDelivery, cohortDefinition, cohortDefinitionView, orgProgram, orgProgramLine, pickCohort, programDiff, programSnapshot, removedRequirementIds, restorePlan, upgradePlan,
} from '../../supabase/functions/leaders-api/logic.js';

const open = { id: 'c-open', is_default: true, status: 'running', program_id: 'p1' };
const safaraa = { id: 'c-saf', organization_id: 'org-s', status: 'running', starts_on: '2026-11-01', program_id: 'p1' };
const safaraaOld = { id: 'c-saf0', organization_id: 'org-s', status: 'open', starts_on: '2026-03-01', program_id: 'p1' };
const closed = { id: 'c-closed', organization_id: 'org-m', status: 'closed', program_id: 'p2' };
const cohorts = [open, safaraa, safaraaOld, closed];

describe('pickCohort', () => {
  it('explicit enrollment wins, even in a closed cohort', () => {
    const r = pickCohort({ enrollments: [{ cohort_id: 'c-closed', status: 'active', created_at: '2026-01-01' }], cohorts, organizationId: 'org-s' });
    expect(r).toEqual({ cohort: closed, via: 'enrollment' });
  });
  it('withdrawn enrollments are ignored; latest active wins', () => {
    const enrollments = [
      { cohort_id: 'c-saf0', status: 'withdrawn', created_at: '2026-09-01' },
      { cohort_id: 'c-saf', status: 'active', created_at: '2026-05-01' },
    ];
    expect(pickCohort({ enrollments, cohorts }).cohort.id).toBe('c-saf');
  });
  it('organization falls to its newest running or open cohort', () => {
    expect(pickCohort({ cohorts, organizationId: 'org-s' })).toEqual({ cohort: safaraa, via: 'organization' });
  });
  it('organization with only closed cohorts, or no organization, gets the open default', () => {
    expect(pickCohort({ cohorts, organizationId: 'org-m' })).toEqual({ cohort: open, via: 'default' });
    expect(pickCohort({ cohorts })).toEqual({ cohort: open, via: 'default' });
  });
  it('no cohorts at all', () => {
    expect(pickCohort({})).toEqual({ cohort: null, via: 'none' });
  });
});

const workshop = { id: 'r1', code: 'T-ATTEND', kind: 'workshop', config: { sessions_required: 4, verify: 'qr' } };
const coaching = { id: 'r2', code: 'O-SESS', kind: 'coaching', config: { sessions_required: 2, minutes: 60, mode: 'online', instant_url: 'https://meet.example/x', instant_until: '2030-01-01T00:00:00Z' } };
const reading = { id: 'r3', code: 'T-HB', kind: 'reading', config: { scope: 'all', quiz: true } };

describe('applyDelivery', () => {
  it('a cohort can run the same workshop online with join proof', () => {
    const r = applyDelivery(workshop, { verify: 'join' });
    expect(r.config).toEqual({ sessions_required: 4, verify: 'join' });
    expect(r.delivery).toEqual({ verify: 'join' });
    expect(workshop.config.verify).toBe('qr');
  });
  it('coaching in person keeps the coach availability and the place', () => {
    const r = applyDelivery(coaching, { mode: 'in_person', location_ar: 'مقر الجهة' });
    expect(r.config.mode).toBe('in_person');
    expect(r.config.location_ar).toBe('مقر الجهة');
    expect(r.config.instant_until).toBe(coaching.config.instant_until);
  });
  it('ignores fields that are not delivery, and invalid values', () => {
    expect(applyDelivery(workshop, { sessions_required: 1 })).toBe(workshop);
    expect(applyDelivery(reading, { scope: 'first' })).toBe(reading);
    expect(applyDelivery(coaching, { booking_url: 'http://insecure' })).toBe(coaching);
  });
});

describe('cleanDelivery', () => {
  it('keeps only known requirements and delivery keys', () => {
    const out = cleanDelivery({ 'T-ATTEND': { verify: 'manual', sessions_required: 9 }, 'NOPE': { verify: 'qr' }, 'T-HB': { scope: 'first' } }, [workshop, reading]);
    expect(out).toEqual({ 'T-ATTEND': { verify: 'manual' } });
  });
  it('rejects an invalid booking link with a clear message', () => {
    expect(() => cleanDelivery({ 'O-SESS': { booking_url: 'http://x' } }, [coaching])).toThrow(/https/);
  });
});

describe('cohortDefinition', () => {
  const live = {
    stages: [{ key: 'training', sort: 4 }, { key: 'old', sort: 9, active: false }],
    requirements: [workshop, { ...reading, active: false }],
  };
  it('uses live rows, drops inactive, applies cohort delivery', () => {
    const d = cohortDefinition({ live, cohort: { delivery: { 'T-ATTEND': { verify: 'join' } } } });
    expect(d.stages.map((s) => s.key)).toEqual(['training']);
    expect(d.requirements).toHaveLength(1);
    expect(d.requirements[0].config.verify).toBe('join');
  });
  it('a pinned version ignores later edits to the program', () => {
    const version = { data: { stages: [{ key: 'training' }], requirements: [{ ...workshop, config: { sessions_required: 2, verify: 'qr' } }] } };
    const d = cohortDefinition({ live, version, cohort: {} });
    expect(d.requirements[0].config.sessions_required).toBe(2);
  });
});

describe('versions', () => {
  const stages = [{ key: 'b', sort: 2, program_id: 'p', created_at: 'x' }, { key: 'a', sort: 1, program_id: 'p' }];
  const reqs = [{ id: 'r1', code: 'A', stage_key: 'a', sort: 1, title_ar: 'أ', kind: 'check', program_id: 'p' }];
  it('snapshot drops program and timestamps, keeps ids and order', () => {
    const s = programSnapshot(stages, reqs);
    expect(s.stages.map((x) => x.key)).toEqual(['a', 'b']);
    expect(s.stages[1]).toEqual({ key: 'b', sort: 2 });
    expect(s.requirements[0]).toEqual({ id: 'r1', code: 'A', stage_key: 'a', sort: 1, title_ar: 'أ', kind: 'check' });
  });
  it('restore writes the snapshot and disables what it lacks, never deletes', () => {
    const snap = programSnapshot(stages, reqs);
    const live = { stages: [...stages, { key: 'c', sort: 3 }], requirements: [...reqs, { id: 'r9', code: 'Z' }, { id: 'r8', code: 'Y', active: false }] };
    const plan = restorePlan(snap, live);
    expect(plan.requirements.map((r) => r.id)).toEqual(['r1']);
    expect(plan.disableStages).toEqual(['c']);
    expect(plan.disableRequirements).toEqual(['r9']);
  });
  it('diff names added, removed and changed requirements', () => {
    const from = { requirements: [{ id: 'r1', code: 'A', title_ar: 'أ', kind: 'check' }, { id: 'r2', code: 'B', title_ar: 'ب' }] };
    const to = { requirements: [{ id: 'r1', code: 'A', title_ar: 'أ', kind: 'reading' }, { id: 'r3', code: 'C', title_ar: 'ج' }, { id: 'r2', code: 'B', active: false }] };
    expect(programDiff(from, to)).toEqual({
      added: [{ code: 'C', title: 'ج' }], removed: [{ code: 'B', title: 'ب' }], changed: [{ code: 'A', title: 'أ' }],
      stages: { added: [], removed: [], changed: [] },
    });
  });
  it('diff names stage changes too: the stopped stage is removed, a renamed or re-ruled one changed', () => {
    const from = { stages: [{ key: 'a', title_ar: 'أ', sort: 1 }, { key: 'b', title_ar: 'ب', sort: 2 }, { key: 'c', title_ar: 'ج', sort: 3, rules: {} }] };
    const to = { stages: [{ key: 'a', title_ar: 'أ', sort: 1 }, { key: 'b', title_ar: 'ب', sort: 2, active: false }, { key: 'c', title_ar: 'ج', sort: 3, rules: { mode: 'required' } }, { key: 'd', title_ar: 'د', sort: 4 }] };
    expect(programDiff(from, to).stages).toEqual({ added: [{ key: 'd', title: 'د' }], removed: [{ key: 'b', title: 'ب' }], changed: [{ key: 'c', title: 'ج' }] });
  });
  it('upgrade plan drops what has no place in the target and blocks a hide that breaks a target stage', () => {
    const from = { stages: [{ key: 's1', title_ar: 'التمهيد', sort: 1, rules: { mode: 'required' } }, { key: 's2', title_ar: 'التطبيق', sort: 2 }],
      requirements: [{ id: 'r1', code: 'A', stage_key: 's1', title_ar: 'أ', kind: 'check', required: true }, { id: 'r2', code: 'B', stage_key: 's1', title_ar: 'ب', kind: 'check', required: true },
        { id: 'r3', code: 'O-SESS', stage_key: 's2', title_ar: 'التوجيه', kind: 'coaching', config: { sessions_required: 2, mode: 'online' } }] };
    const to = { stages: [from.stages[0]], requirements: [from.requirements[0]] };
    const cohort = { delivery: { 'O-SESS': { mode: 'in_person' } }, schedule: { s1: { start: '2026-09-01' }, s2: { start: '2026-10-01' } }, stage_modes: { s2: 'groups' }, hidden_requirements: [] };
    const p = upgradePlan({ cohort, from, to });
    expect(p.dropped).toEqual({ delivery: ['التوجيه'], schedule: ['التطبيق'], stage_modes: ['التطبيق'] });
    expect(p.patch).toEqual({ delivery: {}, schedule: { s1: { start: '2026-09-01' } }, stage_modes: {} });
    expect(p.blocked).toBe('');
    expect(removedRequirementIds(from, to)).toEqual(['r2', 'r3']);
    expect(upgradePlan({ cohort: { ...cohort, hidden_requirements: ['A'] }, from, to }).blocked).toContain('«التمهيد»');
  });
});

// P4: برنامج الجهة يُشتق بترتيب pickCohort نفسه، ولا يُقترح المؤرشف
describe('orgProgram', () => {
  const programs = [{ id: 'p1', name: 'القادة' }, { id: 'p2', name: 'سفراء' }, { id: 'p3', name: 'قديم', archived_at: '2026-01-01' }];
  it('matches the program of the cohort pickCohort places the org members in', () => {
    const r = orgProgram(cohorts, programs, 'org-s');
    expect(r.program_id).toBe(pickCohort({ cohorts, organizationId: 'org-s' }).cohort.program_id);
    expect(r).toMatchObject({ cohort_id: 'c-saf', program_name: 'القادة', via: 'current' });
    expect(orgProgramLine({ ...r, cohort_name: 'سفراء 2026' })).toBe('من دفعة الجهة الحالية «سفراء 2026»: برنامج «القادة».');
    // الاسم الذي يبدأ بكلمة «برنامج» لا تتكرر قبله
    expect(orgProgramLine({ ...r, cohort_name: 'سفراء 2026', program_name: 'برنامج سفراء' })).toBe('من دفعة الجهة الحالية «سفراء 2026»: «برنامج سفراء».');
  });
  it('without a live cohort falls to the newest org cohort, and never to the open default', () => {
    expect(orgProgram(cohorts, programs, 'org-m')).toMatchObject({ program_id: 'p2', cohort_id: 'c-closed', via: 'latest' });
    expect(orgProgram(cohorts, programs, 'org-none')).toBeNull();
    expect(orgProgram(cohorts, programs, null)).toBeNull();
  });
  it('an archived program is never suggested', () => {
    const list = [{ id: 'a', organization_id: 'o', status: 'running', starts_on: '2026-10-01', program_id: 'p3' }, { id: 'b', organization_id: 'o', status: 'closed', starts_on: '2026-01-01', program_id: 'p1' }];
    expect(orgProgram(list, programs, 'o')).toMatchObject({ program_id: 'p1', cohort_id: 'b', via: 'latest' });
    expect(orgProgram([list[0]], programs, 'o')).toBeNull();
  });
});

// P5: تعريف الدفعة لنوافذها من نسختها المثبتة وحدها، والمخفي بعلامة لا محذوفًا، بلا تخصيص التنفيذ
describe('cohortDefinitionView', () => {
  const live = { stages: [{ key: 'live', title_ar: 'الحي', sort: 1 }], requirements: [{ code: 'L-1', stage_key: 'live', kind: 'check' }] };
  const version = { data: { stages: [{ key: 'b', title_ar: 'ثانية', sort: 2, rules: { complete: 'any' } }, { key: 'a', title_ar: 'أولى', sort: 1 }, { key: 'off', active: false }],
    requirements: [{ code: 'B-1', stage_key: 'b', sort: 1, kind: 'workshop', config: { verify: 'qr', sessions_required: 2 } }, { code: 'A-1', stage_key: 'a', sort: 1, kind: 'check' }, { code: 'X', stage_key: 'a', active: false }] } };
  it('a pinned cohort sees only its version, ordered, with hidden flags and no delivery applied', () => {
    const r = cohortDefinitionView({ live, version, cohort: { hidden_requirements: ['B-1', 'GONE'], delivery: { 'B-1': { verify: 'join' } } } });
    expect(r.stages.map((s) => s.key)).toEqual(['a', 'b']);
    expect(r.requirements.map((x) => [x.code, x.stage_title_ar, x.hidden])).toEqual([['A-1', 'أولى', false], ['B-1', 'ثانية', true]]);
    expect(r.requirements[1].config.verify).toBe('qr');
    expect(r.requirements[1].stage_rules).toEqual({ complete: 'any' });
    expect(r.hidden).toEqual(['B-1', 'GONE']);
  });
  it('without a version reads the live program', () => {
    expect(cohortDefinitionView({ live, version: null, cohort: null }).requirements.map((x) => x.code)).toEqual(['L-1']);
  });
});
