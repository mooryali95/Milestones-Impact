// ════════════════════════════════════════════════════════════════
// النماذج التعليمية وإنجازاتي داخل كتيب القائد
// ════════════════════════════════════════════════════════════════
// كل نموذج أداة عمل يملؤها المشارك على مشروعه الحقيقي: مسودة تُحفظ،
// ثم تسليم يمنح نقاط النموذج مرة واحدة، ثم تقييم المستشار وملاحظاته.
import React, { useEffect, useId, useState } from 'react';
import { call } from '../api.js';
import { ErrorBox, isoLtr } from '../ui.jsx';
import { useUnsavedGuard } from '../unsaved.js';
import { exampleFor, guideFor } from '../guide.js';
import { nearCopy } from '../../../supabase/functions/leaders-api/example-check.js';
import { fieldFilled, isEmail, POINTS, RANKS } from '../../../supabase/functions/leaders-api/logic.js';
import { APPROVAL_POINTS } from '../../../supabase/functions/leaders-api/capstone.js';
import { DIMENSIONS, levelOf } from '../labels.js';
import logoDark from '../milestone-impact.svg';
import { rubricLevelAr, SUBMISSION_STATUS } from '../../../supabase/functions/leaders-api/labels.js';

const STATUS = {
  draft: { t: SUBMISSION_STATUS.draft, c: 'warn' },
  submitted: { t: SUBMISSION_STATUS.submitted, c: 'gold' },
  returned: { t: SUBMISSION_STATUS.returned, c: 'bad' },
  reviewed: { t: SUBMISSION_STATUS.reviewed, c: 'ok' },
};
const SOURCE = { chapter: 'إتمام باب', model: 'تسليم نموذج', review: 'تميّز من المستشار', bonus: 'مكافأة', lab: 'إتقان أداة في المختبر', lab_bonus: 'تميّز في المختبر', capstone: 'اعتماد المبادرة وأثرها', tracking: 'متابعة تنفيذ المبادرة' };
const date = (d) => (d ? new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short' }) : '');

// id للحقل الذي تسمّيه <label htmlFor>، وlabelId لما لا تسمّيه label (مجموعة الاختيار والجدول) فيُسمّى بـaria-labelledby
function Field({ f, value, onChange, locked, initiative, imp, id, labelId }) {
  // حقل اسم المشروع مصدره بطاقة المبادرة: يُعرض ولا يُكتب هنا
  if (f.bind === 'initiative') {
    return (
      <div className="mf-bound">
        <input id={id} className="input" disabled value={initiative || value || ''} placeholder="—" />
        {!initiative && <small className="muted">اكتب اسم المبادرة في «بطاقة المبادرة» فيظهر هنا وفي كل نماذجك.</small>}
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <div className="seg-opts" role="radiogroup" aria-labelledby={labelId}>
        {f.options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} disabled={locked} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    );
  }
  if (f.type === 'table') {
    const cols = f.columns || [];
    const rows = Array.isArray(value) && value.length ? value : Array.from({ length: f.min_rows || 1 }, () => cols.map(() => ''));
    const set = (ri, ci, v) => onChange(rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)));
    return (
      <div className="mtable-wrap">
        <table className="mtable" aria-labelledby={labelId}>
          <thead><tr><th>#</th>{cols.map((c) => <th key={c}>{c}</th>)}{!locked && <th />}</tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td className="mt-n">{ri + 1}</td>
                {cols.map((c, ci) => (
                  <td key={c}><textarea rows={1} disabled={locked} value={r[ci] || ''} aria-label={`${c} ${ri + 1}`} onChange={(e) => set(ri, ci, e.target.value)} /></td>
                ))}
                {!locked && <td><button type="button" className="mt-x" title="حذف الصف" disabled={rows.length <= 1}
                  onClick={() => onChange(rows.filter((_, i) => i !== ri))}>×</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!locked && (
          <div className="row mt-acts">
            <button type="button" className="link small" onClick={() => onChange([...rows, cols.map(() => '')])}>+ صف</button>
            {imp && <ImportRows imp={imp} rows={rows} onChange={onChange} />}
          </div>
        )}
      </div>
    );
  }
  if (f.type === 'textarea') return <textarea id={id} className="input" rows={4} disabled={locked} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  return <input id={id} className="input" disabled={locked} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
}

