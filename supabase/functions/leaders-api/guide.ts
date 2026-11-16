// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» G2: محادثة المشارك مع المساعد داخل الرحلة (تصور 2026-11-16 v4)
// ════════════════════════════════════════════════════════════════
// ضمانات v4 في هذا الملف، ويحرسها guide_test.ts:
// - العزل: المشارك من جلسته وحدها (p)، ولا يُقبل من جسم الطلب أي معرّف مشارك أو محادثة. كل قراءة وكتابة وحذف
//   مقيدة بـ participant_id = p.id. والسياق المرسل للنموذج يُبنى لكل طلب من بيانات صاحب الجلسة وحده.
// - التخزين المؤقت للنموذج على القواعد ونص الباب وحدهما (مشتركان بين المشاركين ولا بيانات شخصية فيهما)،
//   وسياق المشارك وسؤاله ومحادثته بعدهما خارج نقطة التخزين.
// - الحدان والسقف ذريان في القاعدة (guidance_claim وguidance_spend_reserve)، والسؤال الذي لا يصل إلى رد يُحذف فلا يُحسب.
// - السجلات بلا نص السؤال ولا الإجابة: المعرّف والزمن والكلفة والحكم وحدها.
import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0';
import { audit, db, Fail } from './core.ts';
import { appSettings } from './settings.ts';
import { approvedLevels, journeyFor } from './participant.ts';
import { companionAllowed, filterHandbookMd, handbookModulesFor, quizFor } from './logic.js';
import { guidanceFor } from './guidance.ts';
import {
  contextLine, GATE_AR, GUIDE_CHAPTER_CHARS, GUIDE_POLICY_VERSION, GUIDE_HISTORY, GUIDE_LIST, GUIDE_MAX_TOKENS, GUIDE_MODEL, GUIDE_RULES,
  guideGate, left, parseReply, quizLeak, REFUSAL_AR, riyadhWindow, routeQuestion,
} from './guide.js';
import { costMicros, estimateTokens, worstCaseMicros } from '../agent-chat/pricing.ts';
import { sanitizeOutput } from '../agent-chat/redact.ts';

type Body = Record<string, any>;
const CONTEXTS = new Set(['program', 'handbook', 'capstone']);
const missing = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /guidance_/.test(String(e.message || '')));
export const UNSURE_AR = 'لست متأكدًا من الإجابة الدقيقة هنا. اطلب استشارة من خبير ليجيبك بما يناسب عملك.';
export const ERROR_AR = 'تعذّر الرد الآن، ولم يُحسب سؤالك. حاول بعد قليل، أو اطلب استشارة.';

// ما يُحقن في الاختبار: النموذج والمفتاح والوقت ونسخة السياسة، وحالة المشارك ونص الباب (تُقرأ لصاحب الجلسة وحده)
export const GD = {
  now: () => Date.now(),
  policy: (): string | null => GUIDE_POLICY_VERSION,
  gate: (p: any): Promise<any> => gateFor(p),
  chapter: (p: any, id: string): Promise<any> => chapterFor(p, id),
  titles: (p: any): Promise<string[]> => chapterTitles(p),
  key: async (): Promise<string> => {
    const { data } = await db.rpc('agent_runtime').then((r: any) => r, () => ({ data: null }));
    const row = Array.isArray(data) ? data[0] : data;
    return String(row?.api_key || Deno.env.get('ANTHROPIC_API_KEY') || '');
  },
  model: async (params: Record<string, unknown>, apiKey: string) => {
    const client = new Anthropic({ apiKey, authToken: null, baseURL: 'https://api.anthropic.com', maxRetries: 1, timeout: 100_000 });
    return await client.messages.create(params as any) as any;
  },
};

