// ════════════════════════════════════════════════════════════════
// مفتاح منع التكرار للكتابة (تصور التحديث بلا أثر، المرحلة 3، البند 6، ش9)
// ════════════════════════════════════════════════════════════════
// العميل يرسل مع كل كتابة مفتاحًا (idem) ثابتًا عبر إعاداتها (src/lib/api.js postAction). هنا يُحفظ أول تنفيذ بالمفتاح
// والفاعل، وتعيد الإعادة نتيجته الأولى بدل التنفيذ ثانية، مدة 24 ساعة (نمط Stripe). فإعادة المحاولة بعد خطأ شبكة أو 504
// (قد يصل بعد أن عملت الدالة) لا تكرر حفظًا ولا تسليمًا ولا رسالة.
// - الفاعل بصمة لا هوية: sha256 للدور ومعرّفه، فلا بريد ولا معرّف مقروء في الجدول.
// - الطلب بصمته وحدها (sha256 للفعل والجسم بلا التوكن والمفتاح): المفتاح نفسه بجسم آخر يُرفض (idem_mismatch) لا يُعاد.
// - الرد يُحفظ إن صغر (32 ألف حرف) وخلا من رمز أو سر، وإلا حُفظ مختصره (النجاح والرسالة)، فلا رمز ولا سر في الجدول أبدًا.
// - خطأ الخادم (5xx أو استثناء) يحرر المفتاح فتُنفذ الإعادة، لأن الكتابة لم تكتمل. والرفض (4xx) يُحفظ كما هو، إلا 409 و429:
//   رفض يُقصد أن يُعاد بعد تصحيح (المقاعد تغيرت، لم يُرحَّل بعد، تجاوز المعدل)، فيُحرر المفتاح ولا يُعاد الرفض القديم.
// - الصف يعيش 24 ساعة: يحذفه pg_cron كل ساعة (الترحيل 20261118140000) وpurge الأسبوعي احتياطًا، والصف الأقدم من ذلك
//   إن بقي يُعامل غائبًا فيُستعاد ولا يُعاد رده.
// - مفتاح وفاعل والحماية لا تُؤكد (تعذّر فحص الجدول أو حجز المفتاح لسبب غير غيابه): لا يُنفذ الفعل، ويُرد 503 busy بالترويسة
//   x-idem: off، فلا يعيده العميل تلقائيًا. ينفذ بلا حماية في حالة واحدة: الجدول غائب مؤكدًا (قبل الترحيل لا يُعلن الحفظ).
// - التنفيذ الجاري يرد 409 بالترويسة x-idem: pending، فينتظر العميل ويعيد ولا ينفذ اثنان معًا. والجاري أكثر من 7 دقائق
//   (أطول من حد زمن الدالة) مات مع عامله، فيُستعاد المفتاح.
// قبل الترحيل 20261118140000 (الجدول غائب) يُتجاهل المفتاح وتعمل الكتابة كما كانت، ولا تُعلن الترويسة x-idem، فلا يعيد
// العميل الكتابة تلقائيًا بعد خطأ شبكة (يعرض «تعذّر التأكد، تحقّق قبل الإعادة»).
import { db, Fail, reply, sha256Hex } from './core.ts';
import { missingTable } from './missing-column.ts';
import { IDEM_KEY_RE, replayable } from '../_shared/action-kinds.js';

type Body = Record<string, any>;
export const IDEM_TABLE = 'idempotency_keys';
export const IDEM_TTL_HOURS = 24;
export const IDEM_MAX_RESPONSE = 32_000;
export const IDEM_STALE_MS = 7 * 60_000;
const RECHECK_MS = 5 * 60_000;

// جاهزية الجدول، مخزنة في العامل. null: لم تُعرف بعد. الغياب يُعاد فحصه بعد 5 دقائق (ترحيل طُبق والعامل حي)
const state: { ready: boolean | null; at: number; probe: Promise<boolean> | null } = { ready: null, at: 0, probe: null };
export function resetIdemState() { state.ready = null; state.at = 0; state.probe = null; }
export function idemReady(): Promise<boolean> {
  if (state.ready === true) return Promise.resolve(true);
  if (state.ready === false && Date.now() - state.at < RECHECK_MS) return Promise.resolve(false);
  state.probe ||= (async () => {
    try {
      const { error } = await db.from(IDEM_TABLE).select('key', { head: true, count: 'exact' }).limit(1);
      if (!error) { state.ready = true; return true; }
      // تعذّر لا يُعرف سببه لا يُخزَّن: يُتجاهل المفتاح في هذا الطلب ويُفحص في الذي يليه
      if (missingTable(error)) { state.ready = false; state.at = Date.now(); }
      return false;
    } catch { return false; } finally { state.probe = null; }
  })();
  return state.probe;
}

