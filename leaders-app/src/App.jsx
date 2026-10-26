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
const stageOpen = (me, key) => { const st = me?.journey?.find((s) => s.key === key)?.status; return !!st && st !== 'locked'; };

// أيقونات التنقل: خط واحد بسماكة واحدة، تأخذ لون النص
const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-6h4v6h4.5V10',
  handbook: 'M4 5.5C6.5 4.2 9.5 4.2 12 5.5v14c-2.5-1.3-5.5-1.3-8 0v-14ZM12 5.5c2.5-1.3 5.5-1.3 8 0v14c-2.5-1.3-5.5-1.3-8 0',
  lab: 'M9.5 3.5h5M10.5 3.5v5.5L5 18.5A1.5 1.5 0 0 0 6.3 20.5h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9V3.5M7.5 14.5h9',
  impact: 'M4 19.5h16M6.5 16V12M11 16V8.5M15.5 16v-5M20 5.5l-5 4-3.5-2.5L6 10.5',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
);

// التنقل الواحد للمنصة: تبويبات في الشريط العلوي على الحاسب والتابلت، وشريط سفلي على الهاتف
function Nav({ items, view, onGo, className }) {
  return (
    <nav className={className} aria-label="أقسام المنصة">
      {items.map((it) => (
        <button key={it.key} type="button" className="nav-item" aria-current={view === it.key ? 'page' : undefined} onClick={() => onGo(it.key)}>
          <Icon name={it.key} /><span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

// الحرف الأول من الاسم: الحروف العربية تتصل فيما بينها، فحرفان يُقرآن كلمة
const initials = (name = '') => name.trim().charAt(0);

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
  const hasLab = !!lab?.items?.length;
  // تغيير القسم يبدأ من أعلى الصفحة وينقل التركيز إلى المحتوى لقارئ الشاشة
  const go = useCallback((v) => {
    setView(v);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
  }, []);
  const openLab = (id = null) => { setLabOpen(id); go('lab'); };

  const logout = async () => {
    await call('logout');
    session.clear();
    try { localStorage.removeItem(LOGO_KEY); } catch { /* لا شيء محفوظ */ }
    setMe(null);
    setView('home');
  };

  // الأقسام المتاحة الآن فقط: الكتاب والأثر بعد الاعتماد، والمختبر متى فُتح، والأثر متى فُتحت مرحلته
  const inJourney = me && stageDone(me, 'profile') && stageDone(me, 'assessment') && !checkin;
  const approved = !!me?.profile?.approved;
  const navItems = inJourney ? [
    { key: 'home', label: 'رحلتي' },
    approved && { key: 'handbook', label: 'كتابي' },
    hasLab && { key: 'lab', label: 'المختبر' },
    approved && stageOpen(me, 'impact') && { key: 'impact', label: 'أثري' },
    { key: 'profile', label: 'ملفي' },
  ].filter(Boolean) : [];
  const navView = view === 'lab' && !hasLab ? 'home' : view;
  const onNav = (k) => (k === 'lab' ? openLab() : go(k));

  let screen;
  if (booting) screen = session.get() ? <JourneySkeleton /> : <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  else if (!me) screen = <SignIn onSignedIn={(r) => { setCheckin(null); accept(r); }} initialError={verifyError || (checkin ? 'سجّل دخولك أولًا، ثم امسح رمز الحضور مرة أخرى.' : '')} />;
  else if (checkin) screen = <CheckIn token={checkin} onDone={async () => { setCheckin(null); const r = await call('me'); if (r.success) accept(r); }} />;
  else if (!stageDone(me, 'profile') || view === 'profile') {
    screen = <Profile me={me} onSaved={(res) => { accept(res); go('home'); }} onboarding={!stageDone(me, 'profile')} onCancel={() => go('home')} />;
  } else if (!stageDone(me, 'assessment')) screen = <Assessment me={me} onSubmitted={accept} />;
  else if (view === 'lab' && hasLab) screen = <LabScreen items={lab.items} points={lab.points} open={labOpen} onOpen={setLabOpen} reload={loadLab} onBack={() => { setLabOpen(null); go('home'); }} />;
  else if (view === 'handbook' && me.profile?.approved) screen = <Handbook me={me} lab={lab?.items} onLab={openLab} onBack={() => go('home')} />;
  else if (view === 'impact' && me.profile?.approved) screen = <Impact me={me} onUpdate={accept} onBack={() => go('home')} />;
  else screen = <Journey me={me} onUpdate={accept} onEditProfile={() => go('profile')} onHandbook={() => go('handbook')} onImpact={() => go('impact')} lab={lab?.items} onLab={() => openLab()} />;

  return (
    <>
      <a className="skip-link" href="#main">تخطَّ إلى المحتوى</a>
      <header className="topbar" style={me?.org?.color ? { '--org': me.org.color } : undefined}>
        <div className="topbar-in">
          <img src={logo} alt="Milestone Impact" />
          {me?.org && <OrgMark org={me.org} />}
          <span className="tag">رحلة القادة</span>
          {navItems.length > 0 && <Nav className="nav-tabs" items={navItems} view={navView} onGo={onNav} />}
          <span className="spacer" />
          {install && <button className="link small install" onClick={doInstall}>ثبّت التطبيق</button>}
          {me && (
            <button className="who" title="ملفي وأجهزتي" aria-label={`ملفي: ${me.participant.full_name}`} onClick={() => go('profile')}>
              <span className="avatar" aria-hidden="true">{initials(me.participant.full_name)}</span>
              <span className="who-name">{me.participant.full_name}</span>
            </button>
          )}
          {me && <button className="link small logout" onClick={logout}>خروج</button>}
        </div>
      </header>
      {!online && <div className="offline-bar" role="status">أنت دون اتصال. ما تراه آخر نسخة محفوظة، وسيُحدَّث عند عودة الشبكة.</div>}
      <main id="main" tabIndex={-1} className={navItems.length ? 'with-tabbar' : undefined}>{screen}</main>
      <footer className={`foot${navItems.length ? ' with-tabbar' : ''}`}>© Milestone Impact. جميع الحقوق محفوظة، والمحتوى ملكية فكرية لـ MI.</footer>
      {navItems.length > 0 && <Nav className="tabbar" items={navItems} view={navView} onGo={onNav} />}
    </>
  );
}
