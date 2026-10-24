// ════════════════════════════════════════════════════════════════
// تطبيق القادة — توجيه المشارك حسب موقعه في الرحلة
// ════════════════════════════════════════════════════════════════
// لا موجّه مسارات: الشاشة تُشتق من حالة المشارك على الخادم.
//   بلا جلسة          ← الدخول
//   الملف لم يكتمل    ← الملف الشخصي
//   القياس لم يُرسل   ← تحديد المستوى
//   غير ذلك           ← الرحلة
// المسارات في الرابط: /verify من بريد الدخول، و/org لمنسق الجهة، و/v/<الرقم> للتحقق من شهادة.
import React, { useCallback, useEffect, useState } from 'react';
import { call, session, setExpiredHandler } from './api.js';
import logo from './milestone-impact-inverted.svg';
import SignIn from './screens/SignIn.jsx';
import Profile from './screens/Profile.jsx';
import Assessment from './screens/Assessment.jsx';
import Journey from './screens/Journey.jsx';
import Handbook from './screens/Handbook.jsx';
import OrgPortal from './screens/OrgPortal.jsx';
import Verify from './screens/Verify.jsx';
import { CheckIn } from './screens/Activities.jsx';
import { JourneySkeleton } from './ui.jsx';

const stageDone = (me, key) => me?.journey?.find((s) => s.key === key)?.status === 'done';

// /org و/org/verify: بوابة منسق الجهة، بجلسة مستقلة عن المشارك
const isOrgPortal = () => location.pathname === '/org' || location.pathname.startsWith('/org/');

// /v/<الرقم>: التحقق العام من شهادة، بلا دخول
const isVerify = () => location.pathname === '/v' || location.pathname.startsWith('/v/');

export default function App() {
  if (isVerify()) return <Shell tag="التحقق من الشهادات"><Verify /></Shell>;
  return isOrgPortal() ? <Shell tag="لوحة الجهة"><OrgPortal /></Shell> : <Participant />;
}

function Shell({ tag, children }) {
  return (
    <>
      <a className="skip-link" href="#main">تخطَّ إلى المحتوى</a>
      <header className="topbar"><div className="topbar-in"><img src={logo} alt="Milestone Impact" /><span className="tag">{tag}</span><span className="spacer" /></div></header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="foot">© Milestone Impact. جميع الحقوق محفوظة.</footer>
    </>
  );
}

function Participant() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState('home');   // home | profile | handbook
  const [verifyError, setVerifyError] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [install, setInstall] = useState(null);   // حدث التثبيت المؤجل من المتصفح
  // رمز حضور الورشة من مسح QR: /?checkin=...
  const [checkin, setCheckin] = useState(() => {
    const t = new URLSearchParams(location.search).get('checkin');
    if (t) history.replaceState(null, '', '/');
    return t;
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const offer = (e) => { e.preventDefault(); setInstall(e); };
    const installed = () => setInstall(null);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  const doInstall = async () => { install.prompt(); await install.userChoice; setInstall(null); };

  const accept = useCallback((res) => {
    if (res?.token) session.set(res.token);
    if (res?.participant) setMe(res);
  }, []);

  useEffect(() => {
    setExpiredHandler(() => setMe(null));
    (async () => {
      // رابط البريد: /verify?e=...&t=...
      if (location.pathname === '/verify') {
        const q = new URLSearchParams(location.search);
        history.replaceState(null, '', '/');
        const res = await call('auth.verify', { email: q.get('e'), link: q.get('t') });
        if (res.success) accept(res);
        else setVerifyError(res.message);
        setBooting(false);
        return;
      }
      if (session.get()) {
        const res = await call('me');
        if (res.success) accept(res);
      }
      setBooting(false);
    })();
  }, [accept]);

  const logout = async () => {
    await call('logout');
    session.clear();
    setMe(null);
    setView('home');
  };

  let screen;
  if (booting) screen = session.get() ? <JourneySkeleton /> : <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  else if (!me) screen = <SignIn onSignedIn={(r) => { setCheckin(null); accept(r); }} initialError={verifyError || (checkin ? 'سجّل دخولك أولًا، ثم امسح رمز الحضور مرة أخرى.' : '')} />;
  else if (checkin) screen = <CheckIn token={checkin} onDone={async () => { setCheckin(null); const r = await call('me'); if (r.success) accept(r); }} />;
  else if (!stageDone(me, 'profile') || view === 'profile') {
    screen = <Profile me={me} onSaved={(res) => { accept(res); setView('home'); }} onboarding={!stageDone(me, 'profile')} onCancel={() => setView('home')} />;
  } else if (!stageDone(me, 'assessment')) screen = <Assessment me={me} onSubmitted={accept} />;
  else if (view === 'handbook' && me.profile?.approved) screen = <Handbook me={me} onBack={() => setView('home')} />;
  else screen = <Journey me={me} onUpdate={accept} onEditProfile={() => setView('profile')} onHandbook={() => setView('handbook')} />;

  return (
    <>
      <a className="skip-link" href="#main">تخطَّ إلى المحتوى</a>
      <header className="topbar">
        <div className="topbar-in">
          <img src={logo} alt="Milestone Impact" />
          <span className="tag">رحلة القادة</span>
          <span className="spacer" />
          {install && <button className="link small" onClick={doInstall}>ثبّت التطبيق</button>}
          {me && <span className="who">{me.participant.full_name}</span>}
          {me && <button className="link small" onClick={logout}>خروج</button>}
        </div>
      </header>
      {!online && <div className="offline-bar" role="status">أنت دون اتصال. ما تراه آخر نسخة محفوظة، وسيُحدَّث عند عودة الشبكة.</div>}
      <main id="main" tabIndex={-1}>{screen}</main>
      <footer className="foot">© Milestone Impact. جميع الحقوق محفوظة، والمحتوى ملكية فكرية لـ MI.</footer>
    </>
  );
}
