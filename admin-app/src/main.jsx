import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installPreloadRecovery } from './lazy-retry.js';
import { ScreenBoundary } from './ui.jsx';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import '../../shared/css/lab-board.css';
import '../../shared/css/journey-map.css';
import '../../shared/css/journey-timeline.css';
import './admin.css';
import './leaders-admin.css';

// ملف حذفه نشر أحدث (لوحة مفتوحة قبله): إعادة تحميل واحدة بدل شاشة معطلة
installPreloadRecovery();

// شاشات السياقات تُحمَّل كسولًا (lazy في App.jsx). الحاجز الأخير حول اللوحة كلها: خطأ في سياق أو نافذة أو الإطار يعرض
// رسالة بزرين بدل صفحة بيضاء، وخطأ ملف قديم بعد نشر يعيد التحميل مرة (ScreenBoundary scope="app" في ui.jsx)
createRoot(document.getElementById('root')).render(
  <ScreenBoundary scope="app"><Suspense fallback={<div className="la-loading">جارٍ التحميل…</div>}><App /></Suspense></ScreenBoundary>,
);
