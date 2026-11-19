import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { captureAttribution } from './attribution.js';
import { installPreloadRecovery } from '../../shared/ui/lazy-retry.js';
import { viewHref } from './reload-view.js';
import { installTelemetry } from './telemetry.js';
import { adoptWaitingIfAlone, buildFromScripts, installAppUpdate } from '../../shared/ui/app-update.js';
import UpdateBar from '../../shared/ui/UpdateBar.jsx';
import UpdateRefusal from './UpdateRefusal.jsx';
import { trackTopbarHeight } from './topbar-height.js';
import '../../shared/css/brand.css';
import '../../shared/css/status.css';
import '../../shared/css/lab-board.css';
import '../../shared/css/journey-map.css';
import '../../shared/css/presenter-qr.css';
import '../../shared/css/update-bar.css';
import './styles.css';

captureAttribution();
// الرصد من جهة العميل (المرحلة 4): أخطاء الصفحة وفشل القطع، وإرسال ما بقي في الطابور بعد عودة الاتصال
installTelemetry(window);
// تحديث بالدعوة لا بالكسر (المرحلة 5): version.json يُفحص عند الرجوع إلى التبويب وعند التنقل وكل 20 دقيقة، وعند الاختلاف شريط
// «تحديث جديد متاح» تحت الترويسة وثابت عند التمرير (styles.css)، و«حدّث» يفتح القسم نفسه (shared/ui/app-update.js).
// ورسالة رفض الخادم update_required تبقى أسفل الشاشة بزر «حدّث» (UpdateRefusal.jsx)
installAppUpdate(window);
// الشاشات الثقيلة تُحمَّل كسولًا (lazy في App.jsx)؛ هذا ما يظهر أثناء جلب قطعتها
const Loading = () => <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
createRoot(document.getElementById('root')).render(<ErrorBoundary><UpdateBar to={viewHref} /><Suspense fallback={<Loading />}><App /></Suspense><UpdateRefusal to={viewHref} /></ErrorBoundary>);
trackTopbarHeight(window);
// بعد كل نشر تتغير أسماء القطع المهشّرة؛ تبويب مفتوح قبل النشر يفشل تحميلها المسبق، فيُعاد تحميله مرة واحدة
// في الدقيقة على الأكثر (لا حلقة إن تكرر الفشل لوكيل أو انقطاع)، وإلى القسم الذي طلبه المشارك (reload-view.js)
installPreloadRecovery(window, { to: viewHref });

// التثبيت والعمل دون اتصال في النسخة المنشورة فقط، فلا يخزّن خادم التطوير شيئًا
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // بصمة البناء من اسم قطعة الدخول المهشّرة: تتغير مع كل نشر فيتجدد مخزن عامل الخدمة (sw.js)، وهي نفسها في version.json
  const build = buildFromScripts(document);
  // العامل الجديد لا يستولي على التبويبات وحده: ينتظر «حدّث» (SKIP_WAITING)، أو يُفعَّل إن كانت هذه الصفحة الجديدة وحدها مفتوحة
  window.addEventListener('load', () => navigator.serviceWorker.register(`/sw.js?v=${build}`).then(adoptWaitingIfAlone).catch(() => {}));
}
