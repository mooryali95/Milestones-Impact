// ════════════════════════════════════════════════════════════════
// الرحلة: ملف الكفاءة 3×3 ومراحل البرنامج بقوائم تحققها
// ════════════════════════════════════════════════════════════════
// كل ما يظهر هنا (المراحل، المدد، الأنشطة، المخرجات، المتطلبات) يأتي
// من الخادم كما ضبطته الإدارة؛ لا نص مثبت للمراحل في الواجهة.
import React, { useEffect, useRef, useState } from 'react';
import SusCard from '../SusCard.jsx';
import Ico from '../Ico.jsx';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { bootPreload, call, lastRead, nextSeen, uploadFile, welcomeSeen } from '../api.js';
import IntroVideo from '../IntroVideo.jsx';
import { APPROVAL_SLA_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { OnboardingNextCard } from '../Onboarding.jsx';
import { DIMENSIONS, LEVEL_SUMMARY, LEVELS, levelOf, MODES, PHASES, REQ_STATUS } from '../labels.js';
import { POPUP_BLOCKED } from '../ui.jsx';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';
import { surveyQuestions } from '../../../supabase/functions/leaders-api/logic.js';
import Activity from './Activities.jsx';
import HowEvaluated from './HowEvaluated.jsx';
import { MASTERY } from '../../../supabase/functions/leaders-api/lab.js';
import { CONTACT } from '../../../src/config/constants.js';
import RateExpert from './RateExpert.jsx';
import ChooseExpert from './ChooseExpert.jsx';
import PeerRequests from './PeerRequests.jsx';
const CONTACT_EMAIL = CONTACT.email;

export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'جهاز';
}

function Ring({ value }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="ring" aria-label={`نسبة التقدم ${value}%`}>
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(234,240,240,.15)" strokeWidth="8" />
        <circle cx="52" cy="52" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ stroke: 'var(--brand-copper)', transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <b>{value}%</b>
    </div>
  );
}

export function PasskeyBanner({ onDone, settings = false, more = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!browserSupportsWebAuthn()) return null;
  const setup = async () => {
    setBusy(true); setError('');
    const opt = await call('passkey.register-options');
    if (!opt.success) { setBusy(false); return setError(opt.message); }
    let response;
    try { response = await startRegistration({ optionsJSON: opt.options }); }
    catch { setBusy(false); return setError('لم يكتمل الإعداد. يمكنك المحاولة لاحقًا.'); }
    const res = await call('passkey.register-verify', { response, label: deviceLabel() });
    setBusy(false);
    if (res.success) onDone('set'); else setError(res.message);
  };
  const later = async () => { await call('passkey.dismiss'); onDone('dismissed'); };
  return (
    <div className="banner mist">
      <span className="ico"><Ico name="key" /></span>
      <div className="grow">
        <b>{more ? 'تستخدم جهازًا آخر؟' : 'ادخل المرة القادمة ببصمتك أو وجهك'}</b>
        <p className="small muted">{more ? 'كل جهاز يحتاج مفتاحه. أضف مفتاحًا لهذا الجهاز إن لم يكن له مفتاح.' : 'مفتاح المرور أسرع وأكثر أمانًا من رمز البريد، ويبقى على جهازك.'}</p>
        {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
      </div>
      <div className="row">
        <button className="btn sm" onClick={setup} disabled={busy}>{busy ? 'لحظة…' : more ? 'أضف مفتاحًا لهذا الجهاز' : 'فعّله الآن'}</button>
        {!settings && <button className="link small" onClick={later}>لاحقًا</button>}
      </div>
    </div>
  );
}

// مستوى واحد ملخص. الخادم يرسله جاهزًا؛ والاحتياط للنسخة الأقدم منه.
function summaryLevel(profile) {
  if (profile.level) return profile.level;
  const steps = (profile.dimensions || []).map((d) => levelOf(d.level).step).filter(Boolean).sort();
  return steps.length ? LEVELS[steps[Math.floor((steps.length - 1) / 2)] - 1].key : null;
}

function Competency({ profile }) {
  const key = summaryLevel(profile);
  const lvl = levelOf(key);
  return (
    <div className="dim overall">
      <div className="row between">
        <span className="en">{DIMENSIONS.map((d) => d.short).join(' · ')}</span>
        {profile.approved ? <span className="chip ok">معتمد</span> : <span className="chip warn">مبدئي</span>}
      </div>
      <h3>مستواك: {lvl.title}</h3>
      <div className="steps">{[1, 2, 3].map((s) => <div key={s} className={s <= lvl.step ? 'on' : ''} />)}</div>
      {LEVEL_SUMMARY[key] && <p className="small muted">{LEVEL_SUMMARY[key]}</p>}
    </div>
  );
}

// المسار: واحد من 27 تركيبة لمستوياتك في الأطر الثلاثة، يبقى مفتاحًا داخليًا.
// يرى المشارك ملف تعريفه (إطار الأولوية بمستواه فيه): اسمه ووصفه ورحلته، وسطرًا
// مولَّدًا بأقوى أطره، والتفصيل لكل إطار للإدارة.
const points = (t) => String(t || '').split('\n').map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);

