import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// تطبيق القادة (leaders.sunkvalue.com) — بناء مستقل عن المصفوفة
// ════════════════════════════════════════════════════════════════
// root هنا هو leaders-app نفسه، والإخراج مجلد leaders/ في جذر المستودع،
// وهو ما ينشره مشروع Cloudflare Pages ‏mi-leaders كما هو دون أمر بناء.
// المخرجات مُودعة في Git، والفحص المستمر يرفض أي اختلاف بينها وبين المصدر.
// write-excel-file وfflate (تصدير Excel) باسمين ثابتين: بدونه يسمّيه Rollup «index» أو «browser» بحسب شرط الحل في البيئة،
// فيتغير اسم الملف وكل من يستورده، ويفشل فحص «المبني المودع يطابق مصدره» في CI مع أن المحتوى واحد.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: '../leaders', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], fflate: ['fflate'], excel: ['write-excel-file/browser'] } } } },
  server: { port: 5174 },
});
