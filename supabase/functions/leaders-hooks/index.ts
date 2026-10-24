// ════════════════════════════════════════════════════════════════
// leaders-hooks: استقبال webhook منصات الحجز لتطبيق القادة
// ════════════════════════════════════════════════════════════════
// تُنشر بلا تحقق JWT (verify_jwt = false) لأن Cal.com وCalendly لا يرسلان
// توكن Supabase؛ الحماية توقيع HMAC بسرّ مشترك يُتحقق منه قبل أي كتابة.
//   Cal.com:  https://<project>.supabase.co/functions/v1/leaders-hooks?p=calcom    (LEADERS_CALCOM_SECRET)
//   Calendly: https://<project>.supabase.co/functions/v1/leaders-hooks?p=calendly  (LEADERS_CALENDLY_KEY)
import { Fail } from '../leaders-api/core.ts';
import { bookingWebhook } from '../leaders-api/activities.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false }, 405);
  const provider = new URL(req.url).searchParams.get('p') || '';
  if (!['calcom', 'calendly'].includes(provider)) return json({ success: false, message: 'unknown provider' }, 404);
  try {
    const raw = await req.text();
    return json(await bookingWebhook(provider, raw, req.headers));
  } catch (e) {
    if (e instanceof Fail) return json({ success: false, code: e.code }, e.status);
    console.error('leaders-hooks:', e);
    return json({ success: false }, 500);
  }
});
