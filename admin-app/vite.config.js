import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// لوحة الإدارة (React) على admin.sunkvalue.com، تُبنى إلى admin/
// ════════════════════════════════════════════════════════════════
// mi-admin ينشر admin/ كما هو بلا خطوة بناء، فالمخرجات مُودعة في Git
// مثل تطبيق القادة. الملفات الثابتة (_headers و_redirects والأيقونات
// والشعار) في admin-app/public/ وتُنسخ مع كل بناء.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  // التصدير إلى Excel باسم ثابت: بلا ذلك يسمّي Rollup قطعته المشتركة index محليًا وbrowser في CI بالمحتوى نفسه،
  // فيختلف المبني المودع عن بناء CI
  build: { outDir: '../admin', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], excel: ['write-excel-file/browser', 'fflate'] } } } },
  server: { port: 5175 },
});
