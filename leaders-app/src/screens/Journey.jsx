// ════════════════════════════════════════════════════════════════
// الرحلة: ملف الكفاءة 3×3 ومراحل البرنامج بقوائم تحققها
// ════════════════════════════════════════════════════════════════
// كل ما يظهر هنا (المراحل، المدد، الأنشطة، المخرجات، المتطلبات) يأتي
// من الخادم كما ضبطته الإدارة؛ لا نص مثبت للمراحل في الواجهة.
import FirstChapter from './FirstChapter.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SusCard from '../SusCard.jsx';
import Ico from '../Ico.jsx';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { bootPreload, call, lastRead, nextSeen, uploadFile, welcomeSeen } from '../api.js';
import IntroVideo from '../IntroVideo.jsx';
import { APPROVAL_SLA_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { OnboardingNextCard } from '../Onboarding.jsx';
import { DIMENSIONS, dimOf, MODES, PHASES, REQ_STATUS } from '../labels.js';
import { InitiativeNow } from './InitiativeNow.jsx';
import { docHoursAr } from '../../../supabase/content/initiative-guide/v1/spine.js';
import { POPUP_BLOCKED } from '../ui.jsx';
import { countAr, sessionsBookedAr } from '../../../supabase/functions/leaders-api/labels.js';
import { sessionsAr } from '../../../supabase/functions/leaders-api/journey.js';
import { OPTIONAL_PARTICIPANT_AR } from '../../../supabase/functions/leaders-api/optional.js';
import { linkPending, SESSION_LINK_LATER_AR, SESSION_TBD_AR, surveyQuestions } from '../../../supabase/functions/leaders-api/logic.js';
import Activity, { CheckinHelp } from './Activities.jsx';
import HowEvaluated from './HowEvaluated.jsx';
import { MASTERY } from '../../../supabase/functions/leaders-api/lab.js';
import { CONTACT } from '../../../src/config/constants.js';
import RateExpert from './RateExpert.jsx';
import { NoManager } from './Impact.jsx';
import { CommitmentCard } from './Commitments.jsx';
import { GuidancePanel } from './Guidance.jsx';
import { currentStages } from '../../../supabase/functions/leaders-api/journey-map.js';
import { FINAL_ASK_DETAIL_AR, FINAL_NO_DETAIL_AR, finalDetailView, finalView, fmtDate, fmtTime, fmtWhen, holdLine, lateBannerAr, lateByAr, lateShortAr, stageDates, stageOffAr, stageTally, stagesOfAr } from '../journey-copy.js';
import { foldStore, stageFoldId } from '../journey-folds.js';
import { canReplaceFile } from '../../../supabase/functions/leaders-api/upload-file.js';
import { DEMO_SAMPLE_AR, DEMO_SKIPPED_AR } from '../../../supabase/functions/leaders-api/demo-stage.js';
import { journeyPhases } from '../../../supabase/functions/leaders-api/stage-move.js';
import EmailInput from '../../../shared/ui/EmailInput.jsx';
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

// لا مستوى ملخص للمشارك (قرار المالك 2026-11-25): هويته مساره بملف تعريفه. قبل تحدد المسار: حصيلة قياسه بلا مستوى
function Competency({ profile }) {
  return (
    <div className="dim overall">
      <div className="row between">
        <span className="en">{DIMENSIONS.map((d) => d.short).join(' · ')}</span>
        {profile.approved ? <span className="chip ok">معتمد</span> : <span className="chip warn">مبدئي</span>}
      </div>
      <h3>مسارك يتحدد من قياسك في الأطر الثلاثة</h3>
      <p className="small muted">يظهر هنا مسارك باسمه ووصفه حين تكتمل نتائجك في الأطر الثلاثة.</p>
    </div>
  );
}

// المسار: واحد من 27 تركيبة لمستوياتك في الأطر الثلاثة، يبقى مفتاحًا داخليًا.
// يرى المشارك ملف تعريفه (إطار الأولوية بمستواه فيه): اسمه ووصفه ورحلته، وسطرًا
// مولَّدًا بأقوى أطره، والتفصيل لكل إطار للإدارة.
const points = (t) => String(t || '').split('\n').map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);

// بطاقة المسار كما يحلها trackManifest على الخادم: الكتاب والوثيقة والرحلة والدعم، بلا حساب من المستويات هنا
const HB_TYPE_AR = { guided: 'موجّه بأمثلة مبسطة', applied: 'تطبيقي بأمثلة من القطاع', specialist: 'متخصص بالمعايير' };
const SUPPORT_AR = { readiness: 'ثلاثة أسئلة جاهزية ومثال بجانب كل حقل', examples: 'أمثلة محلولة من قطاعك', on_demand: 'الأمثلة عند الطلب' };
export function TrackCardFacts({ card }) {
  const [a, b] = card.initiative.pages || [];
  const h = card.support?.estimate_hours || [];
  // زمن الوثيقة من حقولها (docMinutes)، الرقم نفسه في خط الوثيقة؛ ومدى المسار العام حين لا يصل
  const mins = card.support?.minutes;
  return (
    <div className="track-col track-facts" data-testid="track-card">
      <h4>بطاقة مسارك</h4>
      <ul className="track-journey">
        <li><b>الكتاب</b> {HB_TYPE_AR[card.handbook.type]}، يبدأ بإطار {dimOf(card.handbook.deepened).title}</li>
        <li><b>وثيقتك</b> {card.initiative.name}{a ? ` · نحو ${a} إلى ${b} صفحات` : ''}</li>
        <li><b>رحلتك</b> {card.journey.requirements.length} أعمال بمستواك، ومعها {card.journey.labs.length} مختبرات</li>
        <li><b>الدعم</b> {SUPPORT_AR[card.support.mode]}{Number.isFinite(mins) ? ` · نحو ${docHoursAr(mins)} لكتابة وثيقتك` : h.length ? ` · نحو ${h[0]} إلى ${h[1]} ساعة لكتابة وثيقتك` : ''}</li>
      </ul>
    </div>
  );
}

// سطر التطور بعد ترقية اعتمدها المستشار (track-history.ts)، وما أضيف بأعداده، وسجل المسار كله تحته
const addedAr = (a) => [a?.handbook && `${a.handbook} من أبواب الكتاب`, a?.chapters && `${a.chapters} من فصول الوثيقة`, a?.fields && `${a.fields} من الحقول`].filter(Boolean).join('، ');
export function Evolution({ h }) {
  return (
    <div className="track-evolution" data-testid="track-evolution">
      <b>{h.line}</b>{addedAr(h.added) ? `: ${addedAr(h.added)}، معلّمة «جديد في مستواك»، وكل ما كتبته باقٍ.` : '.'}
    </div>
  );
}
export function TrackHistory({ history }) {
  if (!history?.length) return null;
  return (
    <details className="track-history" data-testid="track-history">
      <summary>سجل مسارك ({history.length})</summary>
      <ol>{history.map((h, i) => <li key={i}><b>{h.title || 'مسارك'}</b> <small className="muted">{String(h.created_at || '').slice(0, 10)}</small>{h.line ? <div className="small">{h.line}</div> : null}</li>)}</ol>
    </details>
  );
}

