// ════════════════════════════════════════════════════════════════
// استدعاء Claude: الطلب الواحد ببث، بلا أدوات (لا قراءة لبيانات المنصة في المرحلة 1)
// ════════════════════════════════════════════════════════════════
// SDK الرسمي بنسخة مثبتة. النموذج من LEADERS_AGENT_MODEL (الافتراضي claude-haiku-5-5 بقرار المالك للتكلفة الأدنى،
// والترقية الموثقة claude-sonnet-5-5 إن لم ينجح التقييم). effort منخفض، وmax_tokens 700 (يشمل التفكير التكيفي
// الذي يعمل افتراضيًا في Haiku 5.5، فلا budget_tokens ولا temperature). inference_geo: "us" في كل طلب كما تقول
// سياسة الخصوصية. الموجه والمعرفة أولًا بنقطة ذاكرة مؤقتة، والسياق المتغير رسالة نظام في آخر الطلب.
import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0';
import { contextBlock, type Context, SYSTEM_BLOCKS } from './prompt.ts';

export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const MAX_TOKENS = 700;
export const HISTORY_TURNS = 8;
// مهلة SDK تغطي انتظار الرؤوس وحدها، فللبث مهلتان هنا: كلية، وخمول بلا أي حدث من الخادم
export const STREAM_TOTAL_MS = 45_000;
export const STREAM_IDLE_MS = 25_000;

export type Turn = { role: 'visitor' | 'agent' | 'canned'; body: string };
export type ModelResult = {
  text: string; stopReason: string | null; model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
};

// آخر HISTORY_TURNS دورًا (رسالة زائر وما بعدها)، والأقدم يُحذف ويُذكر عدده في السياق. النص وحده يُعاد،
// فكتل التفكير السابقة لا تُعاد (مسموح: لا يُحذف دور ويبقى تفكير بعده). أول رسالة للزائر دائمًا.
export function buildMessages(history: Turn[], context: Context): { messages: Anthropic.MessageParam[]; dropped: number } {
  const visitorIdx = history.map((t, i) => (t.role === 'visitor' ? i : -1)).filter((i) => i >= 0);
  const from = visitorIdx.length > HISTORY_TURNS ? visitorIdx[visitorIdx.length - HISTORY_TURNS] : (visitorIdx[0] ?? 0);
  const kept = history.slice(from);
  const dropped = from;
  // رسالة النظام في منتصف المحادثة لا تقبلها الواجهة إلا بعد رسالة مستخدم: يُقطع ما بعد آخر رسالة للزائر
  // (رد طلب موازٍ بالرمز نفسه قد يُكتب بعد رسالة الطلب الحالي)
  while (kept.length && kept[kept.length - 1].role !== 'visitor') kept.pop();
  if (!kept.length) throw new Error('buildMessages: no visitor turn');
  const messages: Anthropic.MessageParam[] = kept.map((t) => ({ role: t.role === 'visitor' ? 'user' : 'assistant', content: t.body }));
  messages.push({ role: 'system', content: contextBlock({ ...context, droppedTurns: dropped }) });
  return { messages, dropped };
}

// thinking 'off': إعادة واحدة بعد رد فارغ (التفكير التكيفي استنفد max_tokens فلم يبق للنص شيء). Haiku 5.5 يقبل
// disabled عند effort منخفض، وSonnet 5.5 يرفضه فبديله between_tools، وما سواهما يبقى على الافتراضي
export type CallOpts = { thinking?: 'off' };
export function thinkingOff(model: string): { type: 'disabled' } | { type: 'between_tools' } | null {
  if (model.startsWith('claude-haiku-5-5')) return { type: 'disabled' };
  if (model.startsWith('claude-sonnet-5-5')) return { type: 'between_tools' };
  return null;
}
export function requestParams(model: string, messages: Anthropic.MessageParam[], opts: CallOpts = {}) {
  const off = opts.thinking === 'off' ? thinkingOff(model) : null;
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_BLOCKS,
    messages,
    output_config: { effort: 'low' as const },
    inference_geo: 'us',
    ...(off ? { thinking: off } : {}),
  };
}

// العميل مربوط بمفتاحه: تدوير المفتاح من اللوحة يبني عميلًا جديدًا (كان يبقى العميل الأول بمفتاحه القديم حتى تُعاد النسخة)
let client: Anthropic | null = null;
let clientKey = '';
export function anthropic(apiKey: string) {
  if (!client || clientKey !== apiKey) {
    clientKey = apiKey;
    client = new Anthropic({
      apiKey,
      // المفتاح الممرر وحده: لا يُلتقط ANTHROPIC_AUTH_TOKEN من البيئة إن وُجد فيُرسل رأسًا آخر
      authToken: null,
      baseURL: 'https://api.anthropic.com',
      maxRetries: 1,
      timeout: 30_000,
      // الاستدعاء عبر fetch العام وقت الطلب، فيحاكيه الاختبار
      fetch: (input, init) => globalThis.fetch(input, init),
    });
  }
  return client;
}
export const resetClient = () => { client = null; clientKey = ''; };

// البث: كل دفعة نص تمر بـ onText، والنتيجة النهائية من finalMessage (الاستخدام وسبب التوقف). يُقطع الطلب
// إن انقطع الزائر (signal) أو تجاوز المهلة الكلية أو خمل البث، فيرمي، ويبقى الاستدعاء محسوبًا بحجزه في السجل.
export async function streamAnswer(apiKey: string, model: string, messages: Anthropic.MessageParam[], onText: (t: string) => void, signal?: AbortSignal, timing = { total: STREAM_TOTAL_MS, idle: STREAM_IDLE_MS }, opts: CallOpts = {}): Promise<ModelResult> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  if (signal?.aborted) ac.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const total = setTimeout(stop, timing.total);
  let idle = setTimeout(stop, timing.idle);
  let msg: Anthropic.Message;
  try {
    const stream = anthropic(apiKey).messages.stream(requestParams(model, messages, opts) as Parameters<Anthropic['messages']['stream']>[0], { signal: ac.signal });
    stream.on('streamEvent', () => { clearTimeout(idle); idle = setTimeout(stop, timing.idle); });
    stream.on('text', (t) => onText(t));
    msg = await stream.finalMessage();
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
    signal?.removeEventListener('abort', stop);
  }
  const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('');
  const u = msg.usage;
  return {
    text,
    stopReason: msg.stop_reason ?? null,
    model: msg.model || model,
    usage: {
      input_tokens: u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
    },
  };
}
