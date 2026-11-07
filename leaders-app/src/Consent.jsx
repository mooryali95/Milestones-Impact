// ════════════════════════════════════════════════════════════════
// الموافقة على الخصوصية والشروط (D18): أول مرة، وتجديدها عند كل نسخة جوهرية بما تغيّر منذ موافقتك
// ════════════════════════════════════════════════════════════════
// المسجّل الجديد يوافق بإكمال التسجيل بعد الإشعار؛ هذه الشاشة لمن لم يوافق قط (first)، أو وافق قبل آخر
// نسخة جوهرية (renew) فيرى ملخص ما تغيّر من POLICY_CHANGES ويستطيع التأجيل: رحلته لا تُحجب، وما يعتمد على
// الأغراض الجديدة وحدها (CONSENT_GATED) ينتظر التجديد. والنسخة غير الجوهرية شريط بلا حجب.
import React, { useState } from 'react';
import { call } from './api.js';
import { LEGAL_PATH, POLICY_VERSION } from '../../supabase/functions/leaders-api/labels.js';

const SEEN_KEY = 'mi.policy.seen';
const seen = { get: () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } }, set: (v) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* التخزين غير متاح */ } } };

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
            <h1>حدّثنا سياسة الخصوصية وشروط البرنامج</h1>
            <p className="muted">وافقت على النسخة {consent.version || 'السابقة'}، والنافذة الآن {POLICY_VERSION}، وفيها تغيير جوهري نطلب عنده موافقتك مجددًا. ما تغيّر منذ موافقتك:</p>
            {consent.changes.map((c) => (
              <section key={c.version} className="stack" style={{ gap: 4 }}>
                <b className="small">النسخة {c.version}{c.material ? ' · جوهرية' : ''}</b>
                <ul className="pay-points">{c.items.map((t) => <li key={t}>{t}</li>)}</ul>
              </section>
            ))}
            <p className="small muted">رحلتك نفسها لا تتوقف إن أجّلت. ما يعتمد على الجديد وحده (دعوة المقيّمين، وطلب رعاية جهة) ينتظر موافقتك. وموافقتك على اطلاع جهتك على مستوياتك منفصلة، تبقى كما اخترتها في «ملفي».</p>
          </>
        ) : (
          <>
            <h1>خصوصيتك وشروط البرنامج</h1>
            <p className="muted">نشرنا سياسة الخصوصية وشروط برنامج القادة (النسخة {POLICY_VERSION}). باختصار:</p>
            <ul className="pay-points">
              <li>نجمع بيانات حسابك ورحلتك لتحديد مستواك وتشغيل رحلتك وإصدار شهادتك.</li>
              <li>جهتك الراعية ترى من رحلتك ما يسمح به البرنامج، ولا ترى مستوياتك إلا بموافقتك من «ملفي».</li>
              <li>بياناتك لدى Supabase على خوادم AWS في مومباي بالهند، ولكل معالج مكانه في السياسة.</li>
              <li>رموز الدخول والجلسات المنتهية تُحذف بعد 90 يومًا، وتستطيع طلب حذف حسابك في أي وقت.</li>
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

// شريط في الرحلة: تجديد مؤجل (لا يُخفى حتى يجدد)، أو نسخة غير جوهرية (يُخفى بعد الاطلاع عليها)
export function PolicyBanner({ consent, deferred, onRenew }) {
  const [hidden, setHidden] = useState(() => seen.get() === POLICY_VERSION);
  if (consent?.needed === 'renew' && deferred) {
    return (
      <div className="policy-bar" role="status">
        <span>حدّثنا سياسة الخصوصية تحديثًا جوهريًا، ودعوة المقيّمين وطلب رعاية جهة ينتظران موافقتك.</span>
        <button className="btn sm" onClick={onRenew}>راجع ووافق</button>
      </div>
    );
  }
  if (!consent?.notice || hidden) return null;
  return (
    <div className="policy-bar" role="status">
      <span>حدّثنا سياسة الخصوصية (النسخة {POLICY_VERSION}) تحديثًا غير جوهري. <a className="link" href={LEGAL_PATH.changes}>ما الذي تغيّر</a></span>
      <button className="link small" onClick={() => { seen.set(POLICY_VERSION); setHidden(true); }}>إخفاء</button>
    </div>
  );
}
