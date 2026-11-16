// ════════════════════════════════════════════════════════════════
// قناة التشغيل في سلاك (#mi-ops): بوت بصلاحية chat:write وحدها
// ════════════════════════════════════════════════════════════════
// احتياط لا أصل: لا يؤخر الطلب الذي أطلقه ولا يُفشله ولا يمس حصة البريد. كل نشر يدخل طابورًا في النسخة
// ويخرج منه برسالة كل ثانية تقريبًا (حد سلاك للقناة)، وما تراكم من فئة واحدة يُجمع في رسالة، وما فاض يُترك ويُذكر عدده.
// لا إعادة محاولة: الفشل يُسجَّل ويُترك، و429 يوقف النشر حتى Retry-After.
// كل فئة لها سلسلة واحدة في يوم الرياض: رسالة أم مرة في اليوم، والأحداث ردود فيها. ts الأم في leaders.slack_threads،
// وغياب الجدول (قبل ترحيله) ينشر بلا سلاسل ويبقى يعمل.
// لا يُنشر رمز ولا متن رسالة ولا بريد كامل: الحالة والغرض وبريد مقنّع (m***@gmail.com) والدالة، وتفاصيل التنبيه مطموسة (alertLine).

export type SlackCategory = 'alerts' | 'codes' | 'mail';
export const SLACK_CATEGORIES: Record<SlackCategory, { icon: string; label: string }> = {
  alerts: { icon: '⚠️', label: 'التنبيهات' },
  codes: { icon: '🔐', label: 'رموز الدخول' },
  mail: { icon: '📨', label: 'بريد لم يصل' },
};
export const SLACK_HELLO = '✅ تم ربط Milestone Impact بسلاك';

// قابلة للضبط في الاختبار وحده
export const SLACK = { timeoutMs: 4000, gapMs: 1100, maxLines: 20, maxPending: 60, missingTableMs: 10 * 60e3, statusMissingMs: 60e3, deliverWaitMs: 8000, claimWaitMs: 500, claimTries: 4, staleClaimMs: 10e3, flatMs: 10 * 60e3 };

// deno-lint-ignore no-explicit-any
type Client = any;
const cfg = () => ({ token: Deno.env.get('LEADERS_SLACK_BOT_TOKEN') || '', channel: Deno.env.get('LEADERS_SLACK_CHANNEL') || '' });
export const slackConfigured = () => { const c = cfg(); return !!(c.token && c.channel); };
const tableOf = (client: Client) => (typeof client?.schema === 'function' ? client.schema('leaders') : client).from('slack_threads');

