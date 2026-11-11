// حساب العرض لا يشارك الدفعة المفتوحة الحقيقية (server-sec-5): بلا تسجيل ولا جهة فدفعته الافتراضية هي المفتوحة،
// والجولة الحية في الورش ترفع منه طلب توجيه. على قاعدة مزيفة تطبّق المرشحات والتضمين: طلبه لا يراه مشارك ولا خبير
// ولا الإدارة ولا يصل مستشارها بريد عنه، ولا يرى هو طلباتهم ولا قاعتهم، وإجاباته لا تدخل إحصاء كاتون. ويبقى يرى طلبه.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const PR = await import('./peer.ts');
const H = await import('./hall.ts');
const KT = await import('./katon.ts');
const { advisorOf } = await import('./advisor.ts');

type Row = Record<string, any>;
const get = (r: Row, path: string) => path.split('.').reduce((v: any, k) => (v == null ? v : v[k]), r);

// جداول في الذاكرة: eq وneq وin وnot(is null) وlimit وrange وmaybeSingle وsingle والعدّ، والإدراج والتحديث،
// وتضمين participants (بـ participant_id أو author_id) وexperts، فمرشح participants.is_demo يعمل كما في PostgREST
function install(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  let seq = 0;
  const embed = (_table: string, r: Row): Row => {
    const pid = r.participant_id ?? r.author_id;
    return {
      ...r,
      participants: pid ? tables.participants.find((p) => p.id === pid) ?? null : null,
      experts: r.expert_id ? (tables.experts || []).find((x) => x.id === r.expert_id) ?? null : null,
    };
  };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    let range: [number, number] | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      let out = rows.map((r) => embed(table, r)).filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        for (const r of out) Object.assign(rows.find((x) => x.id === r.id) || {}, payload);
        return { data: out, error: null };
      }
      reads.push(table);
      if (head) return { data: null, count: out.length, error: null };
      if (range) out = out.slice(range[0], range[1] + 1);
      out = out.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: any) => { if (o?.head) head = true; return q; },
      insert: (x: any) => { mode = 'insert'; payload = x; return q; },
      update: (x: any) => { mode = 'update'; payload = x; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => (get(r, c) ?? null) === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => get(r, c) !== v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(get(r, c))); return q; },
      not: (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => get(r, c) != null); return q; },
      gte: () => q, lte: () => q, order: () => q,
      limit: (n: number) => { limit = n; return q; },
      range: (f: number, t: number) => { range = [f, t]; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  Object.assign(db as any, { from });
  return { reads, restore: () => { delete (db as any).from; } };
}

const DEMO = { id: 'demo', full_name: 'مشارك العرض', email: 'demo@demo.milestone-impact.org', is_demo: true, organization_id: null };
const REAL = { id: 'real', full_name: 'مشارك حقيقي', email: 'real@example.com', is_demo: false, organization_id: null };
const REAL2 = { id: 'real2', full_name: 'زميل حقيقي', email: 'real2@example.com', is_demo: false, organization_id: null };
const ADVISOR = { id: 'adv', full_name: 'مستشار الدفعة', email: 'adv@example.com', status: 'active' };
const OPEN = '11111111-1111-4111-8111-111111111111';

function world(supervision: string) {
  return {
    participants: [DEMO, REAL, REAL2],
    experts: [ADVISOR],
    cohorts: [{ id: OPEN, name: 'الدفعة المفتوحة', is_default: true, organization_id: null, status: 'running', supervision, advisor_expert_id: 'adv', program_id: 'prog' }],
    enrollments: [], cohort_roles: [], cohort_group_members: [], audit_log: [],
    peer_requests: [
      { id: 'q-real', participant_id: 'real', cohort_id: OPEN, text: 'سؤال مشارك حقيقي عن المعالم', source: 'free', target_team: null, status: 'open', created_at: '2026-11-10T08:00:00Z' },
      { id: 'q-demo-old', participant_id: 'demo', cohort_id: OPEN, text: 'سؤال تجريبي قديم من الجولة', source: 'free', target_team: null, status: 'open', created_at: '2026-11-10T09:00:00Z' },
    ],
    // إجابة كتبها حساب العرض عن طلب حقيقي قبل العزل
    peer_answers: [{ id: 'a-demo', request_id: 'q-real', author_id: 'demo', text: 'إجابة من حساب العرض', status: 'pending', created_at: '2026-11-10T10:00:00Z' }],
    hall_sessions: [{ id: 'hs', cohort_id: OPEN, stage: 'round', version: 1, mode: 'self', topic_id: 't', revealed: [] }],
    hall_presence: [],
    programs: [{ id: 'prog', is_default: true, name: 'البرنامج', katon_points: null }],
    katon_topics: [{ id: 't', title_ar: 'موضوع', status: 'published', sort: 1 }],
    katon_sentences: [{ id: 's1', topic_id: 't', sort: 1, key: 'true', text_ar: 'جملة', question: 'when' }],
    katon_answers: [
      { participant_id: 'real', sentence_id: 's1', verdict: 'true', confidence: 2, stances: [] },
      { participant_id: 'demo', sentence_id: 's1', verdict: 'false', confidence: 3, stances: [] },
    ],
  };
}
const ids = (r: any) => (r.items || []).map((x: any) => x.id).sort();

