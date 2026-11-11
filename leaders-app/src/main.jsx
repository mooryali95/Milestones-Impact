import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { captureAttribution } from './attribution.js';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import '../../shared/css/lab-board.css';
import './styles.css';

captureAttribution();
// الشاشات الثقيلة تُحمَّل كسولًا (lazy في App.jsx)؛ هذا ما يظهر أثناء جلب قطعتها
const Loading = () => <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
createRoot(document.getElementById('root')).render(<ErrorBoundary><Suspense fallback={<Loading />}><App /></Suspense></ErrorBoundary>);
// بعد كل نشر تتغير أسماء القطع المهشّرة؛ تبويب مفتوح قبل النشر يفشل استيرادها، فيُعاد تحميله
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); location.reload(); });

// التثبيت والعمل دون اتصال في النسخة المنشورة فقط، فلا يخزّن خادم التطوير شيئًا
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // بصمة البناء من اسم قطعة الدخول المهشّرة: تتغير مع كل نشر فيتجدد مخزن عامل الخدمة (sw.js)
  const build = [...document.scripts].map((s) => s.src.match(/\/assets\/index-([\w-]+)\.js/)?.[1]).find(Boolean) || 'dev';
  window.addEventListener('load', () => navigator.serviceWorker.register(`/sw.js?v=${build}`).catch(() => {}));
}
