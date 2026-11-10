// ════════════════════════════════════════════════════════════════
// زر «المتابعة بحساب Google» بهوية المنصة
// ════════════════════════════════════════════════════════════════
// الشكل تصميمنا، والنقر يقع على زر Google الرسمي (Google Identity Services)
// موضوعًا شفافًا فوقه: فيبقى التحقق رسميًا وآمنًا كما تشترط Google، والمظهر بهويتنا.
// نافذة جوجل المنبثقة تعيد رمز هوية موقّعًا، والخادم يتحقق منه (auth.google).
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

const whenIdle = () => new Promise((ok) => (window.requestIdleCallback ? window.requestIdleCallback(() => ok(), { timeout: 2500 }) : setTimeout(ok, 600)));

// شعار Google الرسمي بألوانه (مسموح داخل زر مخصص وفق إرشادات علامة Google)
const G = (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

// الاسم الأول من رمز جوجل لرسالة الترحيب أثناء الانتقال (عرض فقط؛ التحقق على الخادم)
export const firstNameOf = (credential) => {
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    return String(p.given_name || p.name || '').split(' ')[0];
  } catch { return ''; }
};

export default function GoogleButton({ onCredential, disabled }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [state, setState] = useState('loading'); // loading | ready | failed

  useEffect(() => {
    let live = true;
    // مكتبة Google بعد أن تفرغ الصفحة من رسمها الأول، لا معه: الدخول بالبريد لا ينتظرها
    whenIdle().then(loadGsi).then(() => {
      if (!live || !box.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential), ux_mode: 'popup', locale: 'ar' });
      window.google.accounts.id.renderButton(box.current, { type: 'standard', size: 'large', width: Math.min(400, box.current.offsetWidth || 360), locale: 'ar' });
      setState('ready');
    }).catch(() => live && setState('failed'));
    return () => { live = false; };
  }, []);

  if (state === 'failed') return null; // بلا اتصال بجوجل يبقى الدخول بالبريد ومفتاح المرور
  return (
    <div className={`gbtn${state === 'ready' ? ' ready' : ''}${disabled ? ' busy' : ''}`}>
      <span className="gbtn-face" aria-hidden="true">
        <span className="gbtn-g">{G}</span>
        <span className="gbtn-label">المتابعة بحساب Google</span>
      </span>
      {/* زر Google الرسمي فوق التصميم بشفافية تامة: هو ما يتلقى النقر ولوحة المفاتيح */}
      <div ref={box} className="gbtn-hit" aria-label="المتابعة بحساب Google" />
    </div>
  );
}
