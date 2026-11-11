// ════════════════════════════════════════════════════════════════
// لوحة الخبير: leaders.sunkvalue.com/x
// ════════════════════════════════════════════════════════════════
// يدخل الخبير المعتمد برمز البريد. يرى طلباته ومشاركيه المقبولين وجلساته
// وساعاته وتقييمه (بعد خمسة تقييمات)، ويقيّم المشارك، ويصدر شهادة ساعات خبرته.
// لا يرى سعر ساعته ولا تكلفته ولا ملاحظات الإدارة: الخادم لا يرسلها أصلًا.
import React, { useCallback, useEffect, useState } from 'react';
import SusCard from '../SusCard.jsx';
import AccountSwitch from '../AccountSwitch.jsx';
import { xpCall, xpSession } from '../api.js';
import { askSignOut } from '../SignOutDialog.jsx';
import GoogleButton from '../GoogleButton.jsx';
import Captcha from '../Captcha.jsx';
import { captchaGate } from '../captcha.js';
import { Notice, POPUP_BLOCKED, Skel, useNotice } from '../ui.jsx';
import { CONTACT_EMAIL, countAr, EXPERT_ROLE_AR, rubricLevelAr, RUBRIC_SCALE } from '../../../supabase/functions/leaders-api/labels.js';
import { assignmentScopeAr, codeDigits, MIN_RATINGS, cohortPeriodAr, readExpertInvite } from '../../../supabase/functions/leaders-api/logic.js';
import ExpertApply from './ExpertApply.jsx';
import PortalConsent, { RatersAwaiting } from '../PortalConsent.jsx';
import OtherDoors, { DoorButtons, doorsFromCode } from '../Doors.jsx';
import ExpertFile from './ExpertFile.jsx';
import HallControl, { HALL_UI_APP } from '../../../shared/hall/HallControl.jsx';

const HALL_ACTION = { state: 'xp.hall', open: 'xp.hall-open', step: 'xp.hall-step', split: 'xp.hall-split', assign: 'xp.hall-assign', close: 'xp.hall-close' };

// رابط الدعوة: /x#invite=<البريد>.<الرمز> يُقرأ مرة بصيغة الخادم نفسها (readExpertInvite)، ثم يُتحقق منه بمسار الرمز نفسه.
// يُمسح من الشريط صالحًا كان أو تالفًا، فلا يبقى الرمز في العنوان ولا في سجل المتصفح
const INVITE_STALE = 'رابط الدعوة استُخدم أو انتهى. ادخل ببريدك، ونرسل لك رمزًا.';
const INVITE_BROKEN = 'رابط الدعوة غير مكتمل. ادخل ببريدك، ونرسل لك رمزًا.';
function takeInvite() {
  if (!location.hash.startsWith('#invite=')) return null;
  const invite = readExpertInvite(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  return invite || { broken: true };
}

// قبل الاعتماد: المدعو يستكمل ملفه، ومن أرسله يرى أنه بانتظار المراجعة ويعدّله إن شاء
function Onboarding({ expert, onOut, reload }) {
  const [edit, setEdit] = useState(expert.status === 'invited');
  return (
    <div className="page narrow">
      <div className="row between"><p className="eyebrow">بوابة الخبراء</p>
        <span className="row"><AccountSwitch here="expert" light doors={expert.switch_to} doSwitch={(to) => xpCall('xp.switch', { to })} />
        <button className="link small" onClick={async () => { if (await askSignOut('expert')) onOut(); }}>خروج</button></span></div>
      {edit
        ? <ExpertApply expert={expert} save={(v) => xpCall('xp.profile-save', v)} onSaved={() => { setEdit(false); reload(); }} />
        : <div className="card milestone-card stack">
            <div className="badge"><span>✓</span></div>
            <h1 className="as-h2">ملفك بانتظار الاعتماد</h1>
            <p className="muted">شكرًا {expert.full_name}. نراجع ملفك ونراسلك على {expert.email} حين تُفعَّل لوحتك، وفيها طلبات الخدمة وجلساتك وساعاتك.</p>
            <button className="btn ghost" onClick={() => setEdit(true)}>عدّل ملفك</button>
          </div>}
    </div>
  );
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '·');
const when = (d) => new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const left = (iso) => { const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 36e5)); return h >= 1 ? `${h} ساعة` : 'أقل من ساعة'; };

