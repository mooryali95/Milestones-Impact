// ════════════════════════════════════════════════════════════════
// الدخول: البريد ← رمز (تطبيق المصادقة أو البريد)، أو مفتاح المرور
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';
import Ico from '../../../shared/ui/Ico.jsx';
import { call, validEmail } from '../api.js';
import { passkeyCancelled, passkeyGet, passkeySupported } from '../passkey.js';
import { codeDigits } from '../../../supabase/functions/leaders-api/logic.js';
import EmailInput from '../../../shared/ui/EmailInput.jsx';

const LOGO = '/assets/milestone-impact-inverted.svg';
const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' };
// مفتاح المرور: مفتاح برأس دائري، رمزه المعتاد في واجهات الدخول
const PasskeyIcon = () => (
  <svg {...svg}><circle cx="8" cy="8" r="4" /><path d="M10.8 10.8 20 20M16.5 16.5l2-2M14 14l1.6-1.6" /></svg>
);
const LockIcon = () => (
  <svg {...svg} width="14" height="14"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
const VALUES = [
  [<svg {...svg} key="p"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></svg>, 'ملفات المشاركين ورحلاتهم'],
  [<svg {...svg} key="g"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></svg>, 'البرامج والدفعات والجلسات'],
  [<svg {...svg} key="i"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>, 'قياس الأثر ومتابعته'],
];
const Err = ({ msg }) => (msg ? <div className="login-error show" role="alert">{msg}</div> : null);

// مهلة إعادة إرسال الرمز، وهي مهلة الخادم نفسها (OTP_COOLDOWN_MS في admin-api): قبلها يرد 429
const RESEND_WAIT = 60;

// notice: سبب الوصول إلى الشاشة (انتهاء الجلسة)، وinitialEmail: بريد من انتهت جلسته
export default function Login({ onSignedIn, notice = '', initialEmail = '' }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // رد الخادم على الإرسال كما هو: لا يرسل رمز البريد لمن فعّل تطبيق المصادقة أو مفتاح المرور وحده،
  // فلا تقول الواجهة «تم الإرسال» (تدقيق الجاهزية admin-core-7)
  const [info, setInfo] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

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
    setInfo(d.message || '');
    setWait(RESEND_WAIT);
    setStep('code');
  };

  const resendCode = async () => {
    if (busy || wait) return;
    setBusy('resend'); setError(''); setInfo('');
    const d = await call('login-send', { email: email.trim() });
    setBusy('');
    if (d.success) { setInfo(d.message || ''); setWait(RESEND_WAIT); } else setError(d.message);
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
      <aside className="login-left" aria-label="لوحة الإدارة الموحّدة">
        <div className="login-left-top">
          <img className="login-logo" src={LOGO} alt="Milestone Impact" width="176" height="80" />
        </div>
        <div className="login-left-mid">
          <h1 className="login-heading">لوحة الإدارة الموحّدة</h1>
          <p className="login-sub-heading">المشاركون، والبرامج، والأثر في مكان واحد</p>
          <ul className="login-values">
            {VALUES.map(([icon, text]) => (
              <li key={text}><span className="login-value-ico" aria-hidden="true">{icon}</span>{text}</li>
            ))}
          </ul>
        </div>
        <div className="login-left-bottom">
          <p className="login-footnote" dir="rtl">بدعم من منظومة و <bdi dir="ltr">Sunk Value</bdi></p>
          <p className="login-footnote login-footnote-en" dir="ltr" lang="en">Milestone Impact</p>
        </div>
      </aside>

      <section className="login-right" aria-label="دخول الإدارة">
        <div className="login-form-wrap">
          {step === 'email' ? (
            <form onSubmit={sendEmail} noValidate>
              <h2 className="login-form-title">دخول الإدارة</h2>
              <p className="login-form-sub">أدخل بريدك فيصلك رمز دخول</p>
              {notice && <div className="login-notice" role="alert">{notice}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="loginEmail">البريد الإلكتروني</label>
                <EmailInput className="form-input" type="email" id="loginEmail" placeholder="your@email.com" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <button className="login-btn" type="submit" disabled={!!busy}>{busy === 'send' ? 'جارٍ إرسال الرمز...' : 'أرسل رمز الدخول'}</button>
              {passkeySupported() && (
                <>
                  <div className="login-or">أو</div>
                  <button className="passkey-login-btn" type="button" onClick={withPasskey} disabled={!!busy}><PasskeyIcon /> {busy === 'passkey' ? 'بانتظار مفتاح المرور...' : 'الدخول بمفتاح المرور'}</button>
                </>
              )}
              <Err msg={error} />
              <p className="login-trust"><LockIcon /> دخول آمن بلا كلمة مرور</p>
              <details className="login-help">
                <summary>تعذّر الدخول؟</summary>
                <p>تأكد أن البريد هو المسجّل لك في لوحة الإدارة، وابحث عن رسالة الرمز في البريد الوارد ومجلد الرسائل غير المرغوبة. إن فعّلت تطبيق المصادقة فالرمز فيه. وإن فقدت مفتاح المرور أو تطبيق المصادقة فاطلب الاستعادة من شاشة الرمز بعد إدخال بريدك.</p>
              </details>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <h2 className="login-form-title">أدخل الرمز</h2>
              <p className="login-form-sub">أدخل الرمز من تطبيق المصادقة إن فعّلته، وإلا فالرمز الذي وصل بريدك <bdi dir="ltr">{email.trim()}</bdi>. إن لم تجده فانظر في مجلد الرسائل غير المرغوبة.</p>
              {info && <div className="login-notice" role="status">{info}</div>}
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
              <button className="send-code-btn" type="button" onClick={resendCode} disabled={!!busy || wait > 0}>
                {busy === 'resend' ? 'جارٍ الإرسال...' : wait > 0 ? `إعادة إرسال رمز البريد بعد ${wait} ثانية` : 'أعد إرسال رمز البريد ←'}
              </button>
              <button className="login-btn" type="submit" disabled={!!busy} style={{ marginTop: 14 }}>{busy === 'verify' ? 'جارٍ التحقق...' : 'تأكيد الدخول'}</button>
              <Err msg={error} />
              <div style={{ textAlign: 'center', marginTop: 14, display: 'grid', gap: 8, justifyItems: 'center' }}>
                <button type="button" className="btn-ghost-small" onClick={() => { setStep('email'); setCode(''); setError(''); setInfo(''); }}>← تغيير البريد الإلكتروني</button>
                <button type="button" className="btn-ghost-small" disabled={!!busy} onClick={async () => {
                  setBusy('recover'); setError(''); setInfo('');
                  const r = await call('recovery-request', { email });
                  setBusy(''); setError(r.message || '');
                }}>فقدت مفتاح المرور أو تطبيق المصادقة؟</button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
