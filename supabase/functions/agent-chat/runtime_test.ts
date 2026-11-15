// حالة المساعد الفعلية من اللوحة ومفتاح الطوارئ (runtime.ts)، وربط العميل بمفتاحه (model.ts)، وأثرهما في الدالة كاملة.
import { assert, assertEquals, assertNotMatch } from 'jsr:@std/assert@1';
import { decide, envMode, keyErrorCode, readRuntime, resetRuntime, RUNTIME_FAIL_TTL_MS, RUNTIME_TTL_MS, type Runtime, type RuntimeRow } from './runtime.ts';
import { anthropic, resetClient, streamAnswer } from './model.ts';
import { type Deps, type Env, handle } from './handler.ts';
import { emptyMem, memStore } from './mem_store.ts';
import { computeVersions, versions } from './version.ts';

const FP = 'claude-haiku-5-5|v|p|c';
const env = (mode?: string, envKey = '') => ({ mode, envKey, fingerprint: async () => FP });
const rpcOf = (row: RuntimeRow | null, error: unknown = null) => {
  const calls = { n: 0 };
  const fn = () => { calls.n++; return Promise.resolve({ data: row ? [row] : [], error }); };
  return { fn, calls };
};

Deno.test('envMode: غير المضبوط وon و1 وtrue تترك الحكم للقاعدة، وما سواها مفتاح طوارئ يطفئ', () => {
  for (const v of [undefined, '', 'on', 'ON', '1', 'true', ' True ']) assertEquals(envMode(v), 'allow', String(v));
  for (const v of ['off', '0', 'false', 'no', 'enabled', 'yes']) assertEquals(envMode(v), 'off', v);
});

Deno.test('الجدول كاملًا: الطوارئ تغلب القاعدة، والقاعدة الافتراضية مطفأة، والبصمة المختلفة تطفئ، والتعذر يطفئ', () => {
  const on: RuntimeRow = { enabled: true, enabled_fingerprint: FP, api_key: null };
  assertEquals(decide(on, { mode: 'off', envKey: '' }, FP, true).reason, 'env_off');
  assertEquals(decide({ ...on, enabled: false }, { mode: 'allow', envKey: '' }, FP, true).reason, 'db_off');
  assertEquals(decide({ ...on, enabled_fingerprint: 'other' }, { mode: 'allow', envKey: '' }, FP, true).reason, 'stale');
  assertEquals(decide(null, { mode: 'allow', envKey: 'sk-env' }, FP, false), { enabled: false, reason: 'unavailable', apiKey: 'sk-env', keySource: 'env' });
  const ok = decide(on, { mode: 'allow', envKey: '' }, FP, true);
  assertEquals(ok.enabled, true);
  assertEquals(ok.reason, null);
});

Deno.test('المفتاح: من القاعدة أولًا، والبيئة احتياط، ولا مفتاح = فارغ بلا مصدر', () => {
  const row: RuntimeRow = { enabled: true, enabled_fingerprint: FP, api_key: 'sk-ant-db' };
  assertEquals(decide(row, { mode: 'allow', envKey: 'sk-env' }, FP, true).apiKey, 'sk-ant-db');
  assertEquals(decide(row, { mode: 'allow', envKey: 'sk-env' }, FP, true).keySource, 'db');
  assertEquals(decide({ ...row, api_key: null }, { mode: 'allow', envKey: 'sk-env' }, FP, true).keySource, 'env');
  assertEquals(decide({ ...row, api_key: null }, { mode: 'allow', envKey: '' }, FP, true), { enabled: true, reason: null, apiKey: '', keySource: null });
});

