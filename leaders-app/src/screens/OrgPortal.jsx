// ════════════════════════════════════════════════════════════════
// بوابة منسق الجهة (/org): الدخول برمز البريد، ثم لوحة الجهة للاطلاع
// ════════════════════════════════════════════════════════════════
// كل ما يظهر يأتي من الخادم مصفّى بصلاحيات المنسق؛ لا تعديل هنا.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SusCard from '../SusCard.jsx';
import OtherDoors from '../Doors.jsx';
import AccountSwitch from '../AccountSwitch.jsx';
import JourneyMap from '../../../shared/ui/JourneyMap.jsx';
import { coordCall, coordSession, setCoordExpired } from '../api.js';
import { askSignOut } from '../SignOutDialog.jsx';
import { filterRows, sortRows, stageOf, stageOptions, isStale, NOT_STARTED, PRE_BASELINE, STALE, STALE_DAYS } from '../coord.js';
import { LEVELS, RESEND_SECONDS } from '../labels.js';
import { ErrorBox, JourneySkeleton, POPUP_BLOCKED } from '../ui.jsx';
import Captcha from '../Captcha.jsx';
import { captchaGate } from '../captcha.js';
import PortalConsent, { RatersAwaiting } from '../PortalConsent.jsx';

import { countAr, CONTACT_EMAIL, FUNNEL, DIM_AR, expertRoleAr } from '../../../supabase/functions/leaders-api/labels.js';
import { codeDigits } from '../../../supabase/functions/leaders-api/logic.js';
const VIA = { link: 'رابط الجهة', domain: 'موقع الجهة', admin: 'أضافته الإدارة', none: 'غير محدد' };
const DIMS = [['milestone', 'Milestone'], ['impact', 'Impact'], ['leadership', 'Leadership']];
const lvl = (k) => LEVELS.find((l) => l.key === k)?.title || '·';
const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '·');

