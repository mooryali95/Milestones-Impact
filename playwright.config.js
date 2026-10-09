// اختبارات الرحلات الأساسية من طرف المستخدم.
// الخلفية (Supabase) مُحاكاة داخل كل اختبار، فلا تلمس الاختبارات أي بيانات حقيقية.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { locale: 'ar-SA', trace: 'retain-on-failure' },
  webServer: [
    { command: 'python3 -m http.server 4301 --directory home', port: 4301, reuseExistingServer: !process.env.CI },
    { command: 'npm run build && npx vite preview --port 4302 --strictPort', port: 4302, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
