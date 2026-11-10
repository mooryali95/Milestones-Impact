// ════════════════════════════════════════════════════════════════
// الأنشطة الموثقة في بطاقة المتطلب: قراءة، فيديو، جلسات جماعية، جلسات فردية
// ════════════════════════════════════════════════════════════════
// لا زر «أنجزته» هنا: كل نشاط يكتمل بدليله. القراءة بوقتها الفعلي،
// والفيديو بما شوهد منه، والجلسة الجماعية بالتوثيق الذي اختاره المشرف، والفردية بتأكيد الموجّه.
import React, { useEffect, useRef, useState } from 'react';
import Ico from '../Ico.jsx';
import { call } from '../api.js';
import { downloadIcs } from '../ics.js';

const fmtDay = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const mins = (s) => Math.max(1, Math.round((s || 0) / 60));

function Bar({ value, label }) {
  return (
    <div className="act-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

const READ_TONE = { read: 'ok', skimmed: 'warn' };
const READ_CHIP = Object.fromEntries(Object.entries(READ_STATUS).map(([k, t]) => [k, [READ_TONE[k] || '', t]]));

// الإطار يُذكر حين تتكرر عناوين الأبواب (القسم التمهيدي لكل إطار)، والتقدم الجزئي يظهر قبل اكتمال الباب
const DIM_TITLE = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.title]));
// قائمة الأبواب الطويلة تُطوى تحت عنوانها: العدد والشريط يكفيان للمتابعة، والتفصيل لمن يطلبه
const READ_FOLD = 8;
function ReadFold({ on, label, children }) {
  if (!on) return children;
  return <details className="pr-more"><summary>{label}</summary>{children}</details>;
}
function Reading({ a, onHandbook }) {
  const skimmed = a.chapters.some((c) => c.state === 'skimmed');
  // صيغة واحدة لكل الأبواب (التدقيق 2026-11-10، البند 7.13): بعض العناوين المخزنة تحمل اسم الإطار وبعضها لا، فيلتبس
  // «الباب الثاني» لأي إطار. حين تجمع القائمة أكثر من إطار يسبق كلَّ باب إطارُه، ويُحذف اسم الإطار إن كان في العنوان نفسه
  const mixed = new Set(a.chapters.map((c) => c.dimension)).size > 1;
  const label = (c) => {
    const dim = DIM_TITLE[c.dimension];
    const t = dim ? String(c.title).replace(new RegExp(`^\\s*${dim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·:،-]\\s*`), '') : c.title;
    return { dim: mixed && dim ? dim : null, t };
  };
  return (
    <div className="act">
      <div className="row between"><b className="small">قرأت {a.count} من {countAr(a.total, 'باب واحد', 'بابين', 'أبواب', 'بابًا')}</b>
        {onHandbook && !a.done && <button className="btn sm gold" onClick={onHandbook}>افتح الكتيب</button>}</div>
      <Bar value={a.total ? (a.count / a.total) * 100 : 0} label="تقدم القراءة" />
      <ReadFold on={a.chapters.length > READ_FOLD} label={`أبواب القراءة: ${countAr(a.total, 'باب واحد', 'بابان', 'أبواب', 'بابًا')}`}>
      <ul className="act-list">
        {a.chapters.map((c) => {
          const [cls, t] = READ_CHIP[c.state];
          return (
            <li key={c.id}>
              <span className="grow">{label(c).dim && <small className="muted">{label(c).dim} · </small>}{label(c).t}
                {c.state !== 'read' && c.pct > 0 && <span className="read-pct" style={{ '--p': `${Math.min(100, c.pct)}%` }} title={`قرأت ${Math.round(c.pct)}%`}><i /></span>}</span>
              {c.state !== 'read' && c.pct > 0 && <span className="chip">{Math.round(c.pct)}%</span>}
              {c.state === 'read' && a.quiz && !c.quiz && <span className="chip warn">بقي الاختبار</span>}
              <span className={`chip ${cls}`}>{t}</span>
            </li>
          );
        })}
      </ul>
      </ReadFold>
      {skimmed && <p className="h">الباب الذي تصفحته سريعًا لا يُحتسب. عد إليه واقرأه بتمعن.</p>}
    </div>
  );
}

