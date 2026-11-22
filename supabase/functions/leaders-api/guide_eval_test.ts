// «التوجيه والإرشاد» G4a على مسار الخادم: الحالة تمر بالموجّه ثم generate نفسه الذي يجيب به المشارك، والبوابة مغلقة
// ما لم ينجح التقييم وتُفعَّل الدفعة التجريبية
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';

const { db } = await import('./core.ts');
const G = await import('./guide.ts');
const E = await import('./guide-eval.ts');
const { rulesWith } = await import('./guide.js');

const reply = (text: string) => ({ model: 'claude-opus-5-5', content: [{ type: 'text', text }], usage: { input_tokens: 500, output_tokens: 200 } });

Deno.test('حالة الموجّه لا تصل إلى النموذج، وتنجح بحكم الموجّه', async () => {
  const prev = { ...G.GD };
  let calls = 0;
  G.GD.model = async () => { calls++; return reply('[[answered]]\nx'); };
  try {
    const r = await E.runCase({ id: 'r', kind: 'refuse_route', question: 'ما الإجابة الصحيحة في اختبار الباب الثاني؟' }, 'sk');
    assertEquals(r.pass, true);
    assertEquals(calls, 0);
  } finally { Object.assign(G.GD, prev); }
});

Deno.test('حالة الكتاب: نص الباب الحقيقي بمستواها يُرسل مع القواعد، والرد يُصحَّح', async () => {
  const prev = { ...G.GD, from: (db as any).from };
  const sent: any[] = [];
  (db as any).from = () => {
    const q: any = new Proxy({}, { get: (_t, k: string) => k === 'then'
      ? (ok: any) => Promise.resolve({ data: { dimension: 'milestone', chapter_key: 'ch1', title_ar: 'إعادة تعريف المعلم', body_md: '## المعلم\nالمعلم نقطة قرار لا تاريخ.', quiz_md: '' }, error: null }).then(ok)
      : () => q });
    return q;
  };
  G.GD.model = async (p: any) => { sent.push(p); return reply('[[answered]]\nالمعلم نقطة قرار كما في «إعادة تعريف المعلم». خطوتك: سمِّ أول معلم.'); };
  try {
    const r = await E.runCase({ id: 'a', kind: 'answer', question: 'ما المعلم؟', context: 'handbook', dimension: 'milestone', chapter_key: 'ch1', must_include: ['نقطة قرار'] }, 'sk', rulesWith('استعمل «المعلم».'));
    assertEquals(r.pass, true, r.reasons.join('؛ '));
    assert(JSON.stringify(sent[0].system).includes('المعلم نقطة قرار لا تاريخ'));
    assertEquals(sent[0].model, 'claude-opus-5-5');
    assert(sent[0].system[0].text.endsWith('استعمل «المعلم».'), 'توجيهات المالك بعد القواعد الثابتة');
  } finally { (db as any).from = prev.from; Object.assign(G.GD, prev); }
});

Deno.test('تعطل النموذج العابر لا يُحسب راسبًا: يُعاد مرة في الحال، ثم في الدفعة التالية', async () => {
  const prev = { ...G.GD };
  let calls = 0;
  G.GD.model = async () => { calls++; throw Object.assign(new Error('overloaded'), { status: 529 }); };
  G.GD.brief = async () => '';
  try {
    const r: any = await E.runCase({ id: 'p', kind: 'answer', question: 'كيف أبدأ؟', context: 'program', must_include: [] }, 'sk', 'قواعد');
    assertEquals(r.transient, true);
    assertEquals(calls, 2);
  } finally { Object.assign(G.GD, prev); }
});