Deno.test('الخزن: 60 ثانية للنجاح و15 للفشل، وبعدها تُقرأ القاعدة من جديد', async () => {
  resetRuntime();
  const ok = rpcOf({ enabled: true, enabled_fingerprint: FP, api_key: null });
  const t0 = 1_000_000;
  assertEquals((await readRuntime(ok.fn, env(), t0)).enabled, true);
  await readRuntime(ok.fn, env(), t0 + RUNTIME_TTL_MS - 1);
  assertEquals(ok.calls.n, 1);
  await readRuntime(ok.fn, env(), t0 + RUNTIME_TTL_MS + 1);
  assertEquals(ok.calls.n, 2);
  resetRuntime();
  const bad = rpcOf(null, { code: 'PGRST202', message: 'Could not find the function' });
  assertEquals((await readRuntime(bad.fn, env(undefined, 'sk-env'), t0)).reason, 'unavailable');
  await readRuntime(bad.fn, env(), t0 + RUNTIME_FAIL_TTL_MS - 1);
  assertEquals(bad.calls.n, 1);
  await readRuntime(bad.fn, env(), t0 + RUNTIME_FAIL_TTL_MS + 1);
  assertEquals(bad.calls.n, 2);
  resetRuntime();
  // رمي غير متوقع يفشل مغلقًا كذلك
  const r = await readRuntime(() => Promise.reject(new Error('boom')), env(), t0);
  assertEquals(r.enabled, false);
  resetRuntime();
});

Deno.test('تصنيف خطأ المفتاح برموز مقيدة', () => {
  assertEquals(keyErrorCode({ status: 401 }), 'http_401');
  assertEquals(keyErrorCode({ status: 503 }), 'http_5xx');
  assertEquals(keyErrorCode({ status: 418 }), 'network');
  assertEquals(keyErrorCode(Object.assign(new Error('x'), { name: 'AbortError' })), 'timeout');
  assertEquals(keyErrorCode(new TypeError('fetch failed')), 'network');
});

Deno.test('العميل يُبنى من جديد حين يتغير المفتاح: الطلب التالي يحمل المفتاح الجديد', async () => {
  resetClient();
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => h.set(k, v));
    // SDK 1.4.0 يرسل المفتاح في Authorization: Bearer
    seen.push(h.get('authorization') || h.get('x-api-key') || '');
    const body = [
      { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  }) as typeof fetch;
  try {
    const a = anthropic('sk-ant-old-key');
    assert(anthropic('sk-ant-old-key') === a);
    await streamAnswer('sk-ant-old-key', 'claude-haiku-5-5', [{ role: 'user', content: 'x' }], () => {});
    await streamAnswer('sk-ant-new-key', 'claude-haiku-5-5', [{ role: 'user', content: 'x' }], () => {});
    assertEquals(seen, ['Bearer sk-ant-old-key', 'Bearer sk-ant-new-key']);
    assert(anthropic('sk-ant-new-key') !== a);
  } finally { globalThis.fetch = real; resetClient(); }
});

// ── الدالة كاملة بحالة محقونة ──
const ENV: Env = { apiKey: '', model: 'claude-haiku-5-5', capCents: 200, enabled: false, turnstileSecret: 's', turnstileSite: 'site', adminEmail: '' };
function setup(state: { rt: Runtime }, fail?: unknown) {
  const m = emptyMem();
  const seen = { keys: [] as string[], status: [] as [boolean, string | null, string | null][], alerts: [] as string[] };
  const deps: Deps = {
    store: memStore(m), env: ENV, clientIp: () => '203.0.113.7', turnstile: async () => true, notifyAdmin: async () => {},
    alert: async (k) => { seen.alerts.push(k); return true; },
    runtime: async () => state.rt,
    keyStatus: async (ok, code, source) => { seen.status.push([ok, code, source]); },
    model: async (_m, onText, _s, apiKey) => {
      seen.keys.push(String(apiKey));
      if (fail) throw fail;
      onText('برنامج القادة رحلة تطوير.');
      return { text: 'برنامج القادة رحلة تطوير.', stopReason: 'end_turn', model: 'claude-haiku-5-5', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
    },
  };
  return { m, deps, seen };
}
const post = (d: Deps, b: Record<string, unknown>) => handle(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }), d);
const ON: Runtime = { enabled: true, reason: null, apiKey: 'sk-ant-db-key', keySource: 'db' };
const settle = () => new Promise((r) => setTimeout(r, 5));