function TrackCard({ profile, cohort }) {
  const t = profile.track;
  const lvl = levelOf(summaryLevel(profile));
  const focus = points(t.focus);
  const journey = points(t.journey);
  return (
    <section className="track">
      <header className="track-head">
        <div className="row between">
          <span className="track-eyebrow">مسارك في البرنامج</span>
          <span className="row" style={{ gap: 6 }}>
            {cohort?.name && <span className="chip">{cohort.name}</span>}
            {lvl.title && <span className="chip track-lvl">المستوى العام: {lvl.title}</span>}
            {profile.approved ? <span className="chip ok">معتمد</span> : <span className="chip warn">مبدئي</span>}
          </span>
        </div>
        <h3>{t.title}</h3>
        {t.summary && <p>{t.summary}</p>}
        {t.strengths && <p className="track-strengths">{t.strengths}</p>}
      </header>
      <div className="track-body">
        {focus.length > 0 && (
          <div className="track-col">
            <h4>أولويات تطويرك</h4>
            <ol className="track-focus">{focus.map((f, i) => <li key={i}><span>{i + 1}</span>{f}</li>)}</ol>
          </div>
        )}
        {t.project && (
          <div className="track-col">
            <h4>مبادرتك</h4>
            <p>{t.project.replace(/^مشروعك التطبيقي:\s*/, '')}</p>
            <span className="small muted">تعمل عليها طوال الرحلة، وهي أساس وثيقة مبادرتك.</span>
          </div>
        )}
        {journey.length > 0 && (
          <div className="track-col">
            <h4>ما يميز مسارك</h4>
            <ul className="track-journey">{journey.map((j, i) => {
              const [k, ...rest] = j.split(':');
              return <li key={i}>{rest.length ? <><b>{k}</b>{rest.join(':')}</> : j}</li>;
            })}</ul>
          </div>
        )}
      </div>
    </section>
  );
}

const AUTO_HINT = {
  'P-INFO': 'يكتمل بحفظ بياناتك الأساسية.',
  'P-CV': 'يكتمل برفع سيرتك من ملفك الشخصي.',
  'A-DONE': 'يكتمل بإرسال إجابات القياس.',
  'AP-OK': 'بانتظار اعتماد المستشار.',
  'E-POST': 'يُفتح القياس البعدي حين تصل إلى مرحلة التقييم.',
  'R-ISSUE': 'يكتمل حين يُعتمد تقييمك الختامي، فتصلك نتيجته مفصّلة في رحلتك.',
  'P-PROJECT': 'يكتمل تلقائيًا حين تكتب اسم مبادرتك ووصفها في «بطاقة المبادرة»، أول صفحة في وثيقة مبادرتك.',
  'T-360': 'يكتمل تلقائيًا حين يرسل مديرك أو أحد زملائك تقديره. أرسل الدعوة من «ملفي».',
  'E-360': 'يكتمل تلقائيًا حين يصل تقدير المدير أو الزملاء بعد البرنامج.',
};


// الاستبانة: تكتمل بإرسال الإجابات (الخادم يتحقق منها)، وتُعدَّل ما دامت المرحلة مفتوحة
function Survey({ item, open, onUpdate, setToast }) {
  const qs = surveyQuestions(item.config);
  const [edit, setEdit] = useState(item.status !== 'done');
  const [v, setV] = useState(item.answers || {});
  const [busy, setBusy] = useState(false);
  if (!qs.length) return null;
  const ready = qs.every((q) => !q.required || (q.type === 'rating' ? v[q.key] >= 1 : String(v[q.key] || '').trim()));
  const send = async () => {
    setBusy(true);
    const r = await call('requirement.update', { requirement_id: item.id, answers: v });
    setBusy(false);
    if (r.success) { onUpdate(r); setEdit(false); setToast('شكرًا، وصلت إجاباتك.'); } else setToast(r.message);
  };
  if (!edit) return open ? <div className="actions"><button className="link small" onClick={() => setEdit(true)}>عدّل إجاباتك</button></div> : null;
  if (!open) return null;
  if (item.waits) return <p className="small muted survey-waits">{item.waits}.</p>;
  return (
    <div className="survey stack">
      {qs.map((q) => (
        <div key={q.key} className="survey-q">
          <span>{q.label}{!q.required && <small className="muted"> (اختياري)</small>}</span>
          {q.type === 'rating'
            ? <span className="rx-stars" role="radiogroup" aria-label={q.label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={v[q.key] === n} aria-label={`${n} من 5`} className={n <= (v[q.key] || 0) ? 'on' : ''} onClick={() => setV({ ...v, [q.key]: n })}>★</button>)}</span>
            : <textarea className="input" rows={2} maxLength={2000} value={v[q.key] || ''} onChange={(e) => setV({ ...v, [q.key]: e.target.value })} />}
        </div>
      ))}
      <div className="actions"><button className="btn sm" disabled={busy || !ready} onClick={send}>{busy ? 'لحظة…' : 'أرسل إجاباتك'}</button></div>
    </div>
  );
}

// عدّاد المرحلة يحسب المطلوب فقط، والاختياري يُذكر وحده: فلا تظهر مرحلة «مكتملة» بعدّاد ناقص
export const stageCount = (stage) => {
  const items = stage.items || [];
  const req = items.filter((i) => i.required);
  if (!items.length || !req.length) return `${stage.done} من ${stage.total}`;
  const opt = items.length - req.length;
  return `${req.filter((i) => i.status === 'done').length} من ${req.length}${opt ? ` · ${opt === 1 ? 'واحد اختياري' : `${opt} اختيارية`}` : ''}`;
};

