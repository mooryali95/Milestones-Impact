// ════════════════════════════════════════════════════════════════
// الرصد من جهة العميل (تصور التحديث بلا أثر، المرحلة 4، البنود 1 و2)
// ════════════════════════════════════════════════════════════════
// إخفاق يراه المستخدم ولا يراه الخادم (انقطاع، رد بوابة بلا CORS، مهلة، ملف قسم حذفه نشر أحدث، خطأ رسم) يُسجَّل حدثًا
// صغيرًا ويُرسل إلى الفعل المفتوح client.event في leaders-api (client-events.ts)، فتُفسَّر لقطة مثل لقطة 2026-11-18 من البيانات.
// الحقول وحدها: نوع الإخفاق، واسم الفعل، وعدد المحاولات، ومعرّف البناء، والوقت، ونص قصير منقّى لأخطاء الصفحة وحدها.
// لا رمز ولا جسم طلب ولا رابط باستعلام ولا معرّف مستخدم ولا بريد ولا رقم طويل (scrub). وتغيير السياسة غير جوهري (2026-11-24).
// - الحدث يُحفظ في localStorage أولًا (طابور محدود QUEUE_MAX)، ويُرسل بعد عودة الاتصال: العطل الذي نرصده يمنع الإرسال لحظته.
// - الإرسال fetch بـkeepalive لا navigator.sendBeacon: الثاني لا يرسل ترويستي apikey وAuthorization، وleaders-api منشورة بتحقق
//   JWT في البوابة فترفضه. وبلا fetchRetry ولا postAction: لا إعادة ولا حدث عن إخفاق الرصد نفسه.
// - قبل الترحيل 20261118150000 يرد الخادم not_migrated: يُسقط الطابور بصمت ولا يُرسل شيء آخر في هذه الصفحة.
import { clientBuild, fnUrl, SUPABASE_KEY } from '../../src/lib/api.js';
import { isChunkError } from '../../shared/ui/lazy-retry.js';
import { CLIENT_EVENT_BODY_CHARS, CLIENT_EVENT_KINDS, cleanAct, MESSAGE_KINDS } from '../../supabase/functions/_shared/client-events.js';

export const QUEUE_KEY = 'mi_leaders_client_events';
export const QUEUE_MAX = 30;
export const BATCH_MAX = 20;
export const MESSAGE_MAX = 160;
// سقف الجسم كما يقيسه الخادم (413 فوقه) بهامش: الدفعة تُقص تحته، وما زاد يبقى في الطابور للإرسال التالي
export const BODY_MAX = CLIENT_EVENT_BODY_CHARS - 200;
export const batchBody = (batch) => JSON.stringify({ action: 'client.event', events: batch });
const DEDUPE_MS = 60_000;
// المصدر الواحد لأنواع الإخفاق وشكل اسم الفعل: _shared/client-events.js، يقرؤه الخادم أيضًا
export { CLIENT_EVENT_KINDS };

