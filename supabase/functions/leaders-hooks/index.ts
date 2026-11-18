// ════════════════════════════════════════════════════════════════
// leaders-hooks: استقبال webhook منصات الحجز لتطبيق القادة
// ════════════════════════════════════════════════════════════════
// تُنشر بلا تحقق JWT (verify_jwt = false) لأن Cal.com وCalendly لا يرسلان
// توكن Supabase؛ الحماية توقيع HMAC بسرّ مشترك يُتحقق منه قبل أي كتابة.
//   Cal.com:  https://<project>.supabase.co/functions/v1/leaders-hooks?p=calcom    (LEADERS_CALCOM_SECRET)
//   Calendly: https://<project>.supabase.co/functions/v1/leaders-hooks?p=calendly  (LEADERS_CALENDLY_KEY)
// GET على العنوان (بمزود أو بلا مزود) فحص صحة بلا أثر: {"success":true,"fn":"leaders-hooks"}.
import { alertOps, Fail } from '../leaders-api/core.ts';
import { bookingWebhook } from '../leaders-api/activities.ts';
import { healthCheck } from '../_shared/health.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  // GET فحص صحة بلا أثر لدخان ما بعد النشر والمراقب (_shared/health.ts)، والخطاف POST وحده
  const health = healthCheck(req, 'leaders-hooks');
  if (health) return health;
  if (req.method !== 'POST') return json({ success: false }, 405);
  const provider = new URL(req.url).searchParams.get('p') || '';
  if (!['calcom', 'calendly'].includes(provider)) return json({ success: false, message: 'unknown provider' }, 404);
  try {
    const raw = await req.text();
    return json(await bookingWebhook(provider, raw, req.headers));
  } catch (e) {
    if (e instanceof Fail) return json({ success: false, code: e.code }, e.status);
    console.error('leaders-hooks:', e);
    await alertOps('leaders-hooks', { provider, message: String((e as Error)?.message || e).slice(0, 300) });
    return json({ success: false }, 500);
  }
});