Deno.test('status وstart وsend تحترم الحالة الفعلية: الإطفاء من اللوحة يوقف الإرسال في محادثة مفتوحة', async () => {
  const state = { rt: ON };
  const s = setup(state);
  assertEquals((await (await post(s.deps, { action: 'status' })).json()).enabled, true);
  const { token } = await (await post(s.deps, { action: 'start', captcha: 'ok' })).json();
  const body = await (await post(s.deps, { action: 'send', token, message: 'أريد تفاصيل مراحل البرنامج بالترتيب' })).text();
  assert(body.includes('event: done'));
  // المفتاح الذي وصل النموذج هو مفتاح القاعدة
  assertEquals(s.seen.keys, ['sk-ant-db-key']);
  await settle();
  assertEquals(s.seen.status, [[true, null, 'db']]);
  state.rt = { ...ON, enabled: false, reason: 'db_off' };
  const st = await (await post(s.deps, { action: 'status' })).json();
  assertEquals(st, { success: true, enabled: false, site_key: null });
  const r = await post(s.deps, { action: 'send', token, message: 'سؤال آخر عن المراحل' });
  assertEquals(r.status, 503);
  assertEquals((await r.json()).code, 'agent_off');
  assertEquals((await post(s.deps, { action: 'start', captcha: 'ok' })).status, 503);
  assertEquals(s.seen.keys.length, 1);
});

Deno.test('البصمة القديمة: مطفأ وتنبيه agent_eval_stale مرة في اليوم، بلا سبب للزائر', async () => {
  const s = setup({ rt: { ...ON, enabled: false, reason: 'stale' } });
  for (let i = 0; i < 3; i++) {
    const st = await (await post(s.deps, { action: 'status' })).json();
    assertNotMatch(JSON.stringify(st), /stale|reason/);
  }
  await settle();
  assertEquals(s.seen.alerts, ['agent_eval_stale']);
});

Deno.test('401 بمفتاح القاعدة: حالة المفتاح http_401، وتنبيه الإعداد بمصدر المفتاح، ولا استدعاء بلا مفتاح', async () => {
  const s = setup({ rt: ON }, Object.assign(new Error('invalid x-api-key'), { status: 401, name: 'AuthenticationError' }));
  const { token } = await (await post(s.deps, { action: 'start', captcha: 'ok' })).json();
  const body = await (await post(s.deps, { action: 'send', token, message: 'أريد تفاصيل مراحل البرنامج بالترتيب' })).text();
  assert(body.includes('event: capped'));
  await settle();
  assertEquals(s.seen.status, [[false, 'http_401', 'db']]);
  assertEquals(s.seen.alerts, ['agent_model_config']);
  const none = setup({ rt: { ...ON, apiKey: '', keySource: null } });
  const t2 = (await (await post(none.deps, { action: 'start', captcha: 'ok' })).json()).token;
  const b2 = await (await post(none.deps, { action: 'send', token: t2, message: 'أريد تفاصيل مراحل البرنامج بالترتيب' })).text();
  assert(b2.includes('event: capped'));
  assertEquals(none.seen.keys.length, 0);
});

Deno.test('البصمة ثابتة لنفس المدخلات، وتتغير بالموجه أو المعرفة أو الحالات أو النموذج', async () => {
  const a = await computeVersions('claude-haiku-5-5');
  assertEquals(a, await computeVersions('claude-haiku-5-5'));
  assertEquals((await versions('claude-haiku-5-5')).fingerprint, a.fingerprint);
  assert(a.fingerprint.length <= 80);
  assertEquals(a.prompt_version.length, 16);
  for (const other of [
    await computeVersions('claude-sonnet-5-5'), await computeVersions('claude-haiku-5-5', { rules: 'قاعدة أخرى' }),
    await computeVersions('claude-haiku-5-5', { knowledge: 'v2-x' }), await computeVersions('claude-haiku-5-5', { cases: '{"cases":[]}' }),
  ]) assert(other.fingerprint !== a.fingerprint);
  // معرّف نموذج طويل: البصمة لا تُقص فتُسقط نسخة الحالات، وتبقى ضمن 80 حرفًا
  const LONG = 'claude-sonnet-5-5-20261101-preview-long';
  const l1 = await computeVersions(LONG);
  const l2 = await computeVersions(LONG, { cases: '{"cases":[1]}' });
  assert(l1.fingerprint.length <= 80 && l2.fingerprint.length <= 80);
  assert(l1.fingerprint !== l2.fingerprint);
});