// ── الفيديو: يُحتسب ما شوهد فعلًا ──
let ytReady = null;
function loadYouTube() {
  if (ytReady) return ytReady;
  ytReady = new Promise((res) => {
    if (window.YT?.Player) return res(window.YT);
    window.onYouTubeIframeAPIReady = () => res(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytReady;
}

// ping: من يستقبل المقاطع المشاهدة؛ الافتراضي فيديو المتطلب
function Player({ item, onProgress, ping }) {
  const a = item.activity;
  const host = useRef(null);
  const video = useRef(null);
  useEffect(() => {
    let player = null, last = null, pending = [], timer = 0, pinger = 0, alive = true;
    const now = () => (player ? player.getCurrentTime() : video.current?.currentTime) || 0;
    const playing = () => (player ? player.getPlayerState?.() === 1 : video.current && !video.current.paused && !video.current.ended);
    const duration = () => (player ? player.getDuration?.() : video.current?.duration) || 0;
    // كل ثانية: إن كان التشغيل مستمرًا والصفحة ظاهرة يُضاف المقطع منذ القراءة السابقة.
    // القفز إلى الأمام لا يضيف شيئًا، فالمقطع يبدأ من موضع القفز.
    timer = setInterval(() => {
      if (!playing() || document.hidden) { last = null; return; }
      const t = now();
      if (last != null && t > last && t - last <= 2.5) pending.push([last, t]);
      last = t;
    }, 1000);
    const flush = async () => {
      if (!pending.length) return;
      const ranges = pending; pending = [];
      const r = ping ? await ping(ranges, duration()) : await call('video.ping', { requirement_id: item.id, duration: duration(), ranges });
      if (alive && r.success) onProgress(ping ? r.item : r.video);
    };
    pinger = setInterval(flush, 10000);
    if (a.source?.type === 'youtube') {
      loadYouTube().then((YT) => {
        if (!alive || !host.current) return;
        player = new YT.Player(host.current, { videoId: a.source.id, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } });
      });
    }
    return () => { alive = false; clearInterval(timer); clearInterval(pinger); flush(); player?.destroy?.(); };
  }, [item.id, a.source?.type, a.source?.id]);
  if (!a.source) return <p className="h">لم يُضبط رابط الفيديو بعد.</p>;
  return (
    <div className="act-video">
      {a.source.type === 'youtube'
        ? <div ref={host} />
        : <video ref={video} src={a.source.url} controls controlsList="nodownload" playsInline disablePictureInPicture />}
    </div>
  );
}

function Video({ item, open, onRefresh }) {
  const [a, setA] = useState(item.activity);
  const [show, setShow] = useState(false);
  useEffect(() => setA(item.activity), [item.activity]);
  const onProgress = (v) => {
    setA((x) => ({ ...x, ...v }));
    if (v.done && !a.done) onRefresh();
  };
  return (
    <div className="act">
      <div className="row between">
        <b className="small">{a.title || 'الفيديو'} · شاهدت {a.pct}%{a.duration ? ` من ${mins(a.duration)} دقيقة` : ''}</b>
        {open && <button className="btn sm" onClick={() => { if (show) onRefresh(); setShow(!show); }}>{show ? 'أغلق' : a.pct ? 'تابع المشاهدة' : 'شاهد'}</button>}
      </div>
      <Bar value={a.pct} label="نسبة المشاهدة" />
      {!a.done && <p className="h">يكتمل حين تشاهد {a.min_pct}% منه. التقديم السريع لا يُحتسب.</p>}
      {show && <Player item={{ ...item, activity: a }} onProgress={onProgress} />}
    </div>
  );
}

import { COACH_STATUS, countAr, DIMENSIONS, READ_STATUS, SESSION_MODE_AR, SUBMISSION_STATUS } from '../../../supabase/functions/leaders-api/labels.js';
import { STATUS_TITLES } from '../../../supabase/functions/leaders-api/capstone.js';
import { SITES } from '../../../supabase/functions/_shared/sites.js';
const MODE_CHIP = SESSION_MODE_AR;
const VERIFY_HINT = {
  join: 'انضم إلى الجلسة من هنا، ويُسجل حضورك عند الانضمام.',
  manual: 'يسجل المدرب حضورك في الجلسة.',
};

function Workshop({ item, open, setToast }) {
  const a = item.activity;
  const [busy, setBusy] = useState('');
  const upcoming = a.sessions.filter((s) => !s.attended && new Date(s.ends_at) > new Date());
  const join = async (s) => {
    const win = window.open('', '_blank');   // متزامنة مع النقرة حتى لا يحجبها المتصفح
    setBusy(s.id);
    const r = await call('workshop.join', { session_id: s.id });
    setBusy('');
    if (!r.success) { win?.close(); return setToast(r.message); }
    if (win) win.location.href = r.join_url; else location.href = r.join_url;
    if (r.recorded) setToast('سُجل حضورك');
  };
  return (
    <div className="act">
      <div className="row between"><b className="small">حضرت {a.count} من {a.total}</b></div>
      <Bar value={(a.count / a.total) * 100} label="الحضور" />
      {a.sessions.length > 0 ? (
        <ul className="act-list">
          {a.sessions.map((s) => (
            <li key={s.id}>
              <span className="grow"><b>{s.title}</b><span className="small muted"> · {fmtDay(s.starts_at)}، {fmtTime(s.starts_at)}{s.location ? ` · ${s.location}` : ''}</span></span>
              <span className="chip">{MODE_CHIP[s.mode]}</span>
              {!s.attended && <AddToCalendar id={s.id} title={s.title} start={s.starts_at} end={s.ends_at} location={s.location} />}
              {open && s.can_join && !s.attended && <button className="btn sm" disabled={busy === s.id} onClick={() => join(s)}>انضم الآن</button>}
              {s.attended ? <span className="chip ok">حضرت ✓</span>
                : new Date(s.ends_at) < new Date() ? <span className="chip bad">لم يُسجل حضور</span> : <span className="chip">قادمة</span>}
            </li>
          ))}
        </ul>
      ) : <p className="h">ستظهر هنا مواعيد الجلسات وطريقتها حين تُجدول.</p>}
      {upcoming.length > 0 && VERIFY_HINT[a.verify] && <p className="h">{VERIFY_HINT[a.verify]}</p>}
    </div>
  );
}

// زر «أضف إلى تقويمي» لجلسة لم تبدأ بعد
const ROUTE = `${SITES.leaders}/`;
function AddToCalendar({ id, title, start, end, location, url }) {
  if (!start || new Date(start) < new Date()) return null;
  const ev = { uid: id, title, start, end, location, url: url || ROUTE, description: `برنامج القادة من Milestone Impact. تفاصيل الجلسة ورابط الانضمام في رحلتك: ${ROUTE}` };
  return <button type="button" className="link small" onClick={() => downloadIcs(ev, 'milestone-impact-session.ics')}>أضف إلى تقويمي</button>;
}

const COACH_TONE = { attended: 'ok', no_show: 'bad' };

function Coaching({ item, open, onRefresh, setToast }) {
  const a = item.activity;
  const [book, setBook] = useState(false);
  const [framed, setFramed] = useState(false);
  const [busy, setBusy] = useState(false);
  const instant = async () => {
    const win = window.open('', '_blank');   // متزامنة مع النقرة حتى لا يحجبها المتصفح
    setBusy(true);
    const r = await call('coaching.instant', { requirement_id: item.id });
    setBusy(false);
    if (!r.success) { win?.close(); return setToast(r.message); }
    if (win) win.location.href = r.join_url; else location.href = r.join_url;
    onRefresh();
  };
  const closeBooking = () => {
    setBook(false);
    // تأكيد الحجز يصل من منصة المواعيد خلال ثوانٍ
    onRefresh();
    setTimeout(onRefresh, 6000);
  };
  const soon = (s) => s.join_url && s.status !== 'attended' && s.starts_at
    && Date.now() > new Date(s.starts_at).getTime() - 15 * 6e4 && Date.now() < new Date(s.ends_at).getTime();
  return (
    <div className="act">
      <div className="row between"><b className="small">حضرت {a.count} من {a.total} {a.total === 1 ? 'جلسة' : 'جلسات'}</b>
        <span className="chip">{SESSION_MODE_AR[a.mode] || SESSION_MODE_AR.online}</span></div>
      {a.location && <p className="h">المكان: {a.location}</p>}
      <Bar value={(a.count / a.total) * 100} label="الجلسات" />
      {a.sessions.length > 0 && (
        <ul className="act-list">
          {a.sessions.map((s) => {
            const [cls, t] = s.awaiting && s.status === 'booked' ? ['warn', 'بانتظار تأكيد الموجّه'] : [COACH_TONE[s.status] || '', COACH_STATUS[s.status] || s.status];
            return (
              <li key={s.id}>
                <span className="grow">{s.starts_at ? <>{fmtDay(s.starts_at)}، {fmtTime(s.starts_at)}</> : 'جلسة'}</span>
                {soon(s) && <a className="btn sm" href={s.join_url} target="_blank" rel="noopener noreferrer">انضم الآن</a>}
                {s.status === 'booked' && <AddToCalendar id={s.id} title="جلسة توجيه: برنامج القادة" start={s.starts_at} end={s.ends_at} location={a.location} url={s.join_url} />}
                <span className={`chip ${cls}`}>{t}</span>
              </li>
            );
          })}
        </ul>
      )}
      {open && a.can_book && (
        <div className="actions row">
          {a.book_url && <button className="btn sm" onClick={() => (book ? closeBooking() : setBook(true))}>{book ? 'أنهيت الحجز' : 'احجز موعدًا'}</button>}
          {a.instant && <button className="btn sm gold" disabled={busy} onClick={instant}><span className="live-dot" aria-hidden="true" />الموجّه متاح الآن، اتصل فورًا</button>}
        </div>
      )}
      {open && a.can_book && !a.book_url && !a.instant && <p className="h">يحدد الموجّه موعد الجلسة ويصلك رابطها.</p>}
      {book && (
        <div className="act-book">
          <p className="small muted">لا يظهر التقويم؟ <a href={a.book_url} target="_blank" rel="noopener noreferrer">افتحه في نافذة جديدة</a>، ثم عد واضغط «أنهيت الحجز».</p>
          <div className={`act-frame${framed ? ' ready' : ''}`}>
            {!framed && <div className="act-frame-wait" role="status"><span className="spinner" aria-hidden="true" /> جارٍ تحميل التقويم…</div>}
            <iframe src={a.book_url} title="حجز موعد" loading="lazy" onLoad={() => setFramed(true)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── منهج المسار: مواد البنك التي تخص مسار المشارك ──
const CONTENT_ICON = { video: '▶', file: <Ico name="doc" />, link: <Ico name="link" /> };
function Curriculum({ item, open, onRefresh }) {
  const [a, setA] = useState(item.activity);
  const [play, setPlay] = useState(null);
  useEffect(() => setA(item.activity), [item.activity]);
  if (a.locked) return <div className="act"><p className="h">يُفتح منهج مسارك بعد اعتماد مسارك.</p></div>;
  if (!a.items.length) return <div className="act"><p className="h">لا مواد إضافية لمسارك في هذه المرحلة.</p></div>;
  const patch = (id, v) => setA((x) => {
    const items = x.items.map((i) => (i.id === id ? { ...i, ...v } : i));
    const need = items.filter((i) => i.required);
    return { ...x, items, count: need.filter((i) => i.done).length };
  });
  const opened = (i) => {
    if (i.done) return;
    call('content.open', { item_id: i.id }).then((r) => { if (r.success) { patch(i.id, { done: true, pct: 100, started: true }); onRefresh(); } });
  };
  const progress = (i) => (v) => { patch(i.id, v); if (v.done && !i.done) onRefresh(); };
  return (
    <div className="act">
      <b className="small">أنجزت {a.count} من {a.total} من مواد مسارك</b>
      <Bar value={a.total ? Math.round((a.count / a.total) * 100) : 100} label="منهج المسار" />
      <ul className="act-list">
        {a.items.map((i) => (
          <li key={i.id} className="act-item">
            <span aria-hidden="true">{i.done ? '✓' : CONTENT_ICON[i.kind]}</span>
            <span className="grow">
              {i.title}{!i.required && <small className="muted"> · اختياري</small>}
              {i.minutes ? <small className="muted"> · {i.minutes} دقيقة</small> : null}
              {i.kind === 'video' && i.started && !i.done ? <small className="muted"> · شاهدت {i.pct}%</small> : null}
              {i.description && <small className="muted block">{i.description}</small>}
            </span>
            {open && (i.kind === 'video'
              ? <button className="btn sm" onClick={() => setPlay(play === i.id ? null : i.id)}>{play === i.id ? 'أغلق' : i.done ? 'شاهد مرة أخرى' : i.started ? 'تابع' : 'شاهد'}</button>
              : <a className="btn sm" href={i.url} target="_blank" rel="noopener noreferrer" onClick={() => opened(i)}>{i.kind === 'file' ? 'افتح الملف' : 'افتح'}</a>)}
            {play === i.id && (
              <div className="act-item-player">
                <Player item={{ id: i.id, activity: { source: i.source } }} onProgress={progress(i)}
                  ping={(ranges, duration) => call('content.ping', { item_id: i.id, ranges, duration })} />
                {!i.done && <p className="h">يكتمل حين تشاهد {i.min_pct}% منه. التقديم السريع لا يُحتسب.</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// متطلب «نموذج» أو «مشروع التخرج»: العمل نفسه في وثيقة المبادرة، والرحلة تعرض حالته
const MODEL_STATUS = SUBMISSION_STATUS;
const CAP_STATUS = STATUS_TITLES;
function ModelLink({ a, onCapstone }) {
  if (a.na) return <p className="h">لا يخص مستواك أو نطاق عملك، فيُحتسب لك.</p>;
  if (a.locked) return <p className="h">يُفتح بعد اعتماد مسارك.</p>;
  if (a.sections) return (
    <div className="act-model">
      <p className="h">يكتمل حين تحفظ هذه الفصول في وثيقة مبادرتك ({a.saved} من {a.sections.length}):</p>
      <ul className="act-sections">{a.sections.map((x) => <li key={x.key}>{x.saved ? '✓' : '○'} {x.title}</li>)}</ul>
      {onCapstone && !a.done && <button className="btn sm" onClick={onCapstone}>افتح وثيقة مبادرتك</button>}
    </div>
  );
  const label = a.type === 'capstone'
    ? `${CAP_STATUS[a.status || 'draft']}${a.readiness != null ? ` · الجاهزية ${a.readiness}%` : ''}`
    : `${a.title ? `«${a.title}» · ` : ''}${MODEL_STATUS[a.status] || 'لم يبدأ'}${!a.done && a.status === 'submitted' && a.accept === 'reviewed' ? ' · يكتمل بتقييم المستشار' : ''}`;
  return (
    <div className="act-model row between">
      <span className="h">{label}</span>
      {onCapstone && !a.done && <button className="btn sm" onClick={onCapstone}>{a.type === 'capstone' ? 'افتح وثيقة مبادرتك' : 'افتح النموذج'}</button>}
    </div>
  );
}

export default function Activity({ item, open, onUpdate, onHandbook, onCapstone, setToast }) {
  const refresh = async () => { const r = await call('me'); if (r.success) onUpdate(r); };
  const a = item.activity;
  if (!a) return null;
  if (a.type === 'reading') return <Reading a={a} onHandbook={open ? onHandbook : null} />;
  if (a.type === 'video') return <Video item={item} open={open} onRefresh={refresh} />;
  if (a.type === 'workshop') return <Workshop item={item} open={open} setToast={setToast} />;
  if (a.type === 'curriculum') return <Curriculum item={item} open={open} onRefresh={refresh} />;
  if (a.type === 'coaching') return <Coaching item={item} open={open} onRefresh={refresh} setToast={setToast} />;
  if (a.type === 'model' || a.type === 'capstone') return <ModelLink a={a} onCapstone={open ? onCapstone : null} />;
  return null;
}

// ── شاشة تسجيل الحضور بعد مسح رمز QR ──
export function CheckIn({ token, onDone }) {
  const [state, setState] = useState({ busy: true });
  useEffect(() => {
    call('workshop.checkin', { t: token }).then((r) => setState(r.success ? { ok: r } : { error: r.message }));
  }, [token]);
  return (
    <div className="page narrow">
      <section className="card checkin">
        {state.busy && <div className="spinner" aria-label="جارٍ التسجيل" />}
        {state.ok && <>
          <span className="checkin-mark ok" aria-hidden="true">✓</span>
          <h1>{state.ok.already ? 'حضورك مسجل مسبقًا' : 'سُجل حضورك'}</h1>
          <p className="muted">{state.ok.session.title}{state.ok.session.location ? ` · ${state.ok.session.location}` : ''}</p>
          <p className="small muted">{fmtTime(state.ok.at)}</p>
        </>}
        {state.error && <>
          <span className="checkin-mark bad" aria-hidden="true">!</span>
          <h1>لم يُسجل الحضور</h1>
          <p className="muted">{state.error} أعد المسح، أو اطلب من المدرب تسجيل حضورك.</p>
        </>}
        {!state.busy && <button className="btn" onClick={onDone}>→ رحلتي</button>}
      </section>
    </div>
  );
}
