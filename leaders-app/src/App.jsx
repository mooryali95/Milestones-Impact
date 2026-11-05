// ════════════════════════════════════════════════════════════════
// تطبيق القادة — توجيه المشارك حسب موقعه في الرحلة
// ════════════════════════════════════════════════════════════════
// لا موجّه مسارات: الشاشة تُشتق من حالة المشارك على الخادم.
//   بلا جلسة          ← الدخول
//   الملف لم يكتمل    ← الملف الشخصي
//   القياس لم يُرسل   ← تحديد المستوى
//   غير ذلك           ← الرحلة
// المسارات في الرابط: /verify من بريد الدخول، و/org لمنسق الجهة، و/v/<الرقم> للتحقق من شهادة،
// و/rate?t= لتقدير المدير أو الزميل في القياس البعدي، و/expert لطلب الانضمام إلى شبكة الخبراء، و/offer?t= لرد الخبير على طلب خدمة، و/x للوحة الخبير.
import React, { lazy, useCallback, useEffect, useState } from 'react';
import { KATON_ENABLED } from '../../supabase/functions/leaders-api/labels.js';
import { call, session, setExpiredHandler } from './api.js';
import logo from './milestone-impact-inverted.svg';
import SignIn from './screens/SignIn.jsx';
import { OnboardingRail, OnboardingWelcome, onboardingStep } from './Onboarding.jsx';
import { welcomeSeen } from './api.js';
import Profile from './screens/Profile.jsx';
import Assessment from './screens/Assessment.jsx';
import Journey from './screens/Journey.jsx';
const Handbook = lazy(() => import('./screens/Handbook.jsx'));
const LabScreen = lazy(() => import('./screens/Lab.jsx'));
const OrgPortal = lazy(() => import('./screens/OrgPortal.jsx'));
const Verify = lazy(() => import('./screens/Verify.jsx'));
import { CheckIn } from './screens/Activities.jsx';
const Impact = lazy(() => import('./screens/Impact.jsx'));
const Rater = lazy(() => import('./screens/Rater.jsx'));
const Sponsor = lazy(() => import('./screens/Sponsor.jsx'));
const Outcome = lazy(() => import('./screens/Outcome.jsx'));
const ExpertApply = lazy(() => import('./screens/ExpertApply.jsx'));
const ExpertOffer = lazy(() => import('./screens/ExpertOffer.jsx'));
const ExpertPortal = lazy(() => import('./screens/ExpertPortal.jsx'));
import RoleChoice from './RoleChoice.jsx';
import AccountSwitch from './AccountSwitch.jsx';
import Paywall from './screens/Paywall.jsx';
import { gateDone, impactOpen } from './gates.js';
import { clearAttribution } from './attribution.js';
import { UNEXPECTED_ERROR } from '../../supabase/functions/leaders-api/labels.js';
import SponsorNote from './SponsorNote.jsx';
const Capstone = lazy(() => import('./screens/Capstone.jsx'));
const Katon = lazy(() => import('./screens/Katon.jsx'));
const HallScreen = lazy(() => import('./screens/Hall.jsx'));
import LiveTour, { captureDemoLink, demoPending } from './LiveTour.jsx';
const Legal = lazy(() => import('./screens/Legal.jsx'));
import Consent from './Consent.jsx';
import { LEGAL_PATH } from '../../supabase/functions/leaders-api/labels.js';
import { ErrorBox, JourneySkeleton } from './ui.jsx';
// الشاشات الثقيلة أو النادرة تُحمَّل كسولًا (قطعة لكل منها) فتصغر قطعة الدخول؛ Suspense في main.jsx

// «كاتون» مخفي عن المشاركين حتى يُعاد تصميمه (المصدر الواحد: KATON_ENABLED، ويُستبعد معه من التقييم)
const SHOW_KATON = KATON_ENABLED;

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

