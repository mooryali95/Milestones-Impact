import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// ════════════════════════════════════════════════════════════════
// تطبيق القادة (leaders.sunkvalue.com) — بناء مستقل عن المصفوفة
// ════════════════════════════════════════════════════════════════
// root هنا هو leaders-app نفسه، والإخراج leaders-app/build الذي
// يخدمه مشروع Cloudflare Pages ‏mi-leaders (راجع README.md).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'build', emptyOutDir: true, sourcemap: false },
  server: { port: 5174 },
});
