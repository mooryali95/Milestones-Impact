// ════════════════════════════════════════════════════════════════
// تذكرة مولّد PDF على الخادم: يصدرها leaders-api مع capstone.doc، ويتحقق منها العامل workers/pdf-render
// ════════════════════════════════════════════════════════════════
// HMAC-SHA256 بسر مشترك (PDF_RENDER_SECRET في الطرفين)، بلا قاعدة ولا نداء بين الخدمتين. صلاحيتها عشر دقائق،
// وتحمل معرّف المشارك وحده (للسجل)، فلا يصلح العامل مولّدًا مفتوحًا لمن لا جلسة له. منطق خالص (Web Crypto) للدالة والعامل والاختبار.
export const TICKET_TTL_MS = 10 * 60e3;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function mac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}

// بصمة الوثيقة (doc-quality.js fingerprint): أربع مجموعات ست عشرية مفصولة بشرطة
export const FP_RE = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;

/** «انتهاء.صاحب.توقيع»، أو «انتهاء.صاحب.بصمة.توقيع» حين تُربط التذكرة بوثيقة بعينها (المرحلة 21) */
export async function signTicket(secret, sub, now = Date.now(), fp = null) {
  if (!secret) throw new Error('no secret');
  const f = fp == null ? '' : String(fp).toUpperCase();
  if (f && !FP_RE.test(f)) throw new Error('bad fingerprint');
  const body = `${now + TICKET_TTL_MS}.${String(sub).replace(/[^0-9a-zA-Z-]/g, '')}${f ? `.${f}` : ''}`;
  return `${body}.${await mac(secret, body)}`;
}

/** { sub, fp } إن صحّت التذكرة ولم تنته (fp null للتذكرة غير المربوطة)، وإلا null. المقارنة بطول ثابت */
export async function ticketClaims(secret, ticket, now = Date.now()) {
  if (!secret || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 && parts.length !== 4) return null;
  const sig = parts.pop();
  const [exp, sub, fp = null] = parts;
  if (fp != null && !FP_RE.test(fp)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < now || Number(exp) > now + TICKET_TTL_MS + 60e3) return null;
  const want = await mac(secret, parts.join('.'));
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { sub, fp } : null;
}

/** يعيد صاحب التذكرة إن صحّت ولم تنته، وإلا null */
export async function verifyTicket(secret, ticket, now = Date.now()) {
  return (await ticketClaims(secret, ticket, now))?.sub ?? null;
}

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&(nbsp|ndash|mdash|hyphen|dash|minus);/gi, (_, n) => (n.toLowerCase() === 'nbsp' ? ' ' : '-'))
  .replace(/&amp;/gi, '&');
/** نص الوثيقة بعد نزع الوسوم وفك الكيانات والترميز وحذف المحارف الصفرية العرض، فلا تفلت بصمة بتغيير الصياغة */
const plain = (html, keepTags = false) => {
  const raw = String(html || '');
  let t = decode(keepTags ? raw : raw.replace(/<[^>]*>/g, ''));
  try { t = decodeURIComponent(t.replace(/%(?![0-9a-f]{2})/gi, '%25')); } catch { /* يبقى كما هو */ }
  return decode(t).replace(/[​-‏⁠﻿­]/g, '').replace(/[‐-―−]/g, '-');
};

/** البصمات التي يدّعيها HTML الوثيقة: أي مجموعة أربع في أربع ست عشرية في نصه بعد التطبيع */
export function fingerprintsIn(html) {
  const out = new Set();
  for (const m of plain(html).matchAll(/(?<![0-9A-F-])[0-9A-F]{4}(?:\s*-\s*[0-9A-F]{4}){3}(?![0-9A-F-])/gi)) out.add(m[0].replace(/\s/g, '').toUpperCase());
  return [...out];
}

/** هل يدّعي HTML صفة الوثيقة المعتمدة؟ سطر FINGERPRINT أو رابط /v/doc أو بصمة */
export const claimsFingerprint = (html) => { const t = `${plain(html)} ${plain(html, true)}`; return /FINGERPRINT|\/v\/doc/i.test(t) || fingerprintsIn(html).length > 0; };

/** هل يُطبع هذا HTML بهذه التذكرة؟ التذكرة غير المربوطة لا تطبع وثيقة تدّعي بصمة أصلًا، والمربوطة لا تطبع إلا بصمتها */
export const fingerprintAllowed = (html, fp) => (fp ? fingerprintsIn(html).every((x) => x === fp) : !claimsFingerprint(html));
