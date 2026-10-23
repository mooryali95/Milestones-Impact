// ════════════════════════════════════════════════════════════════
// سياق تطبيق القادة: التبويبات المنقولة، وروابط لما لم يُنقل بعد
// ════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import Orgs from './Orgs.jsx';
import Participants from './Participants.jsx';

// لم تُنقل بعد: تفتح اللوحة الحالية بالجلسة نفسها
const LEGACY = [['overview', 'نظرة عامة'], ['tracks', 'المسارات الـ27'], ['handbook', 'كتيب القائد'], ['journey', 'الرحلة والمتطلبات'], ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والقواعد']];

export default function Leaders({ canWrite }) {
  const [tab, setTab] = useState('participants');
  const [person, setPerson] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgData, setOrgData] = useState(null);

  const loadOrgs = useCallback(async () => {
    const r = await L('admin.orgs');
    setOrgData(r.success ? r : { orgs: [], unassigned: {} });
  }, []);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const go = (t) => { setTab(t); setPerson(null); setOrgId(null); };
  const openPerson = (id) => { setTab('participants'); setPerson(id); window.scrollTo({ top: 0 }); };

  return (
    <div className="dash-body">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Leaders Program</div>
          <div className="page-title">تطبيق القادة</div>
          <div className="page-title-ar">leaders.sunkvalue.com · المشاركون والجهات</div>
        </div>
        {!canWrite && <span className="la-chip">عرض فقط</span>}
      </div>
      <nav className="la-tabs" aria-label="أقسام تطبيق القادة">
        <button className={tab === 'participants' ? 'on' : ''} aria-current={tab === 'participants' ? 'page' : undefined} onClick={() => go('participants')}>المشاركون</button>
        <button className={tab === 'orgs' ? 'on' : ''} aria-current={tab === 'orgs' ? 'page' : undefined} onClick={() => go('orgs')}>الجهات</button>
        {LEGACY.map(([k, l]) => <a key={k} className="la-tab-legacy" href="/#leaders" title="في اللوحة الحالية">{l} ↗</a>)}
      </nav>
      <div className="la-body">
        {tab === 'participants'
          ? <Participants orgs={orgData?.orgs || []} canWrite={canWrite} personId={person} onOpen={setPerson} />
          : <Orgs data={orgData} reload={loadOrgs} canWrite={canWrite} orgId={orgId} onOpen={setOrgId} onPerson={openPerson} />}
      </div>
    </div>
  );
}
