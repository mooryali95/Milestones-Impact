// «بوابتان، والباقي ملاحظات» (قرار المالك 2026-11-23): التسليم يُحتسب فورًا، والإعادة لا تحبس الرحلة، والملخص اليومي
// لكل مستشار بمشاركيه ولفريق البرنامج بمن لا مستشار له، وبطاقة المبادرة وحدها فورية، و«قرأتها كلها» لا تمس البطاقة.
// قاعدة في الذاكرة وشبكة محاكاة، فلا يخرج طلب حقيقي.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const { CONFIG, db } = await import('./core.ts');
const MD = await import('./model-digest.ts');
const A = await import('./admin.ts');
const V = await import('./advisor.ts');
const { digestGroups, needsDigest, bulkReadIds, readingList, readingCounts } = await import('./model-review.js');
const { modelStatus } = await import('./logic.js');
const { modelStatusAr, REVIEWER_AR } = await import('./labels.js');

type Row = Record<string, any>;
const val = (r: Row, c: string) => c.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), r);
function fakeFrom(tables: Record<string, Row[]>) {
  return (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: any = null;
    let single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') { const add = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ created_at: new Date().toISOString(), ...x })); rows.push(...add); return { data: single ? add[0] : add, error: null }; }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      const lim = out.slice(0, limit);
      return { data: single ? lim[0] ?? null : lim, error: null };
    };
    const q: any = {
      select: () => q,
      insert: (x: any) => { mode = 'insert'; payload = x; return q; },
      upsert: (x: any) => { mode = 'insert'; payload = x; return q; },
      update: (x: any) => { mode = 'update'; payload = x; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => val(r, c) === v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(val(r, c))); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => val(r, c) !== v); return q; },
      is: () => q, not: () => q, gte: () => q, order: () => q, range: () => q,
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
}
function install(tables: Record<string, Row[]>) {
  const from = fakeFrom(tables);
  const real = { from: (db as any).from, schema: (db as any).schema };
  Object.assign(db as any, { from, schema: () => ({ from }) });
  return () => Object.assign(db as any, real);
}
async function withMail<T>(fn: (mails: any[]) => Promise<T>) {
  const real = globalThis.fetch;
  const mails: any[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('resend.com')) { mails.push(JSON.parse(String(init?.body))); return new Response('{"id":"re_1"}'); }
    return new Response('ok');
  }) as typeof fetch;
  try { return await fn(mails); } finally { globalThis.fetch = real; }
}
const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
const setEnv = () => Object.assign(CONFIG, { alertEmail: 'team@program.sa', resendKey: 're_test' });
const resetEnv = () => Object.assign(CONFIG, saved);

// عالم صغير: مشارك له مستشار (p1 في الدفعة cA)، ومشارك بلا مستشار (p2 في cB)، وحساب عرض
const P1 = { id: 'p1', full_name: 'سارة', organization_id: null, is_demo: false };
const P2 = { id: 'p2', full_name: 'خالد', organization_id: null, is_demo: false };
const MREG = { key: 'milestone-register', title_ar: 'سجل المعالم' };
const CARD = { key: 'initiative-charter', title_ar: 'بطاقة المبادرة' };
const at = (riyadhHour: number) => Date.parse('2026-11-24T00:00:00Z') + (riyadhHour - 3) * 36e5;
function world(): Record<string, Row[]> {
  const t = new Date(at(7)).toISOString();
  return {
    audit_log: [], mail_events: [], mail_queue: [], cohort_group_members: [], cohort_groups: [], participants: [P1, P2],
    cohorts: [{ id: 'cA', advisor_expert_id: 'xA', status: 'running' }, { id: 'cB', advisor_expert_id: null, status: 'running' }],
    enrollments: [{ participant_id: 'p1', cohort_id: 'cA', status: 'active', created_at: t }, { participant_id: 'p2', cohort_id: 'cB', status: 'active', created_at: t }],
    experts: [{ id: 'xA', full_name: 'د. منى', email: 'advisor@x.sa', status: 'active', roles: ['advisor'] }],
    model_submissions: [
      { id: 's1', participant_id: 'p1', status: 'submitted', submitted_at: t, digested_at: null, participants: P1, learning_models: MREG },
      { id: 's2', participant_id: 'p1', status: 'submitted', submitted_at: t, digested_at: null, participants: P1, learning_models: CARD },
      { id: 's3', participant_id: 'p2', status: 'submitted', submitted_at: t, digested_at: null, participants: P2, learning_models: { key: 'stage-gate', title_ar: 'ورقة قرار البوابة' } },
      { id: 's4', participant_id: 'p2', status: 'reviewed', submitted_at: t, digested_at: null, participants: P2, learning_models: MREG },
    ],
  };
}