// ── البوابة وحالة المشارك: كل ما يُقرأ هنا لصاحب الجلسة وحده ──
async function gateFor(p: any) {
  const s = (await appSettings()).guidance as any;
  // المغلق للجميع (السياسة أو الإعدادات) يُحكم فيه قبل قراءة الرحلة، فلا كلفة على كل مشارك
  const closed = guideGate({ policyVersion: GD.policy(), consentVersion: GD.policy(), enabled: !!s.enabled, companion: true, ready: true, hasKey: true });
  if (closed.reason === 'policy' || closed.reason === 'off') return { s, j: null as any, gate: closed, key: '' };
  const j = await journeyFor(p, { lite: true });
  const org = p.organization_id
    ? (await db.from('organizations').select('companion_allowed').eq('id', p.organization_id).maybeSingle()).data
    : null;
  const signals = j.approved ? await guidanceFor(p.id, !!j.initiative) : null;
  const key = await GD.key().catch(() => '');
  const gate = guideGate({
    policyVersion: GD.policy(), consentVersion: p.consent_version || null, enabled: !!s.enabled, companion: companionAllowed(org, j.def?.cohort || null),
    ready: !!signals?.ready, hasKey: !!key,
  });
  return { s, j, gate, key };
}

// عدّ أسئلة المشارك المحسوبة في يومه وشهره (المرفوضة قبل النموذج لا تُحسب)
async function counts(pid: string) {
  const w = riyadhWindow(GD.now());
  const since = w.month < w.day ? w.month : w.day;
  const { data, error } = await db.from('guidance_messages').select('created_at, verdict')
    .eq('participant_id', pid).eq('role', 'user').gte('created_at', since);
  if (error) throw error;
  const rows = (data || []).filter((r: any) => r.verdict !== 'refused');
  return { day: rows.filter((r: any) => r.created_at >= w.day).length, month: rows.filter((r: any) => r.created_at >= w.month).length };
}