Deno.test('حساب العرض بلا مستشار: لا قراءة ولا بريد لمستشار الدفعة الحقيقي', async () => {
  const f = install(world('expert_only'));
  try {
    assertEquals(await advisorOf(DEMO), null);
    assertEquals(f.reads.filter((t) => t === 'experts').length, 0);
    // طلب الجولة الحية في نمط «الخبير وحده»: يُحفظ ويراه حساب العرض، ولا يُقرأ المستشار ليُراسل
    const r: any = await PR.ask(DEMO, { text: 'ما الفرق العملي بين معلم القيمة ومعلم الإنجاز؟', source: 'free' });
    assertEquals(r.success, true);
    assertEquals(r.advisor, null);
    assertEquals(f.reads.filter((t) => t === 'experts').length, 0);
    assertEquals(r.items.every((x: any) => x.mine), true);
  } finally { f.restore(); }
});

Deno.test('طلبات حساب العرض لا يراها مشارك ولا خبير ولا الإدارة، ولا يرى هو طلباتهم', async () => {
  const f = install(world('peers_expert'));
  try {
    const asked: any = await PR.ask(DEMO, { text: 'سؤال الجولة الحية في الورشة', source: 'free' });
    const demoIds = ids(asked);
    assertEquals(demoIds.includes('q-real'), false);
    assertEquals(demoIds.includes('q-demo-old'), true);
    const real: any = await PR.list(REAL2);
    assertEquals(ids(real), ['q-real']);
    // إجابة حساب العرض القديمة عن الطلب الحقيقي لا تُعرض
    assertEquals(real.items[0].answers.length, 0);
    const xp: any = await PR.expertList(ADVISOR);
    assertEquals(ids(xp), ['q-real']);
    const admin: any = await PR.adminList({ cohort_id: OPEN });
    assertEquals(ids(admin), ['q-real']);
  } finally { f.restore(); }
});

Deno.test('لا إجابة عابرة: الحقيقي لا يجيب طلب العرض، والعرض لا يجيب طلبًا حقيقيًا، والخبير لا يصل طلب العرض', async () => {
  const f = install(world('peers_expert'));
  try {
    const code = async (fn: () => Promise<unknown>) => ((await assertRejects(fn, Fail)) as any).status;
    assertEquals(await code(() => PR.answer(REAL, { request_id: 'q-demo-old', text: 'إجابة من مشارك حقيقي' })), 404);
    assertEquals(await code(() => PR.answer(DEMO, { request_id: 'q-real', text: 'إجابة من حساب العرض' })), 404);
    assertEquals(await code(() => PR.expertAnswer(ADVISOR, { request_id: 'q-demo-old', text: 'إجابة الخبير' })), 403);
    // والمشارك الحقيقي يجيب زميله كما كان
    const ok: any = await PR.answer(REAL2, { request_id: 'q-real', text: 'إجابة من زميل حقيقي' });
    assertEquals(ok.success, true);
  } finally { f.restore(); }
});

Deno.test('حساب العرض لا يرى قاعة الدفعة المفتوحة ولا يدخلها ولا تمر إجابته ببوابتها', async () => {
  const f = install(world('peers_expert'));
  try {
    assertEquals(((await H.state(DEMO, {})) as any).session, null);
    await assertRejects(() => H.join(DEMO), Fail);
    assertEquals((await H.hallGate(DEMO, 's1')).inHall, false);
    assertEquals(f.reads.includes('hall_sessions'), false);
    // والمشارك الحقيقي في قاعة دفعته كما كان
    assertEquals(await H.hallGate(REAL, 's1'), { inHall: true, sessionId: 'hs' });
  } finally { f.restore(); }
});

Deno.test('إحصاء بنود كاتون في اللوحة بلا إجابات حساب العرض', async () => {
  const f = install(world('peers_expert'));
  try {
    const r: any = await KT.adminList({});
    const s = r.topics[0].sentences[0];
    assertEquals(s.answers, 1);
  } finally { f.restore(); }
});
