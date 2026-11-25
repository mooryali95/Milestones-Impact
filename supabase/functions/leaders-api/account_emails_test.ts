// حساب واحد بأكثر من بريد (ترحيل 20261128190000): كل طريق دخول يجد الحساب بالبريد البديل، والرمز يُرسل إلى البريد البديل نفسه،
// والرد لا يكشف أن للحساب بريدًا آخر. والربط الإداري: معاينة ببصمة، والتطبيق بها وحدها، والباقي من دخل آخر مرة.
import './_test_env.ts';
Deno.env.set('RESEND_API_KEY', 're_test');
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1.0.19';
// المفتاح قبل أول استيراد لـ core.ts (يُقرأ عند الإقلاع)، فالاستيرادات كلها بعده
const { installFake } = await import('./_fake_db.ts');
const P = await import('./participant.ts');
const AE = await import('./account-emails.ts');
const { rolesOf } = await import('./doors.ts');
const { hash, issuePass } = await import('./core.ts');
const { GOOGLE_CLIENT_ID } = await import('../_shared/sites.js');
// المفتاح قُرئ في CONFIG، ويُحذف فلا يتسرب إلى ملفات الاختبار التالية في العملية نفسها (ops_health_test يقرأ أسماء الأسرار)
Deno.env.delete('RESEND_API_KEY');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const KEPT = U(880001), OLD = U(880002);
const ADMIN = { email: 'a@example.test', role: 'admin' as const, method: 'passkey' };
const kept = { id: KEPT, full_name: 'مشارك واحد', email: 'main@example.test', phone: '+966501111111', status: 'registered', is_demo: false, is_test: false,
  email_verified_at: '2026-11-01T00:00:00Z', last_login_at: '2026-11-20T00:00:00Z', created_at: '2026-10-01T00:00:00Z', organization_id: null };
const other = { ...kept, id: OLD, full_name: 'مشارك ثان', email: 'second@example.test', phone: '05' + '01111111',   // يُركَّب فلا يُقرأ رقمًا منشورًا (single-source.test.js)
  last_login_at: '2026-11-02T00:00:00Z', created_at: '2026-10-02T00:00:00Z' };

// البريد المرسل: يُلتقط نداء Resend
const sent: { to: string; subject: string }[] = [];
const b64url = (b: Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
globalThis.fetch = ((input: unknown, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('googleapis') || url.includes('google')) {
    return Promise.resolve(new Response(JSON.stringify({ keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: 'k1', alg: 'RS256', use: 'sig' }] }), { headers: { 'cache-control': 'max-age=3600' } }));
  }
  try { const body = JSON.parse(String(init?.body || '{}')); sent.push({ to: [body.to].flat()[0], subject: body.subject }); } catch { /* ليس بريدًا */ }
  return Promise.resolve(new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
}) as typeof fetch;
async function googleToken(email: string) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub: '1', email, email_verified: true, name: 'Participant', exp: Math.floor(Date.now() / 1000) + 600 }));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}

function world(rpc?: any) {
  return installFake({
    participants: [structuredClone(kept), structuredClone(other)],
    participant_emails: [{ id: U(1), participant_id: KEPT, email: 'alias@example.test', verified_at: null, source: 'migration', created_at: '2026-11-25T00:00:00Z' }],
    email_challenges: [], experts: [], org_coordinators: [], audit_log: [], auth_sessions: [], enrollments: [], cohorts: [], cohort_placements: [],
    consent_events: [], mail_events: [], mail_queue: [], organizations: [], passkeys: [], participant_observations: [], nudges: [],
  }, { rpc });
}
async function challenge(w: any, email: string, purpose = 'login') {
  const link = `link-${Math.random()}`;
  w.tables.email_challenges.push({ id: crypto.randomUUID(), email, purpose, code_hash: await hash('123456'), link_token_hash: await hash(link),
    pending_profile: null, attempts: 0, consumed_at: null, expires_at: new Date(Date.now() + 6e5).toISOString(), created_at: new Date().toISOString() });
  return link;
}
const ctx = { ip: null, ua: 'test' } as any;
const sessionOwner = (w: any) => w.tables.auth_sessions.at(-1)?.participant_id;

Deno.test('البحث بالبريد: الأساسي ثم البديل، وغير المعروف لا شيء', async () => {
  const w = world();
  try {
    assertEquals((await AE.participantByEmail('MAIN@example.test'))?.id, KEPT);
    assertEquals((await AE.participantByEmail(' alias@example.test '))?.id, KEPT);
    assertEquals(await AE.participantByEmail('nobody@example.test'), null);
  } finally { w.restore(); }
});

