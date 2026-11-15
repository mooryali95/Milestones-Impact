// شاشة المساعد في leaders-api (agent-admin.ts) على مخزن في الذاكرة بلا شبكة: الصلاحيات، وبوابة التفعيل، والمفتاح
// بالتحقق الإضافي وحده وبلا تسريب، وسجل فتح المحادثة، والتقييم بدفعات تحت عقد إيجار.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const AA = await import('./agent-admin.ts');
const { superWriter } = await import('./admin.ts');
const { versions } = await import('../agent-chat/version.ts');
const { CASES } = await import('../agent-chat/evals/cases.ts');
const { emptyMem, memStore } = await import('../agent-chat/mem_store.ts');
const { resetRuntime } = await import('../agent-chat/runtime.ts');
type Admin = import('./admin.ts').Admin;
type Run = import('./agent-admin.ts').Run;
type Result = import('./agent-admin.ts').Result;

const MODEL = 'claude-haiku-5-5';
const FP = (await versions(MODEL)).fingerprint;
const SECRET = 'sk-ant-test-0123456789abcdefghij-SECRET';
const HASH = 'h'.repeat(64);
const SUPER: Admin = { email: 'boss@x.sa', role: 'super_admin', method: 'passkey', id: '11111111-1111-1111-1111-111111111111', sessionHash: HASH, owner: true };

type Step = { session_hash: string; admin_id: string; purpose: string; method: string; expires: number; consumed: boolean };
function memRepo() {
  const st = {
    settings: { enabled: false, enabled_by: null, enabled_at: null, enabled_run_id: null, enabled_fingerprint: null, has_key: false, key_last4: null, key_set_at: null, key_set_by: null, key_ok_at: null, key_error_at: null, key_error: null, key_source: null } as any,
    runs: [] as Run[], results: [] as Result[], steps: [] as Step[], attempts: [] as { email: string; at: number }[], keySets: 0, keyClears: 0,
    convs: [] as any[], msgs: [] as any[], missing: false, keySetFails: false, apiKey: null as string | null,
  };
  const repo: import('./agent-admin.ts').Repo = {
    settings: async () => { if (st.missing) throw new AA.NotMigrated('x'); return { ...st.settings }; },
    updateSettings: async (p) => { Object.assign(st.settings, p); },
    runs: async (n) => [...st.runs].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, n),
    run: async (id) => st.runs.find((r) => r.id === id) ?? null,
    createRun: async (row) => {
      const running = st.runs.find((r) => r.status === 'running');
      if (running) return { running: running.id };
      const r = { id: crypto.randomUUID(), status: 'running', stop_reason: null, done_cases: 0, eval_pass: 0, eval_total: 0, redteam_pass: 0, redteam_total: 0, cost_micros: 0, lease_until: null, last_step_at: null, started_at: new Date().toISOString(), finished_at: null, ...row } as Run;
      st.runs.push(r);
      return { id: r.id };
    },
    lease: async (id, sec) => {
      const r = st.runs.find((x) => x.id === id);
      if (!r || r.status !== 'running' || (r.lease_until && Date.parse(r.lease_until) > Date.now())) return null;
      r.lease_until = new Date(Date.now() + sec * 1000).toISOString();
      return { ...r };
    },
    updateRun: async (id, p) => { Object.assign(st.runs.find((x) => x.id === id)!, p); },
    addCost: async (id, d) => { const r = st.runs.find((x) => x.id === id)!; r.cost_micros += d; return r.cost_micros; },
    results: async (id) => st.results.filter((r) => r.run_id === id),
    addResult: async (row) => { if (!st.results.some((r) => r.run_id === row.run_id && r.case_id === row.case_id)) st.results.push(row); },
    closeStale: async () => {},
    spend: async () => [],
    usage: async () => [{ model: MODEL, calls: 3, input_tokens: 900, cache_read_tokens: 18000, cache_write_tokens: 6000, output_tokens: 300, cost_micros: 2000 }],
    counts: async () => ({ conversations: 4, handoffs: 1, with_calls: 2, canned: 2, agent: 3 }),
    conversations: async () => st.convs,
    conversation: async (id) => st.convs.find((c) => c.id === id) ?? null,
    messages: async () => st.msgs,
    consumeStepUp: async (h, admin, purpose) => {
      const s = st.steps.find((x) => x.session_hash === h && x.admin_id === admin && x.purpose === purpose && !x.consumed && x.expires > Date.now());
      if (!s) return null;
      s.consumed = true;
      return s.method;
    },
    keyAttempts: async (email, since) => ({ mine: st.attempts.filter((x) => x.email === email && x.at >= Date.parse(since)).length, all: st.attempts.filter((x) => x.at >= Date.parse(since)).length }),
    keySet: async (key, by) => {
      if (st.keySetFails) throw new (await import('./core.ts')).Fail('تعذّر حفظ المفتاح، لم يُحفظ شيء', 500, 'key_save_failed');
      st.keySets++; st.apiKey = key;
      Object.assign(st.settings, { has_key: true, key_last4: key.slice(-4), key_set_at: new Date().toISOString(), key_set_by: by });
      return { key_last4: key.slice(-4), key_set_at: st.settings.key_set_at };
    },
    keyClear: async () => { st.keyClears++; st.apiKey = null; Object.assign(st.settings, { has_key: false, key_last4: null }); },
    companionOff: async () => 1,
    owners: async () => ['owner@x.sa'],
    runtime: () => Promise.resolve({ data: [{ enabled: st.settings.enabled, enabled_fingerprint: st.settings.enabled_fingerprint, api_key: st.apiKey }], error: null }),
  };
  return { st, repo };
}

