// ════════════════════════════════════════════════════════════════
// حالات الشاشة المشتركة: هيكل التحميل، والفراغ، والخطأ مع إعادة المحاولة
// ════════════════════════════════════════════════════════════════
import React from 'react';

export function Skel({ h = 16, w = '100%', r = 8, style }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

// هيكل الرحلة: البطل ثم بطاقتان ثم مراحل
export function JourneySkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="skel-hero"><Skel h={14} w="30%" /><Skel h={28} w="60%" /><Skel h={14} w="45%" /></div>
      {[0, 1, 2].map((i) => <div key={i} className="card"><Skel h={18} w="40%" /><Skel h={12} style={{ marginTop: 10 }} /><Skel h={12} w="80%" style={{ marginTop: 6 }} /></div>)}
    </div>
  );
}

export function BookSkeleton() {
  return (
    <div className="page book" aria-busy="true" aria-label="جارٍ تحميل الكتاب">
      <div className="skel-hero"><Skel h={14} w="20%" /><Skel h={30} w="55%" /><Skel h={14} w="70%" /></div>
      <div className="book-grid">
        <div className="card">{[0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} h={14} style={{ marginTop: i ? 12 : 0 }} />)}</div>
        <div className="card"><Skel h={420} /></div>
      </div>
    </div>
  );
}

export function Empty({ icon = '📭', title, hint, action }) {
  return (
    <div className="empty-state">
      <span className="ico" aria-hidden="true">{icon}</span>
      <b>{title}</b>
      {hint && <p className="small muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="alert err row between" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn sm ghost" onClick={onRetry}>حاول مرة أخرى</button>}
    </div>
  );
}
