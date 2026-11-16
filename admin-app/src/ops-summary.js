// ════════════════════════════════════════════════════════════════
// ملخص بطاقة صحة البريد والتنبيه حين تُطوى: سطر واحد هادئ من الحقائق نفسها (admin.ops-health) والحكم نفسه (ops-health.js)
// ════════════════════════════════════════════════════════════════
// دالة نقية بلا متصفح: حلقة البريد (المرسل من السقف)، ورموز الدخول الثلاثة، وسلاك، وقنوات التنبيه. اللون لا يحمل المعنى
// وحده: لكل عنصر كلمة. tone: ok (سليم) أو warn (يستحق نظرة) أو bad (عطل) أو mute (لا شيء يُذكر).
import { agoAr, meterLevel } from '../../supabase/functions/leaders-api/ops-health.js';

const ago = (iso, now) => agoAr(iso, now) || 'منذ أكثر من يوم';
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

export function slackState(slack, now = Date.now()) {
  if (!slack?.configured) return { state: 'off', tone: 'mute', text: 'غير مضبوط' };
  if (!slack.readable) return { state: 'unread', tone: 'mute', text: 'غير مقروء' };
  const okAt = ms(slack.ok_at);
  const errAt = ms(slack.error_at);
  if (slack.error && Number.isFinite(errAt) && !(okAt >= errAt)) return { state: 'error', tone: 'warn', text: `تعذّر ${ago(slack.error_at, now)}` };
  if (Number.isFinite(okAt)) return { state: 'ok', tone: 'ok', text: `نُشر ${ago(slack.ok_at, now)}` };
  return { state: 'never', tone: 'mute', text: 'لم يُنشر بعد' };
}

export function opsSummary(data, verdict, now = Date.now()) {
  const { mail = {}, slack = {}, alerts = {} } = data || {};
  const sent = mail.sent;
  const cap = mail.cap;
  const pct = sent != null && cap ? Math.min(100, Math.round((sent / cap) * 100)) : null;
  const meter = meterLevel(verdict);
  const c = mail.codes || {};
  const code = (key, label, n, tone) => ({ key, label, n: n == null ? null : n, tone: n == null ? 'mute' : tone });
  const on = [alerts.email, alerts.webhook, slack.configured].filter(Boolean).length;
  return {
    mail: {
      sent, cap, pct,
      tone: pct == null ? 'mute' : meter === 'full' ? 'bad' : meter === 'near' ? 'warn' : 'ok',
      text: sent == null ? 'غير مقروء' : `${sent} من ${cap}`,
      aria: sent == null ? 'البريد اليوم غير مقروء' : `البريد اليوم: أُرسل ${sent} من ${cap} (${pct}٪ من السقف اليومي)`,
    },
    codes: [
      code('sent', 'وصل', c.sent, 'ok'),
      code('failed', 'تعذّر', c.failed, c.failed > 0 ? 'warn' : 'mute'),
      code('blocked', 'حُجب', c.blocked, c.blocked > 0 ? 'warn' : 'mute'),
    ],
    slack: slackState(slack, now),
    alerts: { on, of: 3, tone: on ? 'ok' : 'warn', text: `${on} من 3` },
  };
}
