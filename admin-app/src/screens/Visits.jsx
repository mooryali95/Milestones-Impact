// ════════════════════════════════════════════════════════════════
// زيارات الموقع: من public.page_views عبر leaders-api (admin.visits)
// ════════════════════════════════════════════════════════════════
// بلا IP وبلا كوكي: «الزيارة» تبويب متصفح، لا شخص.
import React, { useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner } from '../ui.jsx';

const SITES = [['', 'كل المواقع'], ['mi-home', 'الموقع الرئيسي'], ['mi-matrix', 'مصفوفة التأثير'], ['mi-leaders', 'صفحة القادة']];
const DEVICE = { mobile: 'جوال', tablet: 'لوحي', desktop: 'حاسب' };
const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

export default function Visits() {
  const [days, setDays] = useState(30);
  const [site, setSite] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => {
    let live = true;
    setD(null);
    L('admin.visits', { days, site: site || undefined }).then((r) => live && setD(r));
    return () => { live = false; };
  }, [days, site]);

  return (
    <div className="dash-body">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Site Analytics</div>
          <h1 className="page-title">زيارات الموقع</h1>
          <div className="page-title-ar">بلا عنوان IP ولا كوكي، فالرقم زيارات لا أشخاص</div>
        </div>
        <div className="la-row">
          <select className="filter-select" aria-label="الموقع" value={site} onChange={(e) => setSite(e.target.value)}>
            {SITES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="filter-select" aria-label="المدة" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>آخر 7 أيام</option><option value={30}>آخر 30 يومًا</option><option value={90}>آخر 90 يومًا</option>
          </select>
        </div>
      </div>
      <Trends />
      {!d ? <Spinner /> : !d.success ? <div className="la-note" role="alert">{d.message}</div> : <Report d={d} />}
    </div>
  );
}

// اتجاه البرنامج أسبوعًا بأسبوع: هل ينمو التسجيل ويتحول إلى قياس واعتماد ونشاط؟
const TREND_COLS = [['joined', 'مسجلون جدد'], ['assessed', 'قياسات مكتملة'], ['approved', 'مسارات اعتُمدت'], ['active', 'مشاركون نشطون']];
function Trends() {
  const [t, setT] = useState(null);
  useEffect(() => { let live = true; L('admin.trends').then((r) => live && setT(r)).catch(() => live && setT({ success: false })); return () => { live = false; }; }, []);
  if (!t?.success || !t.weeks?.length) return null;
  const weeks = t.weeks;
  const cur = weeks.at(-1), prev = weeks.at(-2) || {};
  const max = Object.fromEntries(TREND_COLS.map(([k]) => [k, Math.max(1, ...weeks.map((w) => w[k]))]));
  return (
    <section className="la-card">
      <h3>اتجاه البرنامج</h3>
      <div className="stats-grid">
        {TREND_COLS.map(([k, l]) => {
          const diff = cur[k] - (prev[k] || 0);
          return <div key={k} className="stat-card"><div className="stat-label">{l}</div><div className="stat-value">{cur[k]}</div><div className="stat-sub">هذا الأسبوع، {diff === 0 ? 'مثل الماضي' : diff > 0 ? `+${diff} عن الماضي` : `${diff} عن الماضي`}</div></div>;
        })}
      </div>
      <table className="la-table tr-table" tabIndex={0} aria-label="اتجاه البرنامج أسبوعًا بأسبوع">
        <thead><tr><th>الأسبوع</th>{TREND_COLS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
        <tbody>{[...weeks].reverse().map((w) => (
          <tr key={w.week}><td><bdi dir="ltr">{w.week}</bdi></td>{TREND_COLS.map(([k]) => (
            <td key={k}><span className="tr-bar" style={{ width: `${(w[k] / max[k]) * 100}%` }} aria-hidden="true" />{w[k]}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function Report({ d }) {
  const visits = sum(d.daily, 'visits');
  const views = sum(d.daily, 'views');
  const max = Math.max(1, ...d.daily.map((x) => Number(x.visits)));
  const devTotal = Math.max(1, sum(d.devices, 'visits'));
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">الزيارات</div><div className="stat-value">{visits}</div><div className="stat-sub">خلال {d.days} يومًا</div></div>
        <div className="stat-card"><div className="stat-label">مشاهدات الصفحات</div><div className="stat-value">{views}</div><div className="stat-sub">كل الصفحات</div></div>
        <div className="stat-card"><div className="stat-label">صفحات لكل زيارة</div><div className="stat-value">{visits ? (views / visits).toFixed(1) : '0'}</div><div className="stat-sub">عمق التصفح</div></div>
        <div className="stat-card"><div className="stat-label">متوسط يومي</div><div className="stat-value">{Math.round(visits / d.days)}</div><div className="stat-sub">زيارة في اليوم</div></div>
      </div>
      <section className="la-card">
        <h3>الزيارات يومًا بيوم</h3>
        {d.daily.length ? (
          <div className="vs-bars" role="img" aria-label={`الزيارات اليومية، أعلاها ${max}`}>
            {d.daily.map((x) => <span key={x.day} title={`${x.day}: ${x.visits} زيارة`} style={{ height: `${(Number(x.visits) / max) * 100}%` }} />)}
          </div>
        ) : <p className="la-muted">لا زيارات في هذه المدة.</p>}
      </section>
      <div className="la-grid2">
        <section className="la-card">
          <h3>أكثر الصفحات زيارة</h3>
          <table className="la-table" tabIndex={0} aria-label="أكثر الصفحات زيارة">
            <thead><tr><th>الصفحة</th><th>الزيارات</th><th>المشاهدات</th></tr></thead>
            <tbody>{d.pages.map((p) => <tr key={p.site + p.path}><td><bdi dir="ltr">{p.path}</bdi> <small className="la-muted">{p.site}</small></td><td>{p.visits}</td><td>{p.views}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="la-card">
          <h3>من أين يأتون</h3>
          <ul className="vs-list">{d.referrers.map((r) => <li key={r.label}><bdi dir="ltr">{r.label}</bdi><b>{r.visits}</b></li>)}</ul>
          <h3>بأي جهاز</h3>
          <ul className="vs-list">{d.devices.map((r) => <li key={r.label}><span>{DEVICE[r.label] || r.label}</span><b>{Math.round((Number(r.visits) / devTotal) * 100)}%</b></li>)}</ul>
        </section>
      </div>
    </>
  );
}
