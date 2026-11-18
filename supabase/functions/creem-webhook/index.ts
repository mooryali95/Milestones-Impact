// ════════════════════════════════════════════════════════════════
// creem-webhook: إشعارات الدفع من Creem
// ════════════════════════════════════════════════════════════════
// تُنشر بلا تحقق JWT (--no-verify-jwt) لأن Creem لا يرسل توكن Supabase؛ الحماية توقيع HMAC
// (ترويسة creem-signature) بسرّ CAREEM_WEBHOOK_SECRET يُتحقق منه قبل أي كتابة.
//   https://<project>.supabase.co/functions/v1/creem-webhook
// GET على العنوان نفسه فحص صحة بلا أثر: {"success":true,"fn":"creem-webhook"}.
import { alertOps, Fail } from '../leaders-api/core.ts';
import { webhook } from '../leaders-api/payments.ts';
import { healthCheck } from '../_shared/health.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  // GET فحص صحة بلا أثر لدخان ما بعد النشر والمراقب (_shared/health.ts)، والخطاف POST وحده
  const health = healthCheck(req, 'creem-webhook');
  if (health) return health;
  if (req.method !== 'POST') return json({ success: false }, 405);
  try {
    return json(await webhook(await req.text(), req.headers));
  } catch (e) {
    if (e instanceof Fail) return json({ success: false, code: e.code }, e.status);
    console.error('creem-webhook:', e);
    // دفع لم يُمنح حقه: المالك يُبلَّغ فورًا، وCreem يعيد المحاولة فتُعاد المعالجة
    await alertOps('creem-webhook', { message: String((e as Error)?.message || e).slice(0, 300) });
    return json({ success: false }, 500);   // Creem يعيد المحاولة
  }
});
