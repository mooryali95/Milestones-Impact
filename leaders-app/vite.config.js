import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// تطبيق القادة (leaders.sunkvalue.com) — بناء مستقل عن المصفوفة
// ════════════════════════════════════════════════════════════════
// root هنا هو leaders-app نفسه، والإخراج مجلد leaders/ في جذر المستودع،
// وهو ما ينشره مشروع Cloudflare Pages ‏mi-leaders كما هو دون أمر بناء.
// المخرجات مُودعة في Git، والفحص المستمر يرفض أي اختلاف بينها وبين المصدر.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  // التصدير إلى Excel باسم ثابت: بلا ذلك يسمّي Rollup قطعته المشتركة index محليًا وbrowser في CI بالمحتوى نفسه،
  // فيختلف المبني المودع عن بناء CI
  build: { outDir: '../leaders', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], excel: ['write-excel-file/browser', 'fflate'] } } } },
  server: { port: 5174 },
});
