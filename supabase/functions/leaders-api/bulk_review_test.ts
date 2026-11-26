// تصور المرحلة 2، المرحلة 2.4: الاعتماد الجماعي للمتطلبات ذاتية الإقرار وحدها، وحارسه في الخادم (علم bulk في admin.review)
// لا في الواجهة وحدها. التصنيف من kind القائم بثابت واحد (review-class.js)، وما يحمل دليلًا (ملفًا أو إجابات نموذج) بدليل مهما كان نوعه.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, withNet } from './_fake_db.ts';
const A = await import('./admin.ts');
const { Fail } = await import('./core.ts');
const { reviewClass, BULK_REVIEW_REFUSED_AR } = await import('./review-class.js');

type Row = Record<string, any>;
const ADMIN = { email: 'a@example.test', role: 'admin' as const, method: 'passkey' };

function world() {
  const req = (id: string, kind: string) => ({ id, kind, title_ar: `بند ${id}`, program_id: 'prog' });
  const sub = (requirement_id: string, extra: Row = {}) => ({ id: `s-${requirement_id}`, participant_id: 'p1', requirement_id, status: 'submitted', evidence_path: null, answers: null, ...extra });
  const tables: Record<string, Row[]> = {
    participants: [{ id: 'p1', full_name: 'عمر', email: 'o@example.sa' }],
    stage_requirements: [req('r-check', 'check'), req('r-upload', 'upload'), req('r-form', 'form'), req('r-check-file', 'check')],
    participant_requirements: [sub('r-check'), sub('r-upload', { evidence_path: 'p1/evidence/a.pdf' }), sub('r-form', { answers: { a: 'نص' } }), sub('r-check-file', { evidence_path: 'p1/evidence/b.pdf' })],
    audit_log: [], mail_events: [], mail_queue: [],
  };
  const { writes } = installFake(tables);
  return { tables, writes };
}

Deno.test('2.4 التصنيف: ذاتي وبدليل وآلي من kind، والدليل المرفق يجعله بدليل', () => {
  for (const k of ['check', 'reading', 'video', 'meeting']) assertEquals(reviewClass(k), 'self');
  for (const k of ['upload', 'form', 'model', 'capstone', 'curriculum']) assertEquals(reviewClass(k), 'evidence');
  for (const k of ['auto', 'workshop', 'coaching']) assertEquals(reviewClass(k), 'auto');
  assertEquals(reviewClass('check', { evidence_path: 'p/evidence/x.pdf' }), 'evidence');
  assertEquals(reviewClass('reading', { answers: { a: 'نص' } }), 'evidence');
  assertEquals(reviewClass('check', { answers: {} }), 'self');
  assertEquals(reviewClass('غريب'), 'evidence');
});

Deno.test('2.4 الخادم يرفض الاعتماد الجماعي لغير الذاتي ولا يكتب شيئًا', async () => {
  for (const r of ['r-upload', 'r-form', 'r-check-file']) {
    const { writes } = world();
    const e = await assertRejects(() => A.reviewRequirement(ADMIN as any, { participant_id: 'p1', requirement_id: r, status: 'done', bulk: true }), Fail);
    assertEquals([(e as any).status, (e as any).code, (e as any).message], [409, 'bulk_evidence', BULK_REVIEW_REFUSED_AR]);
    assertEquals(writes.filter((w) => w.table === 'participant_requirements').length, 0);
  }
});

Deno.test('2.4 الجماعي للذاتي يمر، والمنفرد بدليل يمر', async () => {
  const { writes } = world();
  await withNet(() => A.reviewRequirement(ADMIN as any, { participant_id: 'p1', requirement_id: 'r-check', status: 'done', bulk: true }));
  await withNet(() => A.reviewRequirement(ADMIN as any, { participant_id: 'p1', requirement_id: 'r-upload', status: 'done' }));
  const done = writes.filter((w) => w.table === 'participant_requirements' && w.value?.status === 'done').map((w) => w.value.requirement_id).sort();
  assertEquals(done, ['r-check', 'r-upload']);
});
