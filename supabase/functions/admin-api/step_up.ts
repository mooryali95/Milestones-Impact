// ════════════════════════════════════════════════════════════════
// التحقق الإضافي (step-up) قبل العمليات الأخطر: تغيير مفتاح المساعد الآلي من اللوحة
// ════════════════════════════════════════════════════════════════
// هنا لا في leaders-api لأن مفاتيح مرور الإدارة وسر TOTP ودالة التحقق كلها في admin-api؛ نسخها يكرر منطقًا أمنيًا.
// الحراس: جلسة صالحة لمدير أعلى بعامل ثانٍ (مفتاح مرور أو TOTP؛ جلسة رمز البريد ترد reauth_second_factor). لا يُشترط
// الدخول الحديث لأن التحقق نفسه حديث. النجاح صف في public.admin_step_ups مربوط بهاش الجلسة، صالح 5 دقائق ولمرة
// واحدة، وتستهلكه leaders-api ذريًا (admin_step_up_consume). كل نجاح وفشل في admin_audit_log.
// deno-lint-ignore no-explicit-any
type SB = any;

export const STEP_UP_TTL_MS = 5 * 60 * 1000;
// الرمز نفسه لا يُقبل مرتين لهذا المدير خلال نافذته (الخطوة الحالية وجارتاها = 90 ثانية)
export const TOTP_REPLAY_MS = 90 * 1000;
export const STEP_UP_PURPOSES = ['agent_key'];
export const STEP_UP_ACTIONS = ['step-up-options', 'step-up-verify', 'step-up-totp'];

export type StepUpSession = { userId: string; role: string; email: string; method: string; passkeyOnly: boolean };
export type StepUpDeps = {
  sb: SB;
  sessionHash: string;
  ip: string;
  now?: () => number;
  // deno-lint-ignore no-explicit-any
  genOptions: (o: any) => Promise<{ challenge: string }>;
  // deno-lint-ignore no-explicit-any
  verifyAuth: (o: any) => Promise<{ verified: boolean; authenticationInfo: { newCounter: number } }>;
  // الخطوة الزمنية للرمز إن طابق (نافذة ±1)، وإلا null
  matchTotp: (secret: string, code: string) => Promise<bigint | null>;
  tooManyFails: (sb: SB, email: string, ip: string) => Promise<boolean>;
  saveChallenge: (sb: SB, challenge: string, purpose: 'step_up', subject: string) => Promise<void>;
  // deno-lint-ignore no-explicit-any
  takeChallenge: (sb: SB, challenge: string, purpose: string) => Promise<any>;
  challengeFlood: (sb: SB) => Promise<boolean>;
  challengeOf: (response: unknown) => string;
  fromBytea: (s: string) => Uint8Array;
  rpId: string;
  origins: string[];
};
export type Out = { status: number; body: Record<string, unknown> };
const out = (body: Record<string, unknown>, status = 200): Out => ({ status, body });
const MISSING = new Set(['42P01', 'PGRST205', '23514']);