// إعلان الحفظ في كل رد (x-idem: on)، ليعرف العميل أن إعادة الكتابة مأمونة. لا ينتظر الفحص: أول رد في عامل جديد قد
// يخلو منه، فلا يعيد العميل كتابة حتى يعرف (يفشل مغلقًا)
export function advertise(res: Response) {
  if (state.ready === null && !state.probe) idemReady();
  if (state.ready === true && !res.headers.has('x-idem')) res.headers.set('x-idem', 'on');
  return res;
}

// المفتاح من الجسم إن كان الفعل كتابة تُحفظ، ثم يُحذف من الجسم فلا يصل دالة الفعل
export function takeKey(action: string, b: Body): string | null {
  const k = b?.idem;
  if (b && 'idem' in b) delete b.idem;
  return typeof k === 'string' && IDEM_KEY_RE.test(k) && replayable('leaders-api', action) ? k : null;
}

export async function requestHash(action: string, b: Body) {
  const { token: _t, idem: _i, ...rest } = b || {};
  return sha256Hex(`${action}\n${JSON.stringify(rest)}`);
}
export const actorHash = (role: string, id: string) => sha256Hex(`idem-actor:${role}:${id}`);

// رد فيه رمز دخول أو إيصال أو سر أو رابط بسر لا يُحفظ نصه
const SECRET_KEYS = /^(token|receipt|secret|password|otp|link|signedUrl|checkout_url)$/i;
const SECRET_VALUE = /[?&#](t|token|demo|link)=/i;
export function hasSecret(v: unknown, depth = 0): boolean {
  if (depth > 6 || v == null) return false;
  if (typeof v === 'string') return SECRET_VALUE.test(v);
  if (Array.isArray(v)) return v.some((x) => hasSecret(x, depth + 1));
  if (typeof v === 'object') return Object.entries(v as Body).some(([k, x]) => SECRET_KEYS.test(k) || hasSecret(x, depth + 1));
  return false;
}
// ما يُحفظ من الرد: نصه كاملًا إن صغر وخلا من سر، وإلا مختصره (النجاح والرمز والرسالة) بعلامة replayed
export function storable(body: unknown): Body {
  const text = JSON.stringify(body ?? null);
  if (text.length <= IDEM_MAX_RESPONSE && !hasSecret(body)) return body as Body;
  const b = (body && typeof body === 'object' ? body : {}) as Body;
  return { success: b.success === true, ...(typeof b.code === 'string' && { code: b.code }), ...(typeof b.message === 'string' && { message: b.message.slice(0, 300) }), replayed: true };
}

const mark = (res: Response, v: string) => { res.headers.set('x-idem', v); return res; };
const PENDING = { success: false, code: 'busy', message: 'طلبك السابق ما زال قيد التنفيذ، انتظر لحظات ثم حدّث الصفحة' };
// الحماية لم تُؤكد: لا تنفيذ. الجسم فيه success فلا يعيده العميل تلقائيًا، وx-idem: off يُطفئ إعلان الحفظ عنده
const UNPROTECTED = { success: false, code: 'busy', message: 'الخادم مشغول لحظيًا، حاول بعد ثوانٍ' };
const refuse = (req: Request) => mark(reply(req, UNPROTECTED, 503), 'off');
// رفض يُقصد أن يُعاد بعد تصحيح: لا يُحفظ
const RETRYABLE_REFUSAL = new Set([409, 429]);
const TTL_MS = IDEM_TTL_HOURS * 36e5;

// تنفيذ فعل كتابة بمفتاحه. run ينفذ الفعل ويعيد جسم الرد، أو يرمي Fail أو خطأ. key وحده (لا فاعل) لا يكفي
export async function withIdempotency(req: Request, action: string, b: Body, key: string | null, actor: string | null, run: () => Promise<unknown>): Promise<Response> {
  if (!key || !actor) return reply(req, await run());
  if (!(await idemReady())) return state.ready === false ? reply(req, await run()) : refuse(req);
  const hash = await requestHash(action, b);
  const ins = await db.from(IDEM_TABLE).insert({ key, actor, action, req_hash: hash });
  if (ins.error) {
    if (missingTable(ins.error)) { state.ready = false; state.at = Date.now(); return reply(req, await run()); }
    if (String(ins.error.code) !== '23505') { console.error('idempotency claim', ins.error.message); return refuse(req); }
    const { data: row, error } = await db.from(IDEM_TABLE).select('action, req_hash, status, response, created_at').eq('actor', actor).eq('key', key).maybeSingle();
    if (error || !row) { console.error('idempotency read', error?.message); return mark(reply(req, PENDING, 409), 'pending'); }
    const age = Date.now() - Date.parse(row.created_at);
    if (age >= TTL_MS) {
      // أقدم من مدة الحفظ ولم يحذفه التنظيف بعد: غائب، فيُستعاد للطلب الجديد بشرط أن يبقى كما قرأناه
      const took = await db.from(IDEM_TABLE).update({ action, req_hash: hash, status: null, response: null, finished_at: null, created_at: new Date().toISOString() })
        .eq('actor', actor).eq('key', key).eq('created_at', row.created_at).select('key');
      if (took.error || !(took.data || []).length) return mark(reply(req, PENDING, 409), 'pending');
    } else {
      if (row.req_hash !== hash || row.action !== action) throw new Fail('مفتاح الطلب استُعمل لطلب آخر، حدّث الصفحة وأعد المحاولة', 422, 'idem_mismatch');
      if (row.status != null) return mark(reply(req, row.response, row.status), 'replayed');
      // جارٍ: ينتظر العميل. والجاري منذ أطول من حد زمن الدالة مات مع عامله، فيُستعاد بشرط أن يبقى كما قرأناه
      if (age < IDEM_STALE_MS) return mark(reply(req, PENDING, 409), 'pending');
      const took = await db.from(IDEM_TABLE).update({ created_at: new Date().toISOString() }).eq('actor', actor).eq('key', key).is('status', null).eq('created_at', row.created_at).select('key');
      if (took.error || !(took.data || []).length) return mark(reply(req, PENDING, 409), 'pending');
    }
  }
  let out: unknown;
  try {
    out = await run();
  } catch (e) {
    if (e instanceof Fail && e.status < 500 && !RETRYABLE_REFUSAL.has(e.status)) {
      const body = { success: false, message: e.message, code: e.code, ...e.extra };
      await finish(actor, key, e.status, body);
      throw e;
    }
    await release(actor, key);
    throw e;
  }
  await finish(actor, key, 200, out);
  return mark(reply(req, out), 'stored');
}

async function finish(actor: string, key: string, status: number, body: unknown) {
  const { error } = await db.from(IDEM_TABLE).update({ status, response: storable(body), finished_at: new Date().toISOString() }).eq('actor', actor).eq('key', key);
  // تعذّر الحفظ بعد التنفيذ: يُحرر المفتاح كي لا يبقى «جاريًا» يحجب الإعادة، والإعادة عندها قد تكرر (كما قبل هذا الجدول)
  if (error) { console.error('idempotency finish', error.message); await release(actor, key); }
}
async function release(actor: string, key: string) {
  const { error } = await db.from(IDEM_TABLE).delete().eq('actor', actor).eq('key', key);
  if (error) console.error('idempotency release', error.message);
}

// حذف صفوف فاعل كلها (تنفيذ قرار الحذف، admin.ts removeParticipant): ردود محفوظة باسمه لا تبقى بعد محو بياناته.
// قبل الترحيل لا جدول فلا شيء يُحذف، والتعذّر يُسجَّل ولا يقف الحذف (الصفوف تنتهي بالتنظيف خلال ساعة على أبعد تقدير)
export async function forgetActor(role: string, id: string) {
  const { error } = await db.from(IDEM_TABLE).delete().eq('actor', await actorHash(role, id));
  if (error && !missingTable(error)) console.error('idempotency forget', error.message);
}
