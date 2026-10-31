// ════════════════════════════════════════════════════════════════
// مصفوفة التأثير داخل لوحة الإدارة: نظرة عامة، والتسجيلات، والتقارير، والمحتوى، والإحصاءات
// ════════════════════════════════════════════════════════════════
// الخادم نفسه (admin-api: list-regs وunlock-reg) والجلسة نفسها، والعمليات من مصدرها
// الواحد (src/lib/procs.js) وتحليل الحجوزات من src/lib/analysis.js، فلا نسخة ثانية لأي منطق.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { Spinner, useUI } from '../ui.jsx';
import { navigate } from '../route.js';
import FilterBar, { useFilters } from '../FilterBar.jsx';
import { applyFilters, presetCounts } from '../filters.js';
import { buildProcs, PROC_COUNT } from '../../../src/lib/procs.js';
import { analyzeBookings } from '../../../src/lib/analysis.js';
import { publicRead } from '../../../src/lib/api.js';
import { TRACKS } from '../../../src/config/constants.js';
import { DEMO_KEY } from '../../../src/hooks/useDemographics.js';

const TABS = [['overview', 'نظرة عامة'], ['regs', 'التسجيلات'], ['reports', 'التقارير'], ['content', 'المحتوى'], ['stats', 'الإحصاءات']];
const DAY = 864e5;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '·');
const booked = (r) => Object.keys(r.dates || {}).length;
const confirmedOf = (r) => Object.values(r.confirmed || {}).filter(Boolean).length;
const people = (r) => (r[DEMO_KEY] || []).filter((x) => x.name?.trim());
const statusOf = (r) => (r.reopenRequested ? 'reopen' : r.submitted ? 'submitted' : booked(r) ? 'progress' : 'new');
const STATUS_AR = { reopen: ['يطلب إعادة الفتح', 'bad'], submitted: ['خطة مكتملة', 'ok'], progress: ['قيد التخطيط', 'warn'], new: ['لم يبدأ', ''] };

const PRESETS = [
  { key: 'reopen', label: 'تطلب إعادة الفتح', test: (r) => !!r.reopenRequested },
  { key: 'submitted', label: 'خطط مكتملة', test: (r) => !!r.submitted },
  { key: 'progress', label: 'قيد التخطيط', test: (r) => !r.submitted && booked(r) > 0 },
  { key: 'idle', label: 'متوقف 14 يومًا', test: (r, now) => !r.submitted && now - Date.parse(r.updatedAt || r.registeredAt) > 14 * DAY },
  { key: 'nodemo', label: 'بلا تحليل الشبكة', test: (r) => !people(r).length },
];

function useMatrix() {
  const [regs, setRegs] = useState(null);
  const [details, setDetails] = useState({});
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    const r = await call('list-regs');
    if (!r.success) { setRegs([]); setError(r.message); return; }
    setRegs((r.registrations || []).sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt)));
  }, []);
  useEffect(() => {
    load();
    publicRead('process_details?select=*').then((rows) => setDetails(Object.fromEntries((rows || []).map((x) => [x.process_key, x])))).catch(() => {});
  }, [load]);
  const procs = useMemo(() => buildProcs(details), [details]);
  return { regs, procs, error, load };
}

