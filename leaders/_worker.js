// ════════════════════════════════════════════════════════════════
// عامل Pages لملفات /assets/ (تصور تحديث المنصة، المرحلة 1 البند 2): الملف الغائب لا يُخزَّن في المتصفح
// ════════════════════════════════════════════════════════════════
// المشكلة: _headers تطابق مسار الطلب لا الملف المقدَّم، فرد الملف الغائب (assets/404.html برمز 404) يحمل ترويسة /assets/*
// الثابتة سنة (immutable). فإن رد Pages 404 عابرًا لملف موجود (أثناء انتشار نشر على الحافة) خزّنه المتصفح سنة، وSafari
// لا يذكر رابط الملف في خطأ الاستيراد فلا يجدده العميل، فيبقى القسم معطلًا بعد كل «حدّث الصفحة» (حادث الخبير على iPhone،
// 2026-11-25، ثلاثة أحداث chunk في leaders.client_events على البناء D-d_VuQM).
// الحل: هذا الملف يُكتب كما هو إلى _worker.js في ناتج التطبيقين (assetWorker في release-files.mjs)، ومعه _routes.json
// يحصره في /assets/* وحده. لماذا _worker.js لا مجلد functions/: مشروعا mi-leaders وmi-admin ينشران مجلد الإخراج (leaders/ وadmin/)
// كما هو بلا أمر بناء، وجذر المشروع مشترك بين مشاريع المستودع الأربعة، فمجلد functions/ في الجذر (إن قرأه Pages) يقع على
// المنصات كلها، ولا يُعرف من المستودع أين جذر كل مشروع. أما _worker.js في مجلد الإخراج («advanced mode» في وثائق Pages)
// فيُنشر مع ملفات المشروع نفسه أيًا كان جذره، ويُختبر بالنشر الذي يحمله.
// _routes.json: كل ما سوى /assets/* لا يمر بالعامل أصلًا، فالصفحة ومسارات التطبيق و_redirects و_headers كما كانت تمامًا.
// وما يمر به: الملف الموجود يُرد كما قدّمه env.ASSETS (بترويسات _headers إن طبّقها خادم الملفات)، وإن غابت عنه ترويسة
// /assets/* الثابتة أو nosniff أضيفتا، فلا يفقد الملف السليم تخزينه سنة في أي من الحالين. والغائب (أي رمز غير 2xx و304،
// أو صفحة HTML برمز 200 تحت اسم ملف JS أو CSS) يُرد 404 بـCache-Control: no-store، فلا يحفظه متصفح ولا عامل خدمة.
// خطأ في العامل نفسه لا يُسقط الملفات: يُرد ما قدّمه env.ASSETS كما هو (passThroughOnException).
// لا استيراد في هذا الملف: يُنسخ نصه كما هو. يختبره leaders-app/src/asset-worker.test.js.

export const IMMUTABLE = 'public, max-age=31536000, immutable';
const SCRIPT_OR_STYLE = /\.(?:m?js|css)$/i;

/** الرد بعد العامل لطلب في /assets/: الموجود كما هو (مع ترويسة الثبات إن غابت)، والغائب 404 بلا تخزين */
export function assetResponse(request, res) {
  const path = new URL(request.url).pathname;
  const type = (res.headers.get('content-type') || '').toLowerCase();
  const htmlForCode = res.status === 200 && SCRIPT_OR_STYLE.test(path) && type.startsWith('text/html');
  const ok = (res.status >= 200 && res.status < 300 && !htmlForCode) || res.status === 304;
  if (ok) {
    const cc = res.headers.get('cache-control') || '';
    if (/immutable/i.test(cc) && res.headers.get('x-content-type-options')) return res;
    const headers = new Headers(res.headers);
    if (!/immutable/i.test(cc)) headers.set('Cache-Control', IMMUTABLE);
    if (!headers.get('x-content-type-options')) headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  headers.delete('Age');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!type || htmlForCode) headers.set('Content-Type', 'text/html; charset=utf-8');
  const body = request.method === 'HEAD' ? null : (htmlForCode ? 'الملف غير موجود.' : res.body);
  if (htmlForCode) headers.delete('Content-Length');
  return new Response(body, { status: 404, statusText: 'Not Found', headers });
}

export default {
  async fetch(request, env, ctx) {
    if (ctx && typeof ctx.passThroughOnException === 'function') ctx.passThroughOnException();
    const res = await env.ASSETS.fetch(request);
    if (!new URL(request.url).pathname.startsWith('/assets/')) return res;
    try { return assetResponse(request, res); } catch { return res; }
  },
};
