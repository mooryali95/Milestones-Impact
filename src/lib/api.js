// ════════════════════════════════════════════════════════════════
// DATABASE ACCESS — via server-side Edge Functions
// ════════════════════════════════════════════════════════════════
// All privileged reads/writes go through the user-api / admin-api Edge
// Functions, which authenticate a per-session token server-side. The anon
// key below is public by design and only unlocks: (a) public SELECT on
// process_details / app_content, and (b) invoking the Edge Functions —
// it grants no access to registrations, OTP codes, or admin data.

import { isAuthAction, isReadAction, replayable } from '../../supabase/functions/_shared/action-kinds.js';

export const SUPABASE_URL = 'https://eormhcupwgwpllhrfxxg.supabase.co';
// منطقة تنفيذ الدوال هي منطقة القاعدة نفسها (مومباي)، مصدر واحد لعملاء الدوال كلهم. بلا تثبيت تعمل الدالة في أقرب
// منطقة إلى الطالب، فتدفع كل رحلة إلى القاعدة مئات المللي ثانية (ops-3، تدقيق 2026-11-11: us-east-2 وdb_ms بين 297
// و968، ومثبتة بين 25 و85). المعامل لا ترويسة x-region لأن الترويسة تحتاج إذنًا في CORS، وهو ما يوصي به توثيق Supabase
// (Regional Invocations) للدوال كثيرة الرحلات إلى القاعدة.
export const FUNCTION_REGION = 'ap-south-1';
export const fnUrl = (fn) => `${SUPABASE_URL}/functions/v1/${fn}?forceFunctionRegion=${FUNCTION_REGION}`;
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0';

// Invoke an Edge Function. The anon key stays in the Authorization header
// (required by the Supabase gateway); the per-session token — when present —
// is carried inside the JSON body and verified server-side.
export async function callFn(fn, body) {
  try {
    // سياسة الإعادة من نوع الفعل (postAction): القراءة تُعاد، والكتابة لا تُعاد بعد خطأ شبكة
    const { r: res } = await postAction(fn, body);
    if (BUSY_STATUS.includes(res.status)) return { success: false, message: 'الخادم مشغول لحظيًا، حاول بعد ثوانٍ' };
    return await res.json();
  } catch (e) { return { success: false, message: 'خطأ في الاتصال بالخادم' }; }
}

// Public read of the two openly-readable content tables (SELECT-only via RLS).
// يعيد مصفوفة عند النجاح — وقد تكون فارغة لأن الجدول فارغ فعلاً —
// و null عند الفشل. التمييز مقصود: بدونه لا تستطيع الواجهة أن تفرّق
// بين "لا توجد بيانات" و"تعذّر الوصول"، فتعرض فراغاً صامتاً في الحالتين.
export async function publicRead(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (e) { return null; }
}

// ── User data API (token-scoped: a user only ever sees/writes their own row) ──
export const UserAPI = {
  // captcha: رمز Turnstile حين يطلبه الخادم (D15)
  registerSend: (name, phone, email, captcha) => callFn('user-api', { action: 'register-send', name, phone, email, ...(captcha ? { captcha } : {}) }),
  resumeSend: (phone, captcha) => callFn('user-api', { action: 'resume-send', phone, ...(captcha ? { captcha } : {}) }),
  verify: (payload) => callFn('user-api', { action: 'verify', ...payload }),
  get: (token) => callFn('user-api', { action: 'get', token }),
  save: (token, fields) => callFn('user-api', { action: 'save', token, fields }),
  passkeyLoginOptions: () => callFn('user-api', { action: 'passkey-login-options' }),
  passkeyLoginVerify: (response) => callFn('user-api', { action: 'passkey-login-verify', response }),
  passkeyStatus: (token) => callFn('user-api', { action: 'passkey-status', token }),
  passkeyRegisterOptions: (token) => callFn('user-api', { action: 'passkey-register-options', token }),
  passkeyRegisterVerify: (token, response, label) => callFn('user-api', { action: 'passkey-register-verify', token, response, label }),
};


