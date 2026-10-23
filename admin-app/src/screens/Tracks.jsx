// ════════════════════════════════════════════════════════════════
// المسارات الـ27: لوحات المستويات، وصفحة المسار بمشاركيه وكتيبه
// ════════════════════════════════════════════════════════════════
// كل لوحة مستوى في Milestone، صفوفها مستوى Impact وأعمدتها مستوى Leadership.
// تحرير أبواب الكتيب في استوديو الكتيب (الخطوة التالية)؛ هنا عرض كما يقرؤه المشارك.
import React, { useEffect, useState } from 'react';
import { DIM, DIM_EN, DIMS, L, LVL, STATUS } from '../leaders.js';
import { LVLS, ROMAN, TRACK_FIELDS, lines, shortTitle, trackKey, trackLevels } from '../methodology.js';
import Form from '../Form.jsx';
import Md from '../Md.jsx';
import { Spinner, useUI } from '../ui.jsx';

const LvlChips = ({ k }) => {
  const lv = trackLevels(k);
  return DIMS.map((d) => <span key={d} className={`la-lvl ${lv[d]}`}>{DIM_EN[d][0]} {LVL[lv[d]]}</span>);
};

function Board({ tracks, onOpen }) {
  const tr = tracks.tracks || [];
  const st = tracks.track_stats || {};
  if (!tr.length) return <div className="la-note">جدول المسارات غير موجود بعد (الترحيل leaders-007-tracks).</div>;
  const byKey = Object.fromEntries(tr.map((t) => [t.key, t]));
  const sum = (f) => Object.values(st).reduce((a, x) => a + (x[f] || 0), 0);
  const used = tr.filter((t) => st[t.key]?.total).length;
  const max = Math.max(1, ...Object.values(st).map((x) => x.total || 0));
  const cell = (key) => {
    const t = byKey[key] || {};
    const x = st[key] || {};
    const heat = x.total ? (0.25 + (0.75 * x.total) / max).toFixed(2) : 0;
    return (
      <button key={key} className={`tx-cell${x.total ? ' on' : ''}`} style={{ '--heat': heat }} onClick={() => onOpen(key)} title={t.title_ar || key}>
        <span className="tx-key">{key}</span>
        <span className="tx-title">{shortTitle(t.title_ar)}</span>
        <span className="tx-n"><b>{x.total || 0}</b>{x.pending ? <small>{x.pending} بانتظارك</small> : x.total ? <small>{x.active || 0} مفعّل</small> : null}</span>
      </button>
    );
  };
  const top = tr.filter((t) => st[t.key]?.total).sort((a, b) => st[b.key].total - st[a.key].total).slice(0, 5);
  return (
    <>
      <section className="tx-hero">
        <div className="tx-hero-head">
          <div><span className="tx-eyebrow">Leadership Tracks</span><h2>المسارات السبعة والعشرون</h2>
            <p>كل مسار تركيبة فريدة من مستويات الأطر الثلاثة، له هويته وكتيبه ورحلته. افتح أي مسار لترى مشاركيه وكتيبه كاملًا.</p></div>
        </div>
        <div className="tx-kpis">
          <div><b>{used}<small>/27</small></b><span>مسار به مشاركون</span></div>
          <div><b>{sum('total')}</b><span>مشارك مسكّن</span></div>
          <div><b>{sum('active')}</b><span>مفعّل</span></div>
          <div className={sum('pending') ? 'warn' : ''}><b>{sum('pending')}</b><span>بانتظار اعتمادك</span></div>
        </div>
      </section>
      <div className="tx-legend">
        <span>كل لوحة مستوى في <b>Milestone</b>، صفوفها مستوى <b>Impact</b>، وأعمدتها مستوى <b>Leadership</b>.</span>
        <span className="tx-scale"><i />شدة الذهبي = عدد المشاركين</span>
      </div>
      <div className="tx-boards">{LVLS.map((ml) => {
        const n = tr.filter((t) => t.milestone_level === ml).reduce((a, t) => a + (st[t.key]?.total || 0), 0);
        return (
          <section key={ml} className="tx-board">
            <header><span className="tx-roman">{ROMAN[ml]}</span><div><small>Milestone</small><b>{LVL[ml]}</b></div><span className="tx-board-n"><b>{n}</b>مشارك</span></header>
            <div className="tx-grid">
              <span className="tx-corner">صفوف Impact<br />أعمدة Leadership</span>
              {LVLS.map((l) => <span key={l} className="tx-axis col"><i>L</i>{LVL[l]}</span>)}
              {LVLS.map((il) => (
                <React.Fragment key={il}>
                  <span className="tx-axis row"><i>I</i>{LVL[il]}</span>
                  {LVLS.map((ll) => cell(trackKey(ml, il, ll)))}
                </React.Fragment>
              ))}
            </div>
          </section>
        );
      })}</div>
      {top.length > 0 && (
        <section className="la-card tx-top"><h3>الأكثر شغلًا</h3>{top.map((t, i) => (
          <button key={t.key} className="tx-rank" onClick={() => onOpen(t.key)}>
            <span className="tx-rank-i">{i + 1}</span>
            <span className="tx-rank-t"><b>{t.title_ar}</b><small><code>{t.key}</code> <LvlChips k={t.key} /></small></span>
            <span className="tx-rank-bar"><i style={{ width: `${((st[t.key].total / max) * 100).toFixed(0)}%` }} /></span>
            <b className="tx-rank-n">{st[t.key].total}</b>
          </button>
        ))}</section>
      )}
    </>
  );
}

