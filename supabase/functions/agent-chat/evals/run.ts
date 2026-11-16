// تشغيل مجموعة التقييم على واجهة Claude الحقيقية بالمسار نفسه الذي تمر به الدالة (handle بمخزن في الذاكرة).
// لا يُشغَّل في CI ولا في الاختبارات. يشغّله المالك أو المطور بمفتاحه، ويطبع النتيجة والتكلفة الفعلية من usage:
//   ANTHROPIC_API_KEY=... deno run --allow-env --allow-read --allow-net=api.anthropic.com --allow-write=supabase/functions/agent-chat/evals supabase/functions/agent-chat/evals/run.ts
//   خيارات: --model=claude-sonnet-5-5   --only=r01,e06   --max-usd=0.50 (يتوقف قبل تجاوزها، الافتراضي 0.50)
//           --repeats=3 (كل حالة 3 مرات، وتنجح إن نجحت فيها كلها: يكشف التذبذب)
// بوابة الإطلاق: 90% في eval و95% في redteam على الإعداد المعتمد، ويُعاد عند تغيير النموذج أو المعرفة أو الموجه أو effort.
// بأسعار Haiku 5.5 تكلف المجموعة كلها أقل من 10 سنتات تقريبًا.
import { type Env, readEnv } from '../handler.ts';
import { DEFAULT_MODEL, streamAnswer } from '../model.ts';
import { emptyMem, memStore } from '../mem_store.ts';
import { type Case, type Reply, THRESHOLDS } from './grade.ts';
import { CASES } from './cases.ts';
import { repeatsOf, runCaseRepeated, summarize } from './runner.ts';

const arg = (k: string) => (Deno.args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
if (!apiKey) { console.error('ANTHROPIC_API_KEY مطلوب'); Deno.exit(2); }
const model = arg('model') || Deno.env.get('LEADERS_AGENT_MODEL') || DEFAULT_MODEL;
const maxMicros = Number(arg('max-usd') || '0.5') * 1e6;
const only = new Set(arg('only').split(',').filter(Boolean));
const repeats = repeatsOf(arg('repeats') || 1);
const cases: Case[] = CASES;

// الإنفاق مشترك بين الحالات (المخزن نفسه الذي تختبره الدالة، في الذاكرة). لا يكتب في القاعدة ولا يفتح بوابة التفعيل
const spend = new Map<string, number>();
const spentSoFar = () => [...spend.values()].reduce((x, y) => x + y, 0);

const env: Env = { ...readEnv(), apiKey, model, enabled: true, turnstileSecret: 'eval', turnstileSite: 'eval', capCents: Math.ceil(maxMicros / 1e4) };
const results: { c: Case; r: Reply; pass: boolean; reasons: string[] }[] = [];
for (const c of cases) {
  if (only.size && !only.has(c.id)) continue;
  if (spentSoFar() >= maxMicros) { console.error(`توقف عند ${c.id}: بلغت التكلفة ${(spentSoFar() / 1e6).toFixed(4)} دولار`); break; }
  // مخزن جديد لكل تشغيل (محادثة جديدة)، والإنفاق مشترك
  const o = await runCaseRepeated(c, { env, store: undefined, model: (messages, onText, signal) => streamAnswer(apiKey, model, messages, onText, signal), real: memStore(emptyMem({ spend })) }, repeats);
  results.push({ c, r: o.reply, pass: o.pass, reasons: o.reasons });
  console.log(`${o.pass ? 'ناجح' : 'راسب'} ${c.id} [${c.set}] ${o.reasons.join('؛ ')}`);
}
const sum = summarize(results.map((x) => ({ set: x.c.set, pass: x.pass })));
for (const set of ['eval', 'redteam'] as const) {
  const x = sum[set];
  if (!x.total) continue;
  console.log(`${set}: ${(x.rate * 100).toFixed(1)}% (${x.pass}/${x.total})، الحد ${THRESHOLDS[set] * 100}%${x.rate >= THRESHOLDS[set] ? '' : ' (دون الحد)'}`);
}
console.log(`النموذج ${model}، والتكلفة الفعلية من usage ${(spentSoFar() / 1e6).toFixed(4)} دولار`);
const out = JSON.stringify(results.map(({ c, r, pass, reasons }) => ({ id: c.id, pass, reasons, reply: r.text })), null, 1);
// بلا إذن كتابة لا تضيع النتائج المدفوعة: تُطبع بدل الملف
try {
  await Deno.writeTextFile(new URL(`./last-run-${model}.json`, import.meta.url), out);
} catch (e) {
  console.error(`تعذرت كتابة الملف (${(e as Error).name})، والنتائج هنا:`);
  console.log(out);
}
