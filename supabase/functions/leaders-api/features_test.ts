// مفاتيح الميزات قيد البناء (P1): القاعة وكاتون و360 مطفأة افتراضيًا، ويرفضها الخادم برمز كل منها، والمدير مستثنى
// إلا فتح القاعة، والمهمة الساعية لا تذكّر ولا تغلق، وبريد 360 في الطابور يُمسك، ومقيّم 360 يرى «متوقف مؤقتًا» ومقيّم
// الأثر قبل البرنامج وبعده كما كان، ورسائل الورشة بلا القاعة، وبطاقة المنسق null، وقفل القاعة مغلق، والدرجة لا تتغير.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail, hash, workshopMail, WORKSHOP_MAIL, FEEDBACK_MAIL, drainMailQueue, stuckQueueAlert } = await import('./core.ts');
const FT = await import('./features.ts');
const FB = await import('./feedback360.ts');
const H = await import('./hall.ts');
const { raterGet, raterSubmit } = await import('./impact.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { DEFAULTS, resolveSettings } = await import('./settings.js');
const { coordFeedbackShown, featureFlags, featureGate, FEATURE_ACTIONS, FEATURE_OFF_AR, RATER_PAUSED_AR, WORKSHOP_NO_HALL_NOTE } = await import('./features.js');

type Row = Record<string, any>;
// قاعدة في الذاكرة: eq وneq وin وis وcontains وlimit والعدّ، والإدراج والتحديث، وكل كتابة تُسجَّل
function install(tables: Record<string, Row[]>) {
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
  assertEquals(featureGate('f360.mine', off), { soft: { success: true, enabled: false, ready: true } });
  assertEquals(featureGate('xp.f360', off), { soft: { success: true, approvals: [], reports: [] } });
  assertEquals(featureGate('xp.hall', off)?.soft?.off, true);
  // المدير يبني الميزة: قراءتها وتحريرها وإغلاق جلسة قائمة، ولا يفتح قاعة لا يدخلها أحد
  for (const a of ['admin.hall', 'admin.hall-close', 'admin.hall-step', 'admin.katon', 'admin.katon-sentence-save', 'admin.f360', 'admin.f360-close', 'admin.f360-report', 'admin.settings-save']) {
    assertEquals([a, featureGate(a, off)], [a, null]);
  }
  assertEquals([featureGate('admin.hall-open', off)?.fail?.code, featureGate('admin.hall-open', off)?.fail?.status], ['hall_off', 409]);
  // ما لا تحكمه ميزة يمر، وكل فعل محكوم يمر حين تُظهَر ميزته
  for (const a of ['me', 'impact.mine', 'rater.invite', 'peer.ask', 'workshop.checkin', 'katon.answer']) assertEquals([a, featureGate(a, off)], [a, null]);
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

Deno.test('360 المخفي: إغلاق المدير المبكر يُنفَّذ بلا بريد ولا يجري المهمة على غير دورته', async () => {
  const w = f360World(false);
  try {
    const r: any = await FB.adminClose({ email: 'admin@x.sa' }, { cycle_id: CYC });
    assertEquals([r.success, r.closed, r.mailed], [true, 1, false]);
    assertEquals(w.tables.feedback_cycles.map((c) => c.status), ['closed', 'open']);
    assertEquals(w.tables.feedback_cycles[0].reminded_days, []);
  } finally { w.restore(); }
});

Deno.test('بريد 360 في الطابور يُمسك حين يُخفى: لا يُرسل ولا يُعد محاولة ولا يُنبَّه إليه عالقًا، وغيره لا يُمسك', async () => {
  const old = new Date(Date.now() - 8 * 36e5).toISOString();
  const queue = () => [
    { id: 'm-inv', kind: 'bulk', created_at: old, to_email: 'p@x.sa', subject: 'طلب تقدير من سارة', html: '<p/>', ref: `rater:${'0'.repeat(8)}-0000-4000-8000-0000000000f1`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-ready', kind: 'bulk', created_at: old, to_email: 'adv@x.sa', subject: FEEDBACK_MAIL.ready.subject('سارة'), html: '<p/>', ref: `participant:${PID}`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-pre', kind: 'bulk', created_at: old, to_email: 'm@x.sa', subject: 'طلب تقدير من سارة', html: '<p/>', ref: `rater:${'0'.repeat(8)}-0000-4000-8000-0000000000f2`, attempts: 0, sent_at: null, gave_up_at: null },
    { id: 'm-ws', kind: 'bulk', created_at: old, to_email: 'p@x.sa', subject: WORKSHOP_MAIL.day.subject, html: '<p/>', ref: 'ws1', attempts: 0, sent_at: null, gave_up_at: null },
  ];
  const raters = [{ id: `${'0'.repeat(8)}-0000-4000-8000-0000000000f1`, phase: 'f360' }, { id: `${'0'.repeat(8)}-0000-4000-8000-0000000000f2`, phase: 'pre' }];
  let w = install({ app_settings: [], mail_queue: queue(), raters });
  try {
    const held = await FT.heldMail();
    assertEquals([...held].sort(), ['m-inv', 'm-ready']);
    // الطابور كله ممسَك: لا محاولة ولا كتابة، ويُذكر عدد الممسَك
    w.tables.mail_queue = w.tables.mail_queue.filter((m) => held.has(m.id));
    const r: any = await drainMailQueue(40, held);
    assertEquals([r.sent, r.held], [0, 2]);
    assertEquals(w.writes.filter((x) => x.table === 'mail_queue'), []);
    assertEquals(w.tables.mail_queue.map((m) => m.attempts), [0, 0]);
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

Deno.test('مقيّمو الأثر قبل البرنامج وبعده (pre وpost) يعملون و360 مخفي: المسار نفسه لا يمسه المفتاح', async () => {
  for (const phase of ['pre', 'post'] as const) {
    const w = await raterWorld(phase, false);
    try {
      const r: any = await raterGet({ t: TOKEN });
      assertEquals([phase, r.success, r.phase, r.done], [phase, true, phase, false]);
      assertEquals(typeof w.tables.raters[0].opened_at, 'string');
    } finally { w.restore(); }
  }
});

Deno.test('رسائل الورشة والقاعة مخفية: ملاحظة بلا «القاعة» والحضور برمز QR، ومُظهَرة كما كانت', () => {
  for (const kind of ['invite', 'day', 'hour'] as const) {
    const off = workshopMail(kind, 'سارة', 'اليوم الأول', 'الأحد', 'قاعة التدريب', null, false, false);
    assertEquals([kind, off.includes(WORKSHOP_NO_HALL_NOTE[kind]), off.includes('«القاعة»'), off.includes('الجولات'), off.includes('QR')], [kind, true, false, false, true]);
    const on = workshopMail(kind, 'سارة', 'اليوم الأول', 'الأحد', 'قاعة التدريب', null);
    assertEquals([kind, on.includes(WORKSHOP_MAIL[kind].note)], [kind, true]);
    for (const n of Object.values(WORKSHOP_NO_HALL_NOTE)) assertEquals(/القاعة|كاتون|360|[\u2013\u2014]/.test(n), false);
  }
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
