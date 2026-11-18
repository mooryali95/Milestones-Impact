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
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Ico from './Ico.jsx';
import { flagsOf, shownView } from './features.js';
import { bootPreload, call, session, setExpiredHandler } from './api.js';
import { askSignOut } from './SignOutDialog.jsx';
import logo from './milestone-impact-inverted.svg';
import SignIn from './screens/SignIn.jsx';
import { OnboardingRail, OnboardingWelcome, onboardingStep } from './Onboarding.jsx';
import { tabFromSearch } from './deeplink.js';
import { lazyView, noteView } from './reload-view.js';
import { welcomeSeen } from './api.js';
import Profile from './screens/Profile.jsx';
import MyData from './screens/MyData.jsx';
import Assessment from './screens/Assessment.jsx';
import Journey from './screens/Journey.jsx';
const Handbook = lazyView(() => import('./screens/Handbook.jsx'));
const LabScreen = lazyView(() => import('./screens/Lab.jsx'));
const OrgPortal = lazyView(() => import('./screens/OrgPortal.jsx'));
const Verify = lazyView(() => import('./screens/Verify.jsx'));
import { CheckIn } from './screens/Activities.jsx';
import { checkinKeep, receiptFor, signInNote } from './checkin.js';
const Impact = lazyView(() => import('./screens/Impact.jsx'));
const Feedback360 = lazyView(() => import('./screens/Feedback360.jsx'));
const Feedback360Entry = lazyView(() => import('./screens/Feedback360.jsx').then((m) => ({ default: m.Feedback360Entry })));
const Rater = lazyView(() => import('./screens/Rater.jsx'));
const Sponsor = lazyView(() => import('./screens/Sponsor.jsx'));
const SharedInitiative = lazyView(() => import('./screens/SharedInitiative.jsx'));
const Outcome = lazyView(() => import('./screens/Outcome.jsx'));
const ExpertApply = lazyView(() => import('./screens/ExpertApply.jsx'));
const ExpertOffer = lazyView(() => import('./screens/ExpertOffer.jsx'));
const ExpertPortal = lazyView(() => import('./screens/ExpertPortal.jsx'));
import AccountSwitch from './AccountSwitch.jsx';
import Paywall, { AwaitingApproval, seatHold, SponsorshipPending } from './screens/Paywall.jsx';
import { gateDone, hasAccess, impactOpen } from './gates.js';
import { clearAttribution } from './attribution.js';
import { UNEXPECTED_ERROR } from '../../supabase/functions/leaders-api/labels.js';
import SponsorNote from './SponsorNote.jsx';
const Capstone = lazyView(() => import('./screens/Capstone.jsx'));
const Katon = lazyView(() => import('./screens/Katon.jsx'));
const HallScreen = lazyView(() => import('./screens/Hall.jsx'));
import LiveTour, { captureDemoLink, demoPending } from './LiveTour.jsx';
const Legal = lazyView(() => import('./screens/Legal.jsx'));
import Consent, { PolicyBanner } from './Consent.jsx';
import { LEGAL_PATH } from '../../supabase/functions/leaders-api/labels.js';
import { ErrorBox, JourneySkeleton } from './ui.jsx';
import { autoReboot, isTransient, reconnectCopy } from './reconnect.js';
import { lastJourney, savedAtAr, STAGE_STATE_AR } from './last-journey.js';
import { PHASES } from './labels.js';
import { SectionBoundary } from './ErrorBoundary.jsx';
import { useModalFocus } from '../../shared/ui/modal-focus.js';
// الشاشات الثقيلة أو النادرة تُحمَّل كسولًا (قطعة لكل منها) فتصغر قطعة الدخول؛ Suspense في main.jsx
// lazyView (reload-view.js): ملف قسم حذفه نشر أحدث يُعاد بمحاولة ثانية ثم إعادة تحميل واحدة إلى القسم المطلوب


