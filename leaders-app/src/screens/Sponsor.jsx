// ════════════════════════════════════════════════════════════════
// تأييد راعي المبادرة: leaders.sunkvalue.com/sponsor?t=<الرمز>
// ════════════════════════════════════════════════════════════════
// صفحة مفتوحة بلا حساب، يصلها الراعي من بريد الدعوة بعد قبول المستشار.
// يقرأ الوثيقة كاملة بالقالب نفسه، ثم يؤيدها أو يعيدها بملاحظة.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { openCapstoneDoc } from './Capstone.jsx';
import { POPUP_BLOCKED } from '../ui.jsx';
import { dateAr } from '../../../supabase/functions/leaders-api/capstone.js';
import { linkToken } from '../link-token.js';

export default function Sponsor() {
  const [t] = useState(() => linkToken());
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { call('sponsor.get', { t }).then(setData); }, [t]);

  if (!data) return <div className="center-load"><div className="spinner" /></div>;
  if (!data.success) return <div className="page narrow"><div className="card stack"><h1 className="as-h2">الرابط غير متاح</h1><div className="alert err" role="alert">{data.message}</div></div></div>;
  const decision = done || (data.done ? data.decision : null);
  if (decision) {
    return (
      <div className="page narrow">
        <div className="card milestone-card stack">
          <div className="badge"><span>✓</span></div>
          <h1 className="as-h2">شكرًا لك</h1>
          <p className="muted">{decision === 'endorsed' ? 'سُجّل تأييدك، واعتُمدت الوثيقة.' : 'وصلت ملاحظتك إلى صاحب المبادرة ليعدّل الوثيقة.'}</p>
        </div>
      </div>
    );
  }

  const m = data.doc.meta;
  const send = async (dec) => {
    if (dec === 'decline' && !note.trim()) return setError('اكتب ما الذي يعدّله صاحب المبادرة');
    setBusy(true); setError('');
    const r = await call('sponsor.submit', { t, decision: dec, note });
    setBusy(false);
    if (r.success) setDone(r.decision); else setError(r.message);
  };

  return (
    <div className="page narrow stack">
      <div className="card stack">
        <p className="eyebrow">تأييد راعي المبادرة</p>
        <h1 style={{ fontSize: 22 }}>{data.sponsor ? `أهلًا ${data.sponsor}، ` : ''}هل تؤيد مبادرة «{m.initiative}»؟</h1>
        <p className="muted">
          أعدّها {m.participant?.name}{m.org?.name ? ` من ${m.org.name}` : ''} مشروع تخرجه في برنامج القادة، وراجعها المستشار وقبلها.
          تأييدك يعني أنها مبادرة حقيقية تخدم أولويات جهتك، وأن خطتها واقعية.
        </p>
        <dl className="sp-meta">
          <div><dt>النوع</dt><dd>{m.scope_title || '·'}</dd></div>
          <div><dt>المدة</dt><dd>{m.start ? dateAr(m.start) : '·'} إلى {m.end ? dateAr(m.end) : '·'}</dd></div>
          <div><dt>التكلفة مع الاحتياطي</dt><dd>{data.doc.cost ? `${Math.round(data.doc.cost.withContingency).toLocaleString('en-US')} ريال` : '·'}</dd></div>
          <div><dt>الفصول</dt><dd>{data.doc.sections.length}</dd></div>
        </dl>
        <button className="btn ghost" onClick={() => openCapstoneDoc(data.doc).then((ok) => !ok && setError(POPUP_BLOCKED))}>اقرأ الوثيقة كاملة</button>
      </div>
      <div className="card stack">
        <label className="field">
          <span>ملاحظتك (تصل صاحب المبادرة، وتلزم إن طلبت تعديلًا)</span>
          <textarea className="input" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div className="alert err" role="alert">{error}</div>}
        <div className="row">
          <button className="btn gold" disabled={busy} onClick={() => send('endorse')}>أؤيد المبادرة</button>
          <button className="btn ghost" disabled={busy} onClick={() => send('decline')}>أطلب تعديلًا</button>
        </div>
      </div>
    </div>
  );
}