Deno.test('طلب الرمز بالبريد البديل: يُرسل إلى البديل نفسه دخولًا لا تسجيلًا، والرد كرد أي بريد', async () => {
  const w = world();
  try {
    sent.length = 0;
    const alias = await P.authStart({ email: 'alias@example.test', pass: await issuePass('alias@example.test') }, ctx);
    const fresh = await P.authStart({ email: 'brand-new@example.test', pass: await issuePass('brand-new@example.test') }, ctx);
    assertEquals(alias, fresh);
    assertEquals(alias, { success: true, sent: true });
    const ch = w.tables.email_challenges.find((c: Row) => c.email === 'alias@example.test');
    assertEquals(ch?.purpose, 'login');
    assert(sent.some((m) => m.to === 'alias@example.test'), JSON.stringify(sent));
    assert(!sent.some((m) => m.to === 'main@example.test'), 'لا بريد إلى الأساسي');
  } finally { w.restore(); }
});

Deno.test('التحقق بالرمز وبالرابط السحري من البريد البديل يُدخل الحساب المرتبط ويوثّق البديل', async () => {
  const w = world();
  try {
    await challenge(w, 'alias@example.test');
    // الجلسة تُصدر قبل حمولة الرحلة (mePayload تحتاج برنامجًا كاملًا ليس في هذه القاعدة)، فيُختبر صاحب الجلسة
    await P.authVerify({ email: 'alias@example.test', code: '123456' }, ctx).catch(() => null);
    assertEquals(sessionOwner(w), KEPT);
    assertEquals(w.tables.email_challenges[0].consumed_at !== null, true);
    assertEquals(w.tables.participants.length, 2, 'لا حساب جديد');
    assertNotEquals(w.tables.participant_emails[0].verified_at, null);
    const link = await challenge(w, 'alias@example.test');
    const before = w.tables.auth_sessions.length;
    await P.authVerify({ email: 'alias@example.test', link }, ctx).catch(() => null);
    assertEquals(w.tables.auth_sessions.length, before + 1);
    assertEquals(sessionOwner(w), KEPT);
  } finally { w.restore(); }
});

Deno.test('الدخول بحساب Google ببريد بديل يُدخل الحساب المرتبط ولا ينشئ حسابًا', async () => {
  const w = world();
  try {
    const r: any = await P.authGoogle({ credential: await googleToken('alias@example.test') }, ctx).catch((e) => e);
    assert(r?.confirm_new !== true, 'لا يُعرض إنشاء حساب جديد');
    assertEquals(sessionOwner(w), KEPT);
    assertEquals(w.tables.participants.length, 2);
  } finally { w.restore(); }
});

Deno.test('أبواب البريد (التبديل والبوابة الصحيحة): البديل يفتح باب المشارك', async () => {
  const w = world();
  try {
    assertEquals(await rolesOf('alias@example.test'), ['participant']);
  } finally { w.restore(); }
});

Deno.test('الربط الإداري: من دخل آخر مرة يبقى، والمعاينة ببصمة، والتطبيق بغيرها stale، والتطبيق بها يدمج ويسجّل participant.link', async () => {
  const calls: any[] = [];
  const w = world((name: string, args: any) => {
    calls.push([name, args]);
    if (name === 'merge_preview') return { data: { summary: { enrollments: { moved: 1 }, participant_emails: { inserted: 1 } }, fingerprint: 'f1' }, error: null };
    if (name === 'merge_participants') return { data: U(9), error: null };
    return null;
  });
  try {
    // من ملف الحساب الأقدم دخولًا، ببريد الآخر البديل: الباقي هو الأحدث دخولًا أيًا كان من فُتح ملفه
    const plan: any = await AE.linkPreview(ADMIN as any, { participant_id: OLD, other: 'alias@example.test' });
    assertEquals([plan.kept.id, plan.merged.id], [KEPT, OLD]);
    assertEquals(calls[0], ['merge_preview', { p_keep: KEPT, p_dup: OLD }]);
    assertEquals(plan.summary.enrollments, { moved: 1 });
    const stale: any = await AE.linkApply(ADMIN as any, { participant_id: OLD, other: KEPT, plan_hash: 'x' }).catch((e) => e);
    assertEquals(stale.code, 'stale');
    assert(!calls.some((c) => c[0] === 'merge_participants'));
    const done: any = await AE.linkApply(ADMIN as any, { participant_id: OLD, other: KEPT, plan_hash: plan.plan_hash });
    assertEquals([done.kept_id, done.merged_id], [KEPT, OLD]);
    assertEquals(calls.at(-1), ['merge_participants', { p_keep: KEPT, p_dup: OLD, p_actor: ADMIN.email, p_actor_type: 'admin', p_source: 'admin_link' }]);
    const log = w.tables.audit_log.find((x: Row) => x.action === 'participant.link');
    assertEquals(log?.after?.kept_id, KEPT);
    const self: any = await AE.linkPreview(ADMIN as any, { participant_id: KEPT, other: 'alias@example.test' }).catch((e) => e);
    assertEquals(self.code, 'merge_same');
  } finally { w.restore(); }
});

