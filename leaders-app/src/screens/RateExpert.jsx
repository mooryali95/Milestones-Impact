// ════════════════════════════════════════════════════════════════
// قيّم خبيرك: بطاقة في الرحلة بعد كل جلسة منعقدة أو خدمة مكتملة
// ════════════════════════════════════════════════════════════════
// ثلاثة معايير من 1 إلى 5 (RATE_TO_EXPERT من الخادم). يرى الخبير المتوسط
// فقط بعد خمسة تقييمات، فلا يُعرف رأي أحد بعينه.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

function Stars({ label, value, onChange }) {
  return (
    <div className="rx-row" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <span className="rx-stars">{[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} من 5`} className={n <= (value || 0) ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}</span>
    </div>
  );
}

export default function RateExpert() {
  const [d, setD] = useState(null);
  const [v, setV] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => call('ratings.pending').then((r) => { setD(r); setV({}); setComment(''); });
  useEffect(() => { load(); }, []);
  if (!d?.success || !d.items?.length) return msg ? <div className="banner"><span className="ico">✓</span><div className="grow">{msg}</div></div> : null;
  const it = d.items[0];
  const keys = Object.keys(d.criteria);
  const ready = keys.every((k) => v[k]);
  const send = async () => {
    setBusy(true);
    const r = await call('ratings.submit', { kind: it.kind, id: it.id, scores: v, comment });
    setBusy(false);
    if (r.success) { setMsg('شكرًا، وصل تقييمك. يساعدنا في اختيار الخبير الأنسب لكل قائد.'); load(); } else setMsg(r.message);
  };
  return (
    <section className="card stack rx" aria-labelledby="rx-h">
      <div className="row between"><h3 id="rx-h">كيف كانت {it.what} مع {it.expert}؟</h3>{d.items.length > 1 && <small className="muted">{d.items.length} بانتظار تقييمك</small>}</div>
      <p className="small muted">{new Date(it.when).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' })}{it.title ? ` · ${it.title}` : ''} · تقييمك سري، ولا يرى الخبير إلا المتوسط بعد خمسة تقييمات.</p>
      {keys.map((k) => <Stars key={k} label={d.criteria[k]} value={v[k]} onChange={(n) => setV({ ...v, [k]: n })} />)}
      <textarea className="input" rows={2} maxLength={1000} placeholder="كلمة للخبير أو للبرنامج (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {msg && <div className="alert err small">{msg}</div>}
      <div className="row"><button className="btn sm" disabled={!ready || busy} onClick={send}>{busy ? 'لحظة…' : 'أرسل التقييم'}</button></div>
    </section>
  );
}
