// ════════════════════════════════════════════════════════════════
// لوحة «إجابات القياس» الجانبية: مكوّن عرض واحد للوحة الإدارة ولبوابة الخبير (مستشار الدفعة)
// ════════════════════════════════════════════════════════════════
// (تصور بطاقة المستوى وإجابات القياس، المرحلة 2، قرار المالك 2026-11-11)
// البيانات من admin.assessment-answers أو xp.assessment-answers (الدالة نفسها في الخادم)، والتصنيف والزمن
// محسوبان هناك في answer-review.js. هنا العرض وحده: الملخص أولًا، ثم المرشحات، ثم الأقسام المطوية.
// سلوك النافذة (التركيز وحبسه وEsc وإعادته) من غلاف كل تطبيق: useModalFocus/useEscape في اللوحة،
// وuseDialog في بوابة الخبير. والتصدير CSV يُمرَّر من اللوحة وحدها (onCsv)، فلا زر له عند المستشار.
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DIM_AR, DIM_SHORT } from '../../supabase/functions/leaders-api/labels.js';
import { ANSWER_CLASS_AR, REVIEW_TIER_AR, secondsAr, sectionTitle, TIMING_DISCLAIMER_AR, TIMING_NOTE_AR } from '../../supabase/functions/leaders-api/answer-review.js';
import './answers-panel.css';

const day = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const KIND_AR = { baseline: 'المبدئي', post: 'البعدي', final: 'الختامي' };
const assessmentName = (a) => [KIND_AR[a.kind] || 'القياس', a.form ? `الصيغة ${a.form}` : null, day(a.submitted_at)].filter(Boolean).join(' · ');
const dimName = (d) => DIM_SHORT[d] || d;
const CLASS_MARK = { full: '✓', partial: '◐', wrong: '✗', na: '∅', likert: '' };
const FILTERS = [
  { key: 'all', label: 'الكل', test: () => true },
  { key: 'wrong', label: 'خاطئ أو جزئي', test: (it) => it.class === 'wrong' || it.class === 'partial' },
  { key: 'fast', label: '⚡ سريع', test: (it) => it.fast },
  { key: 'na', label: '∅ لا ينطبق', test: (it) => it.class === 'na' },
  { key: 'edited', label: '↺ مُعدَّل', test: (it) => it.edited },
];
const pctText = (v) => (v == null ? '—' : `${Math.round(v)}%`);
const statementsAr = (n) => (n === 1 ? 'عبارة واحدة' : n === 2 ? 'عبارتان' : n <= 10 ? `${n} عبارات` : `${n} عبارة`);
// ما يستحق الانتباه في القسم: يُفتح تلقائيًا
const notable = (s) => s.wrong + s.partial + s.fast + s.na + s.edited > 0;