Deno.test('المتطلب بالتسليم: سُلّم وقُرئ ويحتاج تعديلًا كلها مكتملة، والبطاقة (reviewed) بالاعتماد وحده', () => {
  const sub = { model_key: 'm', accept: 'submitted' }, gate = { model_key: 'm', accept: 'reviewed' };
  for (const st of ['submitted', 'reviewed', 'returned']) assertEquals(modelStatus(sub, { m: { status: st } }).done, true, st);
  assertEquals(modelStatus(sub, { m: { status: 'draft' } }).done, false);
  assertEquals(modelStatus(gate, { m: { status: 'returned' } }).done, false);
  assertEquals(modelStatus(gate, { m: { status: 'submitted' } }).done, false);
  assertEquals(modelStatus(gate, { m: { status: 'reviewed' } }).done, true);
});

Deno.test('نص الحالة: البطاقة بانتظار اعتماد المستشار أو فريق البرنامج، والعادي «سُلّم» بلا انتظار', () => {
  assertEquals(modelStatusAr('submitted', { gate: true, reviewer: 'team' }), `بانتظار اعتماد ${REVIEWER_AR.team}`);
  assertEquals(modelStatusAr('submitted', { gate: true }), 'بانتظار اعتماد المستشار');
  assert(!modelStatusAr('submitted').includes('بانتظار'));
});

Deno.test('تجميع الملخص: المستشار بمشاركيه، وفريق البرنامج بمن لا مستشار له، بلا البطاقة ولا حساب العرض، وإعادة التسليم تعود', () => {
  const rows = world().model_submissions;
  rows.push({ id: 's5', participant_id: 'pd', status: 'submitted', submitted_at: '2026-11-24', participants: { is_demo: true }, learning_models: MREG });
  const groups = digestGroups(rows, new Map<string, any>([['p1', { id: 'xA', email: 'advisor@x.sa' }], ['p2', null], ['pd', null]]));
  assertEquals(groups.map((g: any) => [g.kind, g.ids]), [['advisor', ['s1']], ['team', ['s3']]]);
  assertEquals(groups[1].participants[0].name, 'خالد');
  // مشارك لم يُعرف مراجعه الآن (غائب عن الخريطة): لا يُرسل لأحد
  assertEquals(digestGroups(rows, new Map([['p1', null]])).map((g: any) => g.ids), [['s1']]);
  assertEquals(needsDigest({ status: 'submitted', submitted_at: '2026-11-24T08:00:00Z', digested_at: '2026-11-23T05:00:00Z' }), true);
  assertEquals(needsDigest({ status: 'submitted', submitted_at: '2026-11-22T08:00:00Z', digested_at: '2026-11-23T05:00:00Z' }), false);
});

Deno.test('الملخص اليومي: لا شيء قبل 8:00، ثم بريد للمستشار وبريد لفريق البرنامج (بلا مستشار)، ولا يتكرر في اليوم', async () => {
  setEnv(); MD.resetModelDigest();
  const tables = world();
  const restore = install(tables);
  try {
    await withMail(async (mails) => {
      assertEquals(await MD.modelDigest(at(7)), { due: false });
      const r = await MD.modelDigest(at(8));
      assertEquals([r.sent, r.marked], [2, 2]);
      assertEquals(mails.map((m) => m.to).flat().sort(), ['advisor@x.sa', 'team@program.sa']);
      const team = mails.find((m) => [m.to].flat().includes('team@program.sa'));
      assert(team.html.includes('خالد') && !team.html.includes('سارة'), 'فريق البرنامج يرى من لا مستشار له وحده');
      assert(!mails.some((m) => m.html.includes('بطاقة المبادرة</')), 'البطاقة لا تدخل الملخص');
      assertEquals(tables.model_submissions.filter((s) => s.digested_at).map((s) => s.id).sort(), ['s1', 's3']);
      MD.resetModelDigest();
      assertEquals(await MD.modelDigest(at(9)), { due: false });
      assertEquals(mails.length, 2);
    });
  } finally { restore(); resetEnv(); MD.resetModelDigest(); }
});

Deno.test('تسليم البطاقة فوري: للمستشار، وبلا مستشار لفريق البرنامج، وغير البطاقة لا بريد فوري', async () => {
  setEnv();
  const restore = install(world());
  try {
    await withMail(async (mails) => {
      assertEquals((await V.notifySubmission(P1, MREG)).digest, true);
      assertEquals(mails.length, 0);
      assertEquals(await V.notifySubmission(P1, CARD), { sent: true, to: 'advisor', digest: false });
      assertEquals(await V.notifySubmission(P2, CARD), { sent: true, to: 'team', digest: false });
      assertEquals(mails.map((m) => [m.to].flat()[0]), ['advisor@x.sa', 'team@program.sa']);
      assert(mails[1].html.includes(REVIEWER_AR.team));
    });
  } finally { restore(); resetEnv(); }
});

