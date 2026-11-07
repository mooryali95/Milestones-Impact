// ════════════════════════════════════════════════════════════════
// التحقق البشري (Cloudflare Turnstile) قبل إرسال رمز الدخول
// ════════════════════════════════════════════════════════════════
// نسخة من leaders-app/src/Captcha.jsx لمصفوفة التأثير (D15 وD14). يظهر فقط حين يطلبه الخادم (code: captcha مع site_key)، فلا يُحمَّل شيء
// من خارج الموقع ما لم تفعّله الإدارة.
import React, { useEffect, useRef } from 'react';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;
const load = () => (loading ||= new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = SRC; s.async = true;
  s.onload = () => ok(window.turnstile);
  s.onerror = () => { loading = null; no(new Error('turnstile')); };
  document.head.appendChild(s);
}));

export default function Captcha({ siteKey, onToken, onError }) {
  const box = useRef(null);
  const cb = useRef({ onToken, onError });
  cb.current = { onToken, onError };
  useEffect(() => {
    let id = null; let gone = false;
    load().then((t) => {
      if (gone || !box.current) return;
      id = t.render(box.current, {
        sitekey: siteKey, language: 'ar',
        callback: (token) => cb.current.onToken(token),
        'error-callback': () => cb.current.onError?.(),
      });
    }).catch(() => cb.current.onError?.());
    return () => { gone = true; if (id != null) window.turnstile?.remove(id); };
  }, [siteKey]);
  return <div className="captcha" ref={box} />;
}