const SectionLoading = () => <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;

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
  // القسم المقفل يقول سبب قفله عند لمسه: الزر المعطّل صامت على الهاتف، وtitle لا يظهر باللمس
  const [hint, setHint] = useState('');
  useEffect(() => { if (!hint) return undefined; const t = setTimeout(() => setHint(''), 4000); return () => clearTimeout(t); }, [hint]);
  return (
    <nav className={className} aria-label="أقسام المنصة">
      {hint && <p className="nav-hint" role="status">{hint}</p>}
      {items.map((it) => (
        <button key={it.key} type="button" data-tour={`nav-${it.key}`} className={`nav-item${it.locked ? ' locked' : ''}`} aria-current={view === it.key ? 'page' : undefined}
          aria-disabled={it.locked ? true : undefined} title={it.locked || undefined} aria-label={it.locked ? `${it.label}: ${it.locked}` : undefined}
          onClick={() => (it.locked ? setHint(`«${it.label}» ${it.locked}`) : onGo(it.key))}>
          <Icon name={it.key} /><span>{it.label}{it.locked && <i className="nav-lock" aria-hidden="true"><Ico name="lock" size="12" /></i>}</span>
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
  // حبس التركيز في كل نافذة aria-modal من مكان واحد مع لوحة الإدارة (shared/ui/modal-focus.js)، ومنها نوافذ الكتاب الأم
  // في لوحة الخبير («اقتراح تعديل» والتعليقات): يُركَّب قبل اختيار البوابة فيشمل البوابات كلها
  useModalFocus();
  if (isVerify()) return <Shell tag="التحقق من الشهادات"><Verify /></Shell>;
  if (location.pathname === '/rate') return <Shell tag="تقدير الأثر" back={false}><Rater /></Shell>;
  if (location.pathname === '/sponsor') return <Shell tag="تأييد المبادرة" back={false}><Sponsor /></Shell>;
  // وثيقة مبادرة مشاركة برابط خاص من صاحبها (Share.jsx)، بلا حساب
  if (location.pathname === '/i') return <Shell tag="وثيقة مبادرة" back={false}><SharedInitiative /></Shell>;
  if (location.pathname === '/outcome') return <Shell tag="تأكيد أثر المبادرة" back={false}><Outcome /></Shell>;
  if (location.pathname === '/expert') return <Shell tag="شبكة الخبراء"><ExpertApply /></Shell>;
  if (location.pathname === '/offer') return <Shell tag="طلب خدمة"><ExpertOffer /></Shell>;
  if (location.pathname === '/x') return <Shell tag="لوحة الخبير" home="/x"><ExpertPortal /></Shell>;
  if (location.pathname === LEGAL_PATH.index || location.pathname.startsWith(`${LEGAL_PATH.index}/`)) return <Shell tag="الخصوصية والشروط"><Legal /></Shell>;
  if (isOrgPortal()) return <Shell tag="لوحة الجهة" home="/org"><OrgPortal /></Shell>;
  // رابط لا تعرفه المنصة: صفحة تقول ذلك وتدل على الرئيسية، بدل صفحة الدخول تحت عنوان خاطئ
  if (!PARTICIPANT_PATHS.includes(location.pathname)) return <Shell tag="صفحة غير موجودة"><NotFound /></Shell>;
  return <Participant />;
}

// مسارات تطبيق المشارك نفسه: الرئيسية، ورابط الدخول من البريد
// رمز الحضور الممسوح قبل الدخول: إيصاله يُحفظ في الجهاز (checkin.js)، فيُسجَّل الحضور بعد الدخول ولو فُتح رابط البريد في تبويب آخر
const PARTICIPANT_PATHS = ['/', '/verify', '/index.html'];

function NotFound() {
  return (
    <div className="page narrow">
      <section className="card stack" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>هذه الصفحة غير موجودة</h1>
        <p className="muted">قد يكون الرابط ناقصًا أو قديمًا. إن وصلك في رسالة فانسخه كاملًا وجرّب مرة أخرى.</p>
        <div className="row" style={{ justifyContent: 'center' }}><a className="btn" href="/">بوابة المشاركين</a></div>
        <p className="small"><a className="link" href="/expert">بوابة الخبراء</a> · <a className="link" href="/org">بوابة الجهات</a></p>
      </section>
    </div>
  );
}

// رابط الوثائق القانونية في كل تذييل: المشارك والمقيّم والراعي والخبير والمنسق
const LegalLink = () => <a className="link small" href={LEGAL_PATH.index}>الخصوصية والشروط</a>;

// الرجوع من الصفحات المستقلة (طلب الخبير، لوحة الخبير، لوحة الجهة، الوثائق، التحقق من شهادة): من جاء من داخل المنصة
// يعود إلى حيث كان، ومن فتح الرابط مباشرة يذهب إلى رئيسيتها. بلا هذا لا مخرج من الصفحة إلا زر المتصفح.
// ownHome: لوحة لها رئيسيتها (الجهة والخبير): «رجوع» لمن جاء من داخل المنصة وحده، ولا «الرئيسية» إلى دخول المشارك
function BackLink({ ownHome = false }) {
  const inside = typeof document !== 'undefined' && document.referrer.startsWith(location.origin) && history.length > 1;
  if (ownHome && !inside) return null;
  return (
    <a className="topbar-back" href="/" onClick={(e) => { if (inside) { e.preventDefault(); history.back(); } }}>
      <span aria-hidden="true">→</span> {inside ? 'رجوع' : 'الرئيسية'}
    </a>
  );
}

// back=false لصفحات الرمز التي تصل أصحابها بالبريد (المقيّم، والراعي، وتأكيد الأثر): ليسوا مشاركين،
// ورئيسية المنصة صفحة دخول المشارك فلا تعنيهم
// home: البوابة التي لها رئيسيتها (لوحة الجهة /org، ولوحة الخبير /x): الشعار يعيد إليها، ولا «رجوع» يقود إلى دخول
// المشارك، فهي ليست صفحته (التدقيق 2026-11-10، البند 8.4)
function Shell({ tag, back = true, home = null, children }) {
  // عنوان التبويب يسمّي الصفحة: «لوحة الخبير · رحلة القادة» بدل عنوان واحد لكل الصفحات
  useEffect(() => { document.title = `${tag} · رحلة القادة`; }, [tag]);
  return (
    <>
      <a className="skip-link" href="#main">تخطَّ إلى المحتوى</a>
      <header className="topbar"><div className="topbar-in">
        {home ? <a className="topbar-logo" href={home} aria-label={`Milestone Impact: ${tag}`}><img src={logo} alt="" /></a>
          : back ? <a className="topbar-logo" href="/" aria-label="Milestone Impact: الرئيسية"><img src={logo} alt="" /></a> : <img src={logo} alt="Milestone Impact" />}
        <span className="tag">{tag}</span><span className="spacer" />{back && <BackLink ownHome={!!home} />}
      </div></header>
      {/* البوابات المستقلة (الخبير والجهة والمقيّم...) قسم واحد: خطؤها لا يُسقط الترويسة ولا التذييل */}
      <main id="main" tabIndex={-1}><SectionBoundary key={tag} onHome={home ? () => { location.href = home; } : null} homeLabel="الرئيسية">{children}</SectionBoundary></main>
      <footer className="foot">© Milestone Impact. جميع الحقوق محفوظة. <LegalLink /></footer>
    </>
  );
}

// «جارٍ إعادة الاتصال…» أو «لا اتصال بالإنترنت»: حالة لا خطأ، والإعادة تلقائية، والزر يعجّلها
// working: إعادة تلقائية جارية الآن، فالزر معطل بـ«جارٍ المحاولة…» بدل ضغطة لا أثر لها. code رمز آخر إخفاق (الشبكة أو الخادم)
// آخر ملخص رحلة معروف (last-journey.js، المرحلة 3 البند 5): المراحل وحالها ونسبة الإنجاز كما حُفظت في آخر فتح ناجح، بسطر
// «آخر ما عُرف، للقراءة فقط» ووقته. لا زر فيه ولا رابط: الأفعال كلها تنتظر عودة الاتصال
function LastKnown({ summary }) {
  if (!summary?.stages?.length) return null;
  return (
    <section className="card stack last-known" aria-label="آخر ما عُرف من رحلتك" data-testid="last-known">
      <div className="row last-known-head">
        <b>رحلتك</b>
        <span className="spacer" />
        <span className="small muted">{summary.progress}% من الرحلة</span>
      </div>
      <p className="small muted last-known-note">آخر ما عُرف، للقراءة فقط · {savedAtAr(summary.at)}</p>
      {PHASES.map((ph) => {
        const list = summary.stages.filter((st) => st.p === ph.key);
        if (!list.length) return null;
        return (
          <div key={ph.key} className="last-known-phase">
            <span className="small muted">{ph.title}</span>
            <ul>
              {list.map((st) => <li key={st.k} className={`lk-${st.s}`}><span>{st.t}</span><span className="small muted">{STAGE_STATE_AR[st.s]}</span></li>)}
            </ul>
          </div>
        );
      })}
      <p className="small muted">الإجراءات تعود حين يعود الاتصال.</p>
    </section>
  );
}

function Reconnecting({ online, code, working, onRetry, onOther, last }) {
  const t = reconnectCopy(online, code);
  const [tapped, setTapped] = useState(false);
  const busy = tapped || working;
  const now = async () => { setTapped(true); try { await onRetry(); } finally { setTapped(false); } };
  return (
    <div className="page narrow stack reconnect" role="status" aria-live="polite">
      <div className="card stack reconnect-card">
        {online !== false && <div className="spinner" aria-hidden="true" />}
        <h2>{t.title}</h2>
        <p className="muted">{t.line}</p>
        <div className="row">
          <button className="btn sm ghost" onClick={now} disabled={busy}>{busy ? 'جارٍ المحاولة…' : 'حاول الآن'}</button>
        </div>
      </div>
      <LastKnown summary={last} />
      <button className="link small" onClick={onOther}>ادخل بحساب آخر</button>
    </div>
  );
}

function Participant() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  // home | profile | handbook | capstone | hall | impact | lab؛ ورابط البريد /?tab=profile يفتح قسمه مباشرة (deeplink.js)
  const [view, setView] = useState(() => {
    const link = tabFromSearch(location.search);
    if (!link) return 'home';
    history.replaceState(null, '', location.pathname + link.search + location.hash);
    return link.view;
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  // القسم المطلوب لإعادة التحميل بعد فشل ملفه (reload-view.js): يعود المشارك إليه لا إلى «رحلتي»
  noteView(view);
  useEffect(() => {
    const back = (e) => { const v = e.state?.view || 'home'; setView(v); window.scrollTo({ top: 0 }); };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const [lab, setLab] = useState(null);       // أدوات المختبر المفتوحة للمشارك، ونقاطه
  const [labOpen, setLabOpen] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [bootError, setBootError] = useState('');   // فشل جلب الرحلة والجلسة باقية: يُعرض بإعادة محاولة لا بشاشة الدخول
  // إخفاق عابر في الإقلاع (شبكة، أو خدمة مشغولة): «جارٍ إعادة الاتصال…» وإعادة تلقائية، لا طريق مسدود (reconnect.js، ش9)
  const [reconnect, setReconnect] = useState(false);
  const [rebootTries, setRebootTries] = useState(0);
  // «ادخل بحساب آخر» من شاشة الإخفاق: شاشة الدخول والجلسة القائمة باقية حتى ينجح الدخول الجديد (لا مسح بخطأ شبكة)
  const [switching, setSwitching] = useState(false);
  const [reconnectCode, setReconnectCode] = useState(null);   // رمز آخر إخفاق عابر: نص الحالة يتبعه (reconnectCopy)
  const [rebooting, setRebooting] = useState(false);          // إقلاع جارٍ الآن (للزر «حاول الآن»)
  const booting1 = useRef(false);
  // جيل الإقلاع: يزيد حين يبدأ الدخول بحساب آخر وحين ينجح. إقلاع بدأ في جيل سابق لا يطبّق نتيجته (جلسة قديمة قد تصل بعد
  // دخول سريع بمفتاح المرور أو Google، فتُعرض رحلة الحساب السابق بتوكن الحساب الجديد)
  const bootGen = useRef(0);
  const startSwitch = () => { bootGen.current += 1; setSwitching(true); };
  const [linkChoice, setLinkChoice] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [install, setInstall] = useState(null);   // حدث التثبيت المؤجل من المتصفح
  // رمز حضور الورشة من مسح QR: /?checkin=...
  // رابط العرض من لوحة الإدارة: يُلتقط قبل أي شيء
  const [demo, setDemo] = useState(() => captureDemoLink() || demoPending());
  // { t } رمز ممسوح، أو { r, exp, title } إيصال مسح قبل الدخول، أو { error } رفض لحظة المسح، أو { t, kept } رمز حُفظ
  // احتياطًا (قبل ترحيل الإيصال أو انقطاع الشبكة)
  const [checkin, setCheckin] = useState(() => {
    const t = new URLSearchParams(location.search).get('checkin');
    if (t) { history.replaceState(null, '', '/'); return { t }; }
    return checkinKeep.get();
  });
  // مسح بلا دخول (أو بجلسة انتهت): الخادم يتحقق من الرمز الآن ويعطي إيصالًا، فلا ينتهي الرمز أثناء الدخول (W1)
  const scanning = !!checkin?.t && !checkin.kept && !me && (!session.get() || !booting);
  useEffect(() => {
    if (!scanning) return;
    let alive = true;
    receiptFor(checkin.t, call).then((c) => {
      if (!alive) return;
      if (c.error) checkinKeep.clear(); else checkinKeep.set(c);
      setCheckin(c.t ? { ...c, kept: true } : c);
    });
    return () => { alive = false; };
  }, [scanning, checkin?.t]);
  // ما ينتظر التسجيل بعد الدخول: لا الرفض ولا ما زال يُطلب إيصاله
  const pendingCheckin = checkin && !checkin.error && !scanning ? checkin : null;

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
    // إقلاع واحد في وقت واحد: المؤقت وحدث online والزر قد يتلاقون
    if (booting1.current) return;
    booting1.current = true;
    setRebooting(true);
    try { await bootOnceRef.current(); } finally { booting1.current = false; setRebooting(false); }
  }, []);
  const bootOnceRef = useRef(null);
  bootOnceRef.current = async () => {
    const gen = bootGen.current;
    // بدأ دخول بحساب آخر أو نجح أثناء هذا الإقلاع: لا يُطبَّق شيء من نتيجة الجلسة القديمة
    const stale = () => { if (gen === bootGen.current) return false; setBooting(false); return true; };
    setBootError('');
    // رابط البريد: /verify?e=...&t=... . بلا رابط كامل (فُتح يدويًا أو قُصّ) لا شيء يُتحقق منه، فيكمل كأي زيارة بلا خطأ
    const q = location.pathname === '/verify' ? new URLSearchParams(location.search) : null;
    if (q) history.replaceState(null, '', '/');
    if (q?.get('e') && q.get('t')) {
      const email = q.get('e'); const link = q.get('t');
      const res = await call('auth.verify', { email, link });
      if (stale()) return;
      // تعذّر الاتصال: الرابط لم يُستعمل على الأرجح لكنه زال من العنوان. بجلسة قائمة يكمل منها بإعادة الاتصال التلقائية،
      // وبلا جلسة رسالة تدل على الخطوة التالية لا «تعذّر التأكد»
      if (res.code === 'network') {
        if (session.get()) { setReconnectCode('network'); setReconnect(true); setRebootTries((n) => n + 1); }
        else setVerifyError('تعذّر إكمال الدخول من الرابط، اطلب رمزًا جديدًا من شاشة الدخول');
        setBooting(false);
        return;
      }
      // بريد جديد: اختيار الوجهة (لبريد خبير أو منسق جهة) أو الاسم يكمل في شاشة الدخول، والرابط يبقى صالحًا حتى يُنشأ الحساب
      if (res.success && res.choose_role) { setLinkChoice({ email, link, roles: res.roles }); setBooting(false); return; }
      if (res.code === 'needs_name') { setLinkChoice({ email, link, needsName: true }); setBooting(false); return; }
      if (res.success) { accept(res); setBooting(false); return; }
      // رابط مستعمل أو منتهٍ وفي الجهاز جلسة سارية: صاحبه داخل أصلًا، فيكمل منها بدل رسالة خطأ
      if (session.get()) {
        const again = await call('me');
        if (stale()) return;
        if (again.success) { accept(again); setBooting(false); return; }
      }
      setVerifyError(res.message);
      setBooting(false);
      return;
    }
    if (session.get()) {
      // الفتح الأول يجمع الرئيسية في رحلة واحدة (البند 7.5)، وتأخذ الأقسام ما يخصها منه مرة واحدة
      const res = await call('me', { with_home: true });
      if (stale()) return;
      if (res.success) { setReconnect(false); setRebootTries(0); bootPreload.set(res.preload); accept(res); lastJourney.save(res, session.get()); }
      else if (res.code === 'suspended') { setReconnect(false); session.clear(); setVerifyError(res.message); }
      // عابر: «جارٍ إعادة الاتصال…» ويعيد الإقلاع وحده (autoReboot)، والجلسة باقية
      else if (isTransient(res)) { setReconnectCode(res.code); setReconnect(true); setRebootTries((n) => n + 1); }
      else if (res.code !== 'session') { setReconnect(false); setBootError(res.message || UNEXPECTED_ERROR); }   // session: أزالها الحارس في call وأظهر الدخول برسالته
      else setReconnect(false);
    }
    setBooting(false);
  };
  // إعادة الإقلاع تلقائيًا ما دام الإخفاق عابرًا، وتتوقف أثناء الدخول بحساب آخر
  useEffect(() => autoReboot({ active: reconnect && !me && !switching, tries: Math.max(0, rebootTries - 1), reboot: boot }), [reconnect, me, switching, rebootTries, boot]);
  useEffect(() => {
    setExpiredHandler(() => { setMe(null); setView('home'); setVerifyError('انتهت جلستك. ادخل مرة أخرى.'); });
    boot();
  }, [boot]);

  // المختبر قسم مستقل: يظهر مدخله متى فُتح للمشارك أو لجهته شيء منه
  const meId = me?.participant?.id;
  const loadLab = useCallback(async () => {
    const r = bootPreload.take('lab') || await call('lab.list');
    setLab(r.success ? { items: r.items, points: r.points } : null);
  }, []);
  useEffect(() => { if (meId) loadLab(); else setLab(null); }, [meId, loadLab]);
  const hasLab = !!lab?.items?.length;
  // تغيير القسم يبدأ من أعلى الصفحة وينقل التركيز إلى المحتوى لقارئ الشاشة
  const go = useCallback((v, fromHistory = false) => {
    // كل قسم خطوة في سجل المتصفح، فزر الرجوع يعيد إلى القسم السابق ولا يخرج من المنصة
    if (!fromHistory && viewRef.current !== v) history.pushState({ view: v }, '');
    setView(v);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
  }, []);
  const openLab = (id = null) => { setLabOpen(id); go('lab'); };
  // إحالة من فصل في وثيقة المبادرة إلى بابه في الكتاب، والعودة إلى الفصل نفسه (anatomy.json)
  const [bookTarget, setBookTarget] = useState(null);
  const [capReturn, setCapReturn] = useState(null);
  const openBook = (t) => { setBookTarget(t); setCapReturn(t?.chapter_id || null); go('handbook'); };
  useEffect(() => { if (view !== 'handbook') setBookTarget(null); }, [view]);   // «كتابي» من القائمة يفتح الكتاب عاديًا لا على إحالة قديمة

  const logout = async () => {
    if (!(await askSignOut('participant'))) return;
    try { localStorage.removeItem(LOGO_KEY); } catch { /* لا شيء محفوظ */ }
    setMe(null);
    setView('home');
  };

  // الأقسام المتاحة الآن فقط: الكتاب والمبادرة بعد الاعتماد، والمختبر متى فُتح، والأثر متى فُتحت مرحلته
  // الحق في البرنامج (دفع أو رعاية أو إعفاء): مصدره الخادم (me.access)، وغيابه يعني الدفع مطفأ (hasAccess في gates.js)
  const paidFor = (item) => hasAccess(me, item);
  const inJourney = me && gateDone(me, 'profile') && gateDone(me, 'assessment') && paidFor('program') && !pendingCheckin;
  // معالج البداية: خطوته من البوابات نفسها (Onboarding.jsx)؛ الرأس يظهر فوق شاشات القبول، والخطوة 4 بطاقة في الرحلة
  const [onbTick, setOnbTick] = useState(0);
  const [consentLater, setConsentLater] = useState(false);   // D18: أجّل تجديد الموافقة في هذه الجلسة
  const onb = me && !pendingCheckin ? onboardingStep(me, { assessmentPaywall: !paidFor('assessment') }) : null;
  const rail = onb && onb.key !== 'next' && onbTick >= 0 ? <OnboardingRail step={onb} /> : null;
  const approved = !!me?.profile?.approved;
  // مفاتيح الميزات قيد البناء من الخادم (me.features): القاعة وكاتون و360 لا تظهر ولا تُفتح حين تُخفى، ورابط /?tab=hall يقع على الرحلة
  const ft = flagsOf(me);
  const navItems = inJourney ? [
    { key: 'home', label: 'رحلتي' },
    // ما لم يُفتح بعد يظهر مقفلًا بسبب فتحه، فيعرف المشارك ما ينتظره ولا يظن المنصة أصغر مما هي
    { key: 'handbook', label: 'كتابي', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    { key: 'capstone', label: 'مبادرتي', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    ft.katon && { key: 'katon', label: 'كاتون', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    ft.hall && { key: 'hall', label: 'القاعة', ...(!approved && { locked: 'يُفتح بعد اعتماد مسارك' }) },
    hasLab && { key: 'lab', label: 'المختبر' },
    { key: 'impact', label: 'أثري', ...(!(approved && impactOpen(me)) && { locked: 'يُفتح مع القياس البعدي في طور الأثر' }) },
    { key: 'profile', label: 'ملفي' },
  ].filter(Boolean) : [];
  const navView = view === 'lab' && !hasLab ? 'home' : shownView(view, ft);
  // ميزة أُخفيت والشاشة مفتوحة (رد hall_off وأخواته): تُحدَّث الرئيسية فيزول عنصرها، ويعود المشارك إلى رحلته
  const featureGone = async () => { go('home'); const r = await call('me'); if (r.success) accept(r); };
  const onNav = (k) => (k === 'lab' ? openLab() : go(k));

  const consentNeed = me?.participant?.consent?.needed ?? null;
  // بطاقة «جارٍ إعادة الاتصال…» معروضة فعلًا: هي تقول «لا اتصال» فلا يتكرر الشريط. وفي شاشة الدخول يبقى الشريط
  const reconnectShown = !booting && !me && reconnect && !switching && !linkChoice;
  let screen;
  if (booting) screen = session.get() ? <JourneySkeleton /> : <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  else if (!me && switching) screen = (
    <>
      <div className="page narrow stack switch-note">
        <p className="small muted">جلستك الحالية محفوظة على هذا الجهاز حتى تدخل بالحساب الآخر.</p>
        <button className="link small" onClick={() => setSwitching(false)}>رجوع</button>
      </div>
      <SignIn onSignedIn={(r) => { bootGen.current += 1; setSwitching(false); setReconnect(false); setBootError(''); accept(r); }} />
    </>
  );
  else if (!me && linkChoice) screen = <SignIn pendingLink={linkChoice} onSignedIn={(r) => { setLinkChoice(null); accept(r); }} />;
  else if (reconnectShown) screen = <Reconnecting online={online} code={reconnectCode} working={rebooting} onRetry={boot} onOther={startSwitch} last={lastJourney.read(session.get())} />;
  else if (!me && bootError) screen = (
    <div className="page narrow stack">
      <ErrorBox message={bootError} onRetry={() => { setBooting(true); boot(); }} />
      <button className="link small" onClick={startSwitch}>ادخل بحساب آخر</button>
    </div>
  );
  else if (!me && scanning) screen = <div className="center-load"><div className="spinner" aria-label="جارٍ حفظ المسح" /></div>;
  else if (!me) screen = <SignIn onSignedIn={accept} initialError={verifyError || signInNote(checkin)} />;
  // D18: من لم يوافق قط يوافق مرة، ومن وافق قبل آخر نسخة جوهرية يرى ما تغيّر ويوافق أو يؤجل (الحالة من الخادم)
  else if (consentNeed === 'first' && !me.participant.is_demo) screen = <Consent consent={me.participant.consent} onAccepted={accept} />;
  // الحضور قبل تجديد الموافقة القابل للتأجيل (W1): من في القاعة يُسجَّل أولًا، ويرى التجديد بعده
  else if (pendingCheckin) screen = <CheckIn token={pendingCheckin.t} receipt={pendingCheckin.r} onDone={async ({ keep } = {}) => { if (!keep) checkinKeep.clear(); setCheckin(null); const r = await call('me'); if (r.success) accept(r); }} />;
  else if (consentNeed === 'renew' && !me.participant.is_demo && !consentLater) screen = <Consent consent={me.participant.consent} onAccepted={accept} onLater={() => setConsentLater(true)} />;
  else if (onb?.key === 'welcome') screen = <OnboardingWelcome me={me} step={onb} onStart={() => { welcomeSeen.set(true); setOnbTick((n) => n + 1); go('home'); }} />;
  else if (!gateDone(me, 'profile') || view === 'profile') {
    screen = <>{!gateDone(me, 'profile') && rail}<Profile me={me} onSaved={(res) => { accept(res); go('home'); }} onboarding={!gateDone(me, 'profile')} onCancel={() => go('home')} />{gateDone(me, 'profile') && <MyData me={me} />}{gateDone(me, 'profile') && me.profile?.approved && ft.f360 && <Feedback360Entry onOpen={() => go('f360')} />}</>;
  } else if (seatHold(me) && (!paidFor('assessment') || !paidFor('program'))) screen = <SponsorshipPending />;   // D20: لا بوابة دفع أثناء قرار الرعاية
  else if (!gateDone(me, 'assessment') && !paidFor('assessment')) screen = <>{rail}<Paywall item="assessment" me={me} onUpdate={accept} /></>;
  else if (!gateDone(me, 'assessment')) screen = <>{rail}{me.access?.sponsor && <div className="page narrow" style={{ paddingBottom: 0 }}><SponsorNote access={me.access} /></div>}<Assessment me={me} onSubmitted={accept} /></>;
  // D04: رسم البرنامج بعد اعتماد المسار؛ قبله حالة انتظار مؤرخة بلا بوابة دفع
  else if (!paidFor('program')) screen = me.profile?.approved ? <Paywall item="program" me={me} onUpdate={accept} /> : <AwaitingApproval me={me} />;
  else if (view === 'lab' && hasLab) screen = <LabScreen items={lab.items} points={lab.points} open={labOpen} onOpen={setLabOpen} reload={loadLab} onBack={() => { setLabOpen(null); go('home'); }} />;
  else if (view === 'handbook' && me.profile?.approved) screen = <Handbook me={me} lab={lab?.items} onLab={openLab} onBack={() => { setBookTarget(null); go('home'); }} target={bookTarget} onReturn={bookTarget ? () => { setBookTarget(null); go('capstone'); } : null} />;
  else if (ft.katon && view === 'katon' && me.profile?.approved) screen = <Katon onBack={() => go('home')} />;
  else if (ft.hall && view === 'hall' && me.profile?.approved) screen = <HallScreen onBack={() => go('home')} onHidden={featureGone} />;
  else if (view === 'capstone' && me.profile?.approved) screen = <Capstone me={me} onEditProfile={() => go('profile')} onBack={() => go('home')} onHandbook={openBook} reopen={capReturn} onReopened={() => setCapReturn(null)} />;
  else if (view === 'impact' && me.profile?.approved) screen = <Impact me={me} onUpdate={accept} onBack={() => go('home')} />;
  else if (ft.f360 && view === 'f360' && me.profile?.approved) screen = <Feedback360 onBack={() => go('profile')} />;
  else screen = <Journey me={me} onUpdate={accept} onEditProfile={() => go('profile')} onHandbook={() => go('handbook')} onImpact={() => go('impact')} onCapstone={() => go('capstone')} onHall={ft.hall ? () => go('hall') : undefined} lab={lab?.items} onLab={() => openLab()} onLabItem={(labId) => openLab(labId)} />;

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
      {!online && !reconnectShown && <div className="offline-bar" role="status">أنت دون اتصال. تحتاج اتصالًا لعرض رحلتك وحفظ ما تكتبه.</div>}
      <main id="main" tabIndex={-1} className={navItems.length ? 'with-tabbar' : undefined}>
        {me && !me.participant.is_demo && <PolicyBanner consent={me.participant.consent} deferred={consentLater} onAccepted={(r) => { setConsentLater(false); accept(r); }} />}
        {/* حاجز لكل قسم يُصفَّر بمفتاحه: خطأ في رسم «كتابي» مثلًا لا يُسقط الترويسة والتنقل، والانتقال إلى قسم آخر يعيده سليمًا */}
        {/* وانتظار ملف القسم الكسول داخله (Suspense): الترويسة والتنقل باقيان أثناء التحميل، وفشل الملف يقع على حاجز القسم لا على التطبيق كله */}
        <SectionBoundary key={navView} onHome={navView === 'home' ? null : () => go('home')}><Suspense fallback={<SectionLoading />}>{screen}</Suspense></SectionBoundary>
      </main>
      <footer className={`foot${navItems.length ? ' with-tabbar' : ''}`}>© Milestone Impact <LegalLink /></footer>
      {!booting && (demo || me?.participant?.is_demo) && <LiveTour me={me} onAccept={(r) => { accept(r); setDemo(true); }} onGo={go} />}
      {navItems.length > 0 && <Nav className="tabbar" items={navItems} view={navView} onGo={onNav} />}
    </>
  );
}
