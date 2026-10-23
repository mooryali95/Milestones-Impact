// ════════════════════════════════════════════════════════════════
// بوابة منسق الجهة (/org): الدخول برمز البريد، ثم لوحة الجهة للاطلاع
// ════════════════════════════════════════════════════════════════
// كل ما يظهر يأتي من الخادم مصفّى بصلاحيات المنسق؛ لا تعديل هنا.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { coordCall, coordSession, setCoordExpired } from '../api.js';
import { filterRows, sortRows } from '../coord.js';
import { LEVELS } from '../labels.js';
import { JourneySkeleton } from '../ui.jsx';

const STATUS = {
  registered: 'مسجّل', profiled: 'أكمل الملف', assessing: 'يجيب على القياس', pending_approval: 'بانتظار الاعتماد',
  placed: 'معتمد المستوى', enrolled: 'في البرنامج', completed: 'أنهى البرنامج', withdrawn: 'منسحب', suspended: 'موقوف',
};
const FUNNEL = [['registered', 'سجّل'], ['profiled', 'أكمل الملف'], ['assessed', 'أنهى القياس'], ['approved', 'اعتُمد مساره'], ['completed', 'أنهى البرنامج']];
const VIA = { link: 'رابط الجهة', domain: 'موقع الجهة', admin: 'أضافته الإدارة', none: 'غير محدد' };
const DIMS = [['milestone', 'Milestone'], ['impact', 'Impact'], ['leadership', 'Leadership']];
const lvl = (k) => LEVELS.find((l) => l.key === k)?.title || '·';
const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '·');

