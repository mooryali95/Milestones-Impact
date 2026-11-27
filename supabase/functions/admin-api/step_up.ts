// ════════════════════════════════════════════════════════════════
// التحقق الإضافي (step-up) قبل العمليات الأخطر: تغيير مفتاح المساعد الآلي من اللوحة
// ════════════════════════════════════════════════════════════════
// هنا لا في leaders-api لأن مفاتيح مرور الإدارة وسر TOTP ودالة التحقق كلها في admin-api؛ نسخها يكرر منطقًا أمنيًا.
// الحراس: جلسة صالحة لمدير أعلى بعامل ثانٍ (مفتاح مرور أو TOTP؛ جلسة رمز البريد ترد reauth_second_factor). لا يُشترط
// الدخول الحديث لأن التحقق نفسه حديث. النجاح صف في public.admin_step_ups مربوط بهاش الجلسة، صالح 5 دقائق ولمرة
// واحدة، وتستهلكه leaders-api ذريًا (admin_step_up_consume). كل نجاح وفشل في admin_audit_log.
// والغرض «write» (فعّل الكتابة، المرحلة 2 من تصور لوحة الإدارة) يرفع جلسة رمز البريد نفسها إلى عامل ثانٍ: لمدير أو مدير
// أعلى، بالتحقق نفسه، ونجاحه يكتب طريقة التحقق في meta الجلسة (api_sessions) فيمر بحارسي الكتابة في admin-api وleaders-api.
// هو مكافئ الدخول بمفتاح المرور أو الرمز من جديد بلا خروج، فلا يُكتب له صف في admin_step_ups (قيد الغرض فيه agent_key وحده).
// والرمز نفسه لا يُقبل مرتين لأي غرض: خطوته تُحجز ذريًا قبل المنح (step-up-totp أدناه).
// deno-lint-ignore no-explicit-any
type SB = any;
import { hasSecondFactor } from '../_shared/second_factor.js';

export const STEP_UP_TTL_MS = 5 * 60 * 1000;
export const STEP_UP_PURPOSES = ['agent_key', 'write'];
export const STEP_UP_ACTIONS = ['step-up-options', 'step-up-verify', 'step-up-totp'];

