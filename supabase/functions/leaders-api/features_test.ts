// مفاتيح الميزات قيد البناء (P1): القاعة وكاتون و360 مطفأة افتراضيًا، ويرفضها الخادم برمز كل منها، والمدير مستثنى
// إلا فتح القاعة، والمهمة الساعية لا تذكّر ولا تغلق، وبريد 360 في الطابور يُمسك، ومقيّم 360 يرى «متوقف مؤقتًا» ومثله مقيّم
// الأثر قبل البرنامج وبعده (مؤجل مع 360 بقرار المالك 2026-11-16)، ورسائل الورشة بلا القاعة، وبطاقة المنسق null، وقفل القاعة مغلق، والدرجة لا تتغير.
import { placeOrgMembers } from './_fake_db.ts';
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db, Fail, hash, workshopMail, WORKSHOP_MAIL, FEEDBACK_MAIL, drainMailQueue, stuckQueueAlert } = await import('./core.ts');
const FT = await import('./features.ts');
const FB = await import('./feedback360.ts');
const H = await import('./hall.ts');
const { raterGet, raterSubmit } = await import('./impact.ts');
const { appSettings, expireSettingsCache, resetSettingsCache } = await import('./settings.ts');
const { DEFAULTS, resolveSettings } = await import('./settings.js');
const { coordFeedbackShown, featureFlags, featureGate, FEATURE_ACTIONS, FEATURE_OFF_AR, RATER_PAUSED_AR, WORKSHOP_NO_HALL_NOTE, attendNoteMethod } = await import('./features.js');