function SignIn({ onIn, initialEmail = '' }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [doors, setDoors] = useState([]);
  // الخادم يطلب التحقق البشري قبل كل رمز: تظهر الأداة، وتعيد الطلب وحدها حين تكتمل (كما في دخول المشارك والجهة)
  const [captchaKey, setCaptchaKey] = useState(null);
  const send = async (e, captcha) => {
    e?.preventDefault(); setBusy(true); setErr('');
    const r = await xpCall('xp.auth-start', { email, captcha });
    setBusy(false);
    if (r.code === 'captcha') { const g = captchaGate(r, captcha); setCaptchaKey(g.box); return setErr(g.error); }
    setCaptchaKey(null);
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
        <p className="eyebrow">بوابة الخبراء</p>
        <h1 className="as-h2">لوحة الخبير</h1>
        <p className="muted">{step === 'email' ? 'أدخل بريدك المسجل في شبكة الخبراء، ونرسل لك رمز دخول.' : `أرسلنا رمزًا إلى ${email} إن كان مسجلًا في شبكة الخبراء. وإن كان مسجلًا في بوابة أخرى، يصلك بريد يدلّك عليها.`}</p>
        {step === 'email'
          ? <label className="field"><span>البريد الإلكتروني</span><input className="input" dir="ltr" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          : <label className="field"><span>رمز التحقق</span><input className="input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(codeDigits(e.target.value))} /></label>}
        {err && <div className="alert err" role="alert">{err}<DoorButtons doors={doors} /></div>}
        {step === 'email' && captchaKey && <Captcha key={captchaKey.n} siteKey={captchaKey.site} onToken={(t) => send(null, t)} />}
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
      {err && <div className="alert err small" role="alert">{err}</div>}
      <button className="btn sm" disabled={busy || !keys.every((k) => v[k])} onClick={send}>{busy ? 'لحظة…' : 'احفظ التقييم'}</button>
    </div>
  );
}


// المستشار الأساسي: نماذج مشاركي دفعته بانتظار تقييمه، بالمعيار نفسه في لوحة الإدارة
const showVal = (v) => (Array.isArray(v) ? `جدول (${v.length} صفوف)` : v && typeof v === 'object' ? Object.values(v).filter(Boolean).join(' · ') : String(v ?? ''));
function AdvisorReviews({ initial }) {
  const [d, setD] = useState(initial ?? null);
  const [open, setOpen] = useState(null);
  const [f, setF] = useState({ rating: 0, feedback: '' });
  const [busy, setBusy] = useState(false);
  const [note, say] = useNotice();
  const load = () => xpCall('xp.reviews').then(setD);
  useEffect(() => { if (!initial) load(); }, []);
  if (!d?.success || !d.advisor) return null;
  const pending = d.items.filter((x) => x.status === 'submitted');
  const done = d.items.filter((x) => x.status !== 'submitted').slice(0, 8);
  const send = async (x, status) => {
    setBusy(true); say(null);
    const r = await xpCall('xp.review', { id: x.id, status, rating: f.rating || null, feedback: f.feedback });
    setBusy(false);
    if (r.success) { setOpen(null); setF({ rating: 0, feedback: '' }); say(status === 'returned' ? 'أُعيد للمشارك بملاحظتك.' : 'اعتُمد التسليم.'); load(); } else say(r.message, true);
  };
  return (
    <section className="card stack">
      <h2 className="as-h3">بانتظار تقييمك <small className="muted">· {pending.length}</small></h2>
      <p className="small muted">أنت المستشار الأساسي لدفعة هؤلاء المشاركين؛ يصلك ما يسلّمونه هنا وبالبريد، والإدارة ترى ما تقيّمه.</p>
      <Notice note={note} onClose={() => say(null)} reveal />
      {!pending.length && <p className="muted small">لا تسليمات معلّقة الآن.</p>}
      {pending.map((x) => (
        <div key={x.id} className="xpp-torate">
          <div className="row between"><span><b>{x.participants?.full_name}</b> <small className="muted">{x.learning_models?.title_ar} · {fmt(x.submitted_at)}</small></span>
            {open !== x.id && <button className="btn ghost sm" onClick={() => { setOpen(x.id); setF({ rating: 0, feedback: '' }); }}>قيّم</button>}</div>
          {open === x.id && (
            <div className="stack" style={{ gap: 8 }}>
              <dl className="adv-answers">{(x.learning_models?.fields || []).map((fl) => <React.Fragment key={fl.key}><dt>{fl.label || fl.key}</dt><dd>{showVal(x.answers?.[fl.key]) || '·'}</dd></React.Fragment>)}</dl>
              {/* D08: السلّم الرباعي الواحد بأسمائه ومراسيه، كما في أداة المراجع في اللوحة */}
              <div className="rx-scale" role="radiogroup" aria-label="التقدير">{RUBRIC_SCALE.levels.map((l) => (
                <button key={l.n} type="button" role="radio" aria-checked={f.rating === l.n} className={f.rating === l.n ? 'on' : ''} onClick={() => setF({ ...f, rating: l.n })}>
                  <b>{l.ar}</b><small>{l.anchor_ar}</small></button>
              ))}</div>
              <textarea className="input" rows={3} maxLength={4000} placeholder="ملاحظاتك المكتوبة للمشارك" value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} />
              <div className="row"><button className="btn sm" disabled={busy || !f.rating} onClick={() => send(x, 'reviewed')}>اعتمد</button>
                <button className="btn ghost sm" disabled={busy || !f.feedback.trim()} onClick={() => send(x, 'returned')}>أعده بملاحظة</button>
                <button className="link small" onClick={() => setOpen(null)}>إلغاء</button></div>
            </div>
          )}
        </div>
      ))}
      {done.length > 0 && <details><summary className="small">آخر ما قُيّم</summary>
        <ul className="small muted">{done.map((x) => <li key={x.id}>{x.participants?.full_name} · {x.learning_models?.title_ar} · {x.status === 'returned' ? 'أُعيد' : `اعتُمد${x.rating ? ` (${rubricLevelAr(x.rating)})` : ''}`}{x.reviewed_by ? ` · ${x.reviewed_by}` : ''}</li>)}</ul></details>}
    </section>
  );
}

