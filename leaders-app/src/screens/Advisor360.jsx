// ════════════════════════════════════════════════════════════════
// تقييم 360 في بوابة الخبير: المستشار الفعلي يعتمد قائمة المقيّمين أو يعيدها بملاحظة، ويتابع دوراته
// ════════════════════════════════════════════════════════════════
// (تصور 2026-11-11، قرار المالك: يعتمد القائمة مستشار الدفعة). اعتماده تأكيد لكل بريد فيها (D19)، فتُرسل الدعوات.
// القسم لا يظهر إن لم يكن له شيء، ولا يُفشل اللوحة إن تعذّر.
import React, { useCallback, useEffect, useState } from 'react';
import { xpCall } from '../api.js';
import { CYCLE_STATUS_AR } from '../../../supabase/functions/leaders-api/feedback360.js';
import { FEEDBACK_GROUP_AR } from '../../../supabase/functions/leaders-api/labels.js';

const countsAr = (c) => Object.entries(c || {}).filter(([, x]) => x.invited).map(([g, x]) => `${FEEDBACK_GROUP_AR[g]} ${x.submitted}/${x.invited}`).join(' · ');

// initial: من الطلب المجمّع للوحة (xp.dashboard)، فلا رحلة ثانية عند الفتح؛ والتحميل بعد كل قرار
export default function Advisor360({ initial }) {
  const [d, setD] = useState(initial?.success ? initial : null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => xpCall('xp.f360').then((r) => setD(r?.success ? r : null)), []);
  useEffect(() => { if (initial === undefined) load(); }, [initial, load]);
  const approvals = d?.approvals || [];
  const reports = d?.reports || [];
  if (!approvals.length && !reports.length) return msg ? <div className="alert" role="status">{msg}</div> : null;
  const decide = async (c, decision) => {
    setBusy(true); setMsg('');
    const r = await xpCall('xp.f360-decide', { cycle_id: c.id, decision, note });
    setBusy(false);
    setMsg(r.success ? (decision === 'approve' ? `اعتُمدت قائمة ${c.participant} وأُرسلت ${r.invited} دعوات.` : `أُعيدت القائمة إلى ${c.participant} بملاحظتك.`) : r.message);
    if (r.success) { setOpen(null); setNote(''); load(); }
  };
  return (
    <section className="card stack" aria-labelledby="a360-h">
      <h2 className="as-h3" id="a360-h">تقييم 360 لمشاركيك</h2>
      {msg && <div className="alert" role="status">{msg}</div>}
      {approvals.length > 0 && <p className="small muted">قوائم بانتظار اعتمادك: تأكد من تنوعها ومن أن فيها من يختلف مع المشارك، لا المادحين وحدهم. اعتمادك يؤكد كل بريد فيها ويرسل الدعوات.</p>}
      {approvals.map((c) => (
        <div key={c.id} className="xpp-person">
          <div className="row between"><b>{c.participant}</b><small className="muted">{c.nominees.length} مرشحين</small></div>
          <ul className="small">
            {c.nominees.map((n) => <li key={n.id}>{n.relation_ar}: {n.full_name ? `${n.full_name} · ` : ''}<span className="ltr">{n.email}</span>{n.flags_ar.length ? <span className="muted"> · {n.flags_ar.join('، ')}</span> : null}</li>)}
          </ul>
          {open === c.id ? (
            <div className="stack" style={{ gap: 6 }}>
              <label className="field"><span>ملاحظتك للمشارك (تصله)</span><textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="row"><button className="btn sm" disabled={busy || note.trim().length < 5} onClick={() => decide(c, 'return')}>أعدها بملاحظة</button><button className="link small" onClick={() => setOpen(null)}>إلغاء</button></div>
            </div>
          ) : (
            <div className="row"><button className="btn sm gold" disabled={busy} onClick={() => decide(c, 'approve')}>اعتمد القائمة وأرسل الدعوات</button><button className="link small" disabled={busy} onClick={() => { setOpen(c.id); setNote(''); }}>أعدها بملاحظة</button></div>
          )}
        </div>
      ))}
      {reports.length > 0 && (
        <ul className="stack small">
          {reports.map((c) => (
            <li key={c.id} className="xpp-person">
              <div className="row between"><b>{c.participant}</b><span className="chip">{CYCLE_STATUS_AR[c.status]}</span></div>
              <small className="muted">{countsAr(c.counts)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
