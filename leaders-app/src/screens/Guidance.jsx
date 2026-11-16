// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: الاستشارة وأسئلة الفريق في مكان واحد (تصور 2026-11-16 v2، المرحلة G1)
// ════════════════════════════════════════════════════════════════
// اللوحة في الرحلة، وزرها في الكتاب والمبادرة يفتحها في لوحة جانبية بسياق مكانه.
// متى يُتاح التوجيه من guidance.js وحده (me.guidance من الخادم). قبل البداية تظهر بطاقة «ابدأ بالقراءة»،
// والاستشارة مع خبير وأسئلة الفريق متاحة دائمًا.
// G2: «اسأل المساعد» (GuideChat) يظهر حين يكون المساعد مفتوحًا (me.guidance.ai) وبوابة الخادم مفتوحة لهذا المشارك
// (guide.state). «لم تقنعني، أريد التأكد» يملأ طلب الاستشارة بالسؤال ويفتحه، والمشارك يرسله بنفسه: لا يصل شيء من
// محادثته لأحد دون فعله. والمحادثة له وحده، ويحذفها متى شاء.
import React, { useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import ChooseExpert from './ChooseExpert.jsx';
import PeerRequests from './PeerRequests.jsx';
import { GUIDANCE_TEXT } from '../../../supabase/functions/leaders-api/guidance.js';

const VERDICT_AR = { refused: 'خارج نطاق المساعد', unsure: 'لم يتأكد المساعد' };

export function GuideChat({ context = 'program', chapterId = null, onConfirm }) {
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => call('guide.state').then(setD);
  useEffect(() => { load(); }, []);
  if (!d?.success || !d.gate?.ok) return null;
  const msgs = d.messages || [];
  const ask = async (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true); setErr('');
    const r = await call('guide.ask', { text: q, context, chapter_id: chapterId });
    setBusy(false);
    if (!r.success) { setErr(r.message); return; }
    setText('');
    setD((x) => ({ ...x, left: r.left, messages: [...x.messages, { id: `q${Date.now()}`, role: 'user', body: q }, { id: `a${Date.now()}`, role: 'assistant', body: r.reply.text, verdict: r.reply.verdict, sources: r.reply.sources, question: q }] }));
  };
  const clear = async () => {
    if (!window.confirm('تُحذف محادثتك مع المساعد كلها نهائيًا. متابعة؟')) return;
    const r = await call('guide.clear');
    if (r.success) load(); else setErr(r.message);
  };
  // السؤال الذي سبق الرد: لزر «أريد التأكد»
  const questionOf = (i) => msgs[i].question || [...msgs.slice(0, i)].reverse().find((m) => m.role === 'user')?.body || '';
  return (
    <section className="gd-chat stack" aria-labelledby="gd-chat-h">
      <div className="row between">
        <h3 id="gd-chat-h">اسأل المساعد <small className="muted">مساعد ذكي</small></h3>
        <span className="small muted" data-guide-left>بقي لك {d.left.day} اليوم و{d.left.month} هذا الشهر</span>
      </div>
      <p className="small muted">يجيب من كتابك ويخطئ أحيانًا. إن لم تقنعك إجابته فاضغط «أريد التأكد» لتطلب استشارة خبير. محادثتك لك وحدك، وتُحذف بعد {d.retention_days} يومًا.</p>
      {msgs.length > 0 && (
        <ol className="gd-log" aria-label="محادثتك مع المساعد" aria-live="polite">
          {msgs.map((m, i) => (
            <li key={m.id} className={`gd-msg ${m.role}`} data-verdict={m.verdict || undefined}>
              {m.role === 'assistant' && VERDICT_AR[m.verdict] && <span className="chip warn">{VERDICT_AR[m.verdict]}</span>}
              <p>{m.body}</p>
              {m.role === 'assistant' && m.sources?.length > 0 && <small className="muted">المصدر: {m.sources.map((t) => `«${t}»`).join('، ')}</small>}
              {m.role === 'assistant' && m.verdict !== 'refused' && (
                <button type="button" className="link small" onClick={() => onConfirm?.(questionOf(i))}>لم تقنعني، أريد التأكد</button>
              )}
            </li>
          ))}
        </ol>
      )}
      <form className="stack" onSubmit={ask}>
        <label className="field"><span>سؤالك</span>
          <textarea className="input" rows={3} maxLength={1200} value={text} onChange={(e) => setText(e.target.value)} placeholder="مثلًا: كيف أطبق فكرة هذا الباب على مشروعي؟" /></label>
        {err && <div className="alert err" role="alert">{err}</div>}
        <div className="row between">
          <button className="btn gold sm" disabled={busy || !text.trim() || d.left.day === 0 || d.left.month === 0}>{busy ? 'يفكر…' : 'اسأل'}</button>
          {msgs.length > 0 && <button type="button" className="link small" onClick={clear}>احذف محادثتي</button>}
        </div>
      </form>
    </section>
  );
}

export function GuidancePanel({ guidance, context = 'program', chapterId = null, consultTitle = 'اطلب استشارة', note = '', dimension = '', onHandbook = null, peers = true, headingId = 'gd-h' }) {
  // «أريد التأكد»: يفتح طلب الاستشارة مملوءًا بالسؤال، والإرسال بيد المشارك
  const [confirm, setConfirm] = useState(null);
  const consultRef = useRef(null);
  const onConfirm = (q) => {
    setConfirm({ note: `سألت المساعد الذكي: «${q}» وأريد التأكد من خبير.`, at: Date.now() });
    setTimeout(() => consultRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 50);
  };
  return (
    <section className="card stack gd" aria-labelledby={headingId} data-guidance={guidance ? (guidance.ready ? 'ready' : 'start') : 'unknown'}>
      <div className="gd-head">
        <h2 id={headingId} className="as-h3">{GUIDANCE_TEXT.title}</h2>
        <p className="small muted">{GUIDANCE_TEXT.lead}</p>
      </div>
      {guidance && !guidance.ready && (
        <div className="banner mist gd-start" role="status">
          <div className="grow">
            <b>{GUIDANCE_TEXT.start}</b>
            <p className="small muted">{GUIDANCE_TEXT.start_hint}</p>
          </div>
          {onHandbook && <button type="button" className="btn gold sm" onClick={onHandbook}>افتح كتابي</button>}
        </div>
      )}
      {guidance?.ai && guidance.ready && <GuideChat context={context} chapterId={chapterId} onConfirm={onConfirm} />}
      <div ref={consultRef}>
        <ChooseExpert key={confirm?.at || 'cx'} context={context} title={consultTitle} note={confirm?.note || note} dimension={dimension} open={!!confirm} />
      </div>
      {peers && <PeerRequests compact />}
    </section>
  );
}

// زر في الكتاب والمبادرة: لوحة جانبية بعنصر <dialog> الأصلي (حبس التركيز وEsc وإعادة التركيز من المتصفح نفسه)
export function GuidanceButton({ className = 'link small book-act', ...panel }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
    const onClose = () => setOpen(false);
    d.addEventListener('close', onClose);
    return () => d.removeEventListener('close', onClose);
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">{GUIDANCE_TEXT.title}</button>
      <dialog ref={ref} className="gd-drawer" aria-label={GUIDANCE_TEXT.title} onClick={(e) => { if (e.target === ref.current) setOpen(false); }}>
        {open && (
          <div className="gd-drawer-body">
            <button type="button" className="btn ghost sm gd-close" onClick={() => setOpen(false)}>إغلاق ✕</button>
            <GuidancePanel {...panel} headingId="gd-drawer-h" />
          </div>
        )}
      </dialog>
    </>
  );
}
