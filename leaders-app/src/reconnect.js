// ════════════════════════════════════════════════════════════════
// صمود الإقلاع أمام الأعطال العابرة (تصور التحديث بلا أثر، المرحلة 3، البنود 2 إلى 4، ش9)
// ════════════════════════════════════════════════════════════════
// فشل me عند الفتح كان يُظهر شاشة خطأ كاملة («تعذّر الاتصال، تحقّق من الشبكة»)، طريقًا مسدودًا لا يعود منه التطبيق وحده،
// وزرها «ادخل بحساب آخر» يمسح جلسة صالحة. الآن: الإخفاق العابر بعد ميزانية الإعادة (20 ثانية في fetchRetry) يُظهر
// «جارٍ إعادة الاتصال…» ويعيد الإقلاع وحده بتراجع متصاعد، وفورًا عند عودة الاتصال (online) أو الرجوع إلى التبويب
// (visibilitychange). والجلسة لا تُمسح إلا بدخول ناجح بحساب آخر.

// ما يُعد عابرًا من ردود الإقلاع: الشبكة، والخادم المشغول، وخطأ الخادم الداخلي أو القاعدة. وما سواه رفض له رسالته
export const TRANSIENT_BOOT = new Set(['network', 'busy', 'internal', 'db_error', 'db_down']);
export const isTransient = (res) => !res?.success && TRANSIENT_BOOT.has(res?.code);

// انتظار إعادة الإقلاع n (من 0): يتضاعف من 3 ثوانٍ حتى دقيقة، بعشوائية في نصفه الأعلى (equal jitter) فلا يعود الجميع معًا
// ولا ينزل الانتظار عن نصف قيمته. كل إقلاع يسبقه أصلًا 20 ثانية من الإعادة داخل fetchRetry
export const REBOOT_BASE_MS = 3_000;
export const REBOOT_CAP_MS = 60_000;
export function rebootDelay(n, random = Math.random) {
  const ceil = Math.min(REBOOT_CAP_MS, REBOOT_BASE_MS * 2 ** Math.max(0, n));
  return Math.round(ceil / 2 + random() * (ceil / 2));
}

// نص الحالة: بلا اتصال على الجهاز، أو الخدمة غير متاحة لحظيًا
export function reconnectCopy(online) {
  return online === false
    ? { title: 'لا اتصال بالإنترنت', line: 'نكمل تلقائيًا حين يعود الاتصال.' }
    : { title: 'جارٍ إعادة الاتصال…', line: 'الخدمة غير متاحة لحظيًا، نعيد المحاولة تلقائيًا.' };
}

// إعادة الإقلاع تلقائيًا ما دام active: مؤقت بالتراجع، وفورًا عند online وعند الرجوع إلى التبويب. tries عدد الإخفاقات
// المتتالية (يزيد بعد كل إقلاع عابر)، وreboot يعيد وعدًا. بلا اتصال لا مؤقت: ينتظر حدث online
export function autoReboot({ active, tries, reboot, win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null, random = Math.random }) {
  if (!active || !win) return () => {};
  let busy = false;
  let timer = null;
  const run = () => {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    Promise.resolve().then(reboot).finally(() => { busy = false; });
  };
  const offline = () => win.navigator?.onLine === false;
  if (!offline()) timer = setTimeout(run, rebootDelay(tries, random));
  const onOnline = () => run();
  const onVisible = () => { if (doc?.visibilityState === 'visible' && !offline()) run(); };
  win.addEventListener('online', onOnline);
  doc?.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    win.removeEventListener('online', onOnline);
    doc?.removeEventListener('visibilitychange', onVisible);
  };
}