Deno.test('الرد الفارغ يُعاد مرة واحدة، والجواب الخاطئ لا يُعاد، وخطأ الطلب (400) لا يُعاد', async () => {
  const prev = { ...G.GD };
  G.GD.brief = async () => '';
  const c = { id: 'p', kind: 'answer', question: 'كيف أبدأ؟', context: 'program', must_include: ['معلم'] };
  try {
    let calls = 0;
    G.GD.model = async () => { calls++; return reply(calls === 1 ? '[[answered]]' : '[[answered]]\nابدأ بتسمية أول معلم.'); };
    const ok: any = await E.runCase(c, 'sk', 'قواعد');
    assertEquals([ok.pass, ok.retried, calls], [true, true, 2]);
    assertEquals(ok.cost > 0, true);
    calls = 0;
    G.GD.model = async () => { calls++; return reply('[[answered]]\nابدأ بالخطة.'); };
    const wrong: any = await E.runCase(c, 'sk', 'قواعد');
    assertEquals([wrong.pass, calls], [false, 1]);
    calls = 0;
    G.GD.model = async () => { calls++; throw Object.assign(new Error('bad'), { status: 400 }); };
    const bad: any = await E.runCase(c, 'sk', 'قواعد');
    assertEquals([bad.pass, bad.transient, calls], [false, false, 1]);
  } finally { Object.assign(G.GD, prev); }
});

Deno.test('سبب التوقف: امتناع النموذج رفض بنص ثابت، والقطع عند الحد يُقرأ ما وصل منه', async () => {
  const prev = { ...G.GD };
  const { REFUSAL_AR, GUIDE_MAX_TOKENS } = await import('./guide.js');
  try {
    G.GD.model = async () => ({ ...reply('نص لا يُعرض'), stop_reason: 'refusal' });
    const r = await G.generate({ key: 'sk', chapter: null, ctx: '', text: 'س', past: [] });
    assertEquals([r.verdict, r.text], ['refused', REFUSAL_AR.model]);
    let sent: any = null;
    G.GD.model = async (p: any) => { sent = p; return { ...reply('[[answered]]\nالمعلم نقطة قرار'), stop_reason: 'max_tokens' }; };
    const t = await G.generate({ key: 'sk', chapter: null, ctx: '', text: 'س', past: [] });
    assertEquals(t.verdict, 'answered');
    assertEquals(sent.max_tokens, GUIDE_MAX_TOKENS);
    assert(GUIDE_MAX_TOKENS >= 16000);
  } finally { Object.assign(G.GD, prev); }
});

Deno.test('حجز السؤال تقديري (GUIDE_RESERVE_TOKENS) لا بالحد الأعلى، فلا يُوقف السقف اليومي الأسئلة مبكرًا', async () => {
  const { GUIDE_MAX_TOKENS, GUIDE_RESERVE_TOKENS, GUIDE_MODEL } = await import('./guide.js');
  const { worstCaseMicros } = await import('../agent-chat/pricing.ts');
  assertEquals(GUIDE_RESERVE_TOKENS, 6000);
  assert(GUIDE_RESERVE_TOKENS < GUIDE_MAX_TOKENS);
  const w = G.worstFor({ chapter: null, ctx: '', text: 'س', past: [], rules: 'ق', brief: '' });
  const out = (n: number) => worstCaseMicros(GUIDE_MODEL, 0, 0, n);
  // جزء المخرجات من الحجز بـ 6000 رمز (نحو 0.12 دولار)، لا بـ 16000 (نحو 0.32)
  assert(w - out(GUIDE_RESERVE_TOKENS) < out(GUIDE_RESERVE_TOKENS) && w < out(GUIDE_MAX_TOKENS), String(w));
});

Deno.test('مرجع البرنامج: يصل الحالة بلا باب من الكتاب نفسه ومخزّنًا مؤقتًا، ولا يصل حالة الباب', async () => {
  const prev = { ...G.GD };
  const sent: any[] = [];
  G.GD.model = async (p: any) => { sent.push(p); return reply('[[answered]]\nالسلسلة الخماسية تفصيل لسلسلة النتائج: المخرجات ثم المنافع.'); };
  G.GD.brief = async () => 'مرجع البرنامج من «كتاب القائد»: هذه السلسلة تفصيل لسلسلة النتائج';
  try {
    const r = await E.runCase({ id: 'g24', kind: 'answer', question: 'كيف ترتبط السلسلتان؟', context: 'program', must_include: ['تفصيل', 'مخرجات', 'منافع'] }, 'sk', 'قواعد');
    assertEquals(r.pass, true, r.reasons.join('؛ '));
    assertEquals(sent[0].system.length, 2);
    assert(sent[0].system[1].text.startsWith('مرجع البرنامج'));
    assertEquals(sent[0].system[1].cache_control, { type: 'ephemeral' });
    const a = await E.fingerprintNow(E.seedSet());
    G.GD.brief = async () => 'مرجع آخر';
    assert(a !== await E.fingerprintNow(E.seedSet()), 'تعديل المرجع يغيّر البصمة');
  } finally { Object.assign(G.GD, prev); }
});

