// «التوجيه والإرشاد» G4a على مسار الخادم: الحالة تمر بالموجّه ثم generate نفسه الذي يجيب به المشارك، والبوابة مغلقة
// ما لم ينجح التقييم وتُفعَّل الدفعة التجريبية
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const { db } = await import('./core.ts');
const G = await import('./guide.ts');
const E = await import('./guide-eval.ts');

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
    const r = await E.runCase({ id: 'a', kind: 'answer', question: 'ما المعلم؟', context: 'handbook', dimension: 'milestone', chapter_key: 'ch1', must_include: ['نقطة قرار'] }, 'sk');
    assertEquals(r.pass, true, r.reasons.join('؛ '));
    assert(JSON.stringify(sent[0].system).includes('المعلم نقطة قرار لا تاريخ'));
    assertEquals(sent[0].model, 'claude-opus-5-5');
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
  assertEquals(E.evalSet().approved_by, null);
  const { evalGate, evalFingerprint } = await import('./guide-eval.js');
  const fp = await evalFingerprint(E.evalSet());
  const passed = { fingerprint: fp, status: 'passed', done_cases: 999, passed_cases: 999, started_at: '2026-11-20' };
  assertEquals(evalGate(E.evalSet(), [passed], fp).reason, 'unapproved');
});

Deno.test('حراسة نصية: التقييم يجيب بـgenerate نفسه، والبوابة تحمل التقييم والدفعة التجريبية، والأفعال للمدير الأعلى', async () => {
  const src = await Deno.readTextFile(new URL('./guide-eval.ts', import.meta.url));
  assert(/await generate\(\{ key, chapter, ctx, text: c\.question, past: \[\] \}\)/.test(src));
  const g = await Deno.readTextFile(new URL('./guide.ts', import.meta.url));
  assert(/evalOk, pilot: !!j\.def\?\.cohort\?\.guidance_pilot/.test(g));
  const idx = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  for (const k of ['guide-eval-start', 'guide-eval-step', 'guide-pilot-set']) assert(new RegExp(`'admin\\.${k}': \\(a, b\\) => A\\.superWriter`).test(idx), k);
});
