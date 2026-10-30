// ════════════════════════════════════════════════════════════════
// الدخول والتسجيل: بريد ← (اسم لبريد جديد) ← رمز أو رابط · أو مفتاح مرور
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { call } from '../api.js';
import { attribution } from '../attribution.js';
import Captcha from '../Captcha.jsx';
import GoogleButton, { firstNameOf } from '../GoogleButton.jsx';
import logo from '../milestone-impact-inverted.svg';

const RESEND_SECONDS = 45;

export default function SignIn({ onSignedIn, initialError }) {
  const [step, setStep] = useState('email');   // email | name | code
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);
  const [org, setOrg] = useState(null);
  const [captchaKey, setCaptchaKey] = useState(null);
  const [via] = useState(attribution);
  // شاشة الانتقال: تظهر فور اكتمال الدخول من جهة المستخدم، وتبقى حتى تُفتح رحلته
  const [entering, setEntering] = useState(null);

  // اسم الجهة يظهر إن جاء الزائر برابطها أو من موقعها
  useEffect(() => {
    if (!via.org && !via.ref) return;
    call('org.info', { org: via.org, ref: via.ref }).then((r) => { if (r.success) setOrg(r.org); });
  }, [via]);

  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  const start = async (e, captcha) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const res = await call('auth.start', {
      email, full_name: step === 'name' ? name : undefined, phone: step === 'name' ? phone : undefined, ...via, captcha,
    });
    setBusy(false);
    // الخادم يطلب التحقق البشري: تظهر الأداة، وتعيد الطلب وحدها حين تكتمل
    if (res.code === 'captcha') { setCaptchaKey(res.site_key || ''); return setError(res.site_key ? '' : res.message); }
    setCaptchaKey(null);
    if (!res.success) return setError(res.message);
    if (res.needs_name) return setStep('name');
    setStep('code'); setCode(''); setWait(RESEND_SECONDS);
  };

  const verify = async (value) => {
    setBusy(true); setError(''); setEntering({ name: name.split(' ')[0] || '' });
    const res = await call('auth.verify', { email, code: value });
    setBusy(false);
    if (res.success) return onSignedIn(res);
    setEntering(null); setError(res.message); setCode('');
  };

  const onCode = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) verify(digits);
  };

  const passkey = async () => {
    setError('');
    const opt = await call('passkey.auth-options');
    if (!opt.success) return setError(opt.message);
    let response;
    try { response = await startAuthentication({ optionsJSON: opt.options }); }
    catch { return setError('لم يكتمل الدخول بمفتاح المرور. جرّب مرة أخرى أو ادخل بالبريد.'); }
    setBusy(true); setEntering({ name: '' });
    const res = await call('passkey.auth-verify', { response });
    setBusy(false);
    if (res.success) return onSignedIn(res);
    setEntering(null); setError(res.message);
  };

  const google = async (credential) => {
    setError(''); setEntering({ name: firstNameOf(credential) });
    const res = await call('auth.google', { credential, ...via });
    if (res.success) return onSignedIn(res);
    setEntering(null); setError(res.message);
  };

  const captchaBox = captchaKey ? (
    <div className="stack">
      <p className="small muted">تحقق سريع قبل إرسال الرمز.</p>
      <Captcha siteKey={captchaKey} onToken={(t) => start(null, t)} onError={() => setError('تعذّر تحميل أداة التحقق. حدّث الصفحة وحاول مرة أخرى.')} />
    </div>
  ) : null;

  return (
    <div className="auth-wrap">
      {entering && (
        <div className="enter-screen" role="status" aria-live="polite">
          <img src={logo} alt="Milestone Impact" className="enter-logo" />
          <span className="enter-ring" aria-hidden="true" />
          <p>{entering.name ? `أهلًا ${entering.name}، نجهّز رحلتك…` : 'نجهّز رحلتك…'}</p>
        </div>
      )}
      <div className="auth card stack">
        {org && (
          <div className="org-ribbon" style={org.color ? { '--org': org.color } : undefined}>
            <span className="org-dot" aria-hidden="true" />
            <div><small>تسجيل عبر</small><b>{org.name}</b></div>
          </div>
        )}
        {step === 'email' && (
          <form className="stack" onSubmit={start}>
            <div>
              <p className="eyebrow">برنامج إدارة المشروعات للقادة</p>
              <h1>ابدأ رحلتك القيادية</h1>
              <p className="muted">ادخل بحسابك في Google بضغطة، أو ببريدك ونرسل لك رمزًا. لا كلمات مرور.</p>
            </div>
            <GoogleButton onCredential={google} disabled={busy || !!entering} />
            <div className="divider">أو بالبريد</div>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input className="input ltr" type="email" inputMode="email" autoComplete="username webauthn" required
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </label>
            {error && <div className="alert err">{error}</div>}
            <button className="btn block" disabled={busy || !email}>{busy ? 'لحظة…' : 'متابعة'}</button>
            {browserSupportsWebAuthn() && (
              <button type="button" className="btn ghost block" onClick={passkey} disabled={busy}>الدخول بمفتاح المرور</button>
            )}
          </form>
        )}

        {step === 'name' && (
          <form className="stack" onSubmit={start}>
            <div>
              <p className="eyebrow">تسجيل جديد</p>
              <h1>أهلًا بك في البرنامج</h1>
              <p className="muted">خطوة واحدة قبل إرسال رابط التأكيد إلى <b className="ltr">{email}</b></p>
            </div>
            <label className="field">
              <span>الاسم الكامل</span>
              <input className="input" autoComplete="name" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>رقم الجوال <em>(اختياري الآن)</em></span>
              <input className="input ltr" type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
            </label>
            {error && <div className="alert err">{error}</div>}
            <button className="btn block" disabled={busy || name.trim().length < 3}>{busy ? 'لحظة…' : 'أرسل رابط التأكيد'}</button>
            <button type="button" className="link small" onClick={() => { setStep('email'); setError(''); }}>تغيير البريد</button>
          </form>
        )}

        {step === 'code' && (
          <div className="stack">
            <div>
              <p className="eyebrow">تحقّق من بريدك</p>
              <h1>أرسلنا لك رابطًا ورمزًا</h1>
              <p className="muted">إلى <b className="ltr">{email}</b>. اضغط الرابط في البريد، أو أدخل الرمز هنا.</p>
            </div>
            <input ref={codeRef} className="input code-input" inputMode="numeric" autoComplete="one-time-code"
              aria-label="رمز التحقق" value={code} onChange={(e) => onCode(e.target.value)} placeholder="••••••" disabled={busy} />
            {error && <div className="alert err">{error}</div>}
            <div className="row between small">
              <button className="link" onClick={() => { setStep('email'); setError(''); }}>بريد آخر</button>
              {wait ? <span className="muted">إعادة الإرسال بعد {wait} ث</span>
                : <button className="link" onClick={start} disabled={busy}>أعد إرسال الرمز</button>}
            </div>
            <p className="muted small">لم يصل؟ تفقّد مجلد الرسائل غير المرغوبة.</p>
          </div>
        )}
        {captchaBox}
      </div>
    </div>
  );
}
