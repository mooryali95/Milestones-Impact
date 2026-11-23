// ════════════════════════════════════════════════════════════════
// الموافقة على الخصوصية والشروط (D18): أول مرة، وتجديدها عند كل نسخة جوهرية بما تغيّر منذ موافقتك
// ════════════════════════════════════════════════════════════════
// المسجّل الجديد يوافق بإكمال التسجيل بعد الإشعار؛ هذه الشاشة لمن لم يوافق قط (first)، أو وافق قبل آخر
// نسخة جوهرية (renew) فيرى سطرًا واحدًا وزر الموافقة، ويستطيع التأجيل: رحلته لا تُحجب، وما يعتمد على الأغراض
// الجديدة وحدها (CONSENT_GATED) ينتظر التجديد. لا تُعرض تفاصيل التغيير ولا يُرسل بها بريد، والنسخة غير الجوهرية
// لا تُعلَن للمشارك (قرار المالك 2026-11-16): التفاصيل في سجل التغييرات وحده.
import React, { useState } from 'react';
import { call } from './api.js';
import { LEGAL_PATH } from '../../supabase/functions/leaders-api/labels.js';

// رابط واحد هادئ داخل جملة الموافقة يكفي لموافقة مستنيرة (PDPL)؛ بقية الوثائق في تذييل كل صفحة لمن يبحث عنها
// (قرار المالك 2026-11-23: الشكل المختصر بثلاث نقاط)
const PolicyLink = () => <a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">الشروط وسياسة الخصوصية</a>;

export default function Consent({ consent, onAccepted, onLater }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const renew = consent?.needed === 'renew';
  const accept = async () => {
    setBusy(true); setErr('');
    const r = await call('consent.accept');
    setBusy(false);
    if (r.success) onAccepted(r); else setErr(r.message);
  };
  return (
    <div className="page narrow">
      <div className="card stack consent">
        {renew && <p className="eyebrow">قبل أن نتابع</p>}
        {renew ? (
          <>
            {/* إشعار التحديث بسطر واحد (قرار المالك 2026-11-16): لا قائمة تغييرات ولا أرقام نسخ هنا */}
            <h1>حدّثنا سياسة الخصوصية والشروط</h1>
            <p className="muted small">بالمتابعة توافق على <PolicyLink />. وافق لنتابع.</p>
          </>
        ) : (
          <>
            <h1>قبل أن نتابع</h1>
            <ul className="pay-points">
              <li>نستخدم بياناتك لتشغيل رحلتك وإصدار شهادتك.</li>
              <li>جهتك الراعية لا ترى مستوياتك إلا بإذنك.</li>
              <li>بياناتك محمية، وتستطيع تعديلها أو حذفها متى شئت.</li>
            </ul>
            <p className="muted small">بالمتابعة توافق على <PolicyLink />.</p>
          </>
        )}
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy} onClick={accept}>{busy ? 'لحظة…' : 'أوافق وأتابع'}</button>
        {renew && onLater && <button className="link small" disabled={busy} onClick={onLater}>لاحقًا</button>}
      </div>
    </div>
  );
}

// شريط في الرحلة لمن أجّل التجديد وحده: سطر واحد وزر «موافق» يوافق مباشرة. النسخة غير الجوهرية لا شريط لها
export function PolicyBanner({ consent, deferred, onAccepted }) {
  const [busy, setBusy] = useState(false);
  if (consent?.needed !== 'renew' || !deferred) return null;
  const accept = async () => {
    setBusy(true);
    const r = await call('consent.accept');
    setBusy(false);
    if (r.success) onAccepted(r);
  };
  return (
    <div className="policy-bar" role="status">
      <span>حدّثنا <a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية والشروط</a>.</span>
      <button className="btn sm" disabled={busy} onClick={accept}>{busy ? 'لحظة…' : 'موافق'}</button>
    </div>
  );
}