const ENV: Record<string, string> = { ANTHROPIC_API_KEY: 'sk-ant-env-key-0000000000000000000wxyz', LEADERS_AGENT_MODEL: MODEL };
function install(over: { env?: Record<string, string | undefined>; fetchStatus?: number; model?: any; ledger?: any } = {}) {
  const { st, repo } = memRepo();
  const audits: any[] = [];
  const alerts: [string, Record<string, unknown>][] = [];
  const mails: string[] = [];
  const fetches: { url: string; headers: Headers }[] = [];
  const env = { ...ENV, ...over.env };
  resetRuntime();
  Object.assign(AA.AG, {
    repo, env: (k: string) => env[k], now: () => Date.now(),
    audit: async (...args: unknown[]) => { if ((AA.AG as any).auditFails) throw new Error('audit_failed'); audits.push(args); },
    alert: async (k: string, d: Record<string, unknown>) => { alerts.push([k, d]); return { cooled: false, webhook: true, email: true }; },
    mail: async (_to: string, subject: string, html: string) => { mails.push(subject + html); },
    fetch: async (url: string, init?: RequestInit) => {
      fetches.push({ url, headers: new Headers(init?.headers) });
      const s = over.fetchStatus ?? 200;
      return new Response(s === 200 ? JSON.stringify({ data: [{ id: MODEL }] }) : '{"error":{"message":"bad"}}', { status: s });
    },
    model: over.model ?? (async (_m: unknown, onText: (t: string) => void) => { onText('لا أملك معلومة مؤكدة عن هذا.'); return { text: 'لا أملك معلومة مؤكدة عن هذا.', stopReason: 'end_turn', model: MODEL, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }; }),
    ledger: over.ledger ?? (() => memStore(emptyMem())),
  });
  (AA.AG as any).auditFails = false;
  const grant = (h = HASH, admin = SUPER.id!, ms = 5 * 60e3) => st.steps.push({ session_hash: h, admin_id: admin, purpose: 'agent_key', method: 'totp', expires: Date.now() + ms, consumed: false });
  return { st, audits, alerts, mails, fetches, grant };
}
const code = async (p: Promise<unknown>) => ((await assertRejects(() => p)) as any).code;
const passRun = (over: Partial<Run> = {}): Run => ({ id: crypto.randomUUID(), status: 'passed', stop_reason: null, model: MODEL, knowledge_version: 'k', prompt_version: 'p', cases_version: 'c', fingerprint: FP, key_source: 'env', total_cases: CASES.length, done_cases: CASES.length, eval_pass: 40, eval_total: 42, redteam_pass: 21, redteam_total: 21, cost_micros: 70000, max_micros: 500000, lease_until: null, last_step_at: null, started_by: 'boss@x.sa', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), ...over });

Deno.test('الصلاحيات: المراقب والمدير يُرفضان، والمالك بدور مدير يقرأ ولا يكتب، وجلسة رمز البريد لا تكتب', async () => {
  install();
  for (const role of ['viewer', 'admin'] as const) {
    const a: Admin = { email: 'x@x.sa', role, method: 'passkey' };
    assertEquals(await code(AA.state(a)), 'super_required');
    assertEquals(await code(AA.conversations(a, {})), 'super_required');
    assertEquals(await code(AA.transcript(a, { id: crypto.randomUUID() })), 'super_required');
    assertEquals(await code(AA.evalRuns(a)), 'super_required');
  }
  const owner: Admin = { email: 'o@x.sa', role: 'admin', method: 'passkey', owner: true };
  const s: any = await AA.state(owner);
  assertEquals(s.ready, true);
  assertEquals(s.can_write, false);
  assertEquals(await code(Promise.resolve().then(() => superWriter(owner, AA.enable, { enabled: false }))), 'super_required');
  assertEquals(await code(Promise.resolve().then(() => superWriter({ ...SUPER, method: 'email' }, AA.keySet, { key: SECRET }))), 'mfa_required');
});

