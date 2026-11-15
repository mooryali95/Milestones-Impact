// ════════════════════════════════════════════════════════════════
// agent-chat: المساعد الآلي في الموقع العام (المرحلة 1)
// ════════════════════════════════════════════════════════════════
// الإجراءات: status (هل المساعد مفعّل)، وstart (Turnstile مرة واحدة ثم محادثة برمز عام)، وsend (رسالة الزائر ثم
// الرد ببث SSE)، وhandoff (تحويل إلى الفريق: صف في contact_requests مربوط بالمحادثة، وبريد الإدارة القائم، وسطر في
// قناة التشغيل بلا نص)، وrate (تقييم واحد).
// التكلفة (قرار المالك: لا تتجاوز 2 دولار في اليوم): أجوبة جاهزة بلا نموذج لأكثر الأسئلة تكرارًا، وحد للرسائل في
// المحادثة، وحدود للشبكة وللجميع، وسجل إنفاق يومي من usage يُقرأ قبل كل استدعاء: إن كان الاستدعاء التالي قد
// يتجاوز السقف لا يُستدعى النموذج بقية يوم الرياض، وتعرض النافذة «اترك رسالتك». تنبيه واحد عند 80% وآخر عند 100%.
// لا أداة تقرأ بيانات المنصة. سعر برنامج القادة يُقرأ من payment_settings وحده حين يكون الدفع مفعّلًا.
import { slackPost } from '../_shared/slack.ts';
import { maskEmail } from '../_shared/slack.ts';
import { AGENT_CONTEXT_PREFIX, type ContactRow } from '../_shared/contact.ts';
import { inServiceHours, promiseNow } from '../_shared/hours.js';
import { isArabic, matchFaq, normalizeText, productOf } from './faq.ts';
import { buildMessages, DEFAULT_MODEL, MAX_TOKENS, type ModelResult } from './model.ts';
import { capState, costMicros, estimateTokens, knownModel, worstCaseMicros } from './pricing.ts';
import { HANDOFF_MARK, SYSTEM_BLOCKS } from './prompt.ts';
import { redactInput, StreamSanitizer } from './redact.ts';
import { type Store, Unavailable } from './store.ts';
import type Anthropic from 'npm:@anthropic-ai/sdk@1.4.0';

// الحدود لكل شبكة تشمل الطلبات بلا عنوان معروف دلوًا واحدًا مشتركًا (لا إعفاء). وحصة الشبكة من استدعاءات النموذج في
// يوم الرياض (modelCallsPerIpDay) تمنع طرفًا واحدًا من استنزاف السقف اليومي على الجميع: 40 استدعاء بأسوأ تكلفة
// Haiku نحو 2000 ميكرو للواحد = نحو 4% من السقف.
export const LIMITS = { convPerIpHour: 5, convGlobalHour: 120, modelCallsHour: 300, modelCallsPerIpDay: 40, messagesPerConversation: 12, messageChars: 1500, handoffPerIpHour: 3, handoffGlobalHour: 30 };

export type Env = {
  apiKey: string; model: string; capCents: number; enabled: boolean;
  turnstileSecret: string; turnstileSite: string; adminEmail: string;
};
export function readEnv(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): Env {
  const cap = Number(get('LEADERS_AGENT_DAILY_CAP_CENTS') || '200');
  return {
    apiKey: get('ANTHROPIC_API_KEY') || '',
    model: (get('LEADERS_AGENT_MODEL') || DEFAULT_MODEL).trim(),
    capCents: Number.isFinite(cap) && cap >= 0 ? cap : 200,
    enabled: ['1', 'on', 'true'].includes(String(get('LEADERS_AGENT_ENABLED') || '').toLowerCase()),
    turnstileSecret: get('LEADERS_TURNSTILE_SECRET') || '',
    turnstileSite: get('LEADERS_TURNSTILE_SITE_KEY') || '',
    adminEmail: (get('CONTACT_NOTIFY_EMAIL') || get('LEADERS_ALERT_EMAIL') || '').trim(),
  };
}

