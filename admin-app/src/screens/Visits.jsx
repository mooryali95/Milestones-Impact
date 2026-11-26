// ════════════════════════════════════════════════════════════════
// زيارات الموقع: من public.page_views عبر leaders-api (admin.visits)
// ════════════════════════════════════════════════════════════════
// بلا IP وبلا كوكي: «الزيارة» تبويب متصفح، لا شخص.
// تصور صفحة الزيارات 2026-11-26 (المرحلة 2): التقرير أولًا والمرشحان ملاصقان له ومحفوظان في الرابط (useFilters)،
// و«اتجاه البرنامج» (بيانات مشاركين لا تتأثر بالمرشحين) في النظرة العامة برابط من هنا. الحسابات الخالصة في visits.js.
// المصادر والمسارات نص مُطبَّع لا روابط. الرسم SVG داخلي: الزمن من اليمين (الأقدم) إلى اليسار (الأحدث) باتجاه الصفحة.
import { PageHeader } from '../PageHeader.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { useFilters } from '../FilterBar.jsx';
import { dateOnly, weekDay } from '../dates.js';
import { Empty, LoadError, Spinner } from '../ui.jsx';
import { DIRECT, SITES, fillDays, mergePages, mergeRefs, pct, pickDays, pickSite, rangeLabel, siteName } from '../visits.js';

const DEVICE = { mobile: 'جوال', tablet: 'لوحي', desktop: 'حاسب' };
const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
const TOP = 10;
export const TREND_HREF = '#/leaders/overview?trend=1';

export default function Visits() {
  const [f, set] = useFilters(['days', 'site'], {}, { scope: 'visits' });
  const days = pickDays(f.days), site = pickSite(f.site);
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(true);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    setBusy(true);
    L('admin.visits', { days, site: site || undefined })
      .catch((e) => ({ success: false, message: e?.message || 'تعذّر الاتصال' }))
      .then((r) => { if (!live) return; setD(r); setBusy(false); });
    return () => { live = false; };
  }, [days, site, tick]);

  return (
    <div className="dash-body">
      <PageHeader eyebrow="تحليلات الموقع" title="زيارات الموقع" desc="بلا عنوان IP ولا كوكي، فالرقم زيارات لا أشخاص" />
      <section className="vs-report" aria-labelledby="vs-range" aria-busy={busy}>
        <div className="vs-head">
          <h2 className="today-sec" id="vs-range">{rangeLabel(days, site)}</h2>
          <div className="la-row">
            <select className="filter-select" aria-label="الموقع" value={site} onChange={(e) => set({ site: e.target.value })}>
              {SITES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="filter-select" aria-label="المدة" value={days} onChange={(e) => set({ days: e.target.value === '30' ? '' : e.target.value })}>
              <option value={7}>آخر 7 أيام</option><option value={30}>آخر 30 يومًا</option><option value={90}>آخر 90 يومًا</option>
            </select>
          </div>
        </div>
        {!d ? <Spinner />
          : !d.success ? <LoadError message={d.message} onRetry={retry} />
            : <div className={busy ? 'vs-stale' : ''}><Report d={d} days={days} site={site} /></div>}
      </section>
      <p className="la-muted vs-trend-link">اتجاه البرنامج (التسجيل والقياس والاعتماد والنشاط أسبوعًا بأسبوع) في <a className="la-link" href={TREND_HREF}>النظرة العامة ←</a></p>
    </div>
  );
}

