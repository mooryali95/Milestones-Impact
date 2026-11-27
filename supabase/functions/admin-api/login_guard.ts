// حراس رموز دخول الإدارة (تقرير الأمن 2026-11-27، الثغرتان 1 و2):
// 1) reserveAttempt: المحاولة تُحجز ذريًا في القاعدة قبل فحص الرمز (public.admin_login_attempt تقفل على البريد وتعد
//    وتسجل)، فالطلبات المتزامنة لا يُفحص منها أكثر من الحد. والنجاح يحدّث السطر المحجوز نفسه.
// 2) claimTotpStep: رمز تطبيق المصادقة يُقبل فقط إن نجح تحديث مشروط بأن خطوته أكبر من admin_users.totp_last_step.
// 3) consumeEmailOtp: رمز البريد يُعلَّم مستعملًا بتحديث مشروط verified=false، ويُقبل فقط إن عاد سطر.
// قبل ترحيل 20261130040000 (deploy-gate: tolerant): غياب الدالة يرجع إلى التسجيل ثم العد، وغياب العمود يقبل الرمز كما كان.
// deno-lint-ignore no-explicit-any
type SB = any;

export const MAX_FAILS = 5;
export const MAX_FAILS_ALL = 20;
export const FAIL_WINDOW_MS = 15 * 60 * 1000;

const MISSING_FN = new Set(['PGRST202', '42883']);
const MISSING_COL = new Set(['42703', 'PGRST204']);

export type Attempt = { ok: false } | { ok: true; done: (success: boolean) => Promise<void> };

export async function reserveAttempt(sb: SB, email: string, ip = ''): Promise<Attempt> {
  const { data, error } = await sb.rpc('admin_login_attempt', {
    p_email: email, p_ip: ip || null, p_max_ip: MAX_FAILS, p_max_all: MAX_FAILS_ALL, p_window_s: FAIL_WINDOW_MS / 1000,
  });
  if (error && !MISSING_FN.has(String(error.code))) throw new Error(`admin_login_attempt: ${error.code}`);
  let id: string | null = error ? null : (data as string | null);
  if (error) {
    // قبل الترحيل: تُسجَّل المحاولة أولًا ثم يُعد شاملًا لها، فلا تفحص الطلبات المتزامنة كلها العدد القديم
    const { data: ins } = await sb.from('totp_attempts').insert({ email, success: false, ip: ip || null }).select('id').limit(1);
    id = ins?.[0]?.id ?? null;
    const since = new Date(Date.now() - FAIL_WINDOW_MS).toISOString();
    const fails = () => sb.from('totp_attempts').select('*', { count: 'exact', head: true }).eq('email', email).eq('success', false).gte('created_at', since);
    const [all, mine] = await Promise.all([fails(), ip ? fails().eq('ip', ip) : Promise.resolve({ count: 0 })]);
    const a = all.count ?? 0, m = mine.count ?? 0;
    if (a > MAX_FAILS_ALL || m > MAX_FAILS || (!ip && a > MAX_FAILS)) return { ok: false };
  } else if (!id) return { ok: false };
  return {
    ok: true,
    done: async (success: boolean) => { if (success && id) await sb.from('totp_attempts').update({ success: true }).eq('id', id); },
  };
}

export async function claimTotpStep(sb: SB, userId: string, step: bigint): Promise<boolean> {
  const s = step.toString();
  const { data, error } = await sb.from('admin_users').update({ totp_last_step: s })
    .eq('id', userId).or(`totp_last_step.is.null,totp_last_step.lt.${s}`).select('id');
  if (error && MISSING_COL.has(String(error.code))) return true;
  if (error) throw new Error(`admin_users totp_last_step: ${error.code}`);
  return !!data?.length;
}

export async function consumeEmailOtp(sb: SB, id: string): Promise<boolean> {
  const { data, error } = await sb.from('email_otps').update({ verified: true }).eq('id', id).eq('verified', false).select('id');
  if (error) throw new Error(`email_otps: ${error.code}`);
  return !!data?.length;
}

// مع كل سر جديد أو تعطيل: الخطوة المخزنة تخص السر القديم
export async function resetTotpStep(sb: SB, userId: string): Promise<void> {
  const { error } = await sb.from('admin_users').update({ totp_last_step: null }).eq('id', userId);
  if (error && !MISSING_COL.has(String(error.code))) throw new Error(`admin_users totp_last_step: ${error.code}`);
}
