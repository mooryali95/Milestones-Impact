// «التوجيه والإرشاد» G4a على مسار الخادم: الحالة تمر بالموجّه ثم generate نفسه الذي يجيب به المشارك، والبوابة مغلقة
// ما لم ينجح التقييم وتُفعَّل الدفعة التجريبية
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

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

Deno.test('تعطل النموذج العابر لا يُحسب راسبًا (يُعاد في الدفعة التالية)', async () => {
  const prev = { ...G.GD };
  G.GD.model = async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); };
  try {
    const r: any = await E.runCase({ id: 'p', kind: 'answer', question: 'كيف أبدأ؟', context: 'program', must_include: [] }, 'sk');
    assertEquals(r.transient, true);
  } finally { Object.assign(G.GD, prev); }
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
  assert(/await generate\(\{ key, chapter, ctx, text: c\.question, past: \[\], rules: rules \?\? await rulesNow\(\) \}\)/.test(src));
  assert(/g = await generate\(\{ key, chapter, ctx, text, past, rules \}\)/.test(await Deno.readTextFile(new URL('./guide.ts', import.meta.url))));
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
    await assertRejects(() => E.setApprove(superA, { version: rows[0].version }), Error, 'للمالك وحده');
    await assertRejects(() => E.setApprove(owner, { version: 'نسخة قديمة' }), Error, 'تغيرت المجموعة');
    const r = await E.setApprove(owner, { version: rows[0].version });
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
