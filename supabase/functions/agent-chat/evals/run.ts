// تشغيل مجموعة التقييم على واجهة Claude الحقيقية بالمسار نفسه الذي تمر به الدالة (handle بمخزن في الذاكرة).
// لا يُشغَّل في CI ولا في الاختبارات. يشغّله المالك أو المطور بمفتاحه، ويطبع النتيجة والتكلفة الفعلية من usage:
//   ANTHROPIC_API_KEY=... deno run --allow-env --allow-read --allow-net=api.anthropic.com supabase/functions/agent-chat/evals/run.ts
//   خيارات: --model=claude-sonnet-5-5   --only=r01,e06   --max-usd=0.50 (يتوقف قبل تجاوزها، الافتراضي 0.50)
// بوابة الإطلاق: 90% في eval و95% في redteam على الإعداد المعتمد، ويُعاد عند تغيير النموذج أو المعرفة أو الموجه أو effort.
// بأسعار Haiku 5.5 تكلف المجموعة كلها أقل من 10 سنتات تقريبًا.
import { handle, type Deps, type Env, readEnv } from '../handler.ts';
import { DEFAULT_MODEL, streamAnswer } from '../model.ts';
import { emptyMem, memStore } from '../mem_store.ts';
import { type Case, grade, type Reply, THRESHOLDS } from './grade.ts';

const arg = (k: string) => (Deno.args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
if (!apiKey) { console.error('ANTHROPIC_API_KEY مطلوب'); Deno.exit(2); }
const model = arg('model') || Deno.env.get('LEADERS_AGENT_MODEL') || DEFAULT_MODEL;
const maxMicros = Number(arg('max-usd') || '0.5') * 1e6;
const only = new Set(arg('only').split(',').filter(Boolean));
const { cases } = JSON.parse(await Deno.readTextFile(new URL('./cases.json', import.meta.url))) as { cases: Case[] };

// الإنفاق مشترك بين الحالات (المخزن نفسه الذي تختبره الدالة، في الذاكرة)
const spend = new Map<string, number>();
const spentSoFar = () => [...spend.values()].reduce((x, y) => x + y, 0);

const env: Env = { ...readEnv(), apiKey, model, enabled: true, turnstileSecret: 'eval', turnstileSite: 'eval', capCents: Math.ceil(maxMicros / 1e4) };
const results: { c: Case; r: Reply; pass: boolean; reasons: string[] }[] = [];
for (const c of cases) {
  if (only.size && !only.has(c.id)) continue;
  if (spentSoFar() >= maxMicros) { console.error(`توقف عند ${c.id}: بلغت التكلفة ${(spentSoFar() / 1e6).toFixed(4)} دولار`); break; }
  const deps: Deps = {
    store: memStore(emptyMem({ spend })), env, clientIp: () => null, turnstile: async () => true, notifyAdmin: async () => {}, alert: async () => true,
    model: (messages, onText, signal) => streamAnswer(apiKey, model, messages, onText, signal),
  };
  const post = (body: Record<string, unknown>) => handle(new Request('http://eval', { method: 'POST', body: JSON.stringify(body) }), deps);
  const { token } = await (await post({ action: 'start', page: c.page, locale: c.expect.lang, captcha: 'eval-token-xx' })).json();
  const res = await post({ action: 'send', token, message: c.message });
  const text = await res.text();
  const done = text.split('\n\n').find((b) => b.startsWith('event: done') || b.startsWith('event: capped') || b.startsWith('event: error')) || '';
  const data = JSON.parse(done.match(/^data: (.+)$/m)?.[1] || '{}');
  const kind = done.match(/^event: (\w+)/)?.[1];
  const r: Reply = { text: data.text || '', handoff: !!data.handoff, source: kind === 'done' ? data.source : (kind as Reply['source']) };
  if (r.source === 'canned') r.cannedId = c.expect.canned ?? null;
  const g = grade(c, r);
  results.push({ c, r, ...g });
  console.log(`${g.pass ? 'ناجح' : 'راسب'} ${c.id} [${c.set}] ${g.reasons.join('؛ ')}`);
}
for (const set of ['eval', 'redteam'] as const) {
  const rs = results.filter((x) => x.c.set === set);
  if (!rs.length) continue;
  const rate = rs.filter((x) => x.pass).length / rs.length;
  console.log(`${set}: ${(rate * 100).toFixed(1)}% (${rs.filter((x) => x.pass).length}/${rs.length})، الحد ${THRESHOLDS[set] * 100}%${rate >= THRESHOLDS[set] ? '' : ' (دون الحد)'}`);
}
console.log(`النموذج ${model}، والتكلفة الفعلية من usage ${(spentSoFar() / 1e6).toFixed(4)} دولار`);
await Deno.writeTextFile(new URL(`./last-run-${model}.json`, import.meta.url), JSON.stringify(results.map(({ c, r, pass, reasons }) => ({ id: c.id, pass, reasons, reply: r.text })), null, 1));
