// ════════════════════════════════════════════════════════════════
// مفاتيح المرور (WebAuthn): التسجيل بعد أول دخول، والدخول بلا بريد
// ════════════════════════════════════════════════════════════════
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse,
  verifyRegistrationResponse, type WebAuthnCredential,
} from 'npm:@simplewebauthn/server@13.3.3';
import { audit, CONFIG, db, Fail, fromBytea, must, toBytea } from './core.ts';
import { issueSession, mePayload } from './participant.ts';

type Body = Record<string, any>;
const CHALLENGE_MINUTES = 5;

async function saveChallenge(challenge: string, purpose: 'register' | 'authenticate', participantId: string | null) {
  must(await db.from('webauthn_challenges').insert({
    challenge, purpose, participant_id: participantId,
    expires_at: new Date(Date.now() + CHALLENGE_MINUTES * 6e4).toISOString(),
  }));
}

// يستهلك التحدي مرة واحدة فقط
async function takeChallenge(challenge: string, purpose: string) {
  const { data } = await db.from('webauthn_challenges').update({ consumed_at: new Date().toISOString() })
    .eq('challenge', challenge).eq('purpose', purpose).is('consumed_at', null)
    .gt('expires_at', new Date().toISOString()).select('*');
  if (!data?.length) throw new Fail('انتهت مهلة العملية، حاول مرة أخرى', 400, 'challenge');
  return data[0];
}

// ── الجزء النقي (بلا قاعدة): يُختبر في passkeys_test.ts ──
// التحدي من رد المتصفح: clientDataJSON بترميز base64url
export function challengeOf(response: any) {
  try {
    const b64 = String(response?.response?.clientDataJSON || '').replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(atob(b64)).challenge;
    if (typeof c !== 'string' || !c) throw new Error('no challenge');
    return c as string;
  } catch { throw new Fail('رد غير صالح'); }
}
// خيارات التسجيل: مفتاح مقيم بالنطاق المضبوط، باستثناء المفاتيح المسجلة للمشارك
export function registrationOptionsFor(p: { id: string; email: string; full_name: string }, existing: { credential_id: string; transports?: string[] | null }[]) {
  return generateRegistrationOptions({
    rpName: CONFIG.rpName,
    rpID: CONFIG.rpId,
    userName: p.email,
    userDisplayName: p.full_name,
    userID: new TextEncoder().encode(p.id),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: (c.transports || undefined) as any })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
}
export const authenticationOptionsFor = () => generateAuthenticationOptions({ rpID: CONFIG.rpId, userVerification: 'preferred' });
// التحقق من ردّي التسجيل والدخول بالأصول والنطاق المضبوطين؛ أي خلل في الرد = رسالة واحدة للمستخدم
export async function verifyRegistration(response: any, expectedChallenge: string) {
  try {
    return await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: CONFIG.origins, expectedRPID: CONFIG.rpId });
  } catch (e) {
    console.error(e);
    throw new Fail('تعذّر التحقق من مفتاح المرور');
  }
}
export async function verifyAuthentication(response: any, expectedChallenge: string, credential: WebAuthnCredential) {
  try {
    return await verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: CONFIG.origins, expectedRPID: CONFIG.rpId, credential });
  } catch (e) {
    console.error(e);
    throw new Fail('تعذّر التحقق من مفتاح المرور');
  }
}

export async function registerOptions(p: any) {
  const existing = must(await db.from('passkeys').select('credential_id, transports').eq('participant_id', p.id)) ?? [];
  const options = await registrationOptionsFor(p, existing as any[]);
  await saveChallenge(options.challenge, 'register', p.id);
  return { success: true, options };
}

export async function registerVerify(p: any, b: Body) {
  const ch = await takeChallenge(challengeOf(b.response), 'register');
  if (ch.participant_id !== p.id) throw new Fail('تحدٍّ غير مطابق');
  const v = await verifyRegistration(b.response, ch.challenge);
  if (!v.verified || !v.registrationInfo) throw new Fail('تعذّر التحقق من مفتاح المرور');
  const info = v.registrationInfo;
  must(await db.from('passkeys').insert({
    participant_id: p.id,
    credential_id: info.credential.id,
    public_key: toBytea(info.credential.publicKey),
    sign_count: info.credential.counter,
    transports: info.credential.transports || b.response?.response?.transports || null,
    aaguid: info.aaguid,
    backed_up: info.credentialBackedUp,
    device_label: String(b.label || '').slice(0, 80) || null,
  }));
  await audit('participant', p.id, 'passkey.register', 'passkeys', info.credential.id);
  return { success: true };
}

// الدخول بمفتاح المرور: بلا بريد، المتصفح يعرض المفاتيح المحفوظة للنطاق
// حد الإغراق: الطلب مفتوح بلا جلسة وكل نداء يكتب صفًّا، فيُرفض ما زاد على CHALLENGE_FLOOD في الدقيقة (كما في user-api وadmin-api)
const CHALLENGE_FLOOD = 120;
export async function authOptions() {
  const { count } = await db.from('webauthn_challenges').select('id', { count: 'exact', head: true })
    .eq('purpose', 'authenticate').gte('created_at', new Date(Date.now() - 60e3).toISOString());
  if ((count ?? 0) >= CHALLENGE_FLOOD) throw new Fail('محاولات كثيرة، انتظر دقيقة', 429, 'rate');
  const options = await authenticationOptionsFor();
  await saveChallenge(options.challenge, 'authenticate', null);
  return { success: true, options };
}

export async function authVerify(b: Body, ctx: { ip: string | null; ua: string | null }) {
  const ch = await takeChallenge(challengeOf(b.response), 'authenticate');
  const pk = must(await db.from('passkeys').select('*').eq('credential_id', String(b.response?.id || '')).maybeSingle());
  if (!pk) throw new Fail('مفتاح المرور غير معروف، ادخل بالبريد', 404, 'unknown_passkey');
  const v = await verifyAuthentication(b.response, ch.challenge, { id: pk.credential_id, publicKey: fromBytea(pk.public_key), counter: Number(pk.sign_count), transports: pk.transports || undefined } as WebAuthnCredential);
  if (!v.verified) throw new Fail('تعذّر التحقق من مفتاح المرور');
  await db.from('passkeys').update({ sign_count: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', pk.id);
  const p = must(await db.from('participants').select('*').eq('id', pk.participant_id).single());
  if (p.status === 'suspended') throw new Fail('الحساب موقوف، تواصل مع الإدارة', 403, 'suspended');
  const token = await issueSession(p.id, 'passkey', ctx);
  return { success: true, token, ...(await mePayload(p)) };
}
