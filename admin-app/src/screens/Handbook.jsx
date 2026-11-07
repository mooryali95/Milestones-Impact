// ════════════════════════════════════════════════════════════════
// استوديو كتاب القائد: الأبواب، والنماذج التعليمية، والمعاينة كمشارك، والتقييم
// ════════════════════════════════════════════════════════════════
// المحرران (الباب والنموذج) بمعاينة حية كما يراها المشارك. الكتابة عبر
// admin.save / admin.delete / admin.reorder، والتقييم عبر admin.review-submission.
import React, { useEffect, useRef, useState } from 'react';
import { DIM, DIM_EN, DIMS, L, LVL, SUB_ST, date } from '../leaders.js';
import { LVLS, reorderIds, shortTitle } from '../methodology.js';
import {
  FTYPE, HB_TOOLS, HB_VIEWS, MASTER, RANK, SCOPE_VIEW, SUB_FILTER,
  applyTool, chapterLabs, chapterLint, clearDraft, lintHandbookMd, lintQuiz, draftKey, readDraft, writeDraft, filterHandbookMd, masterBook, maxPoints, nextSort, parseQuiz, splitList, stars, tierLabel, tiered, words,
} from '../handbook.js';
import Md from '../Md.jsx';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import { RUBRIC_SCALE, TRACK_COUNT } from '../../../supabase/functions/leaders-api/labels.js';
import { REPO_EDIT_AR } from '../../../supabase/functions/leaders-api/content-lock.js';

const pad = (n) => String(n).padStart(2, '0');
const ROM = { milestone: 'I', impact: 'II', leadership: 'III' };

function Move({ rows, entity, id, reload, canWrite }) {
  const { toast } = useUI();
  if (!canWrite) return null;
  const go = async (dir) => {
    const ids = reorderIds(rows, entity, id, dir);
    if (!ids) return;
    const r = await L('admin.reorder', { entity, ids });
    if (!r.success) return toast(r.message);
    reload();
  };
  return <><button className="la-mv" onClick={() => go(-1)} aria-label="نقل لأعلى">▲</button><button className="la-mv" onClick={() => go(1)} aria-label="نقل لأسفل">▼</button></>;
}

// إطار المحررين: نافذة كبيرة فوق الصفحة، Esc يغلقها
function Studio({ label, onClose, children, onSubmit, two }) {
  useEscape(onClose);
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={`hb-editor hb-ed${two ? ' two' : ''}`} role="dialog" aria-modal="true" aria-label={label} onSubmit={(e) => { e.preventDefault(); onSubmit?.(e.nativeEvent.submitter?.value); }}>
        {children}
      </form>
    </div>
  );
}

function LevelSeg({ value, onChange, disabled }) {
  return (
    <div className="hb-seg" role="radiogroup" aria-label="يظهر لمن مستواه">
      {LVLS.map((l) => (
        <label key={l}><input type="radio" name="min_level" value={l} checked={value === l} disabled={disabled} onChange={() => onChange(l)} /><span>{LVL[l]}{l === 'advanced' ? '' : ' فأعلى'}</span></label>
      ))}
    </div>
  );
}

function QuizView({ qs, reflection, right = 'الصحيحة' }) {
  return (
    <>
      {reflection && <div className="pv-reflect"><b>سؤال للتأمل</b>{reflection}</div>}
      {qs.map((q, i) => (
        <div key={i} className="pv-q"><b><span>{i + 1}</span>{q.q}</b>
          {q.options.map((o, j) => <div key={j} className={`pv-o${j === q.answer ? ' right' : ''}`}>{o}{j === q.answer && <small> {right}</small>}</div>)}
          {q.why && <p className="pv-why">{q.why}</p>}
        </div>
      ))}
    </>
  );
}

// حماية التعديل: مسودة تلقائية، وعرض استعادتها عند الفتح، وتأكيد قبل الإغلاق
// دون حفظ، وتنبيه المتصفح عند مغادرة الصفحة والتعديلات قائمة
function useGuard(key, v, setV) {
  const { confirm } = useUI();
  const base = useRef(JSON.stringify(v));
  const dirty = JSON.stringify(v) !== base.current;
  useEffect(() => {
    const d = readDraft(key);
    if (!d || JSON.stringify(d) === base.current) return;
    confirm('توجد مسودة لم تُحفظ من آخر تعديل هنا. استعادتها؟', { ok: 'استعادة المسودة' }).then((ok) => (ok ? setV(d) : clearDraft(key)));
  }, []); // eslint-disable-line
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => writeDraft(key, v), 600);
    return () => clearTimeout(t);
  }, [v, dirty, key]);
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const guardClose = async (close) => {
    if (!dirty || await confirm('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟ تبقى مسودتها في هذا المتصفح.', { danger: true, ok: 'إغلاق دون حفظ' })) close();
  };
  return { dirty, guardClose, done: () => clearDraft(key) };
}

// ملاحظات الباب أسفل المحرر: الخطأ يمنع الحفظ، والتنبيه يدل على سهو، والنقر ينقل إلى موضعه
function LintBar({ items, onPick }) {
  if (!items.length) return null;
  return (
    <ul className="hb-lint" aria-label="ملاحظات على الباب">{items.map((x, i) => (
      <li key={i} className={x.level}><button type="button" onClick={() => onPick(x)}>
        <b>{x.level === 'error' ? 'خطأ' : 'تنبيه'} · {x.line ? `السطر ${x.line}` : `السؤال ${x.q}`}</b> {x.msg}</button></li>
    ))}</ul>
  );
}

