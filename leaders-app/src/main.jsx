import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { captureAttribution } from './attribution.js';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import './styles.css';

captureAttribution();
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
// بعد كل نشر تتغير أسماء القطع المهشّرة؛ تبويب مفتوح قبل النشر يفشل استيرادها، فيُعاد تحميله
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); location.reload(); });

// التثبيت والعمل دون اتصال في النسخة المنشورة فقط، فلا يخزّن خادم التطوير شيئًا
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
