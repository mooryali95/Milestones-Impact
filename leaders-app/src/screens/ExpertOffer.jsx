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

  // gone: رد الخادم بأن العرض لم يعد قائمًا (انتهت مهلته أو أُغلق)، فلا تبقى الأزرار تَعِد بما لا يقع
  const [gone, setGone] = useState(false);
  const respond = async (accept) => {
    setBusy(true); setError('');
    const r = await call('offer.respond', { t, accept });
    setBusy(false);
    if (r.success) setDone(accept ? 'accepted' : 'declined'); else { setError(r.message); if (r.code === 'gone') setGone(true); }
  };

  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="page narrow"><div className="card stack"><h1 className="as-h2">العرض غير متاح</h1><p className="muted">{d.message}</p></div></div>;
  const o = d.offer;
  // كل حالة غير «معروض» منتهية بنصها (links-expert-6): المقبول من الرابط أو من اللوحة، والمكتمل، وما أُغلق؛ وبعد القبول طريق إلى اللوحة
  const end = done === 'declined' ? ['شكرًا لك', 'سُجّل اعتذارك، وعُرض الطلب على خبير آخر.', false]
    : done === 'accepted' || o.status === 'accepted' ? ['قُبل الطلب', 'أُبلغ المشارك باسمك، وتجده مع تفاصيله ومواعيد الجلسات في لوحة الخبير.', true]
      : o.status === 'completed' ? ['اكتملت هذه الخدمة', 'أُغلقت الخدمة بعد أدائها، وتجدها وتقييمها في لوحة الخبير.', true]
        : o.status !== 'offered' ? ['لم يعد هذا العرض قائمًا', 'أُغلق هذا الطلب أو عُرض على خبير آخر، ولا يلزمك شيء.', false]
          : null;
  if (end) {
    return (
      <div className="page narrow"><div className="card milestone-card stack">
        {end[2] && <div className="badge"><span aria-hidden="true">✓</span></div>}
        <h1 className="as-h2">{end[0]}</h1>
        <p className="muted">{end[1]}</p>
        {end[2] && <a className="btn" href="/x">افتح لوحة الخبير</a>}
      </div></div>
    );
  }
  const expired = !!o.expires_at && Date.parse(o.expires_at) <= Date.now();
  const closed = expired || gone;
  return (
    <div className="page narrow">
      <div className="card stack xo">
        <p className="eyebrow">طلب خدمة</p>
        <h1 className="as-h2">أهلًا {o.expert}</h1>
        <p className="muted">رشّحك النظام لخدمة مشارك في برنامج القادة، بناءً على تخصصك وسعتك المتاحة.</p>
        <dl className="xo-facts">
          <div><dt>الخدمة</dt><dd>{o.role_ar}</dd></div>
          {o.dimension_ar && <div><dt>البُعد</dt><dd>{o.dimension_ar}</dd></div>}
          {o.level_ar && <div><dt>مستوى المشارك</dt><dd>{o.level_ar}</dd></div>}
          {o.context && <div><dt>التوقيت</dt><dd>{o.context}</dd></div>}
          {o.note && <div><dt>ما يحتاجه</dt><dd>{o.note}</dd></div>}
          <div><dt>المشارك</dt><dd>{o.participant}</dd></div>
          {o.expires_at && <div><dt>المهلة</dt><dd>{expired ? 'انتهت' : left(o.expires_at)}</dd></div>}
        </dl>
        {error && <div className="alert err" role="alert">{error}</div>}
        {closed ? <p className="alert info" role="status">{expired ? 'انتهت مهلة هذا العرض، ويُعرض الطلب على الخبير التالي. لا يلزمك شيء.' : 'لم يعد هذا العرض قائمًا، ولا يلزمك شيء.'}</p> : <>
          <div className="row xo-acts">
            <button className="btn" disabled={busy} onClick={() => respond(true)}>أقبل الطلب</button>
            <button className="btn ghost" disabled={busy} onClick={() => respond(false)}>أعتذر هذه المرة</button>
          </div>
          <p className="small muted">إن لم ترد خلال المهلة يُعرض الطلب على الخبير التالي، ولا يؤثر الاعتذار على ملفك.</p>
        </>}
      </div>
    </div>
  );
}
