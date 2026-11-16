// مراقب حداثة النسخ الاحتياطية (D09): Cloudflare Worker مربوط بدلو R2، مستقل عن GitHub وSupabase.
// كل ساعة يقرأ latest.json الذي يكتبه scripts/ops/backup.sh، ويعدّ النسخة متأخرة إن تجاوز عمرها 26 ساعة.
//   GET /health   200 {"ok":true,...} أو 503 {"ok":false,...}: يراقبه مراقب خارجي (UptimeRobot) بكلمة "ok":true
//   cron          تنبيه ببريد Resend و/أو سلاك إن ضُبطت أسرارهما، مرة كل 12 ساعة على الأكثر
// لا يقرأ محتوى النسخ ولا يملك ما يفك تشفيرها. النشر: .github/workflows/deploy-backup-monitor.yml وREADME.md في هذا المجلد.
export const MAX_HOURS = 26;
const ALERT_EVERY_MS = 12 * 36e5;

export function evaluate(latest, now = Date.now(), maxHours = MAX_HOURS) {
  if (!latest) return { ok: false, reason: 'لا latest.json في الدلو: لم تُرفع نسخة بعد' };
  const at = Date.parse(latest.at);
  if (!Number.isFinite(at)) return { ok: false, reason: 'latest.json بلا وقت صالح' };
  const age = Math.floor((now - at) / 36e5);
  if (age > maxHours) return { ok: false, age_hours: age, at: latest.at, reason: `آخر نسخة عمرها ${age} ساعة، فوق ${maxHours}` };
  return { ok: true, age_hours: age, at: latest.at, files: (latest.files || []).length };
}

async function read(env, key) {
  const o = await env.BACKUPS.get(key);
  if (!o) return null;
  try { return JSON.parse(await o.text()); } catch { return null; }
}

// قناتا التنبيه، وكلتاهما اختيارية: بريد Resend (RESEND_API_KEY وALERT_TO)، وسلاك (SLACK_BOT_TOKEN وSLACK_CHANNEL، قيمتا
// LEADERS_SLACK_BOT_TOKEN وLEADERS_SLACK_CHANNEL نفسيهما) فيصل التنبيه الهاتف بإشعار تطبيق سلاك من قناة #mi-ops. مهلة
// الـ12 ساعة واحدة للقناتين. النص سبب التأخر وحده (عمر النسخة)، بلا اسم ملف ولا مفتاح.
export function alertText(state) {
  return `⚠️ النسخ الاحتياطي متأخر: ${state.reason}. الدليل: RUNBOOK.md §4`;
}

async function alert(env, state) {
  const mail = !!(env.RESEND_API_KEY && env.ALERT_TO);
  const slack = !!(env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL);
  if (!mail && !slack) return;
  const last = await read(env, 'monitor/last-alert.json');
  if (last && Date.now() - Date.parse(last.at) < ALERT_EVERY_MS) return;
  const sent = [];
  if (mail) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.ALERT_FROM || 'Milestone Impact <alerts@sunkvalue.com>', to: env.ALERT_TO, subject: 'النسخ الاحتياطي متأخر', text: `${state.reason}\nالدليل: RUNBOOK.md §4` }),
      });
      if (r.ok) sent.push('mail'); else console.error('backup-monitor mail:', r.status);
    } catch (e) { console.error('backup-monitor mail:', String(e)); }
  }
  if (slack) {
    try {
      const r = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: env.SLACK_CHANNEL, text: alertText(state), unfurl_links: false }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) sent.push('slack'); else console.error('backup-monitor slack:', j.error || r.status);
    } catch (e) { console.error('backup-monitor slack:', String(e)); }
  }
  // المهلة تبدأ بتنبيه وصل فعلًا: إن فشلت القناتان يُعاد في الساعة التالية
  if (sent.length) await env.BACKUPS.put('monitor/last-alert.json', JSON.stringify({ at: new Date().toISOString(), reason: state.reason, sent }));
}

export default {
  async fetch(req, env) {
    if (new URL(req.url).pathname !== '/health') return new Response('not found', { status: 404 });
    const state = evaluate(await read(env, 'latest.json'));
    return new Response(JSON.stringify(state), { status: state.ok ? 200 : 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  },
  async scheduled(_event, env, ctx) {
    const state = evaluate(await read(env, 'latest.json'));
    if (!state.ok) ctx.waitUntil(alert(env, state));
  },
};