Deno.test('قبل الترحيل: الحالة ready=false، والإجراءات ترد not_migrated', async () => {
  const h = install();
  h.st.missing = true;
  assertEquals(await AA.state(SUPER), { success: true, ready: false });
  assertEquals(await code(AA.enable(SUPER, { enabled: true })), 'not_migrated');
});

Deno.test('التفعيل: يُرفض بلا تقييم، وبتقييم لبصمة أخرى، وبحالات ناقصة، وبمفتاح الطوارئ، ويُقبل بالبوابة ويُبلَّغ', async () => {
  const h = install();
  assertEquals(await code(AA.enable(SUPER, { enabled: true })), 'eval_required');
  h.st.runs.push(passRun({ fingerprint: 'other|fp' }));
  assertEquals(await code(AA.enable(SUPER, { enabled: true })), 'eval_required');
  h.st.runs.push(passRun({ done_cases: CASES.length - 1 }));
  assertEquals(await code(AA.enable(SUPER, { enabled: true })), 'eval_required');
  const good = passRun();
  h.st.runs.push(good);
  const off = install({ env: { LEADERS_AGENT_ENABLED: 'off' } });
  off.st.runs.push(good);
  assertEquals(await code(AA.enable(SUPER, { enabled: true })), 'env_off');
  const none = install({ env: { ANTHROPIC_API_KEY: undefined } });
  none.st.runs.push(good);
  assertEquals(await code(AA.enable(SUPER, { enabled: true })), 'no_key');
  const ok = install();
  ok.st.runs.push(good);
  assertEquals((await AA.enable(SUPER, { enabled: true })).enabled, true);
  assertEquals(ok.st.settings.enabled_fingerprint, FP);
  assertEquals(ok.st.settings.enabled_run_id, good.id);
  assertEquals(ok.alerts.map((x) => x[0]), ['agent_enabled']);
  assertEquals(ok.audits[0][2], 'agent.enable');
  const st: any = await AA.state(SUPER);
  assertEquals([st.effective, st.gate.ok], [true, true]);
  // الإطفاء لا يشترط شيئًا
  assertEquals((await AA.enable(SUPER, { enabled: false })).enabled, false);
});

Deno.test('المفتاح: بلا تحقق إضافي 403، ولجلسة أخرى 403، والمستهلك والمنتهي 403، والصيغة الخاطئة تستهلكه', async () => {
  const h = install();
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'step_up_required');
  h.grant('z'.repeat(64));
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'step_up_required');
  h.grant(HASH, SUPER.id!, -1000);
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'step_up_required');
  h.grant();
  assertEquals(await code(AA.keySet(SUPER, { key: 'sk-wrong' })), 'invalid_key');
  // التحقق استُهلك: إعادة الحفظ تطلب تحققًا جديدًا
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'step_up_required');
  assertEquals(h.fetches.length, 0);
  assertEquals(h.st.keySets, 0);
});

Deno.test('المفتاح: 401 من Anthropic = key_rejected بلا حفظ، و503 = key_unverified، والنجاح يحفظ ويسجل وينبه ويرسل للمالكين', async () => {
  const r401 = install({ fetchStatus: 401 });
  r401.grant();
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'key_rejected');
  assertEquals(r401.st.keySets, 0);
  const r503 = install({ fetchStatus: 503 });
  r503.grant();
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'key_unverified');
  const ok = install();
  ok.grant();
  const r: any = await AA.keySet(SUPER, { key: `  ${SECRET} ` });
  assertEquals(r, { success: true, key: { source: 'db', last4: 'CRET', set_at: ok.st.settings.key_set_at, set_by: SUPER.email }, model_ok: true });
  assertEquals(ok.st.keySets, 1);
  assertEquals(ok.fetches[0].url, 'https://api.anthropic.com/v1/models?limit=100');
  assertEquals(ok.fetches[0].headers.get('anthropic-version'), '2023-06-01');
  assertEquals(ok.alerts[0][0], 'agent_key_changed');
  assertEquals(ok.alerts[0][1].last4_after, 'CRET');
  assertEquals(ok.mails.length, 1);
  const audit = ok.audits.find((x) => x[2] === 'agent.key-set');
  assertEquals(audit[6], { last4: 'CRET', method: 'totp', model_ok: true });
});

