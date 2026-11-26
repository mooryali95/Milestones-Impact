# مولّد PDF المتجهي (mi-pdf-render)

يطبع Chromium على Cloudflare (Browser Rendering) HTML الوثيقة نفسه الذي تطبعه نافذة المتصفح، فيخرج ملف بنص حقيقي قابل للتحديد والبحث.

## المسار
1. المشارك يطلب `capstone.doc`؛ يرد leaders-api بالوثيقة ومعها `pdf: { url, ticket }` حين يُضبط السران أدناه. وكل وثيقة أخرى تُفتح
   بـ`writeDocument` (تقرير الجهة والأثر وشهادة الخبير ووثائق لوحة الإدارة) تطلب عند نقر «تحميل PDF» تذكرة `pdf.ticket` بجلسة
   صفحتها (مشارك أو خبير أو منسق أو مدير)، ومصدرها يسجله كل تطبيق عند إقلاعه (`src/lib/brand/pdf-source.js`).
2. التطبيق يبني HTML من الوثيقة لحظتها (`documentHtml(meta, body, { print: true, base })`) ويرسله إلى `POST /pdf` مع التذكرة.
3. العامل يتحقق من التذكرة (HMAC، عشر دقائق)، ويحد الطلبات لكل صاحب تذكرة (`PDF_LIMIT`: 20 في الدقيقة، 429 عند تجاوزه)،
   ويعطّل السكربت، ويحصر الشبكة في أصول التطبيقات (`ALLOWED_ORIGINS`: القادة والإدارة)، ويرد الملف بـ `no-store`. لا يُسجَّل المحتوى.
4. تعذّر العامل أو غيابه: يبني المتصفح الملف كما كان (`src/lib/brand/pdf.js`).

## النشر (مرة واحدة)
1. فعّل Browser Rendering في حساب Cloudflare (خطة Workers المدفوعة).
2. ولّد سرًا عشوائيًا (32 حرفًا فأكثر): `openssl rand -hex 32`.
3. في Cloudflare: `cd workers/pdf-render && npm install && npx wrangler secret put PDF_RENDER_SECRET` ثم `npx wrangler deploy` (أو سير `deploy-pdf-render.yml`).
4. في أسرار دوال Supabase: `PDF_RENDER_SECRET` بالقيمة نفسها، و`PDF_RENDER_URL=https://pdf.sunkvalue.com`، ثم أعد نشر leaders-api.
5. التحقق: `curl https://pdf.sunkvalue.com/health` يرد `{"ok":true}`، وزر التحميل في الوثيقة يعطي ملفًا نصه قابل للتحديد.
