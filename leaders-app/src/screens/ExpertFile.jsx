// ════════════════════════════════════════════════════════════════
// ملف المشارك للخبير (المرحلة 9): صفحة واحدة تُقرأ في دقيقة
// ════════════════════════════════════════════════════════════════
// من هو (المستوى والمسار)، أين هو (المرحلة والمعالم والتأخر)، ما حدث (الجلسات والطلبات والتسليمات)،
// التقييم المستمر واتجاهه، إجابات زملائه بانتظار تأكيده، والتقييم الختامي، وسطر «المطلوب منك الآن».
// المصدر الواحد: xp.participant يبني من ملف الإدارة نفسه ويقصّه. مستشار الدفعة يعتمد الختامي ويقيّم
// المعالم ويؤكّد إجابات الأقران؛ المسند إليه بطلب خدمة يقرأ فقط.
import React, { useCallback, useEffect, useState } from 'react';
import { EFFORT_AR } from '../../../supabase/functions/leaders-api/answer-review.js';
import { xpCall } from '../api.js';
import ExpertAnswers from './ExpertAnswers.jsx';
import { ErrorBox, Notice, useNotice } from '../ui.jsx';
import { DIM_AR, LEVEL_AR, MILESTONE_RUBRIC, RUBRIC_LEVEL_AR, rubricLevelAr, STAGE_STATUS_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { FINAL_APPROVAL_AR, FINAL_DECISION_AR, FINAL_STATUS_AR, finalApproveConfirm, MILESTONE_STATUS_AR, NOTES_REQUIRED, SUPERVISION_AR } from '../../../supabase/functions/leaders-api/logic.js';

const MS_CHIP = { done: 'ok', late: 'bad', due_soon: 'gold', on_time: '', unscheduled: '' };
const DEC_CHIP = { pass: 'ok', pass_notes: 'ok', extend: 'warn', fail: 'bad' };
const day = (d) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: d.length === 10 ? 'UTC' : undefined }) : '');
const when = (d) => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const SESSION_AR = { booked: 'محجوزة', requested: 'اتصال فوري', attended: 'انعقدت', no_show: 'لم يحضر', cancelled: 'أُلغيت' };

// اعتماد المعلم وتقييمه بالمعيار الوصفي (المعيار نفسه في اللوحة)
function RubricForm({ m, onSave, onClose }) {
  const [v, setV] = useState(Object.fromEntries(Object.entries(m.scores || {}).map(([k, x]) => [k, String(x)])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await onSave({ scores: Object.fromEntries(Object.entries(v).filter(([, x]) => x)), note, ...(m.done ? {} : { done: true }) });
    setBusy(false);
  };
  return (
    <div className="stack xf-rubric" style={{ gap: 8 }}>
      {Object.entries(MILESTONE_RUBRIC).map(([k, r]) => (
        <label key={k} className="field"><span>{r.title}</span>
          <select className="input" value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })}>
            <option value="">بلا تقييم</option>
            {r.levels.map((t, i) => <option key={i} value={String(i + 1)}>{i + 1}. {RUBRIC_LEVEL_AR[i + 1]}: {t}</option>)}
          </select></label>
      ))}
      <label className="field"><span>ملاحظة للسجل</span><textarea className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="row"><button className="btn sm" disabled={busy} onClick={save}>{m.done ? 'احفظ التقييم' : 'اعتمد الإنجاز'}</button><button className="link small" onClick={onClose}>إلغاء</button></div>
    </div>
  );
}