export type Deps = {
  store: Store;
  env: Env;
  now?: () => number;
  turnstile: (token: unknown, ip: string | null) => Promise<boolean>;
  model: (messages: Anthropic.MessageParam[], onText: (t: string) => void, signal: AbortSignal) => Promise<ModelResult>;
  notifyAdmin: (row: ContactRow) => Promise<void>;
  alert: (kind: string, detail: Record<string, unknown>) => Promise<unknown>;
  clientIp: (req: Request) => string | null;
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// نصوص الواجهة الثابتة
export const TEXT = {
  greeting: {
    ar: 'أهلًا بك، أنا المساعد الآلي لـ Milestone Impact. أجيبك من معلوماتنا المعتمدة، ومتى احتجت أحدًا من الفريق حولتك إليه. لا تكتب هنا بيانات حساسة كرقم الهوية أو بيانات البطاقة.',
    en: 'Welcome. I am the Milestone Impact automated assistant. I answer from our approved information and can connect you with our team whenever you need. Please do not share sensitive data such as ID or card numbers here.',
  },
  capped: {
    ar: 'المساعد الآلي متوقف مؤقتًا لبقية اليوم. اترك رسالتك واسمك وبريدك، ويصلك رد الفريق.',
    en: 'The automated assistant is paused for the rest of the day. Leave your message, name and email, and our team will reply.',
  },
  convCap: {
    ar: 'وصلت هذه المحادثة إلى حدها. إن بقي لديك سؤال فاتركه للفريق مع اسمك وبريدك.',
    en: 'This conversation has reached its limit. If you still have a question, leave it for our team with your name and email.',
  },
  refusal: {
    ar: 'لا أستطيع المساعدة في هذا هنا، والأفضل أن يتولاه أحد من الفريق. اترك اسمك وبريدك وأحوله إليهم.',
    en: 'I cannot help with this here; it is better handled by our team. Leave your name and email and I will pass it on.',
  },
  sent: { ar: 'وصل طلبك إلى الفريق.', en: 'Your request has reached our team.' },
  error: {
    ar: 'تعذّر الرد الآن. حاول بعد قليل، أو اترك رسالتك للفريق.',
    en: 'I could not reply just now. Please try again shortly, or leave a message for our team.',
  },
};

// يوم الرياض (UTC+3 بلا توقيت صيفي) لسجل الإنفاق
export const riyadhDay = (now: number) => new Date(now + 3 * 36e5).toISOString().slice(0, 10);
// بداية يوم الرياض بتوقيت UTC (لحصة الشبكة اليومية)
export const riyadhDayStartIso = (now: number) => new Date(Date.parse(`${riyadhDay(now)}T00:00:00+03:00`)).toISOString();

// عمل بعد الرد لا ينتظره الزائر: يُسلَّم إلى EdgeRuntime.waitUntil إن وُجد فلا يُقطع بانتهاء الطلب
function background(p: Promise<unknown>) {
  const q = p.catch((e) => console.error('agent background:', e));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  try { rt?.waitUntil?.(q); } catch { /* خارج Supabase */ }
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@<>"'();,]+@[^\s@<>"'();,]+\.[a-z]{2,}$/i.test(s) && s.length <= 254;
const langOf = (s: string): 'ar' | 'en' => (isArabic(s) ? 'ar' : 'en');
const PAGES = new Set(['MI-HOME', 'MI-LEADERS', 'MI-ASSESSMENT', 'MI-PROJECTS', 'MI-GOVERNANCE', 'MI-PRICING', 'MI-LEGAL']);
const pageOf = (v: unknown) => (PAGES.has(String(v)) ? String(v) : 'MI-HOME');

// السعر الحي يُطلب حين يسأل الزائر عن سعر، وتكون الصفحة صفحة البرنامج أو صفحة مشتركة
const PRICE_WORDS = ['سعر', 'اسعار', 'تكلفه', 'بكم', 'كم', 'رسوم', 'رسم', 'مبلغ', 'price', 'cost', 'fee', 'fees', 'much'];
const asksPrice = (q: string) => normalizeText(q).split(' ').some((t) => PRICE_WORDS.some((w) => t === w || t.endsWith(w)));
const money = (cents: number, cur: string) => `${(cents / 100).toFixed(2)} ${cur}`;

// ── بث SSE ──
// الإرسال لا يرمي أبدًا: إن أغلق الزائر الاتصال تُهمل الأحداث، ويُقطع استدعاء النموذج بالإشارة، ويكمل المعالج
// حتى يسوّي حجز الإنفاق ويحفظ صف الاستدعاء. فلا يضيع استدعاء مفوتر من السجل اليومي ولا من عداد الساعة.
export function sse(lang: 'ar' | 'en', run: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>) {
  const enc = new TextEncoder();
  const ac = new AbortController();
  let closed = false;
  const body = new ReadableStream({
    start(ctl) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; ac.abort(); }
      };
      (async () => {
        try { await run(send, ac.signal); } catch (e) {
          console.error('agent-chat stream:', e);
          send('error', { code: 'internal', text: TEXT.error[lang] });
        } finally {
          if (!closed) { closed = true; try { ctl.close(); } catch { /* أُغلق */ } }
        }
      })();
    },
    cancel() { closed = true; ac.abort(); },
  });
  return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
}

