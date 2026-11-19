// محرر الاستوديو يحفظ أقسام الباب في عملية واحدة (20261117100000): الدالة تُستدعى مرة بالأقسام كلها، وتغيّر حالة
// مقترح أثناء الحفظ يُرد برسالة واضحة دون أن يُحفظ شيء، ولا رجوع إلى الحفظ قسمًا قسمًا بعد تطبيق الترحيل على الإنتاج.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { installFake } from './_fake_db.ts';

const B = await import('./book-proposals.ts');

const MOD = '11111111-1111-4111-8111-111111111111';
const body = '## الأول\nنص قديم أول.\n\n## الثاني\nنص قديم ثانٍ.\n';
const edited = '## الأول\nنص جديد أول بعد التعديل.\n\n## الثاني\nنص جديد ثانٍ بعد التعديل.\n';
const v: any = { kind: 'admin', ref: 'writer@x.sa', name: 'الكاتب', role: 'admin', write: true };
const seed = () => ({
  handbook_modules: [{ id: MOD, dimension: 'milestone', chapter_key: 'ch1', min_level: 'beginner', body_md: body, reflection_ar: 'سؤال' }],
  book_proposals: [], audit_log: [],
});
const req = { module_id: MOD, base_body_md: body, base_reflection_ar: 'سؤال', body_md: edited, reason: 'توضيح الصياغة للقارئ', submit: true };

Deno.test('الأقسام المتغيرة كلها في استدعاء واحد للدالة الذرية، بالحالة والتسمية', async () => {
  const calls: any[] = [];
  const w = installFake(seed(), { rpc: (name, args) => {
    if (name !== 'book_proposals_save') return null;
    calls.push(args);
    return { data: args.p_rows.map((_: any, i: number) => `id-${i}`), error: null };
  } });
  try {
    const r = await B.proposeFromEdit(v, req);
    assertEquals(r.count, 2);
    assertEquals(r.ids, ['id-0', 'id-1']);
    assertEquals(calls.length, 1, 'استدعاء واحد لا قسمًا قسمًا');
    assertEquals(calls[0].p_rows.map((x: any) => [x.status, x.prev_id]), [['review', null], ['review', null]]);
    assertEquals(calls[0].p_module, MOD);
    assertEquals(w.writes.filter((x) => x.table === 'book_proposals').length, 0, 'لا كتابة مباشرة في الجدول خارج الدالة');
  } finally { w.restore(); }
});

Deno.test('تغيّر حالة مقترح أثناء الحفظ: رسالة باسم القسم، ولا يُحفظ شيء', async () => {
  const w = installFake(seed(), { rpc: (name) => name === 'book_proposals_save' ? { data: null, error: { code: 'P0409', message: 'الثاني' } } : null });
  try {
    const e = await assertRejects(() => B.proposeFromEdit(v, req));
    assert(String((e as Error).message).includes('الثاني') && String((e as Error).message).includes('لم يُحفظ شيء'));
    assertEquals(w.tables.book_proposals.length, 0);
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('الترحيل مطبّق على الإنتاج: غياب الدالة خطأ ظاهر لا رجوع صامت إلى الحفظ قسمًا قسمًا', async () => {
  const w = installFake(seed(), { rpc: (name) => name === 'book_proposals_save' ? { data: null, error: { code: 'PGRST202', message: 'function not found' } } : null });
  try {
    await assertRejects(() => B.proposeFromEdit(v, req));
    assertEquals(w.tables.book_proposals.length, 0);
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});