// مشاركو الخبير (المرحلة 9): دفعاته بصفته مستشارها، ومن أُسند إليه بطلب خدمة؛ لكلٍّ موجز وملف
const MINE_PAGE = 12;
function MyParticipants({ onOpen, initial }) {
  const [d, setD] = useState(initial ?? null);
  const load = () => xpCall('xp.participants').then(setD);
  useEffect(() => { if (!initial) load(); }, []);
  const decide = async (b) => { const r = await xpCall('xp.rater-confirm', b); if (r.success) load(); return r; };
  // خمسون مشاركًا في القائمة: من ينتظرك أولًا ثم المتأخر ثم بالاسم، وبحث وتصفية، وعرض مختصر يُوسَّع
  const [q, setQ] = useState('');
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const [all, setAll] = useState(false);
  const sorted = [...(d?.items || [])].sort((x, y) => (y.needs || 0) - (x.needs || 0) || (y.late || 0) - (x.late || 0) || String(x.name).localeCompare(String(y.name), 'ar'));
  const waiting = sorted.filter((x) => x.needs > 0).length;
  const term = q.trim();
  const rows = sorted.filter((x) => (!onlyNeeds || x.needs > 0) && (!term || String(x.name).includes(term) || String(x.org || '').includes(term)));
  const shown = all || term || onlyNeeds ? rows : rows.slice(0, MINE_PAGE);
  return (
    <>
    <RatersAwaiting items={d?.raters_pending} onDecide={decide} />
    <section className="card stack" aria-labelledby="xp-mine">
      <h2 className="as-h3" id="xp-mine">مشاركوك{d?.items?.length ? <small className="muted"> · {d.items.length}</small> : null}</h2>
      {!d ? <p className="muted small">جارٍ التحميل…</p> : !d.success ? <p className="muted small">{d.message}</p> : !d.items.length ? <p className="muted small">لا مشاركين مسندين إليك الآن. حين تصير مستشارًا أساسيًا لدفعة أو يُقبل طلب خدمة لك يظهرون هنا.</p>
        : (
          <>
            {d.items.length > MINE_PAGE && (
              <div className="row wrap xpp-find">
                <input className="input" type="search" aria-label="ابحث في مشاركيك" placeholder="ابحث بالاسم أو الجهة" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className={`btn sm${onlyNeeds ? '' : ' ghost'}`} aria-pressed={onlyNeeds} onClick={() => setOnlyNeeds(!onlyNeeds)}>بانتظارك {waiting}</button>
              </div>
            )}
            {!rows.length && <p className="muted small">لا أحد بهذا البحث.</p>}
            {shown.map((x) => (
          <div key={x.id} className="xpp-person">
            <div className="row between"><b>{x.name}</b>
              <span className="row">{x.needs > 0 && <span className="chip warn">{x.needs} بانتظارك</span>}{x.late > 0 && <span className="chip bad">{x.late} معلم متأخر</span>}
                <button className="btn ghost sm" onClick={() => onOpen(x.id)}>افتح الملف</button></span></div>
            <small className="muted">{[x.cohort ? `دفعة ${x.cohort}` : null, x.advisor ? 'مستشارها' : x.role_ar, x.level_ar ? `${x.level_ar}${x.approved ? '' : ' (مبدئي)'}` : 'بلا قياس بعد', x.stage ? `المرحلة: ${x.stage}` : null, `${x.progress}٪`, x.continuous != null ? `المستمر ${x.continuous}٪` : null].filter(Boolean).join(' · ')}</small>
          </div>
            ))}
            {shown.length < rows.length && <button className="btn ghost sm" onClick={() => setAll(true)}>اعرض الكل ({rows.length})</button>}
          </>
        )}
    </section>
    </>
  );
}