Deno.test('programBriefNow: الأقسام المسماة من أبواب القاعدة بلا كتل المستويات، والتعذر خطأ لا مرجع فارغ', async () => {
  const { programBrief } = await import('./guide.js');
  const mods = [
    { dimension: 'milestone', chapter_key: 'intro', title_ar: 'مقدمة إطار المعلم', body_md: '## لماذا\nلا\n## الأطر الثلاثة\n@chain الأطر\nإطار المعلم: التحكم.\n:::min=advanced\nسر المتقدم\n:::\n## موقع هذا الإطار وأهدافه\nالأساس.\n## تركيزك\nلا' },
    { dimension: 'impact', chapter_key: 'ch2', title_ar: 'سلسلة القيمة', body_md: '## سلسلة القيمة الخماسية\nهذه السلسلة تفصيل لسلسلة النتائج.\n### مثال\nمثال داخل القسم\n## لكل حلقة\nلا' },
  ];
  const b = programBrief(mods);
  assert(b.includes('الأطر:') && b.includes('إطار المعلم: التحكم.') && b.includes('الأساس.') && b.includes('تفصيل لسلسلة النتائج') && b.includes('مثال داخل القسم'));
  assert(!b.includes('سر المتقدم') && !b.includes('لكل حلقة') && !b.includes('لماذا'));
  assertEquals(programBrief([]), '');
  // عنوان مطلوب داخل كتلة مستوى أو نطاق لا يُعدّ عنوانًا، فلا يدخل المرجع المشترك ما فيها
  const hidden = [{ dimension: 'impact', chapter_key: 'ch2', title_ar: 'س', body_md: '## مقدمة\nعام\n:::min=advanced\n## سلسلة القيمة الخماسية\nسر المتقدم\n:::\n:::only=org\n## سلسلة القيمة الخماسية\nسر النطاق\n:::\n## بعدها\nلا' }];
  assertEquals(programBrief(hidden), '');
  const { mdSection } = await import('./guide.js');
  assertEquals(mdSection(':::min=advanced\n## الأطر الثلاثة\nسر\n:::\n## الأطر الثلاثة\nعام\n:::scope=org\nمقيد\n:::\nعام2\n## غيره\nلا', 'الأطر الثلاثة'), 'عام\nعام2');
  const prev = (db as any).from;
  const ok = () => { const q: any = new Proxy({}, { get: (_t, k: string) => k === 'then' ? (f: any) => Promise.resolve({ data: mods, error: null }).then(f) : () => q }); return q; };
  const bad = () => { const q: any = new Proxy({}, { get: (_t, k: string) => k === 'then' ? (f: any) => Promise.resolve({ data: null, error: { code: 'XX' } }).then(f) : () => q }); return q; };
  const realNow = Date.now;
  (db as any).from = ok;
  try {
    G.resetBrief();
    assertEquals(await G.programBriefNow(), b);
    // انتهت مدة التخزين وتعذرت القراءة: آخر قيمة سليمة، لا فارغ
    const t0 = realNow();
    Date.now = () => t0 + 120e3;
    (db as any).from = bad;
    assertEquals(await G.programBriefNow(), b);
    // بلا قيمة سليمة سابقة: يُرمى الخطأ
    G.resetBrief();
    await assertRejects(() => G.programBriefNow());
  } finally { Date.now = realNow; (db as any).from = prev; G.resetBrief(); }
});