export async function stepUp(action: string, body: Record<string, unknown>, session: StepUpSession, d: StepUpDeps): Promise<Out> {
  const now = d.now?.() ?? Date.now();
  const sb = d.sb;
  const purpose = String(body.purpose || '');
  const log = async (ok: boolean, method: string, extra: Record<string, unknown> = {}) => {
    try { await sb.from('admin_audit_log').insert({ user_id: session.userId, user_email: session.email, action: 'step-up', meta: { purpose, method, ok, ip: d.ip || null, ...extra } }); } catch { /* best-effort */ }
  };
  if (session.role !== 'super_admin') return out({ success: false, code: 'super_required', message: 'التحقق الإضافي للمدير الأعلى وحده' }, 403);
  if (session.method !== 'passkey' && session.method !== 'totp') {
    return out({ success: false, code: 'reauth_second_factor', message: 'هذه العملية تتطلب دخولًا بمفتاح مرور أو تطبيق مصادقة، سجّل خروجك وادخل بأحدهما' }, 403);
  }
  if (!STEP_UP_PURPOSES.includes(purpose)) return out({ success: false, code: 'bad_purpose', message: 'غرض غير معروف' }, 400);

  const grant = async (method: 'passkey' | 'totp', totpStep: bigint | null = null): Promise<Out> => {
    const expires = new Date(now + STEP_UP_TTL_MS).toISOString();
    const { error } = await sb.from('admin_step_ups').insert({
      admin_id: session.userId, session_hash: d.sessionHash, purpose, method, totp_step: totpStep === null ? null : Number(totpStep), expires_at: expires,
    });
    if (error) {
      if (MISSING.has(String(error.code))) return out({ success: false, code: 'step_up_unavailable', message: 'لم يُطبَّق ترحيل التحقق الإضافي بعد' }, 503);
      throw new Error(`admin_step_ups: ${error.code}`);
    }
    await log(true, method);
    return out({ success: true, expires_at: expires, method });
  };

  if (action === 'step-up-options') {
    const { data: pks } = await sb.from('admin_passkeys').select('credential_id, transports').eq('admin_id', session.userId);
    if (!pks?.length) return out({ success: false, code: 'no_passkey', message: 'لا مفتاح مرور على حسابك، أكّد برمز تطبيق المصادقة' }, 409);
    if (await d.challengeFlood(sb)) return out({ success: false, message: 'محاولات كثيرة، انتظر دقيقة' }, 429);
    const options = await d.genOptions({
      rpID: d.rpId, userVerification: 'required',
      allowCredentials: pks.map((p: { credential_id: string; transports?: string[] | null }) => ({ id: p.credential_id, transports: p.transports || undefined })),
    });
    try { await d.saveChallenge(sb, options.challenge, 'step_up', session.userId); } catch (e) {
      if (MISSING.has(String((e as { code?: string })?.code))) return out({ success: false, code: 'step_up_unavailable', message: 'لم يُطبَّق ترحيل التحقق الإضافي بعد' }, 503);
      throw e;
    }
    return out({ success: true, options });
  }

  if (action === 'step-up-verify') {
    const ch = await d.takeChallenge(sb, d.challengeOf(body.response), 'step_up');
    if (!ch || String(ch.subject) !== session.userId) { await log(false, 'passkey', { why: 'challenge' }); return out({ success: false, message: 'انتهت مهلة العملية، حاول مرة أخرى' }, 400); }
    const credId = String((body.response as { id?: string })?.id || '');
    const { data: pkRows } = await sb.from('admin_passkeys').select('*').eq('credential_id', credId).limit(1);
    const pk = pkRows?.[0];
    // المفتاح المستعمل لهذا المدير نفسه، لا مفتاح مدير آخر على الجهاز نفسه
    if (!pk || String(pk.admin_id) !== session.userId) { await log(false, 'passkey', { why: 'foreign_key' }); return out({ success: false, code: 'foreign_passkey', message: 'هذا المفتاح ليس لحسابك' }, 403); }
    let v;
    try {
      v = await d.verifyAuth({
        response: body.response, expectedChallenge: ch.challenge, expectedOrigin: d.origins, expectedRPID: d.rpId, requireUserVerification: true,
        credential: { id: pk.credential_id, publicKey: d.fromBytea(pk.public_key), counter: Number(pk.sign_count), transports: pk.transports || undefined },
      });
    } catch {
      await log(false, 'passkey', { why: 'verify' });
      return out({ success: false, message: 'تعذّر التحقق من مفتاح المرور' }, 400);
    }
    if (!v?.verified) { await log(false, 'passkey', { why: 'verify' }); return out({ success: false, message: 'تعذّر التحقق من مفتاح المرور' }, 400); }
    await sb.from('admin_passkeys').update({ sign_count: v.authenticationInfo.newCounter, last_used_at: new Date(now).toISOString() }).eq('id', pk.id);
    return await grant('passkey');
  }

  if (action === 'step-up-totp') {
    if (session.passkeyOnly) return out({ success: false, code: 'reauth_passkey', message: 'حسابك بمفتاح المرور وحده، أكّد بالبصمة' }, 403);
    const { data: us } = await sb.from('admin_users').select('totp_enabled, totp_secret').eq('id', session.userId).limit(1);
    if (!us?.[0]?.totp_enabled || !us[0].totp_secret) return out({ success: false, code: 'no_totp', message: 'تطبيق المصادقة غير مفعّل على حسابك' }, 409);
    if (await d.tooManyFails(sb, session.email, d.ip)) return out({ success: false, code: 'rate', message: 'تجاوزت عدد المحاولات، انتظر 15 دقيقة' }, 429);
    const step = await d.matchTotp(String(us[0].totp_secret), String(body.code || ''));
    if (step !== null) {
      const since = new Date(now - TOTP_REPLAY_MS).toISOString();
      const { data: used } = await sb.from('admin_step_ups').select('id').eq('admin_id', session.userId).eq('method', 'totp').eq('totp_step', Number(step)).gte('created_at', since).limit(1);
      if (used?.length) {
        await sb.from('totp_attempts').insert({ email: session.email, success: false, ip: d.ip || null });
        await log(false, 'totp', { why: 'replay' });
        return out({ success: false, code: 'replay', message: 'استُعمل هذا الرمز للتو، انتظر الرمز التالي' }, 409);
      }
    }
    await sb.from('totp_attempts').insert({ email: session.email, success: step !== null, ip: d.ip || null });
    if (step === null) { await log(false, 'totp', { why: 'code' }); return out({ success: false, code: 'bad_code', message: 'الرمز غير صحيح، أدخل الرمز الحالي من تطبيق المصادقة' }, 403); }
    return await grant('totp', step);
  }
  return out({ success: false, message: 'إجراء غير معروف' }, 400);
}
