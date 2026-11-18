// «التوجيه والإرشاد» G2 على مسار الخادم الحقيقي (guide.ts) بقاعدة في الذاكرة ونموذج مُحاكى.
// يثبت ضمانات v4: لا تداخل بين مشارك وآخر في القراءة والكتابة والحذف وما يُرسل للنموذج، والتخزين المؤقت على المشترك
// وحده، والحدان والسقف، وما لا يصل إلى رد لا يُحسب، والحارس بعد النموذج، والسجلات بلا نص.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

const { db } = await import('./core.ts');
const G = await import('./guide.ts');
const { REFUSAL_AR } = await import('./guide.js');
const { DEFAULTS } = await import('./settings.js');

type Row = Record<string, any>;
// جداول في الذاكرة بما يستعمله guide.ts: select وeq وgte وorder وlimit وinsert وdelete، وrpc للحجز
function install(tables: Record<string, Row[]>, rpc: Record<string, (a: any) => any> = {}) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'delete' | 'update' = 'select';
    let payload: any = null;
    let limit = Infinity, single = false;
    let order: { c: string; asc: boolean } | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: ++seq, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: out, error: null }; }
      let list = [...out];
      if (order) list.sort((a, b) => (a[order!.c] < b[order!.c] ? -1 : 1) * (order!.asc ? 1 : -1));
      list = list.slice(0, limit);
      return { data: single ? list[0] ?? null : list, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return () => q;
        if (k === 'insert') return (x: any) => { mode = 'insert'; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'update') return (x: any) => { mode = 'update'; payload = x; return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; };
        if (k === 'gte') return (c: string, v: string) => { filters.push((r) => r[c] != null && r[c] >= v); return q; };
        if (k === 'order') return (c: string, o?: { ascending?: boolean }) => { order = { c, asc: o?.ascending !== false }; return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const calls: { fn: string; args: any }[] = [];
  const prev = { from: (db as any).from, rpc: (db as any).rpc };
  Object.assign(db as any, {
    from,
    rpc: (fn: string, args: any) => { calls.push({ fn, args }); return Promise.resolve(rpc[fn] ? rpc[fn](args) : { data: null, error: null }); },
  });
  return { tables, calls, restore: () => Object.assign(db as any, prev) };
}

const S: any = { ...DEFAULTS.guidance, enabled: true };
const ready = { s: S, j: { journey: [{ status: 'active', title_ar: 'التدريب' }], progress: 40, initiative: false, def: {} }, gate: { ok: true, reason: null }, key: 'sk-test' };
const p1 = { id: 'p1', full_name: 'سارة', email: 'sara@x.sa' };
const p2 = { id: 'p2', full_name: 'خالد', email: 'khalid@x.sa' };

// الحجز الذري كما في الترحيل: يُدرج السؤال في الجدول نفسه ما لم يبلغ الحد
const claimFrom = (t: { tables: Record<string, Row[]> }, result?: number) => (a: any) => {
  if (result !== undefined && result < 0) return { data: result, error: null };
  const row = { id: 1000 + (t.tables.guidance_messages?.length || 0), participant_id: a.p_participant, role: 'user', body: a.p_body, context: a.p_context, chapter_id: a.p_chapter, verdict: null, created_at: new Date().toISOString() };
  (t.tables.guidance_messages ||= []).push(row);
  return { data: row.id, error: null };
};

function setup(tables: Record<string, Row[]>, o: { claim?: number; reserve?: number | null; reply?: string; fail?: boolean } = {}) {
  const box: any = {};
  const t = install(tables, {
    guidance_claim: (a) => box.claim(a),
    guidance_spend_reserve: () => ({ data: o.reserve === undefined ? 1000 : o.reserve, error: null }),
    guidance_spend_settle: () => ({ data: 0, error: null }),
  });
  box.claim = claimFrom(t, o.claim);
  const sent: any[] = [];
  const prev = { ...G.GD };
  Object.assign(G.GD, {
    gate: async () => ready,
    titles: async () => ['إعادة تعريف المعلم'],
    model: async (params: any) => {
      sent.push(params);
      if (o.fail) throw Object.assign(new Error('down'), { status: 529 });
      return { model: 'claude-opus-5-5', content: [{ type: 'text', text: o.reply ?? '[[answered]]\nالمعلم نقطة قرار. ابدأ بتسمية معلمك الأول في «إعادة تعريف المعلم».' }],
        usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 1200 } };
    },
  });
  return { t, sent, restore: () => { t.restore(); Object.assign(G.GD, prev); } };
}

