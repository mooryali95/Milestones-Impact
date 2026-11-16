// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: الاستشارة وأسئلة الفريق في مكان واحد (تصور 2026-11-16 v2، المرحلة G1)
// ════════════════════════════════════════════════════════════════
// اللوحة في الرحلة، وزرها في الكتاب والمبادرة يفتحها في لوحة جانبية بسياق مكانه.
// متى يُتاح التوجيه من guidance.js وحده (me.guidance من الخادم). قبل البداية تظهر بطاقة «ابدأ بالقراءة»،
// والاستشارة مع خبير وأسئلة الفريق متاحة دائمًا. المساعد الذكي يُضاف هنا في المرحلة التالية بالحكم نفسه.
import React, { useEffect, useRef, useState } from 'react';
import ChooseExpert from './ChooseExpert.jsx';
import PeerRequests from './PeerRequests.jsx';
import { GUIDANCE_TEXT } from '../../../supabase/functions/leaders-api/guidance.js';

export function GuidancePanel({ guidance, context = 'program', consultTitle = 'اطلب استشارة', note = '', dimension = '', onHandbook = null, peers = true, headingId = 'gd-h' }) {
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
      <ChooseExpert context={context} title={consultTitle} note={note} dimension={dimension} />
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
