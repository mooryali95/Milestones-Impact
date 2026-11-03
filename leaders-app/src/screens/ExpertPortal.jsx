// ════════════════════════════════════════════════════════════════
// لوحة الخبير: leaders.sunkvalue.com/x
// ════════════════════════════════════════════════════════════════
// يدخل الخبير المعتمد برمز البريد. يرى طلباته ومشاركيه المقبولين وجلساته
// وساعاته وتقييمه (بعد خمسة تقييمات)، ويقيّم المشارك، ويصدر شهادة ساعات خبرته.
// لا يرى سعر ساعته ولا تكلفته ولا ملاحظات الإدارة: الخادم لا يرسلها أصلًا.
import React, { useEffect, useState } from 'react';
import AccountSwitch from '../AccountSwitch.jsx';
import { xpCall, xpSession } from '../api.js';
import GoogleButton from '../GoogleButton.jsx';
import { POPUP_BLOCKED } from '../ui.jsx';
import ExpertApply from './ExpertApply.jsx';
import OtherDoors, { DoorButtons, doorsFromCode } from '../Doors.jsx';

// رابط الدعوة: /x#invite=<البريد>.<الرمز> يُقرأ مرة ويُمسح من الشريط، ثم يُتحقق منه بمسار الرمز نفسه
function takeInvite() {
  const m = location.hash.match(/^#invite=([^.]+@[^#]+?)\.([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname);
  return { email: decodeURIComponent(m[1]), code: m[2] };
}

// قبل الاعتماد: المدعو يستكمل ملفه، ومن أرسله يرى أنه بانتظار المراجعة ويعدّله إن شاء
function Onboarding({ expert, onOut, reload }) {
  const [edit, setEdit] = useState(expert.status === 'invited');
  return (
    <div className="page narrow">
      <div className="row between"><p className="eyebrow" dir="ltr">EXPERT PORTAL</p>
        <span className="row"><AccountSwitch here="expert" light doors={expert.switch_to} doSwitch={(to) => xpCall('xp.switch', { to })} />
        <button className="link small" onClick={async () => { await xpCall('xp.logout'); xpSession.clear(); onOut(); }}>خروج</button></span></div>
      {edit
        ? <ExpertApply expert={expert} save={(v) => xpCall('xp.profile-save', v)} onSaved={() => { setEdit(false); reload(); }} />
        : <div className="card milestone-card stack">
            <div className="badge"><span>✓</span></div>
            <h2>ملفك بانتظار الاعتماد</h2>
            <p className="muted">شكرًا {expert.full_name}. نراجع ملفك ونراسلك على {expert.email} حين تُفعَّل لوحتك، وفيها طلبات الخدمة وجلساتك وساعاتك.</p>
            <button className="btn ghost" onClick={() => setEdit(true)}>عدّل ملفك</button>
          </div>}
    </div>
  );
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '·');
const when = (d) => new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const left = (iso) => { const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 36e5)); return h >= 1 ? `${h} ساعة` : 'أقل من ساعة'; };

function SignIn({ onIn }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [doors, setDoors] = useState([]);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await xpCall('xp.auth-start', { email });
    setBusy(false);
    if (r.success) setStep('code'); else setErr(r.message);
  };
  const verify = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await xpCall('xp.auth-verify', { email, code });
    setBusy(false);
    if (r.success) { xpSession.set(r.token); onIn(); } else setErr(r.message);
  };
  return (
    <div className="page narrow">
      <form className="card stack xpp-in" onSubmit={step === 'email' ? send : verify}>
        <p className="eyebrow" dir="ltr">EXPERT PORTAL</p>
        <h2>لوحة الخبير</h2>
        <p className="muted">{step === 'email' ? 'أدخل بريدك المسجل في شبكة الخبراء، ونرسل لك رمز دخول.' : `أرسلنا رمزًا إلى ${email} إن كان مسجلًا في شبكة الخبراء. وإن كان مسجلًا في بوابة أخرى، يصلك بريد يدلّك عليها.`}</p>
        {step === 'email'
          ? <label className="field"><span>البريد الإلكتروني</span><input className="input" dir="ltr" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          : <label className="field"><span>رمز التحقق</span><input className="input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} /></label>}
        {err && <div className="alert err" role="alert">{err}<DoorButtons doors={doors} /></div>}
        <button className="btn" disabled={busy}>{busy ? 'لحظة…' : step === 'email' ? 'أرسل الرمز' : 'دخول'}</button>
        {step === 'code' && <button type="button" className="link small" onClick={() => { setStep('email'); setCode(''); }}>غيّر البريد</button>}
        {step === 'email' && <>
          <div className="divider">أو</div>
          <GoogleButton disabled={busy} onCredential={async (credential) => {
            setBusy(true); setErr('');
            const r = await xpCall('xp.auth-google', { credential });
            setBusy(false);
            if (r.success) { xpSession.set(r.token); onIn(); } else { setErr(r.message); setDoors(doorsFromCode(r.code)); }
          }} />
          <p className="small muted">بحساب Google بالبريد نفسه المسجل في شبكة الخبراء.</p>
          <p className="small muted">لست في الشبكة بعد؟ <a className="link" href="/expert">قدّم طلب الانضمام</a></p>
          <OtherDoors here="expert" />
        </>}
      </form>
    </div>
  );
}