function TrackCard({ profile, cohort }) {
  const t = profile.track;
  const focus = points(t.focus);
  const journey = points(t.journey);
  return (
    <section className="track">
      <header className="track-head">
        <div className="row between">
          <span className="track-eyebrow">مسارك في البرنامج</span>
          <span className="row" style={{ gap: 6 }}>
            {cohort?.name && <span className="chip">{cohort.name}</span>}
            {profile.approved ? <span className="chip ok">معتمد</span> : <span className="chip warn">مبدئي</span>}
          </span>
        </div>
        <h3>{t.title}</h3>
        {t.summary && <p>{t.summary}</p>}
        {t.strengths && <p className="track-strengths">{t.strengths}</p>}
        {profile.history?.[0]?.line && <Evolution h={profile.history[0]} />}
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
        {t.card && <TrackCardFacts card={t.card} />}
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
      <TrackHistory history={profile.history} />
    </section>
  );
}

const AUTO_HINT = {
  'P-INFO': 'يكتمل بحفظ بياناتك الأساسية.',
  'P-CV': 'يكتمل برفع سيرتك من ملفك الشخصي.',
  'A-DONE': 'يكتمل بإرسال إجابات القياس.',
  'AP-OK': 'بانتظار اعتماد المستشار.',
  'E-POST': 'يُفتح القياس البعدي حين تصل إلى مرحلة التقييم.',
  'R-ISSUE': 'يكتمل حين يُعتمد تقييمك الختامي، فتظهر نتيجته أعلى رحلتك: القرار والدرجة، ودرجة كل مكوّن بوزنه حين تتاح.',
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
          {/* سؤال النص مربوط بحقله (label)، وسؤال النجوم اسم مجموعتها (aria-label) */}
          {q.type === 'rating'
            ? <span>{q.label}{!q.required && <small className="muted"> (اختياري)</small>}</span>
            : <label htmlFor={`sv-${item.id}-${q.key}`}>{q.label}{!q.required && <small className="muted"> (اختياري)</small>}</label>}
          {q.type === 'rating'
            ? <span className="rx-stars" role="radiogroup" aria-label={q.label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={v[q.key] === n} aria-label={`${n} من 5`} className={n <= (v[q.key] || 0) ? 'on' : ''} onClick={() => setV({ ...v, [q.key]: n })}>★</button>)}</span>
            : <textarea id={`sv-${item.id}-${q.key}`} className="input" rows={2} maxLength={2000} value={v[q.key] || ''} onChange={(e) => setV({ ...v, [q.key]: e.target.value })} />}
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