// المحادثة ضمن مدة الحفظ: تُقرأ ما لم يتجاوزها ولو تأخر الحذف اليومي
async function history(pid: string, retentionDays: number, limit: number) {
  const since = new Date(GD.now() - retentionDays * 864e5).toISOString();
  const { data, error } = await db.from('guidance_messages').select('id, role, body, verdict, context, created_at')
    .eq('participant_id', pid).gte('created_at', since).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

export async function guideState(p: any) {
  const { s, gate } = await GD.gate(p);
  try {
    const [c, messages] = await Promise.all([counts(p.id), history(p.id, s.retention_days, GUIDE_LIST)]);
    return { success: true, gate: { ok: gate.ok, reason: gate.reason, message: gate.reason ? (GATE_AR as Record<string, string>)[gate.reason] : null }, left: left(c, s),
      limits: { day: s.daily_questions, month: s.monthly_questions }, retention_days: s.retention_days, messages };
  } catch (e) {
    if (!missing(e)) throw e;
    return { success: true, gate: { ok: false, reason: 'policy', message: GATE_AR.policy }, left: { day: 0, month: 0 }, limits: null, retention_days: null, messages: [] };
  }
}

// نص الباب وأسئلته من كتاب المشارك نفسه: باب لا يخصه يُرفض كما في handbook.chapter
async function chapterFor(p: any, id: string) {
  const levels = await approvedLevels(p);
  const { data: m } = await db.from('handbook_modules').select('id, dimension, min_level, title_ar, body_md, quiz_md').eq('id', id).maybeSingle();
  if (!m || !handbookModulesFor([m], levels).length) throw new Fail('هذا الباب لا يخص مسارك', 404);
  const md = String(filterHandbookMd(m.body_md, (levels as any)[m.dimension], p.work_scope) || '').slice(0, GUIDE_CHAPTER_CHARS);
  return { title: m.title_ar as string, md, quiz: quizFor(m.quiz_md, (levels as any)[m.dimension], p.work_scope) };
}
async function chapterTitles(p: any) {
  const levels = await approvedLevels(p);
  const { data } = await db.from('handbook_modules').select('id, dimension, min_level, sort, title_ar');
  return handbookModulesFor(data || [], levels).map((m: any) => m.title_ar).slice(0, 40);
}

async function save(row: Record<string, unknown>) {
  const { error } = await db.from('guidance_messages').insert(row);
  if (error) throw error;
}

export async function guideAsk(p: any, b: Body) {
  const text = String(b.text ?? '').replace(/\s+\n/g, '\n').trim();
  const where = CONTEXTS.has(String(b.context)) ? String(b.context) : 'program';
  const chapterId = where === 'handbook' && b.chapter_id ? String(b.chapter_id).slice(0, 80) : null;
  const { s, j, gate, key } = await GD.gate(p);
  if (!gate.ok) throw new Fail((GATE_AR as Record<string, string>)[gate.reason], 403, `guide_${gate.reason}`);

  // الموجّه قبل النموذج: الفارغ والطويل لا يُحفظان، وخارج النطاق يُحفظ مرفوضًا بلا كلفة ولا يُحسب من الحد
  const route = routeQuestion(text);
  if (route.kind === 'refuse' && (route.reason === 'empty' || route.reason === 'long')) throw new Fail(REFUSAL_AR[route.reason], 400, `guide_${route.reason}`);
  if (route.kind === 'refuse') {
    try {
      await save({ participant_id: p.id, role: 'user', body: text, context: where, chapter_id: chapterId, verdict: 'refused' });
      await save({ participant_id: p.id, role: 'assistant', body: REFUSAL_AR[route.reason], context: where, chapter_id: chapterId, verdict: 'refused' });
    } catch (e) { if (missing(e)) throw new Fail(GATE_AR.policy, 409, 'not_migrated'); throw e; }
    return { success: true, reply: { text: REFUSAL_AR[route.reason], verdict: 'refused' }, left: left(await counts(p.id), s) };
  }

  // الحدان: حجز ذري يُدرج السؤال إن بقي له
  const w = riyadhWindow(GD.now());
  const { data: claimed, error: ce } = await db.rpc('guidance_claim', {
    p_participant: p.id, p_body: text, p_context: where, p_chapter: chapterId,
    p_day_start: w.day, p_month_start: w.month, p_daily: s.daily_questions, p_monthly: s.monthly_questions,
  });
  if (ce) { if (missing(ce)) throw new Fail(GATE_AR.policy, 409, 'not_migrated'); throw ce; }
  if (Number(claimed) === -1) throw new Fail(`بلغت حد اليوم (${s.daily_questions} أسئلة). تابع غدًا، أو اطلب استشارة الآن.`, 429, 'guide_day');
  if (Number(claimed) === -2) throw new Fail(`بلغت حد الشهر (${s.monthly_questions} سؤالًا). اطلب استشارة لما تحتاجه.`, 429, 'guide_month');
  const questionId = Number(claimed);
  // ما لا يصل إلى رد يُحذف سؤاله فلا يُحسب من الحد (بمعرّفه ومعرّف صاحبه معًا)
  const unclaim = () => db.from('guidance_messages').delete().eq('id', questionId).eq('participant_id', p.id).then(() => null, () => null);

  // التأسيس: نص الباب من كتابه إن سأل من الكتاب، وإلا عناوين أبواب كتابه
  const chapter = chapterId ? await GD.chapter(p, chapterId).catch(async (e) => { await unclaim(); throw e; }) : null;
  const titles = chapter ? [] : await GD.titles(p).catch(() => []);
  const stage = (j.journey || []).find((x: any) => x.status === 'active');
  const ctx = contextLine({ stage: stage?.title_ar || null, progress: j.progress, initiative: !!j.initiative, where, chapter: chapter?.title || null, chapters: titles });

  const past = (await history(p.id, s.retention_days, GUIDE_HISTORY * 2 + 1))
    .filter((m: any) => m.id !== questionId && m.verdict !== 'refused' && m.verdict !== 'error')
    .slice(-GUIDE_HISTORY);
  // الرسائل تتناوب بدءًا بالمشارك: يُسقط ما قبل أول سؤال، ويُدمج المتتالي من الدور نفسه
  const messages: { role: 'user' | 'assistant'; content: any }[] = [];
  for (const m of past) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    if (!messages.length && role !== 'user') continue;
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n\n${m.body}`;
    else messages.push({ role, content: m.body });
  }
  if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
  messages.push({ role: 'user', content: [{ type: 'text', text: ctx }, { type: 'text', text }] });

  const system: any[] = [{ type: 'text', text: GUIDE_RULES, cache_control: { type: 'ephemeral' } }];
  if (chapter) system.push({ type: 'text', text: `نص باب «${chapter.title}» من كتاب المشارك:\n\n${chapter.md}`, cache_control: { type: 'ephemeral' } });

  // السقف اليومي: حجز أسوأ تكلفة قبل الاستدعاء
  const prefix = estimateTokens(GUIDE_RULES) + (chapter ? estimateTokens(chapter.md) : 0);
  const rest = estimateTokens(ctx) + estimateTokens(text) + past.reduce((a: number, m: any) => a + estimateTokens(m.body), 0);
  const worst = worstCaseMicros(GUIDE_MODEL, prefix, rest, GUIDE_MAX_TOKENS);
  const cap = Math.round(Number(s.daily_spend_usd) * 1e6);
  const { data: reserved, error: re } = await db.rpc('guidance_spend_reserve', { p_day: w.dayKey, p_micros: worst, p_cap: cap });
  if (re || reserved === null || reserved === undefined) {
    await unclaim();
    if (re && !missing(re)) console.error('guide reserve', re.code || 'error');
    throw new Fail('بلغ المساعد الذكي حده اليومي. اطلب استشارة، أو عد غدًا.', 429, 'guide_cap');
  }

  let res: any;
  try {
    res = await GD.model({
      model: GUIDE_MODEL, max_tokens: GUIDE_MAX_TOKENS, system, messages,
      thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, inference_geo: 'us',
    }, key);
  } catch (e) {
    // الحجز يبقى محسوبًا (قد يكون فوتر)، والسؤال لا يُحسب على المشارك
    console.error('guide model', (e as any)?.status || (e as Error)?.name);
    await unclaim();
    throw new Fail(ERROR_AR, 502, 'guide_model');
  }
  const cost = costMicros(String(res?.model || GUIDE_MODEL), res?.usage || {});
  await db.rpc('guidance_spend_settle', { p_day: w.dayKey, p_delta: cost - worst }).then(() => null, () => null);

  const raw = (res?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  let { verdict, text: answer } = parseReply(raw);
  if (verdict === 'error') { await unclaim(); throw new Fail(ERROR_AR, 502, 'guide_empty'); }
  // الحارس: لا إجابة اختبار، ولا بريد ولا رابط ولا رقم
  if (chapter && quizLeak(answer, chapter.quiz)) { verdict = 'refused'; answer = REFUSAL_AR.quiz; }
  answer = sanitizeOutput(answer).text;
  if (verdict === 'unsure' && answer.length < 20) answer = UNSURE_AR;
  const sources = chapter ? [chapter.title] : [];
  await save({
    participant_id: p.id, role: 'assistant', body: answer.slice(0, 6000), context: where, chapter_id: chapterId, verdict, sources,
    model: String(res?.model || GUIDE_MODEL).slice(0, 60), input_tokens: res?.usage?.input_tokens ?? null,
    cache_read_tokens: res?.usage?.cache_read_input_tokens ?? null, output_tokens: res?.usage?.output_tokens ?? null, cost_micros: cost,
  });
  console.log('guide ask', JSON.stringify({ q: questionId, verdict, cost_micros: cost }));
  return { success: true, reply: { text: answer, verdict, sources }, left: left(await counts(p.id), s) };
}

// «احذف محادثتي»: صفوف صاحب الجلسة وحده، فورًا. السجل بلا محتوى
export async function guideClear(p: any) {
  const { data, error } = await db.from('guidance_messages').delete().eq('participant_id', p.id).select('id');
  if (error) { if (missing(error)) return { success: true, deleted: 0 }; throw error; }
  await audit('participant', p.id, 'guide.clear', 'guidance_messages', p.id, null, { deleted: (data || []).length });
  return { success: true, deleted: (data || []).length };
}