Deno.test('«قرأتها كلها»: المسلَّم للمشارك نفسه وحده بلا البطاقة، بسطر تدقيق واحد، ولا بريد', async () => {
  setEnv();
  const tables = world();
  const restore = install(tables);
  try {
    await withMail(async (mails) => {
      assertEquals(bulkReadIds(tables.model_submissions, 'p1'), ['s1']);
      const r = await A.reviewBulkBy('admin@x.sa', 'admin', 'p1');
      assertEquals(r, { success: true, marked: 1 });
      assertEquals(tables.model_submissions.map((s) => s.status), ['reviewed', 'submitted', 'submitted', 'reviewed']);
      assertEquals(tables.audit_log.filter((x) => x.action === 'submission.review-bulk').length, 1);
      assertEquals(mails.length, 0);
    });
  } finally { restore(); resetEnv(); }
});

Deno.test('«قرأتها كلها» من بوابة الخبير: لمستشار المشارك وحده', async () => {
  const restore = install(world());
  try {
    const err = await V.reviewBulk({ id: 'xA', email: 'advisor@x.sa' }, { participant_id: 'p2' }).then(() => null, (e) => e);
    assertEquals(err?.status, 403);
    assertEquals((await V.reviewBulk({ id: 'xA', email: 'advisor@x.sa' }, { participant_id: 'p1' })).marked, 1);
  } finally { restore(); }
});

Deno.test('عدد «بلا مستشار» في لوحة الإدارة: من ينتظر القراءة ولا مستشار له', async () => {
  const tables = world();
  const restore = install(tables);
  try {
    assertEquals(await A.noAdvisorOf(tables.model_submissions), ['p2']);
    const { groups, gates } = readingList(tables.model_submissions, new Set(['p2']));
    assertEquals(groups.map((g: any) => [g.id, g.team, g.items.map((x: any) => x.id)]).sort(), [['p1', false, ['s1']], ['p2', true, ['s3']]]);
    assertEquals(gates.map((x: any) => x.id), ['s2']);
  } finally { restore(); }
});

Deno.test('advisorsOf بقراءات معدودة يطابق advisorOf لكل مشارك: خبير المجموعة يغلب، وغير المعتمد يسقط، والجهة والتجريبي', async () => {
  const tables = world();
  const t = new Date(at(7)).toISOString();
  tables.cohorts.push({ id: 'cO', advisor_expert_id: 'xB', organization_id: 'o1', status: 'running' }, { id: 'cD', advisor_expert_id: 'xA', organization_id: null, is_default: true, status: 'running' });
  tables.experts.push({ id: 'xB', full_name: 'د. علي', email: 'b@x.sa', status: 'active', roles: ['advisor'] }, { id: 'xG', full_name: 'د. هند', email: 'g@x.sa', status: 'active', roles: ['advisor'] },
    { id: 'xN', full_name: 'معلّق', email: 'n@x.sa', status: 'applied', roles: ['advisor'] });
  tables.cohort_groups.push({ id: 'g1', advisor_expert_id: 'xG' }, { id: 'g2', advisor_expert_id: 'xN' });
  tables.cohort_group_members.push({ participant_id: 'p3', cohort_id: 'cA', cohort_groups: { advisor_expert_id: 'xG' } }, { participant_id: 'p4', cohort_id: 'cA', cohort_groups: { advisor_expert_id: 'xN' } },
    { participant_id: 'p5', cohort_id: 'cB', cohort_groups: { advisor_expert_id: 'xG' } });
  tables.enrollments.push(...['p3', 'p4'].map((id) => ({ participant_id: id, cohort_id: 'cA', status: 'active', created_at: t })));
  const ps = [P1, P2, { id: 'p3', organization_id: null }, { id: 'p4', organization_id: null }, { id: 'p5', organization_id: null }, { id: 'p6', organization_id: 'o1' }, { id: 'p7', organization_id: null, is_demo: true }];
  const restore = install(tables);
  try {
    const one: Record<string, string | null> = {};
    for (const p of ps) one[p.id] = ((await V.advisorOf(p as any)) as any)?.id ?? null;
    const many = await V.advisorsOf(ps as any);
    const batch = Object.fromEntries(ps.map((p) => [p.id, many.has(p.id) ? (many.get(p.id)?.id ?? null) : 'missing']));
    assertEquals(batch, one);
    assertEquals(one, { p1: 'xA', p2: null, p3: 'xG', p4: 'xA', p5: 'xA', p6: 'xB', p7: null });
  } finally { restore(); }
});

Deno.test('عدّ «للقراءة» من القائمة نفسها: المسلَّم غير المقروء بلا البطاقة ولا التجريبي، والبطاقة وحدها للاعتماد', () => {
  const rows = world().model_submissions.concat([{ id: 's5', participant_id: 'd', status: 'submitted', participants: { is_demo: true }, learning_models: MREG }]);
  assertEquals(readingCounts(rows), { read: 2, gates: 1 });
  const { groups } = readingList(rows.filter((x: any) => !x.participants?.is_demo));
  assertEquals(groups.reduce((n: number, g: any) => n + g.items.length, 0), 2);
});
