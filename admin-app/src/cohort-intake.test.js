// الدفعة هي الوحدة الوحيدة: المنطق الخالص (cohort-intake.js) لمصدر الإلحاق وخطة من لا دفعة له وبصمتها وقائمة انتظار الجهة،
// واستثناء دفعة الاستقبال من استنتاج دفعة الجهة في pickCohort
import { describe, expect, it } from 'vitest';
import { cohortlessPlan, placementSource, planHashInput, planSummary, waitingList } from '../../supabase/functions/leaders-api/cohort-intake.js';
import { pickCohort } from '../../supabase/functions/leaders-api/logic.js';

const ORG = 'org-1', ORG2 = 'org-2';
const cohorts = [
  { id: 'c-open', name: 'المنصة العامة', is_default: true, organization_id: null, status: 'open' },
  { id: 'c-intake', name: 'منظومة · الاستقبال', is_intake: true, organization_id: ORG, status: 'open' },
  { id: 'c-spring', name: 'دفعة الربيع', organization_id: ORG, status: 'running', starts_on: '2026-10-01' },
];

describe('مصدر الإلحاق', () => {
  it('رمز، أو جهة بلا رمز، أو المنصة العامة', () => {
    expect(placementSource({ organization_id: ORG, sponsor_code: 'manz-aaaa-bbbb' })).toBe('code');
    expect(placementSource({ organization_id: ORG })).toBe('link');
    expect(placementSource({ sponsor_code: 'x' })).toBe('platform');
    expect(placementSource()).toBe('platform');
  });
});

describe('خطة من لا دفعة له', () => {
  const participants = [
    { id: 'p3', full_name: 'ج', organization_id: ORG2 },
    { id: 'p1', full_name: 'أ', organization_id: ORG },
    { id: 'p2', full_name: 'ب', organization_id: null },
    { id: 'p4', full_name: 'د', organization_id: ORG },
    { id: 'demo', full_name: 'تجريبي', is_demo: true },
  ];
  const enrollments = [{ participant_id: 'p4', cohort_id: 'c-spring', status: 'active' }, { participant_id: 'p2', cohort_id: 'c-spring', status: 'withdrawn' }];
  const orgs = [{ id: ORG, name: 'منظومة' }, { id: ORG2, name: 'جهة ثانية' }];

  it('الاستقبال القائم، أو الذي سيُنشأ باسم الجهة، أو المنصة العامة؛ ولا تجريبي ولا ملحق', () => {
    const rows = cohortlessPlan({ participants, enrollments, cohorts, orgs });
    expect(rows.map((r) => [r.participant_id, r.kind, r.target_id, r.creates])).toEqual([
      ['p1', 'intake', 'c-intake', false], ['p2', 'platform', 'c-open', false], ['p3', 'intake', null, true],
    ]);
    expect(rows[2].target).toBe('جهة ثانية · الاستقبال');
    expect(planSummary(rows).map((s) => s.count)).toEqual([1, 1, 1]);
  });

  it('البصمة ثابتة مع الترتيب وتتغير بتغيّر الوجهة أو من لا دفعة له', () => {
    const a = planHashInput(cohortlessPlan({ participants, enrollments, cohorts, orgs }));
    const b = planHashInput(cohortlessPlan({ participants: [...participants].reverse(), enrollments, cohorts, orgs }));
    expect(a).toBe(b);
    const withIntake = [...cohorts, { id: 'c-i2', is_intake: true, organization_id: ORG2, name: 'x' }];
    expect(planHashInput(cohortlessPlan({ participants, enrollments, cohorts: withIntake, orgs }))).not.toBe(a);
    expect(planHashInput(cohortlessPlan({ participants, enrollments: [...enrollments, { participant_id: 'p1', cohort_id: 'c-intake', status: 'active' }], cohorts, orgs }))).not.toBe(a);
  });
});

describe('قائمة انتظار الجهة', () => {
  it('أعضاء الجهة الذين إلحاقهم القائم في دفعة ليست لها', () => {
    const members = [
      { id: 'w', full_name: 'منتظر', organization_id: ORG }, { id: 'in', full_name: 'ملحق', organization_id: ORG },
      { id: 'none', full_name: 'بلا دفعة', organization_id: ORG },
    ];
    const enrollments = [
      { participant_id: 'w', cohort_id: 'c-spring', status: 'withdrawn', created_at: '2026-11-01' },
      { participant_id: 'w', cohort_id: 'c-open', status: 'active', created_at: '2026-11-20' },
      { participant_id: 'in', cohort_id: 'c-intake', status: 'active', created_at: '2026-11-20' },
    ];
    expect(waitingList({ members, enrollments, cohorts }, ORG).map((r) => [r.participant_id, r.cohort])).toEqual([['w', 'المنصة العامة']]);
  });
});

describe('pickCohort ودفعة الاستقبال', () => {
  it('الاستقبال لا يُستنتج بالجهة: عضويته بالإلحاق الصريح وحده', () => {
    const onlyIntake = cohorts.filter((c) => c.id !== 'c-spring');
    expect(pickCohort({ enrollments: [], cohorts: onlyIntake, organizationId: ORG }).cohort.id).toBe('c-open');
    expect(pickCohort({ enrollments: [{ cohort_id: 'c-intake', status: 'active' }], cohorts: onlyIntake, organizationId: ORG }).cohort.id).toBe('c-intake');
    expect(pickCohort({ enrollments: [], cohorts, organizationId: ORG }).cohort.id).toBe('c-spring');
  });
});
