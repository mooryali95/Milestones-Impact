// ════════════════════════════════════════════════════════════════
// مقترحات تعديل الكتاب الأم (المرحلة 4، الخطوة 1، اعتمدها المالك 2026-11-15)
// ════════════════════════════════════════════════════════════════
// المحرر: نص القسم كما هو بوسوم مستواه، ومعاينة حية بكل مستوى، وما يعتمد على القسم قبل الحفظ.
// المراجعة: الفرق كلمة بكلمة، وسبب التعديل، والاعتماد أو الرد للمدير العام. القواعد على الخادم (book-proposals.js).
import React, { useEffect, useMemo, useState } from 'react';
import { mdHtml } from '../../src/lib/brand/book.js';
import { LEVEL_AR } from '../../supabase/functions/leaders-api/labels.js';
import { filterHandbookMd } from '../../supabase/functions/leaders-api/logic.js';
import { markTiers } from '../../supabase/functions/leaders-api/master-book.js';
import { PROPOSED_MAX, REASON_MIN, sectionSource, wordDiff } from '../../supabase/functions/leaders-api/book-proposals.js';
import { chapterDeps } from './deps.js';

const PREVIEW = [['all', 'كما في الكتاب الأم'], ['beginner', LEVEL_AR.beginner], ['intermediate', LEVEL_AR.intermediate], ['advanced', LEVEL_AR.advanced]];
const useEsc = (fn) => useEffect(() => { const k = (e) => e.key === 'Escape' && fn(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [fn]);
const when = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' }) : '');

/** الفرق كلمة بكلمة: المحذوف مشطوب والمضاف مظلل، وما لم يتغير يُطوى إن طال */
export function Diff({ a, b }) {
  const parts = useMemo(() => wordDiff(a, b), [a, b]);
  return (
    <div className="mb-diff" dir="rtl">
      {parts.map((p, i) => {
        if (p.t === 'del') return <del key={i}>{p.s}</del>;
        if (p.t === 'add') return <ins key={i}>{p.s}</ins>;
        const s = p.s;
        if (s.length < 260) return <span key={i}>{s}</span>;
        return <span key={i}>{s.slice(0, 110)}<span className="mb-diff-gap"> … </span>{s.slice(-110)}</span>;
      })}
    </div>
  );
}

export function ProposalEditor({ chapter, section, proposal = null, data, api, onSaved, onClose }) {
  const base = useMemo(() => sectionSource(chapter.md, section) ?? '', [chapter.md, section]);
  const [text, setText] = useState(proposal?.proposed_md || base);
  const [reason, setReason] = useState(proposal?.reason || '');
  const [tab, setTab] = useState('edit');
  const [lvl, setLvl] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEsc(onClose);
  const deps = chapterDeps({ chapter, section, deps: data.deps, counts: data.counts });
  const changed = text.trim() !== base.trim();
  const preview = useMemo(() => mdHtml(lvl === 'all' ? markTiers(text) : filterHandbookMd(text, lvl)), [text, lvl]);
  const save = async (submit) => {
    setBusy(true); setErr('');
    const r = await api.propose({ id: proposal?.id, module_id: chapter.id, section, proposed_md: text, reason, submit });
    setBusy(false);
    if (!r?.success) { setErr(r?.message || 'تعذّر الحفظ'); return; }
    onSaved(r);
  };
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="mb-sheet tall wide" role="dialog" aria-modal="true" aria-label="اقتراح تعديل">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h">
          <div><small>{chapter.title} · {proposal ? 'تحديث مقترح' : 'اقتراح تعديل'}</small><b>{section || 'مقدمة الباب'}</b></div>
          <button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className="mb-tabs" role="tablist">
          {[['edit', 'النص'], ['preview', 'المعاينة'], ['diff', 'الفرق']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="mb-sheet-body">
          {proposal?.stale && <p className="mb-note">القسم تغيّر بعد كتابة هذا المقترح. الحفظ يحدّث أصله إلى النص الحالي، فراجع الفرق قبل العرض.</p>}
          {tab === 'edit' && <>
            <p className="mb-hint">النص بصيغة الكتاب: <code>##</code> عنوان القسم، و<code>:::min=intermediate</code> … <code>:::</code> لفقرة تبدأ من مستوى. الوسوم كما هي تحدد من يقرأ ماذا.</p>
            <textarea className="mb-src" dir="rtl" spellCheck={false} value={text} maxLength={PROPOSED_MAX} onChange={(e) => setText(e.target.value)} aria-label="النص المقترح" />
          </>}
          {tab === 'preview' && <>
            <div className="mb-levels in" role="radiogroup" aria-label="المعاينة بمستوى">
              {PREVIEW.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={lvl === k} className={lvl === k ? 'on' : ''} onClick={() => setLvl(k)}>{l}</button>)}
            </div>
            <div className="mb-txt mb-preview" dangerouslySetInnerHTML={{ __html: preview }} />
          </>}
          {tab === 'diff' && (changed ? <Diff a={base} b={text} /> : <p className="mb-empty">لا فرق بعد عن النص الحالي.</p>)}
          <section className={`mb-dep${deps.total ? ' warn' : deps.quiz.locked ? '' : ' none'}`}>
            <header><b>ما يعتمد على هذا القسم</b><span className="mb-dep-n">{deps.total || '·'}</span></header>
            {deps.total > 0 && <ul className="mb-dep-list">
              {deps.refs.map((r) => <li key={r.section_id + r.chapter}>وثيقة المبادرة: فصل «{r.chapter}» يحيل إليه</li>)}
              {deps.comments > 0 && <li>{deps.comments} تعليق مفتوح على القسم: راجعها قبل العرض</li>}
            </ul>}
            {deps.quiz.locked && <p>اختبار الباب مقفل ({deps.quiz.completed} أكملوه)، والمقترح لا يمسه: يغيّر المتن وحده.</p>}
          </section>
        </div>
        <footer className="mb-compose">
          <label className="mb-lbl" htmlFor="mb-reason">سبب التعديل: ما الذي يتحسن، ولمن</label>
          <textarea id="mb-reason" rows={2} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} placeholder="مثال: إضافة مثال من القطاع الحكومي يوضح الفرق بين المعلم والمهمة للمستوى المبتدئ" />
          {err && <p className="mb-err" role="alert">{err}</p>}
          <div className="mb-row">
            <small className="mb-muted">لا يتغير الكتاب بالحفظ. المعتمد يدخل الإصدار التالي</small>
            <span className="mb-row-end">
              <button type="button" className="mb-btn ghost" disabled={busy || !changed || reason.trim().length < REASON_MIN} onClick={() => save(false)}>احفظ مسودة</button>
              <button type="button" className="mb-btn gold" disabled={busy || !changed || reason.trim().length < REASON_MIN} onClick={() => save(true)}>{busy ? 'يُحفظ…' : 'اعرضه على اللجنة'}</button>
            </span>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function Card({ p, chapter, viewer, api, onChanged, onEdit, onGo }) {
  const [open, setOpen] = useState(p.status === 'review');
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const move = async (to) => {
    if (to === 'withdrawn' && !confirm('سحب المقترح؟ يبقى في السجل ولا يُراجع.')) return;
    setBusy(true); setErr('');
    const r = await api.move(p.id, to, note);
    setBusy(false);
    if (!r?.success) { setErr(r?.message || 'تعذّر التحديث'); return; }
    setDeciding(null); setNote(''); onChanged();
  };
  return (
    <article className={`mb-pr st-${p.status}${p.stale ? ' stale' : ''}`}>
      <header>
        <span className={`mb-pr-st st-${p.status}`}>{p.status_ar}</span>
        <button type="button" className="mb-pr-where" onClick={() => onGo?.(p)}><small>{chapter?.title}</small><b>{p.section || 'مقدمة الباب'}</b></button>
        <button type="button" className="mb-ic sm" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={open ? 'طي' : 'عرض الفرق'}>{open ? '−' : '+'}</button>
      </header>
      <p className="mb-pr-why">{p.reason}</p>
      <p className="mb-pr-meta">{p.author_name} · {when(p.updated_at)}{p.stale ? ' · ' : ''}{p.stale && <b className="mb-pr-stale">القسم تغيّر بعده</b>}</p>
      {open && <Diff a={p.base_md} b={p.proposed_md} />}
      {p.decided_by && <p className="mb-pr-dec">{p.status === 'rejected' ? 'ردّه' : 'اعتمده'} {p.decided_by} · {when(p.decided_at)}{p.decision_note ? `: ${p.decision_note}` : ''}</p>}
      {p.release_version && <p className="mb-pr-dec">دخل الإصدار {p.release_version}</p>}
      {err && <p className="mb-err" role="alert">{err}</p>}
      {deciding ? (
        <div className="mb-pr-decide">
          <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={deciding === 'rejected' ? 'سبب الرد: ما الذي يُصلح ليُعتمد' : 'ملاحظة الاعتماد (اختيارية)'} />
          <div className="mb-row">
            <button type="button" className="mb-link" onClick={() => setDeciding(null)}>إلغاء</button>
            <button type="button" className={`mb-btn ${deciding === 'approved' ? 'gold' : 'ghost'}`} disabled={busy || (deciding === 'rejected' && note.trim().length < 5)} onClick={() => move(deciding)}>{deciding === 'approved' ? 'اعتمد المقترح' : 'رد المقترح'}</button>
          </div>
        </div>
      ) : (
        <footer>
          {p.edit && <button type="button" className="mb-link" onClick={() => onEdit(p)}>عدّل</button>}
          {p.can.review && <button type="button" className="mb-link" disabled={busy} onClick={() => move('review')}>اعرضه على اللجنة</button>}
          {p.can.draft && <button type="button" className="mb-link" disabled={busy} onClick={() => move('draft')}>أعده مسودة</button>}
          {p.can.withdrawn && <button type="button" className="mb-link" disabled={busy} onClick={() => move('withdrawn')}>اسحبه</button>}
          {viewer.decide && p.status === 'review' && <>
            <button type="button" className="mb-btn gold sm" disabled={!p.can.approved} title={p.stale ? 'القسم تغيّر بعد المقترح: يحدّثه كاتبه أولًا' : ''} onClick={() => setDeciding('approved')}>اعتمد</button>
            <button type="button" className="mb-btn ghost sm" onClick={() => setDeciding('rejected')}>رد</button>
          </>}
        </footer>
      )}
    </article>
  );
}

const FILTERS = [['open', 'المفتوحة'], ['review', 'قيد المراجعة'], ['approved', 'المعتمدة'], ['draft', 'مسوداتي'], ['closed', 'المردودة والمسحوبة'], ['all', 'الكل']];
const pass = (f, p) => f === 'all' || (f === 'open' ? ['draft', 'review', 'approved'].includes(p.status) : f === 'closed' ? ['rejected', 'withdrawn'].includes(p.status) : p.status === f);

/** كل المقترحات، أو مقترحات قسم بعينه إن سُمّي */
export function ProposalsSheet({ data, api, scope = null, onEdit, onGo, onChanged, onClose }) {
  const [f, setF] = useState('open');
  useEsc(onClose);
  const byId = useMemo(() => Object.fromEntries(data.chapters.map((c) => [c.id, c])), [data.chapters]);
  const list = (data.proposals || []).filter((p) => (!scope || (p.module_id === scope.chapter.id && p.section === scope.section)) && (scope || pass(f, p)));
  const rule = data.viewer.decide ? 'تعتمد ما قيد المراجعة أو ترده بملاحظة. المعتمد يدخل الإصدار التالي من الكتاب.'
    : data.viewer.propose ? 'تكتب المقترح وتعرضه، ويعتمده المدير العام. التعليق عليه من زر التعليق في القسم نفسه.'
      : 'تقرأ المقترحات المعروضة وتعلّق عليها من زر التعليق في القسم نفسه. الاعتماد للإدارة.';
  return (
    <div className="mb-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="mb-sheet tall wide" role="dialog" aria-modal="true" aria-label="مقترحات التعديل">
        <span className="mb-grip" aria-hidden="true" />
        <header className="mb-sheet-h">
          <div><small>{scope ? scope.chapter.title : 'الكتاب الأم'}</small><b>{scope ? `مقترحات «${scope.section || 'مقدمة الباب'}»` : 'مقترحات التعديل'}</b></div>
          <button type="button" className="mb-x" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        {!scope && <div className="mb-filters"><select value={f} onChange={(e) => setF(e.target.value)} aria-label="الحالة">{FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
        <div className="mb-sheet-body">
          <p className="mb-hint">{rule}</p>
          {!data.proposals_ready && <p className="mb-note">المقترحات تُفعَّل بعد تطبيق ترحيلها على الإنتاج.</p>}
          {data.proposals_ready && !list.length && <p className="mb-empty">لا مقترحات {scope ? 'على هذا القسم' : 'بهذه الحالة'}.</p>}
          {list.map((p) => <Card key={p.id} p={p} chapter={byId[p.module_id]} viewer={data.viewer} api={api} onChanged={onChanged} onEdit={onEdit} onGo={onGo} />)}
        </div>
        {scope && data.viewer.propose && api.propose && (
          <footer className="mb-compose"><button type="button" className="mb-btn gold" onClick={() => onEdit(null, scope)}>اقترح تعديلًا على هذا القسم</button></footer>
        )}
      </aside>
    </div>
  );
}