// أخطاء إعداد لا يصلحها التكرار (مفتاح ملغى، أو اسم نموذج خاطئ، أو طلب يرفضه النموذج): تنبيه واحد في اليوم و«اترك رسالتك»
const CONFIG_STATUSES = new Set([400, 401, 403, 404]);
const errStatus = (e: unknown) => { const v = (e as { status?: unknown })?.status; return typeof v === 'number' ? v : null; };
async function configAlert(d: Deps, day: string, kind: string, detail: Record<string, unknown>) {
  if (!(await d.store.markAlert(day, 1).catch(() => false))) return;
  await d.alert(kind, { day, model: d.env.model, ...detail }).catch((e) => console.error('agent alert:', e));
}

async function spendAlert(d: Deps, day: string, level: 80 | 100, spent: number) {
  if (!(await d.store.markAlert(day, level))) return;
  await d.alert(level === 100 ? 'agent_spend_cap' : 'agent_spend_80', { day, spent_usd: (spent / 1e6).toFixed(4), cap_usd: (d.env.capCents / 100).toFixed(2), model: d.env.model })
    .catch((e) => console.error('agent alert:', e));
}

// ════════ الإجراءات ════════
async function status(d: Deps) {
  return json({ success: true, enabled: d.env.enabled, site_key: d.env.enabled ? d.env.turnstileSite : null });
}

async function start(d: Deps, b: Record<string, unknown>, req: Request) {
  // الحذف بعد 90 يومًا تتولاه مهمة مجدولة في القاعدة (leaders-agent-purge)، وهذا احتياط إضافي يعمل ولو أُغلق المساعد
  background(d.store.purgeExpired());
  if (!d.env.enabled) return json({ success: false, code: 'agent_off' }, 503);
  if (!d.env.turnstileSecret || !d.env.turnstileSite) {
    console.error('agent-chat: Turnstile keys missing; the assistant is closed');
    return json({ success: false, code: 'captcha_unconfigured' }, 503);
  }
  const ip = d.clientIp(req);
  if (!(await d.turnstile(b.captcha, ip))) return json({ success: false, code: 'captcha', site_key: d.env.turnstileSite }, 400);
  const now = d.now?.() ?? Date.now();
  const hourAgo = new Date(now - 36e5).toISOString();
  const perIp = await d.store.countConversations(hourAgo, ip);
  const global = await d.store.countConversations(hourAgo);
  if (perIp === null || global === null) return json({ success: false, code: 'rate' }, 429);
  if (perIp >= LIMITS.convPerIpHour || global >= LIMITS.convGlobalHour) return json({ success: false, code: 'rate' }, 429);
  const token = randomToken();
  const page = pageOf(b.page);
  const locale = clip(b.locale, 10) || 'ar';
  await d.store.createConversation({ public_token_hash: await sha256(token), product: page, source_url: clip(b.source_url, 500), locale, ip });
  const spent = await d.store.spentToday(riyadhDay(now));
  const lang = locale.startsWith('en') ? 'en' : 'ar';
  const capped = spent === null || capState(spent, 0, d.env.capCents) === 'capped' || !knownModel(d.env.model);
  return json({ success: true, token, greeting: TEXT.greeting[lang], capped, ...(capped ? { capped_text: TEXT.capped[lang] } : {}) });
}

async function conversationOf(d: Deps, b: Record<string, unknown>) {
  const token = typeof b.token === 'string' ? b.token : '';
  if (token.length < 20 || token.length > 100) return null;
  return await d.store.findConversation(await sha256(token));
}

