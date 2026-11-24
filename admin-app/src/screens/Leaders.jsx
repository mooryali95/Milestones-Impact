// ════════════════════════════════════════════════════════════════
// سياق تطبيق القادة: المنهجية والكتاب والمختبر والمشاركون والجهات والشهادات
// ════════════════════════════════════════════════════════════════
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { lazyNamed, lazyRetry } from '../lazy-retry.js';
import { L } from '../leaders.js';
// كل قسم يُحمَّل عند أول فتح له (التدقيق 2026-11-10، البند 9.13): كانت الأقسام الاثنان والعشرون في الحزمة الرئيسية
// (515 ك.ب)، فينتظر المدير تنزيلها كلها ليرى النظرة العامة
// وملف قسم حذفه نشر أحدث يُعاد بإعادة تحميل الصفحة مرة واحدة (lazy-retry.js)
const named = lazyNamed;
const Orgs = lazyRetry(() => import('./Orgs.jsx'));
const Participants = lazyRetry(() => import('./Participants.jsx'));
const Certificates = lazyRetry(() => import('./Certificates.jsx'));
const Overview = lazyRetry(() => import('./Overview.jsx'));
const Tracks = lazyRetry(() => import('./Tracks.jsx'));
const Assessment = named(() => import('./Methodology.jsx'), 'Assessment');
const Journey = named(() => import('./Methodology.jsx'), 'Journey');
const Levels = named(() => import('./Methodology.jsx'), 'Levels');
const Handbook = lazyRetry(() => import('./Handbook.jsx'));
const Lab = lazyRetry(() => import('./Lab.jsx'));
const Activities = lazyRetry(() => import('./Activities.jsx'));
const Impact = lazyRetry(() => import('./Impact.jsx'));
const Capstones = lazyRetry(() => import('./Capstones.jsx'));
const Programs = lazyRetry(() => import('./Programs.jsx'));
const KatonBank = lazyRetry(() => import('./Katon.jsx'));
const Payments = lazyRetry(() => import('./Payments.jsx'));
const HallScreen = lazyRetry(() => import('./Hall.jsx'));
const ContentBank = lazyRetry(() => import('./ContentBank.jsx'));
const Experts = lazyRetry(() => import('./Experts.jsx'));
const MailGallery = lazyRetry(() => import('./MailGallery.jsx'));
const MailCenter = lazyRetry(() => import('./MailCenter.jsx'));
const PlatformHealth = lazyRetry(() => import('./PlatformHealth.jsx'));
const AppSettings = lazyRetry(() => import('./AppSettings.jsx'));
const Feedback360 = lazyRetry(() => import('./Feedback360.jsx'));
const Insight = lazyRetry(() => import('./Insight.jsx'));
// «المساعد الذكي» بتبويباته الداخلية الثلاثة، وكل شاشة فيه تُحمَّل عند أول فتح لتبويبها (AiHub.jsx)
const AiHub = lazyRetry(() => import('./AiHub.jsx'));
const MasterBookScreen = lazyRetry(() => import('./MasterBookScreen.jsx'));
import { ScreenBoundary, Spinner } from '../ui.jsx';
import { navigate, useRoute } from '../route.js';
import { badgeLabel, badgeText, groupBadge, tabBadge } from '../pending.js';
import { FEATURE_TABS, groupOpen, NAV_GROUPS, OWNER_TABS, SETUP_GROUP, TAB_ALIASES, TABS } from '../leaders-tabs.js';
import { featureFlags } from '../../../supabase/functions/leaders-api/features.js';

// قسم ميزة مخفية عن المستخدمين: ما يعنيه إخفاؤها هنا، والمدير يبني فيها كما يشاء (مفاتيح الميزات P2)
const HIDDEN_NOTE_AR = {
  hall: 'لا يدخلها مشارك ولا يديرها خبير، ولا تُفتح منها جلسة حتى تُظهرها. رسائل الورش تطلب الحضور برمز QR.',
  katon: 'شاشة «كاتون» لا تظهر للمشاركين. ابنِ البنك هنا كما تشاء، ووزنه في التقييم لا يتغير بالمفتاح.',
  f360: 'لا يراه مشارك ولا مستشار ولا منسق ولا مقيّم. الدورات الجارية متجمدة بلا بريد ولا إرسال، وبياناتها باقية وتُستأنف حين تُظهره.',
};

