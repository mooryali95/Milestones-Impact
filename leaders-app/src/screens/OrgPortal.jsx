// ════════════════════════════════════════════════════════════════
// بوابة منسق الجهة (/org): الدخول برمز البريد، ثم لوحة الجهة للاطلاع
// ════════════════════════════════════════════════════════════════
// كل ما يظهر يأتي من الخادم مصفّى بصلاحيات المنسق؛ لا تعديل هنا.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SusCard from '../SusCard.jsx';
import OtherDoors from '../Doors.jsx';
import AccountSwitch from '../AccountSwitch.jsx';
import { coordCall, coordSession, setCoordExpired } from '../api.js';
import { filterRows, sortRows } from '../coord.js';
import { LEVELS } from '../labels.js';
import { JourneySkeleton, POPUP_BLOCKED } from '../ui.jsx';
import Captcha from '../Captcha.jsx';
import { captchaGate } from '../captcha.js';
import PortalConsent, { RatersAwaiting } from '../PortalConsent.jsx';

import { PARTICIPANT_STATUS as STATUS, FUNNEL, DIM_AR } from '../../../supabase/functions/leaders-api/labels.js';
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

  const [captchaKey, setCaptchaKey] = useState(null);
  const start = async (e, captcha) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const r = await coordCall('coord.auth-start', { email, captcha });
    setBusy(false);
    if (r.code === 'captcha') { const g = captchaGate(r, captcha); setCaptchaKey(g.box); return setError(g.error); }
    setCaptchaKey(null);
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
            {captchaKey && <Captcha key={captchaKey.n} siteKey={captchaKey.site} onToken={(t) => start(null, t)} />}
            <button className="btn block" disabled={busy || !email}>{busy ? 'لحظة…' : 'أرسل الرمز'}</button>
            <OtherDoors here="org" />
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

// أثر الجهة: القياس المبدئي مقابل البعدي كما يحسبه الخادم، دون أي حساب هنا