async function send(d: Deps, b: Record<string, unknown>) {
  const conv = await conversationOf(d, b);
  if (!conv) return json({ success: false, code: 'expired' }, 404);
  const raw = String(b.message ?? '').trim();
  if (!raw) return json({ success: false, code: 'empty' }, 400);
  if (raw.length > LIMITS.messageChars) return json({ success: false, code: 'too_long', max: LIMITS.messageChars }, 400);
  const lang = langOf(raw);
  if (conv.status !== 'bot') return json({ success: false, code: 'handed_off', text: promiseNow(lang, d.now?.() ?? Date.now()) }, 409);
  const convCap = () => json({ success: false, code: 'conv_cap', text: TEXT.convCap[lang], handoff: true }, 429);
  if (conv.visitor_messages >= LIMITS.messagesPerConversation) return convCap();

  const now = d.now?.() ?? Date.now();
  // الحجز ذري: الطلبات المتوازية برمز واحد لا تتجاوز حد المحادثة
  const claimed = await d.store.claimMessage(conv.id, LIMITS.messagesPerConversation, new Date(now).toISOString());
  if (claimed === null) return convCap();
  const { text: message } = redactInput(raw);
  await d.store.addMessage({ conversation_id: conv.id, role: 'visitor', body: message, lang });

  return sse(lang, async (emit, signal) => {
    // 1) الجواب الجاهز: بلا نموذج ولا تكلفة
    const canned = matchFaq(message, conv.product);
    if (canned) {
      await d.store.addMessage({ conversation_id: conv.id, role: 'canned', body: canned.text, lang: canned.lang, model: `faq:${canned.id}` });
      emit('delta', { t: canned.text });
      emit('done', { text: canned.text, handoff: false, source: 'canned' });
      return;
    }
    // 2) السقف اليومي وحد الاستدعاءات في الساعة، قبل أي استدعاء
    const day = riyadhDay(now);
    const history = await d.store.history(conv.id);
    const product = productOf(conv.product);
    let leadersPrice: string | null = null;
    if (product !== 'matrix' && asksPrice(message)) {
      const p = await d.store.leadersPrice();
      if (p?.enabled) leadersPrice = `رسم القياس المبدئي ${money(p.assessment_cents, p.currency)}، ورسم إكمال البرنامج ${money(p.program_cents, p.currency)}`;
    }
    const inHours = inServiceHours(now);
    const { messages } = buildMessages(history, { product, page: conv.product, promise: promiseNow(lang, now), inHours, droppedTurns: 0, leadersPrice });
    const prefix = estimateTokens(SYSTEM_BLOCKS.map((x) => x.text).join(''));
    const rest = estimateTokens(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(''));
    const worst = worstCaseMicros(d.env.model, prefix, rest, MAX_TOKENS);
    const capMicros = d.env.capCents * 1e4;
    const calls = await d.store.countModelCalls(new Date(now - 36e5).toISOString());
    // حصة الشبكة في يوم الرياض (الطلبات بلا عنوان دلو واحد)
    const ipCalls = await d.store.countIpModelCalls(riyadhDayStartIso(now), conv.ip ?? null);
    const capped = async () => {
      await d.store.addMessage({ conversation_id: conv.id, role: 'system', body: 'capped', lang });
      emit('capped', { text: TEXT.capped[lang] });
    };
    if (!d.env.apiKey || calls === null || calls >= LIMITS.modelCallsHour) return await capped();
    if (ipCalls === null || ipCalls >= LIMITS.modelCallsPerIpDay) return await capped();
    // نموذج غير موجود في جدول الأسعار: لا يُستدعى (السقف لا يُحسب بسعر مجهول)، وتنبيه إعداد مرة في اليوم
    if (!knownModel(d.env.model)) {
      await configAlert(d, day, 'agent_model_unknown', {});
      return await capped();
    }
    // حجز أسوأ تكلفة قبل الاستدعاء، ذريًا ومقيدًا بالسقف: المتوازي لا يتجاوزه، والفاشل يبقى محسوبًا
    const res = await d.store.reserveSpend(day, worst, capMicros);
    if (!res.ok) {
      if (res.reason === 'refused') {
        const spent = await d.store.spentToday(day).catch(() => null);
        await spendAlert(d, day, 100, spent ?? capMicros);
      } else {
        await configAlert(d, day, 'agent_ledger_error', {});
      }
      return await capped();
    }
    if (res.total >= capMicros * 0.8) await spendAlert(d, day, 80, res.total);
    // صف الاستدعاء قبل إرساله (نص فارغ لا يدخل السجل)، فيحسبه عداد الساعة وهو جارٍ، ويُسوّى بعده
    const callId = await d.store.addMessage({ conversation_id: conv.id, role: 'agent', body: '', lang, model: d.env.model, stop_reason: 'pending', cost_micros: worst });
    // 3) النموذج ببث، وكل دفعة تمر بفحص المخرج
    const san = new StreamSanitizer(48, (t) => t.split(HANDOFF_MARK).join(''));
    let result: ModelResult;
    try {
      result = await d.model(messages, (t) => { const out = san.push(t); if (out) emit('delta', { t: out }); }, signal);
    } catch (e) {
      const st = errStatus(e);
      console.error('agent model:', (e as Error)?.name, st, (e as Error)?.message);
      // لا usage: يبقى الحجز (أسوأ تكلفة) محسوبًا كما هو
      await d.store.updateMessage(callId, { stop_reason: signal.aborted ? 'aborted' : 'error' });
      if (st !== null && CONFIG_STATUSES.has(st)) {
        await configAlert(d, day, 'agent_model_config', { status: st, type: (e as Error)?.name });
        return await capped();
      }
      emit('error', { code: 'model', text: TEXT.error[lang] });
      return;
    }
    // بسعر النموذج الذي خدم الطلب إن كان في الجدول، وإلا فبسعر المطلوب (وهو في الجدول بالتحقق أعلاه)
    const cost = costMicros(knownModel(result.model) ? result.model : d.env.model, result.usage);
    const total = await d.store.settleSpend(day, cost - worst);
    if (total !== null) {
      if (total >= capMicros * 0.8) await spendAlert(d, day, 80, total);
      if (capState(total, worst, d.env.capCents) === 'capped') await spendAlert(d, day, 100, total);
    }
    const fin = san.finish();
    let text = fin.text.trim();
    let handoff = result.text.includes(HANDOFF_MARK);
    if (result.stopReason === 'refusal' || !text) { text = TEXT.refusal[lang]; handoff = true; }
    if (fin.tail && result.stopReason !== 'refusal') emit('delta', { t: fin.tail });
    await d.store.updateMessage(callId, {
      body: text.slice(0, 6000), model: result.model, stop_reason: result.stopReason,
      input_tokens: result.usage.input_tokens, cache_read_tokens: result.usage.cache_read_input_tokens,
      cache_write_tokens: result.usage.cache_creation_input_tokens, output_tokens: result.usage.output_tokens, cost_micros: cost,
    });
    emit('done', { text, handoff, source: 'model' });
  });
}

