// التحقق الإضافي (step_up.ts) على قاعدة في الذاكرة ومفاتيح محاكاة: الحراس، ومفتاح مدير آخر، والرمز المعاد، والحد.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { type StepUpDeps, type StepUpSession, stepUp, STEP_UP_TTL_MS, writeAccess } from './step_up.ts';

type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>, fail: Record<string, { code: string }> = {}) {
  const from = (t: string) => {
    tables[t] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    let lim = Infinity;
    const run = () => {
      if (fail[t] && op === 'insert') return { data: null, error: fail[t] };
      // challenge فريد في webauthn_challenges كما في القاعدة: حجز خطوة الرمز يعتمد عليه
      if (op === 'insert' && t === 'webauthn_challenges' && tables[t].some((r) => r.challenge === payload.challenge)) return { data: null, error: { code: '23505' } };
      if (op === 'insert') { tables[t].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload }); return { data: null, error: null }; }
      const rows = tables[t].filter((r) => f.every((x) => x(r)));
      if (op === 'update') { rows.forEach((r) => Object.assign(r, payload)); return { data: rows, error: null }; }
      return { data: rows.slice(0, lim), error: null };
    };
    const q: any = {
      select: () => q, insert: (r: Row) => { op = 'insert'; payload = r; return q; }, update: (r: Row) => { op = 'update'; payload = r; return q; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; }, gte: (k: string, v: string) => { f.push((r) => r[k] >= v); return q; },
      limit: (n: number) => { lim = n; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, bad),
    };
    return q;
  };
  return { from };
}

const ADMIN = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const HASH = 'a'.repeat(64);
const SESSION: StepUpSession = { userId: ADMIN, role: 'super_admin', email: 'o@x.sa', method: 'passkey', passkeyOnly: false };
function setup(over: { tables?: Record<string, Row[]>; fails?: boolean; fail?: Record<string, { code: string }>; step?: bigint | null; verified?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    admin_users: [{ id: ADMIN, totp_enabled: true, totp_secret: 'JBSWY3DPEHPK3PXP' }],
    admin_passkeys: [{ id: 'p1', admin_id: ADMIN, credential_id: 'cred-mine', public_key: '\\x00', sign_count: 1 }, { id: 'p2', admin_id: OTHER, credential_id: 'cred-other', public_key: '\\x00', sign_count: 1 }],
    webauthn_challenges: [], admin_step_ups: [], totp_attempts: [], admin_audit_log: [], ...over.tables,
  };
  const sb = fakeDb(tables, over.fail);
  const d: StepUpDeps = {
    sb, sessionHash: HASH, ip: '203.0.113.5', rpId: 'sunkvalue.com', origins: ['https://admin.test'],
    genOptions: async (o) => ({ challenge: 'chal-1', ...o }),
    verifyAuth: async () => ({ verified: over.verified ?? true, authenticationInfo: { newCounter: 5 } }),
    matchTotp: async (_s, code) => (code === '123456' ? (over.step === undefined ? 1000n : over.step) : null),
    tooManyFails: async () => !!over.fails,
    saveChallenge: async (_sb, challenge, purpose, subject) => { tables.webauthn_challenges.push({ challenge, purpose, subject }); },
    takeChallenge: async (_sb, challenge, purpose) => tables.webauthn_challenges.find((c) => c.challenge === challenge && c.purpose === purpose) ?? null,
    challengeFlood: async () => false,
    challengeOf: (r) => String((r as Row)?.challenge || ''),
    fromBytea: () => new Uint8Array(1),
  };
  return { tables, d };
}

Deno.test('الحراس: المدير الأعلى وحده، وجلسة رمز البريد ترد reauth_second_factor، والغرض مقيد', async () => {
  const { d } = setup();
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, { ...SESSION, role: 'admin' }, d)).body.code, 'super_required');
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, { ...SESSION, method: 'email' }, d)).body.code, 'reauth_second_factor');
  assertEquals((await stepUp('step-up-totp', { purpose: 'other', code: '123456' }, SESSION, d)).status, 400);
});

