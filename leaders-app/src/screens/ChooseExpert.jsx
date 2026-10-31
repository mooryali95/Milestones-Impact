// ════════════════════════════════════════════════════════════════
// اختر خبيرك: ثلاثة خبراء يرشّحهم محرك المطابقة، ويختار المشارك أحدهم
// ════════════════════════════════════════════════════════════════
// يرى المشارك الاسم والنبذة والتقييم (إن بلغ حدّه) فقط؛ التكلفة والساعات للإدارة.
// الاختيار يُنشئ طلبًا يُعرض على الخبير 24 ساعة، فإن اعتذر انتقل للتالي آليًا.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

export default function ChooseExpert({ role = 'coach' }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => call('experts.suggest', { role }).then(setD);
  useEffect(() => { load(); }, [role]);
  if (!d?.success) return null;
  if (d.request) {
    return (
      <section className="card stack rx" aria-labelledby="cx-h">
        <h3 id="cx-h">{d.role_ar}</h3>
        <p className="small">{d.request.expert ? <><b>{d.request.expert}</b>{d.request.title ? ` · ${d.request.title}` : ''} · </> : ''}{d.request.status_ar}</p>
        {msg && <p className="small muted">{msg}</p>}
      </section>
    );
  }
  if (!d.candidates?.length) return null;
  const choose = async (e) => {
    setBusy(e.id); setMsg('');
    const r = await call('experts.choose', { role, expert_id: e.id });
    setBusy('');
    if (r.success) { setMsg(`أرسلنا طلبك إلى ${r.expert}، ويصلك بريد حين يقبله.`); load(); } else setMsg(r.message);
  };
  return (
    <section className="card stack rx" aria-labelledby="cx-h">
      <h3 id="cx-h">اختر {d.role_ar}</h3>
      <p className="small muted">رشّحنا لك ثلاثة بحسب احتياجك ومستواك. اختر من تراه الأنسب، ونعرض عليه طلبك.</p>
      <div className="cx-grid">
        {d.candidates.map((e) => (
          <article key={e.id} className="cx-card stack">
            <b>{e.full_name}</b>
            {e.title && <small className="muted">{e.title}{e.years ? ` · ${e.years} سنة خبرة` : ''}</small>}
            {e.bio && <p className="small">{e.bio}</p>}
            <small>{e.rating ? `★ ${e.rating.avg} (${e.rating.count} تقييم)` : 'خبير جديد في البرنامج'}</small>
            <button className="btn sm" disabled={!!busy} onClick={() => choose(e)}>{busy === e.id ? 'لحظة…' : 'اختره'}</button>
          </article>
        ))}
      </div>
      {msg && <div className="alert err small">{msg}</div>}
    </section>
  );
}