// ── يوم الرياض (UTC+3 بلا توقيت صيفي) ──
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const riyadh = (now = Date.now()) => new Date(now + 3 * 36e5);
export const riyadhDay = (now = Date.now()) => riyadh(now).toISOString().slice(0, 10);
export function parentText(category: SlackCategory, now = Date.now()) {
  const d = riyadh(now);
  const c = SLACK_CATEGORIES[category];
  return `${c.icon} ${c.label} · ${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// الحرف الأول والنطاق وحدهما، والنطاق بحروف النطاقات وحدها: ما سواها (< > ! |) يُطمس كله
export function maskEmail(email: unknown) {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return '***';
  const first = /[a-z0-9]/.test(e[0]) ? e[0] : '*';
  const domain = e.slice(at + 1);
  return `${first}***@${/^[a-z0-9.-]+$/.test(domain) ? domain : '***'}`;
}

// نص من خارج المنصة لا يصير أمرًا في سلاك (<!channel> ورابط مقنّع): الرموز الثلاثة تُرمَّز في كل سطر
export const slackEscape = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── الاستدعاء: مهلة قصيرة، ولا إعادة ──
let pausedUntil = 0;
let lastSendAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Sent = { ok: boolean; ts?: string; error?: string };
// كل نشر يُسجَّل نتيجته في leaders.ops_status (بطاقة صحة البريد والتنبيه)، ولا يُنتظر التسجيل
async function post(text: string, threadTs?: string): Promise<Sent> {
  const r = await postOnce(text, threadTs);
  recordSlack(r);
  return r;
}
async function postOnce(text: string, threadTs?: string): Promise<Sent> {
  const { token, channel } = cfg();
  const wait = lastSendAt + SLACK.gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  if (pausedUntil > Date.now()) return { ok: false, error: 'paused' };
  lastSendAt = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SLACK.timeoutMs);
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false, ...(threadTs ? { thread_ts: threadTs } : {}) }),
      signal: ctl.signal,
    });
    if (res.status === 429) {
      pausedUntil = Date.now() + (Number(res.headers.get('retry-after')) || 30) * 1000;
      await res.body?.cancel();
      return { ok: false, error: 'rate_limited' };
    }
    const j = await res.json().catch(() => null);
    if (!j?.ok) return { ok: false, error: String(j?.error || res.status) };
    return { ok: true, ts: String(j.ts || '') };
  } catch (e) {
    return { ok: false, error: (e as Error)?.name === 'AbortError' ? 'timeout' : String((e as Error)?.message || e) };
  } finally { clearTimeout(timer); }
}

// ── آخر نجاح وآخر خطأ في leaders.ops_status (صف channel=slack) ──
// النسخ كثيرة وقصيرة العمر، وما تذكره نسخة لا تعرفه أختها: نسخة تحجب نجاحها لأنها كتبت نجاحًا قبل قليل تُبقي خطأ نسخة
// أخرى ظاهرًا بعده. فكل نتيجة تُرسل، والقاعدة تحكم (مشغّل ops_status_keep_latest): الأحدث يبقى ولو وصل قبل الأقدم، وما لا
// يغير الحال خلال دقيقة لا يُكتب. لا يُنتظر ولا يُفشل النشر، وغياب الجدول (قبل ترحيله) يوقف الإرسال مدة statusMissingMs
// (دقيقة: نسخة دافئة سألت قبل الترحيل لا تحجب الحال طويلًا بعده). غير الغياب (صلاحية مثلًا) يُسجَّل ولا يوقف.
// 'paused' ليس ردًا من سلاك (توقف بعد 429 داخل النسخة) فلا يُسجَّل
const statusOf = (client: Client) => (typeof client?.schema === 'function' ? client.schema('leaders') : client).from('ops_status');
let statusMissingUntil = 0;
let statusWrite: Promise<void> | null = null;
function recordSlack(r: Sent) {
  try {
    if (!r.ok && r.error === 'paused') return;
    const now = Date.now();
    if (!lastClient || statusMissingUntil > now) return;
    const at = new Date(now).toISOString();
    const row = r.ok ? { channel: 'slack', ok_at: at, updated_at: at } : { channel: 'slack', error_at: at, error: String(r.error || 'unknown').slice(0, 80), updated_at: at };
    const client = lastClient;
    const w: Promise<void> = Promise.resolve()
      .then(() => statusOf(client).upsert(row, { onConflict: 'channel' }))
      .then((res: { error?: { code?: string; message?: string } } | null) => {
        if (!res?.error) return;
        if (isMissing(res.error, 'ops_status')) statusMissingUntil = Date.now() + SLACK.statusMissingMs;
        console.error('ops_status write:', res.error.message || res.error);
      })
      .catch((e: unknown) => console.error('ops_status write:', e))
      .finally(() => { if (statusWrite === w) statusWrite = null; });
    statusWrite = w;
    // الكتابة تبقى حية بعد رد الدالة كالنشر نفسه: waitUntil لا يحميها إلا إن سُجّلت فيه
    try {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(w);
    } catch { /* بيئة بلا waitUntil */ }
  } catch (e) { console.error('ops_status:', e); }
}

// ── سلسلة اليوم لكل فئة ──
// cache=false: سلسلة لا يعرفها الجدول، تُستعمل لهذه الدفعة ولا تُحفظ
// settled: حجز عالق حُكم عليه، فتبقى الفئة بلا سلسلة مدة flatMs بلا قراءة ولا انتظار
type Thread = { ts: string; cache?: boolean } | { flat: true; settled?: boolean } | { fail: true; error?: string };
const threads = new Map<string, Promise<Thread>>();
const flatUntil = new Map<string, number>();
let missingUntil = 0;
// غياب الجدول وحده: رمزه، أو رسالة الغياب نفسها باسمه. «permission denied for table ...» يحمل الاسم وليس غيابًا
export const isMissing = (e: { code?: string; message?: string }, table = 'slack_threads') => {
  if (e?.code === '42P01' || e?.code === 'PGRST205') return true;
  if (e?.code) return false;
  const m = String(e?.message || '');
  return m.includes(table) && /does not exist|could not find/i.test(m);
};

// الحجز قبل النشر (كرسالة الربط): الصف (day, category, ts='') أولًا، ومن ينجح إدراجه وحده ينشر الأم ثم يكتب ts.
// نسخة أخرى سبقت: تنتظر ts قليلًا، وإن لم يظهر نشرت هذه الدفعة بلا سلسلة
async function findOrCreate(client: Client, category: SlackCategory, day: string): Promise<Thread> {
  if (!client || missingUntil > Date.now()) return { flat: true };
  const read = () => tableOf(client).select('ts, created_at').eq('day', day).eq('category', category).maybeSingle();
  const { data, error } = await read();
  if (error) {
    if (isMissing(error)) missingUntil = Date.now() + SLACK.missingTableMs;
    console.error('slack_threads read:', error.message || error);
    return { flat: true };
  }
  if (data?.ts) return { ts: String(data.ts) };
  const waitOther = async (): Promise<Thread> => {
    for (let i = 0; i < SLACK.claimTries; i++) {
      await sleep(SLACK.claimWaitMs);
      const again = await read();
      if (again.data?.ts) return { ts: String(again.data.ts) };
    }
    return { flat: true, settled: true };
  };
  // حجز فارغ أقدم من staleClaimMs لن يكتمل (مهلة غامضة أو نسخة ماتت): بلا سلسلة فورًا
  if (data && Date.now() - Date.parse(data.created_at) > SLACK.staleClaimMs) return { flat: true, settled: true };
  if (data) return await waitOther();
  const claim = await tableOf(client).insert({ day, category, ts: '' });
  if (claim.error?.code === '23505') return await waitOther();
  if (claim.error) {
    if (isMissing(claim.error)) missingUntil = Date.now() + SLACK.missingTableMs;
    console.error('slack_threads claim:', claim.error.message || claim.error);
    return { flat: true };
  }
  const drop = () => tableOf(client).delete().eq('day', day).eq('category', category).eq('ts', '');
  const parent = await post(parentText(category));
  if (!parent.ok || !parent.ts) {
    console.error('slack parent:', parent.error);
    // المهلة غامضة (قد تكون الأم نُشرت): يبقى الحجز فلا تُنشر أم ثانية، وبقية اليوم بلا سلسلة. الرفض الصريح يحرر الحجز
    if (parent.ok || parent.error !== 'timeout') await drop();
    return { fail: true, error: parent.error };
  }
  const upd = await tableOf(client).update({ ts: parent.ts }).eq('day', day).eq('category', category);
  if (upd.error) { console.error('slack_threads update:', upd.error.message || upd.error); return { ts: parent.ts, cache: false }; }
  return { ts: parent.ts };
}
function threadFor(client: Client, category: SlackCategory): Promise<Thread> {
  const key = `${riyadhDay()}|${category}`;
  if ((flatUntil.get(key) ?? 0) > Date.now()) return Promise.resolve({ flat: true });
  let t = threads.get(key);
  if (!t) {
    t = findOrCreate(client, category, key.slice(0, 10)).catch((e) => { console.error('slack thread:', e); return { flat: true } as Thread; });
    threads.set(key, t);
    // ما ليس سلسلة لا يُحفظ: يُعاد البحث في الرسالة التالية، إلا حجزًا عالقًا (أو مهلة أم هذه النسخة) فيُذكر قراره مدة
    t.then((r) => {
      if (!('ts' in r) || r.cache === false) threads.delete(key);
      if (('settled' in r && r.settled) || ('fail' in r && r.error === 'timeout')) flatUntil.set(key, Date.now() + SLACK.flatMs);
    });
  }
  return t;
}

// ── الطابور ──
const pending = new Map<SlackCategory, string[]>();
// من ينتظر نتيجة سطره (slackDeliver): يُخبَر بنجاح الرسالة التي حملته أو فشلها، وما تُرك لازدحام يُخبَر بالفشل فورًا
const waiters = new Map<SlackCategory, ((ok: boolean) => void)[]>();
let pendingCount = 0;
let dropped = 0;
let lastClient: Client = null;
let pump: Promise<void> | null = null;

async function drain() {
  while (pendingCount > 0) {
    const [category, lines] = pending.entries().next().value as [SlackCategory, string[]];
    pending.delete(category);
    pendingCount -= lines.length;
    const told = waiters.get(category) ?? [];
    waiters.delete(category);
    const tell = (ok: boolean) => told.forEach((f) => { try { f(ok); } catch { /* لا يرمي */ } });
    const shown = lines.slice(0, SLACK.maxLines);
    let text = shown.join('\n');
    if (lines.length > shown.length) text += `\n(و${lines.length - shown.length} أخرى من النوع نفسه)`;
    const carried = dropped;
    if (dropped) { text += `\n(تُرك ${dropped} سطرًا لازدحام القناة)`; dropped = 0; }
    // ما لم يُنشر لازدحام (429 أو التوقف بعده) يُحسب في المتروك فيُذكر في أول رسالة بعده
    const lost = (error?: string) => { if (error === 'paused' || error === 'rate_limited') dropped += carried + lines.length; };
    const t = await threadFor(lastClient, category);
    if ('fail' in t) { lost(t.error); tell(false); continue; }
    const c = SLACK_CATEGORIES[category];
    const r = 'ts' in t ? await post(text, t.ts) : await post(`${c.icon} ${c.label}\n${text}`);
    if (!r.ok) { console.error('slack post:', category, r.error); lost(r.error); }
    tell(r.ok);
  }
}
function start() {
  if (pump || !pendingCount) return pump;
  pump = drain().catch((e) => console.error('slack:', e)).finally(() => {
    pump = null;
    // عطل غير متوقع في الطابور: من بقي ينتظر لا يبقى معلقًا
    if (!pendingCount) { for (const list of waiters.values()) list.forEach((f) => f(false)); waiters.clear(); }
    start();
  });
  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(pump);
  } catch { /* بيئة بلا waitUntil */ }
  return pump;
}

// عميل القاعدة الذي تُحفظ فيه السلاسل (كل دالة تمرر عميلها مرة)
export function slackUse(client: Client) { if (client) lastClient = client; }

// النشر نفسه: لا ينتظره المستدعي، ولا يرمي أبدًا. الوعد يُنتظر في الاختبار والمهمة الساعية وحدهما
export function slackPost(category: SlackCategory, text: string, { client, onResult }: { client?: Client; onResult?: (ok: boolean) => void } = {}): Promise<void> {
  try {
    if (!slackConfigured() || !SLACK_CATEGORIES[category]) { onResult?.(false); return Promise.resolve(); }
    slackUse(client);
    if (pausedUntil > Date.now() || pendingCount >= SLACK.maxPending) { dropped++; onResult?.(false); return pump ?? Promise.resolve(); }
    const line = slackEscape(String(text || '').slice(0, 600));
    const list = pending.get(category) ?? [];
    list.push(line);
    pending.set(category, list);
    if (onResult) waiters.set(category, [...(waiters.get(category) ?? []), onResult]);
    pendingCount++;
    return start() ?? Promise.resolve();
  } catch (e) { console.error('slack:', e); onResult?.(false); return Promise.resolve(); }
}
// النشر مع نتيجته: true إن نُشر السطر فعلًا في سلاك، وfalse إن لم يُضبط أو تُرك أو رُفض أو لم يُنشر قبل waitMs.
// لمن يقرر بالنتيجة قناة احتياطية (raiseAlert: بريد الطابور العالق لا يُرسل إن وصل سلاك)، ولا يرمي أبدًا
export function slackDeliver(category: SlackCategory, text: string, { client, waitMs = SLACK.deliverWaitMs }: { client?: Client; waitMs?: number } = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => finish(false), waitMs);
    slackPost(category, text, { client, onResult: finish });
  });
}
export async function slackIdle() { while (pump || statusWrite) await (pump ?? statusWrite); }

// ── السطور الجاهزة ──
// رمز الدخول: الحالة والغرض والبريد المقنّع والدالة، وأي ستة أرقام متتالية تُطمس احتياطًا
const STATUS = { sent: '✅ أُرسل', blocked: '⛔ حُجب', failed: '❌ تعذّر' } as const;
export function codeLine({ status, purpose, to, source, reason }: { status: keyof typeof STATUS; purpose?: string | null; to: string; source: string; reason?: string | null }) {
  const parts = [STATUS[status], purpose || 'رمز دخول', maskEmail(to), source, ...(reason ? [reason] : [])];
  return parts.join(' · ').replace(/\d{6}/g, '••••••');
}
export function mailLine({ kind, to, source, reason }: { kind: string; to: string; source: string; reason: string }) {
  return [`${kind}`, maskEmail(to), source, reason].join(' · ');
}
// تفاصيل التنبيه تأتي من مواضع كثيرة (رسالة خطأ، أو رد مزوّد، أو حقل من الطلب)، فتُطمس قبل النشر: البريد مقنّعًا
// (maskEmail)، والرمز السري ومفاتيح الواجهات والقيم الطويلة الشبيهة بها، والهاتف (يبقى آخر رقمين)، وأي ستة أرقام
// متتالية (رمز الدخول). الحقل باسم سرّي (token وsecret وpassword وotp وapi_key وما ينتهي بـ _token أو _secret أو _key)
// تُطمس قيمته كلها. المعرّفات بشكل UUID والتواريخ والأعداد القصيرة تبقى، فهي ما يدل على موضع العطل
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const SECRET_RE = /\b(?:xox[a-z]-|sk-|sk_|pk_|rk_|re_|whsec_|ghp_|gho_|github_pat_|eyJ)[A-Za-z0-9._-]{6,}|\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;
// طويل بحروف وأرقام معًا: mail_counter_unavailable اسم لا سر
const LONG_RE = /\b(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{24,}\b/g;
const PHONE_RE = /(?<![\w.:])\+?\d(?:[\s-]?\d){8,14}(?![\w.:])/g;
// ستة أرقام قائمة بنفسها: ما التصق بحرف أو شرطة سفلية جزء من معرّف (ord_123456) لا رمز
const CODE_RE = /(?<![A-Za-z0-9_])\d{6}(?![A-Za-z0-9_])/g;
// UUID يُحجز قبل الطمس ويعود بعده كما هو: مقاطعه الرقمية تشبه الهاتف والرمز، وهو ما يدل على موضع العطل
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const SECRET_KEY = /^(?:token|secret|password|passwd|otp|pin|code_value|api_?key|authorization|cookie|signature)$|_(?:token|secret|key)$/i;
export const MASKED = '[مخفي]';
export function maskText(t: string) {
  const held: string[] = [];
  return String(t)
    .replace(/[\uE000\uE001]/g, '')
    .replace(UUID_RE, (u) => `\uE000${held.push(u) - 1}\uE001`)
    .replace(SECRET_RE, MASKED)
    .replace(EMAIL_RE, (e) => maskEmail(e))
    .replace(PHONE_RE, (p) => `${'•'.repeat(4)}${p.replace(/\D/g, '').slice(-2)}`)
    .replace(LONG_RE, MASKED)
    .replace(CODE_RE, '••••••')
    .replace(/\uE000(\d+)\uE001/g, (_m, i) => held[Number(i)] ?? '');
}
function maskDetail(v: unknown, key = '', depth = 0): unknown {
  if (key && SECRET_KEY.test(key) && v != null && v !== '') return MASKED;
  if (typeof v === 'string') return maskText(v);
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) >= 1e5 && Math.abs(v) < 1e7 ? maskText(String(v)) : v;
  if (depth > 4 || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => maskDetail(x, '', depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, maskDetail(x, k, depth + 1)]));
}
// التفاصيل نفسها مطموسة لكل قناة غير البريد (رابط التنبيه في mail.ts كذلك): لا قناة تحمل ما تخفيه أختها
export const maskAlertDetail = (detail: Record<string, unknown>) => maskDetail(detail) as Record<string, unknown>;
export function alertLine(kind: string, detail: Record<string, unknown>) {
  let d = '';
  try { d = JSON.stringify(maskDetail(detail)); } catch { d = ''; }
  return `*${maskText(kind)}* ${d}`.slice(0, 1200);
}
export const slackCode = (client: Client, o: Parameters<typeof codeLine>[0]) => slackPost('codes', codeLine(o), { client });
export const slackMail = (client: Client, o: Parameters<typeof mailLine>[0]) => slackPost('mail', mailLine(o), { client });
export const slackAlert = (kind: string, detail: Record<string, unknown>) => slackPost('alerts', alertLine(kind, detail));
export const slackAlertDelivered = (kind: string, detail: Record<string, unknown>) => slackDeliver('alerts', alertLine(kind, detail));

// ── رسالة الربط: مرة واحدة من المهمة الساعية، وعلامتها صف category=hello ──
// بلا الجدول لا تُرسل (لا علامة تمنع تكرارها كل ساعة)
export async function slackHello(client: Client): Promise<'off' | 'exists' | 'no_table' | 'sent' | 'failed'> {
  try {
    if (!slackConfigured()) return 'off';
    slackUse(client);
    const { data, error } = await tableOf(client).select('ts').eq('category', 'hello').limit(1);
    if (error) return 'no_table';
    if (data?.length) return 'exists';
    // الحجز قبل الإرسال: نسختان معًا لا ترسلان مرتين
    const day = riyadhDay();
    const claim = await tableOf(client).insert({ day, category: 'hello', ts: '' });
    if (claim.error) return claim.error.code === '23505' ? 'exists' : 'failed';
    const r = await post(SLACK_HELLO);
    if (!r.ok) {
      console.error('slack hello:', r.error);
      // المهلة غامضة (قد تكون وصلت): يبقى الحجز فلا تتكرر. الرفض الصريح يحرره فتُعاد في الساعة التالية
      if (r.error !== 'timeout') await tableOf(client).delete().eq('day', day).eq('category', 'hello');
      return 'failed';
    }
    await tableOf(client).update({ ts: r.ts }).eq('day', day).eq('category', 'hello');
    return 'sent';
  } catch (e) { console.error('slack hello:', e); return 'failed'; }
}

// للاختبار
export function resetSlack() {
  threads.clear(); flatUntil.clear(); pending.clear(); pendingCount = 0; dropped = 0; pausedUntil = 0; lastSendAt = 0; missingUntil = 0; lastClient = null;
  statusMissingUntil = 0; statusWrite = null;
  for (const list of waiters.values()) list.forEach((f) => f(false));
  waiters.clear();
}