Deno.test('المفتاح: السادسة في الساعة 429 قبل أي تحقق', async () => {
  const h = install();
  for (let i = 0; i < 5; i++) h.st.attempts.push({ email: SUPER.email, at: Date.now() - 1000 });
  h.grant();
  assertEquals(await code(AA.keySet(SUPER, { key: SECRET })), 'rate');
  // التحقق لم يُستهلك
  assertEquals(h.st.steps[0].consumed, false);
});

Deno.test('حارس التسريب: المفتاح لا يظهر في أي طباعة ولا سجل ولا تنبيه ولا بريد ولا رد، ولا في رد خطأ الحفظ', async () => {
  const printed: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) console[k] = (...a: unknown[]) => { printed.push(a.map((x) => (x instanceof Error ? `${x.name} ${x.message} ${x.stack}` : JSON.stringify(x))).join(' ')); };
  const seen: string[] = [];
  try {
    for (const status of [200, 401, 403, 503]) {
      const h = install({ fetchStatus: status });
      h.grant();
      try { seen.push(JSON.stringify(await AA.keySet(SUPER, { key: SECRET }))); } catch (e) { seen.push(JSON.stringify({ m: (e as Error).message, ...(e as any) })); }
      seen.push(JSON.stringify(h.audits), JSON.stringify(h.alerts), JSON.stringify(h.mails));
    }
    const f = install();
    f.grant();
    f.st.keySetFails = true;
    try { await AA.keySet(SUPER, { key: SECRET }); } catch (e) { seen.push(JSON.stringify({ m: (e as Error).message, ...(e as any) })); }
    seen.push(JSON.stringify(await AA.state(SUPER)));
  } finally { Object.assign(console, orig); }
  const all = [...printed, ...seen].join('\n');
  assert(!all.includes(SECRET), 'المفتاح ظهر');
  assert(!all.includes('0123456789abcdefghij'), 'جزء من المفتاح ظهر');
  assert(!all.includes('sk-ant-env-key'), 'سر الخادم ظهر');
});

Deno.test('الرجوع إلى سر الخادم: بالتحقق الإضافي، ويُرفض بلا سر خادم والمساعد مفعّل إلا بإطفاء صريح', async () => {
  const h = install({ env: { ANTHROPIC_API_KEY: undefined } });
  h.st.settings.has_key = true; h.st.settings.key_last4 = 'abcd'; h.st.settings.enabled = true;
  assertEquals(await code(AA.keyClear(SUPER, {})), 'no_env_key');
  assertEquals(await code(AA.keyClear(SUPER, { force: true })), 'step_up_required');
  h.grant();
  const r: any = await AA.keyClear(SUPER, { force: true });
  assertEquals([r.disabled, h.st.keyClears, h.st.settings.enabled], [true, 1, false]);
  assertEquals(h.alerts[0][0], 'agent_key_reverted');
});

Deno.test('المحادثات: لا عنوان شبكة، والاسم والبريد لمن طلب التواصل وحده، وفتح النص يُسجَّل ويفشل مغلقًا', async () => {
  const h = install();
  const id1 = 'a1b2c3d4-0000-4000-8000-000000000001';
  const id2 = 'b2c3d4e5-0000-4000-8000-000000000002';
  h.st.convs = [
    { id: id1, created_at: new Date().toISOString(), product: 'MI-HOME', locale: 'ar', status: 'bot', ip: '203.0.113.1', contact_request_id: null, contact_name: 'مسرب', contact_email: 'leak@x.sa', total: 2 },
    { id: id2, created_at: new Date().toISOString(), product: 'MI-LEADERS', locale: 'ar', status: 'waiting', ip: '203.0.113.2', contact_request_id: 'c1', contact_name: 'سارة', contact_email: 's@x.sa', total: 2 },
  ];
  const r: any = await AA.conversations(SUPER, { who: 'all' });
  const text = JSON.stringify(r);
  assert(!text.includes('203.0.113') && !text.includes('leak@x.sa') && !text.includes('مسرب'));
  assertEquals(r.rows[0].label, 'زائر');
  assertEquals(r.rows[0].short_id, 'a1b2c3d4');
  assertEquals([r.rows[1].name, r.rows[1].email], ['سارة', 's@x.sa']);
  h.st.msgs = [{ role: 'visitor', body: 'سؤال' }, { role: 'agent', body: 'رد', model: MODEL, input_tokens: 812, cache_read_tokens: 6100, output_tokens: 140, cost_micros: 1100 }];
  const t: any = await AA.transcript(SUPER, { id: id2 });
  assertEquals(t.messages[1].tokens, { input: 812, cache_read: 6100, cache_write: 0, output: 140 });
  assertEquals(h.audits[0].slice(0, 6), ['admin', SUPER.email, 'admin.agent-transcript-view', 'conversations', id2, null]);
  assertEquals(h.audits[0][6], { contact: true });
  (AA.AG as any).auditFails = true;
  await assertRejects(() => AA.transcript(SUPER, { id: id2 }));
});