function Overview({ regs, procs, onOpen, onTab }) {
  const done = regs.filter((r) => r.submitted).length;
  const reopen = regs.filter((r) => r.reopenRequested);
  const avg = regs.length ? Math.round((regs.reduce((a, r) => a + booked(r), 0) / (regs.length * PROC_COUNT)) * 100) : 0;
  const idle = regs.filter((r) => !r.submitted && Date.now() - Date.parse(r.updatedAt || r.registeredAt) > 14 * DAY);
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">الجهات المسجلة</div><div className="stat-value">{regs.length}</div><div className="stat-sub">في مصفوفة التأثير</div></div>
        <div className="stat-card"><div className="stat-label">خطط مكتملة</div><div className="stat-value s-replied">{done}</div><div className="stat-sub">{regs.length ? Math.round((done / regs.length) * 100) : 0}% من المسجلين</div></div>
        <div className="stat-card"><div className="stat-label">تطلب إعادة الفتح</div><div className="stat-value s-new">{reopen.length}</div><div className="stat-sub">بانتظار قرارك</div></div>
        <div className="stat-card"><div className="stat-label">متوسط الإنجاز</div><div className="stat-value">{avg}%</div><div className="stat-sub">من {PROC_COUNT} عملية</div></div>
      </div>
      <section className="la-card">
        <h3>يحتاج تدخلك</h3>
        {!reopen.length && !idle.length ? <p className="la-muted">لا شيء الآن.</p> : (
          <ul className="la-reqs">
            {reopen.map((r) => <li key={r.id}><span><b>{r.name}</b> طلب إعادة فتح خطته المكتملة</span><button className="la-link" onClick={() => onOpen(r.id)}>افتح</button></li>)}
            {idle.slice(0, 8).map((r) => <li key={r.id}><span><b>{r.name}</b> متوقف منذ {fmt(r.updatedAt || r.registeredAt)} عند {booked(r)} من {PROC_COUNT}</span><button className="la-link" onClick={() => onOpen(r.id)}>افتح</button></li>)}
          </ul>
        )}
        <div className="la-row" style={{ marginTop: 10 }}><button className="btn-sm ghost" onClick={() => onTab('regs')}>كل التسجيلات</button><button className="btn-sm ghost" onClick={() => onTab('reports')}>التقارير</button></div>
      </section>
      <Stats regs={regs} procs={procs} />
    </>
  );
}

function Registrations({ regs, procs, canWrite, id, onOpen, reload }) {
  const [f, setF, clearF, replaceF] = useFilters(['q', 'view', 'joined']);
  const fields = useMemo(() => [{ key: 'joined', label: 'التسجيل', all: 'أي تاريخ تسجيل', type: 'period', get: (r) => r.registeredAt }], []);
  const rows = useMemo(() => applyFilters(regs, { fields, presets: PRESETS, text: (r) => [r.name, r.email, r.phone, r.org].join(' ') }, f), [regs, f, fields]);
  const counts = useMemo(() => presetCounts(regs, PRESETS), [regs]);
  const reg = regs.find((r) => String(r.id) === String(id));
  if (reg) return <RegDetail r={reg} procs={procs} canWrite={canWrite} onBack={() => onOpen(null)} reload={reload} />;
  return (
    <section className="la-card">
      <FilterBar scope="matrix" state={f} set={setF} clear={clearF} replace={replaceF} fields={fields} presets={PRESETS} counts={counts}
        shown={rows.length} total={regs.length} noun="تسجيل" placeholder="ابحث بالاسم أو البريد أو الجوال" />
      <div className="table-wrap"><table className="data-table la-cards mx-table">
        <thead><tr><th>المسجّل</th><th>الإنجاز</th><th>التأكيد</th><th>الشبكة</th><th>التسجيل</th><th>الحالة</th></tr></thead>
        <tbody>{rows.length ? rows.map((r) => {
          const [l, t] = STATUS_AR[statusOf(r)];
          const pct = Math.round((booked(r) / PROC_COUNT) * 100);
          return (
            <tr key={r.id} className="la-click" onClick={() => onOpen(r.id)}>
              <td data-label="المسجّل"><b>{r.name}</b><br /><small className="la-muted" dir="ltr">{r.email}</small></td>
              <td data-label="الإنجاز"><span className="mx-prog"><i style={{ width: `${pct}%` }} /></span> {booked(r)}/{PROC_COUNT}</td>
              <td data-label="التأكيد">{confirmedOf(r)}</td>
              <td data-label="الشبكة">{people(r).length || <span className="la-muted">·</span>}</td>
              <td data-label="التسجيل">{fmt(r.registeredAt)}</td>
              <td data-label="الحالة"><span className={`la-chip ${t}`}>{l}</span></td>
            </tr>
          );
        }) : <tr><td colSpan={6} className="la-empty">{regs.length ? 'لا نتائج لهذه الفلاتر.' : 'لا تسجيلات بعد.'}</td></tr>}</tbody>
      </table></div>
    </section>
  );
}

