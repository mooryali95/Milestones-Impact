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

const Links = () => (
  <p className="small"><a className="link" href={LEGAL_PATH.privacy} target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> · <a className="link" href={LEGAL_PATH.terms} target="_blank" rel="noopener noreferrer">الشروط</a> · <a className="link" href={LEGAL_PATH.refund} target="_blank" rel="noopener noreferrer">الاسترداد</a> · <a className="link" href={LEGAL_PATH.changes} target="_blank" rel="noopener noreferrer">سجل التغييرات</a></p>
);

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
        <p className="eyebrow">قبل أن نتابع</p>
        {renew ? (
          <>
            {/* إشعار التحديث بسطر واحد (قرار المالك 2026-11-16): لا قائمة تغييرات ولا أرقام نسخ هنا؛ تفاصيلها في سجل التغييرات */}
            <h1>حدّثنا سياسة الخصوصية والشروط</h1>
            <p className="muted">تجدها كاملة في الروابط أدناه. وافق لنتابع.</p>
          </>
        ) : (
          <>
            <h1>خصوصيتك وشروط البرنامج</h1>
            <p className="muted">باختصار:</p>
            <ul className="pay-points">
              <li>نجمع بيانات حسابك ورحلتك لتحديد مستواك وتشغيل رحلتك وإصدار شهادتك.</li>
              <li>جهتك الراعية ترى من رحلتك ما يسمح به البرنامج، ولا ترى مستوياتك إلا بموافقتك من «ملفي».</li>
              <li>تُعالج بياناتك لدى مزودين نتعاقد معهم لحمايتها، وبعضهم خارج المملكة، وتفاصيلهم في السياسة.</li>
              <li>تستطيع الاطلاع على بياناتك وتصحيحها وطلب حذف حسابك في أي وقت.</li>
            </ul>
          </>
        )}
        <Links />
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
