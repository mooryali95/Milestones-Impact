// ════════════════════════════════════════════════════════════════
// التحقق من رمز هوية Google محليًا (RS256) بمفاتيح Google العامة
// ════════════════════════════════════════════════════════════════
// بدل نداء tokeninfo في كل دخول: المفاتيح تُجلب مرة وتُحفظ في الذاكرة بحسب Cache-Control،
// والتوقيع يُتحقق منه بـ WebCrypto. ثم تفحص googleIdentity (logic.js) العميل والمُصدر والصلاحية والبريد.
import { Fail } from './core.ts';

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
let cache: { keys: Record<string, CryptoKey>; until: number } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function keys(force = false) {
  if (!force && cache && cache.until > Date.now()) return cache.keys;
  const res = await fetch(CERTS);
  if (!res.ok) throw new Fail('تعذّر التحقق من حساب جوجل، حاول مرة أخرى', 503, 'google');
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  const { keys: jwks } = await res.json();
  const out: Record<string, CryptoKey> = {};
  for (const k of jwks || []) {
    out[k.kid] = await crypto.subtle.importKey('jwk', { kty: k.kty, n: k.n, e: k.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  cache = { keys: out, until: Date.now() + maxAge * 1000 };
  return out;
}

// يعيد بيانات الرمز إن صح توقيعه، وإلا يرمي
export async function verifyGoogleToken(jwt: string) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw new Fail('لم يكتمل الدخول بجوجل، حاول مرة أخرى', 400, 'google');
  const [h, p, sig] = parts;
  let header: any, claims: any;
  try { header = JSON.parse(new TextDecoder().decode(b64url(h))); claims = JSON.parse(new TextDecoder().decode(b64url(p))); }
  catch { throw new Fail('لم يكتمل الدخول بجوجل، حاول مرة أخرى', 400, 'google'); }
  if (header.alg !== 'RS256') throw new Fail('رمز جوجل غير مقبول', 401, 'google');
  // مفتاح جديد لم يُحفظ بعد: Google يدوّر مفاتيحه، فيُعاد الجلب مرة
  let key = (await keys())[header.kid];
  if (!key) key = (await keys(true))[header.kid];
  if (!key) throw new Fail('رمز جوجل غير مقبول', 401, 'google');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Fail('رمز جوجل غير مقبول', 401, 'google');
  return claims;
}