// صلاحية الكتابة الآن لهذه الجلسة: مصدر واحد لرد «me» ولحارس الكتابة، والعامل الثاني من _shared/second_factor.js كما في requireWrite بـleaders-api.
// المراقب لا يكتب أبدًا، والمدير بجلسة رمز البريد يقرأ حتى يفعّل الكتابة بعامل ثانٍ (can_elevate)
export function writeAccess(role: string, method: string) {
  const writer = role === 'admin' || role === 'super_admin';
  const second = hasSecondFactor(method);
  return { can_write: writer && second, can_elevate: writer && !second, read_only_reason: !writer ? 'role' : second ? null : 'second_factor' };
}

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
  // حجز المحاولة ذريًا قبل الفحص، وحجز خطوة الرمز على admin_users.totp_last_step (login_guard.ts)
  reserveAttempt: (sb: SB, email: string, ip: string) => Promise<{ ok: false } | { ok: true; done: (success: boolean) => Promise<void> }>;
  claimTotpStep: (sb: SB, userId: string, step: bigint) => Promise<boolean>;
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
  const write = purpose === 'write';
  if (write) {
    if (session.role !== 'admin' && session.role !== 'super_admin') return out({ success: false, code: 'forbidden', message: 'صلاحية المراقب للقراءة فقط' }, 403);
    // جلسة بعامل ثانٍ تكتب أصلًا: لا تحقق ولا كتابة
    if (hasSecondFactor(session.method)) return out({ success: true, already: true, method: session.method });
  } else {
    if (session.role !== 'super_admin') return out({ success: false, code: 'super_required', message: 'التحقق الإضافي للمدير الأعلى وحده' }, 403);
    if (!hasSecondFactor(session.method)) {
      return out({ success: false, code: 'reauth_second_factor', message: 'هذه العملية تتطلب دخولًا بمفتاح مرور أو تطبيق مصادقة، سجّل خروجك وادخل بأحدهما' }, 403);
    }
    if (!STEP_UP_PURPOSES.includes(purpose)) return out({ success: false, code: 'bad_purpose', message: 'غرض غير معروف' }, 400);
  }

  // فعّل الكتابة: الجلسة نفسها (بهاشها) تصير بالطريقة التي تحقق بها، ولحظة التحقق دخول حديث
  const elevate = async (method: 'passkey' | 'totp', totpStep: bigint | null): Promise<Out> => {
    const { data: rows, error: readErr } = await sb.from('api_sessions').select('meta').eq('token_hash', d.sessionHash).eq('kind', 'admin').limit(1);
    if (readErr || !rows?.length) return out({ success: false, message: 'انتهت الجلسة، سجّل دخولك مجددًا' }, 401);
    const meta = { ...(rows[0].meta || {}), method, auth_at: now, elevated_from: String(rows[0].meta?.method || session.method || ''), elevated_at: now };
    const { error } = await sb.from('api_sessions').update({ meta }).eq('token_hash', d.sessionHash).eq('kind', 'admin');
    if (error) throw new Error(`api_sessions: ${error.code}`);
    await log(true, method, totpStep === null ? {} : { totp_step: Number(totpStep) });
    return out({ success: true, method, elevated: true });
  };
  const grant = async (method: 'passkey' | 'totp', totpStep: bigint | null = null): Promise<Out> => {
    if (write) return await elevate(method, totpStep);
    const expires = new Date(now + STEP_UP_TTL_MS).toISOString();
    const { error } = await sb.from('admin_step_ups').insert({
      admin_id: session.userId, session_hash: d.sessionHash, purpose, method, totp_step: totpStep === null ? null : Number(totpStep), expires_at: expires,
    });
    if (error) {
      // طلبان معًا بالرمز نفسه: الفهرس الفريد (admin_id, totp_step) يقبل أولهما وحده
      if (String(error.code) === '23505' && method === 'totp') {
        await log(false, 'totp', { why: 'replay' });
        return out({ success: false, code: 'replay', message: 'استُعمل هذا الرمز للتو، انتظر الرمز التالي' }, 409);
      }
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
    const attempt = await d.reserveAttempt(sb, session.email, d.ip);
    if (!attempt.ok) return out({ success: false, code: 'rate', message: 'تجاوزت عدد المحاولات، انتظر 15 دقيقة' }, 429);
    const step = await d.matchTotp(String(us[0].totp_secret), String(body.code || ''));
    if (step !== null) {
      // حجز الخطوة ذري قبل أي منح، للغرضين معًا: صف علامة في webauthn_challenges (challenge فريد) مستهلك ومنتهٍ عند
      // كتابته فلا يأخذه takeChallenge أبدًا، ولا يشبه تحدي WebAuthn حقيقيًا (لا «:» في base64url). طلبان معًا بالرمز
      // نفسه، من جلستين أو غرضين، يقبل الفهرس أولهما وحده. الخطوات تتزايد مع الوقت، فالعلامة لا تلزم إلا نافذة الرمز،
      // ويمسحها purge مع التحديات بعد 90 يومًا. بلا ترحيل: الغرض step_up مسموح في قيد الجدول منذ 20261115230000.
      const at = new Date(now).toISOString();
      const { error: held } = await sb.from('webauthn_challenges').insert({
        scope: 'admin', purpose: 'step_up', subject: session.userId, challenge: `totp-step:${session.userId}:${step}`, expires_at: at, consumed_at: at,
      });
      // والخطوة نفسها مشتركة مع الدخول وإدارة الرمز: رمز دخل به المدير للتو لا يُقبل هنا (تقرير الأمن 2026-11-27)
      if ((held && String(held.code) === '23505') || (!held && !(await d.claimTotpStep(sb, session.userId, step)))) {
        await log(false, 'totp', { why: 'replay' });
        return out({ success: false, code: 'replay', message: 'استُعمل هذا الرمز للتو، انتظر الرمز التالي' }, 409);
      }
      if (held && MISSING.has(String(held.code))) return out({ success: false, code: 'step_up_unavailable', message: 'لم يُطبَّق ترحيل التحقق الإضافي بعد' }, 503);
      if (held) throw new Error(`webauthn_challenges: ${held.code}`);
    }
    await attempt.done(step !== null);
    if (step === null) { await log(false, 'totp', { why: 'code' }); return out({ success: false, code: 'bad_code', message: 'الرمز غير صحيح، أدخل الرمز الحالي من تطبيق المصادقة' }, 403); }
    return await grant('totp', step);
  }
  return out({ success: false, message: 'إجراء غير معروف' }, 400);
}
