// ════════════════════════════════════════════════════════════════
// مولّد PDF متجهي على الخادم: Chromium (Cloudflare Browser Rendering) يطبع HTML الوثيقة نفسه
// ════════════════════════════════════════════════════════════════
// قرار المالك 2026-11-25 (يعكس قرار 2026-11-15): نص حقيقي قابل للتحديد والبحث، بقواعد @page نفسها التي تحكم نافذة الطباعة.
// المصدر واحد: التطبيق يبني HTML بـ documentHtml(meta, body, { print: true, base }) من وثيقة الخادم لحظة الطلب، ويرسله هنا.
// لا تخزين ولا ذاكرة مؤقتة: كل طلب يولّد ملفه ويُرد بـ no-store، فما يتغير في البيانات يظهر في الطلب التالي.
// الحماية: تذكرة HMAC من leaders-api (supabase/functions/_shared/pdf-ticket.js)، وسكربت الصفحة معطّل، والشبكة محصورة في أصل
// التطبيق (الخطوط والصور) وصور data:، وحد للحجم. بلا العامل أو عند تعذّره يبني المتصفح الملف (src/lib/brand/pdf.js).
import puppeteer from '@cloudflare/puppeteer';
import { verifyTicket } from '../../supabase/functions/_shared/pdf-ticket.js';
import { allowedRequest, appOrigins, limitKey, PDF_OPTIONS } from './policy.js';

const MAX_HTML = 6 * 1024 * 1024;

const cors = (env, origin) => {
  const allow = appOrigins(env);
  return { 'Access-Control-Allow-Origin': allow.includes(origin) ? origin : allow[0] || 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' };
};
const json = (status, body, h) => new Response(JSON.stringify(body), { status, headers: { ...h, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const safeName = (n) => String(n || 'وثيقة').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 120) || 'وثيقة';

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '';
    const h = cors(env, origin);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/health') return json(200, { ok: true }, h);
    if (req.method !== 'POST' || url.pathname !== '/pdf') return json(404, { success: false }, h);
    let b;
    try { b = await req.json(); } catch { return json(400, { success: false, message: 'طلب غير صالح' }, h); }
    const sub = await verifyTicket(env.PDF_RENDER_SECRET, b?.ticket);
    if (!sub) return json(401, { success: false, code: 'ticket' }, h);
    // سقف لكل صاحب تذكرة (Workers Rate Limiting، PDF_LIMIT في wrangler.toml). بلا الربط يمر الطلب كما كان، والتطبيق يرجع
    // عند 429 إلى بناء المتصفح (downloadBest)
    if (env.PDF_LIMIT?.limit) {
      const { success } = await env.PDF_LIMIT.limit({ key: limitKey(sub) }).catch(() => ({ success: true }));
      if (!success) return json(429, { success: false, code: 'limit' }, h);
    }
    const html = String(b?.html || '');
    if (!html.startsWith('<!doctype html>') || html.length > MAX_HTML) return json(413, { success: false, code: 'html' }, h);
    // أصول التطبيقات كلها (القادة والإدارة، المرحلة 3ب): documentHtml يبني base من location.origin لمن طلب الوثيقة
    const origins = appOrigins(env);
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (r) => (allowedRequest(r.url(), origins) ? r.continue() : r.abort()));
      await page.emulateMediaType('print');
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });
      const pdf = await page.pdf(PDF_OPTIONS);
      const name = `${safeName(b.name)}.pdf`;
      return new Response(pdf, { status: 200, headers: { ...h, 'content-type': 'application/pdf', 'cache-control': 'no-store', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Access-Control-Expose-Headers': 'content-disposition' } });
    } catch (e) {
      console.error('pdf-render:', e?.message || e);
      return json(502, { success: false, code: 'render' }, h);
    } finally {
      await browser.close().catch(() => {});
    }
  },
};
