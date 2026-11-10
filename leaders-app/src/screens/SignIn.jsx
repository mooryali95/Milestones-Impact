// ════════════════════════════════════════════════════════════════
// الدخول والتسجيل: بريد ← رمز أو رابط ← (اسم لبريد جديد) · أو مفتاح مرور
// ════════════════════════════════════════════════════════════════
// الاسم يُطلب بعد إثبات ملكية البريد لا قبله، فالشاشة الأولى ترد بالشيء نفسه لكل بريد مسجلًا كان أو جديدًا
// ولا يُعرف منها من سُجّل في البرنامج (التدقيق 2026-11-10). pendingLink: رابط البريد فُتح (/verify) ويحتاج
// اختيار الوجهة أو الاسم، فتبدأ الشاشة منه.
import React, { useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { call } from '../api.js';
import { attribution } from '../attribution.js';
import Captcha from '../Captcha.jsx';
import { captchaGate } from '../captcha.js';
import RoleChoice from '../RoleChoice.jsx';
import OtherDoors from '../Doors.jsx';
import GoogleButton, { firstNameOf } from '../GoogleButton.jsx';
import logo from '../milestone-impact-inverted.svg';
import IntroVideo from '../IntroVideo.jsx';
import { LEGAL_PATH } from '../../../supabase/functions/leaders-api/labels.js';

const RESEND_SECONDS = 45;
// إشعار الخصوصية والشروط قبل زر التسجيل: إكمال التسجيل بعده موافقة تُسجَّل مع نسخة السياسة
const ConsentNote = ({ action }) => (
  <p className="small muted consent-note">
    بضغطك «{action}» توافق على <a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> و<a className="link" href={LEGAL_PATH.terms} target="_blank" rel="noopener noreferrer">شروط برنامج القادة</a>.
  </p>
);

export default function SignIn({ onSignedIn, initialError, pendingLink }) {
  const [step, setStep] = useState(pendingLink?.needsName ? 'name' : 'email');   // email | code | name | google
  const [email, setEmail] = useState(pendingLink?.email || '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [pendingGoogle, setPendingGoogle] = useState(null);
  const [roles, setRoles] = useState(null);   // أدوار البريد الأخرى بعد التحقق: يختار صاحبه وجهته
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);
  const [org, setOrg] = useState(null);
  const [captchaKey, setCaptchaKey] = useState(null);
  // إثبات ملكية البريد (الرمز أو رابط البريد) يُحفظ لخطوة الاسم: الخادم لا يستهلكه حتى يُنشأ الحساب
  const [proof, setProof] = useState(pendingLink ? { link: pendingLink.link } : null);
  const [via] = useState(attribution);
  // شاشة الانتقال: تظهر فور اكتمال الدخول من جهة المستخدم، وتبقى حتى تُفتح رحلته
  const [entering, setEntering] = useState(null);

  // اسم الجهة يظهر إن جاء الزائر برابطها أو من موقعها
  useEffect(() => {
    // اسم الجهة يظهر لرمز رابطها فقط؛ الموقع المُحيل يُرسل للتحليل ولا يربط بجهة
    if (!via.org) return;
    call('org.info', { org: via.org }).then((r) => { if (r.success) setOrg(r.org); });
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
    const res = await call('auth.start', { email, ...via, captcha });
    setBusy(false);
    // الخادم يطلب التحقق البشري: تظهر الأداة، وتعيد الطلب وحدها حين تكتمل
    if (res.code === 'captcha') { const g = captchaGate(res, captcha); setCaptchaKey(g.box); return setError(g.error); }
    setCaptchaKey(null);
    if (!res.success) return setError(res.message);
    setStep('code'); setCode(''); setWait(RESEND_SECONDS);
  };

  // pr: { code } أو { link }. extra: confirm_new بعد اختيار المشاركة، وملف التسجيل الجديد من خطوة الاسم
  const verify = async (pr, extra = {}) => {
    setBusy(true); setError(''); setEntering({ name: (extra.full_name || '').split(' ')[0] });
    const res = await call('auth.verify', { email, ...pr, ...extra });
    setBusy(false);
    if (res.success && res.choose_role) {
      setEntering(null);
      setRoles({ list: res.roles, go: () => { setRoles(null); verify(pr, { ...extra, confirm_new: true }); } });
      return;
    }
    if (res.success) return onSignedIn(res);
    setEntering(null);
    if (res.code === 'needs_name') { setProof(pr); setStep('name'); return; }
    setError(res.message);
    if (step === 'code') setCode('');
  };

  const onCode = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) verify({ code: digits });
  };

  // خطوة الاسم: الإثبات نفسه مع الملف، فيُنشأ الحساب ويُستهلك الرمز معًا
  const register = (e) => {
    e.preventDefault();
    verify(proof, {
      confirm_new: true, full_name: name.trim(), phone: phone.trim() || undefined,
      sponsor_code: sponsor.trim() || undefined,
    });
  };
  // رابط البريد لبريد خبير أو منسق جهة يسجّل لأول مرة: وجهة لوحته أولًا، والمشاركة باختياره (الرابط يبقى صالحًا)
  useEffect(() => {
    if (pendingLink?.roles?.length) setRoles({ list: pendingLink.roles, go: () => { setRoles(null); verify({ link: pendingLink.link }, { confirm_new: true }); } });
  }, []);
  const restart = () => { setStep('email'); setError(''); setProof(null); setCode(''); setName(''); setPhone(''); };

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

  const google = async (credential, confirm = false) => {
    setError(''); setEntering({ name: firstNameOf(credential) });
    const res = await call('auth.google', { credential, ...via, ...(confirm ? { confirm_new: true, sponsor_code: sponsor.trim() || undefined } : {}) });
    if (res.success && res.confirm_new) {
      setEntering(null); setPendingGoogle({ credential, name: res.name });
      if (res.roles?.length) setRoles({ list: res.roles, go: () => { setRoles(null); setStep('google'); } });
      else setStep('google');
      return;
    }
    if (res.success) return onSignedIn(res);
    setEntering(null); setError(res.message);
  };

  // لحساب جديد فقط: من له لوحة خبير أو جهة لا يحتاج حساب مشارك، ورمز الجهة الراعية اختياري
  const newcomerExtras = (
    <>
      {!org && (
        <label className="field">
          <span>رمز الجهة الراعية <em>(اختياري، إن رشّحتك جهة للبرنامج)</em></span>
          <input className="input ltr" autoComplete="off" spellCheck={false} maxLength={40} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="ABC-2026" />
        </label>
      )}
      <div className="role-note small">
        <b>خبير أو منسق جهة؟</b> لا تحتاج حساب مشارك. ادخل من <a className="link" href="/x">لوحة الخبير</a> أو <a className="link" href="/org">لوحة الجهة</a>.
      </div>
    </>
  );

  const captchaBox = captchaKey ? (
    <div className="stack">
      <p className="small muted">تحقّق سريع قبل إرسال الرمز.</p>
      <Captcha key={captchaKey.n} siteKey={captchaKey.site} onToken={(t) => start(null, t)} />
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
        {roles && <RoleChoice roles={roles.list} busy={busy} onParticipant={roles.go} />}
        {!roles && <>
        {org && (
          <div className="org-ribbon" style={org.color ? { '--org': org.color } : undefined}>
            <span className="org-dot" aria-hidden="true" />
            <div><small>تسجيل عبر</small><b>{org.name}</b><small>برعاية جهتك: الرسوم مغطاة ضمن مقاعد عقدها ومدته</small></div>
          </div>
        )}
        {step === 'email' && (
          <form className="stack" data-tour="doors" onSubmit={start}>
            <div>
              <p className="eyebrow">برنامج إدارة المشروعات للقادة</p>
              <h1>ابدأ رحلتك القيادية</h1>
              <p className="muted">ادخل بحسابك في Google بضغطة، أو ببريدك ونرسل لك رمزًا. لا كلمات مرور.</p>
              <IntroVideo />
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
          <form className="stack" data-tour="doors" onSubmit={register}>
            <div>
              <p className="eyebrow">تسجيل جديد</p>
              <h1>أهلًا بك في البرنامج</h1>
              <p className="muted">تحقّقنا من بريدك <b className="ltr">{email}</b>. خطوة أخيرة لإنشاء حسابك.</p>
            </div>
            <label className="field">
              <span>الاسم الكامل</span>
              <input className="input" autoComplete="name" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>رقم الجوال <em>(يمكنك إكماله في ملفك)</em></span>
              <input className="input ltr" type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
            </label>
            {newcomerExtras}
            {error && <div className="alert err">{error}</div>}
            <ConsentNote action="أنشئ حسابي" />
            <button className="btn block" disabled={busy || name.trim().length < 3}>{busy ? 'لحظة…' : 'أنشئ حسابي'}</button>
            <button type="button" className="link small" onClick={restart}>ابدأ من جديد</button>
          </form>
        )}

        {step === 'google' && pendingGoogle && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); google(pendingGoogle.credential, true); }}>
            <div>
              <p className="eyebrow">تسجيل جديد</p>
              <h1>{pendingGoogle.name ? `أهلًا ${pendingGoogle.name.split(' ')[0]}` : 'أهلًا بك في البرنامج'}</h1>
              <p className="muted">ننشئ لك حساب مشارك في برنامج القادة.</p>
            </div>
            {newcomerExtras}
            {error && <div className="alert err">{error}</div>}
            <ConsentNote action="أنشئ حسابي مشاركًا" />
            <button className="btn block" disabled={busy || !!entering}>أنشئ حسابي مشاركًا</button>
            <button type="button" className="link small" onClick={() => { setStep('email'); setPendingGoogle(null); setError(''); }}>رجوع</button>
          </form>
        )}

        {step === 'code' && (
          <div className="stack" data-tour="doors">
            <div>
              <p className="eyebrow">تحقّق من بريدك</p>
              <h1>أرسلنا لك رابطًا ورمزًا</h1>
              <p className="muted">أرسلناهما إلى <b className="ltr">{email}</b>. اضغط الرابط، أو أدخل الرمز هنا.</p>
            </div>
            <input ref={codeRef} className="input code-input" inputMode="numeric" autoComplete="one-time-code"
              aria-label="رمز التحقق" value={code} onChange={(e) => onCode(e.target.value)} placeholder="••••••" disabled={busy} />
            {error && <div className="alert err">{error}</div>}
            <div className="row between small">
              <button className="link" onClick={restart}>بريد آخر</button>
              {wait ? <span className="muted">إعادة الإرسال بعد {wait} ثانية</span>
                : <button className="link" onClick={start} disabled={busy}>أعد إرسال الرمز</button>}
            </div>
            <p className="muted small">لم يصل؟ تفقّد مجلد الرسائل غير المرغوبة.</p>
          </div>
        )}
        {captchaBox}
        </>}
        {!roles && step === 'email' && <OtherDoors here="participant" />}
      </div>
    </div>
  );
}
