// ════════════════════════════════════════════════════════════════
// مراجعة المتطلبات المرسلة دفعة واحدة
// ════════════════════════════════════════════════════════════════
// تحدد عدة متطلبات وتعتمدها معًا، أو تفتح دليل أي منها قبل ذلك. كل اعتماد
// يمر بـ admin.review نفسه (يُسجَّل ويُبلَّغ المشارك)، واحدًا تلو الآخر.
import React, { useState } from 'react';
import { L, date } from '../leaders.js';
import { useUI } from '../ui.jsx';

const keyOf = (x) => `${x.participant_id}|${x.requirement_id}`;

export default function ReqQueue({ rows, canWrite, onPerson, onDone }) {
  const { toast, confirm } = useUI();
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  if (!rows.length) return null;
  const all = picked.size === rows.length;
  const toggle = (k) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  // الدليل يُفتح بطلب صريح يُسجَّل، للمدير وحده
  const evidence = async (x) => {
    const r = await L('admin.evidence-url', { participant_id: x.participant_id, path: x.evidence_path });
    if (r.success) window.open(r.url, '_blank', 'noopener'); else toast(r.message);
  };
  const approve = async () => {
    const list = rows.filter((x) => picked.has(keyOf(x)));
    if (!(await confirm(`اعتماد ${list.length} من المتطلبات؟ يصل كل مشارك بريد باعتماد متطلبه.`))) return;
    let ok = 0;
    for (const [i, x] of list.entries()) {
      setBusy(`${i + 1}/${list.length}`);
      const r = await L('admin.review', { participant_id: x.participant_id, requirement_id: x.requirement_id, status: 'done' });
      if (r.success) ok += 1;
    }
    setBusy(null); setPicked(new Set());
    toast(ok === list.length ? `اعتُمد ${ok}` : `اعتُمد ${ok} من ${list.length}، والباقي لم يُحفظ`);
    onDone();
  };

  return (
    <section className="la-card rq">
      <div className="la-row between">
        <h3>متطلبات بانتظار المراجعة <small className="la-muted">· {rows.length}</small></h3>
        {canWrite && (
          <div className="la-row">
            <label className="la-check"><input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map(keyOf)))} /> <span>تحديد الكل</span></label>
            <button className="btn-sm primary" disabled={!picked.size || !!busy} onClick={approve}>{busy ? `جارٍ الاعتماد ${busy}` : `اعتماد المحدد${picked.size ? ` (${picked.size})` : ''}`}</button>
          </div>
        )}
      </div>
      <ul className="la-queue rq-list">{rows.map((x) => {
        const k = keyOf(x);
        return (
          <li key={k}>
            {canWrite && <input type="checkbox" aria-label={`تحديد ${x.stage_requirements?.title_ar} لـ ${x.participants?.full_name}`} checked={picked.has(k)} onChange={() => toggle(k)} />}
            <button className="la-link" onClick={() => onPerson(x.participant_id)}>{x.participants?.full_name}</button>
            <span className="la-chip">{x.stage_requirements?.title_ar}</span>
            {x.evidence_path && (canWrite
              ? <button className="la-link" onClick={() => evidence(x)}>الدليل</button>
              : <small className="la-muted">دليل مرفق</small>)}
            <small>{date(x.completed_at)}</small>
          </li>
        );
      })}</ul>
    </section>
  );
}