// طلبات الأقران في دفعات الخبير (المرحلة 8): يؤكّد أو يصحّح أو يخفي إجابات الزملاء، ويجيب بنفسه
function PeerQueue({ initial }) {
  const [d, setD] = useState(initial ?? null);
  const [note, setNote] = useState({});
  const [reply, setReply] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, say] = useNotice();
  const load = () => xpCall('xp.peer-list').then(setD);
  useEffect(() => { if (!initial) load(); }, []);
  if (!d?.success || !d.advisor) return null;
  const act = async (action, body, ok) => {
    setBusy(true);
    const r = await xpCall(action, body);
    setBusy(false);
    if (!r.success) return say(r.message, true);
    say(ok); setD(r);
  };
  const open = d.items.filter((x) => x.status !== 'confirmed');
  return (
    <section className="card stack" aria-labelledby="xp-peer">
      <h2 className="as-h3" id="xp-peer">طلبات الأقران <small className="muted">· {d.pending} إجابة بانتظار تأكيدك</small></h2>
      <p className="small muted">{d.cohorts.map((c) => `${c.name}: ${c.supervision_ar}`).join(' · ')}. ما تؤكّده يُحسب لصاحبه في التقييم المستمر، وما تصحّحه يُحسب جزئيًا بملاحظتك.</p>
      <Notice note={result} onClose={() => say(null)} reveal />
      {!open.length && <p className="muted small">لا طلبات مفتوحة الآن.</p>}
      {open.map((r) => (
        <div key={r.id} className="xpp-torate">
          <div><b>{r.author}</b> <small className="muted">· {r.cohort} · {r.source_ar} ← {r.target_team_ar} · {fmt(r.at)}</small><p className="small">«{r.text}»</p></div>
          {r.answers.filter((a) => a.status !== 'hidden').map((a) => (
            <div key={a.id} className="xf-answer"><span><b>{a.author}</b>: «{a.text}» <small className="muted">{a.status_ar}</small></span>
              {a.status === 'pending' && <span className="row">
                <input className="input" aria-label="ملاحظة التصحيح" placeholder="ملاحظة (إلزامية للتصحيح)" value={note[a.id] || ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} />
                <button className="btn sm" disabled={busy} onClick={() => act('xp.peer-review', { answer_id: a.id, status: 'confirmed', note: note[a.id] || '' }, 'أُكّدت الإجابة ونُسبت لصاحبها.')}>أكّد</button>
                <button className="btn ghost sm" disabled={busy || (note[a.id] || '').trim().length < 10} onClick={() => act('xp.peer-review', { answer_id: a.id, status: 'corrected', note: note[a.id] }, 'صُحّحت الإجابة بملاحظتك.')}>صحّح</button>
                <button className="link small" disabled={busy} onClick={() => act('xp.peer-review', { answer_id: a.id, status: 'hidden', note: note[a.id] || '' }, 'أُخفيت الإجابة.')}>أخفِ</button>
              </span>}
            </div>
          ))}
          <div className="row">
            <textarea className="input" rows={2} maxLength={2000} aria-label="إجابتك" placeholder="إجابتك أنت (تُؤكَّد فورًا)" value={reply[r.id] || ''} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} />
            <button className="btn sm" disabled={busy || (reply[r.id] || '').trim().length < 10} onClick={() => act('xp.peer-answer', { request_id: r.id, text: reply[r.id] }, 'أُرسلت إجابتك وأُبلغ صاحب الطلب.')}>أجب</button>
            <button className="link small" disabled={busy} onClick={() => act('xp.peer-close', { request_id: r.id }, 'أُغلق الطلب.')}>أغلق</button>
          </div>
        </div>
      ))}
    </section>
  );
}

