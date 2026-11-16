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
import { companionAllowed, filterHandbookMd, handbookModulesFor, pickCohort, quizFor } from './logic.js';
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
  // حكم تقييم الدقة (guide-eval.ts) باستيراد متأخر، فلا حلقة بين الملفين
  evalOk: async (): Promise<boolean> => (await (await import('./guide-eval.ts')).evalGateNow()).ok,
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
  const evalOk = GD.policy() && s.enabled ? await GD.evalOk().catch(() => false) : false;
  const closed = guideGate({ policyVersion: GD.policy(), consentVersion: GD.policy(), enabled: !!s.enabled, evalOk, pilot: true, companion: true, ready: true, hasKey: true });
  if (closed.reason === 'policy' || closed.reason === 'off' || closed.reason === 'eval') return { s, j: null as any, gate: closed, key: '' };
  const j = await journeyFor(p, { lite: true });
  const org = p.organization_id
    ? (await db.from('organizations').select('companion_allowed').eq('id', p.organization_id).maybeSingle()).data
    : null;
  const signals = j.approved ? await guidanceFor(p.id, !!j.initiative) : null;
  const key = await GD.key().catch(() => '');
  const gate = guideGate({
    policyVersion: GD.policy(), consentVersion: p.consent_version || null, enabled: !!s.enabled, evalOk, pilot: !!j.def?.cohort?.guidance_pilot, companion: companionAllowed(org, j.def?.cohort || null),
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

async function save(row: Record<string, unknown>): Promise<number | null> {
  const { data, error } = await db.from('guidance_messages').insert(row).select('id').single();
  if (error) throw error;
  return (data as any)?.id ?? null;
}

// ── التوليد: مسار واحد يجيب به المشارك ويُقيَّم به قبل الإطلاق (guide-eval.ts)، فما يُقيَّم هو ما يعمل ──
type Chapter = { title: string; md: string; quiz: any[] } | null;
type Turn = { role: string; body: string };
export function worstFor(o: { chapter: Chapter; ctx: string; text: string; past: Turn[] }) {
  const prefix = estimateTokens(GUIDE_RULES) + (o.chapter ? estimateTokens(o.chapter.md) : 0);
  const rest = estimateTokens(o.ctx) + estimateTokens(o.text) + o.past.reduce((a, m) => a + estimateTokens(m.body), 0);
  return worstCaseMicros(GUIDE_MODEL, prefix, rest, GUIDE_MAX_TOKENS);
}
export async function generate(o: { key: string; chapter: Chapter; ctx: string; text: string; past: Turn[] }) {
  // الرسائل تتناوب بدءًا بالمشارك: يُسقط ما قبل أول سؤال، ويُدمج المتتالي من الدور نفسه
  const messages: { role: 'user' | 'assistant'; content: any }[] = [];
  for (const m of o.past) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    if (!messages.length && role !== 'user') continue;
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n\n${m.body}`;
    else messages.push({ role, content: m.body });
  }
  if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
  messages.push({ role: 'user', content: [{ type: 'text', text: o.ctx }, { type: 'text', text: o.text }] });
  const system: any[] = [{ type: 'text', text: GUIDE_RULES, cache_control: { type: 'ephemeral' } }];
  if (o.chapter) system.push({ type: 'text', text: `نص باب «${o.chapter.title}» من كتاب المشارك:\n\n${o.chapter.md}`, cache_control: { type: 'ephemeral' } });
  const res = await GD.model({
    model: GUIDE_MODEL, max_tokens: GUIDE_MAX_TOKENS, system, messages,
    thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, inference_geo: 'us',
  }, o.key);
  const cost = costMicros(String(res?.model || GUIDE_MODEL), res?.usage || {});
  const raw = (res?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  let { verdict, text } = parseReply(raw);
  if (verdict !== 'error') {
    // الحارس: لا إجابة اختبار، ولا بريد ولا رابط ولا رقم
    if (o.chapter && quizLeak(text, o.chapter.quiz)) { verdict = 'refused'; text = REFUSAL_AR.quiz; }
    text = sanitizeOutput(text).text;
    if (verdict === 'unsure' && text.length < 20) text = UNSURE_AR;
  }
  return { verdict, text, res, cost };
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
  // السقف اليومي: حجز أسوأ تكلفة قبل الاستدعاء
  const worst = worstFor({ chapter, ctx, text, past });
  const cap = Math.round(Number(s.daily_spend_usd) * 1e6);
  const { data: reserved, error: re } = await db.rpc('guidance_spend_reserve', { p_day: w.dayKey, p_micros: worst, p_cap: cap });
  if (re || reserved === null || reserved === undefined) {
    await unclaim();
    if (re && !missing(re)) console.error('guide reserve', re.code || 'error');
    throw new Fail('بلغ المساعد الذكي حده اليومي. اطلب استشارة، أو عد غدًا.', 429, 'guide_cap');
  }

  let g: Awaited<ReturnType<typeof generate>>;
  try {
    g = await generate({ key, chapter, ctx, text, past });
  } catch (e) {
    // الحجز يبقى محسوبًا (قد يكون فوتر)، والسؤال لا يُحسب على المشارك
    console.error('guide model', (e as any)?.status || (e as Error)?.name);
    await unclaim();
    throw new Fail(ERROR_AR, 502, 'guide_model');
  }
  await db.rpc('guidance_spend_settle', { p_day: w.dayKey, p_delta: g.cost - worst }).then(() => null, () => null);
  if (g.verdict === 'error') { await unclaim(); throw new Fail(ERROR_AR, 502, 'guide_empty'); }
  const { verdict, text: answer, res, cost } = g;
  const sources = chapter ? [chapter.title] : [];
  const answerId = await save({
    participant_id: p.id, role: 'assistant', body: answer.slice(0, 6000), context: where, chapter_id: chapterId, verdict, sources,
    model: String(res?.model || GUIDE_MODEL).slice(0, 60), input_tokens: res?.usage?.input_tokens ?? null,
    cache_read_tokens: res?.usage?.cache_read_input_tokens ?? null, output_tokens: res?.usage?.output_tokens ?? null, cost_micros: cost,
  });
  console.log('guide ask', JSON.stringify({ q: questionId, verdict, cost_micros: cost }));
  return { success: true, reply: { id: answerId, text: answer, verdict, sources }, left: left(await counts(p.id), s) };
}

// «احذف محادثتي»: صفوف صاحب الجلسة وحده، فورًا. السجل بلا محتوى
export async function guideClear(p: any) {
  const { data, error } = await db.from('guidance_messages').delete().eq('participant_id', p.id).select('id');
  if (error) { if (missing(error)) return { success: true, deleted: 0 }; throw error; }
  await audit('participant', p.id, 'guide.clear', 'guidance_messages', p.id, null, { deleted: (data || []).length });
  return { success: true, deleted: (data || []).length };
}

// ── G3: «أريد التأكد» حدثًا، وأعداد بلا نص ──
// يُسجَّل على رد من محادثة صاحب الجلسة وحده (المعرّف والمالك معًا). معرّف لا يخصه لا يغيّر شيئًا ولا يُقال له ذلك،
// فلا يُعرف منه وجود رسالة لغيره. لا يُنقل شيء من المحادثة؛ طلب الاستشارة يرسله المشارك بنفسه.
export async function guideConfirm(p: any, b: Body) {
  const id = Number(b.message_id);
  if (!Number.isSafeInteger(id) || id <= 0) return { success: true };
  const { error } = await db.from('guidance_messages').update({ confirmed_at: new Date(GD.now()).toISOString() })
    .eq('id', id).eq('participant_id', p.id).eq('role', 'assistant').is('confirmed_at', null);
  if (error && !missing(error) && !/confirmed_at/.test(String(error.message || ''))) throw error;
  return { success: true };
}

// أعداد مشارك للمستشار والإدارة (آخر 30 يومًا): من دالة لا تعيد إلا أرقامًا، وتعذّرها يخفي السطر
export const GUIDE_COUNTS_DAYS = 30;
export async function guideCounts(pid: string) {
  const since = new Date(GD.now() - GUIDE_COUNTS_DAYS * 864e5).toISOString();
  const { data, error } = await db.rpc('guidance_counts', { p_participant: pid, p_since: since });
  if (error) return null;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r || !Number(r.asked)) return r ? { asked: 0, unsure: 0, confirmed: 0, last_at: null, days: GUIDE_COUNTS_DAYS } : null;
  return { asked: Number(r.asked), unsure: Number(r.unsure), confirmed: Number(r.confirmed), last_at: r.last_at || null, days: GUIDE_COUNTS_DAYS };
}

// تقرير الإدارة: أعداد 7 و30 يومًا، وإنفاق آخر 30 يومًا يومًا بيوم مع السقف. بلا نص ولا أسماء
export async function guideReport() {
  const now = GD.now();
  const window = async (days: number) => {
    const { data, error } = await db.rpc('guidance_report', { p_since: new Date(now - days * 864e5).toISOString() });
    if (error) { if (missing(error)) return null; throw error; }
    const r = Array.isArray(data) ? data[0] : data;
    const n = (k: string) => Number(r?.[k] || 0);
    const replies = n('answered') + n('unsure') + n('refused') + n('errors');
    return { days, asked: n('asked'), participants: n('participants'), answered: n('answered'), unsure: n('unsure'), refused: n('refused'), errors: n('errors'),
      confirmed: n('confirmed'), confirm_rate: replies ? Math.round((n('confirmed') / replies) * 1000) / 10 : null, usd: Math.round(n('micros') / 1e4) / 100 };
  };
  const [w7, w30] = await Promise.all([window(7), window(30)]);
  const since = new Date(now - 30 * 864e5).toISOString().slice(0, 10);
  const { data: spend } = await db.from('guidance_spend_daily').select('day, micros, calls').gte('day', since).order('day', { ascending: false });
  const s = (await appSettings()).guidance as any;
  return {
    success: true, ready: !!w7, open: !!GD.policy() && !!s.enabled, cap_usd: Number(s.daily_spend_usd),
    windows: [w7, w30].filter(Boolean),
    spend: (spend || []).map((r: any) => ({ day: r.day, usd: Math.round(Number(r.micros) / 1e4) / 100, calls: r.calls })),
  };
}

// ── H1: لوحة «التوجيه والإرشاد» للإدارة: التوزيع على الجهات والدفعات (أعداد وكلفة بلا نص) ──
// يُقرأ من الجدول ما لا نص فيه: المشارك والدور والحكم و«أريد التأكد» والكلفة. والدفعة بالقاعدة نفسها التي تختار بها
// الرحلة دفعة المشارك (pickCohort)، فلا يُحسب المشارك في دفعة غير دفعته
export async function guideBreakdown(days = 30) {
  const since = new Date(GD.now() - days * 864e5).toISOString();
  const { data, error } = await db.from('guidance_messages').select('participant_id, role, verdict, confirmed_at, cost_micros').gte('created_at', since).limit(20000);
  if (error) { if (missing(error)) return null; throw error; }
  const rows = data || [];
  const ids = [...new Set(rows.map((r: any) => r.participant_id))];
  if (!ids.length) return { days, orgs: [], cohorts: [] };
  const [parts, enr, cohorts, orgs] = await Promise.all([
    db.from('participants').select('id, organization_id').in('id', ids),
    db.from('enrollments').select('participant_id, cohort_id, status, created_at').in('participant_id', ids),
    db.from('cohorts').select('*'),
    db.from('organizations').select('id, name'),
  ]);
  const orgOf = new Map((parts.data || []).map((p: any) => [p.id, p.organization_id || null]));
  const cohortOfP = new Map(ids.map((id) => {
    const c = pickCohort({ enrollments: (enr.data || []).filter((e: any) => e.participant_id === id), cohorts: cohorts.data || [], organizationId: orgOf.get(id) || null });
    return [id, (c as any)?.cohort || null];
  }));
  const orgName = new Map((orgs.data || []).map((o: any) => [o.id, o.name]));
  const bucket = () => ({ asked: 0, participants: new Set<string>(), unsure: 0, confirmed: 0, errors: 0, micros: 0 });
  const byOrg = new Map<string, any>();
  const byCohort = new Map<string, any>();
  for (const r of rows as any[]) {
    const o = orgOf.get(r.participant_id) || 'none';
    const c = cohortOfP.get(r.participant_id);
    for (const [m, k] of [[byOrg, o], [byCohort, c?.id || 'none']] as const) {
      const acc = m.get(k) || bucket();
      if (r.role === 'user' && r.verdict !== 'refused') acc.asked++;
      if (r.role === 'user') acc.participants.add(r.participant_id);
      if (r.role === 'assistant' && r.verdict === 'unsure') acc.unsure++;
      if (r.role === 'assistant' && r.verdict === 'error') acc.errors++;
      if (r.role === 'assistant' && r.confirmed_at) acc.confirmed++;
      acc.micros += Number(r.cost_micros || 0);
      m.set(k, acc);
    }
  }
  const cohortName = new Map((cohorts.data || []).map((c: any) => [c.id, c.name]));
  const out = (m: Map<string, any>, name: (k: string) => string) => [...m.entries()].map(([k, acc]) => ({
    id: k === 'none' ? null : k, name: name(k), asked: acc.asked, participants: acc.participants.size, unsure: acc.unsure, confirmed: acc.confirmed, errors: acc.errors, usd: Math.round(acc.micros / 1e4) / 100,
  })).sort((x, y) => y.asked - x.asked);
  return { days, orgs: out(byOrg, (k) => (k === 'none' ? 'بلا جهة (أفراد)' : orgName.get(k) || '؟')), cohorts: out(byCohort, (k) => (k === 'none' ? 'بلا دفعة' : cohortName.get(k) || '؟')) };
}
