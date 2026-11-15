// ════════════════════════════════════════════════════════════════
// بصمة الإعداد المنشور: النموذج والمعرفة والموجه ومجموعة التقييم
// ════════════════════════════════════════════════════════════════
// مصدر واحد تقرؤه agent-chat (هل الإعداد المنشور هو الذي نجح تقييمه) وleaders-api (التقييم وبوابة التفعيل).
// أي تغيير في واحد منها يغير البصمة، فيطفئ المساعد حتى يُعاد التقييم (agent_eval_stale).
import { KNOWLEDGE_VERSION } from './knowledge.js';
import { HISTORY_TURNS, MAX_TOKENS, requestParams } from './model.ts';
import { SYSTEM_RULES } from './prompt.ts';
import { CASES_SOURCE } from './evals/cases.ts';

export type Versions = { model: string; knowledge_version: string; prompt_version: string; cases_version: string; fingerprint: string };

export async function sha16(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ثوابت الطلب التي تغير السلوك: effort وinference_geo من requestParams نفسها، لا نسخة منها
function requestConstants() {
  const p = requestParams('x', []);
  return JSON.stringify({ max_tokens: MAX_TOKENS, effort: p.output_config, geo: p.inference_geo, history: HISTORY_TURNS });
}

export async function computeVersions(model: string, src: { rules?: string; knowledge?: string; cases?: string } = {}): Promise<Versions> {
  const knowledge_version = src.knowledge ?? KNOWLEDGE_VERSION;
  const prompt_version = await sha16(`${src.rules ?? SYSTEM_RULES}\n${requestConstants()}`);
  const cases_version = await sha16(src.cases ?? CASES_SOURCE);
  return { model, knowledge_version, prompt_version, cases_version, fingerprint: `${model}|${knowledge_version}|${prompt_version}|${cases_version}`.slice(0, 80) };
}

const cache = new Map<string, Promise<Versions>>();
export function versions(model: string): Promise<Versions> {
  if (!cache.has(model)) cache.set(model, computeVersions(model));
  return cache.get(model)!;
}
