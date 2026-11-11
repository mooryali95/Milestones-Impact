// اختبارات الرحلات الأساسية من طرف المستخدم.
// الخلفية (Supabase) مُحاكاة داخل كل اختبار، فلا تلمس الاختبارات أي بيانات حقيقية.
import { defineConfig } from '@playwright/test';

const SERVERS = [
  { name: 'home', command: 'python3 -m http.server 4301 --directory home', port: 4301, reuseExistingServer: !process.env.CI },
  { name: 'admin', command: 'python3 -m http.server 4303 --directory admin', port: 4303, reuseExistingServer: !process.env.CI },
  // منصة القادة من ناتجها المودع، بمعاينة Vite لتعمل المسارات مثل /org
  { name: 'leaders', command: 'npx vite preview --config leaders-app/vite.config.js --port 4304 --strictPort', port: 4304, reuseExistingServer: !process.env.CI },
  // في CI تبني وظيفة المصفوفة build/ قبل الرحلات، فلا يُعاد البناء هنا (E2E_PREBUILT)
  { name: 'matrix', command: `${process.env.E2E_PREBUILT ? '' : 'npm run build && '}npx vite preview --port 4302 --strictPort`, port: 4302, reuseExistingServer: !process.env.CI, timeout: 120_000 },
];
const ONLY = process.env.E2E_SERVERS ? process.env.E2E_SERVERS.split(',').map((s) => s.trim()) : null;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // PW_CHROMIUM: مسار متصفح مثبت سلفًا حين لا يطابق إصدار Playwright المثبت في المشروع (بيئات التطوير السحابية)؛ CI لا يضبطه
  use: { locale: 'ar-SA', trace: 'retain-on-failure', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
  // E2E_SERVERS (مثل admin,leaders): يشغّل CI خوادم المجموعة وحدها (scripts/ops/e2e-groups.mjs). بلا قيمة: الأربعة.
  webServer: SERVERS.filter((s) => !ONLY || ONLY.includes(s.name)).map(({ name, ...s }) => s),
});
