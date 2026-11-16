// ════════════════════════════════════════════════════════════════
// إعداد مركز الإشعارات المخزن: leaders.app_settings بالمفتاح notifications (التصور 6.1)
// ════════════════════════════════════════════════════════════════
// في _shared لا في leaders-api/settings.ts: settings.ts يستورد core.ts، وcore.ts يقرر التوجيه، فالقراءة هنا بعميل يمرره
// المستدعي وذاكرة خاصة بها (التصور 2.3). وعلى سلوك settings.ts: دقيقة في ذاكرة النسخة، وتعذّر القراءة العابر يُبقي آخر
// قيم قُرئت بنجاح ويُعاد بعد خمس ثوانٍ، وبلا قراءة سابقة «متوازن» الافتراضي. غياب الجدول أو الصف: الافتراضي.
// يحررها المالك من قسم «التوجيه» في مركز البريد (المرحلة 4)، وحفظها يمسح هذه الذاكرة في النسخة التي حفظت.
import { DEFAULT_SETTINGS, normalizeSettings, paymentFallback } from './notify-routing.js';

// deno-lint-ignore no-explicit-any
type Client = any;
export type NotifySettings = { preset: string; rows: Record<string, { email: boolean; slack: boolean; digest: boolean }>; digest_hour?: number };

const TTL = 60e3;
const RETRY = 5e3;
let cache: { at: number; value: NotifySettings } | null = null;
const tableOf = (client: Client) => (typeof client?.schema === 'function' ? client.schema('leaders') : client).from('app_settings');
// غياب الجدول وحده (قبل ترحيله): رمزه أو رسالة الغياب باسمه. ما سواه تعذّر عابر تبقى معه آخر قيم ناجحة
const missing = (e: { code?: string; message?: string }) => e?.code === '42P01' || e?.code === 'PGRST205' || (!e?.code && /app_settings/.test(String(e?.message || '')) && /does not exist|could not find/i.test(String(e?.message || '')));

export async function notifySettings(client: Client): Promise<NotifySettings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  try {
    const { data, error } = await tableOf(client).select('value').eq('key', 'notifications').maybeSingle();
    if (error && !missing(error)) throw error;
    const value = normalizeSettings(error ? null : data?.value) as NotifySettings;
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('notifications settings read:', e);
    const value = cache?.value ?? (normalizeSettings(DEFAULT_SETTINGS) as NotifySettings);
    cache = { at: Date.now() - TTL + RETRY, value };
    return value;
  }
}
// للاختبار
export const resetNotifySettings = () => { cache = null; };
export const expireNotifySettings = () => { if (cache) cache.at = 0; };

// مفتاح دفعة المالك القديم (payment_settings.notify.owner) انتقل إلى صفّي «دفعة جديدة» و«استرداد دفعة» في المركز (التصور 6.1).
// في الانتقال: صف المركز إن حُفظ، وإلا فالقيمة القديمة: «مفتوح» كان بريدًا لكل دفعة، فيبقى البريد مع سطر Slack والملخص.
// و«مغلق» (الافتراضي) لا يُسكت الدفعة: سطر Slack فوري والملخص بقرار المالك (القسم 11)
export function withPaymentFallback(settings: NotifySettings, legacyOwner: unknown): NotifySettings {
  return paymentFallback(settings, legacyOwner) as NotifySettings;
}
