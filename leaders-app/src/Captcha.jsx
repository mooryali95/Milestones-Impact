// ════════════════════════════════════════════════════════════════
// التحقق البشري (Cloudflare Turnstile) قبل إرسال رمز الدخول
// ════════════════════════════════════════════════════════════════
// يظهر فقط حين يطلبه الخادم (code: captcha مع site_key)، فلا يُحمَّل شيء
// من خارج الموقع ما لم تفعّله الإدارة. يعرض خطأه بنفسه: فشل التحميل غير
// فشل التحقق غير انتهاء المهلة (captcha.js)، ومعه زر يعيد المحاولة دون تحديث الصفحة.
import React, { useEffect, useRef, useState } from 'react';
import { CAPTCHA_RETRY, captchaMessage } from './captcha.js';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;
const load = () => (loading ||= new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = SRC; s.async = true;
  s.onload = () => (window.turnstile ? ok(window.turnstile) : (loading = null, no(new Error('turnstile'))));
  s.onerror = () => { loading = null; s.remove(); no(new Error('turnstile')); };
  document.head.appendChild(s);
}));

export default function Captcha({ siteKey, onToken }) {
  const box = useRef(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const widget = useRef(null);
  const [fail, setFail] = useState(null);   // load | challenge | timeout
  const [round, setRound] = useState(0);    // إعادة التحميل بعد فشله

  useEffect(() => {
    let gone = false;
    setFail(null);
    load().then((t) => {
      if (gone || !box.current) return;
      widget.current = t.render(box.current, {
        sitekey: siteKey, language: 'ar',
        callback: (token) => { setFail(null); cb.current(token); },
        // true: الأداة لا تعيد المحاولة وحدها، فالزر هو من يعيدها وتظهر الرسالة الصحيحة
        'error-callback': () => { setFail('challenge'); return true; },
        'timeout-callback': () => setFail('timeout'),
      });
    }).catch(() => { if (!gone) setFail('load'); });
    return () => { gone = true; if (widget.current != null) window.turnstile?.remove(widget.current); widget.current = null; };
  }, [siteKey, round]);

  const retry = () => {
    setFail(null);
    if (widget.current != null && window.turnstile) window.turnstile.reset(widget.current);
    else setRound((n) => n + 1);
  };

  return (
    <div className="stack">
      <div className="captcha" ref={box} />
      {fail && (
        <div className="alert err" role="alert">
          {captchaMessage(fail)}{' '}
          <button type="button" className="link" onClick={retry}>{CAPTCHA_RETRY}</button>
        </div>
      )}
    </div>
  );
}
