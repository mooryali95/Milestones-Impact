import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ════════════════════════════════════════════════════════════════
// إعداد Vite
// ════════════════════════════════════════════════════════════════
// outDir = 'build' لا 'dist' الافتراضي. مشروع mi-matrix على Cloudflare
// مضبوط على مجلد إخراج اسمه build (راجع docs/archive/DEPLOY-MATRIX.md)، وتغيير
// الاسم هنا يعني تغييراً يدوياً في لوحة Cloudflare — والبناء يسقط
// صامتاً بينهما. المجلد يبقى build فلا يُمَسّ إعداد النشر.

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    // لا هدف صريح: افتراضي Vite 7 هو baseline-widely-available
    // (‏Chrome 107 · Edge 107 · Firefox 104 · Safari 16). كان
    // browserslist في package.json يقول "آخر إصدارين" من المتصفحات
    // الأربعة، وهذا أوسع منه — فلا انحسار في الدعم.
    // ('modules' كان صالحاً في Vite 5 ويرفضه Vite 7 لأهداف CSS.)
    // CRA كان يحذف المجلد قبل كل بناء؛ نُبقي السلوك نفسه.
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { port: 3000 },
  test: {
    // describe/it/expect بلا استيراد — كما كانت مع Jest، فلا تتغيّر الاختبارات.
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}', 'leaders-app/src/**/*.test.{js,jsx}', 'admin-app/src/**/*.test.{js,jsx}'],
  },
});
