// إشعار دخول المالك (تصور مركز الإشعارات، المرحلة 2؛ قرار المالك 2026-11-16 في القسم 11):
// جهاز جديد: بريد وSlack معًا (owner_login_new_device، صف مقفل). جهاز معروف: سطر Slack وحده (owner_login_known_device)،
// والبريد احتياطه إن لم يصل Slack، كما تقرر route في _shared/notify-routing.js.
//
// الجهاز المعروف بتعريف لا يُزوَّر وحده:
// 1. مفتاح مرور سبق استعماله من الحساب (last_used_at قبل هذا الدخول؛ الإضافة نفسها لا تضبطه، ولها بريدها الأمني)، أو
// 2. بصمة (العنوان المقرب ووصف المتصفح، مجزأة) تطابق دخولًا بالطريقة نفسها في آخر 30 يومًا في admin_audit_log.
// ووصف المتصفح وحده لا يكفي أبدًا: بلا عنوان مفهوم لا بصمة (_shared/login-device.js).
// سطر Slack: الطريقة و«جهاز معروف» أو «جهاز جديد» فقط، بلا بريد ولا اسم ولا عنوان ولا متصفح (القسم 7).
import { KNOWN_DEVICE_DAYS } from '../_shared/login-device.js';
import { route, slackStateOf } from '../_shared/notify-routing.js';
import { notifySettings } from '../_shared/notify-settings.ts';

// deno-lint-ignore no-explicit-any
type SB = any;
export type DeviceKind = 'known' | 'new';
export type LoginNoticeDeps = {
  sb: SB;
  // البريد الأمني بالقالب القائم (securityMail في index.ts)
  mail: (title: string, rows: [string, string][]) => Promise<void>;
  // نشر بلا انتظار، ونشر بنتيجته (slackPost وslackDeliver من _shared/slack.ts، فئة التنبيهات)
  slackPost: (text: string) => unknown;
  slackDeliver: (text: string) => Promise<boolean>;
  slackConfigured: () => boolean;
  // إعداد المركز المحفوظ (قسم «التوجيه»)؛ بلاه يُقرأ من leaders.app_settings بذاكرة الدقيقة
  settings?: unknown;
  now?: number;
};
export type LoginFacts = { userId: string; method: string; fp: string | null; passkeyUsedBefore?: boolean };

export const METHOD_LABELS: Record<string, string> = { passkey: 'مفتاح المرور', totp: 'تطبيق المصادقة', email: 'رمز البريد' };
export const NEW_DEVICE_TITLE = 'دخول من جهاز جديد إلى حسابك';
export const KNOWN_DEVICE_TITLE = 'دخول إلى حسابك من جهاز معروف';

// هل الجهاز معروف؟ يُسأل قبل كتابة سطر هذا الدخول في السجل، فلا يطابق الدخول نفسه.
// تعذر القراءة يعني «جديد»: الشك يرسل البريد ولا يُسكت إشعارًا أمنيًا
export async function knownDevice(sb: SB, f: LoginFacts, now = Date.now()): Promise<boolean> {
  if (f.method === 'passkey' && f.passkeyUsedBefore) return true;
  if (!f.fp || !f.userId) return false;
  try {
    const since = new Date(now - KNOWN_DEVICE_DAYS * 864e5).toISOString();
    const { data, error } = await sb.from('admin_audit_log').select('id')
      .eq('user_id', f.userId).eq('action', 'login').eq('meta->>method', f.method).eq('meta->>fp', f.fp)
      .gte('created_at', since).limit(1);
    if (error) return false;
    return !!data?.length;
  } catch { return false; }
}

// سطر Slack: ثابت بلا أي معرّف
export const loginLine = (method: string, device: DeviceKind) =>
  `🔐 دخول المالك · ${METHOD_LABELS[method] ?? 'طريقة أخرى'} · ${device === 'known' ? 'جهاز معروف' : 'جهاز جديد'}`;

// الإشعار نفسه بعد معرفة الجهاز. rows تفاصيل البريد وحده (الطريقة والعنوان والمتصفح كما كانت)
export async function ownerLoginNotice(d: LoginNoticeDeps, method: string, device: DeviceKind, rows: [string, string][]) {
  const kind = device === 'known' ? 'owner_login_known_device' : 'owner_login_new_device';
  const line = loginLine(method, device);
  const configured = d.slackConfigured();
  const title = device === 'known' ? KNOWN_DEVICE_TITLE : NEW_DEVICE_TITLE;
  const settings = d.settings ?? await notifySettings(d.sb);
  let routed = route(kind, settings);
  if (routed.email) {
    // البريد مقرر من غير نظر إلى Slack (الجهاز الجديد): لا ننتظر Slack
    if (configured) d.slackPost(line);
    await d.mail(title, rows);
    return { kind, routed: { ...routed, slack: configured } };
  }
  const delivered = configured ? await d.slackDeliver(line) : false;
  routed = route(kind, settings, slackStateOf({ delivered, configured }));
  if (routed.email) await d.mail(title, rows);
  return { kind, routed };
}