function Report({ d, days, site }) {
  const daily = fillDays(d.daily, d.days || days);
  const visits = sum(daily, 'visits');
  const views = sum(daily, 'views');
  return (
    <>
      <div className="stats-grid vs-stats">
        <div className="stat-card"><div className="stat-label">الزيارات</div><div className="stat-value tnum">{visits}</div><div className="stat-sub">الزيارة تبويب متصفح لا شخص</div></div>
        <div className="stat-card"><div className="stat-label">مشاهدات الصفحات</div><div className="stat-value tnum">{views}</div><div className="stat-sub">كل الصفحات</div></div>
        <div className="stat-card"><div className="stat-label">صفحات لكل زيارة</div><div className="stat-value tnum">{visits ? (views / visits).toFixed(1) : '0'}</div><div className="stat-sub">عمق التصفح</div></div>
        <div className="stat-card"><div className="stat-label">متوسط يومي</div><div className="stat-value tnum">{Math.round(visits / daily.length)}</div><div className="stat-sub">زيارة في اليوم</div></div>
      </div>
      <section className="la-card vs-chart-card">
        <h3>الزيارات يومًا بيوم</h3>
        {visits ? <DailyChart daily={daily} /> : <Empty compact title="لا زيارات في هذه المدة" hint="جرّب مدة أطول أو موقعًا آخر." />}
      </section>
      <div className="la-grid2">
        <Pages pages={mergePages(d.pages)} site={site} />
        <section className="la-card">
          <Sources refs={mergeRefs(d.referrers)} />
          <Devices devices={d.devices || []} />
        </section>
      </div>
    </>
  );
}

// ── الرسم: أعمدة حتى 30 يومًا، وخط بمساحة عند 90. محور بأعلى قيمة، وتاريخا البداية والنهاية، وتلميح باللمس والمؤشر
// والأسهم (التركيز على الرسم كله، لا 90 محطة تبويب)، وبديل نصي و«عرض كجدول» ──
const W = 600, H = 150;
function DailyChart({ daily }) {
  const [at, setAt] = useState(null);
  const [kb, setKb] = useState(false);
  const [table, setTable] = useState(false);
  const ref = useRef(null);
  const n = daily.length;
  const max = Math.max(1, ...daily.map((x) => x.visits));
  const peak = daily.reduce((a, x) => (x.visits > a.visits ? x : a), daily[0]);
  const step = W / n;
  // RTL: اليوم الأول على اليمين
  const xOf = (i) => W - (i + 0.5) * step;
  const yOf = (v) => H - (v / max) * (H - 6);
  const area = n > 32;
  const pick = (clientX) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const i = Math.floor(((r.right - clientX) / r.width) * n);
    setAt(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e) => {
    const k = { ArrowLeft: 1, ArrowRight: -1, Home: -n, End: n }[e.key];
    if (k == null) return;
    e.preventDefault();
    setKb(true);
    setAt((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + k)));
  };
  const cur = at == null ? null : daily[at];
  const summary = `الزيارات اليومية من ${dateOnly(daily[0].day)} إلى ${dateOnly(daily[n - 1].day)}، أعلاها ${max} في ${dateOnly(peak.day)}`;
  const line = daily.map((x, i) => `${xOf(i).toFixed(1)},${yOf(x.visits).toFixed(1)}`).join(' ');
  return (
    <>
      <p className="sr-only" aria-live="polite">{kb && cur ? `${weekDay(cur.day)}: ${cur.visits} زيارة، ${cur.views} مشاهدة` : ''}</p>
      <p className="vs-tip tnum">{cur ? <>{weekDay(cur.day)}: <b>{cur.visits}</b> زيارة، {cur.views} مشاهدة</> : <span className="la-muted">المس الرسم أو مرّر عليه، أو ركّز عليه واستعمل الأسهم</span>}</p>
      <div className="vs-chart">
        <span className="vs-axis-max tnum" aria-hidden="true">{max}</span>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary} tabIndex={0}
          onPointerMove={(e) => { setKb(false); pick(e.clientX); }} onPointerDown={(e) => { setKb(false); pick(e.clientX); }} onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}
          onKeyDown={onKey} onFocus={() => { setKb(true); setAt((i) => i ?? n - 1); }} onBlur={() => { setKb(false); setAt(null); }}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="vs-base" />
          <line x1="0" x2={W} y1={6} y2={6} className="vs-grid" />
          {area ? (
            <>
              <polygon className="vs-area" points={`${xOf(0)},${H} ${line} ${xOf(n - 1)},${H}`} />
              <polyline className="vs-line" points={line} />
            </>
          ) : daily.map((x, i) => (
            <rect key={x.day} className="vs-bar" x={xOf(i) - step * 0.38} width={step * 0.76} y={yOf(x.visits)} height={H - yOf(x.visits)} />
          ))}
          {cur && <line className="vs-cursor" x1={xOf(at)} x2={xOf(at)} y1="0" y2={H} />}
        </svg>
        <div className="vs-axis-x la-muted" aria-hidden="true"><span>{dateOnly(daily[0].day)}</span><span>{dateOnly(daily[n - 1].day)}</span></div>
      </div>
      <button type="button" className="btn-sm ghost vs-astable" aria-expanded={table} onClick={() => setTable(!table)}>{table ? 'أخفِ الجدول' : 'عرض كجدول'}</button>
      {table && (
        <table className="la-table vs-table" tabIndex={0} aria-label="الزيارات يومًا بيوم">
          <thead><tr><th scope="col">اليوم</th><th scope="col">الزيارات</th><th scope="col">المشاهدات</th></tr></thead>
          <tbody>{[...daily].reverse().map((x) => <tr key={x.day}><td>{dateOnly(x.day)}</td><td className="tnum">{x.visits}</td><td className="tnum">{x.views}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
}

// عدد ونسبة مع شريط خلفي بالنسبة من المجموع (لا من أكبر قيمة)
const Share = ({ n, total }) => (
  <span className="vs-share"><span className="vs-share-bar" aria-hidden="true" style={{ width: `${pct(n, total)}%` }} /><b className="tnum">{n}</b><bdi dir="ltr" className="la-muted tnum">{pct(n, total)}%</bdi></span>
);

function Pages({ pages, site }) {
  const [all, setAll] = useState(false);
  const total = sum(pages, 'visits');
  const list = all ? pages : pages.slice(0, TOP);
  return (
    <section className="la-card">
      <h3>أكثر الصفحات زيارة</h3>
      {!pages.length ? <Empty compact title="لا صفحات في هذه المدة" /> : (
        <>
          <table className="la-table vs-pages" tabIndex={0} aria-label="أكثر الصفحات زيارة">
            <thead><tr><th scope="col">الصفحة</th>{!site && <th scope="col">الموقع</th>}<th scope="col">الزيارات</th><th scope="col">المشاهدات</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.site + p.path}><td><bdi dir="ltr">{p.path}</bdi></td>{!site && <td>{siteName(p.site)}</td>}<td><Share n={p.visits} total={total} /></td><td className="tnum">{p.views}</td></tr>
            ))}</tbody>
          </table>
          {pages.length > TOP && <button type="button" className="btn-sm ghost" aria-expanded={all} onClick={() => setAll(!all)}>{all ? `أفضل ${TOP}` : `عرض الكل (${pages.length})`}</button>}
        </>
      )}
    </section>
  );
}

