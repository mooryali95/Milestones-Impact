// ════════════════════════════════════════════════════════════════
// موافقة من سبق تسجيله قبل نشر السياسة: مرة واحدة، بضغطة، قبل متابعة الرحلة
// ════════════════════════════════════════════════════════════════
// المسجّل الجديد يوافق بإكمال التسجيل بعد الإشعار؛ هذه الشاشة لمن consented_at لديه فارغ.
import React, { useState } from 'react';
import { call } from './api.js';
import { LEGAL_PATH, POLICY_VERSION } from '../../supabase/functions/leaders-api/labels.js';

export default function Consent({ onAccepted }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const accept = async () => {
    setBusy(true); setErr('');
    const r = await call('consent.accept');
    setBusy(false);
    if (r.success) onAccepted(r); else setErr(r.message);
  };
  return (
    <div className="page narrow">
      <div className="card stack">
        <p className="eyebrow">قبل أن نتابع</p>
        <h1>خصوصيتك وشروط البرنامج</h1>
        <p className="muted">نشرنا سياسة الخصوصية وشروط برنامج القادة (النسخة {POLICY_VERSION}). باختصار:</p>
        <ul className="pay-points">
          <li>نجمع بيانات حسابك ورحلتك لتحديد مستواك وتشغيل رحلتك وإصدار شهادتك.</li>
          <li>جهتك الراعية ترى من رحلتك ما يسمح به البرنامج، ولا ترى مستوياتك إلا بموافقتك من «ملفي».</li>
          <li>رموز الدخول والجلسات المنتهية تُحذف بعد 90 يومًا، وتستطيع طلب حذف حسابك في أي وقت.</li>
        </ul>
        <p className="small"><a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> · <a className="link" href={LEGAL_PATH.terms} target="_blank" rel="noopener noreferrer">الشروط</a> · <a className="link" href={LEGAL_PATH.refund} target="_blank" rel="noopener noreferrer">الاسترداد</a></p>
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy} onClick={accept}>{busy ? 'لحظة…' : 'أوافق وأتابع'}</button>
      </div>
    </div>
  );
}