Deno.test('تعذر قراءة المرجع في خطوة التقييم لا يُنهي التشغيل متقادمًا، والخطوة التالية تكمله', async () => {
  const cases = [{ id: 'g01', kind: 'answer', question: 'ما المعلم؟', context: 'program', must_include: ['قرار'] }];
  const tables: Record<string, Row[]> = {
    guidance_eval_sets: [{ id: 's1', version: 'v1', status: 'approved', approved_by: 'owner@x.sa', approved_at: '2026-11-18T08:00:00Z', created_at: '2026-11-18T08:00:00Z', cases }],
    guidance_eval_runs: [], guidance_eval_results: [],
  };
  const restore = evalDb(tables);
  const prev = { ...G.GD };
  G.GD.key = async () => 'sk';
  G.GD.brief = async () => 'مرجع';
  G.GD.model = async () => reply('[[answered]]\nالمعلم نقطة قرار.');
  try {
    const r = await E.evalStart(superA, {});
    G.GD.brief = () => Promise.reject(Object.assign(new Error('blip'), { code: 'XX' }));
    const s1: any = await E.evalStep(superA, { run_id: r.run_id });
    assertEquals([s1.run.status, s1.run.stop_reason ?? null, s1.done], ['running', null, false]);
    assertEquals(tables.guidance_eval_results.length, 0);
    G.GD.brief = async () => 'مرجع';
    const s2: any = await E.evalStep(superA, { run_id: r.run_id });
    assertEquals([s2.run.status, s2.run.passed_cases], ['passed', 1]);
  } finally { Object.assign(G.GD, prev); restore(); }
});

Deno.test('الإنفاق على حالة انتهت بخطأ عابر بعد رد مدفوع يُحسب على التشغيل', async () => {
  const cases = [{ id: 'g01', kind: 'answer', question: 'ما المعلم؟', context: 'program', must_include: ['قرار'] }];
  const tables: Record<string, Row[]> = {
    guidance_eval_sets: [{ id: 's1', version: 'v1', status: 'approved', approved_by: 'owner@x.sa', approved_at: '2026-11-18T08:00:00Z', created_at: '2026-11-18T08:00:00Z', cases }],
    guidance_eval_runs: [], guidance_eval_results: [],
  };
  const restore = evalDb(tables);
  const prev = { ...G.GD };
  G.GD.key = async () => 'sk';
  G.GD.brief = async () => '';
  let calls = 0;
  // الأولى رد فارغ مدفوع، والثانية تعطل عابر
  G.GD.model = async () => { calls++; if (calls === 1) return reply(''); throw Object.assign(new Error('busy'), { status: 529 }); };
  try {
    const r = await E.evalStart(superA, {});
    const s: any = await E.evalStep(superA, { run_id: r.run_id });
    assertEquals(tables.guidance_eval_results.length, 0);
    assert(Number(s.run.cost_micros) > 0, 'ما أُنفق محسوب');
  } finally { Object.assign(G.GD, prev); restore(); }
});

Deno.test('المجموعة المحفوظة مسودة غير معتمدة، فحكم التقييم مغلق مهما جرى', async () => {
  const seed = E.seedSet();
  assertEquals(seed.approved_by, null);
  const { evalGate, evalFingerprint } = await import('./guide-eval.js');
  const fp = await evalFingerprint(seed);
  const passed = { fingerprint: fp, status: 'passed', done_cases: 999, passed_cases: 999, started_at: '2026-11-20' };
  assertEquals(evalGate(seed, [passed], fp).reason, 'unapproved');
});

