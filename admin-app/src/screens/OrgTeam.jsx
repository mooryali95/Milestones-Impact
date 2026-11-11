// ════════════════════════════════════════════════════════════════
// صفحة الجهة: «الفريق والمجموعات» ملخص لفرق دفعاتها
// ════════════════════════════════════════════════════════════════
// الجهة لا تحمل تكليفًا بنفسها: الدفعة نقطة الربط (التصور v1، الخيار ج). هنا سطر لكل دفعة من دفعاتها،
// ومنه يُفتح «الفريق والمجموعات» للدفعة نفسها، فالتحرير في مكان واحد.
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Empty, Spinner } from '../ui.jsx';
import { COHORT_STATUS } from '../methodology.js';
import { coverageNotes, expertsAr, peopleAr, periodAr, roleAr, statusChip } from '../team.js';
import CohortTeam from './CohortTeam.jsx';

export default function OrgTeam({ orgId, canWrite }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => setD(await L('admin.org-team', { organization_id: orgId })), [orgId]);
  useEffect(() => { load(); }, [load]);
  const head = <h3 id="ot-h">الفريق والمجموعات</h3>;
  if (!d) return <section className="la-card" aria-labelledby="ot-h">{head}<Spinner /></section>;
  if (!d.success) return <section className="la-card" aria-labelledby="ot-h">{head}<div className="la-err" role="alert">{d.message} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div></section>;
  // الجارية والمفتوحة أولًا، والمغلقة مطوية بعدها
  const all = d.cohorts || [];
  const live = all.filter((c) => c.status !== 'closed');
  const closed = all.filter((c) => c.status === 'closed');
  const card = (c) => {
    const notes = coverageNotes(c.coverage);
    const roles = Object.entries(c.roles || {}).map(([k, n]) => `${roleAr(k)} ${n}`).join(' · ');
    return (
      <div key={c.id} className="ot-cohort">
        <div className="la-row between"><b>{c.name}</b><small className="la-muted">{COHORT_STATUS[c.status] || c.status} · {peopleAr(c.coverage.members)} · {periodAr(c)}</small></div>
        <dl className="ot-dl">
          <dt>المستشار الأساسي</dt>
          <dd>{c.advisor ? <>{c.advisor.full_name} {c.advisor.status !== 'active' && <span className={`la-chip ${statusChip(c.advisor.status)[1]}`}>{statusChip(c.advisor.status)[0]}</span>}</> : <span className="la-muted">بلا مستشار</span>}</dd>
          <dt>الفريق</dt>
          <dd>{c.team ? `${expertsAr(c.team)}${roles ? ` (${roles})` : ''}${c.not_approved ? ` · ${c.not_approved} لم يُعتمد بعد` : ''}` : <span className="la-muted">لا فريق بعد</span>}</dd>
          <dt>المجموعات</dt>
          <dd>{c.coverage.groups ? `${c.coverage.groups}${c.coverage.groups_without_expert ? ` · ${c.coverage.groups_without_expert} بلا خبير` : ''}${c.coverage.ungrouped ? ` · ${peopleAr(c.coverage.ungrouped)} بلا مجموعة` : ''}` : <span className="la-muted">لا مجموعات</span>}</dd>
        </dl>
        {notes.length > 0 && <ul className="ct-notes">{notes.map((n) => <li key={n}>⚠ {n}</li>)}</ul>}
        <div className="la-row"><button className="btn-sm ghost" onClick={() => setOpen(c)}>افتح فريق الدفعة</button></div>
      </div>
    );
  };
  return (
    <section className="la-card ot" aria-labelledby="ot-h">
      {head}
      <p className="la-muted small">الفريق يُربط بالجهة عبر دفعاتها: لكل دفعة مستشارها وفريقها ومجموعاتها.</p>
      {!all.length ? (
        <Empty compact title="لا دفعة للجهة بعد" hint="مشاركو الجهة في الدفعة المفتوحة الآن. أنشئ دفعتها من «البرامج والدفعات» ثم كوّن فريقها هنا." />
      ) : (
        <>
          {live.map(card)}
          {closed.length > 0 && <details className="ot-closed"><summary>الدفعات المغلقة ({closed.length})</summary>{closed.map(card)}</details>}
        </>
      )}
      {open && <CohortTeam cohort={open} canWrite={canWrite} onClose={(changed) => { setOpen(null); if (changed) load(); }} />}
    </section>
  );
}
