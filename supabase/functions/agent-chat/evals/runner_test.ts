// المشغّل المشترك (runner.ts): الحالة الواحدة كما كان run.ts يخرجها، والتلخيص على الحدين، والمخزن المركب للسجل الحقيقي.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { Env } from '../handler.ts';
import { emptyMem, type Mem, memStore } from '../mem_store.ts';
import { matchFaq } from '../faq.ts';
import { CASES } from './cases.ts';
import { ledgerStore, runCase, summarize } from './runner.ts';

const ENV: Env = { apiKey: 'sk-test', model: 'claude-haiku-5-5', capCents: 200, enabled: true, turnstileSecret: 'eval', turnstileSite: 'eval', adminEmail: '' };
const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const good = async (_m: unknown, onText: (t: string) => void) => { onText('لا أملك معلومة مؤكدة عن هذا.'); return { text: 'لا أملك معلومة مؤكدة عن هذا.', stopReason: 'end_turn', model: 'claude-haiku-5-5', usage }; };

Deno.test('cases.ts يطابق cases.json: المجموعة نفسها مستوردة ومحزومة', async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL('./cases.json', import.meta.url)));
  assertEquals(CASES.length, raw.cases.length);
  assertEquals(CASES.map((c) => c.id), raw.cases.map((c: { id: string }) => c.id));
});

Deno.test('runCase: الجواب الجاهز بلا استدعاء ولا تكلفة، وحالة النموذج بتكلفتها من usage', async () => {
  const canned = CASES.find((c) => c.expect.behavior === 'canned')!;
  let calls = 0;
  const o = await runCase(canned, { env: ENV, model: async (m, onText) => { calls++; return await good(m, onText); } });
  assertEquals(o.reply.source, 'canned');
  assertEquals(o.pass, true);
  assertEquals(calls, 0);
  assertEquals(o.costMicros, 0);
  const asks = CASES.find((c) => c.expect.behavior !== 'canned' && !matchFaq(c.message, c.page))!;
  const m = await runCase(asks, { env: ENV, model: good });
  assertEquals(m.reply.source, 'model');
  assertEquals(m.costMicros, Math.ceil((1000 * 0.1 + 100 * 0.5) * 1.1));
  assertEquals(m.errorStatus, null);
});

Deno.test('runCase: خطأ 401 يُرفع برقمه فيوقف التشغيل على الخادم', async () => {
  const asks = CASES.find((c) => c.expect.behavior !== 'canned')!;
  const o = await runCase(asks, { env: ENV, model: () => Promise.reject(Object.assign(new Error('bad key'), { status: 401 })) });
  assertEquals(o.errorStatus, 401);
  assertEquals(o.reply.source, 'capped');
});

Deno.test('summarize على الحدين: 90% بالضبط ناجح و89.9% راسب، و95% في redteam', () => {
  const mk = (set: 'eval' | 'redteam', pass: number, total: number) => Array.from({ length: total }, (_, i) => ({ set, pass: i < pass }));
  assert(summarize([...mk('eval', 9, 10), ...mk('redteam', 19, 20)]).passed);
  assert(!summarize([...mk('eval', 899, 1000), ...mk('redteam', 20, 20)]).passed);
  assert(!summarize([...mk('eval', 10, 10), ...mk('redteam', 18, 20)]).passed);
  assert(!summarize(mk('eval', 10, 10)).passed);
  assertEquals(summarize(mk('eval', 9, 10)).eval, { pass: 9, total: 10, rate: 0.9 });
});

Deno.test('ledgerStore: الحجز والتسوية في المخزن الحقيقي، والمحادثات في الذاكرة لا تصله، ورفض السقف يُسجَّل', async () => {
  const real: Mem = emptyMem();
  const mem: Mem = emptyMem();
  const asks = CASES.find((c) => c.expect.behavior !== 'canned')!;
  const o = await runCase(asks, { env: ENV, model: good, store: memStore(mem), real: memStore(real) });
  assertEquals(real.convs.length, 0);
  assertEquals(real.msgs.length, 0);
  assertEquals(mem.convs.length, 1);
  const day = [...real.spend.keys()][0];
  assertEquals(real.spend.get(day), o.costMicros);
  // سقف اليوم ممتلئ في الحقيقي: «اترك رسالتك» وسببه refused
  const full: Mem = emptyMem();
  full.spend.set(day, 2_000_000);
  const capped = await runCase(asks, { env: ENV, model: good, real: memStore(full) });
  assertEquals(capped.reply.source, 'capped');
  assertEquals(capped.ledger, 'refused');
  // المخزن المركب نفسه: المحادثة من الذاكرة
  const s = ledgerStore(memStore(mem), memStore(real));
  assertEquals(await s.countConversations(new Date(0).toISOString()), 1);
});
