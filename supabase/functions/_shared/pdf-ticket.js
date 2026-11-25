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

/** «انتهاء.صاحب.توقيع» */
export async function signTicket(secret, sub, now = Date.now()) {
  if (!secret) throw new Error('no secret');
  const body = `${now + TICKET_TTL_MS}.${String(sub).replace(/[^0-9a-zA-Z-]/g, '')}`;
  return `${body}.${await mac(secret, body)}`;
}

/** يعيد صاحب التذكرة إن صحّت ولم تنته، وإلا null. المقارنة بطول ثابت */
export async function verifyTicket(secret, ticket, now = Date.now()) {
  if (!secret || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3) return null;
  const [exp, sub, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < now || Number(exp) > now + TICKET_TTL_MS + 60e3) return null;
  const want = await mac(secret, `${exp}.${sub}`);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? sub : null;
}
