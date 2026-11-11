// katon.answer داخل القاعة في شيفرته الفعلية، على قاعدة مزيفة تجيب طلبات PostgREST من الذاكرة (بلا شبكة):
// لا يخرج من الرد بنك الجمل ولا مفتاح قبل كشف الخبير، وقفل القاعة في hallGate وحده (لا قفل «أتممت الموضوع»)،
// و«كاتون» المخفي (KATON_ENABLED) مقفل على الخادم أيضًا.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

type Row = Record<string, any>;
const KEYS: Record<string, string[]> = { katon_answers: ['participant_id', 'sentence_id'] };
let tables: Record<string, Row[]> = {};
const writes: { table: string; method: string; body: unknown }[] = [];

// ما يكفي من PostgREST لهذه الطلبات: مرشحات eq/neq/in/is، والتضمين katon_topics!inner، وsingle/maybeSingle، وupsert وupdate
function match(row: Row, url: URL) {
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    const cur = row[k] == null ? null : String(row[k]);
    if (op === 'eq' && cur !== val) return false;
    if (op === 'neq' && cur === val) return false;
    if (op === 'in' && !val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(cur))) return false;
    if (op === 'is' && val === 'null' && cur !== null) return false;
  }
  return true;
}
function embed(table: string, rows: Row[], select: string) {
  if (table !== 'katon_sentences' || !select.includes('katon_topics')) return rows;
  return rows.map((r) => ({ ...r, katon_topics: (tables.katon_topics || []).find((t) => t.id === r.topic_id) || null }))
    .filter((r) => !select.includes('katon_topics!inner') || r.katon_topics);
}
const json = (body: unknown, status = 200) => new Response(body == null ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function postgrest(input: string | URL | Request, init: RequestInit = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const table = url.pathname.replace(/^\/rest\/v1\//, '');
  const headers = new Headers(init.headers);
  const method = (init.method || 'GET').toUpperCase();
  const list = (tables[table] ||= []);
  const one = (headers.get('Accept') || '').includes('vnd.pgrst.object');
  const back = (rows: Row[], status = 200) => {
    if (one) return rows.length === 1 ? json(rows[0], status) : json({ code: 'PGRST116', message: 'not one row' }, 406);
    return json(rows, status);
  };
  if (method === 'GET') return back(embed(table, list.filter((r) => match(r, url)), url.searchParams.get('select') || '*'));
  const body = init.body ? JSON.parse(String(init.body)) : null;
  writes.push({ table, method, body });
  const wantRows = (headers.get('Prefer') || '').includes('return=representation');
  if (method === 'POST') {
    const keys = KEYS[table] || ['id'];
    const out = (Array.isArray(body) ? body : [body]).map((row: Row) => {
      const at = list.findIndex((r) => keys.every((k) => r[k] === row[k]));
      if (at >= 0) { list[at] = { ...list[at], ...row }; return list[at]; }
      list.push({ ...row }); return row;
    });
    return wantRows ? back(out, 201) : json(null, 201);
  }
  if (method === 'PATCH') {
    const hit = list.filter((r) => match(r, url));
    hit.forEach((r) => Object.assign(r, body));
    return wantRows ? back(hit) : json(null, 204);
  }
  return json({ message: `غير مدعوم: ${method}` }, 400);
}
// قبل استيراد core.ts: عميل Supabase يلتقط fetch عند إنشائه
globalThis.fetch = postgrest as typeof fetch;
const { answer, mine } = await import('./katon.ts');
const { Fail } = await import('./core.ts');

const P = { id: 'p1', organization_id: null };
const IDS = ['k1', 'k2', 'k3'];
function seed({ stage = 'round', current = 'k3', revealed = ['k1', 'k2'], answered = ['k1', 'k2'], hall = true } = {}) {
  tables = {
    placements: ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: 'p1', dimension, level: 'intermediate', approved_at: '2026-11-01T00:00:00Z' })),
    enrollments: [{ participant_id: 'p1', cohort_id: 'c1', status: 'enrolled', created_at: '2026-11-01T00:00:00Z' }],
    cohorts: [{ id: 'c1', name: 'دفعة الاختبار', is_default: false, program_id: 'pr1' }],
    katon_topics: [{ id: 't1', status: 'published', title_ar: 'موضوع القاعة', sort: 1 }],
    katon_sentences: IDS.map((id, i) => ({ id, topic_id: 't1', sort: i + 1, question: 'why', text_ar: `نص الجملة ${id}`, key: i % 2 ? 'true' : 'false', explain_ar: `شرح ${id}`, tasks: {} })),
    katon_answers: answered.map((sentence_id) => ({ participant_id: 'p1', sentence_id, verdict: 'false', confidence: 2, stances: [], note: null })),
    hall_sessions: hall ? [{ id: 's1', cohort_id: 'c1', topic_id: 't1', mode: 'live', stage, sentence_id: current, revealed, version: 7, phase_ends_at: new Date(Date.now() + 60_000).toISOString() }] : [],
  };
  writes.length = 0;
}
const saved = (id: string) => tables.katon_answers.find((a) => a.sentence_id === id);