// تنقية نص الخطأ: لا بريد، ولا رابط باستعلامه، ولا سلسلة أرقام (هاتف، رمز دخول، معرّف)، ولا معرّف طويل، ثم قصّ
export function scrub(message) {
  return String(message ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[id]')
    .replace(/\d{3,}/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_MAX);
}

// نوع الإخفاق من رد مقروء: البوابة المشغولة (busy من parse)، أو خطأ الخادم الداخلي (5xx من الدالة). وما سواهما ليس إخفاقًا
// يُرصد هنا (رفض الفعل، والجلسة المنتهية، وحالات العمل بـ503 وجسمها success مثل not_migrated)
export function failureOf(status, res) {
  if (res?.code === 'busy') return 'busy';
  if (status >= 500 && (!res?.code || res.code === 'internal')) return '5xx';
  return null;
}

function store() { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
export function queued() {
  try { const v = JSON.parse(store()?.getItem(QUEUE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list) {
  try { if (list.length) store()?.setItem(QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX))); else store()?.removeItem(QUEUE_KEY); } catch { /* التخزين ممتلئ أو مغلق */ }
}

const state = { off: false, sending: null, pauseUntil: 0, timer: null };
export function _resetTelemetry() { state.off = false; state.sending = null; state.pauseUntil = 0; clearTimeout(state.timer); state.timer = null; }

// يسجّل حدثًا في الطابور. الحدث نفسه (النوع والفعل والنص) خلال دقيقة لا يتكرر: انقطاع يُسقط عشرة طلبات حدث واحد
export function report(kind, { act = '', tries = 1, message = '' } = {}, now = Date.now()) {
  if (state.off || !CLIENT_EVENT_KINDS.includes(kind)) return null;
  const ev = { kind, act: cleanAct(act), tries: Math.max(1, Math.min(50, Math.round(Number(tries) || 1))), build: clientBuild(), at: new Date(now).toISOString() };
  const msg = MESSAGE_KINDS.includes(kind) ? scrub(message) : '';
  if (msg) ev.message = msg;
  const list = queued();
  if (list.some((x) => x.kind === ev.kind && x.act === ev.act && (x.message || '') === (ev.message || '') && now - Date.parse(x.at) < DEDUPE_MS)) return null;
  list.push(ev);
  save(list);
  schedule();
  return ev;
}

// طلب نجح والطابور فيه ما ينتظر (عاد الاتصال بلا حدث online: بوابة عادت، أو شبكة تبدلت): يُرسل بعد لحظة
export function afterSuccess() {
  if (state.off || state.timer || state.sending) return;
  if (queued().length) schedule(1_000);
}

function schedule(ms = 2_000) {
  if (state.timer || typeof setTimeout === 'undefined') return;
  state.timer = setTimeout(() => { state.timer = null; flush(); }, ms);
}

// إرسال الطابور دفعات صغيرة. ما قبله الخادم أو رفضه رفضًا نهائيًا يُحذف، وما تعذّر إرساله يبقى لعودة الاتصال
export async function flush({ fetchImpl = typeof fetch === 'function' ? fetch : null, now = Date.now() } = {}) {
  if (state.off || !fetchImpl || state.sending || now < state.pauseUntil) return state.sending;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const list = queued();
  if (!list.length) return null;
  const batch = list.slice(0, BATCH_MAX);
  // نص الأخطاء بعلامات تنصيص وشرطات مائلة يتضاعف في JSON، فعشرون حدثًا قد تتجاوز السقف. الحدث الواحد يُرسل كما هو
  while (batch.length > 1 && batchBody(batch).length > BODY_MAX) batch.pop();
  state.sending = (async () => {
    let body = null;
    try {
      const r = await fetchImpl(fnUrl('leaders-api'), {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: batchBody(batch),
      });
      body = await r.json().catch(() => null);
      if (body?.code === 'not_migrated') { state.off = true; save([]); return 'off'; }
      // تجاوز الحد: ينتظر عشر دقائق ويبقى الطابور. والرفض النهائي (شكل غير مقبول) يُسقط الدفعة فلا تعلق
      if (r.status === 429) { state.pauseUntil = now + 10 * 60_000; return 'paused'; }
      if (r.status >= 500) return 'kept';
      save(queued().filter((x) => !batch.some((y) => y.at === x.at && y.kind === x.kind && y.act === x.act)));
      return body?.success ? 'sent' : 'dropped';
    } catch {
      return 'kept';
    } finally {
      state.sending = null;
    }
  })();
  const out = await state.sending;
  if (out === 'sent' && queued().length) schedule(500);
  return out;
}

// أخطاء الصفحة: window.onerror وunhandledrejection، وفشل التحميل المسبق لقطعة (vite:preloadError)، وعودة الاتصال ترسل
export function installTelemetry(win = typeof window === 'undefined' ? null : window) {
  if (!win || win.__miTelemetry) return;
  win.__miTelemetry = true;
  win.addEventListener('error', (e) => {
    // خطأ تحميل وسم (صورة، سكربت) بلا رسالة ليس خطأ برمجة
    if (!e?.message && !e?.error) return;
    const err = e.error || e;
    report(isChunkError(err) ? 'chunk' : 'error', { message: err?.message || e.message });
  });
  win.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    report(isChunkError(r) ? 'chunk' : 'rejection', { message: r?.message || String(r ?? '') });
  });
  win.addEventListener('vite:preloadError', (e) => report('chunk', { message: e?.payload?.message || 'preload' }));
  win.addEventListener('online', () => { setTimeout(() => flush(), 1_500); });
  // ما بقي من صفحة سابقة (إعادة تحميل بعد ملف قسم غائب، أو انقطاع) يُرسل بعد الفتح
  setTimeout(() => flush(), 3_000);
}

// خطأ رسم يلتقطه حاجز (ErrorBoundary وSectionBoundary)
// وخطأ ملف القسم يحمل اسم القسم (error.chunk من retryImport) في الفعل lazy.<القسم>، فيقول الحدث أي قسم فشل
export const reportRender = (error) => {
  const chunk = isChunkError(error);
  return report(chunk ? 'chunk' : 'render', { act: chunk && error?.chunk ? `lazy.${error.chunk}` : '', message: error?.message || String(error ?? '') });
};