function Requirement({ item, open, onUpdate, onEditProfile, onHandbook, onImpact, onCapstone, onLabItem, setToast }) {
  const [busy, setBusy] = useState(false);
  // بعد «أنجزته» أو «تراجع» يُستبدل الزر بنقيضه، فيعود التركيز إليه (أو إلى البند إن لم يبق زر) لا إلى أول الصفحة
  const li = useRef(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (li.current?.querySelector('.actions button:not([disabled])') || li.current)?.focus();
  }, [item.status]);
  const act = async (extra) => {
    setBusy(true);
    const res = await call('requirement.update', { requirement_id: item.id, ...extra });
    setBusy(false);
    if (res.success) {
      refocus.current = true;
      onUpdate(res);
      if (!extra.undo) setToast(item.needs_review ? 'أُرسل للمستشار للمراجعة' : 'أحسنت، خطوة منجزة');
    } else setToast(res.message);
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const up = await uploadFile(file, 'evidence');
    setBusy(false);
    if (!up.success) return setToast(up.message);
    act({ evidence_path: up.path });
  };

  const verified = !!item.activity;
  const sys = item.auto || item.kind === 'meeting' || item.kind === 'survey' || verified;
  const canAct = open && !sys && (item.status === 'pending' || item.status === 'returned' || (item.status === 'done' && !item.needs_review));
  const mark = item.status === 'done' ? '✓' : item.status === 'submitted' ? '…' : '';

  return (
    <li ref={li} tabIndex={-1} className={`item ${item.status}`}>
      <span className="box" aria-hidden="true">{mark}</span>
      <div className="grow">
        <div className="row between">
          <span className="t">{item.title_ar}{!item.required && <span className="muted small"> (اختياري)</span>}</span>
          {item.status !== 'pending' && (
            <span className={`chip ${item.status === 'done' ? 'ok' : item.status === 'returned' ? 'bad' : 'warn'}`}>{REQ_STATUS[item.status]}</span>
          )}
        </div>
        {item.help_ar && !(item.code === 'T-360' && sys && !verified && item.status !== 'done') && <p className="h">{item.help_ar}</p>}
        {item.status === 'returned' && item.note && <p className="h" style={{ color: 'var(--bad)' }}>ملاحظة: {item.note}</p>}
        {verified && <Activity item={item} open={open} onUpdate={onUpdate} onHandbook={onHandbook} onCapstone={onCapstone} onLabItem={onLabItem} setToast={setToast} />}
        {sys && !verified && item.kind !== 'survey' && item.status !== 'done' && (
          <p className="h">{AUTO_HINT[item.code] || (item.kind === 'meeting' ? 'يُسجَّل بعد انعقاد الجلسة.' : 'يُنجز تلقائيًا.')}
            {item.code === 'P-INFO' || item.code === 'P-CV' || item.code === 'T-360' ? <> <button className="link" onClick={onEditProfile}>افتح ملفي</button></> : null}
            {item.code === 'P-PROJECT' && <> <button className="link" onClick={onCapstone}>اكتب بطاقة مبادرتك</button></>}
          </p>
        )}
        {item.kind === 'survey' && <Survey item={item} open={open} onUpdate={onUpdate} setToast={setToast} />}
        {open && item.code === 'E-POST' && (
          <div className="actions">
            <button className={`btn sm${item.status === 'done' ? '' : ' gold'}`} onClick={onImpact}>{item.status === 'done' ? 'اعرض ما تغيّر' : 'ابدأ القياس البعدي'}</button>
          </div>
        )}
        {open && item.code === 'E-MGR' && item.status !== 'done' && (
          <div className="actions"><button className="link small" onClick={onImpact}>ادعُ مديرك من صفحة القياس البعدي</button></div>
        )}
        {canAct && item.status !== 'done' && (
          <div className="actions">
            {item.kind === 'upload' ? (
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                {busy ? 'جارٍ الرفع…' : 'ارفع الملف'}
                <input type="file" className="sr" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg" onChange={pick} disabled={busy} />
              </label>
            ) : (
              <button className="btn sm" disabled={busy} onClick={() => act({})}>
                {item.needs_review ? 'أنجزته، أرسله للمراجعة' : 'أنجزته'}
              </button>
            )}
          </div>
        )}
        {canAct && item.status === 'done' && item.kind !== 'upload' && (
          <div className="actions"><button className="link small" disabled={busy} onClick={() => act({ undo: true })}>تراجع</button></div>
        )}
      </div>
    </li>
  );
}

const lines = (t) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);

