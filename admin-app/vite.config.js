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
  build: { outDir: '../admin', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'] } } } },
  server: { port: 5175 },
});
