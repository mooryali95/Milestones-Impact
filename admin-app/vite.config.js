import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// لوحة الإدارة (React) على admin.sunkvalue.com، تُبنى إلى admin/
// ════════════════════════════════════════════════════════════════
// mi-admin ينشر admin/ كما هو بلا خطوة بناء، فالمخرجات مُودعة في Git
// مثل تطبيق القادة. الملفات الثابتة (_headers و_redirects والأيقونات
// والشعار) في admin-app/public/ وتُنسخ مع كل بناء.
// write-excel-file وfflate (تصدير Excel) باسمين ثابتين: بدونه يسمّيه Rollup «index» أو «browser» بحسب شرط الحل في البيئة،
// فيتغير اسم الملف وكل من يستورده، ويفشل فحص «المبني المودع يطابق مصدره» في CI مع أن المحتوى واحد.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  build: { outDir: '../admin', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], fflate: ['fflate'], excel: ['write-excel-file/browser'] } } } },
  server: { port: 5175 },
});
