// ════════════════════════════════════════════════════════════════
// الشاشات الكسولة بعد النشر: ملف قسم قديم لم يعد موجودًا
// ════════════════════════════════════════════════════════════════
// أسماء ملفات الأقسام تتغير مع كل بناء. اللوحة المفتوحة قبل النشر (تطبيق صفحة واحدة بعنوان #) لا تعيد تحميل index.html،
// فتطلب عند فتح قسم لأول مرة ملفًا حُذف، فيرد Cloudflare Pages بـ index.html (قاعدة /* في _redirects) ويفشل الاستيراد.
// React.lazy يحفظ الوعد المرفوض، فلا يصلحه «حاول مرة أخرى»: الحل إعادة تحميل الصفحة مرة واحدة، بعلامة في الجلسة تمنع
// حلقة إعادة التحميل إن تكرر الفشل لسبب آخر، فتعرض الشاشة حينها رسالة واضحة بزر إعادة التحميل (ScreenBoundary).
import { lazy } from 'react';

export const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to load module script|MIME type|ChunkLoadError|Loading (?:CSS )?chunk \S+ failed|Unable to preload CSS/i;
export const isChunkError = (e) => CHUNK_ERROR.test(String((e && (e.message || e.reason?.message)) || e || ''));

const FLAG = 'mi_admin_chunk_reload';
const WINDOW_MS = 60_000;
const defaultReload = () => { if (typeof window !== 'undefined') window.location.reload(); };
const defaultStorage = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };

// إعادة تحميل واحدة في الدقيقة: true إن أعاد التحميل الآن، وfalse إن سبقتها إعادة قريبة (فلا حلقة)
export function reloadOnce({ storage = defaultStorage(), reload = defaultReload, now = Date.now() } = {}) {
  let last = 0;
  try { last = Number(storage?.getItem(FLAG)) || 0; } catch { /* المخزن ممنوع: يُعاد مرة على الأقل */ }
  if (last && now - last < WINDOW_MS) return false;
  try { storage?.setItem(FLAG, String(now)); } catch { /* اختياري */ }
  reload();
  return true;
}

// الاستيراد بمحاولة ثانية، ثم إعادة تحميل الصفحة مرة واحدة. خطأ غير خطأ الملف يُرمى كما هو
export async function retryImport(load, { reloadPage = reloadOnce } = {}) {
  try {
    return await load();
  } catch (e) {
    if (!isChunkError(e)) throw e;
    try {
      return await load();
    } catch (e2) {
      // تُعاد الصفحة: الوعد لا ينتهي فلا تومض رسالة الخطأ قبل التحميل
      if (reloadPage()) return new Promise(() => {});
      throw e2;
    }
  }
}

export const lazyRetry = (load, opts) => lazy(() => retryImport(load, opts));
// قسم مسمّى من ملف فيه أكثر من قسم
export const lazyNamed = (load, key, opts) => lazy(() => retryImport(load, opts).then((m) => ({ default: m[key] })));

// تحميل مسبق فشل (Vite يطلق vite:preloadError): إعادة تحميل واحدة بدل الرمي
export function installPreloadRecovery(target = typeof window === 'undefined' ? null : window, opts) {
  if (!target) return;
  target.addEventListener('vite:preloadError', (event) => { if (reloadOnce(opts)) event.preventDefault(); });
}