Deno.test('العزل: المشارك يرى محادثته وحدها، وما يُرسل للنموذج لا يحمل شيئًا من محادثة غيره', async () => {
  const secret = 'سر خالد: ميزانية مشروعي ثلاثة ملايين';
  const x = setup({ guidance_messages: [
    { id: 1, participant_id: 'p2', role: 'user', body: secret, verdict: null, created_at: new Date().toISOString() },
    { id: 2, participant_id: 'p2', role: 'assistant', body: 'رد على خالد', verdict: 'answered', created_at: new Date().toISOString() },
  ] });
  try {
    const st = await G.guideState(p1);
    assertEquals(st.messages, []);
    const r = await G.guideAsk(p1, { text: 'كيف أحدد معلمي الأول؟', participant_id: 'p2' });
    assertEquals(r.reply.verdict, 'answered');
    const wire = JSON.stringify(x.sent[0]);
    assert(!wire.includes(secret) && !wire.includes('رد على خالد'), 'لا يصل للنموذج شيء من محادثة مشارك آخر');
    assert(!wire.includes('sara@x.sa') && !wire.includes('سارة'), 'ولا اسم صاحب الجلسة ولا بريده');
    // participant_id في جسم الطلب لا أثر له: السؤال والرد لصاحب الجلسة
    const mine = x.t.tables.guidance_messages.filter((m) => m.participant_id === 'p1');
    assertEquals(mine.map((m) => m.role), ['user', 'assistant']);
    assertEquals((await G.guideState(p2)).messages.map((m: any) => m.body), [secret, 'رد على خالد']);
  } finally { x.restore(); }
});

Deno.test('التخزين المؤقت على القواعد ونص الباب وحدهما، وسياق المشارك وسؤاله خارجه', async () => {
  const x = setup({});
  try {
    G.GD.chapter = async () => ({ title: 'إعادة تعريف المعلم', md: 'المعلم نقطة قرار لا تاريخ.', quiz: [] });
    await G.guideAsk(p1, { text: 'ما المعلم؟', context: 'handbook', chapter_id: 'hb-1' });
    const req = x.sent[0];
    assertEquals(req.system.map((b: any) => b.cache_control?.type), ['ephemeral', 'ephemeral']);
    assert(!JSON.stringify(req.system).includes('ما المعلم؟') && !JSON.stringify(req.system).includes('التدريب'), 'لا سؤال ولا موضع في الجزء المخزّن');
    const last = req.messages.at(-1);
    assertEquals(last.role, 'user');
    assert(JSON.stringify(last.content).includes('سياق المشارك') && JSON.stringify(last.content).includes('ما المعلم؟'));
    assertEquals(req.model, 'claude-opus-5-5');
    assertEquals(req.thinking, { type: 'adaptive' });
    assertEquals(req.inference_geo, 'us');
  } finally { x.restore(); }
});

Deno.test('مرجع البرنامج: السؤال من الرحلة يصله مقتطف الكتاب مخزّنًا مؤقتًا بعد القواعد، والسؤال من الباب نص الباب وحده', async () => {
  const x = setup({});
  try {
    G.GD.brief = async () => 'مرجع البرنامج من «كتاب القائد»: السلسلة الخماسية تفصيل لسلسلة النتائج';
    await G.guideAsk(p1, { text: 'كيف ترتبط السلسلتان؟' });
    const req = x.sent[0];
    assertEquals(req.system.map((b: any) => b.cache_control?.type), ['ephemeral', 'ephemeral']);
    assert(req.system[1].text.startsWith('مرجع البرنامج'));
    assert(!JSON.stringify(req.system).includes('كيف ترتبط'), 'لا سؤال في الجزء المخزّن');
    G.GD.chapter = async () => ({ title: 'إعادة تعريف المعلم', md: 'المعلم نقطة قرار لا تاريخ.', quiz: [] });
    await G.guideAsk(p1, { text: 'ما المعلم؟', context: 'handbook', chapter_id: 'hb-1' });
    assertEquals(x.sent[1].system.length, 2);
    assert(x.sent[1].system[1].text.startsWith('نص باب «إعادة تعريف المعلم»') && !x.sent[1].system[1].text.includes('السلسلة الخماسية'));
  } finally { x.restore(); }
});

