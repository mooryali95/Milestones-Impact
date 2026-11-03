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
        {!compact && <p>جهتك تغطي رسوم رحلتك كاملة:
          <span className="sponsor-fee">القياس المبدئي <s dir="ltr">{money(p.assessment, p.currency)}</s> مغطى</span>
          <span className="sponsor-fee">إكمال البرنامج <s dir="ltr">{money(p.program, p.currency)}</s> مغطى</span></p>}
      </div>
    </div>
  );
}