// التقييم الختامي من البوابة: تعديل بتعليل، رفع للاعتماد، واعتماد أو إعادة (الخادم يطبّق قواعد اللجنة والتوقيعين)
function FinalEval({ pid, f, advisor, reload }) {
  const [adj, setAdj] = useState(f?.record?.adjust || { components: {} });
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState('');
  // رفض الخادم (تعليل ناقص، ملاحظات إلزامية) يُعرض خطأً تحت أزرار القسم، لا نجاحًا في رأس الصفحة
  const [note, say] = useNotice();
  useEffect(() => { setAdj(f?.record?.adjust || { components: {} }); }, [f?.record?.updated_at, f?.record?.status]);
  if (!f?.live) return null;
  const live = f.live, rec = f.record, status = rec?.status || 'draft';
  if (!advisor) return <section className="card stack" aria-label="التقييم الختامي"><h3>التقييم الختامي</h3><p className="muted small">{FINAL_STATUS_AR[status]}{live.score != null ? ` · ${live.score}٪` : ''}{live.decision ? ` · ${FINAL_DECISION_AR[live.decision]}` : ''}. يعتمده مستشار الدفعة.</p></section>;
  const locked = status === 'approved' || status === 'pending';
  const setComp = (k, field, val) => setAdj({ ...adj, components: { ...adj.components, [k]: { ...(adj.components?.[k] || {}), [field]: val } } });
  const clearComp = (k) => { const c = { ...adj.components }; delete c[k]; setAdj({ ...adj, components: c }); };
  const run = async (action, body, ok) => {
    setBusy(true);
    const r = await xpCall(action, { participant_id: pid, ...body });
    setBusy(false);
    if (!r.success) return say(r.message, true);
    say(ok); reload();
  };
  const effective = adj.decision?.value || live.suggested;
  const notesRequired = NOTES_REQUIRED.includes(effective);
  return (
    <section className="card stack" aria-label="التقييم الختامي">
      <div className="row between">
        <h3>التقييم الختامي <small className="muted">· {f.program?.name}</small></h3>
        <span className="row"><span className={`chip ${status === 'approved' ? 'ok' : status === 'pending' ? 'warn' : status === 'returned' ? 'bad' : ''}`}>{FINAL_STATUS_AR[status]}</span>
          <b className="kt-big">{live.score != null ? `${live.score}٪` : '—'}</b>
          {live.decision && <span className={`chip ${DEC_CHIP[live.decision]}`}>{FINAL_DECISION_AR[live.decision]}</span>}
          {live.large_adjust && <span className="chip warn">تعديل كبير: توقيعان</span>}
          {live.near_cut && <span className="chip warn" title={`الدرجة على بعد ${live.near_cut.gap} من حد «${FINAL_DECISION_AR[live.near_cut.key]}» (${live.near_cut.cut}). الفرق داخل هامش الخطأ، فراجع الأدلة قبل القرار`}>قريب من الحد</span>}</span>
      </div>
      <p className="small muted">الدرجة الآلية {live.auto_score != null ? `${live.auto_score}٪` : '—'} من مكوّنات تغطي {live.coverage}٪ من الأوزان{live.missing?.length ? ` (لم يكتمل: ${live.missing.join('، ')})` : ''}{live.score_adjusted && live.score != null ? `، وبعد تعديل الخبير ${live.score}٪` : ''}. القرار المقترح: <b>{live.suggested ? FINAL_DECISION_AR[live.suggested] : 'لا يُقترح قبل اكتمال التغطية'}</b>.{f.frozen ? ` لقطة الرفع بإصدار المعادلة ${live.config_version}.` : ''}</p>
      <ul className="ca-list">{live.components.map((c) => {
        const a = adj.components?.[c.key];
        return (
          <li key={c.key}><span>{c.label} <small className="muted">· وزن {c.weight}</small></span>
            <small className="muted">الآلي {c.auto != null ? `${c.auto}٪` : '—'} · {c.reason}{c.adjusted ? ` · عُدّل إلى ${c.value}٪ («${c.adjust_reason}»)` : ''}</small>
            {!locked && <span className="row xf-adj">
              <input className="input" type="number" min="0" max="100" aria-label={`قيمة معدلة لـ${c.label}`} value={a?.value ?? ''} placeholder="بلا تعديل" onChange={(e) => (e.target.value === '' ? clearComp(c.key) : setComp(c.key, 'value', e.target.value))} />
              {a?.value !== undefined && <input className="input" aria-label={`تعليل تعديل ${c.label}`} value={a?.reason || ''} placeholder="لماذا؟ (إلزامي)" onChange={(e) => setComp(c.key, 'reason', e.target.value)} />}
            </span>}
          </li>
        );
      })}</ul>
      {!locked && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="field"><span>القرار</span>
            <select className="input" value={adj.decision?.value || ''} onChange={(e) => setAdj({ ...adj, decision: e.target.value ? { ...(adj.decision || {}), value: e.target.value } : undefined })}>
              <option value="">المقترح ({live.suggested ? FINAL_DECISION_AR[live.suggested] : '—'})</option>
              {Object.entries(FINAL_DECISION_AR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select></label>
          {adj.decision && <label className="field"><span>تعليل القرار{adj.decision.value !== live.suggested ? ' (إلزامي: يخالف المقترح)' : ''}</span><input className="input" value={adj.decision.reason || ''} onChange={(e) => setAdj({ ...adj, decision: { ...adj.decision, reason: e.target.value } })} /></label>}
          <label className="field"><span>ملاحظات تصل المشارك{notesRequired ? ' (إلزامية لهذا القرار: ما الذي ينقصه وكيف يستكمله)' : ' (اختيارية)'}</span>
            <textarea className="input" rows={2} maxLength={2000} value={adj.notes_to_participant || ''} onChange={(e) => setAdj({ ...adj, notes_to_participant: e.target.value })} /></label>
        </div>
      )}
      {locked && live.notes_to_participant && <p className="small muted">ملاحظات للمشارك: «{live.notes_to_participant}»</p>}
      <div className="row">
        {(status === 'draft' || status === 'returned') && <>
          <button className="btn ghost sm" disabled={busy} onClick={() => run('xp.final-eval-save', { adjust: adj }, 'حُفظت المسودة')}>حفظ مسودة</button>
          <button className="btn sm" disabled={busy} onClick={() => run('xp.final-eval-save', { adjust: adj, submit: true }, 'رُفع للاعتماد')}>ارفع للاعتماد</button>
        </>}
        {status === 'pending' && <>
          <button className="btn sm" disabled={busy || !!f.vote_block} title={f.vote_block || ''} onClick={() => { if (window.confirm(finalApproveConfirm(live, f.approval))) run('xp.final-eval-vote', { vote: 'approve' }, 'سُجل اعتمادك'); }}>اعتمد</button>
          <input className="input" aria-label="سبب الإعادة" placeholder="سبب الإعادة (يصل لمن رفعه)" value={ret} onChange={(e) => setRet(e.target.value)} />
          <button className="btn ghost sm" disabled={busy || !!f.vote_block || ret.trim().length < 10} onClick={() => run('xp.final-eval-vote', { vote: 'return', note: ret }, 'أُعيد للمراجعة')}>أعِد للمراجعة</button>
          <small className="muted">{FINAL_APPROVAL_AR[live.config?.approval]}: {f.approval?.yes} من {f.approval?.need}{f.vote_block ? ` · ${f.vote_block}` : ''}</small>
        </>}
      </div>
      <Notice note={note} onClose={() => say(null)} reveal />
      {(rec?.votes || []).length > 0 && <ul className="small muted">{rec.votes.map((v) => <li key={v.by}>{v.vote === 'approve' ? '✓ اعتمد' : '↩ أعاد'} · {v.by} · {when(v.at)}{v.note ? ` · «${v.note}»` : ''}</li>)}</ul>}
    </section>
  );
}

// إجابات الزملاء عن طلبات هذا المشارك بانتظار التأكيد، وطلباته
function PeerPending({ peer, advisor, reload }) {
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, say] = useNotice();
  const review = async (a, status) => {
    setBusy(true);
    const r = await xpCall('xp.peer-review', { answer_id: a.id, status, note: note[a.id] || '' });
    setBusy(false);
    if (!r.success) return say(r.message, true);
    say(status === 'confirmed' ? 'أُكّدت الإجابة.' : status === 'corrected' ? 'صُحّحت الإجابة بملاحظتك.' : 'أُخفيت الإجابة.'); reload();
  };
  if (!peer?.requests?.length) return null;
  return (
    <section className="card stack" aria-label="طلبات التوجيه">
      <h3>طلبات توجيهه <small className="muted">· {peer.requests.length}</small>{peer.pending_answers.length > 0 && <span className="chip warn"> {peer.pending_answers.length} إجابة بانتظار تأكيدك</span>}</h3>
      <Notice note={result} onClose={() => say(null)} reveal />
      <ul className="xf-peer">{peer.requests.map((r) => (
        <li key={r.id}><div><b>{r.source_ar}</b> ← {r.target_team_ar} · «{r.text}» <span className={`chip ${r.status === 'confirmed' ? 'ok' : r.status === 'answered' ? 'warn' : ''}`}>{r.status_ar}</span></div>
          {r.answers.map((a) => (
            <div key={a.id} className="xf-answer"><span><b>{a.author}</b>: «{a.text}» <small className="muted">{a.status_ar}{a.expert_note ? ` · ملاحظتك: ${a.expert_note}` : ''}</small></span>
              {advisor && a.status === 'pending' && (
                <span className="row">
                  <input className="input" aria-label="ملاحظة التصحيح" placeholder="ملاحظة (إلزامية للتصحيح)" value={note[a.id] || ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} />
                  <button className="btn sm" disabled={busy} onClick={() => review(a, 'confirmed')}>أكّد</button>
                  <button className="btn ghost sm" disabled={busy || (note[a.id] || '').trim().length < 10} onClick={() => review(a, 'corrected')}>صحّح</button>
                  <button className="link small" disabled={busy} onClick={() => review(a, 'hidden')}>أخفِ</button>
                </span>
              )}
            </div>
          ))}
        </li>
      ))}</ul>
    </section>
  );
}