// تأكيد الاستبدال قبل اختيار الملف: نافذة حوارية تقول ما يُحذف وما يحدث بعده، والتركيز يدور داخلها ويعود إلى الزر عند التراجع
const UPLOAD_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg';
function ReplaceConfirm({ item, file, onPick, onClose }) {
  const panel = useRef(null);
  const input = useRef(null);
  useEffect(() => {
    panel.current?.querySelector('button')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const all = [...panel.current.querySelectorAll('button:not([disabled])')];
    const at = all.indexOf(document.activeElement);
    if (e.shiftKey && at <= 0) { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (!e.shiftKey && at === all.length - 1) { e.preventDefault(); all[0]?.focus(); }
  };
  const after = item.needs_review ? 'ويُرسل الملف الجديد لمستشارك للمراجعة.' : 'ويحل الملف الجديد مكانه.';
  return (
    <div className="acct-sheet-backdrop" onKeyDown={keys} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="acct-sheet up-confirm" role="dialog" aria-modal="true" aria-labelledby={`upc-t-${item.id}`} aria-describedby={`upc-d-${item.id}`} data-testid="up-confirm">
        <span className="acct-sheet-grip" aria-hidden="true" />
        <h2 id={`upc-t-${item.id}`}>استبدال الملف المرفوع</h2>
        <p id={`upc-d-${item.id}`} className="acct-sheet-now">يُحذف ملفك الحالي <b dir="auto">«{file?.name || file?.kind || 'الملف المرفوع'}»</b> من «{item.title_ar}» ولا يُسترجع، {after}</p>
        <div className="acct-sheet-options">
          <button type="button" onClick={() => input.current?.click()}>اختر الملف البديل</button>
        </div>
        <input ref={input} type="file" className="sr" tabIndex={-1} aria-hidden="true" accept={UPLOAD_ACCEPT} onChange={onPick} />
        <button type="button" className="acct-sheet-cancel" onClick={onClose}>تراجع، أبقِ ملفي الحالي</button>
      </div>
    </div>
  );
}

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
  const [confirm, setConfirm] = useState(false);
  const replaceBtn = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setConfirm(false);
    setBusy(true);
    const up = await uploadFile(file, 'evidence');
    setBusy(false);
    if (!up.success) return setToast(up.message);
    // الاسم كما سمّاه صاحبه يُحفظ مع صف البند (upload-file.js)، والمسار في المخزن بلا اسم
    act({ evidence_path: up.path, evidence_name: file.name });
  };

  const verified = !!item.activity;
  const sys = item.auto || item.kind === 'meeting' || item.kind === 'survey' || verified;
  const canAct = open && !sys && (item.status === 'pending' || item.status === 'returned' || (item.status === 'done' && !item.needs_review));
  // الملف المرفوع: اسمه ووقته، واستبداله ما دام البند لم يُعتمد (canReplaceFile، والخادم يحكم بالقاعدة نفسها)
  const file = item.kind === 'upload' ? item.file || null : null;
  const canReplace = !!file && open && !sys && canReplaceFile(item);
  const mark = item.status === 'done' ? '✓' : item.status === 'submitted' ? '…' : '';

  return (
    <li ref={li} id={`item-${item.id}`} tabIndex={-1} className={`item ${item.status}`}>
      <span className="box" aria-hidden="true">{mark}</span>
      <div className="grow">
        <div className="row between">
          <span className="t">{item.title_ar}{!item.required && <span className="muted small" data-testid="item-optional"> (اختياري، لا يُحسب في تقدمك)</span>}</span>
          {item.status !== 'pending' && (
            <span className={`chip ${item.status === 'done' ? 'ok' : item.status === 'returned' ? 'bad' : 'warn'}`}>{REQ_STATUS[item.status]}</span>
          )}
        </div>
        {item.help_ar && !(item.code === 'T-360' && sys && !verified && item.status !== 'done') && <p className="h">{item.help_ar}</p>}
        {item.status === 'returned' && item.note && <p className="h" style={{ color: 'var(--bad)' }}>ملاحظة: {item.note}</p>}
        {verified && <Activity item={item} open={open} onUpdate={onUpdate} onHandbook={onHandbook} onCapstone={onCapstone} onLabItem={onLabItem} setToast={setToast} />}
        {/* «يُفتح القياس البعدي حين تصل…» للمرحلة المقفلة وحدها: في المفتوحة زر «ابدأ القياس البعدي» تحته يكفي */}
        {sys && !verified && item.kind !== 'survey' && item.status !== 'done' && !(item.code === 'E-POST' && open) && (
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
        {file && (
          <div className="up-file" data-testid="up-file">
            <span className="up-ico" aria-hidden="true"><Ico name="doc" size="18" /></span>
            <span className="grow">
              <span className="sr">ملفك المرفوع: </span>
              <b className="up-name" dir="auto">{file.name || file.kind || 'ملف مرفوع'}</b>
              {file.at && <small className="muted">رُفع {fmtDate(String(file.at).slice(0, 10))}، {fmtTime(file.at)}</small>}
            </span>
            {canReplace && <button ref={replaceBtn} type="button" className="btn sm ghost" disabled={busy} onClick={() => setConfirm(true)}>{busy ? 'جارٍ الرفع…' : 'استبدل الملف'}</button>}
          </div>
        )}
        {confirm && <ReplaceConfirm item={item} file={file} onPick={pick} onClose={() => { setConfirm(false); replaceBtn.current?.focus(); }} />}
        {canAct && item.status !== 'done' && !file && (
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

// level: مستوى عنوان المرحلة في المخطط، h5 داخل كتلة «تسير معًا» فتكون مراحلها تحت عنوانها لا أخواته (R3b)
// journey: الرحلة كلها، لسطر «لماذا هي متوقفة» (holdLine يسمّي ما تنتظره). narrow وstore: طيّ «عن هذه المرحلة» على الهاتف وتذكّره
function Stage({ stage, n, expanded, onToggle, level = 4, journey = [], narrow = false, store = null, demo = false, ...rest }) {
  const H = level === 5 ? 'h5' : 'h4';
  const locked = stage.status === 'locked';
  // تواريخ المرحلة من نافذتها في خطة الدفعة، وسبب توقفها من حالتها الفعلية (journey-copy.js). بلا نافذة لا يُعرض تاريخ
  const dates = stageDates(stage);
  const hold = holdLine(stage, journey);
  const [about, setAbout] = useState(() => store?.get(`about:${stage.key}`) ?? false);
  const mode = MODES[stage.mode];
  // المتخطاة في الحساب التجريبي بوسمها الصريح (لا «مكتملة» ولا «أُعفيت»): تخطٍّ للعرض بلا دليل إنجاز
  const chip = stage.skipped ? (demo ? <span className="chip demo-skip" data-testid="stage-skipped-demo">{DEMO_SKIPPED_AR}</span> : <span className="chip ok">أُعفيت منها</span>)
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
            <H>{stage.title_ar}</H>
            <div className="meta">
              {dates && <span className="tag date" data-testid="stage-dates">{dates.range}</span>}
              {mode && <span className="tag"><i aria-hidden="true">{mode.icon}</i>{mode.title}</span>}
              {stage.duration_label && <span className="tag">{stage.duration_label}</span>}
              {stage.work_mode && <span className="tag">{WORK_AR[stage.work_mode]}</span>}
              {stage.total > 0 && <span className="tag">{stageCount(stage)}</span>}
            </div>
            {dates?.end && <small className="stage-end" data-tone={dates.tone || undefined} data-testid="stage-end">{dates.end}</small>}
            {hold && <small className="stage-hold" data-kind={hold.kind} data-testid="stage-hold">{hold.text}</small>}
          </div>
          {chip}
          <span className="chev" aria-hidden="true">⌄</span>
        </button>
        {expanded && (
          <div className="stage-body">
            {(() => {
              const intro = (
                <>
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
                </>
              );
              const has = stage.builds_on_ar || stage.description_ar || steps.length > 0 || stage.outcome_ar;
              if (!has) return null;
              // على الهاتف، ومع قائمة تحقق: الوصف يُطوى في سطر فتكون القائمة أول ما يُرى. لا يُحذف شيء، ويُتذكر الاختيار
              if (!narrow || !stage.items.length) return intro;
              return (
                <details className="stage-about" open={about} onToggle={(e) => { const o = e.currentTarget.open; if (o !== about) { setAbout(o); store?.set(`about:${stage.key}`, o); } }}>
                  <summary>وصف المرحلة وما تخرج به</summary>
                  {intro}
                </details>
              );
            })()}
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
// وبلا جلسة مؤرخة قادمة: أول جلسة لم يُحدد موعدها بعد (J1)، فيظهر «لك جلسة سيُعلن موعدها» لا تاريخ 1970
export function nextSession(journey, now = Date.now()) {
  // وطريقة توثيق بندها مع كل جلسة، فيظهر «سجّل حضوري» للجلسة الحضورية الجارية التي تُوثَّق بالرمز (CheckinHelp)
  const all = (journey || []).flatMap((st) => (st.items || []).filter((i) => i.activity?.type === 'workshop').flatMap((i) => (i.activity.sessions || []).map((x) => ({ ...x, verify: i.activity.verify }))));
  const dated = all.filter((x) => x.starts_at && x.ends_at && new Date(x.ends_at).getTime() > now).sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
  return dated[0] || all.find((x) => (!x.starts_at || !x.ends_at) && !x.attended) || null;
}
const two = (n) => String(n).padStart(2, '0');
const icsStamp = (iso) => { const d = new Date(iso); return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}00Z`; };
// ملف تقويم يُنزَّل من الجهاز: الموعد نفسه بلا طلب للخادم
export function sessionIcs(x) {
  if (!x?.starts_at || !x?.ends_at) return '';   // غير المؤرخة لا تقويم لها
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Milestone Impact//Leaders//AR', 'BEGIN:VEVENT', `UID:${x.id}@sunkvalue.com`, `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(x.starts_at)}`, `DTEND:${icsStamp(x.ends_at)}`, `SUMMARY:${esc(x.title)}`, ...(x.location ? [`LOCATION:${esc(x.location)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(x.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
export function NextSession({ session, onHall, onCheckedIn }) {
  const undated = !session.starts_at || !session.ends_at;
  // العنوان «لك جلسة سيُعلن موعدها» يقول ذلك، فلا يُكرر في السطر
  // الصيغة نفسها التي في قائمة الجلسات داخل المرحلة (journey-copy.js)
  const when = undated ? '' : fmtWhen(session.starts_at);
  const download = () => {
    const url = URL.createObjectURL(new Blob([sessionIcs(session)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'session.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className={`next-card j-session${session.open ? ' live' : ''}`} data-tour="next-session">
      <span className="k">{session.open ? 'جلستك الآن' : undated ? 'لك جلسة سيُعلن موعدها' : 'جلستك القادمة'}</span>
      <b>{session.title}</b>
      <span className="small muted">{[when, session.mode === 'online' ? 'عن بعد' : session.location, session.trainer ? `مع ${session.trainer}` : '', !session.open && linkPending(session) ? SESSION_LINK_LATER_AR : ''].filter(Boolean).join(' · ')}</span>
      {session.optional && <span className="chip opt" data-testid="session-optional">{OPTIONAL_PARTICIPANT_AR}</span>}
      {session.attended && <span className="chip ok">سُجّل حضورك</span>}
      <CheckinHelp session={session} onDone={onCheckedIn} />
      <div className="row">
        {session.open && onHall && <button className="btn sm" onClick={onHall}>ادخل القاعة</button>}
        {!undated && <button className="btn ghost sm" onClick={download}>أضفها إلى تقويمك</button>}
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

// معاينة الشهادة في الحساب التجريبي (تصور الحساب التجريبي، المرحلة 1): القالب الحقيقي بعلامة «نموذج للعرض»، بلا رقم
// تسلسلي ولا رابط تحقق. الحساب التجريبي لا تصدر له شهادة أبدًا، فهذه البطاقة طريقه الوحيد لرؤيتها
function DemoCertificateCard() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const open = async () => {
    const win = window.open('', '_blank');   // متزامنة مع النقرة حتى لا يحجبها المتصفح
    if (!win) { setMsg(POPUP_BLOCKED); return; }
    setBusy(true); setMsg('');
    const r = await call('demo.certificate-preview');
    setBusy(false);
    if (!r.success) { win.close(); setMsg(r.message || 'تعذّر عرض النموذج'); return; }
    const { writeCertificate } = await import('../../../src/lib/brand/certificate.js');
    await writeCertificate(win, r.certificate);
  };
  return (
    <section className="card cert-card demo-cert" aria-label="نموذج شهادة الإتمام" data-testid="demo-cert">
      <span className="cert-mark" aria-hidden="true" />
      <div className="grow stack">
        <p className="eyebrow">شهادة الإتمام · {DEMO_SAMPLE_AR}</p>
        <h2>هكذا تبدو شهادة من يتم البرنامج بنجاح</h2>
        <p className="small muted">معاينة بالقالب الحقيقي وعليها علامة «{DEMO_SAMPLE_AR}»: بلا رقم تسلسلي ولا رابط تحقق. الحساب التجريبي لا تصدر له شهادة.</p>
        {msg && <div className="alert err small" role="alert">{msg}</div>}
      </div>
      <div className="row"><button className="btn sm" disabled={busy} onClick={open}>{busy ? 'لحظة…' : 'اعرض نموذج الشهادة'}</button></div>
    </section>
  );
}

// دعوة المدير المباشر قبل البرنامج: تقديره الآن هو خط الأساس الذي يُقارن به
// تقديره بعد البرنامج، وهو أقوى من سؤاله لاحقًا عن "قبل" بالتذكر.
// تظهر في الرحلة، و«لاحقًا» يؤجلها أسبوعًا لا نهائيًا (تصور المرحلة 2، 2.5)، وتبقى دائمًا في «ملفي» (inSettings).
// المخزَّن وقت التأجيل؛ والقيمة القديمة «1» (الإخفاء النهائي قبل هذا) لا وقت لها فتعود البطاقة
const PRE_HIDE = 'mi_pre_manager_hidden';
export const PRE_SNOOZE_DAYS = 7;
export const preSnoozed = (v, now = Date.now()) => { const at = Number(v); return v !== '1' && Number.isFinite(at) && at > 0 && now - at < PRE_SNOOZE_DAYS * 864e5; };
const preHidden = () => { try { return preSnoozed(localStorage.getItem(PRE_HIDE)); } catch { return false; } };
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
  const who = data.no_manager === 'senior' ? 'الزميل الأعلى' : 'المدير';
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
        <div className="row between"><b>{data.no_manager === 'senior' ? 'ادعُ زميلًا أعلى يعرف عملك ليقدّر ممارستك الآن، قبل البرنامج' : 'ادعُ مديرك المباشر ليقدّر ممارستك الآن، قبل البرنامج'}</b>
          {!inSettings && <button type="button" className="link small" aria-label="لاحقًا" onClick={() => { try { localStorage.setItem(PRE_HIDE, String(Date.now())); } catch { /* خاص */ } setHidden(true); }}>لاحقًا · تجدها في «ملفي»</button>}</div>
        {pre?.status === 'awaiting'
          ? <p className="small">دعوة {pre.full_name || pre.email} بانتظار تأكيد مستشارك أو منسق جهتك ({pre.flags_ar?.join('، ') || 'بريد من غير نطاق جهتك'})، وتصله فور التأكيد. بريد جهتك يصل فورًا.</p>
          : pre
          ? <p className="small">أُرسلت الدعوة إلى {pre.full_name || pre.email}. ننتظر تقديره، وسنطلب منه التقدير نفسه بعد البرنامج.</p>
          : (
            <form className="row" style={{ gap: 8, flexWrap: 'wrap' }} onSubmit={send}>
              <p className="small" style={{ flexBasis: '100%' }}>ثماني عبارات في نحو 6 دقائق، بلا حساب. ترى المتوسط لكل إطار لا إجاباته.</p>
              <input className="input" aria-label={`اسم ${who}`} autoComplete="off" placeholder={`اسم ${who}`} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
              <EmailInput className="input ltr" type="email" required aria-label={`بريد ${who}`} placeholder={`بريد ${who}`} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <button className="btn gold sm" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل الدعوة'}</button>
              {msg && <div className="alert err" style={{ flexBasis: '100%' }}>{msg}</div>}
            </form>
          )}
        {!pre && <NoManager data={data} onChange={setData} />}
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
const isNarrow = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches;
// id وstore: اختيار المشارك (فتح أو طي) يُتذكر على جهازه (journey-folds.js). على الحاسب القسم مفتوح بلا سطر طي، فلا يُقرأ المحفوظ
function Fold({ title, meta, children, id = null, store = null }) {
  const [open, setOpen] = useState(() => (isNarrow() ? (id && store?.get(`fold:${id}`)) ?? false : true));
  const onToggle = (e) => {
    const o = e.currentTarget.open;
    if (o === open) return;
    setOpen(o);
    if (id && isNarrow()) store?.set(`fold:${id}`, o);
  };
  return (
    <details className="j-fold" data-fold={id || undefined} open={open} onToggle={onToggle}>
      <summary><b>{title}</b>{meta && <span className="small muted">{meta}</span>}</summary>
      {children}
    </details>
  );
}

const PhaseOpen = ({ children }) => children;

// «أ» و«ب» و«ج»: أسماء مراحل تسير معًا في جملة
export const togetherAr = (titles) => (titles.length < 2 ? titles[0] || '' : `${titles.slice(0, -1).join('» و«')}» و«${titles.at(-1)}`);
// تقدم المرحلة لشريطها: المطلوب وحده كعدّادها (stageCount)، وبلا مطلوب كل بنودها
const stagePct = (s) => {
  if (s.status === 'done') return 100;
  const items = s.items || [];
  // الاختياري خارج النسبة دائمًا (قاعدة «الاختياري لا يُحسب»): مرحلة بنودها اختيارية وحدها لا نسبة لها
  const req = items.filter((i) => i.required);
  return req.length ? Math.round((req.filter((i) => i.status === 'done').length / req.length) * 100) : 0;
};
const STATUS_SHORT = { done: 'مكتملة', active: 'جارية', available: 'متاحة', locked: 'مقفلة' };

// مراحل تسير معًا (R3b، التوازي 2): كتلة واحدة باسمها، وفي رأسها تقدم كل مرحلة منها، ثم بطاقاتها كما هي.
// الحالية منها تُعلَّم، والمرحلة الحالية للمشارك من currentStages نفسها التي تعدّه بها الخريطة ويذكّره بها التذكير
function Together({ stages, now, children }) {
  const id = `together-${stages[0].key}`;
  const n = stages.length;
  return (
    <section className={`together${now ? ' now' : ''}`} aria-labelledby={id} data-testid="together">
      <div className="together-head">
        <span className="together-badge">تسير معًا</span>
        <h4 id={id}>«{togetherAr(stages.map((s) => s.title_ar))}»</h4>
        <p className="small muted">{n === 2 ? 'مرحلتان تبدآن معًا وتسيران في الأسابيع نفسها، فأنجز بنودهما بالتوازي.' : `${n} مراحل تبدأ معًا وتسير في الأسابيع نفسها، فأنجز بنودها بالتوازي.`}</p>
        <ul className="together-progress">
          {stages.map((s) => {
            const pct = stagePct(s);
            return (
              <li key={s.key} className={s.status}>
                <span className="t">{s.title_ar}</span>
                <span className="bar" role="progressbar" aria-label={`تقدمك في «${s.title_ar}»`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={s.status === 'locked' ? 'مقفلة' : `${pct}٪، ${stageCount(s)}`}><i style={{ inlineSize: `${pct}%` }} /></span>
                <small>{s.status === 'locked' || !s.total ? STATUS_SHORT[s.status] || '' : stageCount(s).split(' · ')[0]}</small>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="together-cards">{children}</div>
    </section>
  );
}

// المسار المستمر (T1، تصور 2026-11-18 ب5.1): يسير معك بجانب المراحل من بدايته إلى نهايته، فلا يؤخر ما بعده ولا يُعد في
// «أنجزت X من Y» ولا في نسبة التقدم. كتلة بنمط «تسير معًا» نفسه: اسمه وامتداده وما تنتظره بنوده وتقدمه، ثم بطاقته كما هي
const trackDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', timeZone: 'UTC' });
export function trackSpanAr(stage, journey = []) {
  const t = stage.track || {};
  const due = journey.find((x) => x.key === t.due_before);
  const span = t.from && t.to ? `من ${trackDay(t.from)} إلى ${trackDay(t.to)}` : t.until === 'journey_end' || !t.until ? 'حتى نهاية رحلتك' : '';
  return {
    span: span ? `يسير معك ${span}، بجانب مراحلك، فلا يؤخر ما بعده.` : 'يسير معك بجانب مراحلك، فلا يؤخر ما بعده.',
    due: due ? `بنوده الإلزامية مطلوبة قبل «${due.title_ar}» وحدها، وما سواها لا ينتظره.` : '',
  };
}
function Alongside({ stage, journey, children }) {
  const id = `track-${stage.key}`;
  const pct = stagePct(stage);
  const t = trackSpanAr(stage, journey);
  return (
    <section className={`together track${stage.status === 'active' ? ' now' : ''}`} aria-labelledby={id} data-testid="track">
      <div className="together-head">
        <span className="together-badge track-badge">مسار مستمر</span>
        <h4 id={id}>{stage.title_ar}</h4>
        <p className="small muted">{t.span}{t.due ? ` ${t.due}` : ''}</p>
        <ul className="together-progress">
          <li className={stage.status}>
            <span className="t">{stage.status === 'locked' ? stage.lock_reason || 'يُفتح مع بداية مرجعه' : 'تقدمك فيه'}</span>
            <span className="bar" role="progressbar" aria-label={`تقدمك في «${stage.title_ar}»`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={stage.status === 'locked' ? 'مقفل' : `${pct}٪، ${stageCount(stage)}`}><i style={{ inlineSize: `${pct}%` }} /></span>
            <small>{stage.status === 'locked' || !stage.total ? STATUS_SHORT[stage.status] || '' : stageCount(stage).split(' · ')[0]}</small>
          </li>
        </ul>
      </div>
      <div className="together-cards">{children}</div>
    </section>
  );
}

// «خدمات متاحة لك» (T2، ب5.2): ما يطلبه من يريد حتى نهاية الرحلة (الاستشارة مثلًا)، منفصلًا عن تسلسل المراحل وعدها.
// كل خدمة بطاقتها نفسها، وفيها الحجز وحده: يُخفى زره عند بلوغ حد الجلسات
// الخدمة بشرط «أي من» (الاستشارة خدمة، المرحلة 2): قبل الفتح سطر الشرط وفعل يقرّب منه، وبعده «متاحة لك · بقي لك N»
export const anyService = (stage) => stage?.rules?.unlock === 'any';
export function serviceLineAr(stage) {
  if (stage.status === 'locked') return stage.lock_reason || 'تُتاح لاحقًا';
  if (anyService(stage)) {
    const a = (stage.items || []).map((it) => it.activity).find((x) => x && x.type === 'coaching' && x.max != null);
    if (!a) return 'متاحة لك';
    if (a.at_max) return sessionsBookedAr(a.max, a.max);
    return `متاحة لك · بقي لك ${sessionsAr(Math.max(0, a.max - (a.used || 0)))}`;
  }
  const act = (stage.items || []).map((it) => it.activity).find((a) => a && a.type === 'coaching' && a.max != null);
  if (act) return act.at_max ? sessionsBookedAr(act.max, act.max) : `متاحة لك حتى نهاية رحلتك، ${sessionsBookedAr(act.used, act.max)}`;
  return 'متاحة لك حتى نهاية رحلتك';
}
function Services({ list, children, onRead, onAsk }) {
  return (
    <section className="card stack svc-shelf" aria-labelledby="svc-h" data-testid="services">
      <div className="row between fold-h">
        <h2 id="svc-h" className="as-h3">خدمات متاحة لك</h2>
        <span className="small muted">لمن يريد، ولا تُحسب في تقدمك</span>
      </div>
      {list.map((s) => (
        <div key={s.key} className="svc-item" data-service={s.key}>
          <p className="small muted svc-line" data-testid="svc-line">{serviceLineAr(s)}</p>
          {anyService(s) && s.status === 'locked' && onRead && (
            <button type="button" className="btn secondary small" data-testid="svc-read" onClick={onRead}>ابدأ القراءة</button>
          )}
          {anyService(s) && s.status !== 'locked' && onAsk && !(s.items || []).some((it) => it.activity?.at_max) && (
            <button type="button" className="btn small" data-testid="svc-ask" onClick={() => onAsk(s.key)}>اطلب استشارة</button>
          )}
          {!(anyService(s) && s.status === 'locked') && <div className="timeline">{children(s)}</div>}
        </div>
      ))}
    </section>
  );
}

// رأس الرحلة (T1): المرحلة الحالية من currentStages، وإن لم يبق نشطًا إلا المسار المستمر (المتتابعة أُنجزت والتالية تنتظره)
// فهو ما يُشار إليه، فلا يبقى الرأس بلا «ماذا الآن». tracksNow للرأس وحده، فالموضع والعد بلاه كما هما
export function heroNow(journey) {
  const now = currentStages(journey).stages.filter((s) => s.status === 'active');
  const tracksNow = now.length ? [] : journey.filter((s) => s.lane === 'track' && s.status === 'active');
  return { now, tracksNow, current: now[0] || tracksNow[0] || null };
}
// شريط الأطوار: الطور منجز إن أُنجزت مراحله المتتابعة، وجارٍ إن فيها نشطة. المسار المستمر لا يُعد فيه كما لا يُعد في
// «X من Y»، فلا يبقى طوره جاريًا والمشارك في طور بعده، ولا يضيء طوران معًا بسببه
export function phaseRail(journey) {
  return PHASES.map((ph) => {
    const st = journey.filter((s) => s.lane !== 'track' && s.lane !== 'service' && (s.phase || 'qualification') === ph.key);
    return { key: ph.key, title: ph.title, state: st.length && st.every((s) => s.status === 'done') ? 'done' : st.some((s) => s.status === 'active') ? 'on' : '' };
  });
}

// مراحل قادمة مقفلة: على الحاسب تُعرض كما هي، وعلى الشاشات الضيقة سطر واحد يُفتح
function Later({ n, after, children, id = null, store = null }) {
  const [narrow] = useState(isNarrow);
  const [open, setOpen] = useState(() => (id && store?.get(`later:${id}`)) ?? false);
  if (!narrow) return children;
  return (
    <details className="j-later" open={open} onToggle={(e) => { const o = e.currentTarget.open; if (o !== open) { setOpen(o); if (id) store?.set(`later:${id}`, o); } }}>
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
      {summary.late > 0 && <div className="banner"><span className="ico"><Ico name="clock" /></span><div className="grow">{lateBannerAr(summary.late, summary.max_late)} ابدأ بالأقدم، أو اطلب استشارة إن احتجت دعمًا.</div></div>}
      <div className="ms-bar" role="progressbar" aria-label="نسبة إنجاز معالمك" aria-valuetext={`${summary.done} من ${summary.total} منجزة`} aria-valuenow={summary.pct || 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${summary.pct || 0}%` }} /></div>
      <ol className="ms-list">{list.map((m) => (
        <li key={m.id} className={m.status}>
          <div className="grow"><b>{m.title_ar}</b>{m.description_ar && <p className="small muted">{m.description_ar}</p>}</div>
          <div className="ms-when">
            {m.due && <small className="muted">{msDay(m.due)}</small>}
            <span className={`chip ${MS_CHIP[m.status]}`}>{m.status === 'late' && m.late_days > 0 ? lateByAr(m.late_days) : MS_AR[m.status]}</span>
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
      <p className="small muted">مرآة لتقدمك من الكتاب ونماذجك ومبادرتك والمختبر، ويُبنى عليه التقييم الختامي.</p>
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

// لافتة التذكير الموحد (nudge-banner.ts): آخر تذكير لم يره، بنص بريده نفسه ومرسله. هادئة لا تنبيهية:
// «إلى خطوتي» يفتح مرحلته الجارية، و«حسنًا» يكتب الاطلاع فيرى المرسل في ملفه أنه رآه
function NudgeBanner({ nudge, onGo }) {
  const [n, setN] = useState(nudge || null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setN(nudge || null); }, [nudge]);
  if (!n) return null;
  const done = async () => {
    setBusy(true);
    const r = await call('me.nudge-seen', { id: n.id });
    setBusy(false);
    if (r.success) setN(r.nudge || null);
  };
  return (
    <aside className="card nudge-banner" role="status" aria-label="تذكير برحلتك">
      <p>{n.body}</p>
      {n.by && <small className="muted">{n.by}</small>}
      <div className="row">
        {onGo && <button type="button" className="btn sm" onClick={() => { onGo(); done(); }}>إلى خطوتي</button>}
        <button type="button" className="btn sm ghost" disabled={busy} onClick={done}>حسنًا</button>
      </div>
    </aside>
  );
}

export default function Journey({ me, onUpdate, onEditProfile, onHandbook, onImpact, onCapstone, onHall, lab, onLab, onLabItem }) {
  // بعد «سجّل حضوري» من بطاقة الجلسة تُقرأ الرحلة من جديد، فيظهر «سُجّل حضورك» مكان الزر
  const refreshMe = async () => { const r = await call('me'); if (r.success) onUpdate(r); };
  const { journey, profile, participant } = me;
  // حالة الاستبيان من الطلب المجمّع عند الفتح، تُقرأ مرة في أول رسم (البند 7.5)
  const [susFirst] = useState(() => bootPreload.take('sus'));
  // المرحلة الحالية (R3b): الموضع ومعه ما يسير معه نشطًا، من currentStages التي تعدّه بها الخريطة ويذكّره بها التذكير
  const { now, tracksNow, current } = heroNow(journey);
  const nowKeys = new Set(now.map((s) => s.key));
  // على الهاتف والتابلت (عمود واحد): المراحل أولًا والحالية مفتوحة، وما سواها مطوي. ما فتحه المشارك أو طواه يُتذكر على جهازه
  const [narrow] = useState(isNarrow);
  const store = useMemo(() => foldStore(participant.id), [participant.id]);
  const [expanded, setExpanded] = useState(() => {
    const open = new Set((now.length ? now : tracksNow).map((s) => s.key));
    for (const s of journey) {
      const saved = store.get(stageFoldId(s));
      if (saved === true) open.add(s.key); else if (saved === false) open.delete(s.key);
    }
    return open;
  });
  const [toast, setToast] = useState('');
  const [passkey, setPasskey] = useState(me.prompt_passkey);
  const [welcome, setWelcome] = useState(() => !welcomeSeen.get());
  const closeWelcome = () => { welcomeSeen.set(true); setWelcome(false); };
  // الخطوة الأخيرة من معالج البداية: بعد إرسال القياس وحتى الاعتماد، مرة واحدة
  const [nextCard, setNextCard] = useState(() => !nextSeen.get());
  const closeNext = () => { nextSeen.set(true); setNextCard(false); };
  const next = nextStep(journey);
  // «اذهب إليها» يصل إلى البند نفسه لا إلى رأس مرحلته: يُمرَّر إليه ويأخذ التركيز ويُبرز لحظة. وبلا بند (التذكير) رأس المرحلة
  const goTo = (key, itemId = null) => {
    setExpanded((s) => new Set(s).add(key));
    const st = journey.find((x) => x.key === key);
    if (st) store.set(stageFoldId(st), true);
    setTimeout(() => {
      const item = itemId ? document.getElementById(`item-${itemId}`) : null;
      if (!item) return document.getElementById(`stage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.focus({ preventScroll: true });
      item.classList.add('goto');
      return setTimeout(() => item.classList.remove('goto'), 2400);
    }, 50);
  };
  const approved = !!profile?.approved;
  const reading = approved ? lastRead.get() : null;

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (key) => {
    const st = journey.find((x) => x.key === key);
    if (st) store.set(stageFoldId(st), !expanded.has(key));
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const firstName = participant.full_name.split(' ')[0];
  // المرحلة عند الطلب أو الاختيارية لا تُحسب على المشارك إن لم يحتجها
  // والمسار المستمر (T1) يسير بجانب المراحل فلا يُعد فيها
  // والخدمة (T2) لمن يريد: خارج العد والتسلسل، في «خدمات متاحة لك»
  // القاعدة في stageTally (journey-copy.js)، وعناوين الأطوار تعد بها نفسها فلا يختلف مجموعها عن الرأس
  const { done: doneCount, total: countedN } = stageTally(journey);
  const tallyAr = `أنجزت ${doneCount} من ${stagesOfAr(countedN)}`;
  // الرأس يتبع قرار التقييم الختامي: لا تهنئة فوق «لم يجتز»، ولا «أثرك موثّق» قبل أن تصدر النتيجة
  const fin = finalView({ final: me.final, approved, allDone: countedN > 0 && doneCount === countedN, hasPolicy: !!me.final_policy, firstName });
  const services = journey.filter((s) => s.lane === 'service');
  const phased = journeyPhases(journey).phases;
  // موعد المراجعة المعلن (D04) بصيغة الجملة؛ وسم المرحلة المرفوع «يوما عمل» يظهر وحده في خط الرحلة
  const reviewWait = APPROVAL_SLA_AR;
  let order = 0;
  const upcoming = approved ? nextSession(journey) : null;

  return (
    <div className="page wide">
      <Notices list={me.notices} />
      <NudgeBanner nudge={me.nudge} onGo={current ? () => goTo(current.key) : null} />
      {approved && <CommitmentCard />}
      <section className="hero" data-tour="journey-hero">
        <div className="stack">
          <p className="eyebrow">رحلتك القيادية</p>
          <h1>{fin.title || (approved ? `${firstName}، رحلتك مفتوحة` : `شكرًا ${firstName}، نتيجتك قيد المراجعة`)}</h1>
          <p className="muted">
            {now.length > 1 ? <>{now.length === 2 ? 'مرحلتاك الحاليتان تسيران معًا' : 'مراحلك الحالية تسير معًا'}: {now.map((s, i) => <React.Fragment key={s.key}>{i ? (i === now.length - 1 ? ' و' : '، ') : ''}<b style={{ color: '#fff' }}>{s.title_ar}</b></React.Fragment>)} · {tallyAr}</>
              : tracksNow.length ? <>بقي لك المسار المستمر: <b style={{ color: '#fff' }}>«{current.title_ar}»</b>{(() => { const due = journey.find((x) => x.key === current.track?.due_before); return due ? `، وبنوده مطلوبة قبل «${due.title_ar}»` : ''; })()} · {tallyAr}</>
              : current ? <>المرحلة الحالية: <b style={{ color: '#fff' }}>{current.title_ar}</b> · {tallyAr}</>
              : fin.line ? fin.line
                // الحساب التجريبي الذي تخطى مراحله لا يُقال له «أكملت»: التخطي للعرض وليس إنجازًا
                : doneCount === countedN && countedN ? (participant.is_demo && journey.some((x) => x.skipped) ? 'وصلت إلى نهاية الرحلة بتخطي مراحلها للعرض.' : 'أكملت الرحلة كاملة. أثرك الآن موثّق.')
                  : !approved ? `${tallyAr}، والخطوة التالية اعتماد مسارك`
                    : tallyAr}
          </p>
          <div className="phase-rail" aria-label="أطوار الرحلة">
            {phaseRail(journey).map((ph) => <div key={ph.key} className={ph.state}><i />{ph.title}</div>)}
          </div>
        </div>
        <Ring value={me.progress} />
      </section>
      {/* النتيجة الختامية تحت الرأس مباشرة، ومعها سطر «التالي» بحسب القرار (finalView): لا تُدفن تحت أقسام الرحلة */}
      {me.final && (
        <div className={`banner final-result ${fin.kind === 'pass' || fin.kind === 'pass_notes' ? 'gold' : ''}`} data-testid="final-result"><span className="ico"><Ico name="cap" /></span>
          <div className="grow">
            <p>نتيجة تقييمك الختامي: <b>{me.final.decision_ar}</b> ({me.final.score}٪).</p>
            {me.final.notes && <p className="small">ملاحظات خبيرك: «{me.final.notes}»</p>}
            {/* تفصيل النتيجة: كل مكوّن بوزنه ودرجتك فيه، من لقطة الحساب المعتمدة. وبلا تفصيل يُقال ذلك ولا يُترك الوعد معلقًا */}
            {(() => {
              const fd = finalDetailView(me.final);
              if (!fd) return <p className="small muted" data-testid="final-no-detail">{FINAL_NO_DETAIL_AR}{!fin.contact && <> {FINAL_ASK_DETAIL_AR} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>}</p>;
              return (
                <div className="final-detail" data-testid="final-detail">
                  <h2 id="fd-h">تفصيل درجتك: المكوّنات بأوزانها</h2>
                  <ul aria-labelledby="fd-h">
                    {fd.rows.map((r) => (
                      <li key={r.key} data-component={r.key}>
                        <span className="grow"><b>{r.label}</b><small className="muted">{r.weight}{r.note ? ` · ${r.note}` : ''}</small></span>
                        <span className="fd-score">{r.score}</span>
                        <span className="fd-bar" aria-hidden="true"><i style={{ inlineSize: `${r.value ?? 0}%` }} /></span>
                      </li>
                    ))}
                  </ul>
                  {fd.notes.map((t) => <p key={t} className="small muted">{t}</p>)}
                </div>
              );
            })()}
            {fin.next && <p className="small" data-testid="final-next"><b>التالي:</b> {fin.next}{fin.contact && <> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>}
              {fin.review && ' ولطلب مراجعة القرار: الطريقة والمهلة في «كيف يُقيَّم عملك في نهاية البرنامج» أدناه.'}</p>}
          </div></div>
      )}
      {(participant.status === 'completed' || ['pass', 'pass_notes'].includes(me.final?.decision)) && <CertificateCard participant={participant} />}
      {participant.is_demo && approved && <DemoCertificateCard />}
      <RateExpert />
      {approved && <SusCard call={call} initial={susFirst} />}
      {/* مجموعتك ومستشارك في بطاقة واحدة بسطرين (على الهاتف كانت بطاقتين بنحو 230 نقطة لكل منهما).
          مستشارك الفعلي (خبير مجموعتك أو مستشار دفعتك): يصله ما تسلّمه ويقيّمه. الاسم وحده، والتواصل عبر الإدارة */}
      {approved && (me.group || me.advisor) && (
        <div className="banner j-people"><span className="ico"><Ico name="people" /></span>
          <div className="grow">
            {me.group && <p>مجموعتك: <b>{me.group.name}</b> · {me.group.members} {me.group.members > 2 ? 'أعضاء' : 'عضو'}{me.project_mode === 'group' ? '. مبادرة مجموعتكم واحدة، ووثيقة كل عضو يكتبها بنفسه وتُقيَّم باسمه.' : ''}</p>}
            {me.advisor && <p data-testid="my-advisor">مستشارك: <b>{me.advisor.full_name}</b>. تصله النماذج التي تسلّمها ويقيّمها.</p>}
          </div>
        </div>
      )}
      {!approved && profile && (
        <div className="banner gold">
          <span className="ico"><Ico name="hourglass" /></span>
          <div className="grow">
            <b>ماذا يحدث الآن؟</b>
            <p className="small">
              نتيجتك المبدئية جاهزة، ويراجعها المستشار الآن. {reviewWait ? `تستغرق المراجعة عادةً ${reviewWait}. ` : ''}بعد اعتماد مسارك يُفتح برنامج التأهيل وكتابك، ويصلك بريد بذلك.
              {' '}للاستفسار: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
        </div>
      )}
      {nextCard && !approved && participant.status !== 'completed' && <OnboardingNextCard me={me} onClose={closeNext} />}
      {/* الانتظار بعد القياس (تصور المرحلة 2، 2.5): الفصل الأول المشترك قراءة فقط، ودعوة المدير في j-asks بزر «لاحقًا» */}
      {!approved && profile && participant.status !== 'completed' && <FirstChapter />}

      {/* على الحاسب عمودان: الرحلة في الوسط، وما تفعله الآن في عمود جانبي ثابت.
          وعلى الهاتف والتابلت عمود واحد: الخطوة التالية أولًا، ثم المسار والمراحل، ثم الكتاب والمختبر */}
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
              {upcoming && upcoming.open && <NextSession session={upcoming} onHall={onHall} onCheckedIn={refreshMe} />}
              {next && (
                <div className="next-card">
                  <span className="k">{next.item.status === 'returned' ? 'مطلوب تعديله' : 'خطوتك التالية'}</span>
                  <b>{next.item.title_ar}</b>
                  {/* بند من المسار المستمر والرأس يسمي مرحلة أخرى: يُقال إنه من المسار، فلا تتعارض الجملتان */}
                  <span className="small muted">{next.stage.lane === 'track' ? `من مسارك المستمر: ${next.stage.title_ar}` : next.stage.title_ar}</span>
                  <div className="row"><button className="btn" onClick={() => goTo(next.stage.key, next.item.id)}>اذهب إليها</button></div>
                </div>
              )}
              {upcoming && !upcoming.open && <NextSession session={upcoming} onHall={onHall} onCheckedIn={refreshMe} />}
              {reading && (
                <div className="next-card">
                  <span className="k">تابع القراءة</span>
                  <b>{reading.title}</b>
                  <span className="small muted">كتابك</span>
                  <div className="row"><button className="btn gold sm" onClick={onHandbook}>أكمل من حيث توقفت</button></div>
                </div>
              )}
            </div>
          )}
          <div className="j-tools">
            <div className="tool-card">
              <span className="k">كتابك</span>
              <b>كتاب القائد</b>
              <p className="small muted">{approved
                ? 'أبواب الأطر الثلاثة بعمق يناسب مستواك.'
                : 'يُفتح بعد اعتماد مسارك.'}</p>
              <div className="row">{approved
                ? <button className="btn gold sm" onClick={onHandbook}>افتح كتابي</button>
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
          {(() => {
          // الأقسام الثانوية (المعالم، وكيف تُقيَّم، والتقييم المستمر، والتوجيه، والمسار، والخدمات)
          const secondary = (
            <>
          {/* تحت «خطوتك التالية» لا فوقها: الفعل التالي أول ما يراه المشارك، ثم مواعيده وتقدمه */}
          {approved && me.milestones?.length > 0 && <Fold id="milestones" store={store} title="معالمك" meta={`${me.milestone_summary.done} من ${me.milestone_summary.total} منجزة${me.milestone_summary.late ? ` · ${lateShortAr(me.milestone_summary.late)}` : ''}`}><Milestones list={me.milestones} summary={me.milestone_summary} /></Fold>}
          {approved && me.final_policy && <HowEvaluated policy={me.final_policy} />}
          {approved && me.continuous?.index != null && <Fold id="continuous" store={store} title="تقدمك في التقييم المستمر" meta={`${me.continuous.index}٪`}><Continuous c={me.continuous} /></Fold>}
          {/* «التوجيه والإرشاد»: الاستشارة وأسئلة الفريق في مكان واحد، وبطاقة «ابدأ» قبل أن يبدأ ما يوجَّه إليه */}
          {approved && <Fold id="guidance" store={store} title="التوجيه والإرشاد" meta="استشارة أو سؤال"><GuidancePanel guidance={me.guidance} onHandbook={onHandbook} /></Fold>}

          {/* «مبادرتك الآن»: سطر من خط الوثيقة، وتنبيه إن تأخرت المبادرة عن التعلم */}
          {approved && <InitiativeNow progress={me.progress} onOpen={onCapstone} />}
          {profile && (
            <Fold id="track" store={store} title={profile.track?.title ? 'مسارك' : 'نتيجتك'} meta={profile.track?.title || 'حصيلة قياسك في الأطر الثلاثة'}>
              <div className="section-title fold-h">
                <h2>{profile.track?.title ? 'مسارك' : 'نتيجتك'}</h2>
                <span className="small muted">حصيلة قياسك في الأطر الثلاثة</span>
              </div>
              {profile.track?.title ? <TrackCard profile={profile} cohort={me.cohort} /> : <Competency profile={profile} />}
            </Fold>
          )}

          {services.length > 0 && (
            <Services list={services} onRead={approved ? onHandbook : null} onAsk={(k) => { if (!expanded.has(k)) toggle(k); requestAnimationFrame(() => document.querySelector(`[data-service="${k}"] .timeline`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }}>
              {(s) => (
                <Stage key={s.key} stage={s} n="+" level={4} expanded={expanded.has(s.key)} onToggle={() => toggle(s.key)} journey={journey} narrow={narrow} store={store} demo={!!participant.is_demo}
                  onUpdate={onUpdate} onEditProfile={onEditProfile} onHandbook={approved ? onHandbook : null} onImpact={onImpact} onCapstone={approved ? onCapstone : null} onLabItem={onLabItem} setToast={setToast} />
              )}
            </Services>
          )}

            </>
          );
          const stagesBlock = (
            <>
          <div className="section-title">
            <h2>مراحل الرحلة</h2>
            <span className="small muted">{me.progress}% من الرحلة</span>
        </div>
        {PHASES.map((ph, pi) => {
          // الطور وكتله من المصدر الواحد الذي يقرؤه ملف المشارك في اللوحة أيضًا (journeyPhases في stage-move.js):
          // المسار المستمر (T1) كتلة بجانب المراحل بعد مرجعه، وخارج عد الطور
          const grouped = phased.find((x) => x.key === ph.key);
          if (!grouped) return null;
          const { stages } = grouped;
          const inPhase = grouped.units.flat();
          // عد الطور بقاعدة الرأس نفسها: «عند الحاجة» لا تُحسب عليه، فمجموع الأطوار يساوي ما في الرأس
          const { done: doneHere, total: totalHere } = stageTally(stages);
          const tallyHere = totalHere ? `${doneHere} من ${totalHere}` : '';
          // على الشاشات الضيقة يبقى الطور الذي فيه عملك مفتوحًا، والبقية عناوين تُفتح: الرئيسية شاشتان لا خمس
          const here = inPhase.some((s) => s.status === 'active' || s.key === next?.stage.key || expanded.has(s.key));
          const Wrap = here ? PhaseOpen : Fold;
          return (
            <Wrap key={ph.key} id={`phase-${ph.key}`} store={store} title={`${pi + 1}. ${ph.title}`} meta={tallyHere}>
            <div className="phase">
              <div className={`phase-head ${here ? '' : 'fold-h'}`}>
                <span className="phase-no">{pi + 1}</span>
                <div className="grow"><h3>{ph.title}</h3><span className="small muted">{ph.hint}</span></div>
                {tallyHere && <span className="small muted">{tallyHere}</span>}
              </div>
              <div className="timeline">
                {(() => {
                  const card = (s, inGroup = false) => {
                    order += 1;
                    return (
                      <Stage key={s.key} stage={s} n={order} level={inGroup ? 5 : 4} expanded={expanded.has(s.key)} onToggle={() => toggle(s.key)} journey={journey} narrow={narrow} store={store} demo={!!participant.is_demo}
                        onUpdate={onUpdate} onEditProfile={onEditProfile} onHandbook={approved ? onHandbook : null} onImpact={onImpact} onCapstone={approved ? onCapstone : null} onLabItem={onLabItem} setToast={setToast} />
                    );
                  };
                  // المراحل التي تسير معًا كتلة واحدة (withGroups على قواعد رحلته نفسها)، ومرحلة وحدها كتلة بمرحلة
                  const unit = (g) => (g[0].lane === 'track'
                    ? <Alongside key={`t-${g[0].key}`} stage={g[0]} journey={journey}>{card(g[0], true)}</Alongside>
                    : g.length > 1
                      ? <Together key={`g-${g[0].key}`} stages={g} now={g.some((s) => nowKeys.has(s.key))}>{g.map((s) => card(s, true))}</Together>
                      : card(g[0]));
                  const units = [...grouped.units];
                  // الكتل المقفلة بعد مرحلتك الحالية سطر واحد يُفتح على الشاشات الضيقة: أسماؤها ومددها بضغطة لا بتمرير
                  const shut = (g) => g.every((s) => s.status === 'locked' && !expanded.has(s.key) && s.key !== next?.stage.key);
                  let cut = units.length;
                  while (here && cut > 0 && shut(units[cut - 1])) cut -= 1;
                  const laterN = units.slice(cut).reduce((n, g) => n + g.length, 0);
                  const laterUnits = cut > 0 && laterN >= 2 ? units.slice(cut) : [];
                  const shown = laterUnits.length ? units.slice(0, cut) : units;
                  const lastShown = shown[shown.length - 1];
                  return (
                    <>
                      {shown.map(unit)}
                      {laterUnits.length > 0 && <Later id={ph.key} store={store} n={laterN} after={lastShown[lastShown.length - 1].title_ar}>{laterUnits.map(unit)}</Later>}
                    </>
                  );
                })()}
              </div>
            </div>
            </Wrap>
          );
        })}
          {/* مراحل أُوقفت لدفعته بعد أن عمل فيها: سطر يسمّيها، فلا تختفي بلا تفسير */}
          {me.stages_off?.length > 0 && (
            <ul className="stage-off" data-testid="stages-off">
              {me.stages_off.map((x) => <li key={x.key}><Ico name="clock" size="16" /> <span>{stageOffAr(x)}</span></li>)}
            </ul>
          )}
            </>
          );
          // على عمود واحد المراحل أولًا: المرحلة الحالية تحت «خطوتك التالية» مباشرة، والأقسام الثانوية بعدها مطوية.
          // على الحاسب الترتيب كما كان. ترتيب العرض هو ترتيب المستند، فقارئ الشاشة ولوحة المفاتيح يتبعانه
          return narrow ? <>{stagesBlock}{secondary}</> : <>{secondary}{stagesBlock}</>;
          })()}

        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
