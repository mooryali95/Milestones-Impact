// ════════════════════════════════════════════════════════════════
// الدخول والتسجيل: بريد ← (اسم لبريد جديد) ← رمز أو رابط · أو مفتاح مرور
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { call } from '../api.js';

const RESEND_SECONDS = 45;

// رمز دعوة الجهة من الرابط (?org=...)، يُحفظ حتى يكتمل التسجيل ولو أُعيد تحميل الصفحة
function inviteCode() {
  try {
    const q = new URLSearchParams(location.search).get('org');
    if (q) sessionStorage.setItem('mi_leaders_org', q);
    return q || sessionStorage.getItem('mi_leaders_org') || '';
  } catch { return ''; }
}

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
  const [orgCode] = useState(inviteCode);

  useEffect(() => {
    if (!orgCode) return;
    call('org.info', { org: orgCode }).then((r) => { if (r.success) setOrg(r.org); });
  }, [orgCode]);

  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  const start = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const res = await call('auth.start', {
      email, full_name: step === 'name' ? name : undefined, phone: step === 'name' ? phone : undefined, org: org ? orgCode : undefined,
    });
    setBusy(false);
    if (!res.success) return setError(res.message);
    if (res.needs_name) return setStep('name');
    setStep('code'); setCode(''); setWait(RESEND_SECONDS);
  };

  const verify = async (value) => {
    setBusy(true); setError('');
    const res = await call('auth.verify', { email, code: value });
    setBusy(false);
    if (res.success) onSignedIn(res);
    else { setError(res.message); setCode(''); }
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
    setBusy(true);
    const res = await call('passkey.auth-verify', { response });
    setBusy(false);
    if (res.success) onSignedIn(res);
    else setError(res.message);
  };

  return (
    <div className="auth-wrap">
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
              <p className="muted">أدخل بريدك، وسنرسل لك رابطًا ورمزًا للدخول. لا كلمات مرور.</p>
            </div>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input className="input ltr" type="email" inputMode="email" autoComplete="username webauthn" required
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </label>
            {error && <div className="alert err">{error}</div>}
            <button className="btn block" disabled={busy || !email}>{busy ? 'لحظة…' : 'متابعة'}</button>
            {browserSupportsWebAuthn() && (
              <>
                <div className="divider">أو</div>
                <button type="button" className="btn ghost block" onClick={passkey} disabled={busy}>الدخول بمفتاح المرور</button>
              </>
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
      </div>
    </div>
  );
}