// أيقونات التنقل: خط واحد بسماكة واحدة، تأخذ لون النص
const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-6h4v6h4.5V10',
  handbook: 'M4 5.5C6.5 4.2 9.5 4.2 12 5.5v14c-2.5-1.3-5.5-1.3-8 0v-14ZM12 5.5c2.5-1.3 5.5-1.3 8 0v14c-2.5-1.3-5.5-1.3-8 0',
  lab: 'M9.5 3.5h5M10.5 3.5v5.5L5 18.5A1.5 1.5 0 0 0 6.3 20.5h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9V3.5M7.5 14.5h9',
  capstone: 'M5 3.5h10l4 4v13H5v-17ZM15 3.5v4h4M8.5 12h7M8.5 15.5h7M8.5 8.5h3',
  katon: 'M4 6.5h16M4 12h10M4 17.5h7M17 14.5l2 2 3.5-4',
  hall: 'M3 20.5h18M5 20.5v-6.5h14v6.5M8 14V9.5M16 14V9.5M12 3.5 4 9.5h16L12 3.5Z',
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
        <button key={it.key} type="button" data-tour={`nav-${it.key}`} className={`nav-item${it.locked ? ' locked' : ''}`} aria-current={view === it.key ? 'page' : undefined}
          disabled={it.locked} title={it.locked || undefined} aria-label={it.locked ? `${it.label}: ${it.locked}` : undefined} onClick={() => onGo(it.key)}>
          <Icon name={it.key} /><span>{it.label}{it.locked && <i className="nav-lock" aria-hidden="true">🔒</i>}</span>
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
  if (location.pathname === '/sponsor') return <Shell tag="تأييد المبادرة"><Sponsor /></Shell>;
  if (location.pathname === '/outcome') return <Shell tag="تأكيد أثر المبادرة"><Outcome /></Shell>;
  if (location.pathname === '/expert') return <Shell tag="شبكة الخبراء"><ExpertApply /></Shell>;
  if (location.pathname === '/offer') return <Shell tag="طلب خدمة"><ExpertOffer /></Shell>;
  if (location.pathname === '/x') return <Shell tag="لوحة الخبير"><ExpertPortal /></Shell>;
  if (location.pathname === LEGAL_PATH.index || location.pathname.startsWith(`${LEGAL_PATH.index}/`)) return <Shell tag="الخصوصية والشروط"><Legal /></Shell>;
  return isOrgPortal() ? <Shell tag="لوحة الجهة"><OrgPortal /></Shell> : <Participant />;
}

// رابط الوثائق القانونية في كل تذييل: المشارك والمقيّم والراعي والخبير والمنسق
const LegalLink = () => <a className="link small" href={LEGAL_PATH.index}>الخصوصية والشروط</a>;

