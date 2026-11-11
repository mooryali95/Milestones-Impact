// ════════════════════════════════════════════════════════════════
// الدخول: البريد ← رمز (تطبيق المصادقة أو البريد)، أو مفتاح المرور
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';
import Ico from '../../../shared/ui/Ico.jsx';
import { call, validEmail } from '../api.js';
import { passkeyCancelled, passkeyGet, passkeySupported } from '../passkey.js';
import { useUI } from '../ui.jsx';
import { codeDigits } from '../../../supabase/functions/leaders-api/logic.js';

const LOGO = '/assets/milestone-impact-inverted.svg';
const Err = ({ msg }) => (msg ? <div className="login-error show" role="alert">{msg}</div> : null);

export default function Login({ onSignedIn }) {
  const { toast } = useUI();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const codeRef = useRef(null);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  const sendEmail = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setError('');
    const v = email.trim();
    if (!validEmail(v)) return setError('يرجى إدخال بريد إلكتروني صحيح');
    setBusy('send');
    const d = await call('login-send', { email: v });
    setBusy('');
    if (!d.success) return setError(d.message || 'البريد غير مسجّل');
    setStep('code');
  };

  const resendCode = async () => {
    setBusy('resend');
    const d = await call('login-send', { email: email.trim() });
    setBusy('');
    if (d.success) toast('✅ تم إرسال الرمز إلى بريدك'); else setError(d.message);
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setError('');
    if (!/^\d{6}$/.test(code.trim())) return setError('الرمز 6 أرقام');
    setBusy('verify');
    const d = await call('login-verify', { email: email.trim(), code: code.trim() });
    setBusy('');
    if (!d.success || !d.user || !d.token) {
      setCode('');
      codeRef.current?.focus();
      return setError(d.message || 'الرمز غير صحيح أو منتهي الصلاحية');
    }
    onSignedIn(d.token, { ...d.user, email: d.user.email || email.trim() });
  };

  const withPasskey = async () => {
    if (busy) return;
    setError('');
    setBusy('passkey');
    try {
      const o = await call('passkey-login-options');
      if (!o.success) throw new Error(o.message);
      const response = await passkeyGet(o.options);
      const d = await call('passkey-login-verify', { response });
      if (!d.success || !d.token) throw new Error(d.message || 'تعذّر الدخول');
      onSignedIn(d.token, d.user);
    } catch (err) {
      if (!passkeyCancelled(err)) setError(err.message || 'تعذّر الدخول بمفتاح المرور');
    } finally { setBusy(''); }
  };

  return (
    <div id="screen-login">
      <div className="login-left">
        <div className="login-left-top">
          <div className="mi-logo">
            <img className="mi-logo-img" src={LOGO} alt="Milestone Impact" width="132" height="60" />
            <div className="mi-logo-divider" />
            <div className="mi-logo-badge">لوحة الإدارة</div>
          </div>
        </div>
        <div className="login-left-mid">
          <div className="login-eyebrow">منصة الإدارة</div>
          <div className="login-heading">لوحة الإدارة<br /><em>الموحّدة</em></div>
          <div className="login-sub-heading">منظومة Milestone Impact</div>
        </div>
        <div className="login-left-bottom">
          <div className="login-footnote">Milestone Impact · بدعم من منظومة و Sunk Value</div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-wrap">
          {step === 'email' ? (
            <form onSubmit={sendEmail} noValidate>
              <div className="login-form-eyebrow">دخول المدراء</div>
              <div className="login-form-title">مرحباً بك</div>
              <div className="login-form-sub">أدخل بريدك الإلكتروني للمتابعة</div>
              <div className="form-group">
                <label className="form-label" htmlFor="loginEmail">البريد الإلكتروني</label>
                <input className="form-input" type="email" id="loginEmail" placeholder="your@email.com" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <button className="login-btn" type="submit" disabled={!!busy}>{busy === 'send' ? 'جارٍ التحقق...' : 'متابعة'}</button>
              {passkeySupported() && (
                <>
                  <div className="login-or">أو</div>
                  <button className="passkey-login-btn" type="button" onClick={withPasskey} disabled={!!busy}><Ico name="key" /> الدخول بمفتاح المرور</button>
                </>
              )}
              <Err msg={error} />
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <div className="login-form-eyebrow">Verification</div>
              <div className="login-form-title">أدخل الرمز</div>
              <div className="login-form-sub">أدخل رمز المصادقة أو رمز البريد</div>
              <div className="form-group">
                <label className="form-label" htmlFor="loginCode">الرمز المكوّن من 6 أرقام</label>
                <input ref={codeRef} className="form-input code-input" type="text" id="loginCode" placeholder="• • • • • •"
                  maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(codeDigits(e.target.value))} />
              </div>
              <div className="code-hint">
                <span>يقبل:</span>
                <span className="code-hint-badge totp"><Ico name="lock" /> TOTP — تطبيق المصادقة</span>
                <span className="code-hint-badge otp">✉️ OTP — البريد الإلكتروني</span>
              </div>
              <button className="send-code-btn" type="button" onClick={resendCode} disabled={!!busy}>
                {busy === 'resend' ? 'جارٍ الإرسال...' : 'إرسال رمز لبريدي الإلكتروني ←'}
              </button>
              <button className="login-btn" type="submit" disabled={!!busy} style={{ marginTop: 14 }}>{busy === 'verify' ? 'جارٍ التحقق...' : 'تأكيد الدخول'}</button>
              <Err msg={error} />
              <div style={{ textAlign: 'center', marginTop: 14, display: 'grid', gap: 8, justifyItems: 'center' }}>
                <button type="button" className="btn-ghost-small" onClick={() => { setStep('email'); setCode(''); setError(''); }}>← تغيير البريد الإلكتروني</button>
                <button type="button" className="btn-ghost-small" disabled={!!busy} onClick={async () => {
                  setBusy('recover'); setError('');
                  const r = await call('recovery-request', { email });
                  setBusy(''); setError(r.message || '');
                }}>فقدت مفتاح المرور أو تطبيق المصادقة؟</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
