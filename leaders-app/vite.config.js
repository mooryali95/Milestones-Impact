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
  build: { outDir: '../leaders', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'] } } } },
  server: { port: 5174 },
});