// الأقسام وأسماؤها في ملف صغير يقرؤه شريط البحث (Palette) دون أن يجرّ الأقسام كلها إلى الحزمة الرئيسية
export { TABS };
// تحتاج كتالوج المنهجية (admin.catalog)، فيُحمَّل عند أول فتح لأحدها
const NEEDS_CATALOG = new Set(['tracks', 'journey', 'content', 'assessment', 'levels', 'handbook', 'impact']);
const TAB_KEYS = new Set(TABS.map(([k]) => k));
const TAB_LABEL = Object.fromEntries(TABS);
// التبويب والمعرّف من عنوان الصفحة: #/leaders/participants/<id> · orgs/<id> · tracks/<key> · capstones/<id>
const at = (tab, id) => navigate({ ctx: 'leaders', tab, id });

// عدّاد ما ينتظر: «99+» فوق التسعة والتسعين، وأحمر بوصف مسموع حين تأخر فيه بند عن مهلته
function Badge({ b }) {
  if (!b?.n) return null;
  return <span className={`la-badge${b.late ? ' late' : ''}`} aria-label={badgeLabel(b.n, b.late, b.partial)}>{badgeText(b.n, b.partial)}</span>;
}

export default function Leaders({ canWrite, pending, isSuper = false, isOwner = false }) {
  const route = useRoute();
  // رابط قديم (#/leaders/agent و/guidance و/guidance-access): يُستبدل بعنوان «المساعد الذكي» وتبويبه الداخلي دون إضافة إلى سجل المتصفح
  const alias = TAB_ALIASES[route.tab];
  useEffect(() => { if (alias) navigate({ ctx: 'leaders', tab: alias[0], id: alias[1] }, { replace: true }); }, [alias]);
  // شاشة المساعد للمدير الأعلى والمالك وحدهما
  const allowed = (k) => !OWNER_TABS.has(k) || isSuper || isOwner;
  const [rTab, rId] = alias || [route.tab, route.id];
  const tab = TAB_KEYS.has(rTab) && allowed(rTab) ? rTab : 'overview';
  const person = tab === 'participants' ? route.id : null;
  const orgId = tab === 'orgs' ? route.id : null;
  const track = tab === 'tracks' ? route.id : null;
  const capId = tab === 'capstones' ? route.id : null;
  const expertId = tab === 'experts' ? route.id : null;
  const cohortId = tab === 'programs' ? route.id : null;
  const payId = tab === 'payments' ? route.id : null;
  const [orgData, setOrgData] = useState(null);
  // على الشاشات الضيقة التبويبات شريط يُسحب: التبويب المفتوح يبقى ظاهرًا
  useEffect(() => { document.querySelector('.la-tabs .on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [tab]);
  const [status, setStatus] = useState('');
  // حال كل مجموعة (مفتوحة أو مطوية) تُحفظ لهذا المتصفح: كل مدير يبقي أمامه ما يستعمله. المفتاح جديد لأن الافتراضي تغيّر
  // (الإعداد مطوي)، والقديم la.nav.shut كان بأسماء المجموعات الأربع السابقة فلا معنى له الآن
  const [saved, setSaved] = useState(() => { try { const v = JSON.parse(localStorage.getItem('la.nav.groups') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } });
  const toggleGroup = (g, open) => setSaved((prev) => { const n = { ...prev, [g]: !open }; try { localStorage.setItem('la.nav.groups', JSON.stringify(n)); } catch { /* اختياري */ } return n; });
  // عدّاد كل تبويب من صندوق «ينتظرني» بتبويب نوعه (pending.js، «العدّ الواحد»)، والمجموعة المطوية مجموع تبويباتها الظاهرة
  const groupOf = (keys) => groupBadge(pending, keys.filter(allowed));
  const [catalog, setCatalog] = useState(null);
  // مفاتيح الميزات من المخزن نفسه الذي تحرره «الإعدادات العامة»، وتُحدَّث بعد كل حفظ هناك (onSettings)
  const [flags, setFlags] = useState(null);
  useEffect(() => { L('admin.settings').then((r) => { if (r?.success) setFlags(featureFlags(r.values)); }); }, []);
  const hiddenOf = (k) => !!flags && FEATURE_TABS[k] && !flags[FEATURE_TABS[k]];
  const [programId, setProgramId] = useState(() => (tab === 'journey' ? route.id || null : null));
  const wantPid = useRef(programId);

  const loadOrgs = useCallback(async () => {
    const r = await L('admin.orgs');
    setOrgData(r.success ? r : { orgs: [], unassigned: {} });
  }, []);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  // رد برنامج سابق لا يكتب فوق كتالوج البرنامج المختار بعده (تبديل سريع أو رابط بعد الفتح)
  const loadCatalog = useCallback(async () => {
    wantPid.current = programId;
    const r = await L('admin.catalog', programId ? { program_id: programId } : {});
    if (wantPid.current === programId) setCatalog(r);
  }, [programId]);
  useEffect(() => { if (NEEDS_CATALOG.has(tab) && !catalog) loadCatalog(); }, [tab, catalog, loadCatalog]);
  // البرنامج المختار في «الرحلة والمتطلبات» في الرابط (P9): ‎#/leaders/journey/<البرنامج>‎، فالتحديث وزر الرجوع والرابط
  // المنسوخ تفتح البرنامج نفسه. الرابط مصدره الوحيد، وتغيّره يعيد تحميل الكتالوج له
  const journeyPid = tab === 'journey' ? route.id || null : undefined;
  useEffect(() => {
    if (journeyPid === undefined || journeyPid === programId) return;
    setProgramId(journeyPid); setCatalog(null);
  }, [journeyPid, programId]);
  const pickProgram = (id) => at('journey', id || null);

  // العودة إلى «الرحلة والمتطلبات» من القائمة تبقي البرنامج الذي كان مفتوحًا
  const go = (t) => { setStatus(''); at(t, t === 'journey' ? programId : null); };
  const openPerson = (id) => { at('participants', id); window.scrollTo({ top: 0 }); };
  const openTrack = (k) => { at('tracks', k); window.scrollTo({ top: 0 }); };
  const openOrg = (id) => { at('orgs', id); window.scrollTo({ top: 0 }); };
  const byStatus = (k) => { setStatus(k); at('participants'); };
  const meth = { catalog, reload: loadCatalog, canWrite };

  let body;
  if (NEEDS_CATALOG.has(tab) && !catalog) body = <Spinner />;
  else if (NEEDS_CATALOG.has(tab) && !catalog.success) body = <div className="la-err" role="alert">{catalog.message}</div>;
  else if (tab === 'overview') body = <Overview canWrite={canWrite} pending={pending} orgs={orgData?.orgs || []} orgsLoaded={orgData != null} onPerson={openPerson} onTab={go} />;
  else if (tab === 'participants') body = <Participants key={status} orgs={orgData?.orgs || []} canWrite={canWrite} personId={person} onOpen={(id) => (id ? openPerson(id) : at('participants'))} initialStatus={status} />;
  else if (tab === 'insight') body = <Insight onPerson={openPerson} onExpert={(id) => navigate({ ctx: 'leaders', tab: 'experts', id })} orgs={orgData?.orgs || []} onTrack={openTrack} onStatus={byStatus} onOrg={openOrg} onTab={go} />;
  else if (tab === 'impact') body = <Impact {...meth} f360={flags ? flags.f360 : undefined} orgs={orgData?.orgs || []} onPerson={openPerson} onCapstone={(id) => { at('capstones', id); window.scrollTo({ top: 0 }); }} />;
  else if (tab === 'mail') body = <MailGallery canWrite={canWrite} />;
  else if (tab === 'mailcenter') body = <MailCenter canWrite={canWrite} isSuper={isSuper} onPerson={openPerson} view={route.id} onView={(v) => at('mailcenter', v === 'status' ? null : v)} />;
  else if (tab === 'health') body = <PlatformHealth canWrite={canWrite} orgs={orgData?.orgs || []} orgsLoaded={orgData != null} reloadOrgs={loadOrgs} />;
  else if (tab === 'settings') body = <AppSettings canWrite={canWrite} isSuper={isSuper || isOwner} focus={route.id} onSettings={(r) => setFlags(featureFlags(r.values))} />;
  else if (tab === 'ai') body = <AiHub sub={rId} isSuper={isSuper} />;
  else if (tab === 'f360') body = <Feedback360 canWrite={canWrite} onPerson={openPerson} />;
  else if (tab === 'experts') body = <Experts canWrite={canWrite} expertId={expertId} onPerson={openPerson} onOpen={(id) => (id ? navigate({ ctx: 'leaders', tab: 'experts', id }) : at('experts'))} />;
  else if (tab === 'payments') body = <Payments canWrite={canWrite} onPerson={openPerson} payId={payId} onOpen={(id) => { at('payments', id); window.scrollTo({ top: 0 }); }} />;
  else if (tab === 'certs') body = <Certificates canWrite={canWrite} onPerson={openPerson} orgs={orgData?.orgs || []} />;
  else if (tab === 'tracks') body = <Tracks {...meth} trackKey={track} onOpen={(k) => (k ? openTrack(k) : at('tracks'))} onPerson={openPerson} />;
  else if (tab === 'journey') body = <Journey {...meth} onProgram={pickProgram} />;
  else if (tab === 'programs') body = <Programs canWrite={canWrite} cohortId={cohortId} onCohort={(id) => { at('programs', id); window.scrollTo({ top: 0 }); }} onEditJourney={pickProgram} onPerson={openPerson} />;
  else if (tab === 'content') body = <ContentBank {...meth} />;
  else if (tab === 'activities') body = <Activities canWrite={canWrite} />;
  else if (tab === 'handbook') body = <Handbook {...meth} />;
  else if (tab === 'book') body = <MasterBookScreen onClose={() => at('handbook')} onExperts={() => at('experts')} />;
  else if (tab === 'katon') body = <KatonBank canWrite={canWrite} programId={programId} />;   // البرنامج المختار في «الرحلة والمتطلبات»، فجدول نقاطه هو المعروض والمحرَّر
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
          <div className="page-eyebrow">المنتج الأول</div>
          <h1 className="page-title">تطبيق القادة</h1>
          <div className="page-title-ar" title="leaders.sunkvalue.com · المنهجية والمسارات والمشاركون والجهات والشهادات">leaders.sunkvalue.com · المنهجية والمسارات والمشاركون والجهات والشهادات</div>
        </div>
        {!canWrite && <span className="la-chip">عرض فقط</span>}
      </div>
      {/* على الشاشات العريضة الأقسام عمود جانبي ثابت بجوار المحتوى، فلا تأخذ من ارتفاع الشاشة شيئًا (الأنماط في leaders-admin.css) */}
      <div className="la-shell">
      <nav className="la-tabs la-tabs-grouped" aria-label="أقسام تطبيق القادة">
        {NAV_GROUPS.map(([g, keys]) => {
          const open = groupOpen(g, keys, tab, saved);
          const gb = open ? null : groupOf(keys);
          const shown = keys.filter(allowed);
          if (!shown.length) return null;
          // الأقسام المخفية عن المستخدمين آخر مجموعتها تحت عنوان صغير «تجريبي»، مع نقطتها، فلا تتوسط ما يعمل للمستخدمين
          const live = shown.filter((k) => !hiddenOf(k));
          const trial = shown.filter((k) => hiddenOf(k));
          const item = (k) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{TAB_LABEL[k]}<Badge b={tabBadge(pending, k)} />{hiddenOf(k) && <span className="ft-hidden-dot" title="مخفي عن المستخدمين"><span className="sr-only">مخفي عن المستخدمين</span></span>}</button>;
          return (
          <div key={g} className={`la-tab-group${open ? '' : ' shut'}${g === SETUP_GROUP ? ' la-tab-group-setup' : ''}`} role="group" aria-label={g}>
            {/* عنوان المجموعة يطويها ويفتحها، ومجموعة القسم المفتوح لا تُطوى. عدد ما ينتظر يبقى ظاهرًا على العنوان وهي مطوية،
                ويُضم وصفه المسموع إلى اسم الزر (aria-label يحجب ما في داخله عن قارئ الشاشة) */}
            <button type="button" className="la-tab-group-label" aria-label={gb?.n ? `مجموعة ${g}، ${badgeLabel(gb.n, gb.late, gb.partial)}` : `مجموعة ${g}`} aria-expanded={open} onClick={() => toggleGroup(g, open)}>
              {g}{!open && <Badge b={gb} />}
            </button>
            {live.map(item)}
            {trial.length > 0 && <span className="la-tab-trial" aria-hidden="true">تجريبي</span>}
            {trial.map(item)}
          </div>
          );
        })}
      </nav>
      <div className="la-body">
        {hiddenOf(tab) && (
          <div className="ft-banner" role="status" data-testid="feature-hidden-banner">
            <b>مخفي عن المستخدمين.</b> {HIDDEN_NOTE_AR[FEATURE_TABS[tab]]}{' '}
            <button type="button" className="btn-sm ghost" onClick={() => go('settings')}>أظهره من «الميزات قيد البناء»</button>
          </div>
        )}
        <ScreenBoundary key={tab}><Suspense fallback={<Spinner />}>{body}</Suspense></ScreenBoundary></div>
      </div>
    </div>
  );
}
