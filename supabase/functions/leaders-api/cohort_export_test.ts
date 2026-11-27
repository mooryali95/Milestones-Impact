// admin.cohort-export وcoord.cohort-export (تصور تصدير مبادرات الدفعة، المرحلة 1): الدفعة لازمة، المدير يرى الدفعة كلها والمنسق
// جهته وحدها، وكل طلب سطر cohort_export واحد في السجل بعدده ونطاقه، ولا بيانات تواصل في الرد.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { cohortExport } = await import('./cohort-export.ts');

const C1 = '11111111-1111-1111-1111-111111111111';
function deps(log: any[]) {
  return {
    members: async (id: string) => (id === C1 ? { cohort: { id: C1, name: 'دفعة نوفمبر', organization_id: 'o1' }, ids: ['p1', 'p2'] } : null),
    load: async (ids: string[]) => ({
      people: [{ id: 'p1', full_name: 'سارة', organization_id: 'o1', organization_name: 'هيئة أ', email: 's@a.sa' }, { id: 'p2', full_name: 'أحمد', organization_id: 'o2', organization_name: 'هيئة ب' }].filter((p) => ids.includes(p.id)),
      capstones: [{ participant_id: 'p1', status: 'approved', readiness: 90, approved_at: '2026-11-20', sponsor_name: 'خالد', sponsor_email: 'k@a.sa' }, { participant_id: 'p2', status: 'approved', readiness: 80 }],
      charters: [{ participant_id: 'p1', answers: { title: 'م1', sponsor_phone: '0500' } }],
    }),
    audit: async (...a: any[]) => { log.push(a); },
  };
}

Deno.test('المدير: الدفعة كلها، وسطر cohort_export', async () => {
  const log: any[] = [];
  const r: any = await cohortExport({ kind: 'admin', actor: 'm@x.sa' }, { cohort_id: C1 }, deps(log));
  assertEquals(r.rows.map((x: any) => x.participant_id), ['p2', 'p1']);
  assertEquals(r.cohort, { id: C1, name: 'دفعة نوفمبر' });
  assertEquals(JSON.stringify(r).includes('@'), false);
  assertEquals(JSON.stringify(r).includes('0500'), false);
  assertEquals(log.length, 1);
  assertEquals(log[0].slice(0, 5), ['admin', 'm@x.sa', 'cohort_export', 'cohorts', C1]);
  assertEquals(log[0][6], { count: 2, scope: 'cohort', organization_id: null, volumes: 1, version: 'institutional', include: 'approved' });
});

Deno.test('المنسق: جهته وحدها', async () => {
  const log: any[] = [];
  const r: any = await cohortExport({ kind: 'coordinator', actor: 'c@a.sa', orgId: 'o1' }, { cohort_id: C1 }, deps(log));
  assertEquals(r.rows.map((x: any) => x.participant_id), ['p1']);
  assertEquals(log[0][0], 'coordinator');
  assertEquals(log[0][6].scope, 'organization');
  assertEquals(log[0][6].organization_id, 'o1');
});

Deno.test('منسق بلا جهة يُرفض، ودفعة مفقودة أو غير صحيحة تُرفض، ولا سجل', async () => {
  const log: any[] = [];
  await assertRejects(() => cohortExport({ kind: 'coordinator', actor: 'c@a.sa', orgId: null }, { cohort_id: C1 }, deps(log)));
  await assertRejects(() => cohortExport({ kind: 'admin', actor: 'm' }, { cohort_id: 'x' }, deps(log)));
  await assertRejects(() => cohortExport({ kind: 'admin', actor: 'm' }, { cohort_id: '22222222-2222-2222-2222-222222222222' }, deps(log)));
  assertEquals(log.length, 0);
});

// D18 كما في orgDoc: الجاهزية والدرجة للمنسق بصلاحية المستويات وموافقة المشارك على المشاركة مع جهته معًا
Deno.test('المنسق: الجاهزية والدرجة بالصلاحية وموافقة المشارك معًا', async () => {
  const mk = (consent: string | null) => ({
    ...deps([]),
    load: async () => ({
      people: [{ id: 'p1', full_name: 'سارة', organization_id: 'o1', org_share_consented_at: consent }],
      capstones: [{ participant_id: 'p1', status: 'approved', readiness: 90, score: 4 }],
      charters: [],
    }),
  });
  const ask = async (scores: boolean, consent: string | null) =>
    ((await cohortExport({ kind: 'coordinator', actor: 'c', orgId: 'o1', scores }, { cohort_id: C1 }, mk(consent))) as any).rows[0];
  const hidden = await ask(false, '2026-11-01');
  assertEquals([hidden.readiness, hidden.score], [null, null]);
  const noConsent = await ask(true, null);
  assertEquals([noConsent.readiness, noConsent.score], [null, null]);
  const shown = await ask(true, '2026-11-01');
  assertEquals([shown.readiness, shown.score], [90, 4]);
  const admin: any = await cohortExport({ kind: 'admin', actor: 'm' }, { cohort_id: C1 }, mk(null));
  assertEquals(admin.rows[0].readiness, 90);
});