function RegDetail({ r, procs, canWrite, onBack, reload }) {
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState('schedule');
  const a = analyzeBookings(procs, r.dates || {}, r.confirmed || {});
  const unlock = async () => {
    if (!(await confirm(`فتح خطة ${r.name} للتعديل؟ تعود إلى «قيد التخطيط» حتى يقدّمها من جديد.`))) return;
    const res = await call('unlock-reg', { id: r.id });
    toast(res.success ? 'فُتحت الخطة للتعديل' : res.message);
    if (res.success) reload();
  };
  const [l, t] = STATUS_AR[statusOf(r)];
  return (
    <div className="ex-profile">
      <button className="la-link" onClick={onBack}>→ كل التسجيلات</button>
      <section className="la-card ex-head">
        <div><h3>{r.name}</h3><p className="la-muted" dir="ltr">{[r.email, r.phone].filter(Boolean).join(' · ')}</p>
          <small className="la-muted">سُجّل {fmt(r.registeredAt)}{r.submittedAt ? ` · قُدّمت ${fmt(r.submittedAt)}` : ''}</small></div>
        <div className="ex-side"><span className={`la-chip ${t}`}>{l}</span>
          {canWrite && r.submitted && <button className="btn-sm primary" onClick={unlock}>{r.reopenRequested ? 'اقبل إعادة الفتح' : 'افتح للتعديل'}</button>}</div>
      </section>
      <div className="ex-kpis">
        <span><b>{booked(r)}/{PROC_COUNT}</b>عملية بموعد</span>
        <span><b>{confirmedOf(r)}</b>مؤكدة</span>
        <span><b>{a ? a.trackCoverage.covered : 0}/{TRACKS.length}</b>مسارات مغطاة</span>
        <span><b>{a ? a.pattern.nameAr : '·'}</b>نمط التخطيط</span>
        <span><b>{people(r).length}</b>شخص في الشبكة</span>
      </div>
      <nav className="flt-presets la-row" aria-label="أقسام التسجيل">
        {[['schedule', 'المواعيد'], ['analysis', 'التحليل'], ['network', 'الشبكة']].map(([k, v]) => <button key={k} className={`flt-preset${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{v}</button>)}
      </nav>
      <section className="la-card">
        {tab === 'schedule' && (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الموعد</th><th>الحالة</th></tr></thead>
            <tbody>{procs.map((p, j) => {
              const d = r.dates?.[p.key]; const c = r.confirmed?.[p.key];
              return <tr key={p.key}><td>{j + 1}</td><td><b>{p.nameAr}</b></td><td style={{ color: p.trackColor }}>{p.trackNameAr}</td><td>{d ? fmt(d) : <span className="la-muted">·</span>}</td>
                <td>{c ? <span className="la-chip ok">مؤكد</span> : d ? <span className="la-chip warn">بموعد</span> : <span className="la-muted">·</span>}</td></tr>;
            })}</tbody>
          </table></div>
        )}
        {tab === 'analysis' && (!a ? <p className="la-muted">يظهر التحليل بعد ثلاثة مواعيد على الأقل.</p> : <>
          <p><b>{a.pattern.nameAr}</b> · الجاهزية: {a.readinessAr}</p>
          {a.depGaps.length > 0 && <div className="la-err">تبعيات مفقودة: {a.depGaps.map((g) => `${g.process} يحتاج ${g.missing}`).join('، ')}</div>}
          {a.recommendations.length > 0 && <ul className="la-reqs">{a.recommendations.map((x, i) => <li key={i}><span>{typeof x === 'string' ? x : x.text}</span></li>)}</ul>}
        </>)}
        {tab === 'network' && (!people(r).length ? <p className="la-muted">لم يكمل تحليل الشبكة بعد.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>الشخص</th><th>الدور</th><th>معرفي</th><th>مجتمعي</th><th>مالي</th><th>اقتصادي</th><th>سيادي</th></tr></thead>
            <tbody>{people(r).map((x, i) => (
              <tr key={i}><td><b>{x.name}</b></td><td>{x.role || x.relation || '·'}</td>
                {['knowledge', 'social', 'financial', 'economic', 'sovereign'].map((k) => <td key={k}>{x.power?.[k] ?? x[k] ?? '·'}</td>)}</tr>
            ))}</tbody>
          </table></div>
        ))}
      </section>
    </div>
  );
}

function Reports({ regs, procs, onOpen }) {
  const list = regs.map((r) => ({ r, a: analyzeBookings(procs, r.dates || {}, r.confirmed || {}) }));
  return (
    <section className="la-card">
      <h3>تقارير الجهات</h3>
      <p className="la-muted">نمط تخطيط كل جهة وجاهزيتها وتغطيتها للمسارات، من تحليل حجوزاتها. يظهر لمن حدد ثلاثة مواعيد فأكثر.</p>
      <div className="table-wrap"><table className="data-table la-cards">
        <thead><tr><th>الجهة</th><th>النمط</th><th>المسارات</th><th>الجاهزية</th><th>تبعيات مفقودة</th></tr></thead>
        <tbody>{list.map(({ r, a }) => (
          <tr key={r.id} className="la-click" onClick={() => onOpen(r.id)}>
            <td data-label="الجهة"><b>{r.name}</b></td>
            <td data-label="النمط">{a ? a.pattern.nameAr : <span className="la-muted">أقل من 3 مواعيد</span>}</td>
            <td data-label="المسارات">{a ? `${a.trackCoverage.covered}/${TRACKS.length}` : '·'}</td>
            <td data-label="الجاهزية">{a ? a.readinessAr : '·'}</td>
            <td data-label="تبعيات مفقودة">{a ? a.depGaps.length : '·'}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function Content({ procs }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="la-card">
      <h3>محتوى العمليات</h3>
      <p className="la-muted">نصوص العمليات الست عشرة كما تظهر للجهات. للعرض هنا، والتعديل من قاعدة البيانات (process_details).</p>
      <ul className="la-reqs">{procs.map((p) => (
        <li key={p.key} style={{ display: 'block' }}>
          <button className="la-link" aria-expanded={open === p.key} onClick={() => setOpen(open === p.key ? null : p.key)} style={{ color: p.trackColor }}>{p.trackNameAr} · {p.nameAr}</button>
          {open === p.key && <div className="mx-content">
            {[['البصيرة المنهجية', p.insight], ['لماذا يهم', p.whyItMatters], ['الوصف', p.fullDesc]].map(([l, v]) => <p key={l}><b>{l}:</b> {v || <span className="la-muted">لا نص</span>}</p>)}
          </div>}
        </li>
      ))}</ul>
    </section>
  );
}

function Stats({ regs, procs }) {
  const n = regs.length || 1;
  return (
    <section className="la-card">
      <h3>توزيع المسارات</h3>
      <div className="la-funnel">{TRACKS.map((tr) => {
        const per = procs.filter((p) => p.trackId === tr.id).length || 1;
        const count = regs.reduce((a, r) => a + Object.keys(r.dates || {}).filter((k) => k.startsWith(tr.id)).length, 0);
        return <div key={tr.id} className="la-fn"><span className="la-fn-l" style={{ color: tr.color }}>{tr.nameAr}</span>
          <span className="la-fn-bar"><i style={{ width: `${(count / (per * n)) * 100}%`, background: tr.color }} /></span><b>{count}</b></div>;
      })}</div>
    </section>
  );
}

export default function Matrix({ canWrite, tab, id }) {
  const { regs, procs, error, load } = useMatrix();
  const t = TABS.some(([k]) => k === tab) ? tab : 'overview';
  const go = (k, rid = null) => navigate({ ctx: 'matrix', tab: k, id: rid });
  return (
    <div className="dash-body">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Impact Matrix</div>
          <div className="page-title">مصفوفة التأثير</div>
          <div className="page-title-ar">matrix.sunkvalue.com · التسجيلات وخطط الجهات وتقاريرها</div>
        </div>
        {!canWrite && <span className="la-chip">عرض فقط</span>}
      </div>
      <nav className="la-tabs" aria-label="أقسام المصفوفة">
        {TABS.map(([k, l]) => <button key={k} className={t === k ? 'on' : ''} aria-current={t === k ? 'page' : undefined} onClick={() => go(k)}>{l}</button>)}
      </nav>
      <div className="la-body">
        {!regs ? <Spinner /> : error ? <div className="la-err">{error} <button className="btn-sm ghost" onClick={load}>حاول مرة أخرى</button></div>
          : t === 'overview' ? <Overview regs={regs} procs={procs} onOpen={(rid) => go('regs', rid)} onTab={go} />
          : t === 'regs' ? <Registrations regs={regs} procs={procs} canWrite={canWrite} id={id} onOpen={(rid) => go('regs', rid)} reload={load} />
          : t === 'reports' ? <Reports regs={regs} procs={procs} onOpen={(rid) => go('regs', rid)} />
          : t === 'content' ? <Content procs={procs} />
          : <Stats regs={regs} procs={procs} />}
      </div>
    </div>
  );
}