function Shell({ tag, children }) {
  return (
    <>
      <a className="skip-link" href="#main">تخطَّ إلى المحتوى</a>
      <header className="topbar"><div className="topbar-in"><img src={logo} alt="Milestone Impact" /><span className="tag">{tag}</span><span className="spacer" /></div></header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="foot">© Milestone Impact. جميع الحقوق محفوظة. <LegalLink /></footer>
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
  const [bootError, setBootError] = useState('');   // فشل جلب الرحلة والجلسة باقية: يُعرض بإعادة محاولة لا بشاشة الدخول
  const [linkChoice, setLinkChoice] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [install, setInstall] = useState(null);   // حدث التثبيت المؤجل من المتصفح
  // رمز حضور الورشة من مسح QR: /?checkin=...
  // رابط العرض من لوحة الإدارة: يُلتقط قبل أي شيء
  const [demo, setDemo] = useState(() => captureDemoLink() || demoPending());
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
    if (res?.token) { session.set(res.token); clearAttribution(); }
    if (res?.participant) setMe(res);
    // بعد الدخول تظهر الرحلة بتلاشٍ ناعم بدل القفزة من شاشة الانتقال
    if (res?.token) { document.body.classList.add('entering'); setTimeout(() => document.body.classList.remove('entering'), 700); }
  }, []);

  // الإقلاع: رابط البريد أو الجلسة المحفوظة. فشل الشبكة أو الخادم لا يُسقط الجلسة الصالحة
  // (كان يرمي إلى شاشة الدخول صامتًا فيطلب المشارك رمزًا جديدًا بلا داعٍ)
  const boot = useCallback(async () => {
    setBootError('');
    // رابط البريد: /verify?e=...&t=...
    if (location.pathname === '/verify') {
      const q = new URLSearchParams(location.search);
      history.replaceState(null, '', '/');
      const res = await call('auth.verify', { email: q.get('e'), link: q.get('t') });
      // بريد خبير أو منسق جهة يسجّل لأول مرة: وجهة لوحته أولًا، والمشاركة باختياره (الرابط يبقى صالحًا)
      if (res.success && res.choose_role) { setLinkChoice({ roles: res.roles, email: q.get('e'), link: q.get('t') }); setBooting(false); return; }
      if (res.success) accept(res);
      else setVerifyError(res.message);
      setBooting(false);
      return;
    }
    if (session.get()) {
      const res = await call('me');
      if (res.success) accept(res);
      else if (res.code === 'suspended') { session.clear(); setVerifyError(res.message); }
      else if (res.code !== 'session') setBootError(res.message || UNEXPECTED_ERROR);   // session: أزالها الحارس في call وأظهر الدخول برسالته
    }
    setBooting(false);
  }, [accept]);
  useEffect(() => {
    setExpiredHandler(() => { setMe(null); setView('home'); setVerifyError('انتهت جلستك. ادخل مرة أخرى.'); });
    boot();
  }, [boot]);

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

  // الأقسام المتاحة الآن فقط: الكتيب والمبادرة بعد الاعتماد، والمختبر متى فُتح، والأثر متى فُتحت مرحلته
  // الحق في البرنامج (دفع أو رعاية أو إعفاء): مصدره الخادم (me.access)، وغيابه يعني الدفع مطفأ
  const paidFor = (item) => !me?.access || !!me.access[item];
  const inJourney = me && gateDone(me, 'profile') && gateDone(me, 'assessment') && paidFor('program') && !checkin;
  // معالج البداية: خطوته من البوابات نفسها (Onboarding.jsx)؛ الرأس يظهر فوق شاشات القبول، والخطوة 4 بطاقة في الرحلة
  const [onbTick, setOnbTick] = useState(0);
  const onb = me && !checkin ? onboardingStep(me, { assessmentPaywall: !paidFor('assessment') }) : null;
  const rail = onb && onb.key !== 'next' && onbTick >= 0 ? <OnboardingRail step={onb} /> : null;
  const approved = !!me?.profile?.approved;
  const navItems = inJourney ? [
    { key: 'home', label: 'رحلتي' },
    // ما لم يُفتح بعد يظهر مقفلًا بسبب فتحه، فيعرف المشارك ما ينتظره ولا يظن المنصة أصغر مما هي
    { key: 'handbook', label: 'كتيبي', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    { key: 'capstone', label: 'مبادرتي', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    // «كاتون» مخفي حتى يُعاد تصميمه مع المالك (قرار 2026-11-03)
    SHOW_KATON && { key: 'katon', label: 'كاتون', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    { key: 'hall', label: 'القاعة', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    hasLab && { key: 'lab', label: 'المختبر' },
    { key: 'impact', label: 'أثري', ...(!(approved && impactOpen(me)) && { locked: 'يُفتح في مرحلة الأثر' }) },
    { key: 'profile', label: 'ملفي' },
  ].filter(Boolean) : [];
  const navView = view === 'lab' && !hasLab ? 'home' : view;
  const onNav = (k) => (k === 'lab' ? openLab() : go(k));

  let screen;
  if (booting) screen = session.get() ? <JourneySkeleton /> : <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  else if (!me && linkChoice) screen = (
    <div className="auth-wrap"><div className="auth card stack">
      <RoleChoice roles={linkChoice.roles} onParticipant={async () => {
        const r = await call('auth.verify', { email: linkChoice.email, link: linkChoice.link, confirm_new: true });
        setLinkChoice(null);
        if (r.success) accept(r); else setVerifyError(r.message);
      }} />
    </div></div>
  );
  else if (!me && bootError) screen = (
    <div className="page narrow stack">
      <ErrorBox message={bootError} onRetry={() => { setBooting(true); boot(); }} />
      <button className="link small" onClick={() => { session.clear(); setBootError(''); }}>ادخل بحساب آخر</button>
    </div>
  );
  else if (!me) screen = <SignIn onSignedIn={(r) => { setCheckin(null); accept(r); }} initialError={verifyError || (checkin ? 'سجّل دخولك أولًا، ثم امسح رمز الحضور مرة أخرى.' : '')} />;
  // من سبق تسجيله قبل نشر السياسة يوافق مرة واحدة (null = لم يوافق؛ غياب الحقل = العمود لم يُرحَّل بعد)
  else if (me.participant.consented_at === null && !me.participant.is_demo) screen = <Consent onAccepted={accept} />;
  else if (checkin) screen = <CheckIn token={checkin} onDone={async () => { setCheckin(null); const r = await call('me'); if (r.success) accept(r); }} />;
  else if (onb?.key === 'welcome') screen = <OnboardingWelcome me={me} step={onb} onStart={() => { welcomeSeen.set(true); setOnbTick((n) => n + 1); go('home'); }} />;
  else if (!gateDone(me, 'profile') || view === 'profile') {
    screen = <>{!gateDone(me, 'profile') && rail}<Profile me={me} onSaved={(res) => { accept(res); go('home'); }} onboarding={!gateDone(me, 'profile')} onCancel={() => go('home')} /></>;
  } else if (!gateDone(me, 'assessment') && !paidFor('assessment')) screen = <>{rail}<Paywall item="assessment" me={me} onUpdate={accept} /></>;
  else if (!gateDone(me, 'assessment')) screen = <>{rail}{me.access?.sponsor && <div className="page narrow" style={{ paddingBottom: 0 }}><SponsorNote access={me.access} /></div>}<Assessment me={me} onSubmitted={accept} /></>;
  else if (!paidFor('program')) screen = <Paywall item="program" me={me} onUpdate={accept} />;
  else if (view === 'lab' && hasLab) screen = <LabScreen items={lab.items} points={lab.points} open={labOpen} onOpen={setLabOpen} reload={loadLab} onBack={() => { setLabOpen(null); go('home'); }} />;
  else if (view === 'handbook' && me.profile?.approved) screen = <Handbook me={me} lab={lab?.items} onLab={openLab} onBack={() => go('home')} />;
  else if (SHOW_KATON && view === 'katon' && me.profile?.approved) screen = <Katon onBack={() => go('home')} />;
  else if (view === 'hall' && me.profile?.approved) screen = <HallScreen onBack={() => go('home')} />;
  else if (view === 'capstone' && me.profile?.approved) screen = <Capstone me={me} onEditProfile={() => go('profile')} onBack={() => go('home')} />;
  else if (view === 'impact' && me.profile?.approved) screen = <Impact me={me} onUpdate={accept} onBack={() => go('home')} />;
  else screen = <Journey me={me} onUpdate={accept} onEditProfile={() => go('profile')} onHandbook={() => go('handbook')} onImpact={() => go('impact')} onCapstone={() => go('capstone')} lab={lab?.items} onLab={() => openLab()} />;

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
          {me && <AccountSwitch here="participant" doors={me.switch_to} doSwitch={(to) => call('me.switch', { to })} />}
          {me && <button className="link small logout" onClick={logout}>خروج</button>}
        </div>
      </header>
      {!online && <div className="offline-bar" role="status">أنت دون اتصال. تحتاج اتصالًا لعرض رحلتك وحفظ ما تكتبه.</div>}
      <main id="main" tabIndex={-1} className={navItems.length ? 'with-tabbar' : undefined}>{screen}</main>
      <footer className={`foot${navItems.length ? ' with-tabbar' : ''}`}>© Milestone Impact <LegalLink /></footer>
      {!booting && (demo || me?.participant?.is_demo) && <LiveTour me={me} onAccept={(r) => { accept(r); setDemo(true); }} onGo={go} />}
      {navItems.length > 0 && <Nav className="tabbar" items={navItems} view={navView} onGo={onNav} />}
    </>
  );
}
