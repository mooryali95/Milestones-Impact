// ════════════════════════════════════════════════════════════════
// سياق تطبيق القادة: المنهجية والكتاب والمختبر والمشاركون والجهات والشهادات
// ════════════════════════════════════════════════════════════════
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
// كل قسم يُحمَّل عند أول فتح له (التدقيق 2026-11-10، البند 9.13): كانت الأقسام الاثنان والعشرون في الحزمة الرئيسية
// (515 ك.ب)، فينتظر المدير تنزيلها كلها ليرى النظرة العامة
const named = (load, key) => lazy(() => load().then((m) => ({ default: m[key] })));
const Orgs = lazy(() => import('./Orgs.jsx'));
const Participants = lazy(() => import('./Participants.jsx'));
const Certificates = lazy(() => import('./Certificates.jsx'));
const Overview = lazy(() => import('./Overview.jsx'));
const Tracks = lazy(() => import('./Tracks.jsx'));
const Assessment = named(() => import('./Methodology.jsx'), 'Assessment');
const Journey = named(() => import('./Methodology.jsx'), 'Journey');
const Levels = named(() => import('./Methodology.jsx'), 'Levels');
const Handbook = lazy(() => import('./Handbook.jsx'));
const Lab = lazy(() => import('./Lab.jsx'));
const Activities = lazy(() => import('./Activities.jsx'));
const Impact = lazy(() => import('./Impact.jsx'));
const Capstones = lazy(() => import('./Capstones.jsx'));
const Programs = lazy(() => import('./Programs.jsx'));
const KatonBank = lazy(() => import('./Katon.jsx'));
const Payments = lazy(() => import('./Payments.jsx'));
const HallScreen = lazy(() => import('./Hall.jsx'));
const ContentBank = lazy(() => import('./ContentBank.jsx'));
const Experts = lazy(() => import('./Experts.jsx'));
const MailGallery = lazy(() => import('./MailGallery.jsx'));
const AppSettings = lazy(() => import('./AppSettings.jsx'));
const Feedback360 = lazy(() => import('./Feedback360.jsx'));
import { Spinner } from '../ui.jsx';
import { navigate, useRoute } from '../route.js';
import { TABS } from '../leaders-tabs.js';

// الأقسام وأسماؤها في ملف صغير يقرؤه شريط البحث (Palette) دون أن يجرّ الأقسام كلها إلى الحزمة الرئيسية
export { TABS };
// تحتاج كتالوج المنهجية (admin.catalog)، فيُحمَّل عند أول فتح لأحدها
const NEEDS_CATALOG = new Set(['tracks', 'journey', 'content', 'assessment', 'levels', 'handbook', 'impact']);
const TAB_KEYS = new Set(TABS.map(([k]) => k));
// الأقسام في أربع مجموعات بحسب طبيعة العمل: ما يُتابع يوميًا، وما يُبنى من محتوى، وما يُدار من برامج، وما يخرج من نتائج
const TAB_GROUPS = [
  ['اليومي', ['overview', 'participants', 'hall', 'capstones', 'activities', 'experts']],
  ['المحتوى', ['journey', 'handbook', 'katon', 'lab', 'assessment', 'content']],
  ['البرامج', ['programs', 'orgs', 'tracks', 'levels', 'settings']],
  ['النتائج', ['payments', 'impact', 'f360', 'certs', 'mail']],
];
const TAB_LABEL = Object.fromEntries(TABS);
// التبويب والمعرّف من عنوان الصفحة: #/leaders/participants/<id> · orgs/<id> · tracks/<key> · capstones/<id>
const at = (tab, id) => navigate({ ctx: 'leaders', tab, id });

