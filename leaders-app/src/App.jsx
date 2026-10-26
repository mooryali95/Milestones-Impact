// ════════════════════════════════════════════════════════════════
// تطبيق القادة — توجيه المشارك حسب موقعه في الرحلة
// ════════════════════════════════════════════════════════════════
// لا موجّه مسارات: الشاشة تُشتق من حالة المشارك على الخادم.
//   بلا جلسة          ← الدخول
//   الملف لم يكتمل    ← الملف الشخصي
//   القياس لم يُرسل   ← تحديد المستوى
//   غير ذلك           ← الرحلة
// المسارات في الرابط: /verify من بريد الدخول، و/org لمنسق الجهة، و/v/<الرقم> للتحقق من شهادة،
// و/rate?t= لتقدير المدير أو الزميل في القياس البعدي.
import React, { useCallback, useEffect, useState } from 'react';
import { call, session, setExpiredHandler } from './api.js';
import logo from './milestone-impact-inverted.svg';
import SignIn from './screens/SignIn.jsx';
import Profile from './screens/Profile.jsx';
import Assessment from './screens/Assessment.jsx';
import Journey from './screens/Journey.jsx';
import Handbook from './screens/Handbook.jsx';
import LabScreen from './screens/Lab.jsx';
import OrgPortal from './screens/OrgPortal.jsx';
import Verify from './screens/Verify.jsx';
import { CheckIn } from './screens/Activities.jsx';
import Impact from './screens/Impact.jsx';
import Rater from './screens/Rater.jsx';
import { JourneySkeleton } from './ui.jsx';

// هوية الجهة بجانب شعار Milestone: الشعار يُجلب مرة ويُحفظ على الجهاز بنسخته
const LOGO_KEY = 'mi_leaders_org_logo';
function OrgMark({ org }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!org?.logo_v) { setSrc(null); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(LOGO_KEY) || 'null');
      if (saved?.v === org.logo_v) { setSrc(saved.logo); return; }
    } catch { /* التخزين غير متاح: نجلبه */ }
    let live = true;
    call('org.logo').then((r) => {
      if (!live || !r.success || !r.logo) return;
      setSrc(r.logo);
      try { localStorage.setItem(LOGO_KEY, JSON.stringify({ v: org.logo_v, logo: r.logo })); } catch { /* يكفي العرض */ }
    });
    return () => { live = false; };
  }, [org?.logo_v]);
  if (!org) return null;
  return (
    <span className="org-mark" title={org.name}>
      {src ? <img src={src} alt={org.name} /> : <b>{org.short_name || org.name}</b>}
    </span>
  );
}

const stageDone = (me, key) => me?.journey?.find((s) => s.key === key)?.status === 'done';

// /org و/org/verify: بوابة منسق الجهة، بجلسة مستقلة عن المشارك
const isOrgPortal = () => location.pathname === '/org' || location.pathname.startsWith('/org/');

// /v/<الرقم>: التحقق العام من شهادة، بلا دخول
const isVerify = () => location.pathname === '/v' || location.pathname.startsWith('/v/');

export default function App() {
  if (isVerify()) return <Shell tag="التحقق من الشهادات"><Verify /></Shell>;
  if (location.pathname === '/rate') return <Shell tag="تقدير الأثر"><Rater /></Shell>;
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
  const [view, setView] = useState('home');   // home | profile | handbook | impact | lab
  const [lab, setLab] = useState(null);       // أدوات المختبر المفتوحة للمشارك، ونقاطه
  const [labOpen, setLabOpen] = useState(null);
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

  // المختبر قسم مستقل: يظهر مدخله متى فُتح للمشارك أو لجهته شيء منه
  const meId = me?.participant?.id;
  const loadLab = useCallback(async () => {
    const r = await call('lab.list');
    setLab(r.success ? { items: r.items, points: r.points } : null);
  }, []);
  useEffect(() => { if (meId) loadLab(); else setLab(null); }, [meId, loadLab]);
  const openLab = (id = null) => { setLabOpen(id); setView('lab'); window.scrollTo({ top: 0 }); };
  const hasLab = !!lab?.items?.length;

  const logout = async () => {
    await call('logout');
    session.clear();
    try { localStorage.removeItem(LOGO_KEY); } catch { /* لا شيء محفوظ */ }
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
  else if (view === 'lab' && hasLab) screen = <LabScreen items={lab.items} points={lab.points} open={labOpen} onOpen={setLabOpen} reload={loadLab} onBack={() => { setLabOpen(null); setView('home'); }} />;
  else if (view === 'handbook' && me.profile?.approved) screen = <Handbook me={me} lab={lab?.items} onLab={openLab} onBack={() => setView('home')} />;
  else if (view === 'impact' && me.profile?.approved) screen = <Impact me={me} onUpdate={accept} onBack={() => setView('home')} />;
  else screen = <Journey me={me} onUpdate={accept} onEditProfile={() => setView('profile')} onHandbook={() => setView('handbook')} onImpact={() => setView('impact')} lab={lab?.items} onLab={() => openLab()} />;

  return (
    <>
      <a className="skip-link" href="#main">تخطَّ إلى المحتوى</a>
      <header className="topbar" style={me?.org?.color ? { '--org': me.org.color } : undefined}>
        <div className="topbar-in">
          <img src={logo} alt="Milestone Impact" />
          {me?.org && <OrgMark org={me.org} />}
          <span className="tag">رحلة القادة</span>
          <span className="spacer" />
          {install && <button className="link small" onClick={doInstall}>ثبّت التطبيق</button>}
          {hasLab && <button className="link small" onClick={() => openLab()}>المختبر</button>}
          {me && <button className="link small who" title="ملفي وأجهزتي" onClick={() => setView('profile')}>{me.participant.full_name}</button>}
          {me && <button className="link small" onClick={logout}>خروج</button>}
        </div>
      </header>
      {!online && <div className="offline-bar" role="status">أنت دون اتصال. ما تراه آخر نسخة محفوظة، وسيُحدَّث عند عودة الشبكة.</div>}
      <main id="main" tabIndex={-1}>{screen}</main>
      <footer className="foot">© Milestone Impact. جميع الحقوق محفوظة، والمحتوى ملكية فكرية لـ MI.</footer>
    </>
  );
}
