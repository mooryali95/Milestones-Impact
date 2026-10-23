// ════════════════════════════════════════════════════════════════
// تطبيق القادة — توجيه المشارك حسب موقعه في الرحلة
// ════════════════════════════════════════════════════════════════
// لا موجّه مسارات: الشاشة تُشتق من حالة المشارك على الخادم.
//   بلا جلسة          ← الدخول
//   الملف لم يكتمل    ← الملف الشخصي
//   القياس لم يُرسل   ← تحديد المستوى
//   غير ذلك           ← الرحلة
// المسار الوحيد في الرابط هو /verify القادم من بريد الدخول.
import React, { useCallback, useEffect, useState } from 'react';
import { call, session, setExpiredHandler } from './api.js';
import logo from './milestone-impact-inverted.svg';
import SignIn from './screens/SignIn.jsx';
import Profile from './screens/Profile.jsx';
import Assessment from './screens/Assessment.jsx';
import Journey from './screens/Journey.jsx';
import Handbook from './screens/Handbook.jsx';
import { JourneySkeleton } from './ui.jsx';

const stageDone = (me, key) => me?.journey?.find((s) => s.key === key)?.status === 'done';

export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState('home');   // home | profile | handbook
  const [verifyError, setVerifyError] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [install, setInstall] = useState(null);   // حدث التثبيت المؤجل من المتصفح

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
  else if (!me) screen = <SignIn onSignedIn={accept} initialError={verifyError} />;
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