function Track({ k, canWrite, onBack, onPerson, onSaved }) {
  const { toast } = useUI();
  const [r, setR] = useState(null);
  const [editing, setEditing] = useState(false);
  const load = () => L('admin.track', { key: k }).then(setR);
  useEffect(() => { setR(null); load(); }, [k]); // eslint-disable-line
  if (!r) return <Spinner />;
  if (!r.success) return <div className="la-err" role="alert">{r.message}</div>;
  const t = r.track;
  const ps = r.participants;
  const groups = DIMS.map((d) => ({ d, items: r.handbook.filter((c) => c.dimension === d) }));
  return (
    <>
      <button className="la-link" onClick={onBack}>→ كل المسارات</button>
      <section className="la-track-hero">
        <div className="la-row between">
          <div className="la-row"><code className="la-code">{t.key}</code><LvlChips k={t.key} /></div>
          {canWrite && t.title_ar && <button className="btn-sm ghost" onClick={() => setEditing(true)}>تحرير هوية المسار</button>}
        </div>
        <h2>{t.title_ar || 'مسار بلا هوية بعد'}</h2>
        {t.summary_ar && <p>{t.summary_ar}</p>}
        <div className="la-track-cols">
          <div><h4>أولويات التطوير</h4><ol>{lines(t.focus_ar).map((x, i) => <li key={i}>{x}</li>)}</ol></div>
          <div><h4>المشروع التطبيقي</h4><p>{String(t.project_ar || '').replace(/^مشروعك التطبيقي:\s*/, '')}</p></div>
          <div><h4>توجيه الرحلة</h4><ul>{lines(t.journey_ar).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>
      </section>

      <section className="la-card">
        <div className="la-row between"><h3>المشاركون في هذا المسار</h3><span className="la-muted">{ps.length} مشارك · {ps.filter((p) => p.approved).length} مفعّل</span></div>
        {ps.length ? (
          <table className="la-table">
            <thead><tr><th>الاسم</th><th>الجهة</th><th>الحالة</th><th>المسار</th></tr></thead>
            <tbody>{ps.map((p) => (
              <tr key={p.id} className="la-click" onClick={() => onPerson(p.id)}>
                <td><button className="la-link" onClick={(e) => { e.stopPropagation(); onPerson(p.id); }}><b>{p.full_name}</b></button><br /><small className="la-muted" dir="ltr">{p.email}</small></td>
                <td>{p.organization_name || ''}</td><td>{STATUS[p.status] || p.status}</td>
                <td>{p.approved ? <span className="la-chip ok">مفعّل</span> : <span className="la-chip warn">مبدئي</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="la-muted">لا مشاركين في هذا المسار بعد.</p>}
      </section>

      <section className="la-card">
        <div className="la-row between"><h3>كتيب المسار كما يقرؤه المشارك</h3><span className="la-muted">{r.handbook.length} بابًا</span></div>
        <p className="la-muted">الكتيب مركّب من أبواب الأطر الثلاثة بمستوى هذا المسار في كل إطار، والفقرات الخاصة بمستويات أخرى محذوفة. تعديل أي باب يسري على كل المسارات التي تشترك فيه، ويتم من «كتيب القائد».</p>
        {r.handbook.length ? (
          <div className="la-hb">
            <nav className="la-hb-toc" aria-label="أبواب الكتيب">{groups.map((g) => g.items.length > 0 && (
              <div key={g.d}><b>{DIM_EN[g.d]} · {LVL[r.levels[g.d]]}</b>{g.items.map((c) => (
                <button key={c.id} className="la-link" onClick={() => document.getElementById(`hb-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{c.title}</button>
              ))}</div>
            ))}</nav>
            <div className="la-hb-body">{r.handbook.map((c) => (
              <article key={c.id} className="la-hb-ch" id={`hb-${c.id}`}>
                <small className="la-muted">{DIM_EN[c.dimension]} · {DIM[c.dimension]}</small>
                <h3>{c.title}</h3>
                <div className="la-md">{c.md ? <Md text={c.md} /> : <p className="la-muted">هذا الباب بلا محتوى بعد.</p>}</div>
              </article>
            ))}</div>
          </div>
        ) : <p className="la-muted">لا أبواب بمحتوى لهذا المسار بعد.</p>}
      </section>
      {editing && (
        <Form title={`مسار ${t.key}`} fields={TRACK_FIELDS} values={t}
          onSave={(row) => L('admin.save', { entity: 'tracks', row: { key: t.key, ...row } })}
          onClose={(saved) => { setEditing(false); if (saved) { toast('تم الحفظ'); load(); onSaved(); } }} />
      )}
    </>
  );
}

export default function Tracks({ catalog, reload, canWrite, trackKey: open, onOpen, onPerson }) {
  return open
    ? <Track k={open} canWrite={canWrite} onBack={() => onOpen(null)} onPerson={onPerson} onSaved={reload} />
    : <Board tracks={catalog} onOpen={onOpen} />;
}
