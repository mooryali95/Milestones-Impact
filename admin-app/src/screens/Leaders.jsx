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
import { Spinner } from '../ui.jsx';

const TABS = [
  ['overview', 'نظرة عامة'], ['participants', 'المشاركون'], ['orgs', 'الجهات'], ['tracks', 'المسارات الـ27'],
  ['journey', 'الرحلة والمتطلبات'], ['activities', 'الحضور والجلسات'], ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والتسكين'], ['handbook', 'كتيب القائد'], ['certs', 'الشهادات'],
];
// تحتاج كتالوج المنهجية (admin.catalog)، فيُحمَّل عند أول فتح لأحدها
const NEEDS_CATALOG = new Set(['tracks', 'journey', 'assessment', 'levels', 'handbook']);

export default function Leaders({ canWrite }) {
  const [tab, setTab] = useState('participants');
  const [person, setPerson] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgData, setOrgData] = useState(null);
  const [status, setStatus] = useState('');
  const [track, setTrack] = useState(null);
  const [catalog, setCatalog] = useState(null);

  const loadOrgs = useCallback(async () => {
    const r = await L('admin.orgs');
    setOrgData(r.success ? r : { orgs: [], unassigned: {} });
  }, []);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  const loadCatalog = useCallback(async () => setCatalog(await L('admin.catalog')), []);
  useEffect(() => { if (NEEDS_CATALOG.has(tab) && !catalog) loadCatalog(); }, [tab, catalog, loadCatalog]);

  const go = (t) => { setTab(t); setPerson(null); setOrgId(null); setTrack(null); setStatus(''); };
  const openPerson = (id) => { setTab('participants'); setPerson(id); window.scrollTo({ top: 0 }); };
  const openTrack = (k) => { setTab('tracks'); setTrack(k); window.scrollTo({ top: 0 }); };
  const byStatus = (k) => { setTab('participants'); setPerson(null); setStatus(k); };
  const meth = { catalog, reload: loadCatalog, canWrite };

  let body;
  if (NEEDS_CATALOG.has(tab) && !catalog) body = <Spinner />;
  else if (NEEDS_CATALOG.has(tab) && !catalog.success) body = <div className="la-err" role="alert">{catalog.message}</div>;
  else if (tab === 'overview') body = <Overview orgs={orgData?.orgs || []} onPerson={openPerson} onTrack={openTrack} onStatus={byStatus} />;
  else if (tab === 'participants') body = <Participants key={status} orgs={orgData?.orgs || []} canWrite={canWrite} personId={person} onOpen={setPerson} initialStatus={status} />;
  else if (tab === 'certs') body = <Certificates canWrite={canWrite} onPerson={openPerson} orgs={orgData?.orgs || []} />;
  else if (tab === 'tracks') body = <Tracks {...meth} trackKey={track} onOpen={(k) => { setTrack(k); window.scrollTo({ top: 0 }); }} onPerson={openPerson} />;
  else if (tab === 'journey') body = <Journey {...meth} />;
  else if (tab === 'activities') body = <Activities canWrite={canWrite} />;
  else if (tab === 'handbook') body = <Handbook {...meth} />;
  else if (tab === 'assessment') body = <Assessment {...meth} />;
  else if (tab === 'levels') body = <Levels key={catalog.placement_model?.[0]?.updated_at || 'm'} {...meth} />;
  else body = <Orgs data={orgData} reload={loadOrgs} canWrite={canWrite} orgId={orgId} onOpen={setOrgId} onPerson={openPerson} />;

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
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{l}</button>)}
      </nav>
      <div className="la-body">{body}</div>
    </div>
  );
}