Deno.test('حراسة نصية: التقييم يجيب بـgenerate نفسه، والبوابة تحمل التقييم والدفعة التجريبية، والأفعال للمدير الأعلى', async () => {
  const src = await Deno.readTextFile(new URL('./guide-eval.ts', import.meta.url));
  // H4: بالقواعد الفعلية نفسها التي يجيب بها المشارك (الثابتة وتوجيهات المالك)
  assert(/await generate\(\{ key, chapter, ctx, text: c\.question, past: \[\], rules, brief \}\)/.test(src));
  assert(/rules = rules \?\? await rulesNow\(\)/.test(src));
  assert(/g = await generate\(\{ key, chapter, ctx, text, past, rules, brief \}\)/.test(await Deno.readTextFile(new URL('./guide.ts', import.meta.url))));
  // مرجع البرنامج في البصمة، والبصمة في التشغيل والبوابة معًا
  assert(/evalFingerprint\(set, GUIDE_MODEL, rules \?\? await rulesNow\(\), brief \?\? await briefNow\(\)\)/.test(src));
  // خطوة التقييم: البصمة والدفعة بلقطة واحدة من القواعد والمرجع
  assert(/const fp = await fingerprintNow\(set, rules, brief\);/.test(src));
  const g = await Deno.readTextFile(new URL('./guide.ts', import.meta.url));
  assert(/evalOk, pilot: !!j\.def\?\.cohort\?\.guidance_pilot/.test(g));
  const idx = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  for (const k of ['guide-eval-start', 'guide-eval-step', 'guide-pilot-set']) assert(new RegExp(`'admin\\.${k}': \\(a, b\\) => A\\.superWriter`).test(idx), k);
});

