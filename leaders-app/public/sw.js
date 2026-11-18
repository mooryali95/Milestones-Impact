/* رحلة القادة: تثبيت على الجوال وفتح الواجهة دون اتصال */
// الواجهة وأصولها تُخزّن؛ طلبات الخادم (Supabase) لا تُخزّن أبدًا،
// فمحتوى الكتيب المحمي لا يبقى على الجهاز، وبيانات المشارك دائمًا حديثة.
// اسم المخزن من بصمة البناء (?v= في رابط التسجيل): كل نشر يفتح مخزنًا جديدًا ويحذف القديم
// ما يُخزَّن (تصور تحديث المنصة، المرحلة 1 البند 4): ملفات /assets/ و/fonts/ وحدها، وبنوع JS أو CSS أو خط أو صورة (الشعار
// وصور الكتيب في /assets/ تبقى دون اتصال)، فلا تُخزَّن صفحة HTML (رد Pages لملف غائب، أو تحدي جدار الحماية) تحت اسم ملف JS. لا رد جزئي (206) ولا طلب Range (الفيديو في /media
// يمر إلى الشبكة كما هو). والتنقل لا يُخزَّن إلا ردًا سليمًا من النطاق نفسه (res.ok و type === 'basic').
// قرارات التخزين دوال خالصة أدناه يختبرها leaders-app/src/update-safety.test.js في Node، والمستمعات لا تُركَّب إلا داخل عامل الخدمة.
// ذلك الاختبار يقرأ بأسمائها: cacheableAsset وcacheableNavigation وinCachedDir وisRange وSHELL وcachesToDelete وskipWaitingFor، فتغيير اسم منها يغيّره هناك.
// التحديث بالدعوة (المرحلة 5 البند 5): العامل الجديد لا يستولي على التبويبات المفتوحة وحده (لا skipWaiting عند التثبيت).
// ينتظر حتى يضغط المستخدم «حدّث» فتصله SKIP_WAITING (shared/ui/app-update.js، activateWaiting)، أو حتى تكون صفحة الإصدار
// الجديد وحدها مفتوحة (onlyIfAlone)، أو تُغلق التبويبات كلها. وعند تفعيله يُبقي مخزن الإصدار السابق (N-1) لتبويب قديم ما زال مفتوحًا.

const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg'];
const CACHED_DIRS = ['/assets/', '/fonts/'];
const CACHED_TYPES = /^(?:application|text)\/(?:x-)?javascript\b|^text\/css\b|^font\/|^application\/(?:x-)?font-|^application\/vnd\.ms-fontobject\b|^image\//i;

// طلب يحمل Range يريد جزءًا: لا يُخدم من المخزن ولا يُخزَّن رده
function isRange(req) {
  return !!(req && req.headers && req.headers.get && req.headers.get('range'));
}

// هل الطلب من مجلدات الأصول المخزنة؟ (pathname من رابط النطاق نفسه)
function inCachedDir(pathname) {
  return CACHED_DIRS.some((d) => pathname.startsWith(d));
}

// هل يُخزَّن رد هذا الأصل؟ رد كامل سليم (200 لا 206) من النطاق نفسه، بنوع JS أو CSS أو خط أو صورة، لطلب بلا Range
function cacheableAsset(req, res, pathname) {
  if (!res || isRange(req) || !inCachedDir(pathname)) return false;
  if (res.status !== 200 || res.type !== 'basic') return false;
  const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  return CACHED_TYPES.test(type.trim());
}

// المخازن التي تُحذف عند التفعيل: كل مخزن سوى الحالي وآخر مخزن سابق قبله (N-1). keys بترتيب الإنشاء (Cache API)، فآخر
// مخزن غير الحالي هو الإصدار السابق. ومخزن ليس من هذا التطبيق (اسم بلا mi-leaders-) لا يُمس
function cachesToDelete(keys, current) {
  const ours = (keys || []).filter((k) => typeof k === 'string' && k.startsWith('mi-leaders-'));
  const others = ours.filter((k) => k !== current);
  const keep = others[others.length - 1];
  return others.filter((k) => k !== keep);
}

// هل تُفعَّل النسخة المنتظرة لهذه الرسالة؟ SKIP_WAITING من «حدّث» دائمًا، ومع onlyIfAlone حين تكون نافذة واحدة مفتوحة فقط
function skipWaitingFor(data, windowCount) {
  if (!data || data.type !== 'SKIP_WAITING') return false;
  return data.onlyIfAlone ? windowCount <= 1 : true;
}

// هل يُحفظ رد التنقل نسخةً للعمل دون اتصال؟ رد سليم من النطاق نفسه فقط، لا صفحة خطأ ولا رد معتم
function cacheableNavigation(res) {
  return !!res && res.ok === true && res.type === 'basic';
}

if (typeof self !== 'undefined' && typeof caches !== 'undefined' && typeof self.addEventListener === 'function') {
  const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
  const CACHE = `mi-leaders-${VERSION}`;

  self.addEventListener('install', (e) => {
    // لا تخطي للانتظار هنا: أول تثبيت يُفعَّل وحده (لا عامل قبله)، والتحديث ينتظر رسالة «حدّث»
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  });

  self.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.type !== 'SKIP_WAITING') return;
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => { if (skipWaitingFor(data, list.length)) return self.skipWaiting(); return undefined; }));
  });

  self.addEventListener('activate', (e) => {
    e.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(cachesToDelete(keys, CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener('fetch', (e) => {
    const req = e.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== location.origin || isRange(req)) return;

    // التنقل: الشبكة أولًا، ثم آخر نسخة سليمة عند الانقطاع
    if (req.mode === 'navigate') {
      e.respondWith(
        fetch(req)
          .then((res) => { if (cacheableNavigation(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return res; })
          .catch(() => caches.match('/')),
      );
      return;
    }

    // الأصول ذات البصمة في /assets/ و/fonts/ ثابتة: من المخزن أولًا، ولا يُخزَّن إلا ما يجتاز cacheableAsset
    if (inCachedDir(url.pathname)) {
      e.respondWith(
        caches.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (cacheableAsset(req, res, url.pathname)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })),
      );
      return;
    }

    // ملفات الهيكل المحفوظة عند التثبيت (الملف التعريفي والأيقونة): الشبكة أولًا، والمحفوظ عند الانقطاع. وما سواها يمر
    if (SHELL.includes(url.pathname)) e.respondWith(fetch(req).catch(() => caches.match(req)));
  });
}
