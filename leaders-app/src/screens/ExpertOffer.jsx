// ════════════════════════════════════════════════════════════════
// عرض خدمة للخبير: leaders.sunkvalue.com/offer?t=<الرمز>
// ════════════════════════════════════════════════════════════════
// الرابط وحده هو الإذن، ومهلته 24 ساعة. قبل القبول يرى الخبير الاسم الأول
// والخدمة والبُعد والمستوى فقط؛ وبعده يُبلَّغ المشارك باسم خبيره.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

const left = (iso) => {
  const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 36e5));
  return h >= 1 ? `${h} ساعة` : 'أقل من ساعة';
};

export default function ExpertOffer() {
  const [t] = useState(() => new URLSearchParams(location.search).get('t') || '');
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { call('offer.get', { t }).then(setD); }, [t]);

  const respond = async (accept) => {
    setBusy(true); setError('');
    const r = await call('offer.respond', { t, accept });
    setBusy(false);
    if (r.success) setDone(accept ? 'accepted' : 'declined'); else setError(r.message);
  };

  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="page narrow"><div className="card stack"><h2>العرض غير متاح</h2><p className="muted">{d.message}</p></div></div>;
  const o = d.offer;
  if (done || o.status === 'accepted') {
    return (
      <div className="page narrow"><div className="card milestone-card stack">
        <div className="badge"><span>✓</span></div>
        <h2>{done === 'declined' ? 'شكرًا لك' : 'تم القبول'}</h2>
        <p className="muted">{done === 'declined' ? 'سُجّل اعتذارك، وعُرض الطلب على خبير آخر.' : 'أُبلغ المشارك باسمك، وتصلك تفاصيله ومواعيد الجلسات.'}</p>
      </div></div>
    );
  }
  return (
    <div className="page narrow">
      <div className="card stack xo">
        <p className="eyebrow" dir="ltr">SERVICE REQUEST</p>
        <h2>أهلًا {o.expert}</h2>
        <p className="muted">رشّحك النظام لخدمة مشارك في برنامج القادة، بناءً على تخصصك وسعتك المتاحة.</p>
        <dl className="xo-facts">
          <div><dt>الخدمة</dt><dd>{o.role_ar}</dd></div>
          {o.dimension_ar && <div><dt>البُعد</dt><dd>{o.dimension_ar}</dd></div>}
          {o.level_ar && <div><dt>مستوى المشارك</dt><dd>{o.level_ar}</dd></div>}
          <div><dt>المشارك</dt><dd>{o.participant}</dd></div>
          {o.expires_at && <div><dt>المهلة</dt><dd>{left(o.expires_at)}</dd></div>}
        </dl>
        {error && <div className="alert err" role="alert">{error}</div>}
        <div className="row xo-acts">
          <button className="btn" disabled={busy} onClick={() => respond(true)}>أقبل الطلب</button>
          <button className="btn ghost" disabled={busy} onClick={() => respond(false)}>أعتذر هذه المرة</button>
        </div>
        <p className="small muted">إن لم ترد خلال المهلة يُعرض الطلب على الخبير التالي، ولا يؤثر الاعتذار على ملفك.</p>
      </div>
    </div>
  );
}