function RateParticipant({ item, criteria, onDone }) {
  const [v, setV] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keys = Object.keys(criteria);
  const send = async () => {
    setBusy(true);
    const r = await xpCall('xp.rate', { kind: item.kind, id: item.id, scores: v, comment });
    setBusy(false);
    if (r.success) onDone(); else setErr(r.message);
  };
  return (
    <div className="xpp-rate">
      {keys.map((k) => (
        <div key={k} className="rx-row" role="radiogroup" aria-label={criteria[k]}><span>{criteria[k]}</span>
          <span className="rx-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={v[k] === n} aria-label={`${n} من 5`} className={n <= (v[k] || 0) ? 'on' : ''} onClick={() => setV({ ...v, [k]: n })}>★</button>)}</span>
        </div>
      ))}
      <textarea className="input" rows={2} maxLength={1000} placeholder="ملاحظة للبرنامج عن تقدّمه (اختياري، لا يراها المشارك)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {err && <div className="alert err small">{err}</div>}
      <button className="btn sm" disabled={busy || !keys.every((k) => v[k])} onClick={send}>{busy ? 'لحظة…' : 'احفظ التقييم'}</button>
    </div>
  );
}


// المستشار الأساسي: نماذج مشاركي دفعته بانتظار تقييمه، بالمعيار نفسه في لوحة الإدارة
const showVal = (v) => (Array.isArray(v) ? `جدول (${v.length} صفوف)` : v && typeof v === 'object' ? Object.values(v).filter(Boolean).join(' · ') : String(v ?? ''));
function AdvisorReviews() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [f, setF] = useState({ rating: 0, feedback: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => xpCall('xp.reviews').then(setD);
  useEffect(() => { load(); }, []);
  if (!d?.success || !d.advisor) return null;
  const pending = d.items.filter((x) => x.status === 'submitted');
  const done = d.items.filter((x) => x.status !== 'submitted').slice(0, 8);
  const send = async (x, status) => {
    setBusy(true); setMsg('');
    const r = await xpCall('xp.review', { id: x.id, status, rating: f.rating || null, feedback: f.feedback });
    setBusy(false);
    if (r.success) { setOpen(null); setF({ rating: 0, feedback: '' }); setMsg(status === 'returned' ? 'أُعيد للمشارك بملاحظتك.' : 'اعتُمد التسليم.'); load(); } else setMsg(r.message);
  };
  return (
    <section className="card stack">
      <h3>بانتظار تقييمك <small className="muted">· {pending.length}</small></h3>
      <p className="small muted">أنت المستشار الأساسي لدفعة هؤلاء المشاركين؛ يصلك ما يسلّمونه هنا وبالبريد، والإدارة ترى ما تقيّمه.</p>
      {msg && <div className="banner"><span className="grow">{msg}</span></div>}
      {!pending.length && <p className="muted small">لا تسليمات معلّقة الآن.</p>}
      {pending.map((x) => (
        <div key={x.id} className="xpp-torate">
          <div className="row between"><span><b>{x.participants?.full_name}</b> <small className="muted">{x.learning_models?.title_ar} · {fmt(x.submitted_at)}</small></span>
            {open !== x.id && <button className="btn ghost sm" onClick={() => { setOpen(x.id); setF({ rating: 0, feedback: '' }); }}>قيّم</button>}</div>
          {open === x.id && (
            <div className="stack" style={{ gap: 8 }}>
              <dl className="adv-answers">{(x.learning_models?.fields || []).map((fl) => <React.Fragment key={fl.key}><dt>{fl.label || fl.key}</dt><dd>{showVal(x.answers?.[fl.key]) || '·'}</dd></React.Fragment>)}</dl>
              <div className="rx-row" role="radiogroup" aria-label="التقدير"><span>التقدير</span>
                <span className="rx-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={f.rating === n} className={n <= f.rating ? 'on' : ''} onClick={() => setF({ ...f, rating: n })}>★</button>)}</span></div>
              <textarea className="input" rows={3} maxLength={4000} placeholder="ملاحظاتك المكتوبة للمشارك" value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} />
              <div className="row"><button className="btn sm" disabled={busy || !f.rating} onClick={() => send(x, 'reviewed')}>اعتمد</button>
                <button className="btn ghost sm" disabled={busy || !f.feedback.trim()} onClick={() => send(x, 'returned')}>أعده بملاحظة</button>
                <button className="link small" onClick={() => setOpen(null)}>إلغاء</button></div>
            </div>
          )}
        </div>
      ))}
      {done.length > 0 && <details><summary className="small">آخر ما قُيّم</summary>
        <ul className="small muted">{done.map((x) => <li key={x.id}>{x.participants?.full_name} · {x.learning_models?.title_ar} · {x.status === 'returned' ? 'أُعيد' : `اعتُمد${x.rating ? ` (${x.rating}/5)` : ''}`}{x.reviewed_by ? ` · ${x.reviewed_by}` : ''}</li>)}</ul></details>}
    </section>
  );
}