type Row = Record<string, any>;
// قاعدة في الذاكرة: eq وneq وin وis وcontains وlimit والعدّ، والإدراج والتحديث، وكل كتابة تُسجَّل
function install(tables: Record<string, Row[]>) {
  placeOrgMembers(tables);
  const writes: { table: string; kind: string; value: any }[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false, head = false, limit = Infinity;
    let op: { kind: 'select' | 'insert' | 'update' | 'upsert'; value?: any } = { kind: 'select' };
    const run = () => {
      const rows = tables[table] || (tables[table] = []);
      if (op.kind === 'insert' || op.kind === 'upsert') {
        writes.push({ table, kind: op.kind, value: op.value });
        const added = (Array.isArray(op.value) ? op.value : [op.value]).map((v: Row) => ({ id: crypto.randomUUID(), ...v }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op.kind === 'update') { writes.push({ table, kind: 'update', value: op.value }); hit.forEach((r) => Object.assign(r, structuredClone(op.value))); }
      if (head) return { data: null, count: hit.length, error: null };
      const out = hit.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: any) => { if (o?.head) head = true; return q; }, order: () => q, lt: () => q, gte: () => q,
      limit: (n: number) => { limit = n; return q; },
      insert: (v: any) => { op = { kind: 'insert', value: v }; return q; },
      upsert: (v: any) => { op = { kind: 'upsert', value: v }; return q; },
      update: (v: any) => { op = { kind: 'update', value: v }; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      gt: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) > v); return q; },
      contains: (c: string, vs: unknown[]) => { filters.push((r) => Array.isArray(r[c]) && vs.every((v) => r[c].includes(v))); return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  const prev = (db as any).from;
  Object.assign(db as any, { from });
  resetSettingsCache();
  return { tables, writes, restore: () => { (db as any).from = prev; resetSettingsCache(); } };
}
const codeOf = async (fn: () => Promise<unknown>) => ((await assertRejects(fn, Fail)) as InstanceType<typeof Fail>);
const ON = [{ key: 'features', value: { hall: true, katon: true } }, { key: 'feedback360', value: { enabled: true } }];

Deno.test('المفاتيح: الثلاثة مطفأة افتراضيًا، ومخزن غائب أو تالف لا يُظهر ميزة، و360 مفتاحه feedback360.enabled وحده', () => {
  assertEquals(featureFlags(DEFAULTS), { hall: false, katon: false, f360: false });
  assertEquals(featureFlags(resolveSettings([{ key: 'features', value: { hall: 'yes', katon: 1 } }])), { hall: false, katon: false, f360: false });
  assertEquals(featureFlags(resolveSettings(ON)), { hall: true, katon: true, f360: true });
  assertEquals(featureFlags(null), { hall: false, katon: false, f360: false });
});

Deno.test('الحارس: كل فعل برمز ميزته ورسالة لا تسمّيها، وقراءات تُجاب بلا شيء، والمدير مستثنى إلا فتح القاعة', () => {
  const off = { hall: false, katon: false, f360: false };
  for (const [a, code] of [['hall.state', 'hall_off'], ['hall.join', 'hall_off'], ['xp.hall-open', 'hall_off'], ['xp.hall-close', 'hall_off'], ['katon.mine', 'katon_off'],
    ['f360.start', 'f360_off'], ['f360.submit', 'f360_off'], ['f360.report', 'f360_off'], ['xp.f360-decide', 'f360_off'], ['xp.f360-release', 'f360_off']]) {
    assertEquals([a, featureGate(a, off)?.fail?.code, featureGate(a, off)?.fail?.status, featureGate(a, off)?.fail?.message], [a, code, 404, FEATURE_OFF_AR]);
  }
  // تقييم المدير خرج من المفتاح (تصور المرحلة 3، القرار 2): دعوة مقيّم الأثر وإلغاؤه وتأكيده تمر، وخانة المدير وحدها في impact.ts
  for (const a of ['rater.invite', 'rater.revoke', 'xp.rater-confirm']) assertEquals([a, featureGate(a, off)], [a, null]);
  assertEquals(featureGate('f360.mine', off), { soft: { success: true, enabled: false, ready: true } });
  assertEquals(featureGate('xp.f360', off), { soft: { success: true, approvals: [], reports: [] } });
  assertEquals(featureGate('xp.hall', off)?.soft?.off, true);
  // المدير يبني الميزة: قراءتها وتحريرها وإغلاق جلسة قائمة، ولا يفتح قاعة لا يدخلها أحد
  for (const a of ['admin.hall', 'admin.hall-close', 'admin.hall-step', 'admin.katon', 'admin.katon-sentence-save', 'admin.f360', 'admin.f360-close', 'admin.f360-report', 'admin.settings-save']) {
    assertEquals([a, featureGate(a, off)], [a, null]);
  }
  assertEquals([featureGate('admin.hall-open', off)?.fail?.code, featureGate('admin.hall-open', off)?.fail?.status], ['hall_off', 409]);
  // ما لا تحكمه ميزة يمر، وكل فعل محكوم يمر حين تُظهَر ميزته
  for (const a of ['me', 'impact.mine', 'peer.ask', 'workshop.checkin', 'katon.answer']) assertEquals([a, featureGate(a, off)], [a, null]);
  const on = { hall: true, katon: true, f360: true };
  for (const a of [...Object.keys(FEATURE_ACTIONS), 'f360.mine', 'xp.f360', 'xp.hall']) assertEquals([a, featureGate(a, on)], [a, null]);
  // مفتاح ميزة لا يفتح غيرها
  assertEquals(featureGate('hall.state', { hall: false, katon: true, f360: true })?.fail?.code, 'hall_off');
  assertEquals(featureGate('f360.start', { hall: true, katon: true, f360: false })?.fail?.code, 'f360_off');
});

Deno.test('الحارس على الخادم يقرأ المخزن: مطفأ يرمي برمزه، ومُظهَر يمضي، والمدير يمر', async () => {
  let w = install({ app_settings: [] });
  try {
    assertEquals((await codeOf(() => FT.gate('hall.join'))).code, 'hall_off');
    assertEquals((await codeOf(() => FT.gate('katon.mine'))).code, 'katon_off');
    assertEquals((await codeOf(() => FT.gate('f360.nominate'))).code, 'f360_off');
    assertEquals((await codeOf(() => FT.gate('admin.hall-open'))).code, 'hall_off');
    assertEquals(await FT.gate('admin.f360-close'), null);
    assertEquals(await FT.gate('f360.mine'), { success: true, enabled: false, ready: true });
  } finally { w.restore(); }
  w = install({ app_settings: structuredClone(ON) });
  try {
    for (const a of ['hall.join', 'katon.mine', 'f360.nominate', 'admin.hall-open', 'f360.mine']) assertEquals([a, await FT.gate(a)], [a, null]);
    assertEquals(await FT.features(), { hall: true, katon: true, f360: true });
  } finally { w.restore(); }
});

Deno.test('القاعة المخفية: hallGate لا يفتح جملة ولو كانت للدفعة قاعة مفتوحة، ولا يقرأ جلساتها', async () => {
  const w = install({ app_settings: [], hall_sessions: [{ id: 'hs', cohort_id: 'c1', stage: 'round', mode: 'self', topic_id: 't', revealed: [] }] });
  try {
    assertEquals(await H.hallGate({ id: 'p1', is_demo: false }, 's1'), { inHall: false, sessionId: null });
  } finally { w.restore(); }
});

const CYC = '00000000-0000-4000-8000-0000000000c1';
const PID = '00000000-0000-4000-8000-000000000001';
function f360World(enabled: boolean) {
  const opened = new Date(Date.now() - 6 * 864e5).toISOString();
  return install({
    app_settings: enabled ? [{ key: 'feedback360', value: { enabled: true } }] : [],
    feedback_cycles: [
      // مفتوحة منذ ستة أيام وفات يوم تذكيرها الخامس، وأخرى انقضت نافذتها
      { id: CYC, participant_id: PID, wave: 't1', status: 'open', opens_at: opened, closes_at: new Date(Date.now() + 8 * 864e5).toISOString(), reminded_days: [], participants: { id: PID, full_name: 'سارة' } },
      { id: 'c2', participant_id: PID, wave: 't1', status: 'open', opens_at: opened, closes_at: new Date(Date.now() - 6e4).toISOString(), reminded_days: [], participants: { id: PID, full_name: 'سارة' } },
    ],
    raters: [{ id: 'r1', cycle_id: CYC, participant_id: PID, phase: 'f360', status: 'invited', email: 'p@x.sa', relation: 'peer', token_hash: 'h', token_hashes: ['h'] }],
    audit_log: [], mail_queue: [],
  });
}

Deno.test('360 المخفي متجمد: المهمة الساعية لا تذكّر ولا تغلق ولا تكتب شيئًا، ومُظهَرًا تستأنف من حاله', async () => {
  let w = f360World(false);
  try {
    assertEquals(await FB.sweep(), { skipped: 'off', reminded: 0, closed: 0 });
    assertEquals(w.writes, []);
    assertEquals(w.tables.feedback_cycles.map((c) => c.status), ['open', 'open']);
  } finally { w.restore(); }
  w = f360World(true);
  try {
    const r: any = await FB.sweep();
    assertEquals(r.closed, 1);
    assertEquals(w.tables.feedback_cycles.map((c) => c.status), ['open', 'closed']);
    assertEquals(w.tables.feedback_cycles[0].reminded_days, [5]);
  } finally { w.restore(); }
});

Deno.test('360 المخفي: إغلاق المدير المبكر يُنفَّذ بلا إرسال، وبريد «التقرير جاهز» يُمسك في الطابور ويخرج عند الإظهار', async () => {
  const w = f360World(false);
  w.tables.cohorts = [{ id: 'co1', is_default: true, organization_id: null, status: 'running', advisor_expert_id: 'x1', created_at: '2026-10-01' }];
  w.tables.enrollments = [];
  w.tables.cohort_group_members = [];
  w.tables.experts = [{ id: 'x1', full_name: 'المستشار خالد', email: 'adv@x.sa', status: 'active', roles: ['advisor'] }];
  for (const c of w.tables.feedback_cycles) c.participants = { id: PID, full_name: 'سارة', email: 'p@x.sa', organization_id: null, is_demo: false };
  try {
    const r: any = await FB.adminClose({ email: 'admin@x.sa' }, { cycle_id: CYC });
    assertEquals([r.success, r.closed, r.mailed, r.queued], [true, 1, false, true]);
    assertEquals(w.tables.feedback_cycles.map((c) => c.status), ['closed', 'open']);
    assertEquals(w.tables.feedback_cycles[0].reminded_days, []);
    // في الطابور لا مرسَل، وممسَك ما دام 360 مخفيًا، ثم يخرج حين يُظهَر
    assertEquals(w.tables.mail_queue.map((m) => [m.to_email, m.subject, m.reason, m.sent_at ?? null]), [['adv@x.sa', FEEDBACK_MAIL.ready.subject('سارة'), 'f360_off', null]]);
    assertEquals((await FT.heldMail()).has(w.tables.mail_queue[0].id), true);
    w.tables.app_settings = [{ key: 'feedback360', value: { enabled: true } }];
    resetSettingsCache();
    assertEquals((await FT.heldMail()).size, 0);
  } finally { w.restore(); }
});

Deno.test('360 المخفي: «التقرير جاهز» بفئة expert_digest ومستلمه كالمسار العادي، فيصل صندوقه بترويسة الإلغاء، ويحترم الكتم', async () => {
  const XID = '5a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
  for (const muted of [[], ['expert_digest']]) {
    const w = f360World(false);
    w.tables.cohorts = [{ id: 'co1', is_default: true, organization_id: null, status: 'running', advisor_expert_id: XID, created_at: '2026-10-01' }];
    w.tables.enrollments = [];
    w.tables.cohort_group_members = [];
    w.tables.experts = [{ id: XID, full_name: 'المستشار خالد', email: 'adv@x.sa', status: 'active', roles: ['advisor'] }];
    w.tables.participant_mail_prefs = muted.length ? [{ expert_id: XID, muted }] : [];
    w.tables.participant_notifications = [];
    for (const c of w.tables.feedback_cycles) c.participants = { id: PID, full_name: 'سارة', email: 'p@x.sa', organization_id: null, is_demo: false };
    try {
      const r: any = await FB.adminClose({ email: 'admin@x.sa' }, { cycle_id: CYC });
      assertEquals(w.tables.participant_notifications.map((n) => [n.expert_id, n.category, n.about_participant_id, n.emailed]), [[XID, 'expert_digest', PID, !muted.length]]);
      if (muted.length) assertEquals([r.queued, w.tables.mail_queue.length], [false, 0]);
      else {
        assertEquals([r.queued, w.tables.mail_queue.map((m) => [m.to_email, m.reason])], [true, [['adv@x.sa', 'f360_off']]]);
        assertEquals(typeof w.tables.mail_queue[0].headers?.['List-Unsubscribe'], 'string');
      }
    } finally { w.restore(); }
  }
});

Deno.test('استئناف 360: الساعة توقفت مع الإخفاء، فتُمد النافذة وروابط المقيّمين بقدر مدة الإخفاء، وما انقضى قبله لا يُمد', async () => {
  const H = 36e5, now = Date.parse('2026-11-25T09:00:00Z');
  const at = (h: number) => new Date(now + h * H).toISOString();
  const w = install({
    app_settings: [{ key: 'feedback360', value: { enabled: false } }],
    schema_migrations: [{ name: FB.F360_FREEZE_MIGRATION, applied_at: at(-24 * 30) }],
    // أُطفئ قبل سبعة أيام (وكان قبلها حفظ لا يمس المفتاح، وإطفاء أقدم)
    audit_log: [
      { action: 'admin.settings-save', entity_id: 'feedback360', created_at: at(-24 * 20), before: { value: { enabled: true } }, after: { value: { enabled: false } } },
      { action: 'admin.settings-save', entity_id: 'feedback360', created_at: at(-24 * 7), before: { value: { enabled: true } }, after: { value: { enabled: false } } },
      { action: 'admin.settings-save', entity_id: 'feedback360', created_at: at(-24 * 3), before: { value: { enabled: false, min_group: 3 } }, after: { value: { enabled: false, min_group: 4 } } },
    ],
    feedback_cycles: [
      // مفتوحة قبل الإخفاء وتنقضي أثناءه: بقي يومان من نافذتها حين أُطفئ
      { id: 'c-open', status: 'open', opens_at: at(-24 * 12), closes_at: at(-24 * 5) },
      // انقضت قبل الإخفاء ولم تُغلق بعد: تُغلق كما كانت
      { id: 'c-old', status: 'open', opens_at: at(-24 * 30), closes_at: at(-24 * 8) },
      { id: 'c-closed', status: 'closed', opens_at: at(-24 * 12), closes_at: at(-24 * 5) },
    ],
    raters: [
      { id: 'r-inv', cycle_id: 'c-open', phase: 'f360', status: 'invited', expires_at: at(-24 * 5) },
      { id: 'r-done', cycle_id: 'c-open', phase: 'f360', status: 'submitted', expires_at: at(-24 * 5) },
      // مقيّمو الأثر مؤجلون مع 360: دعوة قبل الإخفاء بقي منها يومان تُمد بالسبعة، ودعوة أثناءه (قبل يومين) تُمد بما مضى منها،
      // ودعوة انقضت قبل الإخفاء والمرسل تقديره لا يُمسان
      { id: 'r-pre', cycle_id: null, phase: 'pre', status: 'invited', invited_at: at(-24 * 20), expires_at: at(-24 * 5) },
      { id: 'r-post', cycle_id: null, phase: 'post', status: 'invited', invited_at: at(-24 * 2), expires_at: at(24 * 28) },
      { id: 'r-old', cycle_id: null, phase: 'post', status: 'invited', invited_at: at(-24 * 40), expires_at: at(-24 * 10) },
      { id: 'r-sub', cycle_id: null, phase: 'post', status: 'submitted', invited_at: at(-24 * 20), expires_at: at(24 * 3) },
    ],
  });
  try {
    assertEquals(await FB.pausedSince(), now - 7 * 24 * H);
    const r: any = await FB.resumeFrozen('admin@x.sa', now);
    assertEquals([r.extended, r.raters, r.paused_ms], [1, 2, 7 * 24 * H]);
    const cyc = Object.fromEntries(w.tables.feedback_cycles.map((c) => [c.id, c.closes_at]));
    assertEquals(cyc, { 'c-open': at(24 * 2), 'c-old': at(-24 * 8), 'c-closed': at(-24 * 5) });
    assertEquals(w.tables.raters.map((x) => [x.id, x.expires_at]), [['r-inv', at(24 * 2)], ['r-done', at(-24 * 5)],
      ['r-pre', at(24 * 2)], ['r-post', at(24 * 30)], ['r-old', at(-24 * 10)], ['r-sub', at(24 * 3)]]);
    assertEquals(w.tables.audit_log.filter((l) => l.action === 'f360.resume').map((l) => l.entity_id), ['c-open']);
    assertEquals(w.tables.audit_log.filter((l) => l.action === 'rater.resume').map((l) => l.after), [{ raters: 2, paused_ms: 7 * 24 * H }]);
  } finally { w.restore(); }
});

Deno.test('استئناف 360 بلا إطفاء في السجل: بداية الإخفاء نشر المفاتيح، وبلا أي منهما لا يُمد شيء', async () => {
  const now = Date.parse('2026-11-25T09:00:00Z');
  let w = install({ schema_migrations: [{ name: FB.F360_FREEZE_MIGRATION, applied_at: new Date(now - 3 * 864e5).toISOString() }], audit_log: [],
    feedback_cycles: [{ id: 'c1', status: 'open', opens_at: new Date(now - 10 * 864e5).toISOString(), closes_at: new Date(now - 864e5).toISOString() }], raters: [] });
  try {
    assertEquals((await FB.resumeFrozen('admin@x.sa', now)).extended, 1);
    assertEquals(w.tables.feedback_cycles[0].closes_at, new Date(now + 2 * 864e5).toISOString());
  } finally { w.restore(); }
  w = install({ schema_migrations: [], audit_log: [], feedback_cycles: [{ id: 'c1', status: 'open', closes_at: new Date(now - 864e5).toISOString() }], raters: [] });
  try {
    assertEquals(await FB.resumeFrozen('admin@x.sa', now), { extended: 0, raters: 0, mail: 0, paused_ms: 0 });
    assertEquals(w.writes, []);
  } finally { w.restore(); }
});

Deno.test('مقيّمو الأثر: بداية إخفائهم لا تسبق نشر ربطهم بـ360 (علامة rater.pause-start)، ولا يمنع استئنافهم غياب جدول الدورات', async () => {
  const H = 36e5, now = Date.parse('2026-11-25T09:00:00Z');
  const at = (h: number) => new Date(now + h * H).toISOString();
  const RID = '00000000-0000-4000-8000-0000000000a1';
  const w = install({
    app_settings: [], schema_migrations: [{ name: FB.F360_FREEZE_MIGRATION, applied_at: at(-24 * 30) }],
    // مطفأ منذ الافتراضي بلا حفظ أطفأه، والربط نُشر قبل عشرة أيام (العلامة)
    audit_log: [{ action: FB.IMPACT_PAUSE_MARK, created_at: at(-24 * 10) }],
    raters: [
      // انقضى قبل النشر وهو يعمل: لا يُحيا
      { id: 'r-gone', cycle_id: null, phase: 'post', status: 'invited', invited_at: at(-24 * 28), expires_at: at(-24 * 20) },
      // بقي منه يوم حين نُشر الربط: يُمد بالعشرة لا بالثلاثين
      { id: RID, cycle_id: null, phase: 'post', status: 'invited', invited_at: at(-24 * 20), expires_at: at(-24 * 9) },
    ],
    // دعوته في الطابور منذ اثني عشر يومًا (السقف اليومي): لا تُعد فائتة عند أول تفريغ بعد الإظهار
    mail_queue: [{ id: 'm1', kind: 'notify', created_at: at(-24 * 12), to_email: 'boss@x.sa', subject: 'طلب تقدير من سارة', html: '<p/>', ref: `rater:${RID}`, attempts: 0, sent_at: null, gave_up_at: null, expires_at: at(-24 * 9) }],
  });
  const from = (db as any).from;
  (db as any).from = (t: string) => t !== 'feedback_cycles' ? from(t) : new Proxy({}, {
    get: (_x, k: string) => k === 'then' ? (ok: any) => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "feedback_cycles" does not exist' } }).then(ok) : () => (db as any).from('feedback_cycles'),
  });
  try {
    assertEquals(await FB.impactPausedSince(), now - 10 * 24 * H);
    const r: any = await FB.resumeFrozen('admin@x.sa', now);
    assertEquals([r.extended, r.raters, r.mail], [0, 1, 1]);
    assertEquals(w.tables.raters.map((x) => [x.id, x.expires_at]), [['r-gone', at(-24 * 20)], [RID, at(24 * 1)]]);
    // عمرها في الطابور بلا أيام الإخفاء: يومان قبل النشر، فتُرسل ولا تُترك «فائتة»
    assertEquals(w.tables.mail_queue[0].created_at, at(-24 * 2));
    // وموعدها يُزاح بأيام الإخفاء كموعد المقيّم، فلا يتركها التفريغ «فات أوانه» والرابط حي
    assertEquals(w.tables.mail_queue[0].expires_at, at(24 * 1));
    assertEquals(w.tables.audit_log.filter((l) => l.action === 'mail.resume').map((l) => l.after), [{ messages: 1 }]);
  } finally { w.restore(); }
});

Deno.test('علامة بداية إخفاء مقيّمي الأثر تُكتب مرة واحدة', async () => {
  const w = install({ audit_log: [] });
  try {
    assertEquals(await FB.markImpactPause(), true);
    assertEquals(await FB.markImpactPause(), false);
    assertEquals(w.tables.audit_log.filter((l) => l.action === FB.IMPACT_PAUSE_MARK).length, 1);
  } finally { w.restore(); }
});

Deno.test('إظهار 360 من الإعدادات يستأنف الدورات المجمدة، وحفظ لا يُظهره لا يمسها', async () => {
  const { adminSave } = await import('./settings.ts');
  const since = Date.now() - 4 * 864e5;
  const world = () => install({
    app_settings: [{ key: 'feedback360', value: { enabled: false } }],
    schema_migrations: [{ name: FB.F360_FREEZE_MIGRATION, applied_at: new Date(since).toISOString() }], audit_log: [],
    feedback_cycles: [{ id: 'c1', status: 'open', opens_at: new Date(since - 864e5).toISOString(), closes_at: new Date(since + 864e5).toISOString() }], raters: [],
  });
  const a = { email: 'admin@x.sa', role: 'admin', method: 'passkey' } as any;
  let w = world();
  try {
    await adminSave(a, { group: 'feedback360', values: { enabled: false, max_peer: 7 } });
    assertEquals(w.tables.feedback_cycles[0].closes_at, new Date(since + 864e5).toISOString());
  } finally { w.restore(); }
  w = world();
  try {
    await adminSave(a, { group: 'feedback360', values: { enabled: true } });
    const ext = Date.parse(w.tables.feedback_cycles[0].closes_at) - (since + 864e5);
    assertEquals(ext >= 4 * 864e5 - 5e3 && ext <= 4 * 864e5 + 5e3, true);
  } finally { w.restore(); }
});

Deno.test('بريد 360 في الطابور يُمسك حين يُخفى: لا يُرسل ولا يُعد محاولة ولا يُنبَّه إليه عالقًا، وغيره لا يُمسك', async () => {
  const old = new Date(Date.now() - 8 * 36e5).toISOString();
  const queue = () => [
    { id: 'm-inv', kind: 'bulk', created_at: old, to_email: 'p@x.sa', subject: 'طلب تقدير من سارة', html: '<p/>', ref: `rater:${'0'.repeat(8)}-0000-4000-8000-0000000000f1`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-ready', kind: 'bulk', created_at: old, to_email: 'adv@x.sa', subject: FEEDBACK_MAIL.ready.subject('سارة'), html: '<p/>', ref: `participant:${PID}`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-pre', kind: 'bulk', created_at: old, to_email: 'm@x.sa', subject: 'طلب تقدير من سارة', html: '<p/>', ref: `rater:${'0'.repeat(8)}-0000-4000-8000-0000000000f2`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-ws', kind: 'bulk', created_at: old, to_email: 'p@x.sa', subject: WORKSHOP_MAIL.day.subject, html: '<p/>', ref: 'ws1', attempts: 0, sent_at: null, gave_up_at: null },
    // تأكيد مقيّم الأثر (للمؤكِّد، ولعدم الاعتماد للمشارك) مؤجل مع 360
    { id: 'm-conf', kind: 'bulk', created_at: old, to_email: 'adv@x.sa', subject: 'مقيّم بانتظار تأكيدك: سارة', html: '<p/>', ref: `participant:${PID}`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-rej', kind: 'bulk', created_at: old, to_email: 'p@x.sa', subject: 'لم يُعتمد أحد مقيّميك', html: '<p/>', ref: `participant:${PID}`, attempts: 0, sent_at: null, gave_up_at: null },
  ];
  const raters = [{ id: `${'0'.repeat(8)}-0000-4000-8000-0000000000f1`, phase: 'f360' }, { id: `${'0'.repeat(8)}-0000-4000-8000-0000000000f2`, phase: 'pre' }];
  let w = install({ app_settings: [], mail_queue: queue(), raters });
  try {
    const held = await FT.heldMail();
    assertEquals([...held].sort(), ['m-conf', 'm-inv', 'm-pre', 'm-ready', 'm-rej']);
    // الطابور كله ممسَك: لا محاولة ولا كتابة، ويُذكر عدد الممسَك
    w.tables.mail_queue = w.tables.mail_queue.filter((m) => held.has(m.id));
    const r: any = await drainMailQueue(40, held);
    assertEquals([r.sent, r.held], [0, 5]);
    assertEquals(w.writes.filter((x) => x.table === 'mail_queue'), []);
    assertEquals(w.tables.mail_queue.map((m) => m.attempts), [0, 0, 0, 0, 0]);
    // الممسَك ليس عالقًا ولو مضت عليه ساعات
    assertEquals(await stuckQueueAlert(held), { stuck: 0, alerted: 0 });
  } finally { w.restore(); }
  w = install({ app_settings: [{ key: 'feedback360', value: { enabled: true } }], mail_queue: queue(), raters });
  try {
    assertEquals((await FT.heldMail()).size, 0);
  } finally { w.restore(); }
});

const TOKEN = 'rater-token-0123456789-abcdef';
async function raterWorld(phase: 'f360' | 'pre' | 'post', enabled: boolean) {
  return install({
    app_settings: enabled ? [{ key: 'feedback360', value: { enabled: true } }] : [],
    raters: [{ id: 'r1', phase, cycle_id: phase === 'f360' ? CYC : null, participant_id: PID, instrument_id: 'i1', relation: 'manager', full_name: 'المدير', status: 'invited',
      token_hash: await hash(TOKEN), token_hashes: [], expires_at: new Date(Date.now() + 864e5).toISOString(), opened_at: null, participants: { full_name: 'سارة' } }],
    feedback_cycles: [{ id: CYC, participant_id: PID, status: 'open', closes_at: new Date(Date.now() + 864e5).toISOString() }],
    questions: [], audit_log: [], consent_events: [],
  });
}

Deno.test('مقيّم 360 حين يُخفى: «متوقف مؤقتًا» بلا اسم الميزة، لا يُفتح الرابط ولا يُقبل تقدير، ويعود حين يُظهَر', async () => {
  let w = await raterWorld('f360', false);
  try {
    const e = await codeOf(() => raterGet({ t: TOKEN }));
    assertEquals([e.code, e.status, e.message, e.extra], ['f360_off', 409, RATER_PAUSED_AR, { paused: true, phase: 'f360' }]);
    assertEquals(e.message.includes('360'), false);
    assertEquals((await codeOf(() => raterSubmit({ t: TOKEN, contact_freq: 'daily', answers: {} }))).code, 'f360_off');
    assertEquals(w.writes, []);
    assertEquals(w.tables.raters[0].opened_at, null);
  } finally { w.restore(); }
  w = await raterWorld('f360', true);
  try {
    const r: any = await raterGet({ t: TOKEN });
    assertEquals([r.success, r.phase], [true, 'f360']);
  } finally { w.restore(); }
});

Deno.test('مقيّمو الأثر قبل البرنامج وبعده (pre وpost) خارج مفتاح 360 (تصور المرحلة 3، القرار 2): يعمل رابطهم مطفأ ومُظهَرًا', async () => {
  for (const on of [false, true]) for (const phase of ['pre', 'post'] as const) {
    const w = await raterWorld(phase, on);
    try {
      const r: any = await raterGet({ t: TOKEN });
      assertEquals([on, phase, r.success, r.phase, r.done], [on, phase, true, phase, false]);
      assertEquals(typeof w.tables.raters[0].opened_at, 'string');
    } finally { w.restore(); }
  }
});

Deno.test('رابط مقيّم أثر انقضت مهلته: «انتهت الصلاحية» مطفأ ومُظهَرًا، فلا يُقال «متوقف مؤقتًا» لما لا يتوقف', async () => {
  for (const on of [false, true]) {
    const w = await raterWorld('post', on);
    w.tables.raters[0].expires_at = new Date(Date.now() - 864e5).toISOString();
    try {
      assertEquals([on, (await codeOf(() => raterGet({ t: TOKEN }))).code], [on, 'expired']);
    } finally { w.restore(); }
  }
});

Deno.test('رسائل الورشة والقاعة مخفية: ملاحظة بلا «القاعة» والحضور برمز QR، ومُظهَرة كما كانت', () => {
  for (const kind of ['invite', 'day', 'hour'] as const) {
    const off = workshopMail(kind, 'سارة', 'اليوم الأول', 'الأحد', 'قاعة التدريب', null, false, false);
    assertEquals([kind, off.includes(WORKSHOP_NO_HALL_NOTE.qr[kind]), off.includes('«القاعة»'), off.includes('الجولات'), off.includes('QR')], [kind, true, false, false, true]);
    const on = workshopMail(kind, 'سارة', 'اليوم الأول', 'الأحد', 'قاعة التدريب', null);
    assertEquals([kind, on.includes(WORKSHOP_MAIL[kind].note)], [kind, true]);
    // جلسة عن بعد برابطها وتوثيقها بالانضمام: لا «QR»، بل زر الانضمام في الرحلة. ويدوي أو آلي: ملاحظة عامة لا تَعِد بطريقة
    const join = workshopMail(kind, 'سارة', 'اليوم الأول', 'الأحد', null, 'https://meet.example/x', false, false, 'join');
    assertEquals([kind, join.includes(WORKSHOP_NO_HALL_NOTE.join[kind]), join.includes('QR'), join.includes('«القاعة»')], [kind, true, false, false]);
    const other = workshopMail(kind, 'سارة', 'اليوم الأول', 'الأحد', 'قاعة التدريب', null, false, false, 'other');
    assertEquals([kind, other.includes(WORKSHOP_NO_HALL_NOTE.other[kind]), other.includes('QR')], [kind, true, false]);
    for (const m of ['qr', 'join', 'other'] as const) assertEquals([m, kind, /القاعة|كاتون|360|[\u2013\u2014]/.test(WORKSHOP_NO_HALL_NOTE[m][kind])], [m, kind, false]);
  }
  // الطريقة من توثيق الحضور: join لا يصح إلا لجلسة عن بعد يصل المشارك رابطها
  assertEquals([attendNoteMethod(undefined, false), attendNoteMethod('qr', true), attendNoteMethod('join', true), attendNoteMethod('join', false), attendNoteMethod('manual', true), attendNoteMethod('auto', false)],
    ['qr', 'qr', 'join', 'other', 'other', 'other']);
  // الجلسة عن بعد بملاحظتها كما كانت، فلا قاعة فيها أصلًا
  assertEquals(workshopMail('invite', 'سارة', 'اليوم', 'الأحد', null, null, 'later', false).includes('رابط الانضمام يُضاف لاحقًا'), true);
});

Deno.test('بطاقة 360 عند المنسق: تظهر بالصلاحية ومفتاح الرؤية ومفتاح 360 معًا، وتغيب (null) بغياب أي منها', () => {
  const on = { hall: false, katon: false, f360: true };
  assertEquals(coordFeedbackShown(true, { coord_f360: true }, on), true);
  assertEquals(coordFeedbackShown(true, { coord_f360: true }, { ...on, f360: false }), false);
  assertEquals(coordFeedbackShown(true, { coord_f360: false }, on), false);
  assertEquals(coordFeedbackShown(false, { coord_f360: true }, on), false);
});

Deno.test('المفتاح للظهور وحده: وزن كاتون في الختامي صفر واستبعاده من المؤشر ثابتان لا يقرآن الإعدادات', async () => {
  const { FINAL_DEFAULTS } = await import('./final.js');
  const { KATON_ENABLED } = await import('./labels.js');
  assertEquals((FINAL_DEFAULTS as any).sources.katon, 0);
  assertEquals(KATON_ENABLED, false);
  for (const f of ['continuous.js', 'final.js']) {
    const src = await Deno.readTextFile(new URL(`./${f}`, import.meta.url));
    assertEquals([f, /features|appSettings|settings\.(js|ts)/.test(src)], [f, false]);
  }
});

Deno.test('خطأ لحظي في قراءة الإعدادات لا يطفئ ميزة ظاهرة: تبقى آخر قيم ناجحة ويُعاد الطلب بعد ثوانٍ', async () => {
  const w = install({ app_settings: structuredClone(ON) });
  const ok = (db as any).from;
  try {
    assertEquals(await FT.features(), { hall: true, katon: true, f360: true });
    expireSettingsCache();
    (db as any).from = (t: string) => (t === 'app_settings'
      ? { select: () => Promise.resolve({ data: null, error: { code: '08006', message: 'connection reset' } }) }
      : ok(t));
    assertEquals(await FT.features(), { hall: true, katon: true, f360: true });
    assertEquals(await FT.gate('hall.state'), null);
    // تعود القراءة: تُقرأ القيم من جديد بعد انقضاء مهلة الإعادة
    (db as any).from = ok;
    expireSettingsCache();
    w.tables.app_settings = [];
    assertEquals(await FT.features(), { hall: false, katon: false, f360: false });
  } finally { w.restore(); }
  // بلا قراءة سابقة في هذه النسخة: الافتراضي (مطفأ)، فلا تُظهَر ميزة بخطأ
  const w2 = install({ app_settings: [] });
  try {
    (db as any).from = () => ({ select: () => Promise.resolve({ data: null, error: { code: '08006', message: 'x' } }) });
    assertEquals((await appSettings()).features, DEFAULTS.features);
  } finally { w2.restore(); }
});

Deno.test('بريد ورشة دخل الطابور بملاحظة القاعة ثم أُخفيت: يخرج بالملاحظة العامة، وغيره كما خُزّن، والقاعة ظاهرة لا تغيير', async () => {
  const { hallNoteRewrite } = FT;
  const html = workshopMail('invite', 'سارة', 'اليوم الأول', 'الأحد', 'قاعة التدريب', null);
  assertEquals(html.includes(WORKSHOP_MAIL.invite.note), true);
  const off = hallNoteRewrite(false)({ subject: WORKSHOP_MAIL.invite.subject, html });
  assertEquals([off.includes(WORKSHOP_MAIL.invite.note), off.includes(WORKSHOP_NO_HALL_NOTE.other.invite), off.includes('«القاعة»')], [false, true, false]);
  assertEquals(hallNoteRewrite(true)({ subject: WORKSHOP_MAIL.invite.subject, html }), html);
  assertEquals(hallNoteRewrite(false)({ subject: 'موضوع آخر', html }), html);
  for (const k of ['day', 'hour'] as const) {
    const h = workshopMail(k, 'سارة', 'اليوم', 'الأحد', null, null);
    assertEquals([k, hallNoteRewrite(false)({ subject: WORKSHOP_MAIL[k].subject, html: h }).includes(WORKSHOP_NO_HALL_NOTE.other[k])], [k, true]);
  }
  // التفريغ والإرسال اليدوي من صندوق «لم يُرسل» يرسلان المتن بعد الاستبدال، والمهمة الساعية تمرره
  const core = await Deno.readTextFile(new URL('./core.ts', import.meta.url));
  assertEquals(/sendCounted\(db, m\.to_email, m\.subject, rewrite\(m\),/.test(core), true);
  assertEquals((await Deno.readTextFile(new URL('./index.ts', import.meta.url))).includes('drainMailQueue(40, hold, rewrite)'), true);
  assertEquals((await Deno.readTextFile(new URL('./mail-center.ts', import.meta.url))).includes('html: (await mailRewrite())(m)'), true);
});

Deno.test('فرق القاعة المخفية لا تظهر للخبير: قائمة طلبات الأقران وملف المشارك «الجميع»، والمدير يراها، والقاعة ظاهرة كما كانت', async () => {
  const PR = await import('./peer.ts');
  const reqs = () => [{ id: 'q1', participant_id: PID, cohort_id: 'co1', text: 'سؤال', source: 'free', target_team: 'lead', status: 'open', created_at: '2026-11-10', participants: { full_name: 'سارة', is_demo: false } }];
  for (const [settings, team] of [[[], 'الجميع'], [structuredClone(ON), null]] as const) {
    const w = install({ app_settings: settings as any, peer_requests: reqs(), peer_answers: [], peer_given: [] });
    try {
      const f: any = await PR.forParticipant(PID);
      if (team) assertEquals([f.requests[0].target_team, f.requests[0].target_team_ar], [null, team]);
      else assertEquals(f.requests[0].target_team, 'lead');
      const adm: any = await PR.forParticipant(PID, true);
      assertEquals(adm.requests[0].target_team, 'lead');
      assertEquals(await PR.hallTeams(), !team);
    } finally { w.restore(); }
  }
});