Deno.test('step-up-totp: صف مربوط بهاش الجلسة صالح 5 دقائق، والرمز نفسه مرفوض ثانية، وpasskey_only مرفوض، والحد محترم', async () => {
  const { tables, d } = setup();
  const t0 = Date.now();
  const ok = await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, d);
  assertEquals(ok.status, 200);
  assertEquals(tables.admin_step_ups.length, 1);
  const row = tables.admin_step_ups[0];
  assertEquals([row.session_hash, row.admin_id, row.method, row.totp_step, row.purpose], [HASH, ADMIN, 'totp', 1000, 'agent_key']);
  const ttl = Date.parse(row.expires_at) - t0;
  assert(ttl > STEP_UP_TTL_MS - 2000 && ttl <= STEP_UP_TTL_MS + 2000);
  const again = await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, d);
  assertEquals([again.status, again.body.code], [409, 'replay']);
  assertEquals(tables.admin_step_ups.length, 1);
  const bad = await stepUp('step-up-totp', { purpose: 'agent_key', code: '000000' }, SESSION, d);
  assertEquals([bad.status, bad.body.code], [403, 'bad_code']);
  assertEquals(tables.totp_attempts.map((x) => x.success), [true, false, false]);
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, { ...SESSION, passkeyOnly: true }, d)).body.code, 'reauth_passkey');
  const limited = setup({ fails: true });
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, limited.d)).status, 429);
  assertEquals(limited.tables.admin_step_ups.length, 0);
  // كل نجاح وفشل في السجل
  assert(tables.admin_audit_log.some((x) => x.action === 'step-up' && x.meta.ok === true));
  assert(tables.admin_audit_log.some((x) => x.meta.why === 'replay'));
});

Deno.test('step-up-verify: مفتاح مدير آخر مرفوض، والتحدي لهذا المدير وحده، والنجاح يكتب صف passkey', async () => {
  const { tables, d } = setup();
  const opts = await stepUp('step-up-options', { purpose: 'agent_key' }, SESSION, d);
  assertEquals(opts.status, 200);
  assertEquals(((opts.body.options as Row).allowCredentials as Row[]).map((c) => c.id), ['cred-mine']);
  assertEquals((opts.body.options as Row).userVerification, 'required');
  assertEquals(tables.webauthn_challenges[0].purpose, 'step_up');
  const foreign = await stepUp('step-up-verify', { purpose: 'agent_key', response: { id: 'cred-other', challenge: 'chal-1' } }, SESSION, d);
  assertEquals([foreign.status, foreign.body.code], [403, 'foreign_passkey']);
  // تحدٍّ صدر لمدير آخر لا يصلح لهذه الجلسة
  tables.webauthn_challenges.push({ challenge: 'chal-x', purpose: 'step_up', subject: OTHER });
  assertEquals((await stepUp('step-up-verify', { purpose: 'agent_key', response: { id: 'cred-mine', challenge: 'chal-x' } }, SESSION, d)).status, 400);
  const ok = await stepUp('step-up-verify', { purpose: 'agent_key', response: { id: 'cred-mine', challenge: 'chal-1' } }, SESSION, d);
  assertEquals(ok.status, 200);
  assertEquals(tables.admin_step_ups.map((x) => x.method), ['passkey']);
  assertEquals(tables.admin_passkeys[0].sign_count, 5);
  const noKeys = setup({ tables: { admin_passkeys: [] } });
  assertEquals((await stepUp('step-up-options', { purpose: 'agent_key' }, SESSION, noKeys.d)).body.code, 'no_passkey');
  const failed = setup({ verified: false });
  await stepUp('step-up-options', { purpose: 'agent_key' }, SESSION, failed.d);
  assertEquals((await stepUp('step-up-verify', { purpose: 'agent_key', response: { id: 'cred-mine', challenge: 'chal-1' } }, SESSION, failed.d)).status, 400);
  assertEquals(failed.tables.admin_step_ups.length, 0);
});

