// ════════════════════════════════════════════════════════════════
// إعادة التحميل بعد فشل ملف قسم تفتح القسم الذي طلبه المشارك، لا «رحلتي»
// ════════════════════════════════════════════════════════════════
// القسم المعروض حالة في الذاكرة (view في App.jsx) لا يبقى بعد إعادة التحميل. فيُكتب في الرابط بصيغة /?tab= التي يقرؤها
// tabFromSearch عند الإقلاع (deeplink.js)، ثم تُعاد الصفحة مرة واحدة بحارس reloadOnce (shared/ui/lazy-retry.js) فلا حلقة.
// يعمل في مسار المشارك (/) وحده: البوابات المستقلة (/org و/x و/verify...) مسارها في الرابط أصلًا فتعود إليه كما هي.
import { lazy } from 'react';
import { TABS } from './deeplink.js';
import { reloadOnce, retryImport } from '../../shared/ui/lazy-retry.js';

let requested = null;
/** القسم الذي يطلبه المشارك الآن (يُحدَّث مع كل رسم للوحة المشارك) */
export const noteView = (view) => { requested = view; };
export const _requestedView = () => requested;

/** الرابط الذي يفتح القسم بعد إعادة التحميل: /?tab=<القسم> في مسار المشارك، وما سوى ذلك من العنوان باقٍ.
 * قسم لا يفتحه رابط (الرحلة) يحذف tab، ومسار غير الجذر يبقى كما هو
 * @param {string} href @param {string | null} view @returns {string} */
export function urlForView(href, view) {
  const url = new URL(href);
  if (url.pathname !== '/') return url.toString();
  if (view && TABS.includes(view)) url.searchParams.set('tab', view);
  else url.searchParams.delete('tab');
  return url.toString();
}

/** رابط القسم المطلوب الآن من رابط الصفحة الحالي */
export const viewHref = () => (typeof location === 'undefined' ? null : urlForView(location.href, requested));

/** إعادة تحميل واحدة إلى القسم المطلوب (opts تمرر إلى reloadOnce، للاختبار) */
export const reloadToView = (opts = {}) => reloadOnce({ to: viewHref, ...opts });

/** شاشة كسولة: محاولة ثانية، ثم إعادة تحميل واحدة إلى القسم المطلوب */
export const lazyView = (load) => lazy(() => retryImport(load, { reloadPage: (o) => reloadToView(o) }));
