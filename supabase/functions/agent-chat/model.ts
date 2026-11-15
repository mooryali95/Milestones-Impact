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
  const messages: Anthropic.MessageParam[] = kept.map((t) => ({ role: t.role === 'visitor' ? 'user' : 'assistant', content: t.body }));
  messages.push({ role: 'system', content: contextBlock({ ...context, droppedTurns: dropped }) });
  return { messages, dropped };
}

export function requestParams(model: string, messages: Anthropic.MessageParam[]) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_BLOCKS,
    messages,
    output_config: { effort: 'low' as const },
    inference_geo: 'us',
  };
}

let client: Anthropic | null = null;
export function anthropic(apiKey: string) {
  if (!client) {
    client = new Anthropic({
      apiKey,
      baseURL: 'https://api.anthropic.com',
      maxRetries: 1,
      timeout: 30_000,
      // الاستدعاء عبر fetch العام وقت الطلب، فيحاكيه الاختبار
      fetch: (input, init) => globalThis.fetch(input, init),
    });
  }
  return client;
}
export const resetClient = () => { client = null; };

// البث: كل دفعة نص تمر بـ onText، والنتيجة النهائية من finalMessage (الاستخدام وسبب التوقف)
export async function streamAnswer(apiKey: string, model: string, messages: Anthropic.MessageParam[], onText: (t: string) => void, signal?: AbortSignal): Promise<ModelResult> {
  const stream = anthropic(apiKey).messages.stream(requestParams(model, messages), { signal });
  stream.on('text', (t) => onText(t));
  const msg = await stream.finalMessage();
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