Deno.test('في القاعة: الإجابة عن الجملة المعروضة يرد عليها بالاستلام وحده، بلا نصوص الجمل ولا مفاتيحها', async () => {
  seed();
  const r = await answer(P, { sentence_id: 'k3', verdict: 'true', confidence: 3, stances: [] });
  assertEquals(r, { success: true });
  assertEquals(JSON.stringify(r).includes('نص الجملة') || JSON.stringify(r).includes('شرح'), false);
  assertEquals(saved('k3')?.verdict, 'true');
  assertEquals(tables.hall_sessions[0].version, 8);   // الإصدار يُرفع فتسأل الأجهزة
});

Deno.test('في القاعة: آخر جملة في الموضوع تُعدَّل حتى يكشفها الخبير (ثقة، ثم وسم بملاحظة)', async () => {
  seed({ answered: ['k1', 'k2', 'k3'] });
  assertEquals(await answer(P, { sentence_id: 'k3', verdict: 'false', confidence: 1, stances: [] }), { success: true });
  assertEquals(await answer(P, { sentence_id: 'k3', verdict: 'false', confidence: 2, stances: ['question'], note: 'كيف يُقاس هذا في جهة حكومية؟' }), { success: true });
  assertEquals([saved('k3')?.confidence, saved('k3')?.stances, saved('k3')?.note], [2, ['question'], 'كيف يُقاس هذا في جهة حكومية؟']);
  // الوسم قبل الحكم في الجولة الأخيرة: يُحفظ ثم يُحفظ الحكم بعده
  seed();
  assertEquals(await answer(P, { sentence_id: 'k3', stances: ['idea'], note: 'فكرة للتطبيق في فريقي' }), { success: true });
  assertEquals(await answer(P, { sentence_id: 'k3', verdict: 'true', confidence: 3, stances: ['idea'], note: 'فكرة للتطبيق في فريقي' }), { success: true });
  assertEquals(saved('k3')?.verdict, 'true');
});

Deno.test('في القاعة: قفل hallGate باقٍ: ما كُشف لا يُعدَّل، وغير المعروضة تُرفض، ولا كتابة', async () => {
  seed({ stage: 'reveal', revealed: ['k1', 'k2', 'k3'], answered: ['k1', 'k2', 'k3'] });
  const e = (await assertRejects(() => answer(P, { sentence_id: 'k3', verdict: 'true', confidence: 1, stances: [] }), Fail)) as InstanceType<typeof Fail>;
  assertEquals(e.code, 'revealed');
  seed({ current: 'k2', revealed: ['k1'], answered: ['k1'] });
  assertEquals(((await assertRejects(() => answer(P, { sentence_id: 'k3', verdict: 'true', confidence: 1, stances: [] }), Fail)) as InstanceType<typeof Fail>).code, 'not_current');
  assertEquals(writes.filter((w) => w.table === 'katon_answers').length, 0);
});

Deno.test('«كاتون» مخفي: بنكه لا يُقرأ، والإجابة خارج القاعة تُرفض قبل أي كتابة', async () => {
  seed({ hall: false, answered: [] });
  assertEquals(((await assertRejects(() => mine(P), Fail)) as InstanceType<typeof Fail>).code, 'katon_off');
  assertEquals(((await assertRejects(() => answer(P, { sentence_id: 'k1', verdict: 'true', confidence: 1, stances: [] }), Fail)) as InstanceType<typeof Fail>).code, 'katon_off');
  assertEquals(writes.length, 0);
});
