// ════════════════════════════════════════════════════════════════
// سياق تطبيق القادة: المنهجية والكتاب والمشاركون والجهات والشهادات
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import Orgs from './Orgs.jsx';
import Participants from './Participants.jsx';
import Certificates from './Certificates.jsx';
import Overview from './Overview.jsx';
import Tracks from './Tracks.jsx';
import { Assessment, Journey, Levels } from './Methodology.jsx';
import Handbook from './Handbook.jsx';
import Activities from './Activities.jsx';
import Impact from './Impact.jsx';
import Programs from './Programs.jsx';
import ContentBank from './ContentBank.jsx';
import { Spinner } from '../ui.jsx';
import { navigate, useRoute } from '../route.js';

export const TABS = [
  ['overview', 'نظرة عامة'], ['participants', 'المشاركون'], ['orgs', 'الجهات'], ['tracks', 'المسارات الـ27'],
  ['programs', 'البرامج والدفعات'], ['journey', 'الرحلة والمتطلبات'], ['content', 'بنك المحتوى'], ['activities', 'الحضور والجلسات'], ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والتسكين'], ['handbook', 'كتيب القائد'], ['impact', 'قياس الأثر'], ['certs', 'الشهادات'],
];
// تحتاج كتالوج المنهجية (admin.catalog)، فيُحمَّل عند أول فتح لأحدها
const NEEDS_CATALOG = new Set(['tracks', 'journey', 'content', 'assessment', 'levels', 'handbook', 'impact']);
const TAB_KEYS = new Set(TABS.map(([k]) => k));
// التبويب والمعرّف من عنوان الصفحة: #/leaders/participants/<id> · orgs/<id> · tracks/<key>
const at = (tab, id) => navigate({ ctx: 'leaders', tab, id });

export default function Leaders({ canWrite, pending }) {
  const route = useRoute();
  const tab = TAB_KEYS.has(route.tab) ? route.tab : 'participants';
  const person = tab === 'participants' ? route.id : null;
  const orgId = tab === 'orgs' ? route.id : null;
  const track = tab === 'tracks' ? route.id : null;
  const [orgData, setOrgData] = useState(null);
  // على الشاشات الضيقة التبويبات شريط يُسحب: التبويب المفتوح يبقى ظاهرًا
  useEffect(() => { document.querySelector('.la-tabs .on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [tab]);
  const [status, setStatus] = useState('');
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
  else if (tab === 'impact') body = <Impact {...meth} orgs={orgData?.orgs || []} onPerson={openPerson} />;
  else if (tab === 'certs') body = <Certificates canWrite={canWrite} onPerson={openPerson} orgs={orgData?.orgs || []} />;
  else if (tab === 'tracks') body = <Tracks {...meth} trackKey={track} onOpen={(k) => (k ? openTrack(k) : at('tracks'))} onPerson={openPerson} />;
  else if (tab === 'journey') body = <Journey {...meth} onProgram={pickProgram} />;
  else if (tab === 'programs') body = <Programs canWrite={canWrite} onEditJourney={(id) => { pickProgram(id); at('journey'); }} />;
  else if (tab === 'content') body = <ContentBank {...meth} />;
  else if (tab === 'activities') body = <Activities canWrite={canWrite} />;
  else if (tab === 'handbook') body = <Handbook {...meth} />;
  else if (tab === 'assessment') body = <Assessment {...meth} />;
  else if (tab === 'levels') body = <Levels key={catalog.placement_model?.[0]?.updated_at || 'm'} {...meth} />;
  else body = <Orgs data={orgData} reload={loadOrgs} canWrite={canWrite} orgId={orgId} onOpen={(id) => (id ? openOrg(id) : at('orgs'))} onPerson={openPerson} />;

  return (
    <div className="dash-body">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Leaders Program</div>
          <div className="page-title">تطبيق القادة</div>
          <div className="page-title-ar">leaders.sunkvalue.com · المنهجية والمسارات والمشاركون والجهات والشهادات</div>
        </div>
        {!canWrite && <span className="la-chip">عرض فقط</span>}
      </div>
      <nav className="la-tabs" aria-label="أقسام تطبيق القادة">
        {TABS.map(([k, l]) => {
          const n = k === 'participants' ? pending?.participants : k === 'handbook' ? pending?.models : 0;
          return <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{l}{n > 0 && <span className="la-badge" aria-label={`${n} بانتظارك`}>{n}</span>}</button>;
        })}
      </nav>
      <div className="la-body">{body}</div>
    </div>
  );
}