// ── طلب يعيد المحاولة أمام الأعطال العابرة (تصور التحديث بلا أثر، المرحلة 3، ش9) ──
// بوابة Supabase ترد 502/503/504 («Service is temporarily unavailable») عند إقلاع الدالة بعد خمول أو نشر، وانقطاع الجهاز
// (انتقال بين الجوال والواي فاي، استيقاظ من السكون) يرمي fetch نفسه. و504 قد يصل بعد أن عملت الدالة، والطلب العالق بلا مهلة
// يبقى هيكل تحميل بلا نهاية. فلكل محاولة مهلة، وبين المحاولات تراجع أسي بعشوائية كاملة، ولكل نوع طلب ميزانية:
// - القراءة: مهلة 12 ثانية للمحاولة وميزانية 20 ثانية. أبطأ ping حقيقي رأيناه في مسبار الإنتاج 3.4 ثانية من الطرف إلى الطرف
//   بإقلاع بارد (probe.yml، 2026-11-16 19:41)، وdb_ms حتى 979 للاستعلام الواحد، وme مع الرئيسية أربعة طلبات بعضها متوازٍ:
//   12 ثانية ضعف أبطأ me سليم متوقع على الأقل، فلا تصنع المهلة الفشل الذي تعالجه.
// - الكتابة بمفتاح منع تكرار يحفظه الخادم: تعاد مثل القراءة بميزانية أصغر (8 ثوانٍ)، والخادم يعيد النتيجة الأولى لا ينفذها مرتين.
// - الكتابة بلا مفتاح محفوظ: لا تُعاد بعد خطأ شبكة أو مهلة أو 504 (قد تكون نُفذت)، وتُعاد عند 502/503 وحدهما (البوابة لم
//   تشغّلها) بميزانية 3 ثوانٍ كما كانت تقريبًا.
// ومهلة الكتابة 150 ثانية: حد زمن الدالة في Supabase (wall clock) على الخطة المجانية، وبعض الكتابات طويلة بطبيعتها (المساعد).
// المهلة بـ AbortController وsetTimeout لا بـ AbortSignal.timeout الغائب في iOS قبل 16.
// يعيد Response، أو يرمي عند انقطاع الشبكة أو المهلة بعد آخر محاولة (الخطأ يحمل timeout: true عند المهلة).
export const BUSY_STATUS = [502, 503, 504];
export const READ_POLICY = Object.freeze({ timeout: 12_000, budget: 20_000, network: true, gatewayTimeout: true });
export const WRITE_POLICY = Object.freeze({ timeout: 150_000, budget: 8_000, network: true, gatewayTimeout: true });
export const WRITE_UNSURE_POLICY = Object.freeze({ timeout: 150_000, budget: 3_000, network: false, gatewayTimeout: false });
// التراجع: المحاولة n تنتظر عددًا عشوائيًا بين 0 و min(cap, base·2^(n-1)) (full jitter، AWS Architecture Blog)، فلا يعود
// كل المستخدمين معًا لحظة يعود الخادم
export const backoffDelay = (n, { base = 500, cap = 5_000, random = Math.random } = {}) => Math.floor(random() * Math.min(cap, base * 2 ** (n - 1)));
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// محاولة واحدة بمهلة. signal المستدعي (إن وُجد) يلغيها أيضًا
async function attempt(url, init, ms) {
  if (!ms || typeof AbortController === 'undefined') return fetch(url, init);
  const ctl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
  const outer = init?.signal;
  const relay = () => ctl.abort();
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', relay, { once: true }); }
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (timedOut) { const err = new Error('timeout'); err.name = 'TimeoutError'; err.timeout = true; throw err; }
    throw e;
  } finally {
    clearTimeout(t);
    if (outer) outer.removeEventListener('abort', relay);
  }
}

// هل الرد عطل عابر من البوابة لا من الدالة؟ الدالة نفسها قد ترد 503 بجسم JSON فيه success (حالة عمل لا إقلاع): أجابت فلا يُعاد.
// و409 بترويسة x-idem: pending: الطلب نفسه بمفتاحه ما زال يعمل على الخادم، فيُنتظر ولا يُنفذ ثانية
async function transient(r, policy) {
  if (r.status === 409 && r.headers?.get?.('x-idem') === 'pending') return policy.network;
  if (!BUSY_STATUS.includes(r.status)) return false;
  if (r.status === 504 && !policy.gatewayTimeout) return false;
  const body = typeof r.clone === 'function' ? await r.clone().json().catch(() => null) : null;
  return !(body && typeof body === 'object' && 'success' in body);
}

export async function fetchRetry(url, init, opts = {}) {
  const p = { ...READ_POLICY, ...opts };
  const now = p.now || (() => Date.now());
  const sleep = p.sleep || ((ms) => new Promise((res) => setTimeout(res, ms)));
  const t0 = now();
  for (let i = 1; ; i += 1) {
    const left = p.budget - (now() - t0);
    // المحاولة الأولى بمهلتها كاملة، وما بعدها لا يتجاوز الميزانية كثيرًا (4 ثوانٍ على الأقل حتى لا تُقطع محاولة سليمة)
    const ms = i === 1 ? p.timeout : Math.min(p.timeout, Math.max(left, 4_000));
    let res = null, err = null;
    try {
      res = await attempt(url, init, ms);
      if (!(await transient(res, p))) return res;
    } catch (e) {
      if (init?.signal?.aborted) throw e;
      err = e;
      // بلا اتصال لا فائدة من الانتظار هنا: المستدعي يعيد عند حدث online (App.jsx). وخطأ الشبكة في كتابة بلا مفتاح لا يُعاد
      if (!p.network || offlineNow()) throw e;
    }
    const wait = backoffDelay(i, { base: p.base, cap: p.cap, random: p.random });
    if (now() - t0 + wait >= p.budget) { if (err) throw err; return res; }
    p.onRetry?.(i, err || res);
    await sleep(wait);
  }
}