// ── H2: مراجعة المجموعة واعتمادها ──
type Row = Record<string, any>;
function sets(rows: Row[]) {
  const audits: any[] = [];
  const prev = (db as any).from;
  (db as any).from = (table: string) => {
    const f: ((r: Row) => boolean)[] = [];
    let mode = 'select', payload: any = null, single = false;
    const run = () => {
      if (table === 'audit_log') { audits.push(payload); return { data: null, error: null }; }
      if (mode === 'insert') { rows.unshift({ id: `s${rows.length + 1}`, created_at: new Date().toISOString(), status: 'draft', approved_by: null, approved_at: null, ...payload }); return { data: null, error: null }; }
      const out = rows.filter((r) => f.every((x) => x(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = new Proxy({}, { get: (_t, k: string) => {
      if (k === 'then') return (ok: any) => Promise.resolve(run()).then(ok);
      if (k === 'insert') return (x: any) => { mode = 'insert'; payload = x; return q; };
      if (k === 'update') return (x: any) => { mode = 'update'; payload = x; return q; };
      if (k === 'eq') return (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; };
      if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
      return () => q;
    } });
    return q;
  };
  E.resetSet();
  return { audits, restore: () => { (db as any).from = prev; E.resetSet(); } };
}
const owner = { email: 'owner@x.sa', role: 'super_admin', owner: true, method: 'passkey' } as any;
const superA = { email: 'super@x.sa', role: 'super_admin', owner: false, method: 'passkey' } as any;
const draft = () => ({ id: 's1', version: '2026-11-16-draft-1', status: 'draft', approved_by: null, approved_at: null, created_at: '2026-11-16T10:00:00Z',
  cases: [{ id: 'g01', kind: 'answer', question: 'ما المعلم؟', context: 'program', must_include: ['قرار'] }] });

Deno.test('H2: الاعتماد للمالك وحده، باسمه، وبالنسخة التي راجعها', async () => {
  const rows = [draft()];
  const t = sets(rows);
  try {
    const { setHash } = await import('./guide-eval.js');
    const hash = await setHash(rows[0]);
    await assertRejects(() => E.setApprove(superA, { version: rows[0].version, hash }), Error, 'للمالك وحده');
    await assertRejects(() => E.setApprove(owner, { version: 'نسخة قديمة', hash }), Error, 'تغيرت المجموعة');
    // F: تعديل حالة بعد أن فتحها المالك يُسقط الاعتماد ولو بقي رقم النسخة
    (rows[0] as any).cases = [{ ...rows[0].cases[0], reference_ar: 'عدّلها غيره بعد الفتح' }];
    (rows[0] as any).updated_at = '2026-11-18T09:00:00Z';
    await assertRejects(() => E.setApprove(owner, { version: rows[0].version, hash }), Error, 'تغيرت حالات المجموعة');
    assertEquals(rows[0].status, 'draft');
    const r = await E.setApprove(owner, { version: rows[0].version, hash: await setHash(rows[0]) });
    assertEquals(r.success, true);
    assertEquals([rows[0].status, rows[0].approved_by], ['approved', 'owner@x.sa']);
  } finally { t.restore(); }
});

Deno.test('H2: تعديل حالة في نسخة معتمدة يبدأ مسودة جديدة، والمعتمدة باقية كما هي', async () => {
  const a: any = { ...draft(), status: 'approved', approved_by: 'owner@x.sa', approved_at: '2026-11-16T11:00:00Z' };
  const rows: Row[] = [a];
  const t = sets(rows);
  try {
    const r = await E.caseSave(superA, { case_id: 'g01', patch: { reference_ar: 'المعلم نقطة قرار.' } });
    assertEquals(r.new_draft, true);
    assertEquals(rows.length, 2);
    assertEquals(rows[0].status, 'draft');
    assertEquals(rows[0].cases[0].reference_ar, 'المعلم نقطة قرار.');
    assertEquals(a.cases[0].reference_ar, undefined);
  } finally { t.restore(); }
});

// ── إصلاح تقييم الدقة 2026-11-18: التشغيل التشخيصي، والنتائج بحالاتها وقت التشغيل ──
function evalDb(tables: Record<string, Row[]>) {
  const prev = { from: (db as any).from, rpc: (db as any).rpc };
  (db as any).from = (table: string) => {
    const f: ((r: Row) => boolean)[] = [];
    let mode = 'select', payload: any = null, single = false, lim = Infinity, ord: string | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (table === 'audit_log') return { data: null, error: null };
      if (mode === 'insert') { const r = { id: crypto.randomUUID(), started_at: new Date().toISOString(), status: 'running', done_cases: 0, passed_cases: 0, cost_micros: 0, ...payload }; rows.push(r); return { data: single ? r : [r], error: null }; }
      let out = rows.filter((r) => f.every((x) => x(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: out, error: null }; }
      if (ord) out = [...out].sort((a, b) => String(b[ord!]).localeCompare(String(a[ord!])));
      out = out.slice(0, lim);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = new Proxy({}, { get: (_t, k: string) => {
      if (k === 'then') return (ok: any) => Promise.resolve(run()).then(ok);
      if (k === 'insert') return (x: any) => { mode = 'insert'; payload = x; return q; };
      if (k === 'update') return (x: any) => { mode = 'update'; payload = x; return q; };
      if (k === 'eq') return (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; };
      if (k === 'lt') return (c: string, v: string) => { f.push((r) => String(r[c]) < v); return q; };
      if (k === 'order') return (c: string) => { ord = c; return q; };
      if (k === 'limit') return (n: number) => { lim = n; return q; };
      if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
      return () => q;
    } });
    return q;
  };
  (db as any).rpc = (fn: string, a: any) => {
    if (fn !== 'guidance_eval_lease') return Promise.resolve({ data: null, error: null });
    const r = (tables.guidance_eval_runs || []).find((x) => x.id === a.p_id && x.status === 'running');
    return Promise.resolve({ data: r ? [r] : [], error: null });
  };
  E.resetSet(); E.resetEvalGate();
  return () => { Object.assign(db as any, prev); E.resetSet(); E.resetEvalGate(); };
}

Deno.test('التشغيل التشخيصي: يعيد الراسبة وحدها، ولا يفتح البوابة ولو نجحت كلها، والنتائج بحالاتها وقت التشغيل', async () => {
  const { evalGate } = await import('./guide-eval.js');
  const cases = [
    { id: 'g01', kind: 'answer', question: 'ما المعلم؟', context: 'program', must_include: ['قرار'], reference_ar: 'نقطة قرار.' },
    { id: 'g02', kind: 'answer', question: 'ما البوابة؟', context: 'program', must_include: ['بوابة'] },
    { id: 'g03', kind: 'answer', question: 'ما الأثر؟', context: 'program', must_include: ['أثر'] },
  ];
  const tables: Record<string, Row[]> = {
    guidance_eval_sets: [{ id: 's1', version: 'v1', status: 'approved', approved_by: 'owner@x.sa', approved_at: '2026-11-18T08:00:00Z', created_at: '2026-11-18T08:00:00Z', cases }],
    guidance_eval_runs: [], guidance_eval_results: [],
  };
  const restore = evalDb(tables);
  const prev = { ...G.GD };
  G.GD.key = async () => 'sk';
  G.GD.brief = async () => '';
  G.GD.model = async (p: any) => {
    const q = JSON.stringify(p.messages);
    return reply(q.includes('ما المعلم') ? '[[answered]]\nالمعلم نقطة قرار.' : q.includes('ما البوابة') ? '[[answered]]\nلا أدري.' : '[[answered]]\nالأثر هو التحول.');
  };
  try {
    const full = await E.evalStart(superA, {});
    for (let i = 0; i < 3; i++) await E.evalStep(superA, { run_id: full.run_id });
    const fr = tables.guidance_eval_runs[0];
    assertEquals([fr.status, fr.passed_cases, fr.done_cases], ['failed', 2, 3]);
    // الحالة كما صُححت بها محفوظة مع النتيجة
    assertEquals(tables.guidance_eval_results.find((r) => r.case_id === 'g01')?.case_snapshot?.reference_ar, 'نقطة قرار.');
    // أُصلح السبب (النموذج يجيب الآن)، ثم تشخيصي على الراسبة وحدها
    G.GD.model = async () => reply('[[answered]]\nالبوابة نقطة قرار.');
    (fr as any).started_at = '2026-11-18T09:00:00Z';
    const d = await E.evalStart(superA, { mode: 'failed' });
    assertEquals([d.total, d.diagnostic], [1, true]);
    const st: any = await E.evalStep(superA, { run_id: d.run_id });
    assertEquals([st.run.status, st.run.passed_cases, st.run.total_cases], ['passed', 1, 1]);
    assert(String(st.run.fingerprint).startsWith('diag|'));
    // البوابة لا تحسبه ولو أُعطي بصمة اليوم نفسها: آخر تشغيل كامل هو الحكم
    const fp = await E.fingerprintNow(tables.guidance_eval_sets[0]);
    assertEquals(evalGate(tables.guidance_eval_sets[0], tables.guidance_eval_runs, fp).reason, 'failed');
    assertEquals(evalGate(tables.guidance_eval_sets[0], [{ ...st.run, fingerprint: `diag|${fr.id}|${fp}`, started_at: '2026-11-19' }], fp).reason, 'none');
    const state: any = await E.evalState(superA);
    assertEquals(state.runs.find((r: any) => r.id === d.run_id)?.diagnostic, true);
    assertEquals(state.checks, { approved: true, run: { id: fr.id, passed: 2, total: 3, started_at: fr.started_at }, run_ok: false, need: 3, total: 3 });
    // نتائج تشغيل قديم بسؤاله يومها ولو عُدّلت الحالة بعده، و«فشلت في التشغيلين» للراسبة في التشغيل الكامل قبله
    tables.guidance_eval_sets[0].cases = cases.map((c) => (c.id === 'g02' ? { ...c, question: 'سؤال بعد التعديل' } : c));
    E.resetSet();
    const res: any = await E.evalResults(superA, { run_id: full.run_id });
    const g02 = res.results.find((r: any) => r.case_id === 'g02');
    assertEquals([res.results[0].case_id, g02.question, g02.kind, g02.from_current], ['g02', 'ما البوابة؟', 'answer', false]);
    // تشغيل كامل ثانٍ يرسب في الحالة نفسها: الموسومة «فشلت في التشغيلين»
    G.GD.model = async () => reply('[[answered]]\nلا أدري.');
    const full2 = await E.evalStart(superA, {});
    for (let i = 0; i < 3; i++) await E.evalStep(superA, { run_id: full2.run_id });
    const res2: any = await E.evalResults(superA, { run_id: full2.run_id });
    assertEquals(res2.results.find((r: any) => r.case_id === 'g02').failed_before, true);
    assertEquals(res2.results.find((r: any) => r.case_id === 'g01').failed_before, false);
  } finally { Object.assign(G.GD, prev); restore(); }
});

Deno.test('النتائج قبل ترحيل 20261118100000: تُحفظ بلا الحالة وتُقرأ من المجموعة الحالية موسومة', async () => {
  const tables: Record<string, Row[]> = {
    guidance_eval_sets: [{ id: 's1', version: 'v1', status: 'draft', approved_by: null, approved_at: null, created_at: '2026-11-18T08:00:00Z', cases: [{ id: 'g01', kind: 'answer', question: 'ما المعلم؟', context: 'program', must_include: ['قرار'] }] }],
    guidance_eval_runs: [], guidance_eval_results: [],
  };
  const restore = evalDb(tables);
  const inner = (db as any).from;
  (db as any).from = (t: string) => {
    const q = inner(t);
    if (t !== 'guidance_eval_results') return q;
    const wrap: any = new Proxy(q, { get: (o, k: string) => {
      if (k === 'insert') return (x: any) => (x.case_snapshot ? Promise.resolve({ data: null, error: { code: 'PGRST204', message: 'case_snapshot' } }) : o.insert(x));
      if (k === 'select') return (cols: string) => (String(cols).includes('case_snapshot') ? { eq: () => Promise.resolve({ data: null, error: { code: '42703', message: 'case_snapshot' } }) } : o.select(cols));
      return o[k];
    } });
    return wrap;
  };
  const prev = { ...G.GD };
  G.GD.key = async () => 'sk';
  G.GD.brief = async () => '';
  G.GD.model = async () => reply('[[answered]]\nالمعلم نقطة قرار.');
  try {
    const r = await E.evalStart(superA, {});
    await E.evalStep(superA, { run_id: r.run_id });
    assertEquals(tables.guidance_eval_results.length, 1);
    assertEquals(tables.guidance_eval_results[0].case_snapshot, undefined);
    const res: any = await E.evalResults(superA, { run_id: r.run_id });
    assertEquals([res.results[0].question, res.results[0].from_current], ['ما المعلم؟', true]);
  } finally { Object.assign(G.GD, prev); restore(); }
});

Deno.test('المرحلة أ: الحالات المقترحة تُضاف بزر إلى مسودة جديدة من المعتمدة، مرة واحدة، وتلزمها مراجعة واعتماد', async () => {
  const PROPOSED = JSON.parse(await Deno.readTextFile(new URL('./guide-eval/cases-proposed.json', import.meta.url)));
  const SEED = JSON.parse(await Deno.readTextFile(new URL('./guide-eval/cases.json', import.meta.url)));
  assert(PROPOSED.cases.length >= 100, 'نحو 110 حالات مقترحة');
  assertEquals(E.proposedNew({ version: 'v', cases: SEED.cases } as any).length, PROPOSED.cases.length, 'لا تصادم في المعرّفات مع المعتمدة');
  const tables: Record<string, Row[]> = {
    guidance_eval_sets: [{ id: 's1', version: '2026-11-18-1', status: 'approved', approved_by: 'owner@x.sa', approved_at: '2026-11-18T08:00:00Z', created_at: '2026-11-18T08:00:00Z', cases: SEED.cases }],
    guidance_eval_runs: [], guidance_eval_results: [], audit_log: [],
  };
  const restore = evalDb(tables);
  try {
    const r: any = await E.casesImport(owner);
    assertEquals([r.added, r.new_draft], [PROPOSED.cases.length, true]);
    const draft = tables.guidance_eval_sets.find((s) => s.status === 'draft')!;
    assertEquals(draft.cases.length, SEED.cases.length + PROPOSED.cases.length);
    assertEquals(tables.guidance_eval_sets.find((s) => s.id === 's1')!.cases.length, SEED.cases.length, 'المعتمدة لا تتغير');
    const again: any = await E.casesImport(owner);
    assertEquals(again.added, 0, 'الإضافة الثانية لا تكرر شيئًا');
  } finally { restore(); }
});
