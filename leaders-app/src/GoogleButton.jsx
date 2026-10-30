// ════════════════════════════════════════════════════════════════
// زر «المتابعة بحساب Google» (Google Identity Services)
// ════════════════════════════════════════════════════════════════
// نافذة جوجل المنبثقة تعيد رمز هوية موقّعًا، والخادم يتحقق منه (auth.google).
// لا روابط رجوع ولا أسرار في المتصفح؛ معرّف العميل عام.
import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../../supabase/functions/_shared/sites.js';

const SRC = 'https://accounts.google.com/gsi/client';
let loading = null;
const loadGsi = () => (loading ||= new Promise((ok, fail) => {
  if (window.google?.accounts?.id) return ok();
  const s = document.createElement('script');
  s.src = SRC; s.async = true; s.onload = () => ok(); s.onerror = () => { loading = null; fail(new Error('gsi')); };
  document.head.appendChild(s);
}));

export default function GoogleButton({ onCredential, disabled }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadGsi().then(() => {
      if (!live || !box.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential), ux_mode: 'popup', locale: 'ar' });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: Math.min(360, box.current.offsetWidth || 320), locale: 'ar' });
    }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  if (failed) return null; // بلا اتصال بجوجل يبقى الدخول بالبريد ومفتاح المرور
  return <div ref={box} className={`google-btn${disabled ? ' is-busy' : ''}`} aria-label="المتابعة بحساب Google" />;
}
