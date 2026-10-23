import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// لوحة الإدارة الجديدة (React) — تُبنى إلى admin/next/
// ════════════════════════════════════════════════════════════════
// تعمل بجانب اللوحة القديمة على admin.sunkvalue.com/next/ حتى يكتمل
// نقل كل التبويبات، ثم تحل محلها. الجلسة مشتركة بين اللوحتين لأنها
// على النطاق نفسه (sessionStorage: mi_admin_v3).
// المخرجات مُودعة في Git مثل تطبيق القادة.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/next/',
  plugins: [react()],
  build: { outDir: '../admin/next', emptyOutDir: true, sourcemap: false },
  server: { port: 5175 },
});
