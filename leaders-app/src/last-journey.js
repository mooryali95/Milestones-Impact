// ════════════════════════════════════════════════════════════════
// آخر ملخص رحلة معروف، للقراءة فقط (تصور التحديث بلا أثر، المرحلة 3 البند 5، قرار المالك 2026-11-18)
// ════════════════════════════════════════════════════════════════
// حين يتعثر الإقلاع («جارٍ إعادة الاتصال…» أو «لا اتصال بالإنترنت») يرى المشارك آخر ما عرفه الجهاز من رحلته: المراحل
// وحالها ونسبة الإنجاز، بسطر «آخر ما عُرف، للقراءة فقط» ووقته، بلا أي زر يعمل.
// ما يُحفظ (بقرار المالك):
// - المراحل (المفتاح والعنوان والطور والحال) ونسبة الإنجاز ووقت الحفظ. بلا محتوى الكتيب احترامًا لخيار الخصوصية في
//   sw.js (طلبات الخادم لا تُخزَّن)، وبلا الاسم ولا البريد ولا البنود ولا الملاحظات ولا أي رمز.
// - بصمة قصيرة للجلسة لا الرمز نفسه (sessionTag): ملخص جلسة أخرى لا يُعرض، ويُمسح.
// - سقف حجم (MAX_BYTES) وعدد مراحل، ونسخة مخطط (VERSION): شكل أقدم أو تالف يُمسح ولا يُعرض.
// يبقى ما دام رمز الجلسة قائمًا: يُمسح عند الخروج وانتهاء الجلسة والدخول بحساب آخر وتغيّر الرمز (session في api.js).

export const LAST_JOURNEY_KEY = 'mi_leaders_last_journey';
export const LAST_JOURNEY_VERSION = 1;
export const MAX_BYTES = 8_000;
export const MAX_STAGES = 40;
const TITLE_MAX = 80;
const KEY_MAX = 60;
const STATUSES = new Set(['done', 'active', 'locked']);
const PHASE_KEYS = new Set(['admission', 'qualification', 'impact']);

// بصمة FNV-1a بـ32 بتًا للرمز: تكفي للتمييز بين جلستين على الجهاز نفسه، ولا يُستعاد منها الرمز ولا تصلح بدله
export function sessionTag(token) {
  const s = `mi-last-journey:${String(token || '')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const text = (v, max) => String(v ?? '').slice(0, max);

// الملخص من رد me: ما تعرضه شاشة الرحلة في رأسها وخطها وحده. المسار المستمر خارج عد المراحل كما في Journey.jsx
export function summarize(me, now = Date.now()) {
  const journey = Array.isArray(me?.journey) ? me.journey : null;
  if (!journey?.length) return null;
  const stages = journey.filter((s) => s && s.lane !== 'track').slice(0, MAX_STAGES).map((s) => ({
    k: text(s.key, KEY_MAX),
    t: text(s.title_ar, TITLE_MAX),
    p: PHASE_KEYS.has(s.phase) ? s.phase : 'qualification',
    s: STATUSES.has(s.status) ? s.status : 'locked',
  }));
  const progress = Math.max(0, Math.min(100, Math.round(Number(me.progress) || 0)));
  return { v: LAST_JOURNEY_VERSION, at: now, progress, stages };
}

function storage() { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }

function valid(rec) {
  return !!rec && rec.v === LAST_JOURNEY_VERSION && typeof rec.sid === 'string' && Number.isFinite(rec.at)
    && Number.isFinite(rec.progress) && Array.isArray(rec.stages) && rec.stages.length <= MAX_STAGES
    && rec.stages.every((s) => s && typeof s.k === 'string' && typeof s.t === 'string' && STATUSES.has(s.s) && PHASE_KEYS.has(s.p));
}

export const lastJourney = {
  save(me, token, now = Date.now()) {
    const st = storage();
    if (!st || !token) return false;
    const sum = summarize(me, now);
    if (!sum) return false;
    const rec = { ...sum, sid: sessionTag(token) };
    let json = JSON.stringify(rec);
    // فوق السقف: تُحذف المراحل الأخيرة حتى يصغر، فلا يكبر التخزين برحلة طويلة غير مألوفة
    while (json.length > MAX_BYTES && rec.stages.length) { rec.stages.pop(); json = JSON.stringify(rec); }
    try { st.setItem(LAST_JOURNEY_KEY, json); return true; } catch { return false; }
  },
  // الملخص لهذه الجلسة وحدها؛ ملخص جلسة أخرى أو شكل غير معروف يُمسح
  read(token) {
    const st = storage();
    if (!st || !token) return null;
    let rec = null;
    try { rec = JSON.parse(st.getItem(LAST_JOURNEY_KEY) || 'null'); } catch { rec = null; }
    if (!rec) return null;
    if (!valid(rec) || rec.sid !== sessionTag(token)) { this.clear(); return null; }
    return rec;
  },
  clear() { try { storage()?.removeItem(LAST_JOURNEY_KEY); } catch { /* لا شيء محفوظ */ } },
};

// نص الحال لكل مرحلة في الملخص، ووقت الحفظ بصيغة قصيرة («اليوم 10:42» أو «12 نوفمبر 10:42»)
export const STAGE_STATE_AR = Object.freeze({ done: 'منجزة', active: 'جارية', locked: 'لم تبدأ' });
export function savedAtAr(at, now = Date.now()) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' });
  const day = (x) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  if (day(d) === day(new Date(now))) return `اليوم ${time}`;
  return `${d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' })} ${time}`;
}