Deno.test('الوسم داخل تنسيق خفيف يُقرأ، ولا يرى المشارك وسمًا باقيًا في النص', async () => {
  const x = setup({}, { reply: '**[[answered]]**\nالمعلم نقطة قرار [[unsure]] كما في «إعادة تعريف المعلم».' });
  try {
    const r = await G.guideAsk(p1, { text: 'ما المعلم؟' });
    assertEquals(r.reply.verdict, 'answered');
    assert(!r.reply.text.includes('[['), r.reply.text);
  } finally { x.restore(); }
});

Deno.test('الإخفاء (H3، قرار المالك v8 ب): «احذف محادثتي» يخفي صفوف صاحب الجلسة وحده، وتبقى النسخة ومحسوبة من الحد', async () => {
  const now = new Date().toISOString();
  const x = setup({ guidance_messages: [
    { id: 1, participant_id: 'p1', role: 'user', body: 'سؤالي', verdict: 'answered', created_at: now },
    { id: 2, participant_id: 'p2', role: 'user', body: 'سؤال خالد', verdict: 'answered', created_at: now },
  ], audit_log: [] });
  try {
    const r = await G.guideClear(p1);
    assertEquals([r.hidden, r.deleted], [1, 0]);
    const rows = x.t.tables.guidance_messages;
    assertEquals(rows.length, 2, 'النسخة باقية حتى نهاية مدة الحفظ');
    assert(rows.find((m) => m.id === 1)!.hidden_at, 'صف صاحب الجلسة موسوم بوقت الإخفاء');
    assertEquals(rows.find((m) => m.id === 2)!.hidden_at ?? null, null, 'صف مشارك آخر لا يُمس');
    assertEquals((await G.guideState(p1)).messages, [], 'المخفي لا يعود إلى المشارك');
    assertEquals((await G.guideState(p2)).messages.length, 1);
    assertEquals((await G.guideState(p1)).left.day, S.daily_questions - 1, 'الإخفاء لا يفتح أسئلة جديدة');
    assertEquals((await G.guideClear(p1)).hidden, 0, 'الإخفاء مرة ثانية لا يمس شيئًا');
    const log: any = x.t.tables.audit_log.at(-2);
    assertEquals(log.after, { hidden: 1 });
    assert(!JSON.stringify(x.t.tables.audit_log).includes('سؤالي'), 'السجل بلا نص');
  } finally { x.restore(); }
});

Deno.test('الإخفاء قبل الترحيل 20261116180000: يبقى حذفًا كما كان', async () => {
  const x = setup({ guidance_messages: [{ id: 1, participant_id: 'p1', role: 'user', body: 'سؤالي', created_at: new Date().toISOString() }], audit_log: [] });
  const from = (db as any).from;
  (db as any).from = (t: string) => {
    const q = from(t);
    return new Proxy(q, { get: (o, k: string) => k === 'update' ? () => ({ eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: null, error: { code: '42703', message: 'column hidden_at does not exist' } }) }) }) }) : o[k] });
  };
  try {
    const r = await G.guideClear(p1);
    assertEquals([r.deleted, r.hidden], [1, 0]);
    assertEquals(x.t.tables.guidance_messages.length, 0);
  } finally { (db as any).from = from; x.restore(); }
});