// محفظة مبادرات الدفعة: مشاريع تخرج مشاركي الجهة. الوثيقة كاملة بعد اعتمادها
const SCOPE_AR = { project: 'مشروع', program: 'برنامج', portfolio: 'محفظة' };
const HEALTH_CHIP = { green: 'ok', amber: 'warn', red: 'bad', stale: 'warn', pending: '', closed: 'ok' };
const pctOf = (v) => (v == null ? '·' : `${v}%`);
function Initiatives({ list, outcomes }) {
  const [msg, setMsg] = useState('');
  if (!list.length) return null;
  const approved = list.filter((x) => x.status === 'approved');
  const cost = approved.reduce((a, x) => a + (x.cost || 0), 0);
  const open = async (x) => {
    const win = window.open('', '_blank');
    const r = await coordCall('coord.capstone', { participant_id: x.participant_id });
    if (!r.success) { win?.close(); return setMsg(r.message); }
    const [{ writeDocument }, { capstoneReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/capstone.js')]);
    const { meta, body } = capstoneReport(r.doc);
    if (!writeDocument(win, meta, body)) setMsg(POPUP_BLOCKED);
  };
  return (
    <section className="card op-table">
      <h3>محفظة مبادرات الجهة</h3>
      <p className="small muted">مبادرات مشاركيك: مشاريع حقيقية في جهتك. {approved.length} معتمدة{cost ? ` بتكلفة تقديرية ${Math.round(cost).toLocaleString('en-US')} ريال` : ''}.</p>
      {outcomes?.approved > 0 && (
        <div className="tr-kpis">
          <div><b>{outcomes.reporting}</b><small>من {outcomes.approved} تتابع تنفيذها</small></div>
          <div><b>{pctOf(outcomes.on_time)}</b><small>معالم في موعدها</small></div>
          <div><b>{pctOf(outcomes.realization)}</b><small>تحقق المنافع المقيسة</small></div>
          <div><b>{outcomes.verified}</b><small>مراجعة أثر أكّدها الرعاة</small></div>
        </div>
      )}
      {msg && <div className="alert err">{msg}</div>}
      <div className="op-scroll"><table>
        <thead><tr><th>المبادرة</th><th>القائد</th><th>النوع</th><th>الحالة</th><th>التنفيذ</th><th>تحقق المنافع</th><th>التكلفة</th><th /></tr></thead>
        <tbody>{list.map((x) => (
          <tr key={x.participant_id || x.initiative}>
            <td><b>{x.initiative}</b>{x.objective && <small className="muted" style={{ display: "block" }}>{x.objective}</small>}</td>
            <td>{x.full_name || <span className="muted">·</span>}</td><td>{SCOPE_AR[x.scope] || '·'}</td>
            <td>{x.status_title}{x.status !== 'approved' && x.readiness != null ? ` · ${x.readiness}%` : ''}</td>
            <td>{x.tracking ? <span className={`chip ${HEALTH_CHIP[x.tracking.health] || ''}`}>{x.tracking.health_title}</span> : '·'}</td>
            <td>{x.tracking ? pctOf(x.tracking.benefits.realization) : '·'}</td>
            <td>{x.cost != null ? Math.round(x.cost).toLocaleString('en-US') : '·'}</td>
            <td>{x.status === 'approved' && x.participant_id && <button className="link small" onClick={() => open(x)}>الوثيقة</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
const signed = (x) => (x == null ? '·' : x > 0 ? `+${x}` : `${x}`);
function ImpactCard({ im, onReport }) {
  if (!im) return null;
  const c = im.counts || {};
  return (
    <section className="card op-impact">
      <div className="row between"><h3>أثر البرنامج على مشاركيك</h3>{onReport && c.paired > 0 && !im.suppressed && <button className="btn sm" onClick={onReport}>تقرير الأثر PDF</button>}</div>
      <p className="small muted">{c.baseline || 0} أجروا القياس المبدئي، و{c.post || 0} أجروا البعدي، و{c.paired || 0} لديهم القياسان.</p>
      {im.caution && <div className="alert info small">{im.caution}</div>}
      {im.rows_withheld && <p className="small muted">تظهر نتائج من وافق من مشاركيك بأسمائهم حين لا يبقى غير موافق، أو يبلغ غير الموافقين خمسة على الأقل، فلا تُستنتج نتيجة أحد منهم من المتوسط.</p>}
      {im.suppressed ? <p className="small muted">تظهر المقارنة حين يكمل {im.suppressed} مشاركين على الأقل القياسين، حفاظًا على خصوصيتهم.</p> : c.paired > 0 ? (
        <div className="op-scroll"><table>
          <thead><tr><th>الإطار</th><th>قبل</th><th>بعد</th><th>الفرق</th><th>تحسن موثوق</th></tr></thead>
          <tbody>{DIMS.map(([k, en]) => {
            const x = im.cohort?.[k];
            if (!x) return null;
            return <tr key={k}><td><b>{en}</b><br /><small className="muted">{DIM_AR[k]}</small></td><td>{x.pre ?? '·'}</td><td>{x.post ?? '·'}</td><td><b>{signed(x.diff)}</b></td><td>{x.reliable_up ?? 0} من {x.n ?? 0}</td></tr>;
          })}</tbody>
        </table></div>
      ) : <p className="small muted">تظهر المقارنة حين يكمل مشاركوك القياس البعدي في نهاية البرنامج.</p>}
    </section>
  );
}

function Dashboard({ me, onLogout }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ q: '', status: '', track: '' });
  const [sort, setSort] = useState('name');
  const [msg, setMsg] = useState('');
  const load = () => { setD(null); coordCall('coord.dashboard').then(setD); };
  useEffect(load, []);

  const rows = useMemo(() => (d?.success ? sortRows(filterRows(d.participants, f), sort) : []), [d, f, sort]);
  if (!d) return <JourneySkeleton />;
  if (!d.success) return <div className="page narrow"><div className="alert err">{d.message}</div><button className="btn sm" style={{ marginTop: 12 }} onClick={load}>حاول مرة أخرى</button></div>;

  const { org, kpis, funnel, permissions: perms } = d;
  // D18: المسار مشتق من المستويات، فلا يظهر إلا مع صلاحية المستويات، والخادم يحصره فيمن وافق من المشاركين.
  // مفتاحه الداخلي لا يُعرض عنوانًا، والمسارات التي تشترك في ملف تعريف واحد تُجمع في شريط واحد
  const tracks = perms.scores ? Object.entries(d.by_track || {}).sort((a, b) => b[1] - a[1]) : [];
  const titleOf = (k) => d.track_titles?.[k] || d.participants.find((p) => p.track === k)?.track_title || 'مسار';
  const trackBars = tracks.reduce((o, [k, n]) => { const t = titleOf(k); o[t] = (o[t] || 0) + n; return o; }, {});
  // محرك الوثائق وExcel يُحمَّلان عند الطلب فقط
  const exportXlsx = async () => {
    const { exportWorkbook } = await import('../../../src/lib/brand/xlsx.js');
    const head = [['الاسم', 26], ['المسمى', 22], ...(perms.scores ? [['المسار', 28]] : []), ['المرحلة', 18], ['الإنجاز %', 11], ...(perms.activity ? [['آخر دخول', 16]] : []), ['التسجيل', 16],
      ...(perms.contact ? [['البريد', 30], ['الجوال', 16]] : []), ...(perms.scores ? DIMS.map(([, en]) => [en, 12]) : [])];
    exportWorkbook(
      { kind: 'ORG', title: `مشاركو ${org.name}`, subtitle: 'برنامج القادة', for: org.name, sheet: 'المشاركون', file: 'Organization' },
      head.map(([label, width]) => ({ label, width })),
      rows.map((p) => [p.full_name, p.job_title, ...(perms.scores ? [p.track_title || ''] : []), STATUS[p.status] || p.status, p.progress, ...(perms.activity ? [fmt(p.last_login_at)] : []), fmt(p.created_at),
        ...(perms.contact ? [p.email, p.phone] : []), ...(perms.scores ? DIMS.map(([k]) => lvl(p.levels?.[k])) : [])]),
    );
  };
  const printReport = async () => {
    const win = window.open('', '_blank');   // تُفتح قبل التحميل حتى لا يحجبها المتصفح
    const [{ writeDocument }, { orgReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/reports.js')]);
    const { meta, body } = orgReport({ ...d, participants: rows }, 'coordinator');
    if (!writeDocument(win, meta, body)) setMsg(POPUP_BLOCKED);
  };
  const printImpact = async () => {
    const win = window.open('', '_blank');
    const [{ writeDocument }, { impactReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/reports.js')]);
    const { meta, body } = impactReport(d.impact, { org: org.name, audience: 'coordinator', names: perms.scores });
    if (!writeDocument(win, meta, body)) setMsg(POPUP_BLOCKED);
  };
  return (
    <div className="page op" style={org.color ? { '--org': org.color } : undefined}>
      <section className="hero op-hero">
        <div className="stack">
          <p className="eyebrow">لوحة الجهة · للاطلاع</p>
          <h1>{org.name}</h1>
          <p className="muted">أهلًا {me.coordinator.full_name || ''}. لوحة مشاركي جهتك في برنامج القادة، تُحدَّث مع كل نشاط.</p>
          {msg && <div className="alert err small" role="alert">{msg}</div>}
          <div className="row">
            {perms.export && perms.list !== false && <><button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={exportXlsx}>تصدير Excel</button>
              <button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={printReport}>تقرير الجهة</button></>}
            <AccountSwitch here="org" doors={me.switch_to} doSwitch={(to) => coordCall('coord.switch', { to })} />
            <button className="link small" style={{ color: 'var(--brand-mist)' }} onClick={onLogout}>خروج</button>
          </div>
        </div>
        {/* D20: الاستهلاك من الرعاية المثبتة لا من عدد المسجلين، ومعه من ينتظر قرار الرعاية */}
        <div className="op-seats"><b>{org.seats ? (kpis.seats_used ?? kpis.total) : kpis.total}</b><small>{org.seats ? `من ${org.seats} مقعد${kpis.seats_waiting ? ` · ${kpis.seats_waiting} بانتظار قرار الرعاية` : ''}` : 'مشارك'}</small></div>
      </section>
      <RatersAwaiting items={d.raters_pending} onDecide={async (b) => { const r = await coordCall('coord.rater-confirm', b); if (r.success) load(); return r; }} />

      <NeedsYou d={d} />
      <SusCard call={coordCall} stateAction="coord.sus-state" submitAction="coord.sus-submit" />

      <div className="op-kpis">
        {[['انضموا هذا الأسبوع', kpis.joined_week], ['نشطون هذا الأسبوع', kpis.active_week], ['اعتُمد مسارهم', kpis.approved], ['أنهوا البرنامج', kpis.completed], ['متوسط الإنجاز', `${kpis.avg_progress}%`]]
          .map(([l, n]) => <div key={l} className="card op-kpi"><b>{n}</b><span className="small muted">{l}</span></div>)}
      </div>

      <div className="op-grid">
        <section className="card"><h3>مراحل الرحلة</h3><Bars obj={Object.fromEntries(FUNNEL.map(([k, l]) => [l, funnel[k] || 0]))} total={funnel.registered} /></section>
        <section className="card"><h3>المسارات</h3>
          {tracks.length ? <Bars obj={trackBars} total={kpis.total} />
            : <p className="small muted">{perms.scores ? 'لا مسار ظاهر بعد: يظهر هنا مسار من وافق من مشاركيك على اطلاع جهته على مستوياته متى تحددت.' : 'المسار مشتق من مستويات المشارك، فلا يظهر إلا مع صلاحية المستويات وبموافقة المشارك.'}</p>}</section>
        <section className="card"><h3>طريقة الانضمام</h3><Bars obj={d.by_via} label={(k) => VIA[k] || k} total={kpis.total} /></section>
      </div>

      <ImpactCard im={d.impact} onReport={perms.export ? printImpact : null} />
      <Initiatives list={d.initiatives || []} outcomes={d.outcomes} />

      {perms.list === false ? <section className="card"><h3>المشاركون</h3><p className="muted">صلاحيتك أرقام مجمّعة عن مشاركي جهتك، بلا أسماء ولا صفوف فردية.</p></section> : <section className="card op-table">
        <div className="row between op-tools">
          <h3>المشاركون</h3>
          <div className="row">
            <input className="input" aria-label="بحث" placeholder="بحث بالاسم أو المسمى…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <select className="input" aria-label="المرحلة" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">كل المراحل</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {tracks.length > 0 && <select className="input" aria-label="المسار" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value })}>
              <option value="">كل المسارات</option>{tracks.map(([k]) => <option key={k} value={k}>{titleOf(k)}</option>)}
            </select>}
            <select className="input" aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">بالاسم</option><option value="progress">بالإنجاز</option>{perms.activity && <option value="recent">بآخر نشاط</option>}
            </select>
          </div>
        </div>
        <p className="small muted" aria-live="polite">{rows.length} من {kpis.total}</p>
        {/* على الجوال يصير كل مشارك بطاقة (styles.css: .op-people)، فلا جدول يُمرَّر أفقيًا ولا عمود مقصوص */}
        <div className="op-scroll"><table className="op-people">
          <thead><tr><th>الاسم</th>{perms.scores && <th>المسار</th>}<th>المرحلة</th><th>الإنجاز</th>{perms.activity && <th>آخر دخول</th>}
            {perms.contact && <th>التواصل</th>}{perms.scores && DIMS.map(([k, en]) => <th key={k}>{en}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((p) => (
            <tr key={p.id}>
              <td className="op-name"><b>{p.full_name}</b><br /><small className="muted">{p.job_title}</small></td>
              {perms.scores && <td data-label="المسار">{p.track_title || <span className="muted">·</span>}{p.track && !p.approved && <small className="muted"> (مبدئي)</small>}</td>}
              <td data-label="المرحلة"><span className="chip">{STATUS[p.status] || p.status}</span></td>
              <td data-label="الإنجاز"><span><span className="op-prog"><i style={{ width: `${p.progress}%` }} /></span> {p.progress}%</span></td>
              {perms.activity && <td data-label="آخر دخول">{fmt(p.last_login_at)}</td>}
              {perms.contact && <td className="ltr op-wide" data-label="التواصل"><small>{p.email}<br />{p.phone}</small></td>}
              {perms.scores && DIMS.map(([k, en]) => <td key={k} className="op-dim" data-label={en}>{lvl(p.levels?.[k])}</td>)}
            </tr>
          )) : <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>{kpis.total ? 'لا نتائج لهذا البحث.' : 'لم ينضم أحد من جهتك بعد. شارك رابط الدعوة الذي أرسلته لك الإدارة.'}</td></tr>}</tbody>
        </table></div>
      </section>}
      <p className="small muted">بيانات المشاركين سرية، ومخصصة لمتابعة برنامج جهتك فقط.</p>
    </div>
  );
}

// ما يحتاج تدخل المنسق، أول اللوحة: كانت متفرقة في الرأس والجدول فتُعرض ولا توجّه. يُعدّ مما وصل اللوحة فعلًا
// (بحسب صلاحياته)، ولا يظهر القسم إن لم يكن فيه شيء. «متوقف» من آخر دخول، فلا يُحسب إلا لمن له صلاحية النشاط.
const STALE_DAYS = 14;
const PRE_BASELINE = ['registered', 'profiled', 'assessing'];
export function needsYou(d, now = Date.now()) {
  const ps = d.permissions?.list === false ? [] : (d.participants || []);
  const out = [];
  const raters = (d.raters_pending || []).length;
  if (raters) out.push({ key: 'raters', n: raters, text: 'مقيّمون بانتظار تأكيدك', hint: 'في بطاقة التأكيد أسفل هذا القسم' });
  if (d.kpis?.seats_waiting) out.push({ key: 'seats', n: d.kpis.seats_waiting, text: 'مشاركون بانتظار قرار الرعاية', hint: 'بلغ العقد مقاعده؛ تواصل مع إدارة البرنامج لإضافة مقاعد' });
  const notStarted = ps.filter((p) => PRE_BASELINE.includes(p.status)).length;
  if (notStarted) out.push({ key: 'baseline', n: notStarted, text: 'سجّلوا ولم يكملوا القياس المبدئي', hint: 'صفِّ القائمة بالمرحلة لتراهم' });
  if (d.permissions?.activity) {
    const stale = ps.filter((p) => !['completed', 'withdrawn'].includes(p.status) && p.last_login_at && now - new Date(p.last_login_at).getTime() > STALE_DAYS * 864e5).length;
    if (stale) out.push({ key: 'stale', n: stale, text: `لم يدخلوا منذ ${STALE_DAYS} يومًا`, hint: 'رتّب القائمة بآخر نشاط لتراهم' });
  }
  return out;
}
function NeedsYou({ d }) {
  const items = needsYou(d);
  if (!items.length) return null;
  return (
    <section className="card op-todo" aria-labelledby="op-todo-h">
      <h3 id="op-todo-h">يحتاج تدخلك</h3>
      <ul>{items.map((x) => (
        <li key={x.key}>
          <span><b>{x.n}</b> {x.text}{x.hint && <small className="muted"> · {x.hint}</small>}</span>
        </li>
      ))}</ul>
    </section>
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
  if (me?.consent_needed) return <PortalConsent role="coordinator" onAccept={async () => { const r = await coordCall('coord.consent'); if (r.success) setMe((m) => ({ ...m, ...r })); return r; }} />;
  return me ? <Dashboard me={me} onLogout={logout} /> : <SignIn onIn={signedIn} initialError={error} />;
}
