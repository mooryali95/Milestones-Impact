// خريطة المنسق لكل دفعة (تصور المرحلة 4، م5): دفعات الجهة الحالية (مفتوحة أو جارية، ومعها الاستقبال)، والأعضاء بإلحاقهم لا بجهتهم،
// والافتراضي في المحوّل أكبرها عددًا (القرار 6)
import { describe, expect, it } from 'vitest';
import { orgMapCohorts } from '../../supabase/functions/leaders-api/journey-map.js';

const cohorts = [
  { id: 'a', name: 'دفعة الربيع', organization_id: 'o1', status: 'running', starts_on: '2026-03-01' },
  { id: 'b', name: 'دفعة الخريف', organization_id: 'o1', status: 'open', starts_on: '2026-10-01' },
  { id: 'i', name: 'الاستقبال', organization_id: 'o1', status: 'open', is_intake: true },
  { id: 'x', name: 'مغلقة', organization_id: 'o1', status: 'closed' },
  { id: 'd', name: 'المنصة العامة', is_default: true, status: 'open' },
];
const enr = (p, c, status = 'active') => ({ participant_id: p, cohort_id: c, status, created_at: '2026-10-02' });

describe('orgMapCohorts', () => {
  it('جهة بدفعتين: خريطة لكل منهما بأعضائها، والأكبر عددًا أولًا', () => {
    const r = orgMapCohorts({ cohorts, orgId: 'o1', ids: ['p1', 'p2', 'p3', 'p4'], enrollments: [enr('p1', 'a'), enr('p2', 'b'), enr('p3', 'b'), enr('p4', 'a', 'withdrawn'), enr('p4', 'd')] });
    expect(r.map((x) => [x.cohort.id, x.ids])).toEqual([['b', ['p2', 'p3']], ['a', ['p1']]]);
  });
  it('الاستقبال يظهر حين فيه أعضاء، والمغلقة والعامة لا', () => {
    const r = orgMapCohorts({ cohorts, orgId: 'o1', ids: ['p1', 'p2'], enrollments: [enr('p1', 'i'), enr('p2', 'x')] });
    expect(r.map((x) => x.cohort.id)).toEqual(['i']);
  });
  it('لا أعضاء في أي دفعة حالية: قائمة فارغة فيبقى الملاذ خريطة دفعة الجهة الواحدة', () => {
    expect(orgMapCohorts({ cohorts, orgId: 'o1', ids: ['p1'], enrollments: [enr('p1', 'd')] })).toEqual([]);
  });
});

describe('محوّل الدفعات في بوابة المنسق', () => {
  it('البوابة تعرض المحوّل حين يرسل الخادم أكثر من خريطة، وإلا الخريطة الواحدة', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'screens/OrgPortal.jsx'), 'utf8');
    expect(src).toMatch(/d\.journey_maps\?\.length > 1 \? <CohortMaps maps=\{d\.journey_maps\} \/> : <JourneyMap map=\{d\.journey_map\} \/>/);
    const server = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/coordinator.ts'), 'utf8');
    expect(server).toMatch(/orgMapCohorts\(\{ cohorts: orgCohortRows/);
    expect(server).toMatch(/journey_maps: journey_maps\.length > 1/);
  });
});
