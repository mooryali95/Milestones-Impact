// ════════════════════════════════════════════════════════════════
// creem-webhook: إشعارات الدفع من Creem
// ════════════════════════════════════════════════════════════════
// تُنشر بلا تحقق JWT (--no-verify-jwt) لأن Creem لا يرسل توكن Supabase؛ الحماية توقيع HMAC
// (ترويسة creem-signature) بسرّ CAREEM_WEBHOOK_SECRET يُتحقق منه قبل أي كتابة.
//   https://<project>.supabase.co/functions/v1/creem-webhook
import { Fail } from '../leaders-api/core.ts';
import { webhook } from '../leaders-api/payments.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false }, 405);
  try {
    return json(await webhook(await req.text(), req.headers));
  } catch (e) {
    if (e instanceof Fail) return json({ success: false, code: e.code }, e.status);
    console.error('creem-webhook:', e);
    return json({ success: false }, 500);   // Creem يعيد المحاولة
  }
});