// ══ محرر الباب ══
export function ChapterEditor({ m, dim, catalog, canWrite, onClose }) {
  const { toast } = useUI();
  const d = m?.dimension || dim;
  const [v, setV] = useState({ title_ar: m?.title_ar || '', min_level: m?.min_level || 'beginner', body_md: m?.body_md || '', reflection_ar: m?.reflection_ar || '', quiz_md: m?.quiz_md || '' });
  const guard = useGuard(draftKey('chapter', m, d), v, setV);
  const [pane, setPane] = useState('content');
  const [view, setView] = useState(m?.min_level || 'beginner');
  const [scope, setScope] = useState('project');
  const [err, setErr] = useState('');
  const ta = useRef(null);
  const qa = useRef(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const qs = parseQuiz(v.quiz_md);
  const bodyLint = lintHandbookMd(v.body_md, v.min_level);
  const quizLint = lintQuiz(v.quiz_md);
  const scoped = /^:::.*scope=/m.test(v.body_md);
  const labs = chapterLabs(catalog, m);
  // ينقل المؤشر إلى السطر أو السؤال ويمرر إليه
  const pick = (x) => {
    const isLine = !!x.line;
    setPane(isLine ? 'content' : 'review');
    requestAnimationFrame(() => {
      const el = isLine ? ta.current : qa.current;
      if (!el) return;
      const lines = el.value.split('\n');
      const at = isLine ? x.line - 1 : lines.findIndex((l, k) => /^س\s*[:：]/.test(l.trim()) && lines.slice(0, k + 1).filter((y) => /^س\s*[:：]/.test(y.trim())).length === x.q);
      const pos = lines.slice(0, Math.max(0, at)).reduce((a, l) => a + l.length + 1, 0);
      el.focus();
      el.setSelectionRange(pos, pos + (lines[at] || '').length);
      el.scrollTop = Math.max(0, (at - 3) * (parseFloat(getComputedStyle(el).lineHeight) || 28));
    });
  };

  const tool = (t) => {
    const el = ta.current;
    const r = applyTool(v.body_md, el.selectionStart, el.selectionEnd, t);
    setV({ ...v, body_md: r.value });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.caret, r.caret); });
  };
  const submit = async (btn) => {
    if (btn === 'cancel') return guard.guardClose(() => onClose());
    if (!v.title_ar.trim()) return setErr('عنوان الباب مطلوب');
    const blockErr = bodyLint.find((x) => x.level === 'error');
    if (blockErr) { pick(blockErr); return setErr(`لا يُحفظ الباب وفيه خطأ في الكتل: السطر ${blockErr.line}، ${blockErr.msg}`); }
    // D01: الاختبار والمستوى محتوى مُقاس من المستودع، فلا يُرسلان؛ يحفظ المحرر النص غير المُقاس وحده.
    // الأبواب الجديدة وحذفها من المستودع كذلك، فالمحرر لا يفتح إلا بابًا قائمًا.
    const row = { id: m.id, title_ar: v.title_ar.trim(), body_md: v.body_md, reflection_ar: v.reflection_ar.trim() || null };
    const r = await L('admin.save', { entity: 'handbook_modules', row });
    if (!r.success) return setErr(r.message);
    guard.done();
    toast('حُفظ الباب');
    onClose(true);
  };

  return (
    <Studio label={m ? `تحرير الباب: ${m.title_ar}` : 'باب جديد'} onClose={() => guard.guardClose(() => onClose())} onSubmit={submit}>
      <header className="hb-ed-head">
        <div className="hb-ed-name"><small>{DIM_EN[d]} · {DIM[d]}{labs.length > 0 && <span className="hb-ed-labs"> · مختبرات أسفل الباب: {labs.map((l) => l.title_ar).join('، ')}</span>}</small>
          <input aria-label="عنوان الباب" placeholder="عنوان الباب" value={v.title_ar} onChange={set('title_ar')} readOnly={!canWrite} /></div>
        <div className="hb-ed-lvl"><small>يظهر لمن مستواه (من المستودع)</small><LevelSeg value={v.min_level} onChange={() => {}} disabled /></div>
        <div className="hb-ed-btns">
          {canWrite && <button className="btn-sm primary" value="save">حفظ الباب</button>}
          <button className="btn-sm ghost" value="cancel" formNoValidate>إغلاق</button>
        </div>
      </header>
      <nav className="hb-ed-tabs">
        <button type="button" className={pane === 'content' ? 'on' : ''} onClick={() => setPane('content')}>المحتوى {bodyLint.length > 0 && <i className="hb-warn">· {bodyLint.length} ملاحظة</i>}</button>
        <button type="button" className={pane === 'review' ? 'on' : ''} onClick={() => setPane('review')}>التأمل والاختبار {qs.length > 0 && <i>({qs.length})</i>} {quizLint.length > 0 && <i className="hb-warn">· {quizLint.length} ملاحظة</i>}</button>
      </nav>
      {pane === 'content' ? (
        <div className="hb-ed-pane" data-p="content">
          {canWrite && <div className="hb-ed-tools">{HB_TOOLS.map((t) => <button key={t[1]} type="button" className={t[2] === 'block' ? 'blk' : ''} onClick={() => tool(t)}>{t[1]}</button>)}</div>}
          <div className="hb-ed-panes">
            <div className="hb-ed-src"><div className="hb-ed-cap">المحتوى</div>
              <textarea ref={ta} aria-label="محتوى الباب" spellCheck={false} readOnly={!canWrite} value={v.body_md} onChange={set('body_md')}
                placeholder="اكتب محتوى الباب هنا. استخدم الأزرار أعلاه للعناوين والبنود والفقرات المخصصة لكل مستوى." /></div>
            <div className="hb-ed-out">
              <div className="hb-ed-cap">كما يقرؤه المشارك
                <span className="hb-seg sm">{LVLS.map((l) => <button key={l} type="button" className={view === l ? 'on' : ''} onClick={() => setView(l)}>{LVL[l]}</button>)}</span>
                {scoped && <span className="hb-seg sm" aria-label="نطاق العمل">{SCOPE_VIEW.map(([k, l]) => <button key={k} type="button" className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>)}</span>}
                <span className="hb-ed-wc">{words(filterHandbookMd(v.body_md, view, scope))} كلمة لهذا القارئ</span></div>
              <article className="hb-page"><h3 className="hb-page-t">{v.title_ar || 'عنوان الباب'}</h3>
                <div className="la-md">{RANK[view] < RANK[v.min_level]
                  ? <p className="la-muted">هذا الباب لا يظهر لمستوى {LVL[view]}؛ يبدأ من {LVL[v.min_level]}.</p>
                  : filterHandbookMd(v.body_md, view, scope) ? <Md text={filterHandbookMd(v.body_md, view, scope)} /> : <p className="la-muted">لا محتوى بعد.</p>}</div>
              </article>
            </div>
          </div>
        </div>
      ) : (
        <div className="hb-ed-pane" data-p="review">
          <div className="hb-ed-panes">
            <div className="hb-ed-src qz-src">
              <label>سؤال التأمل<textarea rows={2} readOnly={!canWrite} value={v.reflection_ar} onChange={set('reflection_ar')} placeholder="سؤال يربط الباب بعمل المشارك الحقيقي" /></label>
              <div className="qz-head"><b>الاختبار القصير</b></div>
              <p className="la-note" role="note">الاختبار {REPO_EDIT_AR}. يُعدَّل ملف الباب في supabase/content/handbook ثم يُولَّد الترحيل.</p>
              <textarea ref={qa} className="qz-md" aria-label="أسئلة الاختبار" spellCheck={false} readOnly value={v.quiz_md} />
            </div>
            <div className="hb-ed-out"><div className="hb-ed-cap">كما يراه المشارك بعد الباب</div>
              <article className="hb-page qz-out">
                <QuizView qs={qs} reflection={v.reflection_ar.trim()} />
                {!qs.length && <p className="la-muted">اكتب أول سؤال بالصيغة الموضحة، أو اضغط + سؤال.</p>}
                <p className="la-muted">أقصى نقاط الباب: {maxPoints(qs.length, !!v.reflection_ar.trim())} · تُخلط الخيارات لكل مشارك، فلا يدل موضع الخيار على صحته</p>
              </article></div>
          </div>
        </div>
      )}
      <div className="hb-ed-foot">
        <LintBar items={pane === 'content' ? bodyLint : quizLint} onPick={pick} />
        {err && <div className="la-err" role="alert">{err}</div>}
      </div>
    </Studio>
  );
}

