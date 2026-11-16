// «التوجيه والإرشاد» (G1): حكم التفعيل على مسار الخادم الحقيقي (guidance.ts) بقاعدة في الذاكرة.
// أهم ما يثبته: لا تدخل صفوف مشارك في حكم مشارك آخر أبدًا، وكل استعلام مقيد بمعرّف الجلسة.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const { db } = await import('./core.ts');
const { guidanceFor } = await import('./guidance.ts');
const { GUIDANCE_READ_SECONDS } = await import('./guidance.js');

type Row = Record<string, any>;
// جداول في الذاكرة: eq وis وnot(is null) وgte وlte وin وlimit وmaybeSingle وsingle، والإدراج والتحديث. order وor لا يغيّران النتيجة
function install(tables: Record<string, Row[]>, fail: { insert?: any } = {}) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        if (fail.insert && table === 'workshop_sessions') return { data: null, error: fail.insert };
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      if (head) return { data: null, count: out.length, error: null };
      const lim = out.slice(0, limit);
      return { data: single ? lim[0] ?? null : lim, error: null };
    };
    const cmp = (c: string, f: (a: any) => boolean) => filters.push((r) => r[c] != null && f(r[c]));
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (_c?: string, o?: any) => { if (o?.head) head = true; return q; };
        if (k === 'insert' || k === 'update') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq' || k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        // كما في Postgres: المقارنة مع الفارغ لا تنجح، فغير المؤرخة تسقط من مرشحات الموعد
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'lt') return (c: string, v: string) => { cmp(c, (a) => a < v); return q; };
        if (k === 'gte') return (c: string, v: string) => { cmp(c, (a) => a >= v); return q; };
        if (k === 'lte') return (c: string, v: string) => { cmp(c, (a) => a <= v); return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from, rpc: (db as any).rpc };
  Object.assign(db as any, { from, rpc: () => Promise.resolve({ data: null, error: null }) });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

// مشارك آخر بدأ كل شيء: قراءة وفيرة، واختبار، ونموذج مسلَّم
const other = () => ({
  reading_progress: [{ participant_id: 'p2', module_id: 'm1', active_seconds: 5000 }],
  handbook_progress: [{ participant_id: 'p2', module_id: 'm1', quiz_score: 5, quiz_total: 5 }],
  model_submissions: [{ participant_id: 'p2', model_id: 'x', status: 'reviewed', submitted_at: '2026-11-10T00:00:00Z' }],
});

Deno.test('العزل: نشاط مشارك آخر لا يفتح التوجيه لمن لم يبدأ', async () => {
  const t = install(other());
  try {
    assertEquals(await guidanceFor('p1', false), { ready: false, signals: [] });
    assertEquals((await guidanceFor('p2', false))?.signals, ['reading', 'quiz', 'model']);
  } finally { t.restore(); }
});

Deno.test('القراءة: دون الحد لا تكفي، وبلوغه في باب واحد يكفي', async () => {
  const t = install({ ...other(), reading_progress: [...other().reading_progress, { participant_id: 'p1', module_id: 'm1', active_seconds: GUIDANCE_READ_SECONDS - 1 }] });
  try {
    assertEquals((await guidanceFor('p1', false))?.ready, false);
    t.tables.reading_progress.push({ participant_id: 'p1', module_id: 'm2', active_seconds: GUIDANCE_READ_SECONDS });
    assertEquals(await guidanceFor('p1', false), { ready: true, signals: ['reading'] });
  } finally { t.restore(); }
});

Deno.test('النموذج: المسودة لا تُعد، والمُعاد بعد التسليم يُعد لأن تاريخ تسليمه باقٍ', async () => {
  const t = install({ model_submissions: [{ participant_id: 'p1', model_id: 'a', status: 'draft', submitted_at: null }] });
  try {
    assertEquals((await guidanceFor('p1', false))?.ready, false);
    t.tables.model_submissions.push({ participant_id: 'p1', model_id: 'b', status: 'returned', submitted_at: '2026-11-12T00:00:00Z' });
    assertEquals((await guidanceFor('p1', false))?.signals, ['model']);
  } finally { t.restore(); }
});

Deno.test('المبادرة تأتي من رحلة المشارك نفسه، وتعذّر القراءة يعيد null بلا حكم خاطئ', async () => {
  const t = install({});
  try {
    assertEquals(await guidanceFor('p1', true), { ready: true, signals: ['initiative'] });
  } finally { t.restore(); }
  const prev = (db as any).from;
  (db as any).from = () => { throw new Error('down'); };
  try { assertEquals(await guidanceFor('p1', false), null); } finally { (db as any).from = prev; }
});

Deno.test('حراسة نصية: كل استعلام مقيد بالمشارك، والمعرّف من الجلسة لا من جسم الطلب', async () => {
  const src = await Deno.readTextFile(new URL('./guidance.ts', import.meta.url));
  const froms = src.match(/db\.from\('[a-z_]+'\)[^\n]*/g) || [];
  assertEquals(froms.length, 3);
  for (const f of froms) assert(f.includes(".eq('participant_id', participantId)"), f);
  const me = await Deno.readTextFile(new URL('./participant.ts', import.meta.url));
  assert(/guidance: audience === 'participant' && approved \? await guidanceFor\(p\.id, !!initiative\) : null/.test(me));
  assert(!/guidanceFor\(b\./.test(me));
});
