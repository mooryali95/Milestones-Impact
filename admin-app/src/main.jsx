import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installPreloadRecovery } from './lazy-retry.js';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import '../../shared/css/lab-board.css';
import '../../shared/css/journey-map.css';
import './admin.css';
import './leaders-admin.css';

// ملف حذفه نشر أحدث (لوحة مفتوحة قبله): إعادة تحميل واحدة بدل شاشة معطلة
installPreloadRecovery();

// شاشات السياقات تُحمَّل كسولًا (lazy في App.jsx)
createRoot(document.getElementById('root')).render(<Suspense fallback={<div className="la-loading">جارٍ التحميل…</div>}><App /></Suspense>);