// ══ النموذج التعليمي: دليله وحقوله كما يراها المشارك ══
function ModelGuide({ m }) {
  return (
    <div className="mp-hero"><span className="mp-icon">{m.icon || '◆'}</span>
      <div><small>{DIM_EN[m.dimension]} · من مستوى {LVL[m.min_level]}</small><h3>{m.title_ar}</h3><p>{m.summary_ar || ''}</p></div>
      <span className="mp-pts"><b>{m.points}</b>نقطة</span>
    </div>
  );
}
function ModelSteps({ m }) {
  return (
    <div className="mp-guide">
      {m.when_ar && <><h4>متى تستخدمه</h4><p>{m.when_ar}</p></>}
      {m.steps_ar && <><h4>الخطوات</h4><ol>{String(m.steps_ar).split('\n').filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ol></>}
      {m.source_ar && <p className="mp-src">{m.source_ar}</p>}
    </div>
  );
}
function ModelForm({ m, answers = {} }) {
  return (
    <div className="mp-form">{(m.fields || []).map((f, k) => {
      const v = answers[f.key];
      let input;
      if (f.type === 'select') input = <div className="mp-seg">{(f.options || []).map((o) => <span key={o} className={v === o ? 'on' : ''}>{o}</span>)}</div>;
      else if (f.type === 'table') {
        const rows = Array.isArray(v) && v.length ? v : Array.from({ length: f.min_rows || 1 }, () => []);
        input = (
          <div className="mp-table-wrap"><table className="mp-table">
            <thead><tr><th>#</th>{(f.columns || []).map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{i + 1}</td>{(f.columns || []).map((c, j) => <td key={c}>{(r || [])[j] || ''}</td>)}</tr>)}</tbody>
          </table></div>
        );
      } else input = <div className={`mp-in${f.type === 'textarea' ? ' big' : ''}`}>{v || ''}</div>;
      return <div key={f.key || k} className="mp-f"><b>{f.label}</b>{f.hint && <small>{f.hint}</small>}{input}</div>;
    })}</div>
  );
}

function ModelEditor({ m, dim, catalog, canWrite, onClose }) {
  const { toast, confirm } = useUI();
  const d = m?.dimension || dim;
  const [v, setV] = useState(() => ({
    title_ar: m?.title_ar || '', icon: m?.icon || '◆', points: m?.points ?? 30, active: m?.active !== false, min_level: m?.min_level || 'beginner',
    summary_ar: m?.summary_ar || '', when_ar: m?.when_ar || '', steps_ar: m?.steps_ar || '', source_ar: m?.source_ar || '',
    capstone_sort: m?.capstone_sort ?? '', scopes: m?.scopes || [],
    fields: JSON.parse(JSON.stringify(m?.fields || [{ key: 'project', label: 'اسم المشروع', type: 'text', required: true, bind: 'initiative' }])),
  }));
  // جداول النماذج الأخرى: مصدر يستورد منه هذا النموذج صفوفه بدل إعادة كتابتها
  const sources = (catalog.learning_models || []).filter((x) => x.id !== m?.id && (x.fields || []).some((f) => f.type === 'table'));
  // نطاق واحد على الأقل يبقى مختارًا، والثلاثة معًا تعني «للجميع» فتُحفظ فارغة
  const toggle = (list, k) => {
    const all = SCOPE_VIEW.map(([x]) => x);
    const cur = list.length ? list : all;
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    return !next.length ? cur : next.length === all.length ? [] : next;
  };
  const guard = useGuard(draftKey('model', m, d), v, setV);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const setField = (i, patch) => setV({ ...v, fields: v.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const moveField = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= v.fields.length) return;
    const fs = [...v.fields];
    [fs[i], fs[j]] = [fs[j], fs[i]];
    setV({ ...v, fields: fs });
  };
  const submit = async (btn) => {
    if (btn === 'cancel') return guard.guardClose(() => onClose());
    let r;
    if (btn === 'delete') {
      if (!(await confirm(`حذف النموذج "${m.title_ar}"؟`, { danger: true }))) return;
      r = await L('admin.delete', { entity: 'learning_models', id: m.id });
    } else {
      if (!v.title_ar.trim()) return setErr('اسم النموذج مطلوب');
      const row = { ...v, title_ar: v.title_ar.trim(), icon: v.icon.trim(), points: Number(v.points) || 0 };
      Object.assign(row, m ? { id: m.id } : { dimension: d, sort: nextSort(catalog.learning_models || [], d) });
      r = await L('admin.save', { entity: 'learning_models', row });
    }
    if (!r.success) return setErr(r.message);
    guard.done();
    toast(btn === 'delete' ? 'حُذف النموذج' : 'حُفظ النموذج');
    onClose(true);
  };
  const live = { ...v, dimension: d };

  return (
    <Studio label={m ? `تحرير النموذج: ${m.title_ar}` : 'نموذج جديد'} onClose={() => guard.guardClose(() => onClose())} onSubmit={submit} two>
      <header className="hb-ed-head">
        <div className="hb-ed-name"><small>{DIM_EN[d]} · {DIM[d]} · نموذج تعليمي</small>
          <input aria-label="اسم النموذج" placeholder="اسم النموذج" value={v.title_ar} onChange={set('title_ar')} readOnly={!canWrite} /></div>
        <div className="hb-ed-lvl"><small>يظهر لمن مستواه</small><LevelSeg value={v.min_level} onChange={(l) => setV({ ...v, min_level: l })} disabled={!canWrite} /></div>
        <div className="hb-ed-btns">
          {canWrite && <button className="btn-sm primary" value="save">حفظ النموذج</button>}
          <button className="btn-sm ghost" value="cancel" formNoValidate>إغلاق</button>
          {canWrite && m && <button className="hb-del" value="delete" formNoValidate>حذف</button>}
        </div>
      </header>
      <fieldset className="hb-ed-panes" disabled={!canWrite}>
        <div className="hb-ed-src me-src">
          <div className="me-grid">
            <label>الأيقونة<input value={v.icon} maxLength={2} onChange={set('icon')} /></label>
            <label>النقاط عند التسليم<input type="number" min="0" max="500" value={v.points} onChange={set('points')} /></label>
            <label className="me-check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> ظاهر للمشاركين</label>
          </div>
          <div className="me-cap">
            <label>ترتيبه فصلًا في وثيقة المبادرة<input type="number" min="1" max="999" placeholder="فارغ: ليس فصلًا" value={v.capstone_sort} onChange={set('capstone_sort')} /></label>
            <div className="me-scopes" role="group" aria-label="نطاقات العمل التي يظهر لها"><small>يظهر لنطاق</small>
              {SCOPE_VIEW.map(([k, l]) => <label key={k}><input type="checkbox" checked={!v.scopes.length || v.scopes.includes(k)}
                onChange={() => setV({ ...v, scopes: toggle(v.scopes, k) })} /> {l}</label>)}</div>
            <small className="la-muted">النموذج نفسه فصل في وثيقة المبادرة ومتطلب في الرحلة، فما يكتبه المشارك مرة يظهر في كل مكان.</small>
          </div>
          <label>الوصف المختصر<textarea rows={2} value={v.summary_ar} onChange={set('summary_ar')} /></label>
          <label>متى يستخدمه<textarea rows={2} value={v.when_ar} onChange={set('when_ar')} /></label>
          <label>الخطوات (سطر لكل خطوة)<textarea rows={4} value={v.steps_ar} onChange={set('steps_ar')} /></label>
          <label>المصدر الملهم<input value={v.source_ar} placeholder="مستلهم من …" onChange={set('source_ar')} /></label>
          <div className="fb">
            <div className="fb-head"><b>حقول النموذج</b>
              <button type="button" className="btn-sm ghost" onClick={() => setV({ ...v, fields: [...v.fields, { key: `f${Date.now().toString(36)}`, label: 'حقل جديد', type: 'textarea', required: true }] })}>+ حقل</button></div>
            <div className="fb-list">{v.fields.map((f, i) => (
              <div key={f.key || i} className="fb-row">
                <span className="fb-n">{i + 1}</span>
                <input aria-label={`عنوان الحقل ${i + 1}`} value={f.label} placeholder="عنوان الحقل" onChange={(e) => setField(i, { label: e.target.value })} />
                <select aria-label={`نوع الحقل ${i + 1}`} value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>{Object.entries(FTYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input aria-label={`تلميح الحقل ${i + 1}`} value={f.hint || ''} placeholder="تلميح (اختياري)" onChange={(e) => setField(i, { hint: e.target.value })} />
                {f.type === 'select' && <input aria-label={`خيارات الحقل ${i + 1}`} defaultValue={(f.options || []).join('، ')} placeholder="الخيارات مفصولة بفاصلة" onChange={(e) => setField(i, { options: splitList(e.target.value) })} />}
                {f.type === 'table' && <>
                  <input aria-label={`أعمدة الحقل ${i + 1}`} defaultValue={(f.columns || []).join('، ')} placeholder="الأعمدة مفصولة بفاصلة" onChange={(e) => setField(i, { columns: splitList(e.target.value) })} />
                  <input aria-label={`أقل عدد صفوف للحقل ${i + 1}`} type="number" min="1" max="30" value={f.min_rows || 1} onChange={(e) => setField(i, { min_rows: Number(e.target.value) || 1 })} />
                  <input aria-label={`أقل عدد صفوف للتأسيسي في الحقل ${i + 1}`} type="number" min="1" max="30" placeholder="للتأسيسي" title="أقل عدد صفوف للمستوى التأسيسي إن كان أخف" value={f.min_rows_beginner || ''} onChange={(e) => setField(i, { min_rows_beginner: Number(e.target.value) || undefined })} />
                </>}
                <label className="fb-req"><input type="checkbox" checked={f.required !== false} onChange={(e) => setField(i, { required: e.target.checked })} /> إلزامي</label>
                <div className="fb-more">
                  <select aria-label={`مستوى الحقل ${i + 1}`} value={f.min_level || 'beginner'} onChange={(e) => setField(i, { min_level: e.target.value })}>
                    {LVLS.map((l) => <option key={l} value={l}>{l === 'beginner' ? 'لكل المستويات' : `من مستوى ${LVL[l]}`}</option>)}</select>
                  <span className="me-scopes" role="group" aria-label={`نطاقات الحقل ${i + 1}`}>{SCOPE_VIEW.map(([k, l]) => <label key={k}><input type="checkbox" checked={!(f.scopes || []).length || f.scopes.includes(k)}
                    onChange={() => setField(i, { scopes: toggle(f.scopes || [], k) })} /> {l}</label>)}</span>
                  <label title="يظهر لمن محور الأولوية في مساره هو محور هذا النموذج"><input type="checkbox" checked={f.track === true} onChange={(e) => setField(i, { track: e.target.checked || undefined })} /> تعمق المسار فقط</label>
                  {f.type === 'text' && <label><input type="checkbox" checked={f.bind === 'initiative'} onChange={(e) => setField(i, { bind: e.target.checked ? 'initiative' : undefined })} /> يأخذ اسم المبادرة من بطاقتها</label>}
                  {f.type === 'table' && <select aria-label={`استيراد الحقل ${i + 1}`} value={f.import ? `${f.import.model}|${f.import.field}` : ''}
                    onChange={(e) => { const [model, field] = e.target.value.split('|'); setField(i, { import: model ? { model, field } : undefined }); }}>
                    <option value="">بلا استيراد</option>
                    {sources.flatMap((x) => x.fields.filter((t) => t.type === 'table').map((t) => <option key={`${x.key}|${t.key}`} value={`${x.key}|${t.key}`}>يستورد من {x.title_ar}: {t.label}</option>))}</select>}
                </div>
                <span className="fb-acts">
                  <button type="button" aria-label={`رفع الحقل ${i + 1}`} onClick={() => moveField(i, -1)}>▲</button>
                  <button type="button" aria-label={`خفض الحقل ${i + 1}`} onClick={() => moveField(i, 1)}>▼</button>
                  <button type="button" aria-label={`حذف الحقل ${i + 1}`} onClick={() => setV({ ...v, fields: v.fields.filter((_, k) => k !== i) })}>×</button>
                </span>
              </div>
            ))}</div>
          </div>
        </div>
        <div className="hb-ed-out"><div className="hb-ed-cap">كما يراه المشارك</div>
          <article className="hb-page mp"><ModelGuide m={live} /><ModelSteps m={live} /><ModelForm m={live} /></article></div>
      </fieldset>
      {err && <div className="la-err" role="alert">{err}</div>}
    </Studio>
  );
}

// ══ تقييم عمل مشارك ══
export function Submission({ id, canWrite, onClose }) {
  const { toast } = useUI();
  const [x, setX] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [bonus, setBonus] = useState(0);
  const [err, setErr] = useState('');
  useEffect(() => {
    L('admin.submission', { id }).then((r) => {
      if (!r.success) { toast(r.message); return onClose(); }
      setX(r.submission); setRating(r.submission.rating || 0); setFeedback(r.submission.feedback_ar || ''); setBonus(r.submission.bonus || 0);
    });
  }, [id]); // eslint-disable-line
  if (!x) return <div className="mid-ov"><Spinner /></div>;
  const m = x.learning_models;
  const submit = async (btn) => {
    if (btn === 'cancel') return onClose();
    if (btn === 'reviewed' && !rating) return setErr('اختر تقييمًا من 1 إلى 5');
    if (btn === 'returned' && !feedback.trim()) return setErr('اكتب ملاحظاتك ليعرف المشارك ما يطوّره');
    const r = await L('admin.review-submission', { id: x.id, status: btn, rating: rating || undefined, feedback, bonus });
    if (!r.success) return setErr(r.message);
    toast(btn === 'reviewed' ? 'اعتُمد التقييم' : 'أُعيد للمشارك');
    onClose(true);
  };
  return (
    <Studio label={`تقييم عمل ${x.participants.full_name}`} onClose={() => onClose()} onSubmit={submit} two>
      <header className="hb-ed-head">
        <div className="hb-ed-name"><small>{m.title_ar} · {DIM_EN[m.dimension]}</small><b className="sub-who">{x.participants.full_name}</b>
          <small className="sub-meta">{[x.participants.job_title, x.participants.organization_name].filter(Boolean).join(' · ')} · سُلّم {date(x.submitted_at)}</small></div>
        <div className="hb-ed-btns"><span className={`la-chip ${SUB_ST[x.status]?.[1] || ''}`}>{SUB_ST[x.status]?.[0] || ''}</span><button className="btn-sm ghost" value="cancel" formNoValidate>إغلاق</button></div>
      </header>
      <div className="hb-ed-panes sub-panes">
        <div className="hb-ed-out"><div className="hb-ed-cap">عمل المشارك</div><article className="hb-page mp"><ModelForm m={m} answers={x.answers || {}} /></article></div>
        <aside className="sub-review">
          <h4>تقييمك</h4>
          {/* D08: السلّم الرباعي الواحد بأسمائه ومراسيه من labels.js، بدل النجوم الخمس */}
          <div className="sub-scale" role="radiogroup" aria-label="التقييم">{RUBRIC_SCALE.levels.map((l) => (
            <label key={l.n} className={rating === l.n ? 'on' : ''}><input type="radio" name="rating" value={l.n} checked={rating === l.n} disabled={!canWrite} onChange={() => setRating(l.n)} />
              <b>{l.ar}</b><small>{l.anchor_ar}</small></label>
          ))}</div>
          <label>ملاحظاتك للمشارك<textarea rows={7} readOnly={!canWrite} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="ما الذي أجاده، وما الذي يطوّره في هذا النموذج؟" /></label>
          <label>نقاط تميّز إضافية (اختياري)<input type="number" min="0" max="100" readOnly={!canWrite} value={bonus} onChange={(e) => setBonus(e.target.value)} /></label>
          <p className="la-muted">نقاط النموذج ({m.points}) مُنحت عند التسليم. نقاط التميّز تُضاف عند الاعتماد فقط.</p>
          {canWrite && <><button className="btn-sm primary" value="reviewed">اعتماد التقييم</button><button className="btn-sm ghost" value="returned">إعادة للتطوير مع الملاحظات</button></>}
          {err && <div className="la-err" role="alert">{err}</div>}
        </aside>
      </div>
    </Studio>
  );
}

// ══ القوائم ══
function Chapters({ catalog, reload, canWrite, open }) {
  const mods = catalog.handbook_modules || [];
  const cs = (id) => catalog.book_stats?.chapters?.[id] || {};

  return DIMS.map((d) => {
    const list = mods.filter((m) => m.dimension === d).sort((a, b) => a.sort - b.sort);
    return (
      <section key={d} className="hb-dim">
        <header><span className="tx-roman">{DIM_EN[d][0]}</span><div><small>{DIM_EN[d]}</small><b>{DIM[d]}</b></div>
          <span className="hb-dim-n">{list.length} باب</span>
</header>
        {list.length ? <ol className="hb-list">{list.map((m, i) => {
          const n = words(m.body_md);
          const q = parseQuiz(m.quiz_md).length;
          const s = cs(m.id);
          const lint = chapterLint(m);
          const errs = lint.filter((x) => x.level === 'error').length;
          const labs = chapterLabs(catalog, m).length;
          return (
            <li key={m.id} className={`hb-ch${n ? '' : ' empty'}`}>
              <span className="hb-num">{pad(i + 1)}</span>
              <button className="hb-main" onClick={() => open({ kind: 'chapter', m })}>
                <b>{m.title_ar}</b>
                <span className="hb-meta"><span className={`la-lvl ${m.min_level}`}>من {LVL[m.min_level]}</span>
                  <span>{n ? `${n.toLocaleString('ar')} كلمة` : 'بلا محتوى بعد'}</span>{tiered(m.body_md) && <span>فقرات مخصصة لكل مستوى</span>}
                  <span className={q ? '' : 'hb-warn'}>{q ? `اختبار ${q} أسئلة` : 'بلا اختبار'}</span>
                  {labs > 0 && <span>{labs} مختبر</span>}
                  {lint.length > 0 && <span className="hb-warn">{errs ? `${errs} خطأ · ` : ''}{lint.length - errs ? `${lint.length - errs} تنبيه` : ''}</span>}
                  {s.done > 0 && <span className="hb-stat">أتمّه {s.done} · متوسط {Math.round((s.score / Math.max(1, s.total)) * 100)}%</span>}</span>
              </button>
              <span className="hb-acts"><Move rows={mods} entity="handbook_modules" id={m.id} reload={reload} canWrite={canWrite} />
                <button className="btn-sm ghost" onClick={() => open({ kind: 'chapter', m })}>{canWrite ? 'تحرير' : 'قراءة'}</button>
</span>
            </li>
          );
        })}</ol> : <p className="la-muted hb-none">لا أبواب في هذا الإطار بعد.</p>}
      </section>
    );
  });
}

function Models({ catalog, reload, canWrite, open, onReview }) {
  const list = catalog.learning_models || [];
  const ms = catalog.book_stats?.models || {};
  return DIMS.map((d) => {
    const items = list.filter((m) => m.dimension === d).sort((a, b) => a.sort - b.sort);
    return (
      <section key={d} className="hb-dim">
        <header><span className="tx-roman">{DIM_EN[d][0]}</span><div><small>{DIM_EN[d]}</small><b>{DIM[d]}</b></div>
          <span className="hb-dim-n">{items.length} نموذج</span>
          {canWrite && <button className="tx-btn gold" onClick={() => open({ kind: 'model', dim: d })}>+ نموذج جديد</button>}</header>
        {items.length ? <ol className="hb-list">{items.map((m) => {
          const x = ms[m.id] || {};
          return (
            <li key={m.id} className={`hb-ch${m.active ? '' : ' empty'}`}>
              <span className="hb-num hb-icon">{m.icon || '◆'}</span>
              <button className="hb-main" onClick={() => open({ kind: 'model', m })}>
                <b>{m.title_ar}{!m.active && <small className="la-chip"> موقوف</small>}</b>
                <span className="hb-meta"><span className={`la-lvl ${m.min_level}`}>من {LVL[m.min_level]}</span><span>{m.points} نقطة</span><span>{(m.fields || []).length} حقول</span>
                  {x.submitted || x.reviewed || x.draft
                    ? <span className="hb-stat">مسودات {x.draft || 0} · مسلّمة {x.submitted || 0} · مقيّمة {x.reviewed || 0}{x.rated ? ` · متوسط ${(x.rating / x.rated).toFixed(1)} من ${RUBRIC_SCALE.levels.length}` : ''}</span>
                    : <span>لا أعمال بعد</span>}</span>
              </button>
              <span className="hb-acts"><Move rows={list} entity="learning_models" id={m.id} reload={reload} canWrite={canWrite} />
                {x.submitted > 0 && <button className="btn-sm primary" onClick={() => onReview(m.id)}>قيّم {x.submitted}</button>}
                {canWrite && <button className="btn-sm ghost" onClick={() => open({ kind: 'model', m })}>تحرير</button>}</span>
            </li>
          );
        })}</ol> : <p className="la-muted hb-none">لا نماذج في هذا الإطار بعد.</p>}
      </section>
    );
  });
}

// المعاينة: الكتاب الأصلي الكامل (الافتراضي) أو أي من الكتب الـ27 كما يصل مساره
function Preview({ catalog, canWrite, open }) {
  const tracks = catalog.tracks || [];
  const [track, setTrack] = useState(MASTER);
  const [scope, setScope] = useState('');
  const [fetched, setFetched] = useState(null);
  const [cur, setCur] = useState({});
  const master = track === MASTER;
  useEffect(() => { if (master) return; setFetched(null); L('admin.book-preview', { track, scope: scope || undefined }).then(setFetched); }, [track, scope]);
  useEffect(() => setCur({}), [track]);
  const labsOf = (c) => c.labs || chapterLabs(catalog, c).map((l) => ({ key: l.key, title: `${l.title_ar}${l.min_level !== 'beginner' ? ` (من ${LVL[l.min_level]})` : ''}` }));
  const r = master ? masterBook(catalog.handbook_modules, catalog.learning_models) : fetched;
  if (!r) return <Spinner />;
  if (!r.success) return <div className="la-err" role="alert">{r.message}</div>;
  const chs = r.chapters;
  const model = cur.model && r.models.find((m) => m.id === cur.model);
  const ch = !model && !cur.all && (chs.find((c) => c.id === cur.ch) || chs[0]);
  const editCh = (c) => open({ kind: 'chapter', m: (catalog.handbook_modules || []).find((x) => x.id === c.id) });
  const editModel = () => open({ kind: 'model', m: (catalog.learning_models || []).find((x) => x.id === model.id) });
  const page = (c) => (
    <React.Fragment key={c.id}>
      <div className="pv-acts"><span className="la-muted">{DIM_EN[c.dimension]} · {DIM[c.dimension]} · من {LVL[c.min_level]}</span>{canWrite && <button className="btn-sm ghost" onClick={() => editCh(c)}>تحرير الباب واختباره</button>}</div>
      <article className="hb-page"><h3 className="hb-page-t">{c.title}</h3><div className="la-md"><Md text={c.md} tierLabel={master ? tierLabel : undefined} /></div></article>
      <section className="pv-review">
        {labsOf(c).length > 0 && <p className="pv-labs"><b>المختبرات أسفل هذا الباب:</b> {labsOf(c).map((l) => l.title).join('، ')}</p>}
        <h4>مراجعة الباب كما يراها المشارك</h4>
        {!c.reflection && <p className="hb-warn">لا سؤال تأمل لهذا الباب.</p>}
        <QuizView qs={c.quiz} reflection={c.reflection} right="الإجابة الصحيحة" />
        {!c.quiz.length && <p className="hb-warn">لا اختبار لهذا الباب بعد.</p>}
        <p className="la-muted">أقصى نقاط هذا الباب: {maxPoints(c.quiz.length, !!c.reflection)}</p>
      </section>
    </React.Fragment>
  );
  return (
    <>
      <div className="pv-bar">
        <label>الكتاب <select value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value={MASTER}>الكتاب الأصلي الكامل</option>
          <optgroup label={`الكتب الـ${TRACK_COUNT} بحسب المسار`}>{tracks.map((t) => <option key={t.key} value={t.key}>{t.key} · {shortTitle(t.title_ar)}</option>)}</optgroup>
        </select></label>
        {!master && <label>نطاق العمل <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">لم يحدده المشارك (يرى كل النطاقات)</option>
          {SCOPE_VIEW.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>}
        {master
          ? <span className="la-muted">الأصل الذي تُبنى منه الكتب الـ{TRACK_COUNT}: كل الأبواب بكل مستوياتها ونطاقاتها، والفقرات الموسومة تصل من ذُكر فقط</span>
          : <span className="la-row">{DIMS.map((d) => <span key={d} className={`la-lvl ${r.levels[d]}`}>{DIM_EN[d][0]} {LVL[r.levels[d]]}</span>)}</span>}
        <span className="la-muted">{chs.length} بابًا · {r.models.length} نماذج · الإجابات الصحيحة ظاهرة لك فقط</span>
        {master && <button className={`btn-sm ${cur.all ? '' : 'ghost'}`} onClick={() => setCur(cur.all ? {} : { all: true })}>{cur.all ? 'باب باب' : 'الكتاب متصلًا'}</button>}
      </div>
      <div className="pv">
        <nav className="pv-toc" aria-label="فهرس المعاينة">
          {DIMS.map((d) => {
            const items = chs.filter((c) => c.dimension === d);
            return items.length > 0 && (
              <div key={d} className="pv-part"><div className="pv-part-h"><span>{ROM[d]}</span>{DIM_EN[d]} · {DIM[d]}</div>
                {items.map((c, i) => <button key={c.id} className={ch && c.id === ch.id ? 'on' : ''} onClick={() => setCur({ ch: c.id })}><i>{pad(i + 1)}</i>{c.title}{!c.quiz.length && <small className="hb-warn"> بلا اختبار</small>}</button>)}</div>
            );
          })}
          <div className="pv-part"><div className="pv-part-h"><span>✦</span>النماذج التعليمية</div>
            {r.models.length ? r.models.map((m) => <button key={m.id} className={model?.id === m.id ? 'on' : ''} onClick={() => setCur({ model: m.id })}><i>{m.icon || '◆'}</i>{m.title_ar}</button>) : <p className="la-muted">لا نماذج لهذا المسار</p>}</div>
        </nav>
        <div className="pv-main">
          {model ? <>
            <div className="pv-acts">{canWrite && <button className="btn-sm ghost" onClick={editModel}>تحرير النموذج</button>}</div>
            <article className="hb-page mp"><ModelGuide m={model} /><ModelSteps m={model} /><ModelForm m={model} /></article>
          </> : cur.all ? chs.map(page) : ch ? page(ch) : <p className="la-muted">لا أبواب لهذا المسار.</p>}
        </div>
      </div>
    </>
  );
}

function Reviews({ catalog, canWrite, model, setModel, onSaved }) {
  const [status, setStatus] = useState('submitted');
  const [r, setR] = useState(null);
  const [sub, setSub] = useState(null);
  const load = () => { setR(null); L('admin.submissions', { status: status || undefined, model_id: model || undefined }).then(setR); };
  useEffect(load, [status, model]); // eslint-disable-line
  return (
    <section className="la-card">
      <div className="toolbar">
        <select className="filter-select" aria-label="حالة العمل" value={status} onChange={(e) => setStatus(e.target.value)}>{SUB_FILTER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="filter-select" aria-label="النموذج" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">كل النماذج</option>{(catalog.learning_models || []).map((m) => <option key={m.id} value={m.id}>{m.title_ar}</option>)}
        </select>
        {r?.success && <span className="la-muted">{r.submissions.length} عمل</span>}
      </div>
      {!r ? <Spinner /> : !r.success ? <div className="la-err" role="alert">{r.message}</div> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>المشارك</th><th>النموذج</th><th>سُلّم</th><th>الحالة</th><th>التقييم</th><th /></tr></thead>
          <tbody>{r.submissions.length ? r.submissions.map((x) => (
            <tr key={x.id}>
              <td><b>{x.participants?.full_name || ''}</b><br /><small className="la-muted">{x.participants?.organization_name || x.participants?.email || ''}</small></td>
              <td>{x.learning_models?.title_ar || ''}<br /><small className="la-muted">{DIM_EN[x.learning_models?.dimension] || ''}</small></td>
              <td>{date(x.submitted_at)}</td>
              <td><span className={`la-chip ${SUB_ST[x.status]?.[1] || ''}`}>{SUB_ST[x.status]?.[0] || x.status}</span></td>
              <td className="stars-c">{x.rating ? stars(x.rating) : ''}{x.bonus ? <small> +{x.bonus}</small> : null}</td>
              <td><button className={`btn-sm ${x.status === 'submitted' ? 'primary' : 'ghost'}`} onClick={() => setSub(x.id)}>{x.status === 'submitted' ? 'قيّم' : 'عرض'}</button></td>
            </tr>
          )) : <tr><td colSpan={6} className="la-empty">لا أعمال هنا</td></tr>}</tbody>
        </table></div>
      )}
      {sub && <Submission id={sub} canWrite={canWrite} onClose={(saved) => { setSub(null); if (saved) { load(); onSaved(); } }} />}
    </section>
  );
}

export default function Handbook({ catalog, reload, canWrite }) {
  const [view, setView] = useState('chapters');
  const [editing, setEditing] = useState(null);
  const [subModel, setSubModel] = useState('');
  const mods = catalog.handbook_modules || [];
  const models = catalog.learning_models || [];
  const bs = catalog.book_stats || { chapters: {}, models: {}, points: {}, to_review: 0 };
  const done = Object.values(bs.chapters || {}).reduce((a, c) => a + c.done, 0);
  const sc = Object.values(bs.chapters || {}).reduce((a, c) => [a[0] + c.score, a[1] + c.total], [0, 0]);
  const close = (saved) => { setEditing(null); if (saved) reload(); };
  const p = { catalog, reload, canWrite, open: setEditing };

  return (
    <>
      <section className="tx-hero">
        <div className="tx-hero-head">
          <div><span className="tx-eyebrow">The Leader&apos;s Book</span><h2>كتاب القائد</h2>
            <p>الكتاب التفاعلي والنماذج التعليمية في مكان واحد: تحرر المحتوى والاختبارات، وترى الكتاب كما يراه أي مسار، وتتابع تقدم المشاركين وتقيّم أعمالهم.</p></div>
        </div>
        <div className="tx-kpis">
          <div><b>{mods.length}</b><span>بابًا في الكتاب · {models.length} نماذج تعليمية</span></div>
          <div><b>{done}</b><span>إتمام باب{sc[1] ? ` · دقة ${Math.round((sc[0] / sc[1]) * 100)}%` : ''}</span></div>
          <div><b>{bs.points?.participants || 0}</b><span>مشارك بدأ يجمع النقاط{bs.points?.avg ? ` · متوسط ${bs.points.avg}` : ''}</span></div>
          <div className={bs.to_review ? 'warn' : ''}><b>{bs.to_review || 0}</b><span>نموذج بانتظار تقييمك</span></div>
        </div>
        <nav className="hb-views" aria-label="أقسام الكتاب">{HB_VIEWS.map(([k, l]) => (
          <button key={k} className={view === k ? 'on' : ''} aria-current={view === k ? 'page' : undefined} onClick={() => setView(k)}>{l}{k === 'reviews' && bs.to_review ? <i> {bs.to_review}</i> : null}</button>
        ))}</nav>
      </section>
      {view === 'models' ? <Models {...p} onReview={(id) => { setSubModel(id); setView('reviews'); }} />
        : view === 'preview' ? <Preview {...p} />
          : view === 'reviews' ? <Reviews catalog={catalog} canWrite={canWrite} model={subModel} setModel={setSubModel} onSaved={reload} />
            : <Chapters {...p} />}
      {editing?.kind === 'chapter' && <ChapterEditor m={editing.m} dim={editing.dim} catalog={catalog} canWrite={canWrite} onClose={close} />}
      {editing?.kind === 'model' && <ModelEditor m={editing.m} dim={editing.dim} catalog={catalog} canWrite={canWrite} onClose={close} />}
    </>
  );
}
