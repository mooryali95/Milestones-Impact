import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import '../../shared/css/lab-board.css';
import './admin.css';
import './leaders-admin.css';

// شاشات السياقات تُحمَّل كسولًا (lazy في App.jsx)
createRoot(document.getElementById('root')).render(<Suspense fallback={<div className="la-loading">جارٍ التحميل…</div>}><App /></Suspense>);