function Stage({ stage, n, expanded, onToggle, ...rest }) {
  const locked = stage.status === 'locked';
  const mode = MODES[stage.mode];
  const chip = stage.skipped ? <span className="chip ok">أُعفيت منها</span>
    : stage.status === 'done' ? <span className="chip ok">مكتملة</span>
      : stage.status === 'active' ? <span className="chip gold">الحالية</span>
        : stage.status === 'available' ? <span className="chip blue">{stage.stage_mode === 'optional' ? 'مقترحة لك' : 'متاحة عند الحاجة'}</span>
          : <span className="chip">مقفلة</span>;
  const steps = lines(stage.activities_ar);
  return (
    <div id={`stage-${stage.key}`} className={`stage ${stage.status}${expanded ? ' open' : ''}`}>
      <span className="dot">{stage.status === 'done' ? '✓' : n}</span>
      <div className="stage-card">
        <button className="stage-top" onClick={onToggle} aria-expanded={expanded}>
          <div className="grow">
            <h4>{stage.title_ar}</h4>
            <div className="meta">
              {mode && <span className="tag"><i aria-hidden="true">{mode.icon}</i>{mode.title}</span>}
              {stage.duration_label && <span className="tag">{stage.duration_label}</span>}
              {stage.work_mode && <span className="tag">{WORK_AR[stage.work_mode]}</span>}
              {stage.total > 0 && <span className="tag">{stageCount(stage)}</span>}
            </div>
            {locked && stage.lock_reason && <small className="muted">{stage.lock_reason}</small>}
          </div>
          {chip}
          <span className="chev" aria-hidden="true">⌄</span>
        </button>
        {expanded && (
          <div className="stage-body">
            {stage.builds_on_ar && <div className="builds"><span>تنطلق من</span>{stage.builds_on_ar}</div>}
            {stage.description_ar && <p className="lead">{stage.description_ar}</p>}
            {(steps.length > 0 || stage.outcome_ar) && (
              <div className="blocks">
                {steps.length > 0 && (
                  <div className="blk">
                    <b>ما تفعله فيها</b>
                    <ol className="steps-list">{steps.map((x) => <li key={x}>{x}</li>)}</ol>
                    {stage.mode_note_ar && <p className="mode-note">{mode ? `${mode.title}: ` : ''}{stage.mode_note_ar}</p>}
                  </div>
                )}
                {stage.outcome_ar && (
                  <div className="blk deliverable">
                    <b>ما تخرج به</b>
                    <p>{stage.outcome_ar}</p>
                  </div>
                )}
              </div>
            )}
            {stage.items.length > 0 && (
              <>
                <div className="check-head"><b>قائمة التحقق</b><span className="small muted">{stageCount(stage)}</span></div>
                <ul className="checklist">
                  {stage.items.map((it) => <Requirement key={it.id} item={it} open={!locked} {...rest} />)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// الخطوة التالية: أول متطلب يستطيع المشارك إنجازه بنفسه في المرحلة الحالية
// جلستك القادمة: أقرب جلسة ورشة لم تنتهِ، من بنود الرحلة نفسها (مصدرها workshop_sessions). في نافذتها تفتح القاعة.
export function nextSession(journey, now = Date.now()) {
  const all = (journey || []).flatMap((st) => (st.items || []).filter((i) => i.activity?.type === 'workshop').flatMap((i) => i.activity.sessions || []));
  return all.filter((x) => new Date(x.ends_at).getTime() > now).sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)))[0] || null;
}
const two = (n) => String(n).padStart(2, '0');
const icsStamp = (iso) => { const d = new Date(iso); return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}00Z`; };
// ملف تقويم يُنزَّل من الجهاز: الموعد نفسه بلا طلب للخادم
export function sessionIcs(x) {
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Milestone Impact//Leaders//AR', 'BEGIN:VEVENT', `UID:${x.id}@sunkvalue.com`, `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(x.starts_at)}`, `DTEND:${icsStamp(x.ends_at)}`, `SUMMARY:${esc(x.title)}`, ...(x.location ? [`LOCATION:${esc(x.location)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(x.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
function NextSession({ session, onHall }) {
  const when = new Date(session.starts_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const download = () => {
    const url = URL.createObjectURL(new Blob([sessionIcs(session)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'session.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className={`next-card j-session${session.open ? ' live' : ''}`} data-tour="next-session">
      <span className="k">{session.open ? 'جلستك الآن' : 'جلستك القادمة'}</span>
      <b>{session.title}</b>
      <span className="small muted">{when}{session.mode === 'online' ? ' · عن بعد' : session.location ? ` · ${session.location}` : ''}</span>
      {session.attended && <span className="chip ok">سُجّل حضورك</span>}
      <div className="row">
        {session.open && onHall && <button className="btn sm" onClick={onHall}>ادخل القاعة</button>}
        <button className="btn ghost sm" onClick={download}>أضفها إلى تقويمك</button>
      </div>
    </div>
  );
}

function nextStep(journey) {
  for (const st of journey.filter((s) => s.status === 'active')) {
    const it = st.items.find((i) => i.status === 'returned')
      || st.items.find((i) => i.status === 'pending' && !i.auto && i.kind !== 'meeting' && i.activity?.type !== 'workshop');
    if (it) return { stage: st, item: it };
  }
  return null;
}

function Welcome({ firstName, onClose }) {
  return (
    <div className="banner mist welcome">
      <span className="ico"><Ico name="hand" /></span>
      <div className="grow">
        <b>أهلًا {firstName}، هكذا تعمل رحلتك</b>
        <ol className="small">
          <li>كل مرحلة قائمة تحقق: بعض بنودها تؤكدها بنفسك، وبعضها يُوثَّق تلقائيًا من نشاطك.</li>
          <li>المستشار هو من يراجع ما تسلّمه ويعتمد مسارك، وتصلك ملاحظته هنا إن احتاج تعديلًا.</li>
        </ol>
        <IntroVideo className="link small" />
      </div>
      <button className="link small" onClick={onClose}>فهمت</button>
    </div>
  );
}

// «هكذا يظهر اسمك»: الاسم كما سيُطبع على الشهادة، يؤكده صاحبه قبل صدورها (7.3). الاسم يُقفل بعد الصدور،
// والشهادة تحمل رقم تحقق عامًا، فالتأكيد يسبقها لا يلحقها. التعديل من «ملفي»، وتعديله يلغي التأكيد
function NameConfirm({ participant, onConfirmed }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const confirm = async () => {
    setBusy(true); setErr('');
    const r = await call('profile.confirm-name');
    setBusy(false);
    if (r.success) onConfirmed(r); else setErr(r.message);
  };
  return (
    <div className="name-confirm stack" role="group" aria-labelledby="nc-title">
      <h3 id="nc-title" className="as-h4">هكذا يظهر اسمك على الشهادة</h3>
      <div className="name-confirm-preview">
        <b>{participant.full_name}</b>
        {participant.name_en ? <span className="ltr" lang="en">{participant.name_en}</span> : <small className="muted">بلا اسم بالإنجليزية (اختياري، يُضاف من ملفك)</small>}
      </div>
      <p className="small muted">راجعه حرفًا حرفًا: يُطبع كما هو، ويُقفل بعد صدور الشهادة. إن كان فيه خطأ فصحّحه من «ملفي» ثم عد لتأكيده.</p>
      {err && <div className="alert err small" role="alert">{err}</div>}
      <div className="row"><button className="btn sm" disabled={busy} onClick={confirm}>{busy ? 'لحظة…' : 'الاسم صحيح، أكّده'}</button></div>
    </div>
  );
}

// شهادة المشاركة: تظهر لمن أنهى البرنامج أو اعتُمد تقييمه الختامي بنجاح، وتُفتح في نافذة جاهزة للطباعة
function CertificateCard({ participant }) {
  const [cert, setCert] = useState(undefined);
  const [msg, setMsg] = useState('');
  const [confirmed, setConfirmed] = useState(participant.name_confirmed);
  const load = () => call('certificate').then((r) => setCert(r.success ? r.certificate : null));
  useEffect(() => { load(); }, []);
  if (cert === undefined) return null;
  const awaitingName = !cert && confirmed === false && !participant.name_locked;
  const open = async () => {
    const win = window.open('', '_blank');   // متزامنة مع النقرة حتى لا يحجبها المتصفح
    const { writeCertificate } = await import('../../../src/lib/brand/certificate.js');
    setMsg(!(await writeCertificate(win, cert)) ? POPUP_BLOCKED : '');
  };
  const share = async () => {
    const { linkedinUrl } = await import('../../../src/lib/brand/certificate.js');
    window.open(linkedinUrl(cert), '_blank', 'noopener');
  };
  return (
    <section className="card cert-card" aria-label="شهادة الإتمام">
      <span className="cert-mark" aria-hidden="true" />
      <div className="grow stack">
        <p className="eyebrow">شهادة الإتمام بنجاح</p>
        {cert ? <>
          <h2>مبارك، صدرت شهادتك</h2>
          <p className="small muted">رقمها <span className="ltr">{cert.serial}</span>، ولها رابط تحقق عام يثبت صحتها لمن تشاركها معه.</p>
        </> : awaitingName ? <>
          <h2>خطوة واحدة قبل شهادتك</h2>
          <p className="small muted">تصدر شهادتك حين تؤكد اسمك كما سيُطبع عليها، إن كان تقييمك الختامي معتمدًا بقرار «اجتاز» أو «اجتاز بملاحظات».</p>
          <NameConfirm participant={participant} onConfirmed={() => { setConfirmed(true); load(); }} />
        </> : <>
          <h2>شهادتك قيد الإصدار</h2>
          <p className="small muted">تصدر شهادتك آليًا حين يُعتمد تقييمك الختامي بقرار «اجتاز» أو «اجتاز بملاحظات»، وتظهر هنا.</p>
        </>}
        {msg && <div className="alert err small" role="alert">{msg}</div>}
      </div>
      {cert && <div className="row">
        <button className="btn sm" onClick={open}>اعرض الشهادة</button>
        <button className="btn sm ghost" onClick={share}>أضفها إلى LinkedIn</button>
      </div>}
    </section>
  );
}

// دعوة المدير المباشر قبل البرنامج: تقديره الآن هو خط الأساس الذي يُقارن به
// تقديره بعد البرنامج، وهو أقوى من سؤاله لاحقًا عن "قبل" بالتذكر.
// تظهر في الرحلة مرة حتى يُغلقها المشارك، وتبقى دائمًا في «ملفي» (inSettings)
const PRE_HIDE = 'mi_pre_manager_hidden';
const preHidden = () => { try { return localStorage.getItem(PRE_HIDE) === '1'; } catch { return false; } };
export function PreManager({ inSettings = false }) {
  const [hidden, setHidden] = useState(() => !inSettings && preHidden());
  const [data, setData] = useState(null);
  const [f, setF] = useState({ email: '', full_name: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // البطاقة المخفية لا تطلب حالتها: impact.mine يحسب ثبات الدفعة على الخادم في كل طلب (فحص الجاهزية p-capstone-7)
  useEffect(() => {
    if (hidden) return;
    call('impact.mine').then((r) => setData(r.success ? r : null));
  }, [hidden]);
  if (hidden || !data?.pre_available) return null;
  const pre = data.raters.find((r) => r.phase === 'pre');
  if (pre?.status === 'submitted') return null;
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await call('rater.invite', { ...f, phase: 'pre' });
    setBusy(false);
    if (res.success) setData(res); else setMsg(res.message || 'تعذّر إرسال الدعوة. تحقق من البريد وحاول مرة أخرى.');
  };
  return (
    <div className="banner mist">
      <span className="ico"><Ico name="people" /></span>
      <div className="grow stack" style={{ gap: 8 }}>
        <div className="row between"><b>ادعُ مديرك المباشر ليقدّر ممارستك الآن، قبل البرنامج</b>
          {!inSettings && <button type="button" className="link small" aria-label="إخفاء" onClick={() => { try { localStorage.setItem(PRE_HIDE, '1'); } catch { /* خاص */ } setHidden(true); }}>إخفاء · تجدها في «ملفي»</button>}</div>
        {pre?.status === 'awaiting'
          ? <p className="small">دعوة {pre.full_name || pre.email} بانتظار تأكيد مستشارك أو منسق جهتك ({pre.flags_ar?.join('، ') || 'بريد من غير نطاق جهتك'})، وتصله فور التأكيد. بريد جهتك يصل فورًا.</p>
          : pre
          ? <p className="small">أُرسلت الدعوة إلى {pre.full_name || pre.email}. ننتظر تقديره، وسنطلب منه التقدير نفسه بعد البرنامج.</p>
          : (
            <form className="row" style={{ gap: 8, flexWrap: 'wrap' }} onSubmit={send}>
              <p className="small" style={{ flexBasis: '100%' }}>5 دقائق، بلا حساب، ولا يظهر لك تقديره منفردًا.</p>
              <input className="input" aria-label="اسم المدير" autoComplete="off" placeholder="اسم المدير" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
              <input className="input ltr" type="email" required aria-label="بريد المدير" placeholder="بريد المدير" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <button className="btn gold sm" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل الدعوة'}</button>
              {msg && <div className="alert err" style={{ flexBasis: '100%' }}>{msg}</div>}
            </form>
          )}
      </div>
    </div>
  );
}

const WORK_AR = { shared: 'جماعي مع دفعتك', individual: 'فردي', groups: 'مع مجموعتك' };

// المعالم: أين أنت من مشروعك ورحلتك، وما المتأخر وبكم يوم
const MS_CHIP = { done: 'ok', late: 'bad', due_soon: 'gold', on_time: '', unscheduled: '' };
const MS_AR = { done: 'منجز', late: 'متأخر', due_soon: 'يستحق قريبًا', on_time: 'في الموعد', unscheduled: 'بلا موعد بعد' };
const msDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('ar', { day: 'numeric', month: 'long', timeZone: 'UTC' });
// على عمود واحد (الجوال والتابلت) تُطوى الأقسام الثانوية في سطر بعنوانها ورقمها، فتبقى «خطوتك التالية» ثم المراحل
// في أول شاشتين. على الحاسب (عمودان) تبقى مفتوحة بلا سطر الطي (styles.css: .j-fold). الحالة لا تُحفظ: راحة عرض.
const NARROW = '(max-width: 1119px)';
function Fold({ title, meta, children }) {
  const [open, setOpen] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.(NARROW).matches));
  return (
    <details className="j-fold" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><b>{title}</b>{meta && <span className="small muted">{meta}</span>}</summary>
      {children}
    </details>
  );
}

const PhaseOpen = ({ children }) => children;

// مراحل قادمة مقفلة: على الحاسب تُعرض كما هي، وعلى الشاشات الضيقة سطر واحد يُفتح
function Later({ n, after, children }) {
  const [narrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches);
  if (!narrow) return children;
  return (
    <details className="j-later">
      <summary>{countAr(n, 'مرحلة قادمة', 'مرحلتان قادمتان', 'مراحل قادمة', 'مرحلة قادمة')} <span className="small muted">تُفتح بعد {after}</span></summary>
      {children}
    </details>
  );
}

function Milestones({ list, summary }) {
  if (!list?.length) return null;
  return (
    <section className="card stack ms-card" data-tour="milestones" aria-labelledby="ms-h">
      <div className="row between fold-h">
        <h2 id="ms-h" className="as-h3">معالمك</h2>
        <span className="small muted">{summary.done} من {summary.total} منجزة</span>
      </div>
      {summary.late > 0 && <div className="banner"><span className="ico"><Ico name="clock" /></span><div className="grow">لديك {summary.late === 1 ? 'معلم متأخر' : `${summary.late} معالم متأخرة`}، أقصاها {summary.max_late} يومًا. ابدأ بالأقدم، أو اطلب استشارة إن احتجت دعمًا.</div></div>}
      <div className="ms-bar" role="progressbar" aria-label="نسبة إنجاز معالمك" aria-valuetext={`${summary.done} من ${summary.total} منجزة`} aria-valuenow={summary.pct || 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${summary.pct || 0}%` }} /></div>
      <ol className="ms-list">{list.map((m) => (
        <li key={m.id} className={m.status}>
          <div className="grow"><b>{m.title_ar}</b>{m.description_ar && <p className="small muted">{m.description_ar}</p>}</div>
          <div className="ms-when">
            {m.due && <small className="muted">{msDay(m.due)}</small>}
            <span className={`chip ${MS_CHIP[m.status]}`}>{MS_AR[m.status]}{m.status === 'late' ? ` ${m.late_days} يومًا` : ''}</span>
          </div>
        </li>
      ))}</ol>
    </section>
  );
}

// التقييم المستمر بصوت المشارك: أين أنت، ومن أين جاء الرقم، وما الذي يرفعه
const TREND_AR = { up: 'أداؤك يتحسن في آخر تقييماتك', down: 'آخر تقييماتك أقل مما قبلها؛ راجع الملاحظات أو اطلب استشارة', flat: 'أداؤك مستقر' };
function Continuous({ c }) {
  if (!c || c.index == null) return null;
  return (
    <section className="card stack" data-tour="continuous" aria-labelledby="ca-h">
      <div className="row between fold-h">
        <h2 id="ca-h" className="as-h3">تقدمك في التقييم المستمر</h2>
        <b className="ca-index">{c.index}٪</b>
      </div>
      <p className="small muted">يُجمع من اختبارات الكتيب، ونماذجك، ومعالم مشروعك، وأدوات المختبر، وإسهامك المؤكَّد في طلبات زملائك؛ ولا يدخل فيه مصدر قبل أن تكتمل له أحداث كافية. هو مرآة لتقدمك، ويُبنى عليه التقييم الختامي.</p>
      {c.trend && <p className="small">{TREND_AR[c.trend.dir]}</p>}
      <ul className="ca-list">{c.components.map((x) => (
        <li key={x.key}><span>{x.label}</span><small className="muted">{x.value != null ? `${x.value}٪ · ${x.reason}` : x.reason}</small></li>
      ))}
      {c.engagement?.value != null && <li><span>{c.engagement.label}</span><small className="muted">{c.engagement.value}٪ · يُعرض لك ولخبيرك ولا يدخل المؤشر</small></li>}
      </ul>
    </section>
  );
}

// تنبيهات وملاحظات من الإدارة أو المستشار أو النظام (participant_observations المرئية): بطاقة أعلى الرحلة حتى يضغط «اطّلعت».
// النص نفسه الذي في البريد وفي ملفه عند الإدارة. بعد الاطلاع تختفي من هنا وتبقى في ملفه.
function Notices({ list }) {
  const [items, setItems] = useState(list || []);
  const [busy, setBusy] = useState(null);
  useEffect(() => { setItems(list || []); }, [list]);
  if (!items.length) return null;
  const ack = async (id) => {
    setBusy(id);
    const r = await call('me.notice-ack', { id });
    setBusy(null);
    if (r.success) setItems(r.notices || []);
  };
  return (
    <section className="notices" aria-label="تنبيهات وملاحظات">
      {items.map((n) => (
        <article key={n.id} className={`card notice ${n.kind}`} role={n.kind === 'warning' ? 'alert' : 'status'}>
          <p className="eyebrow">{n.kind_ar}</p>
          {n.title && <h2>{n.title}</h2>}
          <p>{n.body}</p>
          <button type="button" className="btn sm ghost" disabled={busy === n.id} onClick={() => ack(n.id)}>اطّلعت</button>
        </article>
      ))}
    </section>
  );
}

export default function Journey({ me, onUpdate, onEditProfile, onHandbook, onImpact, onCapstone, onHall, lab, onLab, onLabItem }) {
  const { journey, profile, participant } = me;
  // حالة الاستبيان من الطلب المجمّع عند الفتح، تُقرأ مرة في أول رسم (البند 7.5)
  const [susFirst] = useState(() => bootPreload.take('sus'));
  const current = journey.find((s) => s.status === 'active');
  const [expanded, setExpanded] = useState(() => new Set(current ? [current.key] : []));
  const [toast, setToast] = useState('');
  const [passkey, setPasskey] = useState(me.prompt_passkey);
  const [welcome, setWelcome] = useState(() => !welcomeSeen.get());
  const closeWelcome = () => { welcomeSeen.set(true); setWelcome(false); };
  // الخطوة الأخيرة من معالج البداية: بعد إرسال القياس وحتى الاعتماد، مرة واحدة
  const [nextCard, setNextCard] = useState(() => !nextSeen.get());
  const closeNext = () => { nextSeen.set(true); setNextCard(false); };
  const next = nextStep(journey);
  const goTo = (key) => {
    setExpanded((s) => new Set(s).add(key));
    setTimeout(() => document.getElementById(`stage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const approved = !!profile?.approved;
  const reading = approved ? lastRead.get() : null;

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (key) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const firstName = participant.full_name.split(' ')[0];
  // المرحلة عند الطلب أو الاختيارية لا تُحسب على المشارك إن لم يحتجها
  const counted = journey.filter((s) => (s.stage_mode || 'required') === 'required' || s.status === 'done');
  const doneCount = counted.filter((s) => s.status === 'done').length;
  // موعد المراجعة المعلن (D04) بصيغة الجملة؛ وسم المرحلة المرفوع «يوما عمل» يظهر وحده في خط الرحلة
  const reviewWait = APPROVAL_SLA_AR;
  let order = 0;
  const upcoming = approved ? nextSession(journey) : null;

  return (
    <div className="page wide">
      <Notices list={me.notices} />
      <section className="hero" data-tour="journey-hero">
        <div className="stack">
          <p className="eyebrow">رحلتك القيادية</p>
          <h1>{approved ? `${firstName}، رحلتك مفتوحة` : `شكرًا ${firstName}، نتيجتك قيد المراجعة`}</h1>
          <p className="muted">
            {current ? <>المرحلة الحالية: <b style={{ color: '#fff' }}>{current.title_ar}</b> · أنجزت {doneCount} من {countAr(counted.length, 'مرحلة واحدة', 'مرحلتين', 'مراحل', 'مرحلة')}</>
              : doneCount === counted.length && counted.length ? 'أكملت الرحلة كاملة. أثرك الآن موثّق.'
                : !approved ? `أنجزت ${doneCount} من ${countAr(counted.length, 'مرحلة واحدة', 'مرحلتين', 'مراحل', 'مرحلة')}، والخطوة التالية اعتماد مسارك`
                  : `أنجزت ${doneCount} من ${countAr(counted.length, 'مرحلة واحدة', 'مرحلتين', 'مراحل', 'مرحلة')}`}
          </p>
          <div className="phase-rail" aria-label="أطوار الرحلة">
            {PHASES.map((ph) => {
              const st = journey.filter((s) => (s.phase || 'qualification') === ph.key);
              const state = st.length && st.every((s) => s.status === 'done') ? 'done' : st.some((s) => s.status === 'active') ? 'on' : '';
              return <div key={ph.key} className={state}><i />{ph.title}</div>;
            })}
          </div>
        </div>
        <Ring value={me.progress} />
      </section>
      {(participant.status === 'completed' || ['pass', 'pass_notes'].includes(me.final?.decision)) && <CertificateCard participant={participant} />}
      <RateExpert />
      {approved && <SusCard call={call} initial={susFirst} />}
      {approved && me.group && (
        <div className="banner"><span className="ico"><Ico name="people" /></span><div className="grow">مجموعتك: <b>{me.group.name}</b> · {me.group.members} {me.group.members > 2 ? 'أعضاء' : 'عضو'}{me.project_mode === 'group' ? '. مبادرة مجموعتكم واحدة، ووثيقة كل عضو يكتبها بنفسه وتُقيَّم باسمه.' : ''}</div></div>
      )}
      {/* مستشارك الفعلي (خبير مجموعتك أو مستشار دفعتك): يصله ما تسلّمه ويقيّمه. الاسم وحده، والتواصل عبر الإدارة */}
      {approved && me.advisor && (
        <div className="banner" data-testid="my-advisor"><span className="ico"><Ico name="people" /></span><div className="grow">مستشارك: <b>{me.advisor.full_name}</b>. تصله النماذج التي تسلّمها ويقيّمها.</div></div>
      )}
      {!approved && profile && (
        <div className="banner gold">
          <span className="ico"><Ico name="hourglass" /></span>
          <div className="grow">
            <b>ماذا يحدث الآن؟</b>
            <p className="small">
              نتيجتك المبدئية جاهزة، ويراجعها المستشار الآن. {reviewWait ? `تستغرق المراجعة عادةً ${reviewWait}. ` : ''}بعد اعتماد مسارك يُفتح برنامج التأهيل وكتيبك، ويصلك بريد بذلك.
              {' '}للاستفسار: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
        </div>
      )}
      {nextCard && !approved && participant.status !== 'completed' && <OnboardingNextCard me={me} onClose={closeNext} />}

      {/* على الحاسب عمودان: الرحلة في الوسط، وما تفعله الآن في عمود جانبي ثابت.
          وعلى الهاتف والتابلت عمود واحد: الخطوة التالية أولًا، ثم المسار والمراحل، ثم الكتيب والمختبر */}
      <div className="j-layout">
        {/* بطاقات الطلب (دعوة المدير والترحيب ومفتاح المرور) تحت «خطوتك التالية» لا فوقها: على الهاتف كانت تدفعها
            تحت الشاشة الأولى (فحص الجاهزية p-entry-6). وعلى الحاسب أول العمود الأوسط فوق المراحل */}
        <div className="j-asks">
          {participant.status !== 'completed' && <PreManager />}
          {welcome && approved && <Welcome firstName={firstName} onClose={closeWelcome} />}
          {passkey && <PasskeyBanner onDone={(r) => { setPasskey(false); if (r === 'set') setToast('فُعّل مفتاح المرور'); }} />}
        </div>
        <aside className="j-side" aria-label="ما تفعله الآن">
          {(next || reading || upcoming) && (
            <div className="next-grid j-next" data-tour="next-step">
              {upcoming && upcoming.open && <NextSession session={upcoming} onHall={onHall} />}
              {next && (
                <div className="next-card">
                  <span className="k">{next.item.status === 'returned' ? 'مطلوب تعديله' : 'خطوتك التالية'}</span>
                  <b>{next.item.title_ar}</b>
                  <span className="small muted">{next.stage.title_ar}</span>
                  <div className="row"><button className="btn" onClick={() => goTo(next.stage.key)}>اذهب إليها</button></div>
                </div>
              )}
              {upcoming && !upcoming.open && <NextSession session={upcoming} onHall={onHall} />}
              {reading && (
                <div className="next-card">
                  <span className="k">تابع القراءة</span>
                  <b>{reading.title}</b>
                  <span className="small muted">كتيبك</span>
                  <div className="row"><button className="btn gold sm" onClick={onHandbook}>أكمل من حيث توقفت</button></div>
                </div>
              )}
            </div>
          )}
          <div className="j-tools">
            <div className="tool-card">
              <span className="k">كتيبك</span>
              <b>كتيب القائد</b>
              <p className="small muted">{approved
                ? 'أبواب الأطر الثلاثة بعمق يناسب مستواك.'
                : 'يُفتح بعد اعتماد مسارك.'}</p>
              <div className="row">{approved
                ? <button className="btn gold sm" onClick={onHandbook}>افتح كتيبي</button>
                : <span className="chip"><Ico name="lock" size="14" /> مقفل</span>}</div>
            </div>
            {lab?.length > 0 && (
              <div className="tool-card">
                <span className="k">مختبر القائد</span>
                <b>أدوات عمل ومواقف محاكاة</b>
                <p className="small muted">أتقنت {lab.filter((it) => it.progress.best >= MASTERY).length} من {lab.length}.</p>
                <div className="row"><button className="btn gold sm" onClick={onLab}>افتح المختبر</button></div>
              </div>
            )}
          </div>
        </aside>

        <div className="j-main" data-tour="stages">
          {/* تحت «خطوتك التالية» لا فوقها: الفعل التالي أول ما يراه المشارك، ثم مواعيده وتقدمه */}
          {approved && me.milestones?.length > 0 && <Fold title="معالمك" meta={`${me.milestone_summary.done} من ${me.milestone_summary.total} منجزة${me.milestone_summary.late ? ` · ${me.milestone_summary.late} متأخرة` : ''}`}><Milestones list={me.milestones} summary={me.milestone_summary} /></Fold>}
          {approved && me.final_policy && <HowEvaluated policy={me.final_policy} />}
          {me.final && (
            <div className={`banner ${me.final.decision === 'pass' || me.final.decision === 'pass_notes' ? 'gold' : ''}`}><span className="ico"><Ico name="cap" /></span>
              <div className="grow">نتيجة تقييمك الختامي: <b>{me.final.decision_ar}</b> ({me.final.score}٪). {me.final.decision === 'extend' ? 'مُدّدت مرحلتك لتستكمل ما ينقص؛ تواصل مع خبيرك لخطة الاستكمال.' : ''}
                {me.final.notes && <><br /><small>ملاحظات خبيرك: «{me.final.notes}»</small></>}</div></div>
          )}
          {approved && me.continuous?.index != null && <Fold title="تقدمك في التقييم المستمر" meta={`${me.continuous.index}٪`}><Continuous c={me.continuous} /></Fold>}
          {approved && <PeerRequests compact />}
          {approved && <ChooseExpert />}

          {profile && (
            <Fold title={profile.track?.title ? 'مسارك' : 'نتيجتك'} meta={profile.track?.title || 'حصيلة قياسك في الأطر الثلاثة'}>
              <div className="section-title fold-h">
                <h2>{profile.track?.title ? 'مسارك' : 'نتيجتك'}</h2>
                <span className="small muted">حصيلة قياسك في الأطر الثلاثة</span>
              </div>
              {profile.track?.title ? <TrackCard profile={profile} cohort={me.cohort} /> : <Competency profile={profile} />}
            </Fold>
          )}

          <div className="section-title">
            <h2>مراحل الرحلة</h2>
            <span className="small muted">{me.progress}% من الرحلة</span>
        </div>
        {PHASES.map((ph, pi) => {
          const stages = journey.filter((s) => (s.phase || 'qualification') === ph.key);
          if (!stages.length) return null;
          const doneHere = stages.filter((s) => s.status === 'done').length;
          // على الشاشات الضيقة يبقى الطور الذي فيه عملك مفتوحًا، والبقية عناوين تُفتح: الرئيسية شاشتان لا خمس
          const here = stages.some((s) => s.status === 'active' || s.key === next?.stage.key || expanded.has(s.key));
          const Wrap = here ? PhaseOpen : Fold;
          return (
            <Wrap key={ph.key} title={`${pi + 1}. ${ph.title}`} meta={`${doneHere} من ${stages.length}`}>
            <div className="phase">
              <div className={`phase-head ${here ? '' : 'fold-h'}`}>
                <span className="phase-no">{pi + 1}</span>
                <div className="grow"><h3>{ph.title}</h3><span className="small muted">{ph.hint}</span></div>
                <span className="small muted">{doneHere} من {stages.length}</span>
              </div>
              <div className="timeline">
                {(() => {
                  const card = (s) => {
                    order += 1;
                    return (
                      <Stage key={s.key} stage={s} n={order} expanded={expanded.has(s.key)} onToggle={() => toggle(s.key)}
                        onUpdate={onUpdate} onEditProfile={onEditProfile} onHandbook={approved ? onHandbook : null} onImpact={onImpact} onCapstone={approved ? onCapstone : null} onLabItem={onLabItem} setToast={setToast} />
                    );
                  };
                  // المراحل المقفلة بعد مرحلتك الحالية سطر واحد يُفتح على الشاشات الضيقة: أسماؤها ومددها بضغطة لا بتمرير
                  let cut = stages.length;
                  while (here && cut > 0 && stages[cut - 1].status === 'locked' && !expanded.has(stages[cut - 1].key) && stages[cut - 1].key !== next?.stage.key) cut -= 1;
                  const later = cut > 0 && stages.length - cut >= 2 ? stages.slice(cut) : [];
                  const shown = later.length ? stages.slice(0, cut) : stages;
                  return (
                    <>
                      {shown.map(card)}
                      {later.length > 0 && <Later n={later.length} after={shown[shown.length - 1].title_ar}>{later.map(card)}</Later>}
                    </>
                  );
                })()}
              </div>
            </div>
            </Wrap>
          );
        })}

        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
