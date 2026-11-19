// ════════════════════════════════════════════════════════════════
// رابط تجربة حساب العرض (تصور 2026-11-19): /#try=<رمز> يفتح جلسة حساب العرض لمن أُرسل له بلا رمز دخول
// ════════════════════════════════════════════════════════════════
// الرمز في جزء الرابط بعد # فلا يصل خادمًا ولا سجل وصول: تقرؤه الصفحة مرة ثم تزيله من العنوان، وتبدّله بجلسة بالفعل
// المفتوح demo.link-open. الرابط المنتهي أو الملغى أو الخاطئ يعرض رسالته الواضحة لا شاشة خطأ، وجلسة الرابط تحمل
// سطرًا ثابتًا يقول إن الحساب تجريبي مشترك (الشارة الكاملة في مرحلة تالية من التصور).
import React from 'react';

const HASH = /^#try=([A-Za-z0-9_-]{20,200})$/;

/** رمز رابط التجربة من العنوان، ويُزال منه. null إن لم يكن الرابط رابط تجربة */
export function captureTryLink() {
  const m = location.hash.match(HASH);
  if (!m) return null;
  history.replaceState(null, '', location.pathname);
  return m[1];
}

const TITLE = {
  link_expired: 'انتهت مدة رابط التجربة',
  link_revoked: 'أُلغي رابط التجربة',
  link_invalid: 'رابط التجربة غير صالح',
};
export const TRY_GONE = Object.keys(TITLE);
const ASK_AR = 'اطلب رابطًا جديدًا ممن أرسله لك.';

/** رسالة رابط لا يفتح: عنوان بحاله وسطر بما يفعله صاحبه، وزر إلى المنصة (حسابه إن كان داخلًا، أو شاشة الدخول) */
export function TryLinkGone({ gone, hasSession, onContinue, onRetry }) {
  const known = TITLE[gone.code];
  return (
    <div className="page narrow stack try-gone" role="status" data-testid="try-gone">
      <div className="card stack">
        <h1>{known || 'تعذّر فتح رابط التجربة'}</h1>
        <p>{known ? ASK_AR : (gone.message || 'حاول بعد قليل.')}</p>
        <div className="row">
          {!known && onRetry && <button className="btn" onClick={onRetry}>حاول مرة أخرى</button>}
          <button className={known ? 'btn' : 'btn ghost'} onClick={onContinue}>{hasSession ? 'تابع إلى حسابك' : 'افتح صفحة الدخول'}</button>
        </div>
      </div>
    </div>
  );
}

/** على الجهاز جلسة قائمة: الرابط لا يستبدلها بصمت. من أُرسل له رابط وهو داخل بحسابه يختار، فلا يخرجه رابط من حسابه دون علمه */
export function TryLinkAsk({ onOpen, onStay }) {
  return (
    <div className="page narrow stack try-gone" role="status" data-testid="try-ask">
      <div className="card stack">
        <h1>رابط تجربة</h1>
        <p>على هذا الجهاز جلسة قائمة. فتح الرابط يخرجك منها ويدخلك حسابًا تجريبيًا مشتركًا.</p>
        <div className="row">
          <button className="btn" onClick={onOpen}>افتح الحساب التجريبي</button>
          <button className="btn ghost" onClick={onStay}>ابقَ في حسابي</button>
        </div>
      </div>
    </div>
  );
}

/** سطر ثابت لجلسة بدأها رابط تجربة: يعرف من يجرّب أن الحساب تجريبي ومشترك */
export function DemoSharedBar() {
  return <div className="demo-shared-bar" role="note" data-testid="demo-shared-bar">حساب تجريبي مشترك: ما تفعله هنا للتجربة ولا يُحسب، وقد يراه غيرك ممن يجرّب.</div>;
}