export default function ExpertFile({ id, onBack }) {
  const [d, setD] = useState(null);
  const [msNote, sayMs] = useNotice();
  const [rub, setRub] = useState(null);
  const [answers, setAnswers] = useState(false);
  const load = useCallback(() => xpCall('xp.participant', { id }).then(setD), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="center-load"><div className="spinner" aria-label="جارٍ التحميل" /></div>;
  if (!d.success) return <div className="page narrow"><ErrorBox message={d.message} onRetry={load} /><button className="link small" onClick={onBack}>→ مشاركوك</button></div>;
  const p = d.participant, advisor = d.scope === 'advisor';
  const current = d.journey.find((s) => s.status === 'active');
  const c = d.continuous;
  const rateMilestone = async (m, body) => {
    const r = await xpCall('xp.milestone', { participant_id: p.id, milestone_id: m.id, ...body });
    sayMs(r.success ? 'حُفظ' : r.message, !r.success);
    if (r.success) { setRub(null); load(); }
  };
  return (
    <div className="page wide stack xf">
      <button className="link small" onClick={onBack}>→ مشاركوك</button>
      <section className="card stack">
        <div className="row between">
          <div><p className="eyebrow">ملف المشارك</p><h1>{p.full_name}</h1>
            <p className="muted small">{[p.job_title, p.organization_name, d.cohort?.name ? `دفعة ${d.cohort.name}` : null, d.team_ar, d.cohort?.content_release ? `إصدار المحتوى ${d.cohort.content_release}` : null].filter(Boolean).join(' · ')}</p>
            <p className="small ltr">{p.email}{p.phone ? ` · ${p.phone}` : ''}</p></div>
          <span className="chip gold">{advisor ? 'أنت مستشار دفعته' : 'مسند إليك بطلب خدمة'}</span>
        </div>
        <div className="xf-needs" aria-label="المطلوب منك الآن">
          <b>المطلوب منك الآن</b>
          {d.needs.length ? <ul>{d.needs.map((n) => <li key={n.key}>{n.text}</li>)}</ul> : <p className="muted small">لا شيء ينتظرك الآن.</p>}
        </div>
      </section>

      <div className="xpp-cols">
        <section className="card stack" aria-label="من هو">
          <h3>من هو</h3>
          {d.profile ? (
            <>
              <ul className="ca-list">{(d.profile.dimensions || []).map((x) => (
                <li key={x.dimension}><span>{DIM_AR[x.dimension]} · <b>{LEVEL_AR[x.level]}</b>{x.approved ? '' : ' (مبدئي)'}</span>{x.path && <small className="muted">{x.path}</small>}</li>
              ))}</ul>
              {d.profile.track?.title && <p className="small">المسار: <b>{d.profile.track.title}</b></p>}
            </>
          ) : <p className="muted small">{d.onboarding?.remaining ? `${d.onboarding.label}: ${d.onboarding.remaining}.` : 'لم يُتم القياس المبدئي بعد.'}</p>}
          {d.effort?.level && d.effort.level !== 'ok' && <p className="alert info small" role="note"><b>{EFFORT_AR[d.effort.level]}:</b> {d.effort.note}</p>}
          {/* إجابات القياس لمستشار الدفعة وحده (قرار المالك 2026-11-11)، ويُسجَّل كل اطلاع */}
          {advisor && d.assessments?.length > 0 && <button type="button" className="link small" onClick={() => setAnswers(true)}>إجابات القياس</button>}
          {p.bio && <p className="small muted">{p.bio}</p>}
          <p className="small muted">{[p.sector, p.years_experience != null ? `${p.years_experience} سنة خبرة` : null].filter(Boolean).join(' · ')}</p>
        </section>

        <section className="card stack" aria-label="أين هو">
          <h3>أين هو</h3>
          <p className="small">التقدم <b>{d.progress}٪</b>{current ? <> · المرحلة الحالية: <b>{current.title_ar}</b></> : ''}</p>
          <ul className="ca-list xf-journey">{d.journey.map((s) => <li key={s.key}><span>{s.title_ar}</span><small className="muted">{STAGE_STATUS_AR[s.status]}{s.total ? ` · ${s.done}/${s.total}` : ''}</small></li>)}</ul>
          {d.milestones?.length > 0 && (
            <>
              <p className="small muted">المعالم: {d.milestone_summary.done}/{d.milestone_summary.total} منجز{d.milestone_summary.late ? ` · ${d.milestone_summary.late} متأخر (أقصاه ${d.milestone_summary.max_late} يومًا)` : ''}</p>
              <Notice note={msNote} onClose={() => sayMs(null)} reveal />
              <ol className="ms-list">{d.milestones.map((m) => (
                <li key={m.id} className={m.status}>
                  <div className="grow"><b>{m.title_ar}</b>{Object.keys(m.scores || {}).length > 0 && <small className="muted"> · {Object.entries(m.scores).map(([k, v]) => `${MILESTONE_RUBRIC[k]?.title} ${v}/4`).join('، ')}</small>}
                    {advisor && rub === m.id && <RubricForm m={m} onSave={(body) => rateMilestone(m, body)} onClose={() => setRub(null)} />}</div>
                  <div className="ms-when">{m.due && <small className="muted">{day(m.due)}</small>}<span className={`chip ${MS_CHIP[m.status]}`}>{MILESTONE_STATUS_AR[m.status]}{m.status === 'late' ? ` ${m.late_days} يومًا` : ''}</span>
                    {advisor && rub !== m.id && <button className="link small" onClick={() => setRub(m.id)}>{m.done ? (Object.keys(m.scores || {}).length ? 'عدّل التقييم' : 'قيّم بالمعيار') : 'اعتمد الإنجاز'}</button>}</div>
                </li>
              ))}</ol>
            </>
          )}
        </section>
      </div>

      <section className="card stack" aria-label="ما حدث">
        <h3>ما حدث</h3>
        <div className="xpp-cols">
          <div><b className="small">الجلسات</b>{d.sessions.length ? <ul className="small muted">{d.sessions.slice(0, 8).map((s) => <li key={s.id}>{when(s.starts_at)} · {SESSION_AR[s.status] || s.status}{s.expert ? ` · ${s.expert}` : ''}</li>)}</ul> : <p className="muted small">لا جلسات.</p>}</div>
          <div><b className="small">طلبات الخبراء</b>{d.expert_requests.length ? <ul className="small muted">{d.expert_requests.slice(0, 8).map((r) => <li key={r.id}>{r.role_ar}{r.expert ? ` · ${r.expert}` : ''} · {r.status_ar}</li>)}</ul> : <p className="muted small">لا طلبات.</p>}</div>
          <div><b className="small">النماذج المسلّمة</b>{d.models.length ? <ul className="small muted">{d.models.slice(0, 8).map((m) => <li key={m.id}>{m.title} · {m.status_ar}{m.rating ? ` (${rubricLevelAr(m.rating)})` : ''}</li>)}</ul> : <p className="muted small">لا تسليمات.</p>}</div>
        </div>
      </section>

      {c && (
        <section className="card stack" aria-label="التقييم المستمر">
          <div className="row between"><h3>التقييم المستمر</h3><b className="ca-index">{c.index != null ? `${c.index}٪` : '—'}</b></div>
          {c.trend && <p className="small muted">{c.trend.dir === 'up' ? '↑ يتحسن' : c.trend.dir === 'down' ? '↓ يتراجع' : '→ مستقر'} ({c.trend.delta > 0 ? '+' : ''}{c.trend.delta})</p>}
          <ul className="ca-list">{c.components.map((x) => <li key={x.key}><span>{x.label}</span><small className="muted">{x.value != null ? `${x.value}٪ · ${x.reason}` : x.reason}</small></li>)}
            {c.engagement?.value != null && <li><span>{c.engagement.label}</span><small className="muted">{c.engagement.value}٪ · لا يدخل المؤشر</small></li>}</ul>
          {c.flags?.length > 0 && <p className="small">{c.flags.join(' · ')}</p>}
        </section>
      )}

      <PeerPending peer={d.peer} advisor={advisor} reload={load} />
      <FinalEval pid={p.id} f={d.final} advisor={advisor} reload={load} />
      {answers && advisor && <ExpertAnswers participant={p} onClose={() => setAnswers(false)} />}
    </div>
  );
}
