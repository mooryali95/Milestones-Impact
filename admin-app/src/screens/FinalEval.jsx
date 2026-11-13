// ════════════════════════════════════════════════════════════════
// التقييم الختامي: درجة آلية مشروحة، تعديل بتعليل، قرار، اعتماد
// ════════════════════════════════════════════════════════════════
// • FinalEvalCard: في ملف المشارك. كل رقم بسببه ومصدره، وكل تعديل بتعليل، والاعتماد بحسب طريقة البرنامج.
//   بعد الرفع تُعرض لقطة الحساب بإصدار معادلتها لا حسابًا حيًا؛ والقرارات التي تلزمها ملاحظات تطلبها.
// • FinalConfig: إعداد البرنامج (الأوزان، طريقة القياس النهائي، قواعد التغطية، حدود القرار، الاعتماد واللجنة).
import React, { useCallback, useEffect, useState } from 'react';
import { dateTime as when, L, withRunningReason } from '../leaders.js';
import { Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { CONTINUOUS_SOURCE_AR, KATON_ENABLED } from '../../../supabase/functions/leaders-api/labels.js';
import { FINAL_APPROVAL_AR, FINAL_COMPONENT_AR, FINAL_DECISION_AR, FINAL_MEASURE_AR, FINAL_STATUS_AR, finalApproveConfirm, finalConfig, NOTES_REQUIRED, voteNoticeAr } from '../../../supabase/functions/leaders-api/logic.js';

const DEC_CHIP = { pass: 'ok', pass_notes: 'ok', extend: 'warn', fail: 'bad' };

export function FinalEvalCard({ participantId, canWrite }) {
  const { toast, prompt, confirm } = useUI();
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
  // ok نص النجاح، أو دالة تبنيه من رد الخادم (حال التقييم الفعلية بعد الصوت)
  const run = async (action, body, ok) => {
    setBusy(true);
    const r = await L(action, { participant_id: participantId, ...body });
    setBusy(false);
    if (!r.success) return toast(r.message);
    toast(r.notice || (typeof ok === 'function' ? ok(r) : ok)); load();   // notice: حال الشهادة حين يكتمل الاعتماد (صدرت، أو تنتظر الاسم، أو حُجبت، أو تعذّرت)
  };
  const voteApprove = async () => {
    if (await confirm(finalApproveConfirm(live, d.approval), { ok: 'اعتمد' })) run('admin.final-eval-vote', { vote: 'approve' }, (r) => voteNoticeAr('approve', r.status, r.approval));
  };
  const voteReturn = async () => {
    const note = await prompt('سبب الإعادة (يصل لمن رفع التقييم):', '');
    if (note) run('admin.final-eval-vote', { vote: 'return', note }, (r) => voteNoticeAr('return', r.status, r.approval));
  };
  const withdraw = async () => {
    if (!(await confirm('يعود التقييم مسودة وتسقط الأصوات المسجلة عليه، فتعدّله ثم ترفعه للاعتماد من جديد. متابعة؟'))) return;
    run('admin.final-eval-save', { adjust: adj }, 'سُحب التقييم وعاد مسودة');
  };
  const reopen = async () => {
    const note = await prompt('سبب إعادة فتح التقييم المعتمد:', '');
    if (note) run('admin.final-eval-reopen', { note }, 'أُعيد فتحه مسودة');
  };
  const effectiveDecision = adj.decision?.value || live.suggested;
  const notesRequired = NOTES_REQUIRED.includes(effectiveDecision);

  return (
    <section className="la-card" aria-label="التقييم الختامي">
      <div className="la-row between">
        <h3>التقييم الختامي <small className="la-muted">· {d.program.name}</small></h3>
        <span className="la-row">
          <span className={`la-chip ${status === 'approved' ? 'ok' : status === 'pending' ? 'warn' : status === 'returned' ? 'bad' : ''}`}>{FINAL_STATUS_AR[status]}</span>
          <b className="la-big">{live.score != null ? `${live.score}٪` : '—'}</b>
          {live.decision && <span className={`la-chip ${DEC_CHIP[live.decision]}`}>{FINAL_DECISION_AR[live.decision]}</span>}
          {live.large_adjust && <span className="la-chip warn" title="فرق الدرجة عن الآلية يتجاوز الحد؛ يحتاج توقيعين">تعديل كبير</span>}
          {live.near_cut && <span className="la-chip warn" title={`الدرجة على بعد ${live.near_cut.gap} من حد «${FINAL_DECISION_AR[live.near_cut.key]}» (${live.near_cut.cut}). الفرق داخل هامش الخطأ، فراجع الأدلة قبل القرار`}>قريب من الحد</span>}
        </span>
      </div>
      <p className="la-muted">
        الدرجة الآلية {live.auto_score != null ? `${live.auto_score}٪` : '—'} من مكوّنات تغطي {live.coverage}٪ من الأوزان
        {live.missing?.length ? ` (لم يكتمل: ${live.missing.join('، ')})` : ''}
        {live.zeroed?.length ? ` (انتهت الدفعة فحُسب صفرًا: ${live.zeroed.join('، ')})` : ''}
        {live.score_adjusted && live.score != null ? `، وبعد تعديل الخبير ${live.score}٪` : ''}. القرار المقترح: <b>{live.suggested ? FINAL_DECISION_AR[live.suggested] : 'لا يُقترح قبل اكتمال التغطية'}</b>
        {live.fail_blocked ? <>؛ «لم يجتز» يحتاج تغطية {live.config.fail_min_coverage}٪ ودليلًا حاضرًا من المشروع أو القياس النهائي، فاقتُرح التمديد</> : null}
        {live.floor_capped ? <>؛ المشروع دون أرضيته {live.config.project_floor}٪، فاقتُرح «{FINAL_DECISION_AR.pass_notes}»</> : null}.
        {d.frozen && <> <span className="la-chip">لقطة الرفع · إصدار المعادلة {live.config_version}{d.current_version !== live.config_version ? ` (الإعداد الحالي ${d.current_version})` : ''}</span></>}
      </p>

      <div className="table-wrap"><table className="la-table">
        <thead><tr><th>المكوّن</th><th>الوزن</th><th>الآلي</th><th>لماذا</th><th>تعديل الخبير</th></tr></thead>
        <tbody>{live.components.map((c) => {
          const a = adj.components?.[c.key];
          return (
            <tr key={c.key}>
              <td>{c.label}<br /><small className="la-muted">المصدر: {c.source}</small></td>
              <td>{c.weight}{c.share ? <small className="la-muted"> ({c.share}٪ فعليًا)</small> : ''}</td>
              <td><b>{c.auto != null ? `${c.auto}٪` : '—'}</b>{c.zeroed && <><br /><span className="la-chip warn">صفر معلن</span></>}</td>
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
          <label className="field"><span>الدرجة النهائية (اختياري، تتجاوز المعادلة؛ فرقها عن الآلية فوق {live.config.large_adjust} يحتاج توقيعين، بتعديلها أو بتعديل المكوّنات)</span>
            <input type="number" min="0" max="100" value={adj.score?.value ?? ''} placeholder={live.formula_score ?? ''} onChange={(e) => setAdj({ ...adj, score: e.target.value === '' ? undefined : { ...(adj.score || {}), value: e.target.value } })} /></label>
          {adj.score && <label className="field"><span>تعليل الدرجة</span><input value={adj.score.reason || ''} onChange={(e) => setAdj({ ...adj, score: { ...adj.score, reason: e.target.value } })} /></label>}
          <label className="field"><span>القرار</span>
            <select value={adj.decision?.value || ''} onChange={(e) => setAdj({ ...adj, decision: e.target.value ? { ...(adj.decision || {}), value: e.target.value } : undefined })}>
              <option value="">المقترح ({live.suggested ? FINAL_DECISION_AR[live.suggested] : '—'})</option>
              {Object.entries(FINAL_DECISION_AR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select></label>
          {adj.decision && <label className="field"><span>تعليل القرار{adj.decision.value !== live.suggested ? ' (إلزامي: يخالف المقترح)' : ''}</span><input value={adj.decision.reason || ''} onChange={(e) => setAdj({ ...adj, decision: { ...adj.decision, reason: e.target.value } })} /></label>}
          <label className="field"><span>ملاحظات تصل المشارك{notesRequired ? ' (إلزامية لهذا القرار: ما الذي ينقصه وكيف يستكمله)' : ' (اختيارية)'}</span>
            <textarea rows={2} maxLength={2000} value={adj.notes_to_participant || ''} aria-required={notesRequired} onChange={(e) => setAdj({ ...adj, notes_to_participant: e.target.value })} /></label>
        </div>
      )}
      {locked && live.notes_to_participant && <p className="la-muted">ملاحظات للمشارك: «{live.notes_to_participant}»</p>}

      {canWrite && (
        <div className="la-row">
          {(status === 'draft' || status === 'returned') && <>
            <button className="btn-sm ghost" disabled={busy} onClick={() => run('admin.final-eval-save', { adjust: adj }, 'حُفظت المسودة')}>حفظ مسودة</button>
            <button className="btn-sm primary" disabled={busy} onClick={() => run('admin.final-eval-save', { adjust: adj, submit: true }, 'رُفع للاعتماد')}>ارفع للاعتماد</button>
          </>}
          {status === 'pending' && <>
            <button className="btn-sm primary" disabled={busy || !!d.vote_block} title={d.vote_block || ''} onClick={voteApprove}>اعتمد</button>
            <button className="btn-sm ghost" disabled={busy || !!d.vote_block} onClick={voteReturn}>أعِد للمراجعة</button>
            {d.can_withdraw && <button className="btn-sm ghost" disabled={busy} onClick={withdraw}>اسحب للتعديل</button>}
            <small className="la-muted">{FINAL_APPROVAL_AR[live.config.approval]}{d.approval.large_adjust ? ' + توقيع ثانٍ للتعديل الكبير' : ''}: {d.approval.yes} من {d.approval.need}</small>
            {d.vote_block && <small className="la-muted">{d.vote_block}</small>}
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
  const { toast, prompt } = useUI();
  const [c, setC] = useState(() => finalConfig(program.final_eval));
  const [busy, setBusy] = useState(false);
  const close = useGuardedClose(JSON.stringify(c) !== JSON.stringify(finalConfig(program.final_eval)), () => onClose());
  useEscape(close);
  const total = Object.values(c.weights).reduce((a, b) => a + Number(b || 0), 0);
  const save = async () => {
    setBusy(true);
    // أثناء دفعة جارية يقبل الخادم الحفظ من المدير العام بتعليل مكتوب؛ المساعد يسأله عنه ويعيد الإرسال
    const r = await withRunningReason((extra) => L('admin.final-eval-config', { program_id: program.id, config: c, ...extra }), prompt);
    setBusy(false);
    if (r.cancelled) return;
    if (!r.success) return toast(r.message);
    // أعضاء اللجنة كما قرأهم الخادم فعلًا، فلا يُظن الاعتماد مقصورًا على من لم يُحفظ
    const members = r.config?.approval !== 'expert' && r.config?.committee?.length ? `، أعضاء اللجنة: ${r.config.committee.join('، ')}` : r.config?.approval !== 'expert' ? '، والاعتماد لأي حساب إدارة' : '';
    toast(`حُفظ إعداد التقييم الختامي (الإصدار ${r.config?.version ?? ''})${members}`); onClose(true);
  };
  const w = (k, v) => setC({ ...c, weights: { ...c.weights, [k]: v } });
  const t = (k, v) => setC({ ...c, thresholds: { ...c.thresholds, [k]: v } });
  const m = (k, v) => setC({ ...c, measure: { ...c.measure, [k]: v } });
  const g = (k, v) => setC({ ...c, measure: { ...c.measure, gain_scores: { ...c.measure.gain_scores, [k]: v } } });
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="la-form mi-form" role="dialog" aria-modal="true" aria-label="إعداد التقييم الختامي">
        <h3>التقييم الختامي: «{program.name}» <small className="la-muted">· إصدار المعادلة {c.version}{c.effective_from ? ` منذ ${when(c.effective_from)}` : ''}</small></h3>
        <p className="la-muted">الأوزان نسبية (المجموع {total}). قبل انتهاء الدفعة يُعاد توزيع وزن المكوّن الغائب؛ وبعدها يُحسب المشروع والقياس الغائبان صفرًا بإعلان. كل حفظ يرفع الإصدار، والتقييمات المرفوعة تبقى بلقطة إصدارها.</p>
        {Object.entries(FINAL_COMPONENT_AR).map(([k, l]) => (
          <label key={k} className="field"><span>{l}</span><input type="number" min="0" max="100" value={c.weights[k]} onChange={(e) => w(k, e.target.value)} /></label>
        ))}
        <h4>القياس النهائي</h4>
        <label className="field"><span>كيف يُحوَّل القياس البعدي إلى درجة</span>
          <select value={c.measure.mode} onChange={(e) => m('mode', e.target.value)}>{Object.entries(FINAL_MEASURE_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {c.measure.mode === 'gain' && <div className="la-row">
          <label className="field"><span>صاعد</span><input type="number" min="0" max="100" value={c.measure.gain_scores.up} onChange={(e) => g('up', e.target.value)} /></label>
          <label className="field"><span>مستقر</span><input type="number" min="0" max="100" value={c.measure.gain_scores.flat} onChange={(e) => g('flat', e.target.value)} /></label>
          <label className="field"><span>هابط</span><input type="number" min="0" max="100" value={c.measure.gain_scores.down} onChange={(e) => g('down', e.target.value)} /></label>
        </div>}
        {c.measure.mode !== 'level' && <label className="field"><span>محك الإتقان على الاختبار الموضوعي (٪){c.measure.mode === 'gain' ? '؛ من بلغه قبل البرنامج وبقي عليه يُحسب صاعدًا' : ''}</span><input type="number" min="1" max="100" value={c.measure.mastery_cut} onChange={(e) => m('mastery_cut', e.target.value)} /></label>}
        <h4>مصادر التقييم المستمر</h4>
        <p className="la-muted">وزن نسبي لكل مصدر داخل «التقييم المستمر» (0 يستبعده). تقدير الخبراء بعد الجلسات انخراط يُعرض منفصلًا ولا يدخل المؤشر.</p>
        {Object.entries(CONTINUOUS_SOURCE_AR).filter(([k]) => KATON_ENABLED || k !== 'katon').map(([k, l]) => (
          <label key={k} className="field"><span>{l}</span><input type="number" min="0" max="10" value={c.sources[k]} onChange={(e) => setC({ ...c, sources: { ...c.sources, [k]: e.target.value } })} /></label>
        ))}
        <div className="la-row">
          <label className="field"><span>أقل عدد أحداث يدخل بها المصدر المؤشر</span><input type="number" min="1" max="20" value={c.min_events} onChange={(e) => setC({ ...c, min_events: e.target.value })} /></label>
          <label className="field"><span>أقل عدد أسئلة للاختبارات</span><input type="number" min="1" max="100" value={c.min_quiz_items} onChange={(e) => setC({ ...c, min_quiz_items: e.target.value })} /></label>
        </div>
        <h4>حدود القرار</h4>
        <label className="field"><span>اجتاز من</span><input type="number" value={c.thresholds.pass} onChange={(e) => t('pass', e.target.value)} /></label>
        <label className="field"><span>اجتاز بملاحظات من</span><input type="number" value={c.thresholds.pass_notes} onChange={(e) => t('pass_notes', e.target.value)} /></label>
        <label className="field"><span>يُمدَّد من (وما دونه: لم يجتز)</span><input type="number" value={c.thresholds.extend} onChange={(e) => t('extend', e.target.value)} /></label>
        <label className="field"><span>أقل تغطية لاقتراح قرار (٪)</span><input type="number" value={c.min_coverage} onChange={(e) => setC({ ...c, min_coverage: e.target.value })} /></label>
        <label className="field"><span>أقل تغطية لاقتراح «لم يجتز» (٪)، مع دليل حاضر من المشروع أو القياس</span><input type="number" value={c.fail_min_coverage} onChange={(e) => setC({ ...c, fail_min_coverage: e.target.value })} /></label>
        <h4>الاعتماد</h4>
        <label className="field"><span>طريقة الاعتماد</span>
          <select value={c.approval} onChange={(e) => setC({ ...c, approval: e.target.value })}>{Object.entries(FINAL_APPROVAL_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {c.approval !== 'expert' && <>
          <label className="field"><span>عدد أعضاء اللجنة</span><input type="number" min="2" max="9" value={c.committee_size} onChange={(e) => setC({ ...c, committee_size: e.target.value })} /></label>
          <label className="field"><span>أعضاء اللجنة بالبريد (فارغ = أي حساب إدارة)</span><textarea rows={2} value={Array.isArray(c.committee) ? c.committee.join(', ') : c.committee || ''} onChange={(e) => setC({ ...c, committee: e.target.value })} /></label>
        </>}
        <label className="field"><span>فرق تعديل الدرجة الذي يحتاج توقيعين</span><input type="number" min="1" max="100" value={c.large_adjust} onChange={(e) => setC({ ...c, large_adjust: e.target.value })} /></label>
        <label className="field"><span>هامش «قريب من الحد» بالنقاط (معلومة للخبير؛ صفر يعطّله)</span><input type="number" min="0" max="20" value={c.near_cut} onChange={(e) => setC({ ...c, near_cut: e.target.value })} /></label>
        <label className="field"><span>أرضية مكوّن المشروع (٪): دونها يُقترح «اجتاز بملاحظات» بدل «اجتاز». صفر يعطّلها، وتفعيلها قرار لجنة القياس</span><input type="number" min="0" max="100" value={c.project_floor} onChange={(e) => setC({ ...c, project_floor: e.target.value })} /></label>
        <div className="la-row"><button className="btn-sm primary" disabled={busy} onClick={save}>حفظ</button><button className="btn-sm ghost" onClick={close}>إلغاء</button></div>
      </div>
    </div>
  );
}