function Sources({ refs }) {
  const [all, setAll] = useState(false);
  const total = sum(refs, 'visits');
  const list = all ? refs : refs.slice(0, TOP);
  return (
    <>
      <h3>من أين يأتون</h3>
      {!refs.length ? <Empty compact title="لا مصادر في هذه المدة" /> : (
        <>
          <ul className="vs-list" role="list">{list.map((r) => <li key={r.label}>{r.label === DIRECT ? <span>{r.label}</span> : <bdi dir="ltr">{r.label}</bdi>}<Share n={r.visits} total={total} /></li>)}</ul>
          {refs.length > TOP && <button type="button" className="btn-sm ghost" aria-expanded={all} onClick={() => setAll(!all)}>{all ? `أفضل ${TOP}` : `عرض الكل (${refs.length})`}</button>}
        </>
      )}
    </>
  );
}

function Devices({ devices }) {
  const total = sum(devices, 'visits');
  return (
    <>
      <h3>بأي جهاز</h3>
      {!total ? <p className="la-muted">لا أجهزة في هذه المدة.</p> : (
        <p className="vs-devices tnum">{[...devices].sort((a, b) => b.visits - a.visits).map((r, i) => <React.Fragment key={r.label || i}>{i > 0 && ' · '}{DEVICE[r.label] || r.label || 'غير معروف'} <bdi dir="ltr">{pct(r.visits, total)}%</bdi></React.Fragment>)}</p>
      )}
    </>
  );
}
