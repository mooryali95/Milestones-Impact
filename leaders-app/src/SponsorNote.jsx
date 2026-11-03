// ════════════════════════════════════════════════════════════════
// «برعاية جهتك»: يعرف المشارك المرعي قيمة ما يحصل عليه ومن يقدّمه
// ════════════════════════════════════════════════════════════════
// المصدر me.access.sponsor (payments.access في الخادم). الأسعار مشطوبة بجانب «مغطاة».
import React from 'react';

const money = (c, cur = 'USD') => `${cur === 'USD' ? '$' : ''}${((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export default function SponsorNote({ access, compact = false }) {
  const s = access?.sponsor;
  if (!s) return null;
  const p = access.prices || {};
  return (
    <div className={`sponsor-note${compact ? ' compact' : ''}`} role="note">
      <span className="sponsor-mark" aria-hidden="true" />
      <div>
        <small>برعاية</small>
        <b>{s.name}</b>
        {!compact && (s.value_cents
          ? <p>قيمة رحلتك <s className="sponsor-fee" dir="ltr">{money(s.value_cents, p.currency)}</s> مغطاة بالكامل من جهتك.</p>
          : <p>رحلتك مغطاة بالكامل من جهتك: القياس المبدئي وإكمال البرنامج.</p>)}
      </div>
    </div>
  );
}