Deno.test('قبل الترحيل: step_up_unavailable لا خطأ داخلي', async () => {
  const { d } = setup({ fail: { admin_step_ups: { code: '42P01' } } });
  const r = await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, d);
  assertEquals([r.status, r.body.code], [503, 'step_up_unavailable']);
});

Deno.test('step-up-totp: طلبان معًا بالرمز نفسه، والفهرس الفريد يرد 23505 للثاني فيُرفض replay بلا صف', async () => {
  const { tables, d } = setup({ fail: { admin_step_ups: { code: '23505' } } });
  const r = await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, d);
  assertEquals([r.status, r.body.code], [409, 'replay']);
  assertEquals(tables.admin_step_ups.length, 0);
  assert(tables.admin_audit_log.some((x) => x.meta.why === 'replay'));
});

// ── فعّل الكتابة (المرحلة 2 من تصور لوحة الإدارة): جلسة رمز البريد ترتفع بعامل ثانٍ في مكانها ──
const EMAIL: StepUpSession = { ...SESSION, role: 'admin', method: 'email' };
const sessRow = (method = 'email') => ({ token_hash: HASH, kind: 'admin', subject: ADMIN, meta: { method, email: 'o@x.sa', auth_at: 1, ip: '1.1.1.1' } });

Deno.test('writeAccess: المراقب لا يكتب أبدًا، والمدير بجلسة رمز البريد يقرأ ويستطيع التفعيل، والعامل الثاني يكتب', () => {
  assertEquals(writeAccess('viewer', 'passkey'), { can_write: false, can_elevate: false, read_only_reason: 'role' });
  assertEquals(writeAccess('admin', 'email'), { can_write: false, can_elevate: true, read_only_reason: 'second_factor' });
  assertEquals(writeAccess('super_admin', 'email'), { can_write: false, can_elevate: true, read_only_reason: 'second_factor' });
  for (const m of ['passkey', 'totp']) for (const r of ['admin', 'super_admin']) assertEquals(writeAccess(r, m), { can_write: true, can_elevate: false, read_only_reason: null });
  // جلسة قديمة بلا طريقة مسجلة تُعامل كرمز البريد في الحارسين معًا (leaders-api/write_parity_test.ts)
  assertEquals(writeAccess('super_admin', '').can_write, false);
});

Deno.test('فعّل الكتابة بالرمز: جلسة رمز البريد نفسها تصير totp، بلا صف في admin_step_ups، والرمز نفسه لا يُقبل ثانية', async () => {
  const { tables, d } = setup({ tables: { api_sessions: [sessRow()] } });
  const r = await stepUp('step-up-totp', { purpose: 'write', code: '123456' }, EMAIL, d);
  assertEquals([r.status, r.body.elevated, r.body.method], [200, true, 'totp']);
  const m = tables.api_sessions[0].meta;
  assertEquals([m.method, m.elevated_from, m.email, m.ip], ['totp', 'email', 'o@x.sa', '1.1.1.1']);
  assert(m.auth_at > 1 && m.elevated_at === m.auth_at);
  assertEquals(tables.admin_step_ups.length, 0);
  assert(tables.admin_audit_log.some((x) => x.action === 'step-up' && x.meta.purpose === 'write' && x.meta.ok === true && x.meta.totp_step === 1000));
  // الرمز نفسه لجلسة أخرى بالبريد: replay
  const again = await stepUp('step-up-totp', { purpose: 'write', code: '123456' }, EMAIL, d);
  assertEquals([again.status, again.body.code], [409, 'replay']);
  // ولا يؤكد مفتاح المساعد بعده
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, d)).body.code, 'replay');
});

