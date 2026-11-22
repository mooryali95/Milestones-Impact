// إعادة المحاولة دورة جديدة لا تستثني إلا من اعتذر صراحة، وإعادة الإسناد بسبب ولخبير خارج الترشيح (قرار المالك 2026-11-22).
// الحالة الحقيقية: ثلاثة خبراء نشطون لم يرد أحدهم في مهلته، فكانت «أعد المحاولة» تعود فورًا إلى «لا خبير مطابق»
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, withNet } from './_fake_db.ts';

const E = await import('./experts.ts');
const P = '11111111-1111-4111-8111-111111111111';
const R = '22222222-2222-4222-8222-222222222222';
const X = ['a', 'b', 'c'].map((c) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`);
const admin: any = { email: 'owner@x.sa', role: 'super_admin', method: 'passkey', id: 'o', owner: true };
const expert = (id: string, roles = ['specialist']) => ({ id, full_name: `خبير ${id[0]}`, email: `${id[0]}@x.sa`, status: 'active', roles, dimensions: ['milestone'], levels: [], weekly_hours: null });
const seed = () => ({
  participants: [{ id: P, full_name: 'أمادو', email: 'p@x.sa', sector: null, placements: [] }],
  experts: [expert(X[0]), expert(X[1]), expert(X[2], ['coach'])],
  expert_requests: [{ id: R, participant_id: P, role: 'specialist', dimension: 'milestone', status: 'unmatched', tried: [X[0], X[1]], expert_id: null }],
  audit_log: [{ entity: 'expert_requests', entity_id: R, action: 'expert-request.declined', after: { expert_id: X[1] } }],
  coaching_sessions: [], expert_ratings: [], app_settings: [], cohort_experts: [], enrollments: [],
});

Deno.test('أعد المحاولة: دورة جديدة على من لم يرد، ولا يُعرض على من اعتذر صراحة', async () => {
  const w = installFake(seed());
  try {
    const r: any = await withNet(() => E.adminRetryRequest(admin, { id: R }));
    assertEquals(r.status, 'offered');
    assertEquals(r.expert_id, X[0], 'من انتهت مهلته يعود في الدورة الجديدة');
    const req = w.tables.expert_requests[0];
    assertEquals(req.status, 'offered');
    assertEquals(req.tried, [X[1]], 'لا يبقى مستثنى إلا من اعتذر');
    assert(r.expires_at, 'المهلة في الرد لرسالة صادقة');
  } finally { w.restore(); }
});

Deno.test('غيّر الخبير: سبب إلزامي، ويُعرض فورًا ولو خارج الترشيح، والتغيير مسجّل', async () => {
  const w = installFake(seed());
  try {
    await assertRejects(() => E.adminReassign(admin, { id: R, expert_id: X[2], reason: '' }), Error, 'سبب');
    const o: any = await E.adminReassignOptions(admin, { id: R });
    const out = o.options.find((x: any) => x.id === X[2]);
    assert(out?.outside && out.why.includes('دور'), 'خبير بدور آخر يظهر خارج الترشيح بسببه');
    assert(o.options.find((x: any) => x.id === X[1])?.declined, 'من اعتذر موسوم');
    const r: any = await withNet(() => E.adminReassign(admin, { id: R, expert_id: X[2], reason: 'خبرته في المبادرة' }));
    assertEquals([r.status, r.expert_id], ['offered', X[2]]);
    const log = w.tables.audit_log.find((x: any) => x.action === 'expert-request.reassign');
    assertEquals(log?.after?.outside, true);
  } finally { w.restore(); }
});
