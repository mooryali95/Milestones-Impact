// «التوجيه والإرشاد» H3: سجل المحادثات (قرار المالك v8)
// يثبت: القراءة للمالك دائمًا وللمدير الأعلى بمنح المالك وحده وبالعامل الثاني، ولا أحد غيرهما؛ وكل فتح نص يُسجَّل بلا النص؛
// والمحادثة لمشارك واحد لا تختلط بغيره؛ والمخفي يظهر موسومًا؛ والمنح والسحب للمالك وحده ويسري فورًا.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';

const T = await import('./guide-transcripts.ts');
const { resetSettingsCache } = await import('./settings.ts');

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const SUPER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner: any = { email: 'owner@x.sa', role: 'super_admin', method: 'passkey', id: OWNER, owner: true };
const sup: any = { email: 'super@x.sa', role: 'super_admin', method: 'passkey', id: SUPER, owner: false };
const admin: any = { email: 'admin@x.sa', role: 'admin', method: 'passkey', id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
const viewer: any = { email: 'v@x.sa', role: 'viewer', method: 'passkey', id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };

const now = new Date().toISOString();
const seed = (grants: any[] = []) => ({
  app_settings: [],
  participants: [{ id: P1, full_name: 'سارة', email: 's@x.sa', organization_name: 'جهة أ' }, { id: P2, full_name: 'خالد', email: 'k@x.sa', organization_name: 'جهة ب' }],
  guidance_messages: [
    { id: 1, participant_id: P1, role: 'user', body: 'سؤال سارة', verdict: 'answered', created_at: now },
    { id: 2, participant_id: P1, role: 'assistant', body: 'رد سارة', verdict: 'answered', model: 'claude-opus-5-5', input_tokens: 900, output_tokens: 200, cost_micros: 12500, created_at: now },
    { id: 3, participant_id: P1, role: 'user', body: 'سؤال مخفي', verdict: 'answered', hidden_at: now, created_at: now },
    { id: 4, participant_id: P2, role: 'user', body: 'سؤال خالد', verdict: 'answered', created_at: now },
    { id: 5, participant_id: P1, role: 'user', body: 'قديم جدًا', verdict: 'answered', created_at: new Date(Date.now() - 100 * 864e5).toISOString() },
  ],
  guidance_transcript_grants: grants,
  audit_log: [],
});
const fakeSupers = () => {
  const prev = T.GT.superAdmins;
  T.GT.superAdmins = async () => [{ id: OWNER, email: 'owner@x.sa', owner: true }, { id: SUPER, email: 'super@x.sa', owner: false }];
  return () => { T.GT.superAdmins = prev; };
};

Deno.test('من يقرأ: المالك دائمًا، والمدير الأعلى بمنح وحده، ولا يقرأ غيرهما ولا الداخل برمز البريد', async () => {
  resetSettingsCache();
  const w = installFake(seed());
  try {
    assertEquals((await T.access(owner)).can_read, true);
    assertEquals((await T.access(sup)).reason, 'no_grant');
    assertEquals((await T.access(admin)).reason, 'role');
    assertEquals((await T.access(viewer)).reason, 'role');
    assertEquals((await T.access({ ...owner, method: 'email' })).reason, 'mfa');
    for (const a of [sup, admin, viewer, { ...owner, method: 'email' }]) {
      await assertRejects(() => T.transcript(a, { participant_id: P1 }));
      await assertRejects(() => T.list(a));
    }
    assertEquals(w.tables.audit_log.length, 0, 'المرفوض لا يقرأ ولا يُسجَّل له فتح');
    w.tables.guidance_transcript_grants.push({ admin_id: SUPER, admin_email: 'super@x.sa', granted_by: 'owner@x.sa' });
    assertEquals((await T.access(sup)).can_read, true, 'المنح يسري فورًا');
    assertEquals((await T.access({ ...sup, method: 'email' })).reason, 'mfa');
  } finally { w.restore(); }
});

Deno.test('المحادثة: لمشارك واحد كاملة ضمن مدة الحفظ، والمخفي موسوم، وكل فتح يُسجَّل بلا النص', async () => {
  resetSettingsCache();
  const w = installFake(seed());
  try {
    const r = await T.transcript(owner, { participant_id: P1 });
    assertEquals(r.messages.map((m: any) => m.id), [1, 2, 3], 'لا رسالة لغيره، ولا ما تجاوز مدة الحفظ');
    assert(r.messages.find((m: any) => m.id === 3).hidden_at, 'المخفي ظاهر للإدارة موسومًا');
    const reply = r.messages.find((m: any) => m.id === 2);
    assertEquals([reply.model, reply.input_tokens, reply.output_tokens, reply.usd], ['claude-opus-5-5', 900, 200, 0.01]);
    assertEquals(r.participant.name, 'سارة');
    const log = w.tables.audit_log;
    assertEquals(log.length, 1);
    assertEquals([log[0].action, log[0].actor, log[0].entity_id], ['guide.transcript-read', 'owner@x.sa', P1]);
    assertEquals(log[0].after, { messages: 3, hidden: 1, owner: true });
    assert(!JSON.stringify(log).includes('سؤال'), 'السجل بلا نص');
    await assertRejects(() => T.transcript(owner, { participant_id: 'x' }), Error, 'معرّف');
  } finally { w.restore(); }
});

Deno.test('القائمة: أعداد وكلفة واسم بلا نص، ولا تُسجَّل كفتح', async () => {
  resetSettingsCache();
  const w = installFake(seed(), { rpc: (name) => name === 'guidance_conversations'
    ? { data: [{ participant_id: P1, asked: 2, unsure: 0, confirmed: 0, errors: 0, micros: 12500, first_at: now, last_at: now, hidden: 1 }], error: null } : null });
  try {
    const r = await T.list(owner);
    assertEquals(r.conversations.length, 1);
    assertEquals([r.conversations[0].name, r.conversations[0].org, r.conversations[0].hidden, r.conversations[0].usd], ['سارة', 'جهة أ', 1, 0.01]);
    assert(!JSON.stringify(r).includes('سؤال'));
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('المنح: للمالك وحده، لمدير أعلى نشط غير المالك، والسحب يسري فورًا، وكلاهما يُسجَّل', async () => {
  resetSettingsCache();
  const w = installFake(seed());
  const restore = fakeSupers();
  try {
    await assertRejects(() => T.grantSet(sup, { admin_id: SUPER, on: true }), Error, 'للمالك وحده');
    await assertRejects(() => T.grants(sup), Error, 'للمالك وحده');
    await assertRejects(() => T.grantSet(owner, { admin_id: OWNER, on: true }), Error, 'المالك يطّلع دائمًا');
    await assertRejects(() => T.grantSet(owner, { admin_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', on: true }), Error, 'ليس مديرًا أعلى');
    await T.grantSet(owner, { admin_id: SUPER, on: true });
    assertEquals((await T.access(sup)).can_read, true);
    const g = await T.grants(owner);
    assertEquals(g.admins.map((x: any) => [x.email, x.granted]), [['super@x.sa', true]], 'المالك لا يظهر في قائمة المنح');
    await T.transcript(sup, { participant_id: P2 });
    const g2 = await T.grants(owner);
    assertEquals(g2.reads.map((x: any) => [x.by, x.name]), [['super@x.sa', 'خالد']], 'المالك يرى من قرأ محادثة من');
    await T.grantSet(owner, { admin_id: SUPER, on: false });
    assertEquals((await T.access(sup)).reason, 'no_grant');
    await assertRejects(() => T.transcript(sup, { participant_id: P1 }));
    assertEquals(w.tables.audit_log.map((x: any) => x.action), ['guide.transcript-grant', 'guide.transcript-read', 'guide.transcript-revoke']);
  } finally { restore(); w.restore(); }
});

Deno.test('قبل الترحيل 20261116180000: لا قراءة ولا منح، والحالة تقول ذلك', async () => {
  resetSettingsCache();
  const w = installFake(seed(), { fail: (t) => t === 'guidance_transcript_grants' ? { code: '42P01', message: 'relation guidance_transcript_grants does not exist' } : null });
  try {
    assertEquals((await T.access(sup)).reason, 'not_migrated');
    assertEquals((await T.grants(owner)).ready, false);
  } finally { w.restore(); }
});

Deno.test('حراسة نصية: المنح بغلاف superWriter، والقراءة تفحص الصلاحية قبل أي قراءة نص', async () => {
  const idx = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(/'admin\.guide-transcript-grant': \(a, b\) => A\.superWriter\(a, GT\.grantSet, b\)/.test(idx));
  const src = await Deno.readTextFile(new URL('./guide-transcripts.ts', import.meta.url));
  for (const fn of ['list', 'transcript']) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`));
    assert(body.indexOf('await requireRead(a)') < body.indexOf("db."), fn);
  }
  // لا مسار آخر يقرأ نص المحادثة للإدارة: guidance_messages مع body في ملفات الإدارة غير هذا
  for (const f of ['guide-admin.ts', 'file.ts', 'admin.ts', 'guide-eval.ts']) {
    const s = await Deno.readTextFile(new URL(`./${f}`, import.meta.url));
    assert(!/from\('guidance_messages'\)\.select\('[^']*body/.test(s), f);
  }
});

// ── H4: رد غير دقيق ← حالة في مسودة المجموعة ──
const E = await import('./guide-eval.ts');
const flagSeed = (status: 'draft' | 'approved') => ({
  ...seed([{ admin_id: SUPER, admin_email: 'super@x.sa', granted_by: 'owner@x.sa' }]),
  handbook_modules: [{ id: 'mod-1', dimension: 'milestone', chapter_key: 'ch1' }],
  guidance_eval_sets: [{ id: 'set-1', version: '2026-11-17-r1', status, approved_by: status === 'approved' ? 'owner@x.sa' : null, approved_at: status === 'approved' ? now : null,
    cases: [{ id: 'g01', kind: 'answer', question: 'ما المعلم؟', context: 'program' }], created_at: now }],
});

Deno.test('رد غير دقيق: حالة بلا بيان شخصي في مسودة جديدة من المعتمدة، وسجل برقم الرسالة', async () => {
  resetSettingsCache(); E.resetSet();
  const w = installFake(flagSeed('approved'));
  w.tables.guidance_messages.push({ id: 9, participant_id: P1, role: 'assistant', body: 'رد', context: 'handbook', chapter_id: 'mod-1', created_at: now });
  try {
    const r = await T.flagReply(owner, { message_id: 9, kind: 'answer', question: 'سؤالي من sara@x.sa رقم هويتي 1012345678', reference_ar: 'المعلم نقطة قرار.', must_include: ['قرار'] });
    assertEquals(r.case_id, 'f01');
    assertEquals(r.new_draft, true);
    const drafts = w.tables.guidance_eval_sets.filter((x: any) => x.status === 'draft');
    assertEquals(drafts.length, 1, 'المعتمدة لا تُمس، والإضافة في مسودة جديدة');
    const c = drafts[0].cases.at(-1);
    assertEquals([c.context, c.dimension, c.chapter_key, c.kind], ['handbook', 'milestone', 'ch1', 'answer']);
    assert(!c.question.includes('sara@x.sa') && !c.question.includes('1012345678'), c.question);
    assert(!JSON.stringify(c).includes(P1), 'لا معرّف مشارك في المجموعة');
    const log: any = w.tables.audit_log.at(-1);
    assertEquals([log.action, log.entity_id, log.after.case_id], ['guide.reply-flag', '9', 'f01']);
  } finally { w.restore(); E.resetSet(); }
});

Deno.test('رد غير دقيق: لمن يقرأ النص وحده، وعلى رد المساعد وحده', async () => {
  resetSettingsCache(); E.resetSet();
  const w = installFake(flagSeed('draft'));
  w.tables.guidance_messages.push({ id: 9, participant_id: P1, role: 'assistant', body: 'رد', context: 'program', created_at: now });
  try {
    await assertRejects(() => T.flagReply(admin, { message_id: 9, question: 'س' }));
    await assertRejects(() => T.flagReply(owner, { message_id: 1, question: 'سؤال سارة' }), Error, 'ليست ردًا');
    const r = await T.flagReply(sup, { message_id: 9, kind: 'unsure', question: 'كيف أحدد أول معلم؟' });
    assertEquals(r.new_draft, false, 'المسودة نفسها تُعدَّل');
    assertEquals(w.tables.guidance_eval_sets[0].cases.at(-1).kind, 'unsure');
  } finally { w.restore(); E.resetSet(); }
});
