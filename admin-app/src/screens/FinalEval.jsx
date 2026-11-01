// ════════════════════════════════════════════════════════════════
// التقييم الختامي: درجة آلية مشروحة، تعديل بتعليل، قرار، اعتماد
// ════════════════════════════════════════════════════════════════
// • FinalEvalCard: في ملف المشارك. كل رقم بسببه ومصدره، وكل تعديل بتعليل، والاعتماد بحسب طريقة البرنامج.
// • FinalConfig: إعداد البرنامج (الأوزان، حدود القرار، طريقة الاعتماد).
import React, { useCallback, useEffect, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { FINAL_APPROVAL_AR, FINAL_COMPONENT_AR, FINAL_DECISION_AR, FINAL_STATUS_AR, finalConfig } from '../../../supabase/functions/leaders-api/logic.js';

const DEC_CHIP = { pass: 'ok', pass_notes: 'ok', extend: 'warn', fail: 'bad' };
const when = (d) => (d ? new Date(d).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function FinalEvalCard({ participantId, canWrite }) {
  const { toast, prompt } = useUI();
  const [d, setD] = useState(null);
  const [adj, setAdj] = useState({ components: {} });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await L('admin.final-eval', { participant_id: participantId });
    setD(r);
    if (r.success) setAdj(r.record?.adjust || { components: {} });
  }, [participantId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;

  const rec = d.record, live = d.live, status = rec?.status || 'draft';
  const locked = !canWrite || status === 'approved' || status === 'pending';
  const setComp = (k, f, v) => setAdj({ ...adj, components: { ...adj.components, [k]: { ...(adj.components?.[k] || {}), [f]: v } } });
  const clearComp = (k) => { const c = { ...adj.components }; delete c[k]; setAdj({ ...adj, components: c }); };
  const run = async (action, body, ok) => {
    setBusy(true);
    const r = await L(action, { participant_id: participantId, ...body });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast(ok); load();
  };
  const voteReturn = async () => {
    const note = await prompt('سبب الإعادة (يصل لمن رفع التقييم):', '');
    if (note) run('admin.final-eval-vote', { vote: 'return', note }, 'أُعيد للمراجعة');
  };
  const reopen = async () => {
    const note = await prompt('سبب إعادة فتح التقييم المعتمد:', '');
    if (note) run('admin.final-eval-reopen', { note }, 'أُعيد فتحه مسودة');
  };

  return (
    <section className="la-card" aria-label="التقييم الختامي">
      <div className="la-row between">
        <h3>التقييم الختامي <small className="la-muted">· {d.program.name}</small></h3>
        <span className="la-row">
          <span className={`la-chip ${status === 'approved' ? 'ok' : status === 'pending' ? 'warn' : status === 'returned' ? 'bad' : ''}`}>{FINAL_STATUS_AR[status]}</span>
          <b className="la-big">{live.score != null ? `${live.score}٪` : '—'}</b>
          {live.decision && <span className={`la-chip ${DEC_CHIP[live.decision]}`}>{FINAL_DECISION_AR[live.decision]}</span>}
        </span>
      </div>
      <p className="la-muted">
        الدرجة الآلية {live.auto_score != null ? `${live.auto_score}٪` : '—'} من مكوّنات تغطي {live.coverage}٪ من الأوزان
        {live.missing.length ? ` (لم يكتمل: ${live.missing.join('، ')})` : ''}. القرار المقترح: <b>{live.suggested ? FINAL_DECISION_AR[live.suggested] : 'لا يُقترح قبل اكتمال التغطية'}</b>.
      </p>

      <div className="table-wrap"><table className="la-table">
        <thead><tr><th>المكوّن</th><th>الوزن</th><th>الآلي</th><th>لماذا</th><th>تعديل الخبير</th></tr></thead>
        <tbody>{live.components.map((c) => {
          const a = adj.components?.[c.key];
          return (
            <tr key={c.key}>
              <td>{c.label}<br /><small className="la-muted">المصدر: {c.source}</small></td>
              <td>{c.weight}{c.share ? <small className="la-muted"> ({c.share}٪ فعليًا)</small> : ''}</td>
              <td><b>{c.auto != null ? `${c.auto}٪` : '—'}</b></td>
              <td><small>{c.reason}</small></td>
              <td>{locked ? (c.adjusted ? <><b>{c.value}٪</b><br /><small className="la-muted">«{c.adjust_reason}»</small></> : <small className="la-muted">—</small>) : (
                <div className="la-adj">
                  <input type="number" min="0" max="100" aria-label={`قيمة معدلة لـ${c.label}`} value={a?.value ?? ''} placeholder="بلا تعديل" onChange={(e) => (e.target.value === '' ? clearComp(c.key) : setComp(c.key, 'value', e.target.value))} />
                  {a?.value !== undefined && <input aria-label={`تعليل تعديل ${c.label}`} value={a?.reason || ''} placeholder="لماذا؟ (إلزامي)" onChange={(e) => setComp(c.key, 'reason', e.target.value)} />}
                </div>
              )}</td>
            </tr>
          );
        })}</tbody>
      </table></div>

      {!locked && (
        <div className="la-adj-row">
          <label className="field"><span>الدرجة النهائية (اختياري، تتجاوز المعادلة)</span>
            <input type="number" min="0" max="100" value={adj.score?.value ?? ''} placeholder={live.auto_score ?? ''} onChange={(e) => setAdj({ ...adj, score: e.target.value === '' ? undefined : { ...(adj.score || {}), value: e.target.value } })} /></label>
          {adj.score && <label className="field"><span>تعليل الدرجة</span><input value={adj.score.reason || ''} onChange={(e) => setAdj({ ...adj, score: { ...adj.score, reason: e.target.value } })} /></label>}
          <label className="field"><span>القرار</span>
            <select value={adj.decision?.value || ''} onChange={(e) => setAdj({ ...adj, decision: e.target.value ? { ...(adj.decision || {}), value: e.target.value } : undefined })}>
              <option value="">المقترح ({live.suggested ? FINAL_DECISION_AR[live.suggested] : '—'})</option>
              {Object.entries(FINAL_DECISION_AR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select></label>
          {adj.decision && <label className="field"><span>تعليل القرار{adj.decision.value !== live.suggested ? ' (إلزامي: يخالف المقترح)' : ''}</span><input value={adj.decision.reason || ''} onChange={(e) => setAdj({ ...adj, decision: { ...adj.decision, reason: e.target.value } })} /></label>}
        </div>
      )}

      {canWrite && (
        <div className="la-row">
          {(status === 'draft' || status === 'returned') && <>
            <button className="btn-sm ghost" disabled={busy} onClick={() => run('admin.final-eval-save', { adjust: adj }, 'حُفظت المسودة')}>حفظ مسودة</button>
            <button className="btn-sm primary" disabled={busy} onClick={() => run('admin.final-eval-save', { adjust: adj, submit: true }, 'رُفع للاعتماد')}>ارفع للاعتماد</button>
          </>}
          {status === 'pending' && <>
            <button className="btn-sm primary" disabled={busy} onClick={() => run('admin.final-eval-vote', { vote: 'approve' }, 'سُجل اعتمادك')}>اعتمد</button>
            <button className="btn-sm ghost" disabled={busy} onClick={voteReturn}>أعِد للمراجعة</button>
            <small className="la-muted">{FINAL_APPROVAL_AR[live.config.approval]}: {d.approval.yes} من {d.approval.need}</small>
          </>}
          {status === 'approved' && <button className="la-link" onClick={reopen}>إعادة فتح</button>}
        </div>
      )}
      {(rec?.votes || []).length > 0 && (
        <ul className="la-reqs">{rec.votes.map((v) => (
          <li key={v.by}><span>{v.vote === 'approve' ? '✓ اعتمد' : '↩ أعاد'} · {v.by} <small className="la-muted">{when(v.at)}</small>{v.note && <><br /><small className="la-muted">«{v.note}»</small></>}</span></li>
        ))}</ul>
      )}
      {rec?.submitted_by && <small className="la-muted">رفعه {rec.submitted_by} في {when(rec.submitted_at)}{rec.decided_at ? ` · اعتُمد ${when(rec.decided_at)}` : ''}</small>}
    </section>
  );
}

// إعداد التقييم الختامي للبرنامج
export function FinalConfig({ program, onClose }) {
  const { toast } = useUI();
  const [c, setC] = useState(() => finalConfig(program.final_eval));
  const [busy, setBusy] = useState(false);
  const total = Object.values(c.weights).reduce((a, b) => a + Number(b || 0), 0);
  const save = async () => {
    setBusy(true);
    const r = await L('admin.final-eval-config', { program_id: program.id, config: c });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast('حُفظ إعداد التقييم الختامي'); onClose(true);
  };
  const w = (k, v) => setC({ ...c, weights: { ...c.weights, [k]: v } });
  const t = (k, v) => setC({ ...c, thresholds: { ...c.thresholds, [k]: v } });
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form" role="dialog" aria-modal="true" aria-label="إعداد التقييم الختامي">
        <h3>التقييم الختامي: «{program.name}»</h3>
        <p className="la-muted">الأوزان نسبية (المجموع {total})؛ المكوّن الغائب لا يُحسب صفرًا بل يُعاد توزيع وزنه.</p>
        {Object.entries(FINAL_COMPONENT_AR).map(([k, l]) => (
          <label key={k} className="field"><span>{l}</span><input type="number" min="0" max="100" value={c.weights[k]} onChange={(e) => w(k, e.target.value)} /></label>
        ))}
        <h4>حدود القرار</h4>
        <label className="field"><span>اجتاز من</span><input type="number" value={c.thresholds.pass} onChange={(e) => t('pass', e.target.value)} /></label>
        <label className="field"><span>اجتاز بملاحظات من</span><input type="number" value={c.thresholds.pass_notes} onChange={(e) => t('pass_notes', e.target.value)} /></label>
        <label className="field"><span>يُمدَّد من (وما دونه: لم يجتز)</span><input type="number" value={c.thresholds.extend} onChange={(e) => t('extend', e.target.value)} /></label>
        <label className="field"><span>أقل تغطية لاقتراح قرار (٪)</span><input type="number" value={c.min_coverage} onChange={(e) => setC({ ...c, min_coverage: e.target.value })} /></label>
        <h4>الاعتماد</h4>
        <label className="field"><span>طريقة الاعتماد</span>
          <select value={c.approval} onChange={(e) => setC({ ...c, approval: e.target.value })}>{Object.entries(FINAL_APPROVAL_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {c.approval !== 'expert' && <label className="field"><span>عدد أعضاء اللجنة</span><input type="number" min="2" max="9" value={c.committee_size} onChange={(e) => setC({ ...c, committee_size: e.target.value })} /></label>}
        <div className="la-row"><button className="btn-sm primary" disabled={busy} onClick={save}>حفظ</button><button className="btn-sm ghost" onClick={() => onClose()}>إلغاء</button></div>
      </div>
    </div>
  );
}