Deno.test('الموجّه: سؤال الاختبار يُرفض بلا نموذج ولا يُحسب من الحد', async () => {
  const x = setup({});
  try {
    const r = await G.guideAsk(p1, { text: 'ما الإجابة الصحيحة في اختبار الباب الثاني؟' });
    assertEquals(r.reply, { text: REFUSAL_AR.quiz, verdict: 'refused' });
    assertEquals(x.sent.length, 0);
    assertEquals(x.t.calls.filter((c) => c.fn === 'guidance_claim').length, 0);
    assertEquals(r.left, { day: S.daily_questions, month: S.monthly_questions });
  } finally { x.restore(); }
});

Deno.test('الحدان: بلوغ حد اليوم أو الشهر يُرفض برسالة واضحة ولا يصل للنموذج', async () => {
  for (const [code, re] of [[-1, /حد اليوم/], [-2, /حد الشهر/]] as const) {
    const x = setup({}, { claim: code });
    try {
      await assertRejects(() => G.guideAsk(p1, { text: 'كيف أبدأ مبادرتي؟' }), Error, re.source.replace(/\\/g, ''));
      assertEquals(x.sent.length, 0);
    } finally { x.restore(); }
  }
});

Deno.test('السقف اليومي وتعطل النموذج: السؤال يُحذف فلا يُحسب على المشارك', async () => {
  for (const o of [{ reserve: null }, { fail: true }]) {
    const x = setup({}, o);
    try {
      await assertRejects(() => G.guideAsk(p1, { text: 'كيف أبدأ مبادرتي؟' }));
      assertEquals((x.t.tables.guidance_messages || []).length, 0);
    } finally { x.restore(); }
  }
});

Deno.test('الحارس: رد يكشف إجابة سؤال الباب يُستبدل برفض، والبريد والرابط يُحجبان', async () => {
  const quiz = [{ q: 'ما الذي يميز المعلم عن المهمة في إدارة المشاريع؟', options: ['أنه نقطة قرار لا عمل', 'أنه أطول مدة'], answer: 0 }];
  const x = setup({}, { reply: '[[answered]]\nما الذي يميز المعلم عن المهمة؟ الجواب: أنه نقطة قرار لا عمل.' });
  try {
    G.GD.chapter = async () => ({ title: 'المعلم', md: 'نص', quiz });
    const r = await G.guideAsk(p1, { text: 'اشرح لي الفرق', context: 'handbook', chapter_id: 'hb-1' });
    assertEquals(r.reply.verdict, 'refused');
    assertEquals(r.reply.text, REFUSAL_AR.quiz);
  } finally { x.restore(); }
  const y = setup({}, { reply: '[[answered]]\nراسلني على help@evil.example أو https://evil.example/x' });
  try {
    const r = await G.guideAsk(p1, { text: 'من أراسل؟' });
    assert(!r.reply.text.includes('evil.example'));
  } finally { y.restore(); }
});

Deno.test('البوابة: لا يعمل بلا نسخة سياسة، ولا لمن لم يوافق على نسختها الجوهرية (G4b)', async () => {
  const { guideGate, GUIDE_POLICY_VERSION } = await import('./guide.js');
  assertEquals(guideGate({ policyVersion: null, consentVersion: '2026-11-19', enabled: true, companion: true, ready: true, hasKey: true }), { ok: false, reason: 'policy' });
  assertEquals(guideGate({ consentVersion: '2026-11-21', enabled: true, evalOk: true, pilot: true, companion: true, ready: true, hasKey: true }).reason, 'consent', `قبل ${GUIDE_POLICY_VERSION}`);
  const x = setup({});
  try {
    G.GD.gate = async () => ({ ...ready, gate: { ok: false, reason: 'policy' } });
    await assertRejects(() => G.guideAsk(p1, { text: 'سؤال' }), Error, 'لم يُفعَّل');
    assertEquals(x.sent.length, 0);
  } finally { x.restore(); }
});