Deno.test('فعّل الكتابة بالبصمة: مفتاح هذا المدير وحده، والفشل لا يغيّر الجلسة', async () => {
  const { tables, d } = setup({ tables: { api_sessions: [sessRow()] } });
  assertEquals((await stepUp('step-up-options', { purpose: 'write' }, EMAIL, d)).status, 200);
  const foreign = await stepUp('step-up-verify', { purpose: 'write', response: { id: 'cred-other', challenge: 'chal-1' } }, EMAIL, d);
  assertEquals(foreign.body.code, 'foreign_passkey');
  assertEquals(tables.api_sessions[0].meta.method, 'email');
  const ok = await stepUp('step-up-verify', { purpose: 'write', response: { id: 'cred-mine', challenge: 'chal-1' } }, EMAIL, d);
  assertEquals([ok.status, ok.body.method], [200, 'passkey']);
  assertEquals(tables.api_sessions[0].meta.method, 'passkey');
  assertEquals(tables.admin_step_ups.length, 0);
  const failed = setup({ verified: false, tables: { api_sessions: [sessRow()] } });
  await stepUp('step-up-options', { purpose: 'write' }, EMAIL, failed.d);
  assertEquals((await stepUp('step-up-verify', { purpose: 'write', response: { id: 'cred-mine', challenge: 'chal-1' } }, EMAIL, failed.d)).status, 400);
  assertEquals(failed.tables.api_sessions[0].meta.method, 'email');
});

Deno.test('فعّل الكتابة: المراقب مرفوض، وجلسة العامل الثاني لا تُكتب، والجلسة الغائبة 401، وpasskey_only بالرمز مرفوض', async () => {
  const { tables, d } = setup({ tables: { api_sessions: [sessRow('passkey')] } });
  assertEquals((await stepUp('step-up-totp', { purpose: 'write', code: '123456' }, { ...EMAIL, role: 'viewer' }, d)).body.code, 'forbidden');
  const already = await stepUp('step-up-totp', { purpose: 'write', code: '123456' }, { ...EMAIL, method: 'passkey' }, d);
  assertEquals([already.status, already.body.already], [200, true]);
  assertEquals(tables.totp_attempts.length, 0);
  const gone = setup({ tables: { api_sessions: [] } });
  assertEquals((await stepUp('step-up-totp', { purpose: 'write', code: '123456' }, EMAIL, gone.d)).status, 401);
  assertEquals((await stepUp('step-up-totp', { purpose: 'write', code: '123456' }, { ...EMAIL, passkeyOnly: true }, d)).body.code, 'reauth_passkey');
});

Deno.test('الرمز نفسه في طلبين معًا: جلستا بريد للمدير نفسه، تُرفع إحداهما وحدها، ولو امتلأ سجل التدقيق بمحاولات فاشلة', async () => {
  const OTHER_HASH = 'b'.repeat(64);
  const noise = Array.from({ length: 80 }, () => ({ user_id: ADMIN, action: 'step-up', created_at: new Date().toISOString(), meta: { purpose: 'write', ok: false, why: 'challenge' } }));
  const { tables, d } = setup({ tables: { api_sessions: [sessRow(), { ...sessRow(), token_hash: OTHER_HASH }], admin_audit_log: noise } });
  const d2 = { ...d, sessionHash: OTHER_HASH };
  const [a, b] = await Promise.all([
    stepUp('step-up-totp', { purpose: 'write', code: '123456' }, EMAIL, d),
    stepUp('step-up-totp', { purpose: 'write', code: '123456' }, EMAIL, d2),
  ]);
  assertEquals([a.status, b.status].sort(), [200, 409]);
  assertEquals(tables.api_sessions.filter((x) => x.meta.method === 'totp').length, 1);
  // العلامة مستهلكة ومنتهية عند كتابتها: لا يأخذها takeChallenge الحقيقي (consumed_at is null)
  const mark = tables.webauthn_challenges.find((x) => String(x.challenge).startsWith('totp-step:'));
  assertEquals([mark?.purpose, mark?.subject, typeof mark?.consumed_at], ['step_up', ADMIN, 'string']);
  // وغرض المفتاح بعدها بالرمز نفسه replay، ورمز الخطوة التالية يمر
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, d)).body.code, 'replay');
  const next = setup({ step: 1001n, tables: { webauthn_challenges: tables.webauthn_challenges } });
  assertEquals((await stepUp('step-up-totp', { purpose: 'agent_key', code: '123456' }, SESSION, next.d)).status, 200);
});