function Dashboard({ onOut }) {
  const [d, setD] = useState(null);
  const [rating, setRating] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => xpCall('xp.dashboard').then((r) => { if (!r.success && r.code === 'session') onOut(); else setD(r); });
  useEffect(() => { load(); }, []);
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="page narrow"><div className="alert err">{d.message}</div></div>;
  if (d.onboarding) return <Onboarding expert={{ ...d.expert, switch_to: d.switch_to }} onOut={onOut} reload={() => { setD(null); load(); }} />;
  const e = d.expert;
  const offered = d.requests.filter((x) => x.status === 'offered');
  const mine = d.requests.filter((x) => x.status === 'accepted');
  const now = Date.now();
  const upcoming = d.sessions.filter((s) => s.status === 'booked' && Date.parse(s.starts_at) > now).reverse();
  const toRate = [...d.sessions.filter((s) => s.to_rate).map((s) => ({ kind: 'session', id: s.id, who: s.participant, at: s.starts_at, what: 'جلسة توجيه' })),
    ...d.requests.filter((x) => x.to_rate).map((x) => ({ kind: 'request', id: x.id, who: x.participant.name, at: x.accepted_at, what: x.role_ar }))];

  const respond = async (x, accept) => {
    const r = await xpCall('xp.respond', { id: x.id, accept });
    setMsg(r.success ? (accept ? `قبلت طلب ${x.participant.name}. تجده في «مشاركوك».` : 'سُجّل اعتذارك، وعُرض الطلب على خبير آخر.') : r.message);
    load();
  };
  const certificate = async () => {
    const win = window.open('', '_blank');
    const { writeDocument, section, kpis, table } = await import('../../../src/lib/brand/doc.js');
    const done = d.sessions.filter((s) => s.status === 'attended');
    const body = section('Service record', 'سجل الخدمة', kpis([
      { value: d.stats.hours, label: 'ساعة خبرة مقدّمة' }, { value: d.stats.participants, label: 'قائد خدمه' }, { value: d.stats.attended, label: 'جلسة منعقدة' },
    ])) + section('Sessions', 'الجلسات المنعقدة', table(
      [{ label: 'التاريخ', width: '30%' }, { label: 'المشارك' }, { label: 'المدة', width: '18%' }],
      done.map((s) => [fmt(s.starts_at), s.participant || '·', `${Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 6e4)} دقيقة`]),
      'لا جلسات منعقدة بعد'));
    if (!writeDocument(win, { kind: 'EXP', kindLabel: 'Expert Hours', eyebrow: 'Milestone Impact · Expert Network', title: `شهادة ساعات خبرة: ${e.full_name}`,
      subtitle: 'برنامج القادة', rows: [['الخبير', e.full_name], ['الساعات', String(d.stats.hours)], ['حتى تاريخ', fmt(new Date())]],
      closing: 'تُحسب من الجلسات المنعقدة المسجلة في المنصة حتى تاريخ الإصدار.' }, body)) setMsg(POPUP_BLOCKED);
  };

  return (
    <div className="page wide xpp">
      <section className="hero">
        <div className="stack">
          <p className="eyebrow" dir="ltr">EXPERT PORTAL</p>
          <h1>أهلًا {e.full_name}</h1>
          <p className="muted">{[e.title, (e.roles || []).length ? `${e.roles.length} أدوار` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="row xpp-head-acts">
          <button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={certificate}>شهادة ساعات الخبرة</button>
          <AccountSwitch here="expert" doors={d.switch_to} doSwitch={(to) => xpCall('xp.switch', { to })} />
          <button className="link small" style={{ color: 'var(--brand-mist)' }} onClick={async () => { await xpCall('xp.logout'); xpSession.clear(); onOut(); }}>خروج</button>
        </div>
      </section>
      {msg && <div className="banner"><span className="ico">✓</span><div className="grow">{msg}</div><button className="link small" onClick={() => setMsg('')}>إغلاق</button></div>}

      <div className="xpp-kpis">
        <div><b>{d.stats.hours}</b><span>ساعة قدّمتها</span></div>
        <div><b>{d.stats.participants}</b><span>قائد خدمته</span></div>
        <div><b>{d.stats.upcoming}</b><span>جلسة قادمة</span></div>
        <div><b>{d.rating.avg != null ? `${d.rating.avg} / 5` : '·'}</b><span>{d.rating.avg != null ? `تقييمك من ${d.rating.count}` : `يظهر تقييمك بعد ${d.rating.min} تقييمات (${d.rating.count} حتى الآن)`}</span></div>
      </div>

      {offered.length > 0 && (
        <section className="card stack">
          <h3>طلبات بانتظار ردك</h3>
          {offered.map((x) => (
            <div key={x.id} className="xpp-offer">
              <div><b>{x.role_ar}</b> للقائد {x.participant.name}<small className="muted">{[x.dimension_ar, x.level_ar ? `مستوى ${x.level_ar}` : null].filter(Boolean).join(' · ')} · يبقى {left(x.expires_at)}</small></div>
              <div className="row"><button className="btn sm" onClick={() => respond(x, true)}>أقبل</button><button className="btn ghost sm" onClick={() => respond(x, false)}>أعتذر</button></div>
            </div>
          ))}
        </section>
      )}

      <div className="xpp-cols">
        <section className="card stack">
          <h3>مشاركوك</h3>
          {mine.length ? mine.map((x) => (
            <div key={x.id} className="xpp-person">
              <b>{x.participant.name}</b><small className="muted">{x.role_ar}{x.dimension_ar ? ` · ${x.dimension_ar}` : ''}{x.participant.job_title ? ` · ${x.participant.job_title}` : ''}{x.participant.org ? ` · ${x.participant.org}` : ''}</small>
              <small className="ltr">{x.participant.email}{x.participant.phone ? ` · ${x.participant.phone}` : ''}</small>
            </div>
          )) : <p className="muted small">لا مشاركين مسندين إليك الآن.</p>}
        </section>
        <section className="card stack">
          <h3>جلساتك القادمة</h3>
          {upcoming.length ? upcoming.map((s) => (
            <div key={s.id} className="xpp-person"><b>{s.participant}</b><small className="muted">{when(s.starts_at)}</small>{s.join_url && <a className="link small" href={s.join_url} target="_blank" rel="noopener noreferrer">رابط الجلسة</a>}</div>
          )) : <p className="muted small">لا جلسات قادمة.</p>}
        </section>
      </div>

      <AdvisorReviews />

      {toRate.length > 0 && (
        <section className="card stack">
          <h3>قيّم مشاركيك <small className="muted">· {toRate.length}</small></h3>
          <p className="small muted">تقييمك يساعد البرنامج في متابعة تقدّم القائد، ولا يدخل في درجته الرسمية ولا يراه.</p>
          {toRate.map((it) => (
            <div key={it.kind + it.id} className="xpp-torate">
              <div className="row between"><span><b>{it.who}</b> <small className="muted">{it.what} · {fmt(it.at)}</small></span>
                {rating?.id !== it.id && <button className="btn ghost sm" onClick={() => setRating(it)}>قيّم</button>}</div>
              {rating?.id === it.id && <RateParticipant item={it} criteria={d.criteria} onDone={() => { setRating(null); setMsg('حُفظ تقييمك.'); load(); }} />}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function ExpertPortal() {
  const [invite] = useState(takeInvite);
  const [inside, setInside] = useState(() => !invite && !!xpSession.get());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!invite) return;
    xpCall('xp.auth-verify', invite).then((r) => {
      if (r.success) { xpSession.set(r.token); setInside(true); }
      else setErr(r.code === 'used' || r.code === 'expired' ? 'رابط الدعوة استُخدم أو انتهى. ادخل ببريدك، ونرسل لك رمزًا.' : r.message);
    });
  }, []);
  if (invite && !inside && !err) return <div className="center-load"><div className="spinner" /></div>;
  return inside ? <Dashboard onOut={() => setInside(false)} /> : <>{err && <div className="page narrow"><div className="alert err" role="alert">{err}</div></div>}<SignIn onIn={() => setInside(true)} /></>;
}