// استيراد صفوف من جدول نموذج آخر (مصدرها الوحيد)، لقطة يعدّلها المشارك بعدها
function ImportRows({ imp, rows, onChange }) {
  const n = imp.rows?.length || 0;
  const has = rows.some((r) => r.some((c) => String(c || '').trim()));
  if (!n) return <small className="muted">يُستورد من «{imp.title || 'النموذج المصدر'}» حين تملؤه.</small>;
  const go = () => {
    if (has && !window.confirm(`يستبدل الاستيراد الصفوف الحالية بـ ${n} صفًا من «${imp.title}». متابعة؟`)) return;
    onChange(imp.rows.map((r) => [...r]));
  };
  return <button type="button" className="link small" onClick={go}>⇣ استورد {n} صفًا من «{imp.title}»</button>;
}

// هل اكتمل الحقل؟ قاعدة الخادم نفسها (fieldFilled). الحقل الاختياري لا يُحسب ناقصًا،
// وحقل اسم المبادرة يكتمل من بطاقة المبادرة كما يملؤه الخادم عند التسليم (bindAnswers)
const filledOf = (f, v, initiative) => f.required === false || (f.bind === 'initiative' && !!initiative) || fieldFilled(f, v);
const codeOf = (m) => `${(DIMENSIONS.find((x) => x.key === m.dimension)?.short || 'M')[0]}-${String(m.sort || 1).padStart(2, '0')}`;
// علامات النموذج الجيد: إرشاد للمشارك، والمستشار يقيّم بالنجوم والملاحظات
const RUBRIC = [
  ['الاكتمال', 'كل حقل مملوء بما يكفي ليُفهم دون شرح شفهي.'],
  ['التحديد', 'أرقام وتواريخ وأسماء أدوار، لا عبارات عامة.'],
  ['الارتباط بمبادرتك', 'مبني على مبادرة من واقع عملك تستطيع تنفيذها، حقيقية كانت أو افتراضية واقعية.'],
  ['جودة القرار', 'يظهر فيه منطقك: لماذا هذا الترتيب، وما الذي ستفعله بالنتيجة.'],
];
const STEPS = ['افهم النموذج', 'طبّقه على مشروعك', 'سلّمه للمستشار', 'التقييم والملاحظات'];

// مثال الحقل من المبادرة المحلولة لقطاع المشارك: نص مقتبس، أو أول صفوف الجدول
function FieldExample({ ex }) {
  if (!ex) return null;
  const rows = Array.isArray(ex.value) ? ex.value.slice(0, 3) : null;
  return (
    <div className="mf-ex">
      <b>مثال من {ex.sector_title}:</b>
      {rows ? (
        <div className="mf-ex-t"><table><thead><tr>{(ex.columns || []).map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{isoLtr(String(c))}</td>)}</tr>)}</tbody></table></div>
      ) : <q>{isoLtr(String(ex.value))}</q>}
    </div>
  );
}

// دليل الحقل بمستوى المشارك: مفتوح للتأسيسي، ومطوي للمتوسط، وسؤال تحدٍّ للمتقدم (guide.js)
function FieldGuide({ g }) {
  if (!g) return null;
  if (g.mode === 'open') {
    return (
      <div className="mf-guide open" role="note">
        <p><b>المطلوب:</b> {g.meaning}</p>
        <p className="mf-avoid"><b>تجنّب:</b> {g.mistake}</p>
        <FieldExample ex={g.example} />
      </div>
    );
  }
  return (
    <details className="mf-guide">
      <summary>{g.mode === 'expert' ? 'سؤال الخبير' : 'كيف أكتبه؟'}</summary>
      {g.mode === 'collapsed' && <p><b>المطلوب:</b> {g.meaning}</p>}
      <p className="mf-avoid"><b>تجنّب:</b> {g.mistake}</p>
      <p className="mf-q"><b>{g.mode === 'expert' ? 'اختبر جوابك:' : 'ارفع جودته:'}</b> {g.challenge}</p>
      <FieldExample ex={g.example} />
    </details>
  );
}