Deno.test('حراسة نصية: كل استعلام على المحادثات مقيد بصاحب الجلسة، ولا معرّف من جسم الطلب، والسجل بلا نص', async () => {
  const src = await Deno.readTextFile(new URL('./guide.ts', import.meta.url));
  const qs = src.match(/db\.from\('guidance_messages'\)[^;]*/g) || [];
  assert(qs.length >= 4);
  // الاستثناء الوحيد: توزيع الإدارة على الجهات والدفعات (guideBreakdown) يقرأ كل المشاركين بأعمدة بلا نص، محددة حرفيًا
  const ADMIN_COUNTS = "db.from('guidance_messages').select('participant_id, role, verdict, confirmed_at, cost_micros')";
  for (const q of qs) assert(/\.eq\('participant_id', (p\.id|pid)\)|insert\(row\)/.test(q) || q.startsWith(ADMIN_COUNTS), q);
  assert(!/b\.(participant_id|participant|pid|conversation_id)/.test(src), 'لا يُقرأ معرّف مشارك أو محادثة من الطلب');
  for (const line of src.split('\n').filter((l) => /console\.(log|error)/.test(l))) assert(!/text|answer|body|raw/.test(line.replace(/'[^']*'/g, '')), line);
});

Deno.test('G3 «أريد التأكد»: يُسجَّل على رد صاحب الجلسة وحده، ومعرّف رسالة غيره لا يغيّر شيئًا', async () => {
  const x = setup({ guidance_messages: [
    { id: 7, participant_id: 'p1', role: 'assistant', body: 'رد سارة', confirmed_at: null, created_at: new Date().toISOString() },
    { id: 8, participant_id: 'p2', role: 'assistant', body: 'رد خالد', confirmed_at: null, created_at: new Date().toISOString() },
  ] });
  try {
    assertEquals(await G.guideConfirm(p1, { message_id: 8 }), { success: true });
    assertEquals(x.t.tables.guidance_messages.find((m) => m.id === 8)?.confirmed_at, null);
    await G.guideConfirm(p1, { message_id: 7 });
    assert(x.t.tables.guidance_messages.find((m) => m.id === 7)?.confirmed_at);
    assertEquals(await G.guideConfirm(p1, { message_id: 'x; drop' }), { success: true });
  } finally { x.restore(); }
});

Deno.test('G3 الأعداد: من دالة القاعدة بمعرّف المشارك، وأرقام وحدها', async () => {
  const x = setup({});
  try {
    x.t.calls.length = 0;
    (db as any).rpc = (fn: string, a: any) => { x.t.calls.push({ fn, args: a }); return Promise.resolve({ data: [{ asked: 5, unsure: 1, confirmed: 2, last_at: '2026-11-15T10:00:00Z' }], error: null }); };
    assertEquals(await G.guideCounts('p1'), { asked: 5, unsure: 1, confirmed: 2, last_at: '2026-11-15T10:00:00Z', days: 30 });
    assertEquals(x.t.calls[0].fn, 'guidance_counts');
    assertEquals(x.t.calls[0].args.p_participant, 'p1');
  } finally { x.restore(); }
});

Deno.test('G3 حراسة: لا يقرأ جدول المحادثات إلا guide.ts، والملف والتقرير يمرّان بدوال الأعداد', async () => {
  const dir = new URL('./', import.meta.url);
  const hits: string[] = [];
  for await (const f of Deno.readDir(dir)) {
    if (!f.isFile || !/\.(ts|js)$/.test(f.name) || /_test\.ts$/.test(f.name)) continue;
    const src = await Deno.readTextFile(new URL(f.name, dir));
    if (/from\('guidance_messages'\)/.test(src)) hits.push(f.name);
  }
  // الاستثناء المسمى: سجل المحادثات (H3) بصلاحية المالك، ويُحرس في guide_transcripts_test.ts
  assertEquals(hits.sort(), ['guide-transcripts.ts', 'guide.ts']);
  const file = await Deno.readTextFile(new URL('./file.ts', import.meta.url));
  assert(/guidance: adv \? await guideCounts\(p\.id\) : null/.test(file), 'للمستشار وحده من الخبراء');
  const src = await Deno.readTextFile(new URL('./guide.ts', import.meta.url));
  const from = src.indexOf('export async function guideReport');
  const report = src.slice(from, src.indexOf('\nexport ', from + 10));
  assert(!/guidance_messages/.test(report), 'التقرير لا يقرأ الجدول مباشرة');
});
