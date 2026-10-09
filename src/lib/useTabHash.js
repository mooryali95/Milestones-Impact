import { useEffect, useRef } from 'react';

// ════════════════════════════════════════════════════════════════
// useTabHash — ربط التبويب المعروض بعنوان الصفحة
// ════════════════════════════════════════════════════════════════
// كان التبويب حالةً في الذاكرة وحدها، فترتّب على ذلك ثلاثة أمور:
//   • زرّ الرجوع في الجوّال يخرج من التطبيق بدل أن يعود للتبويب السابق
//   • تحديث الصفحة يعيدك إلى المصفوفة مهما كنت تقرأ
//   • لا سبيل لإرسال رابط يفتح على تبويب بعينه
//
// هذا ليس موجِّهاً (router): الشاشات — الهبوط والتسجيل والإدارة —
// تبقى حالةً كما هي، لأن أكثرها خلف جلسة ولا معنى لعنوان يفتحها.
// المربوط هو التبويبات وحدها داخل الشاشة الرئيسية، وهي موضع المشكلة.
//
// أول كتابة replaceState لا pushState: لو دفعناها لصار الرجوع من
// التبويب الأول يغيّر العنوان بلا أي أثر مرئي — والشاشة ليست مربوطة.

const readHash = () => {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  } catch {
    // هاش مشوّه الترميز — نعامله كأن لا هاش
    return '';
  }
};

export default function useTabHash({ tab, setTab, allowed, enabled }) {
  const adopted = useRef(false);
  const wroteOnce = useRef(false);
  // تبويبٌ اعتُمد من الرابط ولم يصل بعدُ إلى الحالة. تأثير الكتابة يعمل
  // في التصيير نفسه الذي طلب فيه الاعتماد setTab، فيرى tab القديم —
  // ولولا هذا المرجع لكتب الافتراضيّ فوق الرابط المشترَك ثم دفع الصحيح.
  const pendingAdopt = useRef(null);
  // هل دخلنا الشاشة الرئيسية من قبل؟ يميّز «الخروج منها» عن «لم ندخلها بعد».
  const everEnabled = useRef(false);
  if (enabled) everEnabled.current = true;

  // allowed تُبنى في كل تصيير؛ نثبّتها في مرجع كي لا تتكرّر التأثيرات.
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  // ── 1. اعتماد التبويب من العنوان، مرة واحدة عند دخول الشاشة ──
  useEffect(() => {
    if (!enabled || adopted.current) return;
    const fromUrl = readHash();
    if (fromUrl && allowedRef.current.includes(fromUrl)) {
      pendingAdopt.current = fromUrl;
      // الرابط صحيح أصلاً، فهو بمنزلة كتابةٍ تمّت: التبديل التالي يدفع
      // لا يستبدل، وإلا محا أوّلُ تبديل المدخلَ الذي فُتح عليه الرابط.
      wroteOnce.current = true;
      setTab(fromUrl);
    }
    // تبويب غير متاح (كالتقرير قبل ثلاثة مواعيد) أو اسم لا وجود له:
    // تأثير الكتابة أدناه يعمل في هذا التصيير نفسه ويستبدل الهاش الكاذب
    // بالمعروض فعلاً — عنوانٌ كاذب أسوأ من لا عنوان. لا نصحّحه هنا كي
    // تبقى الكتابة في موضع واحد.
    adopted.current = true;
  }, [enabled, setTab, tab]);

  // ── 2. كتابة التبويب الحالي في العنوان ──
  useEffect(() => {
    if (!enabled || !adopted.current) return;
    if (pendingAdopt.current) {
      // ما زلنا في تصيير ما قبل الاعتماد: لا نكتب فوق الرابط الذي نقرأ منه.
      if (pendingAdopt.current !== tab) return;
      pendingAdopt.current = null;
    }
    const target = `#/${tab}`;
    if (window.location.hash === target) return;
    if (wroteOnce.current) window.history.pushState(null, '', target);
    else window.history.replaceState(null, '', target);
    wroteOnce.current = true;
  }, [tab, enabled]);

  // ── 3. زرّ الرجوع ──
  useEffect(() => {
    if (!enabled) return;
    const onPop = () => {
      const t = readHash();
      if (t && allowedRef.current.includes(t)) setTab(t);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled, setTab]);

  // ── 4. مغادرة الشاشة (خروج) تمسح العنوان وتعيد الضبط ──
  // شرط everEnabled ضروري: عند التحديث تبدأ الشاشة "splash" ثم تستعيد
  // الجلسة "main" بعد لحظة. بدونه يمسح هذا التأثير الهاش قبل أن يقرأه
  // الاعتماد — فيعود المستخدم إلى المصفوفة مهما كان التبويب في الرابط.
  useEffect(() => {
    if (enabled || !everEnabled.current) return;
    adopted.current = false;
    wroteOnce.current = false;
    pendingAdopt.current = null;
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [enabled]);
}