export function ModelView({ id, name, onBack, onPoints, backLabel = 'مكتبة النماذج' }) {
  const [d, setD] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const uid = useId();

  useEffect(() => {
    call('models.get', { id }).then((r) => {
      if (!r.success) return setMsg({ err: r.message });
      setMsg(null);
      setD(r);
      setAnswers(r.submission?.answers || {});
      if (r.submission?.updated_at) setSavedAt(new Date(r.submission.updated_at));
    });
  }, [id, attempt]);

  const s = d?.submission;
  // فصل في وثيقة مسلّمة أو معتمدة: يُقرأ ولا يُعدَّل حتى تعود الوثيقة
  const capLocked = !!d?.capstone?.locked;
  const auto = d && !capLocked && (!s || s.status === 'draft' || s.status === 'returned');
  // حفظ تلقائي للمسودة بعد ثوانٍ من آخر تعديل
  useEffect(() => {
    if (!dirty || !auto) return undefined;
    const t = setTimeout(async () => {
      const r = await call('models.save', { id: d.model.id, answers, submit: false });
      if (r.success) { setDirty(false); setSavedAt(new Date()); setD((x) => ({ ...x, submission: r.submission })); }
    }, 2500);
    return () => clearTimeout(t);
  }, [answers, dirty, auto, d]);
  // مغادرة الشاشة قبل أن يلحقها الحفظ التلقائي تدفع المسودة، وإغلاق الصفحة يحذّر
  useUnsavedGuard(dirty && !!auto, () => call('models.save', { id: d.model.id, answers, submit: false }));

  // فشل التحميل: إعادة المحاولة والرجوع، لا رسالة وحدها (فحص الجاهزية p-entry-5)
  if (!d) {
    return msg ? (
      <div className="stack">
        <ErrorBox message={msg.err} onRetry={() => { setMsg(null); setAttempt((n) => n + 1); }} />
        {onBack && <div className="row"><button className="link small" onClick={onBack}>→ {backLabel}</button></div>}
      </div>
    ) : <div className="center-load"><div className="spinner" /></div>;
  }
  const m = d.model;
  const locked = s?.status === 'reviewed' || capLocked;
  const initiative = d.initiative;
  const dim = DIMENSIONS.find((x) => x.key === m.dimension);
  const req = m.fields.filter((f) => f.required !== false);
  const filled = req.filter((f) => filledOf(f, answers[f.key], initiative)).length;
  const pct = req.length ? Math.round((filled / req.length) * 100) : 100;
  const step = !s || s.status === 'draft' ? (filled ? 1 : 0) : s.status === 'returned' ? 1 : s.status === 'submitted' ? 2 : 3;

  const save = async (submit) => {
    setBusy(submit ? 'submit' : 'save'); setMsg(null);
    const r = await call('models.save', { id: m.id, answers, submit });
    setBusy('');
    if (!r.success) return setMsg({ err: r.message });
    setD({ ...d, submission: r.submission });
    setDirty(false); setSavedAt(new Date());
    setMsg({ ok: submit ? (r.gained ? `سُلّم النموذج، و+${r.gained} نقطة أضيفت إلى رصيدك.` : 'سُلّم النموذج للمستشار.') : 'حُفظت المسودة.' });
    if (submit) onPoints(r);
  };
  const set = (k, v) => { setAnswers((a) => ({ ...a, [k]: v })); setDirty(true); };

  return (
    <div className="model">
      <button className="link small" onClick={onBack}>→ {backLabel}</button>
      {d.capstone && <p className="alert info small">هذا فصل في وثيقة مبادرتك{capLocked ? '، والوثيقة عند المراجعة أو معتمدة فلا يُعدَّل الآن.' : '. ما تكتبه هنا يظهر في الوثيقة كما هو.'}</p>}
      <ol className="mstepper">
        {STEPS.map((t, i) => <li key={t} className={i < step ? 'past' : i === step ? 'now' : ''}><span>{i < step ? '✓' : i + 1}</span>{t}</li>)}
      </ol>
      <header className="model-hero">
        <span className="model-icon">{m.icon || '◆'}</span>
        <div>
          <small>{dim?.short} · {dim?.title} · من مستوى {levelOf(m.min_level).title} · <span className="mcode">{codeOf(m)}</span></small>
          <h2>{m.title_ar}</h2>
          <p>{m.summary_ar}</p>
        </div>
        <span className="model-pts"><b>{m.points}</b>نقطة</span>
      </header>

      <div className="model-grid">
        <aside className="model-guide">
          <section>
            <span className="mg-cap">دليل الاستخدام</span>
            {m.when_ar && <><h4>متى تستخدمه</h4><p>{m.when_ar}</p></>}
            {m.steps_ar && <><h4>الخطوات</h4><ol>{m.steps_ar.split('\n').filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ol></>}
            {m.source_ar && <p className="model-src">{m.source_ar}</p>}
          </section>
          <section>
            <span className="mg-cap">علامات النموذج الجيد</span>
            <p className="muted small">يقيّم المستشار تسليمك بالنجوم وملاحظات مكتوبة.</p>
            <ul className="mrubric">{RUBRIC.map(([t, x]) => <li key={t}><b>{t}</b>{x}</li>)}</ul>
          </section>
          {s && s.status !== 'draft' && (
            <section className="mg-status">
              <div className={`chip ${STATUS[s.status].c}`}>{STATUS[s.status].t}</div>
              {s.rating && <div className="model-rate"><span>{rubricLevelAr(s.rating)}</span>{s.bonus ? <b>+{s.bonus} نقطة تميّز</b> : null}</div>}
              {s.feedback_ar && <blockquote className="model-fb"><b>ملاحظات المستشار</b>{s.feedback_ar}</blockquote>}
            </section>
          )}
        </aside>

        <form className="model-form wsheet" onSubmit={(e) => { e.preventDefault(); save(true); }}>
          <header className="ws-head">
            <img src={logoDark} alt="Milestone Impact" />
            <div><span>ورقة عمل · {codeOf(m)}</span><b>{m.title_ar}</b></div>
            <dl><dt>القائد</dt><dd>{name}</dd><dt>التاريخ</dt><dd>{new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></dl>
          </header>
          {m.fields.map((f, i) => {
            const ok = filledOf(f, answers[f.key], initiative);
            // التسمية مربوطة بالحقل: htmlFor لحقل الكتابة، وaria-labelledby لمجموعة الاختيار والجدول (فحص الجاهزية p-entry-8)
            const fid = `${uid}-${f.key}`;
            const single = f.bind === 'initiative' || !['select', 'table'].includes(f.type);
            return (
              <div key={f.key} className={`mf mf-${f.type}${ok ? ' ok' : ''}`}>
                <label id={`${fid}-l`} htmlFor={single ? fid : undefined}><span className="mf-n" aria-hidden="true">{ok ? '✓' : i + 1}</span><span><b>{f.label}{f.required === false && <small className="mf-opt"> (اختياري)</small>}</b>{f.hint && <small>{isoLtr(f.hint)}</small>}</span></label>
                {!locked && <FieldGuide g={guideFor(m.key, f.key, m.level, d.sector)} />}
                <Field f={f} id={single ? fid : undefined} labelId={`${fid}-l`} locked={locked} value={answers[f.key]} onChange={(v) => set(f.key, v)} initiative={initiative} imp={d.imports?.[f.key]} />
                {/* المثال للتعلم لا للنقل: تنبيه لا يمنع، ويراه المستشار في مراجعة الوثيقة أيضًا (example-check.js) */}
                {!locked && nearCopy(answers[f.key], exampleFor(m.key, f.key, d.sector)?.value) && <p className="alert warn small" role="status">هذا قريب جدًا من المثال المحلول. اكتبه من واقع مبادرتك، فالمستشار يرى هذا التنبيه أيضًا.</p>}
                {/* بريد الراعي اختياري، لكن الناقص منه لا يصله طلب التأييد: يُنبَّه عند الكتابة لا في فحوص الوثيقة لاحقًا */}
                {f.key === 'sponsor_email' && String(answers[f.key] || '').trim() && !isEmail(String(answers[f.key]).trim()) && <p className="alert err small" role="alert">هذا البريد غير مكتمل، فلن يصل الراعي طلب التأييد. صحّحه أو اتركه فارغًا.</p>}
              </div>
            );
          })}
          {msg?.err && <div className="alert err">{msg.err}</div>}
          {msg?.ok && <div className="alert ok">{msg.ok}</div>}
          <div className="ws-bar">
            <div className="ws-prog">
              <span><b>{filled}</b> من {req.length} حقول مكتملة</span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              <small>{capLocked ? 'فصل في وثيقة مسلّمة' : locked ? 'نموذج مقيّم ومغلق' : dirty ? 'تعديلات غير محفوظة…' : savedAt ? `محفوظ ${savedAt.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}` : 'يُحفظ تلقائيًا أثناء الكتابة'}</small>
            </div>
            {!locked && (
              <div className="row model-acts">
                <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'لحظة…' : 'حفظ'}</button>
                <button className="btn gold" disabled={!!busy || filled < req.length}>{busy === 'submit' ? 'لحظة…' : s?.status === 'submitted' ? 'تحديث التسليم' : `تسليم للمستشار · ${m.points} نقطة`}</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const FILTERS = [['all', 'الكل'], ['new', 'لم تبدأ'], ['draft', 'قيد العمل'], ['submitted', 'بانتظار التقييم'], ['reviewed', 'مقيّمة']];
const stateOf = (m) => (!m.submission ? 'new' : m.submission.status === 'returned' ? 'draft' : m.submission.status);

export function Models({ name, onPoints }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');
  const load = () => call('models.list').then((r) => setD(r));
  useEffect(() => { load(); }, []);

  if (open) return <ModelView id={open} name={name} onBack={() => { setOpen(null); load(); }} onPoints={onPoints} />;
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="alert err">{d.message}</div>;
  const all = d.models;
  const count = (k) => (k === 'all' ? all.length : all.filter((m) => stateOf(m) === k).length);
  const rated = all.filter((m) => m.submission?.rating);
  const avg = rated.length ? (rated.reduce((a, m) => a + m.submission.rating, 0) / rated.length).toFixed(1) : null;
  const earned = all.filter((m) => m.submission && m.submission.status !== 'draft').reduce((a, m) => a + m.points + (m.submission.bonus || 0), 0);
  const avail = all.reduce((a, m) => a + m.points, 0);

  return (
    <div className="models">
      <section className="models-intro">
        <div>
          <span className="book-eyebrow">The Practice Library</span>
          <h2>مكتبة النماذج التعليمية</h2>
          <p className="muted">أدوات عمل مستلهمة من مراجع عالمية مثل PMBOK وPRINCE2 ونظرية التغيير، مكيّفة لمسارك. تطبّق كل نموذج على مشروعك الحقيقي، ويقيّمه مستشارك بمعايير معلنة.</p>
        </div>
        <div className="models-kpis">
          <span><b>{count('submitted') + count('reviewed')}<small>/{all.length}</small></b>مسلّمة</span>
          <span><b>{earned}<small>/{avail}</small></b>نقطة من النماذج</span>
          <span><b>{avg || '—'}</b>متوسط تقييمك</span>
        </div>
      </section>
      <nav className="mfilter">
        {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}<i>{count(k)}</i></button>)}
      </nav>
      {DIMENSIONS.map((dim) => {
        const items = all.filter((m) => m.dimension === dim.key && (filter === 'all' || stateOf(m) === filter));
        if (!items.length) return null;
        return (
          <section key={dim.key} className="models-part">
            <h3><span>{dim.short}</span>{dim.title}</h3>
            <div className="models-grid">
              {items.map((m) => {
                const st = m.submission ? STATUS[m.submission.status] : null;
                const pr = m.progress || { filled: 0, total: 0 };
                const p = pr.total ? Math.round((pr.filled / pr.total) * 100) : 0;
                return (
                  <button key={m.id} className={`mcard${st ? ` is-${m.submission.status}` : ''}`} onClick={() => setOpen(m.id)}>
                    <span className="mcard-top">
                      <span className="model-icon sm">{m.icon || '◆'}</span>
                      <span className="mcard-code">{codeOf(m)}</span>
                      <span className="chip gold">{m.points} نقطة</span>
                    </span>
                    <b>{m.title_ar}</b>
                    {m.capstone && <span className="mcard-cap">فصل في وثيقة المبادرة</span>}
                    <span className="mcard-sum">{m.summary_ar}</span>
                    <span className="mcard-prog"><span className="bar"><i style={{ width: `${m.submission && m.submission.status !== 'draft' && m.submission.status !== 'returned' ? 100 : p}%` }} /></span><small>{m.fields_n || pr.total} حقول · من {levelOf(m.min_level).title}</small></span>
                    <span className="mcard-foot">
                      {st ? <span className={`chip ${st.c}`}>{st.t}</span> : <span className="chip">لم تبدأ</span>}
                      {m.submission?.rating ? <span className="mcard-level">{rubricLevelAr(m.submission.rating)}</span> : <span className="mcard-go">افتح ←</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!all.some((m) => filter === 'all' || stateOf(m) === filter) && <p className="muted">لا نماذج في هذا التصنيف.</p>}
    </div>
  );
}

export function Wins() {
  const [d, setD] = useState(null);
  useEffect(() => { call('achievements').then(setD); }, []);
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="alert err">{d.message}</div>;
  return (
    <div className="wins">
      <section className="wins-ladder">
        <h2>سلّم الألقاب</h2>
        <ol>
          {RANKS.map(({ title: t, min }, i) => (
            <li key={t} className={i < d.rank.index ? 'past' : i === d.rank.index ? 'now' : ''}>
              <span className="wl-dot">{i < d.rank.index ? '✓' : i + 1}</span>
              <b>{t}</b><small>{min} نقطة</small>
            </li>
          ))}
        </ol>
        <ul className="muted small wins-how">
          <li>إتمام الباب: {POINTS.chapter} · الإجابة الصحيحة: {POINTS.perCorrect} · التأمل: {POINTS.reflection}</li>
          <li>تسليم النموذج التعليمي: حسب النموذج</li>
          <li>إتقان أداة في المختبر: حسب الأداة</li>
          <li>اعتماد وثيقة المبادرة: {APPROVAL_POINTS}</li>
          <li>تميّز يمنحه مستشارك</li>
        </ul>
      </section>
      <section className="wins-log">
        <h2>سجل نقاطك <span className="muted">{d.total} نقطة</span></h2>
        {d.ledger.length ? (
          <ul>
            {d.ledger.map((r, i) => (
              <li key={i}><span className="wl-pts">+{r.points}</span><div><b>{r.note || SOURCE[r.source]}</b><small>{SOURCE[r.source]} · {date(r.created_at)}</small></div></li>
            ))}
          </ul>
        ) : <p className="muted">ابدأ بأول باب في الكتيب، وستظهر نقاطك هنا.</p>}
      </section>
    </div>
  );
}