// أسباب التحويل مقيدة (لا نص حر من الزائر في سلاك)
const REASONS: Record<string, string> = { request: 'طلب الزائر', agent: 'اقتراح المساعد', capped: 'السقف اليومي', conv_cap: 'حد المحادثة', refusal: 'امتناع النموذج', error: 'تعذر الرد' };
const INTERESTS: Record<string, string> = { general: 'استفسار عام', partnership: 'شراكة أو عرض لجهة', leaders: 'برنامج القادة', matrix: 'منصة مصفوفة التأثير' };

async function handoff(d: Deps, b: Record<string, unknown>, req: Request) {
  const conv = await conversationOf(d, b);
  if (!conv) return json({ success: false, code: 'expired' }, 404);
  if (conv.contact_request_id) return json({ success: false, code: 'already' }, 409);
  const name = clip(b.name, 120);
  const email = clip(b.email, 254).toLowerCase();
  const phone = clip(b.phone, 30);
  if (name.length < 2) return json({ success: false, code: 'invalid', field: 'name' }, 400);
  if (!isEmail(email)) return json({ success: false, code: 'invalid', field: 'email' }, 400);
  if (phone && !/^[0-9٠-٩+() -]{0,30}$/.test(phone)) return json({ success: false, code: 'invalid', field: 'phone' }, 400);
  const reason = REASONS[String(b.reason)] ? String(b.reason) : 'request';
  const interest = INTERESTS[String(b.interest)] ? String(b.interest) : (productOf(conv.product) === 'leaders' ? 'leaders' : 'general');
  const note = redactInput(clip(b.note, 1000)).text;
  // رسائل الزائر بعد الحجب (لا ردود المساعد): بلا رسالة منه ولا ملاحظة لا يصل الفريق طلب فارغ
  const visitorTurns = (await d.store.history(conv.id)).filter((t) => t.role === 'visitor');
  if (!note && !visitorTurns.length) return json({ success: false, code: 'invalid', field: 'note' }, 400);
  const now = d.now?.() ?? Date.now();
  // حدود التحويل للشبكة وللجميع في الساعة: البريد المشترك لطلبات التواصل لا يستنزفه طرف واحد
  const ip = d.clientIp(req);
  const hourAgo = new Date(now - 36e5).toISOString();
  const perIp = await d.store.countHandoffs(hourAgo, ip);
  const global = await d.store.countHandoffs(hourAgo);
  if (perIp === null || global === null || perIp >= LIMITS.handoffPerIpHour || global >= LIMITS.handoffGlobalHour) return json({ success: false, code: 'rate' }, 429);
  // الحجز ذري: طلب واحد فقط من الطلبات المتوازية يصل إلى الإدراج والبريد
  if (!(await d.store.claimHandoff(conv.id, REASONS[reason], new Date(now).toISOString()))) return json({ success: false, code: 'already' }, 409);
  // السياق للإدارة: الوسم ورقم المحادثة وسببها ورسائل الزائر
  const turns = visitorTurns.map((t) => `- ${t.body}`);
  const context = [`${AGENT_CONTEXT_PREFIX} conversation ${conv.id} · ${REASONS[reason]}`, note ? `ملاحظة: ${note}` : '', ...turns].filter(Boolean).join('\n').slice(0, 3900);
  const row: ContactRow = {
    product: conv.product, source_url: conv.source_url || '', name, organization: clip(b.organization, 200), email, phone,
    interest, interest_label: `${INTERESTS[interest]} (المساعد الآلي)`, context, user_agent: clip(req.headers.get('user-agent'), 300),
    language: clip(conv.locale, 35), status: 'new',
  };
  const ins = await d.store.insertContact(row, ip);
  if (ins.error || !ins.data) {
    console.error('agent handoff insert:', ins.error);
    // يُفك الحجز فيعيد الزائر المحاولة
    await d.store.updateConversation(conv.id, { status: 'bot', handoff_at: null, handoff_reason: null });
    return json({ success: false, code: 'db' }, 500);
  }
  await d.store.updateConversation(conv.id, { contact_request_id: ins.data.id });
  // لغة الوعد من آخر رسالة للزائر (كما في send)، لا من لغة الصفحة
  const lastVisitor = visitorTurns[visitorTurns.length - 1]?.body;
  const lang = lastVisitor ? langOf(lastVisitor) : (String(conv.locale || '').startsWith('en') ? 'en' : 'ar');
  const promise = promiseNow(lang, now);
  await d.store.addMessage({ conversation_id: conv.id, role: 'system', body: `handoff: ${reason}`, lang });
  // بريد الإدارة القائم (بلا بريد تأكيد للزائر: الوعد قيل في المحادثة) وسطر في قناة التشغيل بلا نص
  await d.notifyAdmin(ins.data).catch((e) => console.error('agent notify:', e));
  slackPost('alerts', `💬 محادثة محولة من المساعد · ${conv.product} · ${lang} · ${maskEmail(email)} · ${REASONS[reason]}`, { client: d.store.client() });
  return json({ success: true, promise, sent: TEXT.sent[lang], lang });
}

async function rate(d: Deps, b: Record<string, unknown>) {
  const conv = await conversationOf(d, b);
  if (!conv) return json({ success: false, code: 'expired' }, 404);
  const r = Number(b.rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return json({ success: false, code: 'invalid' }, 400);
  await d.store.updateConversation(conv.id, { rating: r });
  return json({ success: true });
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, code: 'method' }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ success: false, code: 'bad_json' }, 400); }
  try {
    switch (b?.action) {
      case 'status': return await status(d);
      case 'start': return await start(d, b, req);
      case 'send': return await send(d, b);
      case 'handoff': return await handoff(d, b, req);
      case 'rate': return await rate(d, b);
      default: return json({ success: false, code: 'action' }, 400);
    }
  } catch (e) {
    if (e instanceof Unavailable) return json({ success: false, code: 'agent_unavailable' }, 503);
    console.error('agent-chat:', e);
    return json({ success: false, code: 'internal' }, 500);
  }
}
