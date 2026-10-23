// ════════════════════════════════════════════════════════════════
// نظرة عامة على تطبيق القادة: الأرقام، وما ينتظر القرار، والقمع
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { DIM, DIM_EN, DIMS, L, LVL, STATUS, date } from '../leaders.js';
import { LVLS } from '../methodology.js';
import { Spinner } from '../ui.jsx';
import { Funnel } from './Orgs.jsx';
import { OrgSelect } from './Participants.jsx';

export default function Overview({ orgs, onPerson, onTrack, onStatus }) {
  const [org, setOrg] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => {
    let live = true;
    setD(null);
    Promise.all([L('admin.overview', { org }), L('admin.reviews')]).then(([o, r]) => live && setD({ o, r }));
    return () => { live = false; };
  }, [org]);

  if (!d) return <Spinner />;
  const { o, r } = d;
  if (!o.success) return <div className="la-err" role="alert">{o.message}</div>;
  const st = (k) => o.by_status[k] || 0;
  const max = Math.max(1, ...DIMS.flatMap((x) => LVLS.map((l) => o.matrix[x][l])));
  const waiting = [...(r.pending_approval || []), ...(r.submitted || [])];

  return (
    <>
      <div className="la-row between la-ov-bar">
        <span className="la-muted">{org ? 'تعرض الأرقام لجهة واحدة' : 'كل الجهات'}</span>
        <OrgSelect orgs={orgs} value={org} onChange={setOrg} />
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">المشاركون</div><div className="stat-value">{o.total}</div><div className="stat-sub">كل الحالات</div></div>
        <div className="stat-card"><div className="stat-label">بانتظار الاعتماد</div><div className="stat-value s-new">{st('pending_approval')}</div><div className="stat-sub">أنهوا القياس</div></div>
        <div className="stat-card"><div className="stat-label">متطلبات للمراجعة</div><div className="stat-value s-replied">{o.pending_reviews}</div><div className="stat-sub">أرسلها المشاركون</div></div>
        <div className="stat-card"><div className="stat-label">في البرنامج</div><div className="stat-value">{st('placed') + st('enrolled')}</div><div className="stat-sub">معتمدون</div></div>
      </div>
      <div className="la-grid2">
        <section className="la-card">
          <h3>توزيع المستويات (3×3)</h3>
          <table className="la-matrix">
            <thead><tr><th />{DIMS.map((x) => <th key={x}>{DIM_EN[x]}<small>{DIM[x]}</small></th>)}</tr></thead>
            <tbody>{[...LVLS].reverse().map((l) => (
              <tr key={l}><th>{LVL[l]}</th>{DIMS.map((x) => <td key={x} style={{ '--a': (o.matrix[x][l] / max).toFixed(2) }}><b>{o.matrix[x][l]}</b></td>)}</tr>
            ))}</tbody>
          </table>
          <p className="la-muted">كل خلية = عدد المشاركين في هذا المستوى من هذا البُعد. المستوى مستقل في كل بُعد.</p>
        </section>
        <section className="la-card">
          <h3>ينتظر قرارك</h3>
          {!waiting.length ? <p className="la-muted">لا شيء بانتظارك الآن.</p> : (
            <ul className="la-queue">
              {(r.pending_approval || []).map((p) => (
                <li key={`a${p.id}`}><button className="la-link" onClick={() => onPerson(p.id)}>{p.full_name}</button><span className="la-chip warn">اعتماد المستوى</span><small>{p.organization_name || ''}</small></li>
              ))}
              {(r.submitted || []).map((x) => (
                <li key={`s${x.participant_id}${x.requirement_id || ''}`}><button className="la-link" onClick={() => onPerson(x.participant_id)}>{x.participants?.full_name}</button><span className="la-chip">{x.stage_requirements?.title_ar}</span><small>{date(x.completed_at)}</small></li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {o.funnel && (
        <div className="la-grid2">
          <section className="la-card"><h3>قمع الرحلة</h3><Funnel f={o.funnel} big /></section>
          <section className="la-card">
            <div className="la-row between"><h3>أكثر المسارات مشاركين</h3><span className="la-muted">{o.tracks_used} من 27 مسارًا مشغولة</span></div>
            {(o.top_tracks || []).length ? (
              <ul className="la-queue">{o.top_tracks.map((t) => (
                <li key={t.key}><button className="la-link" onClick={() => onTrack(t.key)}><code className="la-code">{t.key}</code> {t.title || ''}</button><b>{t.n}</b></li>
              ))}</ul>
            ) : <p className="la-muted">لا مسارات بعد.</p>}
          </section>
        </div>
      )}
      <section className="la-card">
        <h3>الحالات</h3>
        <div className="la-pills">{Object.entries(STATUS).map(([k, l]) => (
          <button key={k} className="la-pill" onClick={() => onStatus(k)}>{l} <b>{st(k)}</b></button>
        ))}</div>
      </section>
    </>
  );
}