// «تكليفاتي» (تصور ربط الخبراء بالجهة، المرحلة 2): كل دفعة كُلّف فيها، بجهتها ومدتها وما يحمله فيها وأعداد من يخدمهم.
// أعداد لا أسماء: أسماء مشاركيه في «مشاركوك» من مصدر صلاحيتها. والمغلقة لا تُعرض
function MyAssignments({ list }) {
  if (!Array.isArray(list)) return list?.message ? <section className="card stack"><h2 className="as-h3">تكليفاتي</h2><p className="small muted" role="alert">{list.message}</p></section> : null;
  const live = list.filter((a) => a.status !== 'closed');
  if (!live.length) return null;
  return (
    <section className="card stack" aria-labelledby="xp-assign">
      <h2 className="as-h3" id="xp-assign">تكليفاتي <small className="muted">· {live.length}</small></h2>
      <div className="xpp-assign-list">{live.map((a) => (
        <article key={a.cohort_id} className="xpp-assign">
          <b>{a.org || 'دفعة أفراد'}</b>
          <span>{a.cohort} · {assignmentScopeAr(a)}</span>
          <small className="muted">{cohortPeriodAr(a)}</small>
          <small className="muted">{[
            (a.advisor || a.groups.length) ? `تخدم ${countAr(a.serves ?? 0, 'مشاركًا واحدًا', 'مشاركَين', 'مشاركين', 'مشاركًا')} بصفتك مستشارهم` : 'تُرشَّح لمشاركي الدفعة أولًا حين يطلبون خبيرًا',
            a.participants != null ? `في الدفعة ${countAr(a.participants, 'مشارك واحد', 'مشاركان', 'مشاركين', 'مشاركًا')}` : null,
            ...a.groups.map((g) => (g.count != null ? `${g.name}: ${g.count}` : g.name)),
          ].filter(Boolean).join(' · ')}</small>
        </article>
      ))}</div>
      <p className="small muted">أسماء من تخدمهم في «مشاركوك». لتعديل تكليف أو الاعتذار عنه راسل إدارة البرنامج.</p>
    </section>
  );
}

// القاعة من البوابة (المرحلة 9): دفعات المستشار وحدها، بالمكوّن المشترك مع اللوحة
function ExpertHall({ cohorts }) {
  const [cid, setCid] = useState(cohorts[0]?.id || '');
  // ما تقوله القاعة (toast(نص، خطأ؟)) يُعرض في بطاقتها. بلا reveal: السؤال الدوري قد يبلّغ إخفاقًا والخبير في قسم آخر
  const [note, say] = useNotice();
  const call = useCallback((key, body) => xpCall(HALL_ACTION[key], body), []);
  if (!cohorts.length) return null;
  return (
    <section className="card stack" aria-labelledby="xp-hall">
      <div className="row between"><h2 className="as-h3" id="xp-hall">القاعة الحية</h2>
        <select className="input" aria-label="الدفعة" value={cid} onChange={(e) => setCid(e.target.value)}>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <Notice note={note} onClose={() => say(null)} />
      <HallControl cohortId={cid} call={call} toast={say} ui={HALL_UI_APP} />
    </section>
  );
}

