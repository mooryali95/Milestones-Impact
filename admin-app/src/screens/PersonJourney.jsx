// ════════════════════════════════════════════════════════════════
// تبويب «الرحلة» في ملف المشارك (تصور 2026-11-23، اعتمده المالك)
// ════════════════════════════════════════════════════════════════
// خط واحد بترتيب رحلة المشارك نفسها: الأطوار وكتلها من journeyPhases (stage-move.js) الذي تقرؤه رحلته، فلا ترتيب
// ثانٍ. فوقه شريط بالمرحلة الحالية وخطوتها التالية ونسبتها، ومنه «نقل إلى مرحلة…» و«أكمل هذه المرحلة». المعلم في مرحلته
// شريحة بموعده، وأفعاله في قائمة «⋯» المرحلة؛ وما لا مرحلة له في «معالم عامة» آخر الخط. البند يحمل مصدر اكتماله
// (completionSource): التلقائي لا يُعتمد بزر، ويُتجاوز يدويًا بسبب مكتوب من «⋯». عرض لما يرسله admin.participant.
import React, { useMemo, useState } from 'react';
import { dateOnly, L, REQ } from '../leaders.js';
import { useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { MoreMenu } from './PersonShell.jsx';
import { ActivitySummary } from './Activities.jsx';
import { ContinuousCard, MILESTONE_CHIP, milestoneDueAr, ParticipantMilestones, useMilestoneActions } from './Milestones.jsx';
import { FinalEvalCard } from './FinalEval.jsx';
import { STAGE_STATUS_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { completionSource } from '../../../supabase/functions/leaders-api/logic.js';
import { currentStages } from '../../../supabase/functions/leaders-api/journey-map.js';
import { journeyPhases, MOVE_CHOICE_AR, MOVE_CHOICES, MOVE_REASON_MIN, moveTargets, planMove, stageMissing } from '../../../supabase/functions/leaders-api/stage-move.js';

export const OVERRIDE_AR = { open: 'فُتحت له يدويًا', complete: 'اعتُمدت يدويًا', skip: 'أُعفي منها' };
export const SOURCE_AR = { auto: 'تلقائي', evidence: 'تلقائي', manual: 'يدوي' };

// متى اكتملت المرحلة: آخر بند فيها اكتمل، إن عُرف
const doneOn = (s) => (s.items || []).map((it) => it.completed_at).filter(Boolean).sort().at(-1) || null;
function stageMeta(s) {
  if (s.status === 'done') return s.skipped ? 'أُعفي منها' : doneOn(s) ? `مكتملة في ${dateOnly(doneOn(s))}` : 'مكتملة';
  if (s.status === 'locked') return s.lock_reason || 'مقفلة';
  return s.total ? `أنجز ${s.done} من ${s.total}` : STAGE_STATUS_AR[s.status];
}

function Item({ it, s, canWrite, onReview, onEvidence }) {
  const { prompt, toast } = useUI();
  const src = completionSource(it);
  const system = src !== 'manual';
  // البند الموثق مكتمل بتجاوز يدوي: علامته «done» ودليله لم يكتمل
  // والتلقائي القابل للتجاوز (override_ok: E-PRES وR-6M) مكتمل بلا نص دليل من مصدره = اعتماد يدوي
  const overridden = (src === 'evidence' && !it.auto && it.status === 'done' && it.activity && !it.activity.done)
    || (it.override_ok && it.status === 'done' && !it.auto_note);
  const canBypass = (src === 'evidence' && !it.auto) || !!it.override_ok;
  const bypass = async () => {
    const note = await prompt(`تجاوز يدوي لـ«${it.title_ar}»: يُعدّ مكتملًا دون دليله. السبب (يُحفظ في السجل):`, '');
    if (note === null) return;
    if (String(note).trim().length < MOVE_REASON_MIN) { toast('اكتب سبب التجاوز'); return; }
    onReview(it.id, 'done', String(note).trim(), true);
  };
  const live = canWrite && s.status !== 'locked';
  return (
    <li className={`pj-item ${it.status}`} data-source={src}>
      <span className="pj-dot" aria-hidden="true">{it.status === 'done' ? '✓' : it.status === 'submitted' ? '●' : '○'}</span>
      <span className="pj-item-t">
        <span>{it.title_ar} <small className="la-muted">{REQ[it.status]}</small>{it.required === false && <small className="la-muted"> · اختياري</small>}</span>
        <span className="pj-src">
          <span className={`la-chip ${system ? 'ok' : ''}`} title={system ? 'يحسمه النظام من مصدره' : 'يعتمده فريق البرنامج'}>{overridden ? 'تجاوز يدوي' : SOURCE_AR[src]}</span>
          {system && <ActivitySummary a={it.activity} />}
          {it.auto_note && <small className="la-muted" data-auto-note>{it.auto_note}</small>}
        </span>
      </span>
      <span className="pj-act">
        {it.evidence_path && (canWrite
          ? <button className="btn-sm ghost" onClick={() => onEvidence(it.evidence_path)}>الملف</button>
          : <small className="la-muted">ملف مرفق</small>)}
        {live && !system && <>
          {it.status !== 'done' && <button className="btn-sm primary" onClick={() => onReview(it.id, 'done')}>اعتماد</button>}
          {it.status === 'submitted' && <button className="btn-sm ghost" onClick={() => onReview(it.id, 'returned')}>إرجاع</button>}
          {it.status === 'done' && <button className="btn-sm ghost" onClick={() => onReview(it.id, 'pending')}>إلغاء</button>}
        </>}
        {live && canBypass && (
          <MoreMenu label={`إجراءات «${it.title_ar}»`} items={[
            it.status !== 'done' && { label: 'تجاوز يدوي', run: bypass },
            overridden && { label: 'ألغِ التجاوز', run: () => onReview(it.id, 'pending') },
          ]} />
        )}
      </span>
    </li>
  );
}

function Stage({ s, open, onToggle, now, canWrite, milestones, ms, onStage, onComplete, onReview, onEvidence }) {
  const menu = canWrite ? [
    ...(s.override ? [{ label: 'إلغاء التدخل', run: () => onStage(s, '') }] : s.status === 'done' ? [] : [
      s.status === 'locked' && { label: 'افتحها له', run: () => onStage(s, 'open') },
      { label: 'اعتمد اكتمالها', run: () => onComplete(s) },
      { label: 'أعفه منها', run: () => onStage(s, 'skip') },
    ]),
    ...milestones.flatMap((m) => ms.items(m).map((it) => ({ ...it, label: `${it.label}: ${m.title_ar}` }))),
  ] : [];
  const body = `pj-b-${s.key}`;
  return (
    <li className={`pj-stage ${s.status}${now ? ' now' : ''}`} data-stage={s.key}>
      <div className="pj-stage-h">
        <button type="button" className="pj-toggle" aria-expanded={open} aria-controls={body} onClick={onToggle}>
          <span className="pj-node" aria-hidden="true" />
          <span className="pj-title"><b>{s.title_ar}</b><small className="la-muted">{stageMeta(s)}</small></span>
        </button>
        <span className="pj-chips">
          {now && <span className="la-chip warn">الحالية</span>}
          {s.override ? <span className="la-chip">{OVERRIDE_AR[s.override]}</span> : !now && <span className={`la-chip ${s.status === 'done' ? 'ok' : ''}`}>{STAGE_STATUS_AR[s.status]}</span>}
          {milestones.map((m) => <span key={m.id} className={`la-chip ${MILESTONE_CHIP[m.status] || ''}`} data-milestone={m.id}>{milestoneDueAr(m)}</span>)}
        </span>
        {now && canWrite && s.status !== 'done' && <button type="button" className="btn-sm primary pj-complete" onClick={() => onComplete(s)}>أكمل هذه المرحلة</button>}
        <MoreMenu label={`إجراءات مرحلة «${s.title_ar}»`} items={menu} />
      </div>
      {open && (
        <div id={body} className="pj-stage-b">
          {s.lock_reason && s.status === 'locked' && <p className="la-muted small">{s.lock_reason}</p>}
          <ul className="pj-items">{s.items?.length
            ? s.items.map((it) => <Item key={it.id} it={it} s={s} canWrite={canWrite} onReview={onReview} onEvidence={onEvidence} />)
            : <li className="la-muted">لا متطلبات</li>}</ul>
        </div>
      )}
    </li>
  );
}

// نافذة «نقل إلى مرحلة»: الهدف من قائمة مرتبة بالأطوار، ومعاينة كل مرحلة لم تكتمل قبله باختيار «اعتمد اكتمالها» أو
// «أعفه منها»، وسبب مطلوب، وسطر يلخص الخطة. الخطة نفسها (planMove) يحسبها الخادم من رحلته ثم ينفذها
export function MoveDialog({ p, journey, onClose, onMoved }) {
  const { toast } = useUI();
  const cur = currentStages(journey).stage;
  const [target, setTarget] = useState('');
  const [choices, setChoices] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useGuardedClose(!!(target || reason), onClose);
  useEscape(close);
  const groups = useMemo(() => journeyPhases(moveTargets(journey)).phases, [journey]);
  const plan = target ? planMove(journey, target, choices) : null;
  const ready = plan?.ok && reason.trim().length >= MOVE_REASON_MIN;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    const r = await L('admin.stage-move', { participant_id: p.id, stage_key: target, choices, reason: reason.trim() });
    setBusy(false);
    if (!r.success) { setError(r.message || 'تعذّر النقل'); return; }
    toast(`نُقل إلى «${plan.target.title_ar}»`);
    onMoved();
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="la-form mi-form pj-move" role="dialog" aria-modal="true" aria-labelledby="pj-move-h" onSubmit={submit}>
        <h3 id="pj-move-h">نقل {p.full_name} إلى مرحلة</h3>
        <label htmlFor="pj-move-to">المرحلة</label>
        <select id="pj-move-to" value={target} onChange={(e) => { setTarget(e.target.value); setChoices({}); setError(''); }}>
          <option value="">اختر المرحلة…</option>
          {groups.map((g) => (
            <optgroup key={g.key} label={g.title}>
              {g.units.flat().map((s) => <option key={s.key} value={s.key} disabled={s.key === cur?.key}>{s.title_ar}{s.key === cur?.key ? ' (الحالية)' : s.status === 'done' ? ' (مكتملة)' : ''}</option>)}
            </optgroup>
          ))}
        </select>
        {!target && <p className="pj-move-hint la-muted" data-testid="move-hint">اختر المرحلة لترى ما ينقص قبلها. للأمام: تختار لكل مرحلة ناقصة «اعتمد اكتمالها» أو «أعفه منها». للخلف: تُعاد فتح المرحلة وما بعدها، ولا يُحذف شيء مما أنجزه.</p>}
        {plan && !plan.ok && <p className="la-err" role="alert">{plan.error}</p>}
        {plan?.ok && plan.direction === 'forward' && (
          <div className="pj-plan" data-testid="move-plan">
            {plan.writes.filter((w) => w.action !== 'open').length > 0
              ? <p className="la-muted small">ما لم يكتمل قبلها. اختر لكل مرحلة:</p>
              : <p className="la-muted small">لا مرحلة ناقصة قبلها.</p>}
            <ul>{plan.writes.filter((w) => w.action !== 'open').map((w) => (
              <li key={w.key}>
                <b>{w.title}</b>
                <span className="pj-seg" role="radiogroup" aria-label={`ماذا يُفعل بـ«${w.title}»`}>
                  {MOVE_CHOICES.map((c) => (
                    <label key={c} className={w.action === c ? 'on' : ''}>
                      <input type="radio" name={`mv-${w.key}`} value={c} checked={w.action === c} onChange={() => setChoices({ ...choices, [w.key]: c })} />
                      {MOVE_CHOICE_AR[c]}
                    </label>
                  ))}
                </span>
              </li>
            ))}</ul>
            {plan.writes.some((w) => w.action === 'open') && <p className="la-muted small">و«{plan.target.title_ar}» مقفلة بقواعد البرنامج، فتُفتح له.</p>}
          </div>
        )}
        {plan?.ok && plan.direction === 'backward' && (
          <div className="pj-plan" data-testid="move-plan">
            <p className="small">النقل إلى مرحلة سابقة يعيد فتحها: تُلغى التدخلات اليدوية فيها وفيما بعدها فتعود لقواعد البرنامج، وتُفتح له «{plan.target.title_ar}». لا يُمحى أي بند أنجزه.</p>
            {plan.clears.length > 0 && <ul>{plan.clears.map((c) => <li key={c.key}><b>{c.title}</b> <small className="la-muted">يُلغى «{OVERRIDE_AR[c.was]}»</small></li>)}</ul>}
            {plan.keepsDone.length > 0 && <p className="la-chip warn">«{plan.keepsDone[0]}» مكتملة ببنودها فتبقى مكتملة. لإعادتها أرجع بندًا منها.</p>}
          </div>
        )}
        <label htmlFor="pj-move-why">السبب (يُحفظ في السجل، ولا يصل المشارك)</label>
        <textarea id="pj-move-why" rows={2} required minLength={MOVE_REASON_MIN} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        {plan?.ok && <p className="pj-sum" role="status">{plan.summary}. يصله بريد يسمي مرحلته الجديدة.</p>}
        {error && <p className="la-err" role="alert">{error}</p>}
        <div className="la-row">
          <button className="btn-sm primary" disabled={!ready || busy}>{busy ? 'لحظة…' : 'انقله'}</button>
          <button type="button" className="btn-sm ghost" onClick={close}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

export default function PersonJourney({ r, canWrite, onDone, onReview, onStage, onEvidence }) {
  const p = r.participant;
  const journey = r.journey || [];
  const cur = currentStages(journey);
  const nowKeys = new Set(cur.stages.map((s) => s.key));
  const { phases, services } = useMemo(() => journeyPhases(journey), [journey]);
  const [opened, setOpened] = useState(() => new Set(cur.stages.map((s) => s.key)));
  const [moving, setMoving] = useState(false);
  const ms = useMilestoneActions(p, onDone);
  const milestones = r.milestones || [];
  const keys = new Set(journey.map((s) => s.key));
  const msOf = (k) => milestones.filter((m) => m.stage_key === k);
  const general = milestones.filter((m) => !m.stage_key || !keys.has(m.stage_key));
  const toggle = (k) => { const n = new Set(opened); if (n.has(k)) n.delete(k); else n.add(k); setOpened(n); };
  const next = cur.stage ? stageMissing(cur.stage)[0] : null;
  const complete = (s) => onStage(s, 'complete', stageMissing(s).map((it) => `ينقصه: ${it.title_ar}`));
  const stage = (s) => (
    <Stage key={s.key} s={s} open={opened.has(s.key)} onToggle={() => toggle(s.key)} now={nowKeys.has(s.key)} canWrite={canWrite}
      milestones={msOf(s.key)} ms={ms} onStage={onStage} onComplete={complete} onReview={onReview} onEvidence={onEvidence} />
  );
  const unit = (g) => (g.length > 1 || g[0].lane === 'track'
    ? <li key={`u-${g[0].key}`} className="pj-unit"><span className="pj-badge">{g[0].lane === 'track' ? 'مسار مستمر' : 'تسير معًا'}</span><ol className="pj-line">{g.map(stage)}</ol></li>
    : stage(g[0]));
  return (
    <>
      <section className="la-card pj-head" aria-labelledby="pf-journey-h">
        <div className="pj-head-t">
          <h3 id="pf-journey-h">الرحلة</h3>
          <p>{cur.stage ? <>المرحلة الحالية: <b>{cur.stages.map((s) => s.title_ar).join(' و')}</b></> : journey.length ? <b>أنهى الرحلة</b> : 'لا رحلة بعد'}</p>
          {next && <p className="la-muted small">الخطوة التالية: {next.title_ar}</p>}
        </div>
        <div className="pj-head-n">
          <span className="pj-pct" role="progressbar" aria-label="تقدمه في الرحلة" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.progress || 0}><i style={{ inlineSize: `${r.progress || 0}%` }} /></span>
          <b>{r.progress || 0}%</b>
        </div>
        {canWrite && journey.length > 0 && (
          <div className="pj-head-a">
            <button type="button" className="btn-sm primary" onClick={() => setMoving(true)}>نقل إلى مرحلة…</button>
            {cur.stage && cur.stage.status !== 'done' && <button type="button" className="btn-sm ghost" onClick={() => complete(cur.stage)}>أكمل هذه المرحلة</button>}
          </div>
        )}
      </section>

      {phases.map((ph, i) => {
        const counted = ph.stages;
        return (
          <section key={ph.key} className="la-card pj-phase" aria-labelledby={`pj-ph-${ph.key}`} data-phase={ph.key}>
            <div className="la-row between"><h3 id={`pj-ph-${ph.key}`}><span className="pj-no">{i + 1}</span> {ph.title}</h3>
              <span className="la-muted small">{counted.filter((s) => s.status === 'done').length} من {counted.length}</span></div>
            <ol className="pj-line">{ph.units.map(unit)}</ol>
          </section>
        );
      })}
      {services.length > 0 && (
        <section className="la-card pj-phase" aria-labelledby="pj-svc-h">
          <div className="la-row between"><h3 id="pj-svc-h">خدمات متاحة له</h3><span className="la-muted small">لا تُحسب في تقدمه</span></div>
          <ol className="pj-line">{services.map(stage)}</ol>
        </section>
      )}

      {general.length > 0 && <ParticipantMilestones p={p} list={general} title="معالم عامة" summary={null} canWrite={canWrite} onDone={onDone} />}
      <ContinuousCard c={r.continuous} />
      <FinalEvalCard participantId={p.id} canWrite={canWrite} />
      {ms.form}
      {moving && <MoveDialog p={p} journey={journey} onClose={() => setMoving(false)} onMoved={() => { setMoving(false); onDone(); }} />}
    </>
  );
}