Deno.test('الربط الإداري: رفض القاعدة يُترجم إلى رسالة واضحة لا خطأ خادم', async () => {
  const w = world(() => ({ data: null, error: { code: 'P0001', message: 'merge_kept_inactive: الحساب الباقي موقوف أو منسحب' } }));
  try {
    const e: any = await AE.linkPreview(ADMIN as any, { participant_id: OLD, other: KEPT }).catch((x) => x);
    assertEquals([e.status, e.code], [409, 'merge_kept_inactive']);
  } finally { w.restore(); }
});

Deno.test('البريد البديل: قائمة الملف، والحذف، و«اجعله أساسيًا» بدالة القاعدة', async () => {
  const calls: any[] = [];
  const w = world((name: string, args: any) => { calls.push([name, args]); return { data: null, error: null }; });
  try {
    const list: any = await AE.adminEmails(ADMIN as any, { participant_id: KEPT });
    assertEquals(list.primary.email, 'main@example.test');
    assertEquals(list.alternates.map((x: Row) => x.email), ['alias@example.test']);
    await AE.emailMakePrimary(ADMIN as any, { participant_id: KEPT, email: 'alias@example.test' });
    assertEquals(calls[0], ['participant_email_make_primary', { p_participant: KEPT, p_email: 'alias@example.test' }]);
    await AE.emailRemove(ADMIN as any, { participant_id: KEPT, email: 'alias@example.test' });
    assertEquals(w.tables.participant_emails.length, 0);
    const again: any = await AE.emailRemove(ADMIN as any, { participant_id: KEPT, email: 'alias@example.test' }).catch((e) => e);
    assertEquals(again.code, 'not_alias');
    assert(w.tables.audit_log.some((x: Row) => x.action === 'participant.email-remove'));
  } finally { w.restore(); }
});

Deno.test('الربط الإداري: هاتفان مختلفان أو غائبان يتطلبان تأكيدًا صريحًا باسم الحساب الآخر مكتوبًا', async () => {
  const calls: any[] = [];
  const w = world((name: string) => {
    calls.push(name);
    if (name === 'merge_preview') return { data: { summary: {}, fingerprint: 'f2' }, error: null };
    if (name === 'merge_participants') return { data: U(9), error: null };
    return null;
  });
  try {
    w.tables.participants[1].phone = null;
    const plan: any = await AE.linkPreview(ADMIN as any, { participant_id: KEPT, other: OLD });
    assertEquals([plan.same_phone, plan.confirm_name], [false, 'مشارك ثان']);
    const bare: any = await AE.linkApply(ADMIN as any, { participant_id: KEPT, other: OLD, plan_hash: plan.plan_hash }).catch((e) => e);
    assertEquals(bare.code, 'confirm_different');
    const wrong: any = await AE.linkApply(ADMIN as any, { participant_id: KEPT, other: OLD, plan_hash: plan.plan_hash, confirm_different: true, confirm_name: 'غيره' }).catch((e) => e);
    assertEquals(wrong.code, 'confirm_different');
    assert(!calls.includes('merge_participants'));
    const ok: any = await AE.linkApply(ADMIN as any, { participant_id: KEPT, other: OLD, plan_hash: plan.plan_hash, confirm_different: true, confirm_name: ' مشارك ثان ' });
    assertEquals(ok.kept_id, KEPT);
  } finally { w.restore(); }
});

Deno.test('البصمة تتغير بتغيّر بصمة القاعدة (صف سيُمس تغيّر) ولو بقيت الأعداد نفسها', async () => {
  let fp = 'a';
  const w = world((name: string) => (name === 'merge_preview' ? { data: { summary: { enrollments: { moved: 1 } }, fingerprint: fp }, error: null } : { data: U(9), error: null }));
  try {
    const p1: any = await AE.linkPreview(ADMIN as any, { participant_id: KEPT, other: OLD });
    fp = 'b';
    const stale: any = await AE.linkApply(ADMIN as any, { participant_id: KEPT, other: OLD, plan_hash: p1.plan_hash }).catch((e) => e);
    assertEquals(stale.code, 'stale');
  } finally { w.restore(); }
});

Deno.test('تعديل الإدارة للبريد إلى بريد بديل لحساب آخر: رسالة واضحة لا «تعذّر الحفظ»', async () => {
  const A = await import('./admin.ts');
  const w = world();
  try {
    const { db } = await import('./core.ts');
    const orig = (db as any).from;
    (db as any).from = (t: string) => {
      const q = orig(t);
      if (t !== 'participants') return q;
      const up = q.update.bind(q);
      q.update = (v: any) => { const r = up(v); r.select = () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'email_taken: البريد بديل لحساب قائم', details: 'participant_emails_cross_uniq' } }) }); return r; };
      return q;
    };
    const e: any = await A.participantSave(ADMIN as any, { participant_id: OLD, fields: { email: 'alias@example.test' } }).catch((x) => x);
    (db as any).from = orig;
    assertEquals([e.status, e.code], [409, 'email_linked']);
  } finally { w.restore(); }
});

