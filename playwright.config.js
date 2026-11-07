// اختبارات الرحلات الأساسية من طرف المستخدم.
// الخلفية (Supabase) مُحاكاة داخل كل اختبار، فلا تلمس الاختبارات أي بيانات حقيقية.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // PW_CHROMIUM: مسار متصفح مثبت سلفًا حين لا يطابق إصدار Playwright المثبت في المشروع (بيئات التطوير السحابية)؛ CI لا يضبطه
  use: { locale: 'ar-SA', trace: 'retain-on-failure', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
  webServer: [
    { command: 'python3 -m http.server 4301 --directory home', port: 4301, reuseExistingServer: !process.env.CI },
    { command: 'python3 -m http.server 4303 --directory admin', port: 4303, reuseExistingServer: !process.env.CI },
    // منصة القادة من ناتجها المودع، بمعاينة Vite لتعمل المسارات مثل /org
    { command: 'npx vite preview --config leaders-app/vite.config.js --port 4304 --strictPort', port: 4304, reuseExistingServer: !process.env.CI },
    { command: 'npm run build && npx vite preview --port 4302 --strictPort', port: 4302, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
