import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installPreloadRecovery } from './lazy-retry.js';
import { ScreenBoundary } from './ui.jsx';
import { appUpdate, installAppUpdate, reloadOnNavigate } from '../../shared/ui/app-update.js';
import UpdateBar from '../../shared/ui/UpdateBar.jsx';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import '../../shared/css/lab-board.css';
import '../../shared/css/journey-map.css';
import '../../shared/css/journey-timeline.css';
import '../../shared/css/presenter-qr.css';
import '../../shared/css/update-bar.css';
import './admin.css';
import './leaders-admin.css';

// ملف حذفه نشر أحدث (لوحة مفتوحة قبله): إعادة تحميل واحدة بدل شاشة معطلة
installPreloadRecovery();

// تحديث بالدعوة لا بالكسر (المرحلة 5): version.json يُفحص عند الرجوع إلى التبويب وعند التنقل وكل 20 دقيقة، وعند الاختلاف شريط
// «تحديث جديد متاح». أول تنقل بين الشاشات بعده (تغيّر #/ في العنوان) يعيد التحميل إلى الشاشة نفسها، ما لم تكن نافذة فيها
// تعديل لم يُحفظ (useGuardedClose يسجّلها، shared/ui/unsaved-registry.js)
installAppUpdate(window);
window.addEventListener('hashchange', () => { reloadOnNavigate(appUpdate()); });

// شاشات السياقات تُحمَّل كسولًا (lazy في App.jsx). الحاجز الأخير حول اللوحة كلها: خطأ في سياق أو نافذة أو الإطار يعرض
// رسالة بزرين بدل صفحة بيضاء، وخطأ ملف قديم بعد نشر يعيد التحميل مرة (ScreenBoundary scope="app" في ui.jsx)
createRoot(document.getElementById('root')).render(
  <ScreenBoundary scope="app"><UpdateBar /><Suspense fallback={<div className="la-loading">جارٍ التحميل…</div>}><App /></Suspense></ScreenBoundary>,
);
