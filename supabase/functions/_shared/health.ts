// فحص صحة بطلب GET للدالتين المنشورتين بلا تحقق JWT (creem-webhook وleaders-hooks)، يسألهما دخان ما بعد النشر
// (scripts/ops/smoke.mjs) والمراقب الخارجي. وصول الرد يثبت أن الدالة أقلعت بكل وحداتها (عطل BOOT_ERROR لا يصل هنا).
// بلا أثر جانبي: لا قاعدة، ولا سر، ولا تنبيه، ولا قراءة لجسم الطلب أو ترويساته. والرد لا يكشف إلا اسم الدالة.
// الخطاف الحقيقي POST موقّع، فلا يتداخل معه GET.
export function healthCheck(req: Request, fn: string): Response | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  return new Response(req.method === 'HEAD' ? null : JSON.stringify({ success: true, fn }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