function Choice({ it }) {
  return (
    <ul className="ap-opts">
      {it.options.map((o) => {
        const chosen = o.k === it.k;
        return (
          <li key={o.k} className={`${chosen ? 'chosen' : ''}${o.best ? ' best' : ''}${!chosen && !o.best ? ' plain' : ''}`}>
            <span className="ap-mark" aria-hidden="true">{chosen ? '●' : o.best ? '✓' : '○'}{chosen && o.best ? '✓' : ''}</span>
            <span className="ap-opt-label">{o.label}</span>
            <span className="ap-opt-tags">
              {chosen && <b className="ap-tag">اختاره</b>}
              {o.best && <b className="ap-tag key">مفتاح الدرجة القصوى</b>}
              <small className="ap-score" title="درجة الخيار">{o.score}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Likert({ it }) {
  const scale = it.options.filter((o) => !o.na);
  const na = it.options.find((o) => o.na);
  const label = (k) => it.options.find((o) => o.k === k)?.label;
  return (
    <div className="ap-likert">
      <ol className="ap-scale" aria-label={`اختار: ${label(it.k) || ''}${it.retro && it.before != null ? `، وقبل البرنامج: ${label(it.before)}` : ''}`}>
        {scale.map((o) => (
          <li key={o.k} className={o.k === it.k ? 'chosen' : it.retro && o.k === it.before ? 'before' : ''}>
            {(o.k === it.k || (it.retro && o.k === it.before)) && <span className="ap-dot" aria-hidden="true">{o.k === it.k ? '●' : '○'}</span>}
            <small>{o.label}</small>
          </li>
        ))}
      </ol>
      {na && <span className={`ap-na${it.k === na.k ? ' chosen' : ''}`}>∅ {na.label}</span>}
      {it.retro && <small className="ap-muted">● الآن · ○ قبل البرنامج</small>}
    </div>
  );
}

function Item({ it, median }) {
  const [all, setAll] = useState(false);
  const note = it.timing_note ? TIMING_NOTE_AR[it.timing_note] : null;
  const width = it.seconds != null && median ? Math.min(100, Math.round((it.seconds / (median * 2)) * 100)) : 0;
  return (
    <li className={`ap-item ${it.class || ''}${all ? ' all' : ''}`}>
      <div className="ap-item-head">
        <span className="ap-order">{it.order}</span>
        <code className="ap-code" dir="ltr">{it.code}</code>
        <p className="ap-text">{it.text}</p>
        <span className="ap-badges">
          {it.class && it.class !== 'likert' && <span className={`ap-class ${it.class}`}>{CLASS_MARK[it.class]} {ANSWER_CLASS_AR[it.class]}</span>}
          {it.fast && <span className="ap-flag" title="أسرع من العتبة">⚡ سريع</span>}
          {it.edited && <span className="ap-flag" title={note}>↺ عُدّلت</span>}
          <span className="ap-time" title={note || undefined}>
            {it.seconds != null && <i className="ap-tbar" aria-hidden="true"><i style={{ width: `${width}%` }} /></i>}
            {it.seconds != null ? secondsAr(it.seconds) : <>—<span className="ap-sr"> {note}</span></>}
          </span>
        </span>
      </div>
      {it.kind === 'likert' ? <Likert it={it} /> : <Choice it={it} />}
      {it.kind !== 'likert' && <button type="button" className="ap-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'المختار والمفتاح فقط' : 'عرض كل الخيارات'}</button>}
    </li>
  );
}

export default function AnswersPanel({ boxRef, who, data, error, onRetry, onClose, onPick, focusDim = null, onCsv = null }) {
  const [filter, setFilter] = useState('all');
  const [dim, setDim] = useState(focusDim || '');
  const [open, setOpen] = useState({});
  const items = data?.items || [];
  const sections = data?.sections || [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, items.filter(f.test).length])), [items]);
  const test = FILTERS.find((f) => f.key === filter)?.test || (() => true);
  const shown = sections.filter((s) => !dim || s.dimension === dim);
  const isOpen = (s) => open[s.key] ?? (filter !== 'all' || (focusDim ? s.dimension === focusDim : notable(s)));
  const t = data?.totals;
  const dims = [...new Set(sections.map((s) => s.dimension).filter(Boolean))];

  return createPortal(
    <div className="ap-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={boxRef} className="ap" role="dialog" aria-modal="true" aria-labelledby="ap-title" tabIndex={-1}>
        <header className="ap-head">
          <h2 id="ap-title">إجابات القياس{who ? ` · ${who}` : ''}</h2>
          <button type="button" className="ap-x" aria-label="إغلاق" onClick={onClose}>✕</button>
        </header>
        {error ? (
          <div className="ap-body"><p className="ap-err" role="alert">{error}</p>{onRetry && <button type="button" className="ap-btn" onClick={onRetry}>حاول مرة أخرى</button>}</div>
        ) : !data ? (
          <div className="ap-body"><p className="ap-muted" role="status">جارٍ التحميل…</p></div>
        ) : (
          <div className="ap-body">
            <div className="ap-meta">
              {data.assessments?.length > 1 ? (
                <label className="ap-pick">القياس
                  <select value={data.assessment.id} onChange={(e) => onPick?.(e.target.value)}>
                    {data.assessments.map((a) => <option key={a.id} value={a.id}>{assessmentName(a)}</option>)}
                  </select>
                </label>
              ) : <b>{assessmentName(data.assessment)}</b>}
              <span>المدة التقديرية ≈ {secondsAr(t.active_seconds)}{t.gaps ? ` (${t.gaps === 1 ? 'انقطاع واحد مستبعد' : `${t.gaps} انقطاعات مستبعدة`})` : ''}</span>
              {t.wall_seconds != null && <span className="ap-muted">من فتح القياس إلى إرساله {secondsAr(t.wall_seconds)}</span>}
            </div>
            <p className="ap-note">{TIMING_DISCLAIMER_AR}</p>

            <div className="ap-sum-wrap">
              <table className="ap-sum">
                <caption className="ap-sr">ملخص الأقسام</caption>
                <thead><tr><th scope="col">القسم</th><th scope="col">الدرجة</th><th scope="col">الزمن</th><th scope="col"><span aria-hidden="true">✗</span><span className="ap-sr">خاطئ أو جزئي</span></th><th scope="col"><span aria-hidden="true">⚡</span><span className="ap-sr">سريع</span></th><th scope="col"><span aria-hidden="true">∅</span><span className="ap-sr">لا ينطبق</span></th></tr></thead>
                <tbody>{sections.map((s) => (
                  <tr key={s.key}>
                    <th scope="row">{sectionTitle(s, dimName)}</th>
                    <td>{pctText(s.pct)}</td><td>{s.timed ? secondsAr(s.seconds) : '—'}</td>
                    <td>{s.wrong + s.partial || ''}</td><td>{s.fast || ''}</td><td>{s.na || ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            <div className="ap-filters" role="group" aria-label="تصفية الأسئلة">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className="ap-chip" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setOpen({}); }}>
                  {f.label} <b>{counts[f.key]}</b>
                </button>
              ))}
              {dims.length > 1 && (
                <select aria-label="البُعد" value={dim} onChange={(e) => setDim(e.target.value)}>
                  <option value="">كل الأبعاد</option>
                  {dims.map((d) => <option key={d} value={d}>{dimName(d)} · {DIM_AR[d]}</option>)}
                </select>
              )}
              <span className="ap-actions">
                <button type="button" className="ap-btn" onClick={() => window.print()}>طباعة</button>
                {onCsv && <button type="button" className="ap-btn" onClick={() => onCsv(data)}>CSV</button>}
              </span>
            </div>

            {shown.map((s) => {
              const list = items.filter((it) => it.section === s.key && test(it));
              if (!list.length) return null;
              const o = isOpen(s);
              const scoreLine = s.tier === 'behavior' || s.tier === 'transfer'
                ? `${statementsAr(s.count)}${s.na ? ` · ${s.na} لا ينطبق` : ''}`
                : `${s.full}/${s.count} كاملة`;
              return (
                <section key={s.key} className="ap-sec">
                  <h3>
                    <button type="button" className="ap-sec-head" aria-expanded={o} aria-controls={`ap-sec-${s.key}`} onClick={() => setOpen({ ...open, [s.key]: !o })}>
                      <span aria-hidden="true">{o ? '▾' : '▸'}</span>
                      <b>{s.tier === 'transfer' ? REVIEW_TIER_AR.transfer : `${dimName(s.dimension)} · ${REVIEW_TIER_AR[s.tier]}`}</b>
                      <span className="ap-muted">{scoreLine} · {pctText(s.pct)}{s.timed ? ` · ${secondsAr(s.seconds)}` : ''}{s.median ? ` · الوسيط ${secondsAr(s.median)}` : ''}{s.fast ? ` · ⚡${s.fast}` : ''}</span>
                    </button>
                  </h3>
                  <ol id={`ap-sec-${s.key}`} className="ap-items" hidden={!o}>
                    {list.map((it) => <Item key={it.id} it={it} median={s.median} />)}
                  </ol>
                </section>
              );
            })}
            {!shown.some((s) => items.some((it) => it.section === s.key && test(it))) && <p className="ap-muted">لا أسئلة بهذا المرشح.</p>}
            <p className="ap-legend">● اختيار المشارك · ✓ مفتاح الدرجة القصوى · ⚡ أسرع من العتبة · ↺ عُدّلت · ∅ لا ينطبق · — زمن غير محسوب</p>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
