// الكتاب الأم بعد فصل الخبراء (المرحلة 1): سلوك الخادم لا نصه. على قاعدة في الذاكرة:
// خبير الرحلة لا يُضاف من نافذة المشاركة وإزالته متاحة، ومن له الخدمتان يُضاف إلى لجنته الثانية،
// والعضو الموقوف مؤقتًا يقرأ ولا يعلّق ولا يحذف، والعلامة المائية تحمل اسم القارئ وبريده.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const MB = await import('./master-book.ts');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: any = null;
    let single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: null, error: null }; }
      out = out.slice(0, limit).map((r) => structuredClone(r));
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = {
      select: () => q,
      insert: (x: any) => { mode = 'insert'; payload = x; return q; },
      update: (x: any) => { mode = 'update'; payload = x; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      like: () => q, order: () => q, range: () => q,
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  const real = { from: (db as any).from };
  Object.assign(db as any, { from });
  return () => Object.assign(db as any, real);
}
const ADMIN = { email: 'admin@example.sa' };
const expert = (extra: Row = {}): Row => ({ id: 'x1', email: 'x1@example.sa', full_name: 'هند المراجعة', status: 'active', roles: [], committees: [], ...extra });
const code = async (p: Promise<unknown>) => { const e = await assertRejects(() => p as Promise<unknown>, Fail); return (e as any).code; };

Deno.test('المشاركة: خبير الرحلة بلا لجنة لا يُضاف، ولا تتغير عضويته', async () => {
  const tables: Record<string, Row[]> = { experts: [expert({ roles: ['coach'] })], audit_log: [] };
  const restore = install(tables);
  try {
    assertEquals(await code(MB.setReader(ADMIN, { expert_id: 'x1', committee: 'content', on: true })), 'journey_expert');
    assertEquals(tables.experts[0].committees, []);
    assertEquals(tables.audit_log.length, 0);
  } finally { restore(); }
});

Deno.test('المشاركة: من له الخدمتان يُضاف إلى لجنته الثانية، وإزالة خبير الرحلة من لجنته متاحة', async () => {
  const tables: Record<string, Row[]> = { experts: [expert({ roles: ['coach'], committees: ['content'] })], audit_log: [] };
  const restore = install(tables);
  try {
    const add = await MB.setReader(ADMIN, { expert_id: 'x1', committee: 'measurement', on: true });
    assertEquals(add.committees.sort(), ['content', 'measurement']);
    await MB.setReader(ADMIN, { expert_id: 'x1', committee: 'measurement', on: false });
    const off = await MB.setReader(ADMIN, { expert_id: 'x1', committee: 'content', on: false });
    assertEquals(off.committees, []);
    assertEquals(tables.experts[0].committees, []);
    assertEquals(tables.audit_log.length, 3);
  } finally { restore(); }
});

Deno.test('المشاركة: عضو بلا دور في الرحلة يُضاف، والموقوف يُرد بطلب التفعيل', async () => {
  const tables: Record<string, Row[]> = { experts: [expert(), expert({ id: 'x2', status: 'paused' })], audit_log: [] };
  const restore = install(tables);
  try {
    assertEquals((await MB.setReader(ADMIN, { expert_id: 'x1', committee: 'content' })).committees, ['content']);
    assertEquals(await code(MB.setReader(ADMIN, { expert_id: 'x2', committee: 'content' })), 'inactive');
  } finally { restore(); }
});

Deno.test('العضو الموقوف مؤقتًا: يقرأ ولا يعلّق ولا يحذف تعليقه، والفاعل يحذف', async () => {
  const paused = MB.expertViewer(expert({ status: 'paused', committees: ['content'] }));
  const active = MB.expertViewer(expert({ committees: ['content'] }));
  assertEquals(paused.write, false);
  assertEquals(active.write, true);
  const tables: Record<string, Row[]> = {
    book_comments: [{ id: 'c1', author_kind: 'expert', author_ref: 'x1', deleted_at: null }],
    audit_log: [],
  };
  const restore = install(tables);
  try {
    assertEquals(await code(MB.addComment(paused, { module_id: 'm1', body: 'ملاحظة' })), 'read_only');
    assertEquals(await code(MB.deleteComment(paused, { id: 'c1' })), 'read_only');
    assertEquals(tables.book_comments[0].deleted_at, null);
    assertEquals((await MB.deleteComment(active, { id: 'c1' })).success, true);
    assert(tables.book_comments[0].deleted_at);
  } finally { restore(); }
});

Deno.test('العلامة المائية: اسم القارئ وبريده، ولا تتكرر عند المدير', async () => {
  const tables: Record<string, Row[]> = { handbook_modules: [], book_comments: [], schema_migrations: [], experts: [], book_proposals: [] };
  const restore = install(tables);
  try {
    const ex = await MB.book(MB.expertViewer(expert({ committees: ['content'] })));
    assertEquals(ex.viewer.watermark, 'هند المراجعة · x1@example.sa');
    assertEquals(ex.viewer.write, true);
    assertEquals(ex.share, null);
    const paused = await MB.book(MB.expertViewer(expert({ status: 'paused', committees: ['content'] })));
    assertEquals(paused.viewer.write, false);
    const ad = await MB.book(MB.adminViewer({ email: 'admin@example.sa', role: 'admin', method: 'passkey' }));
    assertEquals(ad.viewer.watermark, 'admin@example.sa');
  } finally { restore(); }
});