Deno.test('التقييم: دفعات من 6 حتى النهاية بلا تكرار، والعقد يمنع دفعتين، والنجاح يفتح البوابة، ولا نص رد في السجلات', async () => {
  const printed: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { printed.push(a.map(String).join(' ')); };
  try {
    const h = install();
    const { run_id } = await AA.evalStart(SUPER);
    assertEquals(await code(AA.evalStart(SUPER)), 'eval_running');
    // عقد قائم: دفعة موازية ترد busy
    h.st.runs[0].lease_until = new Date(Date.now() + 60e3).toISOString();
    assertEquals(await code(AA.evalStep(SUPER, { run_id })), 'busy');
    h.st.runs[0].lease_until = null;
    let r: any;
    let steps = 0;
    do { r = await AA.evalStep(SUPER, { run_id }); steps++; } while (!r.done && steps < 30);
    assertEquals(steps, Math.ceil(CASES.length / 6));
    assertEquals(h.st.results.length, CASES.length);
    assertEquals(new Set(h.st.results.map((x) => x.case_id)).size, CASES.length);
    assert(['passed', 'failed'].includes(r.status));
    // إعادة خطوة بعد الانتهاء لا تضيف شيئًا
    await AA.evalStep(SUPER, { run_id });
    assertEquals(h.st.results.length, CASES.length);
    assert(!printed.join('\n').includes('لا أملك معلومة'));
  } finally { console.error = orig; }
});

Deno.test('التقييم: حد التشغيل يوقف قبل الحالة، وامتلاء السقف daily_cap، و401 error/key، وتغير البصمة stale', async () => {
  const cap = install();
  const { run_id } = await AA.evalStart(SUPER);
  cap.st.runs[0].max_micros = 1;
  const r1: any = await AA.evalStep(SUPER, { run_id });
  assertEquals([r1.status, r1.stop_reason, cap.st.results.length], ['stopped', 'max_cost', 0]);

  const full = emptyMem();
  const full2 = install({ ledger: () => memStore(full) });
  const s2 = await AA.evalStart(SUPER);
  for (const k of [...full.spend.keys()]) full.spend.delete(k);
  full.spend.set(new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10), 1_999_999);
  const r2: any = await AA.evalStep(SUPER, { run_id: s2.run_id });
  assertEquals([r2.status, r2.stop_reason], ['stopped', 'daily_cap']);
  assert(full2.st.results.length < 6);

  const bad = install({ model: () => Promise.reject(Object.assign(new Error('invalid'), { status: 401 })) });
  const s3 = await AA.evalStart(SUPER);
  const r3: any = await AA.evalStep(SUPER, { run_id: s3.run_id });
  assertEquals([r3.status, r3.stop_reason], ['error', 'key']);
  assert(bad.st.results.every((x) => x.source !== 'capped'));

  const stale = install();
  const s4 = await AA.evalStart(SUPER);
  stale.st.runs[0].fingerprint = 'old|fp';
  const r4: any = await AA.evalStep(SUPER, { run_id: s4.run_id });
  assertEquals([r4.status, r4.stop_reason], ['stopped', 'stale']);

  // البدء يُرفض حين لا يتسع سقف اليوم
  const busyDay = emptyMem();
  busyDay.spend.set(new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10), 1_950_000);
  install({ ledger: () => memStore(busyDay) });
  assertEquals(await code(AA.evalStart(SUPER)), 'daily_cap');
});

Deno.test('الإنفاق: سلسلة 30 يومًا، والتوفير من الذاكرة المؤقتة بالأسعار، ونصيب الأجوبة الجاهزة', async () => {
  install();
  const u: any = await AA.usage(SUPER);
  assertEquals(u.series.length, 30);
  assertEquals(u.today.cap_micros, 2_000_000);
  assertEquals(u.cache.saved_micros, Math.round(18000 * (0.1 - 0.01) * 1.1));
  assertEquals(u.avg_cost_micros, 1000);
  assertEquals(u.canned_share, 2 / 5);
});