function SignIn({ onIn, initialError, initialEmail = '' }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const ref = useRef(null);
  // والتركيز يعود إلى الحقل بعد رمز خاطئ (org-10): كان يُعطَّل أثناء الطلب فيذهب التركيز إلى الصفحة وتنغلق لوحة المفاتيح
  useEffect(() => { if (step === 'code' && !busy) ref.current?.focus(); }, [step, busy]);
  // إعادة إرسال الرمز من خطوته بمهلة دخول المشارك نفسها (RESEND_SECONDS)، والخادم يحد الطلبات في الساعة
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const [captchaKey, setCaptchaKey] = useState(null);
  const start = async (e, captcha) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const r = await coordCall('coord.auth-start', { email, captcha });
    setBusy(false);
    if (r.code === 'captcha') { const g = captchaGate(r, captcha); setCaptchaKey(g.box); return setError(g.error); }
    setCaptchaKey(null);
    if (!r.success) return setError(r.message);
    setStep('code'); setCode(''); setWait(RESEND_SECONDS);
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
              value={code} disabled={busy} onChange={(e) => { const d = codeDigits(e.target.value); setCode(d); if (d.length === 6) verify(d); }} />
            {error && <div className="alert err">{error}</div>}
            {captchaKey && <Captcha key={captchaKey.n} siteKey={captchaKey.site} onToken={(t) => start(null, t)} />}
            <div className="row between small">
              <button type="button" className="link" onClick={() => { setStep('email'); setError(''); }}>تغيير البريد</button>
              {wait ? <span className="muted">إعادة الإرسال بعد {wait} ثانية</span>
                : <button type="button" className="link" onClick={() => start()} disabled={busy}>أعد إرسال الرمز</button>}
            </div>
            <p className="muted small">لم يصل؟ تفقّد مجلد الرسائل غير المرغوبة.</p>
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
      {/* على الجوال بطاقة لكل مبادرة بنمط قائمة المشاركين نفسه (org-8): كان الجدول يُمرَّر أفقيًا وزر الوثيقة خارج الشاشة */}
      <div className="op-scroll"><table className="op-people">
        <caption className="sr-only">محفظة مبادرات الجهة</caption>
        <thead><tr><th scope="col">المبادرة</th><th scope="col">القائد</th><th scope="col">النوع</th><th scope="col">الحالة</th><th scope="col">التنفيذ</th><th scope="col">تحقق المنافع</th><th scope="col">التكلفة</th><td /></tr></thead>
        <tbody>{list.map((x) => (
          <tr key={x.participant_id || x.initiative}>
            <td className="op-name"><b>{x.initiative}</b>{x.objective && <small className="muted" style={{ display: "block" }}>{x.objective}</small>}</td>
            <td data-label="القائد">{x.full_name || <span className="muted">·</span>}</td><td data-label="النوع">{SCOPE_AR[x.scope] || '·'}</td>
            <td data-label="الحالة">{x.status_title}{x.status !== 'approved' && x.readiness != null ? ` · ${x.readiness}%` : ''}</td>
            <td data-label="التنفيذ">{x.tracking ? <span className={`chip ${HEALTH_CHIP[x.tracking.health] || ''}`}>{x.tracking.health_title}</span> : '·'}</td>
            <td data-label="تحقق المنافع">{x.tracking ? pctOf(x.tracking.benefits.realization) : '·'}</td>
            <td data-label="التكلفة">{x.cost != null ? Math.round(x.cost).toLocaleString('en-US') : '·'}</td>
            <td className="op-wide">{x.status === 'approved' && x.participant_id && <button className="link small" onClick={() => open(x)}>الوثيقة</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
const signed = (x) => (x == null ? '·' : x > 0 ? `+${x}` : `${x}`);
// «فريق البرنامج» (تصور ربط الخبراء بالجهة، قرار المالك 2026-11-11): من يخدم موظفي الجهة في كل دفعة غير مغلقة.
// أسماء وأدوار بلا وسائل تواصل (التواصل عبر إدارة البرنامج)، وأسماء أعضاء المجموعات بصلاحية القائمة. الخادم يصفّي كل ذلك
function ProgramTeam({ team }) {
  if (!team) return null;
  if (!Array.isArray(team)) return <section className="card"><h3>فريق البرنامج</h3><p className="small muted" role="alert">{team.error}</p></section>;
  if (!team.length) return null;
  const roles = (rs) => (rs || []).map(expertRoleAr).join('، ');
  return (
    <section className="card stack op-team" aria-labelledby="op-team-h">
      <h3 id="op-team-h">فريق البرنامج</h3>
      {team.map((t) => (
        <div key={t.cohort.name} className="op-team-cohort">
          {team.length > 1 && <h4>{t.cohort.name}</h4>}
          {t.advisor ? (
            <div className="op-team-adv"><span className="small muted">المستشار الأساسي</span><b>{t.advisor.full_name}</b>
              {t.advisor.title && <small className="muted">{t.advisor.title}</small>}{t.advisor.bio && <p className="small">{t.advisor.bio}</p>}</div>
          ) : <p className="small muted">لم يُعيَّن مستشار أساسي لهذه الدفعة بعد.</p>}
          {t.team.length > 0 && <ul className="op-team-list">{t.team.map((x, i) => (
            <li key={`${x.full_name}-${i}`}><b>{x.full_name}</b> <small className="muted">{[roles(x.roles), x.title, x.groups.length ? x.groups.join('، ') : null].filter(Boolean).join(' · ')}</small></li>
          ))}</ul>}
          {t.groups.length > 0 && (
            <div className="stack">
              <span className="small muted">المجموعات: {t.groups.length} · {countAr(t.participants, 'مشارك واحد', 'مشاركان', 'مشاركين', 'مشاركًا')}</span>
              {t.groups.map((g) => (
                <details key={g.name} className="op-team-group">
                  <summary>{g.name} ({g.count}) · {g.expert || (t.advisor ? 'يتبع المستشار الأساسي' : 'بلا خبير بعد')}</summary>
                  {g.members ? (g.members.length ? <p className="small">{g.members.join('، ')}</p> : <p className="small muted">لا أعضاء بعد.</p>)
                    : <p className="small muted">أسماء الأعضاء لمن يرى قائمة المشاركين.</p>}
                </details>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="small muted">للتواصل مع الفريق: إدارة البرنامج.</p>
    </section>
  );
}

function ImpactCard({ im, onReport }) {
  if (!im) return null;
  const c = im.counts || {};
  return (
    <section className="card op-impact">
      <div className="row between"><h3>أثر البرنامج على مشاركيك</h3>{onReport && c.paired > 0 && !im.suppressed && <button className="btn sm" onClick={onReport}>تقرير الأثر PDF</button>}</div>
      {/* صيغة لا تتغير بالعدد (7.12 و8.5): «1 أجروا» و«0 أجروا» كانت خطأ في المطابقة */}
      <p className="small muted">القياس المبدئي: {c.baseline || 0} · البعدي: {c.post || 0} · القياسان معًا: {c.paired || 0}</p>
      {im.caution && <div className="alert info small">{im.caution}</div>}
      {im.rows_withheld && <p className="small muted">تظهر نتائج من وافق من مشاركيك بأسمائهم حين لا يبقى غير موافق، أو يبلغ غير الموافقين خمسة على الأقل، فلا تُستنتج نتيجة أحد منهم من المتوسط.</p>}
      {im.suppressed ? <p className="small muted">تظهر المقارنة حين يكمل {im.suppressed} مشاركين على الأقل القياسين، حفاظًا على خصوصيتهم.</p> : c.paired > 0 ? (
        <div className="op-scroll"><table>
          <caption className="sr-only">أثر البرنامج في الجهة: قبل وبعد لكل إطار</caption>
          <thead><tr><th scope="col">الإطار</th><th scope="col">قبل</th><th scope="col">بعد</th><th scope="col">الفرق</th><th scope="col">تحسن موثوق</th></tr></thead>
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

// تقييم 360 للتطوير: ما تراه الجهة مجموع لا فرد (orgTotals في feedback360.js). المتوسطات فوق حد الجهة المضبوط
// في الإعدادات وحده، ولا صف فردي ولو وافق المشارك على اطلاع جهته على مستوياته
function Feedback360Card({ f }) {
  if (!f) return null;
  return (
    <section className="card op-impact" aria-labelledby="op-f360">
      <h3 id="op-f360">تقييم 360 للتطوير</h3>
      <p className="small muted">تقارير مكتملة: {f.reports} · استجابة المقيّمين: {f.response_pct == null ? '—' : `${f.response_pct}%`} ({f.submitted} من {f.invited})</p>
      {f.dims ? (
        <div className="op-scroll"><table>
          <caption className="sr-only">متوسط تقييم 360 في الجهة لكل إطار: تقدير المشاركين لأنفسهم وتقدير مقيّميهم</caption>
          <thead><tr><th scope="col">الإطار</th><th scope="col">تقديرهم لأنفسهم</th><th scope="col">تقدير مقيّميهم</th></tr></thead>
          <tbody>{f.dims.map((d) => <tr key={d.dimension}><td><b>{DIMS.find(([k]) => k === d.dimension)?.[1]}</b><br /><small className="muted">{DIM_AR[d.dimension]}</small></td><td>{d.self ?? '·'}</td><td>{d.all ?? '·'}</td></tr>)}</tbody>
        </table></div>
      ) : <p className="small muted">تظهر المتوسطات حين تكتمل {f.min} تقارير على الأقل، حفاظًا على خصوصية المشاركين ومقيّميهم.</p>}
      <p className="small muted">للتطوير وحده: لا يدخل تقييم أحد ولا شهادته، ولا تظهر للجهة نتيجة فرد.</p>
    </section>
  );
}

// رابط تسجيل موظفي الجهة كما في رسالة دعوة المنسق (org-6)، بنسخ بنقرة. لا يظهر لجهة موقوفة (الخادم لا يرسله)
function JoinLink({ url }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  };
  return (
    <p className="small" style={{ overflowWrap: 'anywhere' }}><span>رابط تسجيل موظفيكم: </span><a className="ltr" style={{ color: 'inherit' }} href={url} target="_blank" rel="noopener noreferrer">{url}</a>{' '}
      <button type="button" className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={copy}>{copied ? 'نُسخ' : 'انسخ الرابط'}</button>
      <span className="sr-only" role="status">{copied ? 'نُسخ الرابط' : ''}</span></p>
  );
}

function Dashboard({ me, onLogout }) {
  // ما جاء مع الهوية (preload) يُعرض فورًا، وإعادة التحميل بعد إجراء تطلب اللوحة وحدها (البند 8.1)
  const [d, setD] = useState(me.preload?.dashboard ?? null);
  const [f, setF] = useState({ q: '', stage: '', track: '' });
  const [sort, setSort] = useState('name');
  const [msg, setMsg] = useState('');
  const load = () => { setD(null); coordCall('coord.dashboard').then(setD); };
  // قرار المقيّم لا يغيّر في اللوحة إلا قائمة المنتظرين (تأكيده يرسل دعوته، ورحلة المشارك تتغير حين يُسلّم تقييمه)،
  // فيُزال من القائمة محليًا (org-5 وorg-15): كانت اللوحة كلها تُستبدل بالهيكل وتُعاد رحلة كل مشارك على الخادم،
  // فتقفز الصفحة إلى أعلاها وتضيع رسالة «أُرسلت الدعوة»
  const decideRater = async (b) => {
    const r = await coordCall('coord.rater-confirm', b);
    if (r.success) setD((x) => ({ ...x, raters_pending: (x.raters_pending || []).filter((y) => y.id !== b.id) }));
    return r;
  };
  useEffect(() => { if (!me.preload?.dashboard) load(); }, []);

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
      rows.map((p) => [p.full_name, p.job_title, ...(perms.scores ? [p.track_title || ''] : []), stageOf(p), p.progress, ...(perms.activity ? [fmt(p.last_login_at)] : []), fmt(p.created_at),
        ...(perms.contact ? [p.email, p.phone] : []), ...(perms.scores ? DIMS.map(([k]) => lvl(p.levels?.[k])) : [])]),
    );
  };
  const printReport = async () => {
    const win = window.open('', '_blank');   // تُفتح قبل التحميل حتى لا يحجبها المتصفح
    const [{ writeDocument }, { orgReport }] = await Promise.all([import('../../../src/lib/brand/doc.js'), import('../../../src/lib/brand/reports.js')]);
    const { meta, body } = orgReport({ ...d, participants: rows }, 'coordinator');
    if (!writeDocument(win, meta, body)) setMsg(POPUP_BLOCKED);
  };
  // الانتقال إلى قسم بعينه: على الجوال تبدأ القائمة بعد شاشات من البطاقات (org-7)، فيُمرَّر إليها ويُنقل التركيز
  const goTo = (id) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  });
  const show = (s) => {
    if (s.to) return goTo(s.to);
    setF({ q: '', track: '', stage: s.stage });
    goTo('op-people-h');
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
          {org.join_url && <JoinLink url={org.join_url} />}
          {msg && <div className="alert err small" role="alert">{msg}</div>}
          <div className="row">
            {perms.export && perms.list !== false && <><button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={exportXlsx}>تصدير Excel</button>
              <button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={printReport}>تقرير الجهة</button></>}
            {perms.list !== false && <button type="button" className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={() => goTo('op-people-h')}>إلى قائمة المشاركين</button>}
            <AccountSwitch here="org" doors={me.switch_to} doSwitch={(to) => coordCall('coord.switch', { to })} />
            <button className="link small" style={{ color: 'var(--brand-mist)' }} onClick={onLogout}>خروج</button>
          </div>
        </div>
        {/* D20: الاستهلاك من الرعاية المثبتة لا من عدد المسجلين، ومعه من ينتظر قرار الرعاية */}
        <div className="op-seats"><b>{org.seats ? (kpis.seats_used ?? kpis.total) : kpis.total}</b><small>{org.seats ? `من ${countAr(org.seats, 'مقعد واحد', 'مقعدين', 'مقاعد', 'مقعدًا')}${kpis.seats_waiting ? ` · ${kpis.seats_waiting} بانتظار قرار الرعاية` : ''}` : 'مشارك'}</small>
          {/* حساب الاختبار خارج كل أرقام اللوحة ومقاعدها (forStats)، فيُذكر عدده هنا بصدق ولا يُترك فرقًا بلا تفسير */}
          {kpis.test_accounts > 0 && <small className="op-test">{countAr(kpis.test_accounts, 'حساب اختبار واحد', 'حسابا اختبار', 'حسابات اختبار', 'حساب اختبار')} خارج الإحصاءات</small>}</div>
      </section>
      <RatersAwaiting items={d.raters_pending} onDecide={decideRater} />

      <NeedsYou d={d} onShow={show} />
      <SusCard call={coordCall} stateAction="coord.sus-state" submitAction="coord.sus-submit" initial={me.preload?.sus} />

      <div className="op-kpis">
        {[['انضموا هذا الأسبوع', kpis.joined_week], ['نشطون هذا الأسبوع', kpis.active_week], ['اعتُمد مسارهم', kpis.approved], ['أنهوا البرنامج', kpis.completed], ['متوسط الإنجاز', `${kpis.avg_progress}%`]]
          .map(([l, n]) => <div key={l} className="card op-kpi"><b>{n}</b><span className="small muted">{l}</span></div>)}
      </div>

      {/* خريطة الرحلة: مراحل برنامج الجهة وكم يقف عند كل منها (قرار المالك 2026-11-11)، وتحل محل أعمدة القمع الأربعة */}
      {d.journey_map && <JourneyMap map={d.journey_map} />}

      <div className={`op-grid${d.journey_map ? ' two' : ''}`}>
        {!d.journey_map && <section className="card"><h3>مراحل الرحلة</h3><Bars obj={Object.fromEntries(FUNNEL.map(([k, l]) => [l, funnel[k] || 0]))} total={funnel.registered} /></section>}
        <section className="card"><h3>المسارات</h3>
          {tracks.length ? <Bars obj={trackBars} total={kpis.total} />
            : <p className="small muted">{perms.scores ? 'لا مسار ظاهر بعد: يظهر هنا مسار من وافق من مشاركيك على اطلاع جهته على مستوياته متى تحددت.' : 'المسار مشتق من مستويات المشارك، فلا يظهر إلا مع صلاحية المستويات وبموافقة المشارك.'}</p>}</section>
        <section className="card"><h3>طريقة الانضمام</h3><Bars obj={d.by_via} label={(k) => VIA[k] || k} total={kpis.total} /></section>
      </div>

      <ProgramTeam team={d.program_team} />
      <ImpactCard im={d.impact} onReport={perms.export ? printImpact : null} />
      <Feedback360Card f={d.feedback360} />
      <Initiatives list={d.initiatives || []} outcomes={d.outcomes} />

      {perms.list === false ? <section className="card"><h3>المشاركون</h3><p className="muted">صلاحيتك أرقام مجمّعة عن مشاركي جهتك، بلا أسماء ولا صفوف فردية.</p></section> : <section className="card op-table">
        <div className="row between op-tools">
          <h3 id="op-people-h" tabIndex={-1}>المشاركون</h3>
          <div className="row">
            {/* عنوان ظاهر للبحث (8.6)، لا aria-label وحده */}
            <label className="op-search"><span className="small">ابحث</span><input className="input" type="search" placeholder="بالاسم أو المسمى…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
            {/* المرشّح على ما يعرضه عمود «المرحلة» نفسه (org-2)، ومعه خيار يجمع من لم يكمل القياس المبدئي */}
            <select className="input" aria-label="المرحلة" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
              <option value="">كل المراحل</option><option value={NOT_STARTED}>لم يكملوا القياس المبدئي</option>
              {perms.activity && <option value={STALE}>لم يدخلوا منذ {STALE_DAYS} يومًا</option>}
              {stageOptions(d.participants, (d.journey_map?.stages || []).map((s) => s.title)).map((t) => <option key={t} value={t}>{t}</option>)}
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
          {/* عنوان الجدول ورؤوس الأعمدة لقارئ الشاشة (8.6) */}
          <caption className="sr-only">مشاركو {org.name}: {rows.length} من {kpis.total}</caption>
          <thead><tr><th scope="col">الاسم</th>{perms.scores && <th scope="col">المسار</th>}<th scope="col">المرحلة</th><th scope="col">الإنجاز</th>{perms.activity && <th scope="col">آخر دخول</th>}
            {perms.contact && <th scope="col">التواصل</th>}{perms.scores && DIMS.map(([k, en]) => <th key={k} scope="col">{en}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((p) => (
            <tr key={p.id}>
              <td className="op-name"><b>{p.full_name}</b><br /><small className="muted">{p.job_title}</small></td>
              {perms.scores && <td data-label="المسار">{p.track_title || <span className="muted">·</span>}{p.track && !p.approved && <small className="muted"> (مبدئي)</small>}</td>}
              <td data-label="المرحلة"><span className="chip">{stageOf(p)}</span></td>
              <td data-label="الإنجاز"><span><span className="op-prog"><i style={{ width: `${p.progress}%` }} /></span> {p.progress}%</span></td>
              {perms.activity && <td data-label="آخر دخول">{fmt(p.last_login_at)}</td>}
              {perms.contact && <td className="ltr op-wide" data-label="التواصل"><small>{p.email}<br />{p.phone}</small></td>}
              {perms.scores && DIMS.map(([k, en]) => <td key={k} className="op-dim" data-label={en}>{lvl(p.levels?.[k])}</td>)}
            </tr>
          )) : <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>{kpis.total ? 'لا نتائج لهذا البحث.' : org.join_url ? 'لم ينضم أحد من جهتك بعد. شارك رابط تسجيل موظفيكم المعروض أعلى اللوحة.' : 'لم ينضم أحد من جهتك بعد. شارك رابط الدعوة الذي أرسلته لك الإدارة.'}</td></tr>}</tbody>
        </table></div>
      </section>}
      <p className="small muted">بيانات المشاركين سرية، ومخصصة لمتابعة برنامج جهتك فقط. للتواصل مع إدارة البرنامج: <a className="link ltr" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
    </div>
  );
}

// ما يحتاج تدخل المنسق، أول اللوحة: كانت متفرقة في الرأس والجدول فتُعرض ولا توجّه. يُعدّ مما وصل اللوحة فعلًا
// (بحسب صلاحياته)، ولا يظهر القسم إن لم يكن فيه شيء. «متوقف» من آخر دخول، فلا يُحسب إلا لمن له صلاحية النشاط.
// show: ما يعرضهم بنقرة (org-7): بطاقة المقيّمين، أو مرشّح القائمة الذي يحصرهم
export function needsYou(d, now = Date.now()) {
  const ps = d.permissions?.list === false ? [] : (d.participants || []);
  const out = [];
  const raters = (d.raters_pending || []).length;
  // بطاقة التأكيد تُعرض قبل هذا القسم، فالتلميح «أعلاه» (org-7)
  if (raters) out.push({ key: 'raters', n: raters, text: 'مقيّمون بانتظار تأكيدك', hint: 'في بطاقة التأكيد أعلى هذا القسم', show: { to: 'ra-h' } });
  if (d.kpis?.seats_waiting) out.push({ key: 'seats', n: d.kpis.seats_waiting, text: 'مشاركون بانتظار قرار الرعاية', hint: 'بلغ العقد مقاعده؛ تواصل مع إدارة البرنامج لإضافة مقاعد', contact: true });
  const notStarted = ps.filter((p) => PRE_BASELINE.includes(p.status)).length;
  if (notStarted) out.push({ key: 'baseline', n: notStarted, text: 'سجّلوا ولم يكملوا القياس المبدئي', show: { stage: NOT_STARTED } });
  if (d.permissions?.activity) {
    const stale = ps.filter((p) => isStale(p, now)).length;
    if (stale) out.push({ key: 'stale', n: stale, text: `لم يدخلوا منذ ${STALE_DAYS} يومًا`, show: { stage: STALE } });
  }
  return out;
}
function NeedsYou({ d, onShow }) {
  const items = needsYou(d);
  if (!items.length) return null;
  return (
    <section className="card op-todo" aria-labelledby="op-todo-h">
      <h3 id="op-todo-h">يحتاج تدخلك</h3>
      <ul>{items.map((x) => (
        <li key={x.key}>
          <span><b>{x.n}</b> {x.text}{x.hint && <small className="muted"> · {x.hint}</small>}</span>
          {x.contact && <a className="btn ghost sm" href={`mailto:${CONTACT_EMAIL}`}>راسل إدارة البرنامج</a>}
          {x.show && <button type="button" className="btn ghost sm" onClick={() => onShow(x.show)}>{x.show.to ? 'انتقل إليها' : 'اعرضهم في القائمة'}</button>}
        </li>
      ))}</ul>
    </section>
  );
}

export default function OrgPortal() {
  const [me, setMe] = useState(null);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  // تعذّر جلب الهوية والجلسة باقية (org-3): يُعرض الخطأ بمرجعه مع إعادة المحاولة، لا شاشة الدخول كأن المنسق خرج.
  // انتهاء الجلسة أو إيقافها يمرّان بـsetCoordExpired إلى شاشة الدخول برسالتهما كما كانا
  const [bootError, setBootError] = useState('');

  const resume = async () => {
    const r = await coordCall('coord.me', { with_dashboard: true });
    if (r.success) setMe(r);
    else if (coordSession.get()) setBootError(r.message);
    return r.success;
  };
  const start = async () => {
    // رابط البريد: /org/verify?e=...&t=...
    if (location.pathname === '/org/verify') {
      const q = new URLSearchParams(location.search);
      history.replaceState(null, '', '/org');
      const r = await coordCall('coord.auth-verify', { email: q.get('e'), link: q.get('t') });
      if (r.success) { coordSession.set(r.token); setMe(r); }
      // رابط مستعمل أو منتهٍ والجلسة في المتصفح نافذة (org-4): تُفتح اللوحة بها، وإلا يُعرض الخطأ وبريد الرابط معبأ لطلب رمز جديد
      else if (!(coordSession.get() && (await resume()))) { setBootError(''); setError(r.message); setEmail(q.get('e') || ''); }
    } else if (coordSession.get()) await resume();
    setBoot(false);
  };
  useEffect(() => {
    setCoordExpired((m) => { setMe(null); setBootError(''); setError(m || ''); });
    start();
  }, []);

  const signedIn = (r) => { coordSession.set(r.token); setMe(r); };
  const logout = async () => { if (await askSignOut('org')) { setMe(null); setBootError(''); } };

  if (boot) return <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  if (!me && bootError) return (
    <div className="page narrow stack">
      <ErrorBox message={bootError} onRetry={() => { setBootError(''); setBoot(true); resume().finally(() => setBoot(false)); }} />
      <button type="button" className="link small" onClick={logout}>خروج</button>
    </div>
  );
  if (me?.consent_needed) return <PortalConsent role="coordinator" onAccept={async () => { const r = await coordCall('coord.consent'); if (r.success) setMe((m) => ({ ...m, ...r })); return r; }} />;
  return me ? <Dashboard me={me} onLogout={logout} /> : <SignIn onIn={signedIn} initialError={error} initialEmail={email} />;
}
