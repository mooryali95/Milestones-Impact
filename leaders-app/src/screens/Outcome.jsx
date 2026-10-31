// ════════════════════════════════════════════════════════════════
// تأكيد الراعي لأثر المبادرة: leaders.sunkvalue.com/outcome?t=<الرمز>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب، يصلها راعي المبادرة حين يرسل القائد مراجعة الأثر
// (اليوم 90 أو 180). يرى المعالم والمنافع بأرقامها الحالية، فيؤكدها أو
// يعترض بملاحظة تعود للقائد ليصححها.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';

const pct = (r) => (r == null ? '·' : `${Math.round(r * 100)}%`);

export default function Outcome() {
  const [t] = useState(() => new URLSearchParams(location.search).get('t') || '');
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { call('outcome.get', { t }).then(setData); }, [t]);

  if (!data) return <div className="center-load"><div className="spinner" /></div>;
  if (!data.success) return <div className="page narrow"><div className="alert err">{data.message}</div></div>;
  const decision = done || (data.done ? data.decision : null);
  if (decision) {
    return (
      <div className="page narrow">
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h2>شكرًا لك</h2>
          <p className="muted">{decision === 'confirmed' ? 'سُجّل تأكيدك، وصار أثر المبادرة موثقًا في تقرير القائد والجهة.' : 'وصلت ملاحظتك إلى القائد ليصحح الأرقام.'}</p>
        </div>
      </div>
    );
  }

  const send = async (dec) => {
    if (dec === 'dispute' && !note.trim()) return setError('اكتب ما الذي لا يطابق ما تراه في الجهة');
    setBusy(true); setError('');
    const r = await call('outcome.submit', { t, decision: dec, note });
    setBusy(false);
    if (r.success) setDone(r.decision); else setError(r.message);
  };
  const s = data.state;

  return (
    <div className="page narrow stack">
      <div className="card stack">
        <p className="eyebrow">تأكيد أثر المبادرة · {data.checkpoint}</p>
        <h1 style={{ fontSize: 22 }}>{data.sponsor ? `أهلًا ${data.sponsor}، ` : ''}هل تعكس هذه الأرقام ما تراه في مبادرة «{data.initiative}»؟</h1>
        <p className="muted">أرسلها {data.leader}{data.org ? ` من ${data.org}` : ''} بعد اعتماد الوثيقة التي أيدتها. تأكيدك يوثّق أثر المبادرة في تقرير القائد وتقرير الجهة.</p>
      </div>

      <div className="card stack">
        <h3>المنافع</h3>
        <div className="tr-scroll"><table className="mtable">
          <thead><tr><th>المنفعة</th><th>خط الأساس</th><th>المستهدف</th><th>الآن</th><th>التحقق</th></tr></thead>
          <tbody>{s.benefits.map((b) => (
            <tr key={b.key}><td>{b.title}{b.evidence && <> · <a href={b.evidence} target="_blank" rel="noreferrer noopener">الدليل</a></>}</td><td>{b.baseline || '·'}</td><td>{b.target || '·'}</td><td><b>{b.value ?? '·'}</b></td><td>{pct(b.realization)}</td></tr>
          ))}</tbody>
        </table></div>
        <h3>المعالم</h3>
        <ul className="tr-ms">{s.milestones.map((m) => <li key={m.key}><b>{m.title}</b> · {data.statuses[m.status] || 'لم يُحدَّث'}{m.actual ? ` في ${m.actual}` : ''}<small> · المستهدف {m.due || '·'}</small></li>)}</ul>
        {data.narrative && <><h3>ما تغيّر بحسب القائد</h3><p>{data.narrative}</p></>}
      </div>

      <div className="card stack">
        <label className="field">
          <span>ملاحظتك (تصل القائد، وتلزم إن اعترضت)</span>
          <textarea className="input" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div className="alert err">{error}</div>}
        <div className="row">
          <button className="btn gold" disabled={busy} onClick={() => send('confirm')}>أؤكد الأرقام</button>
          <button className="btn ghost" disabled={busy} onClick={() => send('dispute')}>لا تطابق ما أراه</button>
        </div>
      </div>
    </div>
  );
}
