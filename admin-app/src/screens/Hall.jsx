// ════════════════════════════════════════════════════════════════
// القاعة الحية: شاشة العرض وتحكم الخبير (من اللوحة)
// ════════════════════════════════════════════════════════════════
// تُعرض على البروجكتر أو بمشاركة الشاشة في Meet. المكوّن المشترك HallControl (shared/hall) هو
// نفسه في بوابة الخبير؛ هنا يُربط بإجراءات admin.hall-*، وتحته طلبات الأقران في الدفعة (المرحلة 8).
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import HallControl from '../../../shared/hall/HallControl.jsx';

const ACTION = { state: 'admin.hall', open: 'admin.hall-open', step: 'admin.hall-step', split: 'admin.hall-split', assign: 'admin.hall-assign', close: 'admin.hall-close' };
const when = (d) => (d ? new Date(d).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// طلبات الأقران في الدفعة كما يراها الأدمن (قراءة؛ التأكيد من بوابة الخبير)
function PeerRequests({ cohortId }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (cohortId) L('admin.peer', { cohort_id: cohortId }).then(setD); }, [cohortId]);
  if (!cohortId || !d) return null;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  return (
    <section className="la-card" aria-label="طلبات الأقران">
      <h3>طلبات الأقران <small className="la-muted">· {d.items.length}</small></h3>
      <p className="la-muted">يرفعها المشاركون لفرقهم، ويؤكّدها مستشار الدفعة من بوابته أو يصحّحها أو يخفيها. الإدارة تطّلع هنا.</p>
      {!d.items.length && <p className="la-muted">لا طلبات بعد.</p>}
      <ul className="la-reqs">{d.items.map((r) => (
        <li key={r.id}><span><b>{r.author}</b> ← {r.target_team_ar} · «{r.text}» <small className="la-muted">{when(r.at)}</small>
          {r.answers.length > 0 && <ul className="la-muted">{r.answers.map((a) => <li key={a.id}>{a.author}: «{a.text}» · {a.status_ar}{a.expert_note ? ` · ملاحظة الخبير: ${a.expert_note}` : ''}</li>)}</ul>}</span>
          <span className={`la-chip ${r.status === 'confirmed' ? 'ok' : r.status === 'answered' ? 'warn' : ''}`}>{r.status_ar}</span></li>
      ))}</ul>
    </section>
  );
}

export default function Hall({ canWrite }) {
  const { toast, prompt, confirm } = useUI();
  const [cohorts, setCohorts] = useState(null);
  const [cid, setCid] = useState(() => { try { return localStorage.getItem('hall.cohort') || ''; } catch { return ''; } });
  useEffect(() => { L('admin.programs').then((r) => setCohorts(r.success ? r.cohorts.filter((c) => c.status !== 'closed') : [])); }, []);
  const call = useCallback((key, body) => L(ACTION[key], body), []);
  const pickCohort = (id) => { setCid(id); try { localStorage.setItem('hall.cohort', id); } catch { /* اختياري */ } };
  if (!cohorts) return <Spinner />;
  return (
    <div className="hall-admin">
      <label className="la-row"><span>الدفعة</span>
        <select value={cid} onChange={(e) => pickCohort(e.target.value)}>
          <option value="">اختر الدفعة</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <HallControl cohortId={cid} call={call} canWrite={canWrite} toast={toast} prompt={prompt} confirm={confirm} />
      <PeerRequests cohortId={cid} />
    </div>
  );
}