export default function Leaders({ canWrite, pending }) {
  const route = useRoute();
  const tab = TAB_KEYS.has(route.tab) ? route.tab : 'participants';
  const person = tab === 'participants' ? route.id : null;
  const orgId = tab === 'orgs' ? route.id : null;
  const track = tab === 'tracks' ? route.id : null;
  const capId = tab === 'capstones' ? route.id : null;
  const expertId = tab === 'experts' ? route.id : null;
  const [orgData, setOrgData] = useState(null);
  // على الشاشات الضيقة التبويبات شريط يُسحب: التبويب المفتوح يبقى ظاهرًا
  useEffect(() => { document.querySelector('.la-tabs .on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [tab]);
  const [status, setStatus] = useState('');
  // المجموعات المطوية تُحفظ لهذا المتصفح: كل مدير يبقي أمامه ما يستعمله
  const [shut, setShut] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('la.nav.shut') || '[]')); } catch { return new Set(); } });
  const toggleGroup = (g) => setShut((prev) => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); try { localStorage.setItem('la.nav.shut', JSON.stringify([...n])); } catch { /* اختياري */ } return n; });
  const pendingOf = (k) => (k === 'participants' ? pending?.participants : k === 'handbook' ? pending?.models : k === 'capstones' ? pending?.capstones : 0) || 0;
  const groupPending = (keys) => keys.reduce((n, k) => n + pendingOf(k), 0);
  const [catalog, setCatalog] = useState(null);
  const [programId, setProgramId] = useState(null);

  const loadOrgs = useCallback(async () => {
    const r = await L('admin.orgs');
    setOrgData(r.success ? r : { orgs: [], unassigned: {} });
  }, []);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  const loadCatalog = useCallback(async () => setCatalog(await L('admin.catalog', programId ? { program_id: programId } : {})), [programId]);
  useEffect(() => { if (NEEDS_CATALOG.has(tab) && !catalog) loadCatalog(); }, [tab, catalog, loadCatalog]);
  // برنامج آخر في «الرحلة والمتطلبات»: يُعاد تحميل الكتالوج له
  const pickProgram = (id) => { setProgramId(id); setCatalog(null); };

  const go = (t) => { setStatus(''); at(t); };
  const openPerson = (id) => { at('participants', id); window.scrollTo({ top: 0 }); };
  const openTrack = (k) => { at('tracks', k); window.scrollTo({ top: 0 }); };
  const openOrg = (id) => { at('orgs', id); window.scrollTo({ top: 0 }); };
  const byStatus = (k) => { setStatus(k); at('participants'); };
  const meth = { catalog, reload: loadCatalog, canWrite };

  let body;
  if (NEEDS_CATALOG.has(tab) && !catalog) body = <Spinner />;
  else if (NEEDS_CATALOG.has(tab) && !catalog.success) body = <div className="la-err" role="alert">{catalog.message}</div>;
  else if (tab === 'overview') body = <Overview canWrite={canWrite} pending={pending} orgs={orgData?.orgs || []} onPerson={openPerson} onTrack={openTrack} onStatus={byStatus} onOrg={openOrg} onTab={go} />;
  else if (tab === 'participants') body = <Participants key={status} orgs={orgData?.orgs || []} canWrite={canWrite} personId={person} onOpen={(id) => (id ? openPerson(id) : at('participants'))} initialStatus={status} />;
  else if (tab === 'impact') body = <Impact {...meth} orgs={orgData?.orgs || []} onPerson={openPerson} onCapstone={(id) => { at('capstones', id); window.scrollTo({ top: 0 }); }} />;
  else if (tab === 'mail') body = <MailGallery canWrite={canWrite} />;
  else if (tab === 'settings') body = <AppSettings canWrite={canWrite} />;
  else if (tab === 'f360') body = <Feedback360 canWrite={canWrite} onPerson={openPerson} />;
  else if (tab === 'experts') body = <Experts canWrite={canWrite} expertId={expertId} onPerson={openPerson} onOpen={(id) => (id ? navigate({ ctx: 'leaders', tab: 'experts', id }) : at('experts'))} />;
  else if (tab === 'payments') body = <Payments canWrite={canWrite} onPerson={openPerson} />;
  else if (tab === 'certs') body = <Certificates canWrite={canWrite} onPerson={openPerson} orgs={orgData?.orgs || []} />;
  else if (tab === 'tracks') body = <Tracks {...meth} trackKey={track} onOpen={(k) => (k ? openTrack(k) : at('tracks'))} onPerson={openPerson} />;
  else if (tab === 'journey') body = <Journey {...meth} onProgram={pickProgram} />;
  else if (tab === 'programs') body = <Programs canWrite={canWrite} onEditJourney={(id) => { pickProgram(id); at('journey'); }} />;
  else if (tab === 'content') body = <ContentBank {...meth} />;
  else if (tab === 'activities') body = <Activities canWrite={canWrite} />;
  else if (tab === 'handbook') body = <Handbook {...meth} />;
  else if (tab === 'katon') body = <KatonBank canWrite={canWrite} />;
  else if (tab === 'hall') body = <HallScreen canWrite={canWrite} />;
  else if (tab === 'capstones') body = <Capstones canWrite={canWrite} capId={capId} onOpen={(id) => { at('capstones', id); window.scrollTo({ top: 0 }); }} onPerson={openPerson} />;
  else if (tab === 'lab') body = <Lab canWrite={canWrite} />;
  else if (tab === 'assessment') body = <Assessment {...meth} />;
  else if (tab === 'levels') body = <Levels key={catalog.placement_model?.[0]?.updated_at || 'm'} {...meth} />;
  else body = <Orgs data={orgData} reload={loadOrgs} canWrite={canWrite} orgId={orgId} onOpen={(id) => (id ? openOrg(id) : at('orgs'))} onPerson={openPerson} />;

  return (
    <div className="dash-body">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Leaders Program</div>
          <h1 className="page-title">تطبيق القادة</h1>
          <div className="page-title-ar">leaders.sunkvalue.com · المنهجية والمسارات والمشاركون والجهات والشهادات</div>
        </div>
        {!canWrite && <span className="la-chip">عرض فقط</span>}
      </div>
      {/* على الشاشات العريضة الأقسام عمود جانبي ثابت بجوار المحتوى، فلا تأخذ من ارتفاع الشاشة شيئًا (الأنماط في leaders-admin.css) */}
      <div className="la-shell">
      <nav className="la-tabs la-tabs-grouped" aria-label="أقسام تطبيق القادة">
        {TAB_GROUPS.map(([g, keys]) => (
          <div key={g} className={`la-tab-group${shut.has(g) && !keys.includes(tab) ? ' shut' : ''}`} role="group" aria-label={g}>
            {/* عنوان المجموعة يطويها ويفتحها، ومجموعة القسم المفتوح لا تُطوى. عدد ما ينتظر يبقى ظاهرًا على العنوان وهي مطوية */}
            <button type="button" className="la-tab-group-label" aria-label={`مجموعة ${g}`} aria-expanded={!(shut.has(g) && !keys.includes(tab))} onClick={() => toggleGroup(g)}>
              {g}{shut.has(g) && !keys.includes(tab) && groupPending(keys) > 0 && <span className="la-badge">{groupPending(keys)}</span>}
            </button>
            {keys.map((k) => {
              const n = pendingOf(k);
              return <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{TAB_LABEL[k]}{n > 0 && <span className="la-badge" aria-label={`${n} بانتظارك`}>{n}</span>}</button>;
            })}
          </div>
        ))}
      </nav>
      <div className="la-body"><Suspense fallback={<Spinner />}>{body}</Suspense></div>
      </div>
    </div>
  );
}
