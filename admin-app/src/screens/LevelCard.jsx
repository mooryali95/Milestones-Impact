// ════════════════════════════════════════════════════════════════
// بطاقة «المستوى في الأبعاد الثلاثة» في ملف المشارك: ملخص أولًا ثم التفاصيل عند الحاجة
// ════════════════════════════════════════════════════════════════
// كانت جدولًا من سبعة أعمدة يكدّس في خلية «المؤشر» الرقم و«حدّية» والأعلام والسبب و«يفصله سؤالان»
// بالأولوية نفسها. صار لكل بُعد صف ملخص (المستوى ورمز حالته، ومقياس المؤشر بحدود المستويات، وثلاثة أشرطة
// صغيرة للجوانب)، وتفاصيل مطوية تُفتح تلقائيًا للحدّي والمعلَّم والمخالف. المنطق كما هو: الاعتماد والتعليل
// في Participants.jsx، والحالة من placement-card.js. (تصور بطاقة المستوى، المرحلة 1، قرار المالك 2026-11-11)
import React, { useState } from 'react';
import { EFFORT_AR } from '../../../supabase/functions/leaders-api/answer-review.js';
import { DIM, DIM_EN, DIMS, LVL, date } from '../leaders.js';
import { compositeScale, rowState } from '../placement-card.js';

