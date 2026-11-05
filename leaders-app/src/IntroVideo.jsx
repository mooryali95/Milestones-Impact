// ════════════════════════════════════════════════════════════════
// الفيديو التعريفي: مشغّل داخل الصفحة (نافذة حوار) أو مضمّن في بطاقة
// ════════════════════════════════════════════════════════════════
// المصدر الواحد لاسم الملف والمدة والعنوان: shared/video/scenes.js (ومنه يُولَّد الفيديو نفسه).
// بلا صوت، والترجمة داخل الصورة وفي مسار VTT لقارئ الشاشة؛ لا تشغيل تلقائي إلا بضغطة المشارك.
import React, { useEffect, useId, useRef, useState } from 'react';
import { VIDEO } from '../../shared/video/scenes.js';

export const INTRO = {
  mp4: `/media/${VIDEO.file}.mp4`,
  webm: `/media/${VIDEO.file}.webm`,
  vtt: `/media/${VIDEO.file}.vtt`,
  poster: `/media/${VIDEO.file}.jpg`,
  label: `${VIDEO.label} (${VIDEO.duration_ar})`,
  title: VIDEO.title,
};

// العنصر نفسه في النافذة وفي البطاقة
export function IntroPlayer({ autoPlay = false }) {
  return (
    <video className="intro-video" controls playsInline preload="metadata" poster={INTRO.poster} autoPlay={autoPlay} aria-label={INTRO.title}>
      <source src={INTRO.webm} type="video/webm" />
      <source src={INTRO.mp4} type="video/mp4" />
      <track kind="captions" srcLang="ar" label="العربية" src={INTRO.vtt} default />
      متصفحك لا يشغّل الفيديو. <a href={INTRO.mp4}>حمّل الملف</a>.
    </video>
  );
}

// زر يفتح المشغّل في نافذة حوار: Esc أو الخلفية أو زر الإغلاق يغلقها، والتركيز يعود إلى الزر
export default function IntroVideo({ className = 'link intro-link', label = INTRO.label }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const closeBtn = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; btn.current?.focus(); };
  }, [open]);
  return (
    <>
      <button type="button" ref={btn} className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">▶ </span>{label}
      </button>
      {open && (
        <div className="vdialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vdialog" role="dialog" aria-modal="true" aria-labelledby={id}>
            <div className="row between vdialog-head">
              <h2 id={id}>{INTRO.title}</h2>
              <button type="button" ref={closeBtn} className="link small" onClick={() => setOpen(false)} aria-label="إغلاق">✕ إغلاق</button>
            </div>
            <IntroPlayer autoPlay />
          </div>
        </div>
      )}
    </>
  );
}
