// ════════════════════════════════════════════════════════════════
// تقييم 360 في بوابة الخبير: المستشار الفعلي يعتمد قائمة المقيّمين أو يعيدها بملاحظة، ويتابع دوراته
// ════════════════════════════════════════════════════════════════
// (تصور 2026-11-11، قرار المالك: يعتمد القائمة مستشار الدفعة). اعتماده تأكيد لكل بريد فيها (D19)، فتُرسل الدعوات.
// القسم لا يظهر إن لم يكن له شيء، ولا يُفشل اللوحة إن تعذّر.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { xpCall } from '../api.js';
import { CYCLE_STATUS_AR } from '../../../supabase/functions/leaders-api/feedback360.js';
import { FEEDBACK_GROUP_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { Report360Panel } from '../../../src/lib/Report360.jsx';
import { useDialog } from '../../../src/lib/a11y.js';

const day = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

// التقرير قبل الجلسة، والتسليم فيها: المستشار وحده يتيحه للمشارك، ويربطه بجلسة الاستلام إن اختارها.
// كل فتح في السجل باسمه (xp.f360-report). سلوك النافذة من useDialog
function ReportDialog({ c, onClose, onReleased }) {
  const box = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { xpCall('xp.f360-report', { cycle_id: c.id }).then((r) => (r.success ? setData(r) : setError(r.message))); }, [c.id]);
  useDialog(box, onClose, { self: true });
  const release = async () => {
    setBusy(true); setError('');
    const r = await xpCall('xp.f360-release', { cycle_id: c.id, ...(session ? { session_id: session } : {}) });
    setBusy(false);
    if (r.success) onReleased(); else setError(r.message);
  };
  return (
    <Report360Panel boxRef={box} title={`تقرير 360 · ${c.participant}`} data={data} error={error} onClose={onClose}>
      {c.status === 'closed' && data && (
        <div className="stack" style={{ gap: 6, marginTop: 16 }}>
          <p className="small muted">لا يرى المشارك تقريره حتى تسلّمه له في جلسة التوجيه. اقرأه معه، ثم ساعده على اختيار سلوكين أو ثلاثة لخطته.</p>
          {c.sessions?.length > 0 && (
            <label className="field"><span>جلسة الاستلام <em>(اختياري)</em></span>
              <select className="input" value={session} onChange={(e) => setSession(e.target.value)}>
                <option value="">بلا ربط بجلسة</option>
                {c.sessions.map((x) => <option key={x.id} value={x.id}>{day(x.starts_at)}</option>)}
              </select></label>
          )}
          <div className="row"><button className="btn gold sm" disabled={busy} onClick={release}>سلّمته في الجلسة: أتحه للمشارك</button></div>
        </div>
      )}
    </Report360Panel>
  );
}

const countsAr = (c) => Object.entries(c || {}).filter(([, x]) => x.invited).map(([g, x]) => `${FEEDBACK_GROUP_AR[g]} ${x.submitted}/${x.invited}`).join(' · ');

// initial: من الطلب المجمّع للوحة (xp.dashboard)، فلا رحلة ثانية عند الفتح؛ والتحميل بعد كل قرار
export default function Advisor360({ initial }) {
  const [d, setD] = useState(initial?.success ? initial : null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState(null);
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
              {['closed', 'released'].includes(c.status) && <div className="row"><button className="btn sm" onClick={() => setView(c)}>{c.status === 'closed' ? 'اقرأ التقرير قبل الجلسة' : 'اقرأ التقرير'}</button></div>}
            </li>
          ))}
        </ul>
      )}
      {view && <ReportDialog c={view} onClose={() => setView(null)} onReleased={() => { setMsg(`سُلّم التقرير إلى ${view.participant}.`); setView(null); load(); }} />}
    </section>
  );
}