// عدد الأسئلة بصيغة عربية سليمة: سؤال واحد، سؤالان، 3–10 أسئلة، 11+ سؤالًا
const questionsAr = (n) => (n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالان' : n <= 10 ? `${n} أسئلة` : `${n} سؤالًا`);
const pct = (v) => (v == null ? 'لا قياس' : `${Math.round(v)}%`);
const TIER_BARS = [['behavior', 'ممارسة', 'م'], ['skill', 'مواقف', 'ق'], ['knowledge', 'معرفة', 'ع']];

// مقياس المؤشر 0–100: علامتا حد المتوسط والاحترافي، ومنطقة الحدّية قبل كل حد مظللة
function CompositeBar({ value, scale }) {
  if (value == null) return <span className="la-muted lc-novalue">لا مؤشر</span>;
  const v = Math.max(0, Math.min(100, Number(value)));
  const label = `المؤشر ${value} من 100. حد ${LVL.intermediate} ${scale.marks[0].at}، وحد ${LVL.advanced} ${scale.marks[1].at}`;
  return (
    <span className="lc-comp">
      <span className="lc-bar" role="img" aria-label={label} title={label}>
        {scale.zones.map((z) => <i key={z.key} className="lc-zone" style={{ insetInlineStart: `${z.from}%`, width: `${z.to - z.from}%` }} />)}
        <i className="lc-fill" style={{ width: `${v}%` }} />
        {scale.marks.map((m) => <i key={m.key} className="lc-mark" style={{ insetInlineStart: `${m.at}%` }} />)}
      </span>
      <b className="lc-num">{value}</b>
    </span>
  );
}

function TierBars({ rr }) {
  return (
    <span className="lc-tiers">
      {TIER_BARS.map(([t, name, short]) => {
        const v = rr?.[`${t}_pct`];
        return (
          <span key={t} className="lc-tier" title={`${name} ${pct(v)}`}>
            <span className="lc-tier-k" aria-hidden="true">{short}</span>
            <span className="lc-spark" role="img" aria-label={`${name} ${pct(v)}`}><i style={{ height: `${v == null ? 0 : Math.max(4, Math.min(100, v))}%` }} /></span>
          </span>
        );
      })}
    </span>
  );
}

// شريحة المستوى ورمز حالته: ✓ معتمد، ◐ مبدئي، ⚠ مع عدد ما يستحق الانتباه
function LevelChip({ level, approved, attention }) {
  if (!level) return <span className="la-muted">لم يُحدَّد</span>;
  return (
    <span className="lc-level">
      <span className={`la-lvl ${level}${approved ? '' : ' tentative'}`}>{LVL[level]}</span>
      <span className="lc-state" title={approved ? 'معتمد' : 'مبدئي'} aria-label={approved ? 'معتمد' : 'مبدئي'}>{approved ? '✓' : '◐'}</span>
      {attention > 0 && <span className="lc-warn" title="حالة تستحق المراجعة" aria-label={`${attention} تستحق المراجعة`}>⚠{attention}</span>}
    </span>
  );
}

export default function LevelCard({ prof, latest, model, effort, canWrite, levels, setLevels, notes, setNotes, currentLevel, blocker, onApprove, onAnswers }) {
  const scale = compositeScale(model);
  const res = (d) => latest?.assessment_results?.find((x) => x.dimension === d);
  const stateOf = (d) => rowState({ ev: res(d)?.evaluation, current: currentLevel(d), chosen: levels[d], note: notes[d], canWrite });
  // يُفتح الصف تلقائيًا إن كان حدّيًا أو معلَّمًا أو مخالفًا؛ وما فتحه المدير أو طواه يبقى كما تركه
  const [manual, setManual] = useState({});
  const [noteOpen, setNoteOpen] = useState({});
  const [more, setMore] = useState(false);
  const isOpen = (d) => manual[d] ?? stateOf(d).open;
  const toggle = (d) => setManual({ ...manual, [d]: !isOpen(d) });

  return (
    <section className="la-card lc" aria-labelledby="lc-title">
      <div className="la-row between">
        <h3 id="lc-title">المستوى في الأبعاد الثلاثة</h3>
        {prof && (prof.approved ? <span className="la-chip ok">معتمد</span> : <span className="la-chip warn">مبدئي، بانتظارك</span>)}
      </div>
      {/* مؤشر الجهد (answer-review.js، استشاري): يظهر قبل الاعتماد حين تدل الأزمنة على استعجال، ولا يغيّر الدرجة */}
      {effort?.level && effort.level !== 'ok' && (
        <p className={`lc-effort ${effort.level}`} role="note"><b>{EFFORT_AR[effort.level]}:</b> {effort.note}</p>
      )}
      {!prof && !latest && <p className="la-muted">لم يُكمل القياس بعد. يمكنك تحديد مستواه يدويًا واعتماده.</p>}
      {prof?.track && (
        <div className="la-track-now lc-track">
          <div className="la-row between">
            <span><code className="la-code">{prof.track.key}</code> <b>{prof.track.title || 'مسار بلا عنوان'}</b></span>
            {(prof.track.summary || prof.track.strengths || prof.track.track_title) && (
              <button type="button" className="la-link" aria-expanded={more} aria-controls="lc-track-more" onClick={() => setMore(!more)}>{more ? 'أقل' : 'المزيد'}</button>
            )}
          </div>
          {more && (
            <div id="lc-track-more">
              {prof.track.track_title && prof.track.track_title !== prof.track.title && <p className="la-muted">{prof.track.track_title}</p>}
              {prof.track.summary && <p className="la-muted">{prof.track.summary}</p>}
              {prof.track.strengths && <p className="la-muted">{prof.track.strengths}</p>}
              <small className="la-muted">يتحدث المسار تلقائيًا إن غيّرت مستوى أي إطار ثم اعتمدت.</small>
            </div>
          )}
        </div>
      )}

      <div className="lc-head" aria-hidden="true"><span>البُعد</span><span>المستوى</span><span>المؤشر</span><span>الجوانب</span></div>
      <ul className="lc-rows">
        {DIMS.map((d) => {
          const rr = res(d);
          const ev = rr?.evaluation;
          const x = prof?.dimensions?.find((y) => y.dimension === d);
          const st = stateOf(d);
          const open = isOpen(d);
          const shown = levels[d] || x?.level || ev?.level || '';
          const showNote = st.override || noteOpen[d] || !!(notes[d] || '').trim();
          return (
            <li key={d} className={`lc-row${open ? ' open' : ''}${st.attention ? ' attn' : ''}`}>
              <button type="button" className="lc-sum" aria-expanded={open} aria-controls={`lc-det-${d}`} onClick={() => toggle(d)}
                aria-label={`${DIM_EN[d]}، ${DIM[d]}: ${LVL[shown] || 'لم يُحدَّد'}${x?.approved ? '، معتمد' : '، مبدئي'}${st.attention ? `، ${st.attention} تستحق المراجعة` : ''}`}>
                <span className="lc-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                <span className="lc-dim"><b>{DIM_EN[d]}</b><small>{DIM[d]}</small></span>
                <LevelChip level={shown} approved={!!x?.approved} attention={st.attention} />
                <CompositeBar value={ev?.composite} scale={scale} />
                <TierBars rr={rr} />
              </button>
              {open && (
                <div className="lc-det" id={`lc-det-${d}`}>
                  {ev?.reason && <p className="lc-reason">{ev.reason}</p>}
                  {(ev?.borderline || ev?.flags?.length > 0) && (
                    <ul className="lc-flags">
                      {ev.borderline && <li>حالة حدّية: المستوى التالي في متناول هامش صغير</li>}
                      {(ev.flags || []).map((f) => <li key={f.key}>{f.reason_ar}</li>)}
                    </ul>
                  )}
                  {ev?.items_to_flip != null && <p className="la-muted">يفصله {questionsAr(ev.items_to_flip)} عن المستوى التالي</p>}
                  <p className="la-muted lc-tiers-text">{TIER_BARS.map(([t, name]) => `${name} ${pct(rr?.[`${t}_pct`])}`).join(' · ')}</p>
                  <div className="lc-decide">
                    {canWrite ? (
                      <label className="lc-field">المستوى
                        <select aria-label={`مستوى ${DIM_EN[d]}`} value={levels[d] || ''} onChange={(e) => setLevels({ ...levels, [d]: e.target.value })}>
                          <option value="">...</option>{Object.entries(LVL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </label>
                    ) : <span>المستوى: <b>{LVL[x?.level] || 'لم يُحدَّد'}</b></span>}
                    {ev && <small className="la-muted">المعيار: {LVL[ev.level]}</small>}
                    {st.override && <span className="la-chip warn">يخالف {LVL[currentLevel(d)]}؛ يلزم تعليل</span>}
                  </div>
                  {canWrite && showNote && (
                    <label className="lc-field lc-note">{st.override ? 'سبب المخالفة (إلزامي، 10 أحرف على الأقل)' : 'ملاحظة (اختيارية)'}
                      <input id={`lc-note-${d}`} aria-label={`ملاحظة ${DIM_EN[d]}`} value={notes[d] || ''} aria-required={st.override} aria-invalid={st.needsReason}
                        onChange={(e) => setNotes({ ...notes, [d]: e.target.value })} />
                    </label>
                  )}
                  {!canWrite && x?.note && <p className="la-muted">ملاحظة: {x.note}</p>}
                  <div className="la-row">
                    {canWrite && !showNote && <button type="button" className="la-link" onClick={() => setNoteOpen({ ...noteOpen, [d]: true })}>+ ملاحظة</button>}
                    {onAnswers && latest && <button type="button" className="la-link" onClick={() => onAnswers(d)}>عرض إجابات هذا البُعد ←</button>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="la-muted lc-legend">م ممارسة · ق مواقف · ع معرفة · الخط العمودي حد المستوى · المنطقة المظللة هامش الحدّية</p>

      {latest && (
        <div className="la-row between lc-foot">
          <span className="la-muted">القياس: أُرسل {date(latest.submitted_at)}</span>
          {onAnswers ? <button type="button" className="btn-sm ghost" onClick={() => onAnswers(null)}>إجابات القياس</button>
            : !canWrite && <small className="la-muted">إجابات القياس للمدير وحده</small>}
        </div>
      )}
      {canWrite && (
        <div className="lc-approve">
          <button type="button" className="btn-sm primary" aria-disabled={!!blocker} aria-describedby={blocker ? 'lc-block' : undefined}
            onClick={() => {
              if (!blocker) return onApprove();
              // الزر لا يرسل ما دام سبب ظاهر يمنعه: يُفتح الصف الناقص ويُنقل التركيز إلى حقله
              setManual({ ...manual, [blocker.dim]: true });
              if (blocker.field === 'note') setNoteOpen({ ...noteOpen, [blocker.dim]: true });
              setTimeout(() => document.querySelector(blocker.field === 'note' ? `#lc-note-${blocker.dim}` : `#lc-det-${blocker.dim} select`)?.focus(), 0);
            }}>
            {prof?.approved ? 'تحديث الاعتماد' : 'اعتماد المسار وفتح البرنامج'}</button>
          {blocker ? <p id="lc-block" className="lc-block" role="status">{blocker.text}</p>
            : <p className="la-muted">الاعتماد يفتح مراحل التأهيل والكتيب للمشارك ويرسل له بريدًا.</p>}
        </div>
      )}
    </section>
  );
}