// هيكل اللوحة أثناء التحميل بدل دائرة في صفحة فارغة: يرى الخبير شكل ما سيأتي (البند 6.2)
function DashboardSkeleton() {
  return (
    <div className="page wide xpp" aria-busy="true" aria-label="جارٍ تحميل لوحتك">
      <div className="skel-hero"><Skel h={14} w="22%" /><Skel h={28} w="50%" /><Skel h={14} w="35%" /></div>
      <div className="xpp-kpis">{[0, 1, 2, 3].map((i) => <div key={i}><Skel h={26} w="40%" /><Skel h={12} w="70%" style={{ marginTop: 8 }} /></div>)}</div>
      {[0, 1].map((i) => <div key={i} className="card"><Skel h={18} w="35%" /><Skel h={12} style={{ marginTop: 10 }} /><Skel h={12} w="75%" style={{ marginTop: 6 }} /></div>)}
    </div>
  );
}

// خبير جديد بلا طلبات ولا جلسات ولا مشاركين: ما يفعله الآن وما يحدث بعده، بدل لوحة فارغة (البند 6.9)
// الملف المعتمد تعدّله الإدارة لا الخبير (portalProfileSave)، فخطوة الملف تدل على مراسلتها
function FirstSteps({ e }) {
  const profile = [e.bio, e.weekly_hours, (e.dimensions || []).length, (e.levels || []).length].every(Boolean);
  return (
    <section className="card stack" aria-labelledby="xp-first">
      <h2 className="as-h3" id="xp-first">بداية عملك في الشبكة</h2>
      <ol className="xpp-steps">
        <li className={profile ? 'done' : ''}><b>{profile ? 'ملفك مكتمل' : 'أكمل ملفك'}</b>: نبذتك، والأبعاد والمستويات التي تخدمها، وساعاتك الأسبوعية المتاحة. منها يُرشَّح لك القادة.
          {!profile && <> ملفك معتمد فتعديله من الإدارة: <a className="link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('استكمال ملف خبير')}`}>راسلنا بما ينقصه</a>.</>}</li>
        <li><b>انتظر أول طلب</b>: يصلك بالبريد ويظهر هنا تحت «طلبات بانتظار ردك»، ولك مهلة للقبول أو الاعتذار قبل أن يُعرض على خبير آخر.</li>
        <li><b>بعد القبول</b>: يظهر القائد في «مشاركوك» بملفه ومرحلته، وتظهر جلساتكما هنا، وتُحسب ساعاتك من الجلسات المنعقدة.</li>
      </ol>
    </section>
  );
}

function Dashboard({ onOut }) {
  const [view, setView] = useState(null);
  const [d, setD] = useState(null);
  const [rating, setRating] = useState(null);
  const [note, say] = useNotice();   // رسالة خطأ لا تُعرض بعلامة النجاح
  // التحميل الأول يجمع أقسام اللوحة في رحلة واحدة (preload)، وإعادة التحميل بعد إجراء خفيفة (lite) فكل قسم يحدّث نفسه
  const load = (lite = false) => xpCall('xp.dashboard', lite ? { lite: true } : {}).then((r) => { if (!r.success && r.code === 'session') onOut(); else setD(r); });
  useEffect(() => { load(); }, []);
  // ما جاء مجمّعًا يُستعمل مرة: فتح ملف مشارك ثم الرجوع يعيد تركيب الأقسام، فتطلب حالها الحالية لا نسخة التحميل الأول
  const openFile = (id) => { setD((x) => (x ? { ...x, preload: undefined } : x)); setView(id); };
  if (!d) return <DashboardSkeleton />;
  if (!d.success) return <div className="page narrow"><div className="alert err" role="alert">{d.message}</div></div>;
  if (d.consent_needed) return <PortalConsent role="expert" onAccept={async () => { const r = await xpCall('xp.consent'); if (r.success) setD(r); return r; }} />;
  if (d.onboarding) return <Onboarding expert={{ ...d.expert, switch_to: d.switch_to }} onOut={onOut} reload={() => { setD(null); load(); }} />;
  if (view) return <ExpertFile id={view} onBack={() => setView(null)} />;
  const e = d.expert;
  const pre = d.preload || {};
  const roles = (e.roles || []).map((r) => EXPERT_ROLE_AR[r]?.[0]).filter(Boolean);
  const isNew = !d.requests.length && !d.sessions.length && !d.stats.participants && !(d.advisor_cohorts || []).length
    && !(Array.isArray(d.assignments) && d.assignments.some((a) => a.status !== 'closed'));
  const offered = d.requests.filter((x) => x.status === 'offered');
  const now = Date.now();
  const upcoming = d.sessions.filter((s) => s.status === 'booked' && Date.parse(s.starts_at) > now).reverse();
  const toRate = [...d.sessions.filter((s) => s.to_rate).map((s) => ({ kind: 'session', id: s.id, who: s.participant, at: s.starts_at, what: 'جلسة توجيه' })),
    ...d.requests.filter((x) => x.to_rate).map((x) => ({ kind: 'request', id: x.id, who: x.participant.name, at: x.accepted_at, what: x.role_ar }))];

  const respond = async (x, accept) => {
    const r = await xpCall('xp.respond', { id: x.id, accept });
    say(r.success ? (accept ? `قبلت طلب ${x.participant.name}. تجده في «مشاركوك».` : 'سُجّل اعتذارك، وعُرض الطلب على خبير آخر.') : r.message, !r.success);
    load(true);
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
      closing: 'تُحسب من الجلسات المنعقدة المسجلة في المنصة حتى تاريخ الإصدار.' }, body)) say(POPUP_BLOCKED, true);
  };

  return (
    <div className="page wide xpp">
      <section className="hero">
        <div className="stack">
          <p className="eyebrow">بوابة الخبراء</p>
          <h1>أهلًا {e.full_name}</h1>
          <p className="muted">{[e.title, roles.join('، ')].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="row xpp-head-acts">
          {/* الشهادة تُصدر بعد أول جلسة منعقدة: بلا ساعات تكون وثيقة فارغة (البند 6.6) */}
          <button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={certificate} disabled={!d.stats.hours}
            title={d.stats.hours ? undefined : 'تُتاح بعد أول جلسة منعقدة'} aria-describedby={d.stats.hours ? undefined : 'xp-cert-hint'}>شهادة ساعات الخبرة</button>
          {!d.stats.hours && <span id="xp-cert-hint" className="sr-only">تُتاح بعد أول جلسة منعقدة</span>}
          <AccountSwitch here="expert" doors={d.switch_to} doSwitch={(to) => xpCall('xp.switch', { to })} />
          <button className="btn ghost sm" style={{ color: 'var(--brand-mist)' }} onClick={async () => { if (await askSignOut('expert')) onOut(); }}>خروج</button>
        </div>
      </section>
      {/* منطقة إعلان ثابتة: ما يُحفظ ويُرسل ويُعتمد يسمعه قارئ الشاشة (البند 6.4)، والخطأ بتنبيه وعلامته */}
      <Notice note={note} onClose={() => say(null)} />

      <div className="xpp-kpis">
        <div><b>{d.stats.hours}</b><span>ساعة قدّمتها</span></div>
        <div><b>{d.stats.participants}</b><span>قائد خدمته</span></div>
        <div><b>{d.stats.upcoming}</b><span>جلسة قادمة</span></div>
        <div><b>{d.rating.avg != null ? `${d.rating.avg} / 5` : 'لم يكتمل'}</b><span>{d.rating.avg != null ? `تقييمك من ${d.rating.count} · يتحدث كل شهر إذا اجتمعت ${MIN_RATINGS} تقييمات جديدة` : `يظهر تقييمك بعد ${d.rating.min} تقييمات (${d.rating.count} حتى الآن)`}</span></div>
      </div>

      {offered.length > 0 && (
        <section className="card stack">
          <h2 className="as-h3">طلبات بانتظار ردك</h2>
          {offered.map((x) => (
            <div key={x.id} className="xpp-offer">
              <div><b>{x.role_ar}</b> للقائد {x.participant.name}<small className="muted">{[x.dimension_ar, x.level_ar ? `مستوى ${x.level_ar}` : null].filter(Boolean).join(' · ')} · يبقى {left(x.expires_at)}</small></div>
              <div className="row"><button className="btn sm" onClick={() => respond(x, true)}>أقبل</button><button className="btn ghost sm" onClick={() => respond(x, false)}>أعتذر</button></div>
            </div>
          ))}
        </section>
      )}

      <MyAssignments list={d.assignments} />

      {isNew && <FirstSteps e={e} />}

      {/* القاعة قبل قائمة المشاركين: يوم الجلسة يديرها الخبير من جواله دون تمرير خمسين بطاقة */}
      <ExpertHall cohorts={d.advisor_cohorts || []} />

      {/* العمل المعلّق قبل القائمة: ما ينتظر تقييم الخبير وتأكيده أول ما يراه، لا بعد خمسين مشاركًا */}
      <SusCard call={xpCall} stateAction="xp.sus-state" submitAction="xp.sus-submit" initial={pre.sus} />
      <AdvisorReviews initial={pre.reviews} />
      <PeerQueue initial={pre.peers} />

      <div className="xpp-cols">
        <MyParticipants onOpen={openFile} initial={pre.participants} />
        <section className="card stack">
          <h2 className="as-h3">جلساتك القادمة</h2>
          {upcoming.length ? upcoming.map((s) => (
            <div key={s.id} className="xpp-person"><b>{s.participant}</b><small className="muted">{when(s.starts_at)}</small>{s.join_url && <a className="link small" href={s.join_url} target="_blank" rel="noopener noreferrer">رابط الجلسة</a>}</div>
          )) : <p className="muted small">لا جلسات قادمة.</p>}
        </section>
      </div>

      {toRate.length > 0 && (
        <section className="card stack">
          <h2 className="as-h3">قيّم مشاركيك <small className="muted">· {toRate.length}</small></h2>
          <p className="small muted">تقييمك يساعد البرنامج في متابعة تقدّم القائد، ولا يدخل في درجته الرسمية ولا يراه.</p>
          {toRate.map((it) => (
            <div key={it.kind + it.id} className="xpp-torate">
              <div className="row between"><span><b>{it.who}</b> <small className="muted">{it.what} · {fmt(it.at)}</small></span>
                {rating?.id !== it.id && <button className="btn ghost sm" onClick={() => setRating(it)}>قيّم</button>}</div>
              {rating?.id === it.id && <RateParticipant item={it} criteria={d.criteria} onDone={() => { setRating(null); say('حُفظ تقييمك.'); load(true); }} />}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function ExpertPortal() {
  const [invite] = useState(takeInvite);
  const pending = invite && !invite.broken;
  const [inside, setInside] = useState(() => !pending && !!xpSession.get());
  const [err, setErr] = useState(invite?.broken ? INVITE_BROKEN : '');
  useEffect(() => {
    if (!pending) return;
    xpCall('xp.auth-verify', invite).then((r) => {
      if (r.success) { xpSession.set(r.token); setInside(true); }
      // رمز لا يطابق يعني أن دعوة أحدث أو رمز دخول طُلب بعده حلّ محله: الرابط لم يعد صالحًا، لا «رمز غير صحيح» كتبه الخبير
      else setErr(['used', 'expired', 'code'].includes(r.code) ? INVITE_STALE : r.message);
    });
  }, []);
  if (pending && !inside && !err) return <div className="center-load"><div className="spinner" /></div>;
  // إن تعذّرت الدعوة يبقى بريدها معبّأً في نموذج الدخول، فيطلب الخبير رمزًا بضغطة
  return inside ? <Dashboard onOut={() => setInside(false)} /> : <>{err && <div className="page narrow"><div className="alert err" role="alert">{err}</div></div>}<SignIn onIn={() => setInside(true)} initialEmail={invite?.email} /></>;
}
