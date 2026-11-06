// ════════════════════════════════════════════════════════════════
// حراس الدخول والملفات الخاصة (المرحلة ل1): منطق خالص بلا قاعدة ولا شبكة،
// يستورده leaders-api (core.ts وadmin.ts) وتختبره vitest مباشرة (leaders-app/src/security-l1.test.js).
// ════════════════════════════════════════════════════════════════

// ── محاولات رمز الدخول (الملحق 1، M2) ──
// تُحجز المحاولة ذريًا قبل مقارنة الرمز بمقارنة ثم تبديل: attempts من n إلى n+1 بشرط أنها ما زالت n.
// كل محاولة تكسب زيادة فريدة، فلا تتجاوز المحاولات الحد مهما تزامنت الطلبات؛ والقراءة ثم الكتابة
// القديمة كانت تدع عشرين طلبًا متزامنًا يرون كلهم 0 فيخمّنون عشرين مرة.
// store: { cas(n) => Promise<boolean>, read() => Promise<{ attempts, consumed } | null> }
export const MAX_CODE_ATTEMPTS = 5;
export async function reserveAttempt(store, attempts, max = MAX_CODE_ATTEMPTS) {
  let n = Number(attempts) || 0;
  // كل خسارة في السباق تعني أن غيرنا زاد العداد، فبعد max + 1 دورة يكون العداد بلغ الحد حتمًا
  for (let i = 0; i <= max; i++) {
    if (n >= max) return { ok: false, reason: 'attempts' };
    if (await store.cas(n)) return { ok: true, attempts: n + 1 };
    const cur = await store.read();
    if (!cur || cur.consumed) return { ok: false, reason: 'gone' };
    n = Number(cur.attempts) || 0;
  }
  return { ok: false, reason: 'attempts' };
}

// ── تصريح التحقق البشري (الملحق 1، M1) ──
// التحقق البشري يسبق كل رد يفرّق بين بريد مسجل وجديد. ولأن رمز Turnstile لمرة واحدة، يحمل
// تصريحٌ قصير التحقق من خطوة البريد إلى خطوة الاسم فلا يُحل التحدي مرتين: HMAC-SHA256 بسر
// الخادم، مربوط بالبريد نفسه، صالح ربع ساعة.
export const PASS_MINUTES = 15;
const te = new TextEncoder();
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', te.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, te.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
const sameText = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
export async function signPass(key, email, now = Date.now()) {
  if (!key) throw new Error('signPass: key required');
  const exp = now + PASS_MINUTES * 60e3;
  return `${exp}.${await hmacHex(key, `human-pass:${email}:${exp}`)}`;
}
export async function passOk(key, pass, email, now = Date.now()) {
  if (!key || typeof pass !== 'string' || pass.length > 100) return false;
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(pass);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < now || exp > now + PASS_MINUTES * 60e3) return false;
  return sameText(m[2], await hmacHex(key, `human-pass:${email}:${exp}`));
}

// ── الملفات الخاصة (الملحق 4، R7) ──
// شكل مسارات الرفع في الدلو الخاص كما يكتبها participant.ts (uploadUrl): <المشارك>/<cv|evidence>/<uuid>.<امتداد>.
// لا يُوقَّع إلا مسار بهذا الشكل يبدأ بمعرّف المشارك المطلوب نفسه، فلا يُفتح ملف مشارك آخر ولا أي مسار في الدلو.
export const PRIVATE_FILE_EXT = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg'];
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE_RE = new RegExp(`^(${UUID})/(cv|evidence)/${UUID}\\.(?:${PRIVATE_FILE_EXT.join('|')})$`);
export function privateFile(path, participantId) {
  const m = FILE_RE.exec(String(path || ''));
  if (!m || m[1] !== String(participantId || '')) return null;
  return { path: m[0], participantId: m[1], kind: m[2] };
}