// ── مفتاح منع التكرار (ش9) ──
// مفتاح لكل كتابة منطقية، ثابت عبر إعاداتها، يُرسل في الجسم (idem). الخادم (leaders-api/idempotency.ts) يحفظ نتيجتها بالمفتاح
// والفاعل 24 ساعة ويعيدها بدل التنفيذ ثانية. ويعلن في كل رد بالترويسة x-idem أنه يحفظ؛ قبل الترحيل 20261118140000 لا يعلن،
// فلا تُعاد الكتابة تلقائيًا بعد خطأ شبكة. وكتابة لم يُعرف مصيرها يُحفظ مفتاحها 10 دقائق في الذاكرة: إن أعادها المستخدم
// بالجسم نفسه أُرسلت بالمفتاح نفسه، فيعيد الخادم نتيجتها إن كانت قد نُفذت
export const idemState = { active: false };
const UNSURE_MS = 10 * 60_000;
const unsure = new Map();
export function newIdemKey() {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  const a = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(a); else for (let i = 0; i < a.length; i += 1) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}
function keyFor(fp, at = Date.now()) {
  for (const [k, v] of unsure) if (at - v.at > UNSURE_MS) unsure.delete(k);
  return unsure.get(fp)?.key || newIdemKey();
}
export const learnIdem = (r) => {
  const h = r?.headers?.get?.('x-idem');
  idemState.active = !!h && h !== 'off';
};

// طلب فعل لدالة: يختار سياسة الإعادة من نوع الفعل (_shared/action-kinds.js)، ويضيف مفتاح منع التكرار لكتابات leaders-api.
// يعيد { r } بالرد، أو يرمي خطأ يحمل offline (الجهاز بلا اتصال) وuncertain (كتابة لا يُعرف أنفذت أم لا وإعادتها غير مأمونة)
export async function postAction(fn, payload, extra = {}) {
  const action = payload?.action;
  const read = isReadAction(fn, action);
  const keyed = !read && replayable(fn, action);
  const plain = JSON.stringify(payload);
  const fp = keyed ? `${fn}\n${plain}` : null;
  const key = keyed ? keyFor(fp) : null;
  const safe = read || (keyed && idemState.active);
  const policy = read ? READ_POLICY : safe ? WRITE_POLICY : WRITE_UNSURE_POLICY;
  try {
    const r = await fetchRetry(fnUrl(fn), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: key ? JSON.stringify({ ...payload, idem: key }) : plain,
    }, { ...policy, ...extra });
    if (fn === 'leaders-api') learnIdem(r);
    // كتابة بمفتاح انتهت بعطل خادم أو ما زالت تعمل (409 pending): قد تكون نُفذت، فيبقى مفتاحها لإعادة يدوية. وما سوى ذلك
    // نتيجة معروفة، ومنها رفض 409 من الفعل نفسه (المقاعد تغيرت…): يُصحَّح ثم يُعاد بمفتاح جديد لا يعيد الرفض القديم
    if (key) { if (r.status >= 500 || (r.status === 409 && r.headers?.get?.('x-idem') === 'pending')) unsure.set(fp, { key, at: Date.now() }); else unsure.delete(fp); }
    return { r };
  } catch (e) {
    if (key) unsure.set(fp, { key, at: Date.now() });
    const err = e instanceof Error ? e : new Error(String(e));
    err.offline = offlineNow();
    // الدخول لا «تعذّر التأكد»: لا شيء يُتحقق منه في شاشة الدخول، فرسالة الشبكة
    err.uncertain = !read && !safe && !isAuthAction(fn, action);
    throw err;
  }
}

// رسائل خطأ الاتصال، مصدرها الواحد للتطبيقات
export const NET_MESSAGES = Object.freeze({
  offline: 'لا اتصال بالإنترنت، تحقّق من اتصالك وحاول مرة أخرى',
  network: 'تعذّر الاتصال، تحقّق من الشبكة وحاول مرة أخرى',
  uncertain: 'تعذّر التأكد، تحقّق قبل الإعادة',
});
export const netMessage = (e, fallback = NET_MESSAGES.network) => (e?.offline ? NET_MESSAGES.offline : e?.uncertain ? NET_MESSAGES.uncertain : fallback);