function SignIn({ onIn, initialError }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const ref = useRef(null);
  useEffect(() => { if (step === 'code') ref.current?.focus(); }, [step]);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await coordCall('coord.auth-start', { email });
    setBusy(false);
    if (!r.success) return setError(r.message);
    setStep('code');
  };
  const verify = async (v) => {
    setBusy(true); setError('');
    const r = await coordCall('coord.auth-verify', { email, code: v });
    setBusy(false);
    if (r.success) onIn(r); else { setError(r.message); setCode(''); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth card stack">
        {step === 'email' ? (
          <form className="stack" onSubmit={start}>
            <div>
              <p className="eyebrow">لوحة الجهة · برنامج القادة</p>
              <h1>دخول منسق الجهة</h1>
              <p className="muted">أدخل البريد المسجّل لدى Milestone Impact، ونرسل لك رمز دخول. لا كلمات مرور.</p>
            </div>
            <label className="field"><span>البريد الإلكتروني</span>
              <input className="input ltr" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@org.sa" />
            </label>
            {error && <div className="alert err">{error}</div>}
            <button className="btn block" disabled={busy || !email}>{busy ? 'لحظة…' : 'أرسل الرمز'}</button>
          </form>
        ) : (
          <div className="stack">
            <div>
              <p className="eyebrow">تحقّق من بريدك</p>
              <h1>أدخل رمز الدخول</h1>
              <p className="muted">إن كان <b className="ltr">{email}</b> مسجّلًا منسقًا لجهة، وصله رمز من 6 أرقام ورابط دخول.</p>
            </div>
            <input ref={ref} className="input code-input" inputMode="numeric" autoComplete="one-time-code" aria-label="رمز التحقق" placeholder="••••••"
              value={code} disabled={busy} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(d); if (d.length === 6) verify(d); }} />
            {error && <div className="alert err">{error}</div>}
            <button type="button" className="link small" onClick={() => { setStep('email'); setError(''); }}>تغيير البريد</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Bars({ obj, label = (k) => k, total }) {
  const list = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!list.length) return <p className="small muted">لا بيانات بعد.</p>;
  return <div className="op-bars">{list.map(([k, n]) => (
    <div key={k} className="op-bar"><span>{label(k)}</span><i><b style={{ width: `${(n / Math.max(1, total)) * 100}%` }} /></i><em>{n}</em></div>
  ))}</div>;
}

function Dashboard({ me, onLogout }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ q: '', status: '', track: '' });
  const [sort, setSort] = useState('name');
  const load = () => { setD(null); coordCall('coord.dashboard').then(setD); };
  useEffect(load, []);

  const rows = useMemo(() => (d?.success ? sortRows(filterRows(d.participants, f), sort) : []), [d, f, sort]);
  if (!d) return <JourneySkeleton />;
  if (!d.success) return <div className="page narrow"><div className="alert err">{d.message}</div><button className="btn sm" style={{ marginTop: 12 }} onClick={load}>حاول مرة أخرى</button></div>;

  const { org, kpis, funnel, permissions: perms } = d;
  const tracks = Object.entries(d.by_track || {}).sort((a, b) => b[1] - a[1]);
  const titleOf = (k) => d.participants.find((p) => p.track === k)?.track_title || k;
  // محرك الوثائق وExcel يُحمَّلان عند الطلب فقط
  const exportXlsx = async () => {
    const { exportWorkbook } = await import('../../../src/lib/brand/xlsx.js');
    const head = [['الاسم', 26], ['المسمى', 22], ['المسار', 28], ['المرحلة', 18], ['الإنجاز %', 11], ['آخر دخول', 16], ['التسجيل', 16],
      ...(perms.contact ? [['البريد', 30], ['الجوال', 16]] : []), ...(perms.scores ? DIMS.map(([, en]) => [en, 12]) : [])];
    exportWorkbook(
      { kind: 'ORG', title: `مشاركو ${org.name}`, subtitle: 'برنامج القادة', for: org.name, sheet: 'المشاركون', file: 'Organization' },
      head.map(([label, width]) => ({ label, width })),
      rows.map((p) => [p.full_name, p.job_title, p.track_title || p.track, STATUS[p.status] || p.status, p.progress, fmt(p.last_login_at), fmt(p.created_at),
        ...(perms.contact ? [p.email, p.phone] : []), ...(perms.scores ? DIMS.map(([k]) => lvl(p.levels?.[k])) : [])]),
    );
  };
  const printReport = async () => {
    const win = window.open('', '_blank');   // تُفتح قبل التحميل حتى لا يحجبها المتصفح
    const [{ writeDocument }, { orgReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/reports.js')]);
    const { meta, body } = orgReport({ ...d, participants: rows }, 'coordinator');
    if (!writeDocument(win, meta, body)) alert('اسمح بالنوافذ المنبثقة لعرض التقرير');
  };
  return (
    <div className="page op" style={org.color ? { '--org': org.color } : undefined}>
      <section className="hero op-hero">
        <div className="stack">
          <p className="eyebrow">لوحة الجهة · للاطلاع</p>
          <h1>{org.name}</h1>
          <p className="muted">أهلًا {me.coordinator.full_name || ''}. هذه لوحة مشاركي جهتك في برنامج القادة، وتتحدث مع كل نشاط.</p>
          <div className="row">
            {perms.export && <><button className="btn ghost sm" style={{ color: '#EAF0F0' }} onClick={exportXlsx}>تصدير Excel</button>
              <button className="btn ghost sm" style={{ color: '#EAF0F0' }} onClick={printReport}>تقرير الجهة</button></>}
            <button className="link small" style={{ color: '#EAF0F0' }} onClick={onLogout}>خروج</button>
          </div>
        </div>
        <div className="op-seats"><b>{kpis.total}</b><small>{org.seats ? `من ${org.seats} مقعد` : 'مشارك'}</small></div>
      </section>

      <div className="op-kpis">
        {[['انضموا هذا الأسبوع', kpis.joined_week], ['نشطون هذا الأسبوع', kpis.active_week], ['اعتُمد مسارهم', kpis.approved], ['أنهوا البرنامج', kpis.completed], ['متوسط الإنجاز', `${kpis.avg_progress}%`]]
          .map(([l, n]) => <div key={l} className="card op-kpi"><b>{n}</b><span className="small muted">{l}</span></div>)}
      </div>

      <div className="op-grid">
        <section className="card"><h3>مراحل الرحلة</h3><Bars obj={Object.fromEntries(FUNNEL.map(([k, l]) => [l, funnel[k] || 0]))} total={funnel.registered} /></section>
        <section className="card"><h3>المسارات</h3>
          {tracks.length ? <Bars obj={Object.fromEntries(tracks.map(([k, n]) => [titleOf(k), n]))} total={kpis.total} /> : <p className="small muted">لم يُعتمد مسار أحد بعد.</p>}</section>
        <section className="card"><h3>طريقة الانضمام</h3><Bars obj={d.by_via} label={(k) => VIA[k] || k} total={kpis.total} /></section>
      </div>

      <section className="card op-table">
        <div className="row between op-tools">
          <h3>المشاركون</h3>
          <div className="row">
            <input className="input" aria-label="بحث" placeholder="بحث بالاسم أو المسمى…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <select className="input" aria-label="المرحلة" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">كل المراحل</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="input" aria-label="المسار" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value })}>
              <option value="">كل المسارات</option>{tracks.map(([k]) => <option key={k} value={k}>{titleOf(k)}</option>)}
            </select>
            <select className="input" aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">بالاسم</option><option value="progress">بالإنجاز</option><option value="recent">بآخر نشاط</option>
            </select>
          </div>
        </div>
        <p className="small muted" aria-live="polite">{rows.length} من {kpis.total}</p>
        <div className="op-scroll"><table>
          <thead><tr><th>الاسم</th><th>المسار</th><th>المرحلة</th><th>الإنجاز</th><th>آخر دخول</th>
            {perms.contact && <th>التواصل</th>}{perms.scores && DIMS.map(([k, en]) => <th key={k}>{en}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((p) => (
            <tr key={p.id}>
              <td><b>{p.full_name}</b><br /><small className="muted">{p.job_title}</small></td>
              <td>{p.track_title || <span className="muted">·</span>}{p.track && !p.approved && <small className="muted"> (مبدئي)</small>}</td>
              <td><span className="chip">{STATUS[p.status] || p.status}</span></td>
              <td><span className="op-prog"><i style={{ width: `${p.progress}%` }} /></span> {p.progress}%</td>
              <td>{fmt(p.last_login_at)}</td>
              {perms.contact && <td className="ltr"><small>{p.email}<br />{p.phone}</small></td>}
              {perms.scores && DIMS.map(([k]) => <td key={k}>{lvl(p.levels?.[k])}</td>)}
            </tr>
          )) : <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>{kpis.total ? 'لا نتائج لهذا البحث.' : 'لم ينضم أحد من جهتك بعد. شارك رابط الدعوة الذي أرسلته لك الإدارة.'}</td></tr>}</tbody>
        </table></div>
      </section>
      <p className="small muted">بيانات المشاركين سرية، ومخصصة لمتابعة برنامج جهتك فقط.</p>
    </div>
  );
}

export default function OrgPortal() {
  const [me, setMe] = useState(null);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setCoordExpired((m) => { setMe(null); setError(m || ''); });
    (async () => {
      // رابط البريد: /org/verify?e=...&t=...
      if (location.pathname === '/org/verify') {
        const q = new URLSearchParams(location.search);
        history.replaceState(null, '', '/org');
        const r = await coordCall('coord.auth-verify', { email: q.get('e'), link: q.get('t') });
        if (r.success) { coordSession.set(r.token); setMe(r); } else setError(r.message);
      } else if (coordSession.get()) {
        const r = await coordCall('coord.me');
        if (r.success) setMe(r);
      }
      setBoot(false);
    })();
  }, []);

  const signedIn = (r) => { coordSession.set(r.token); setMe(r); };
  const logout = async () => { await coordCall('coord.logout'); coordSession.clear(); setMe(null); };

  if (boot) return <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  return me ? <Dashboard me={me} onLogout={logout} /> : <SignIn onIn={signedIn} initialError={error} />;
}
