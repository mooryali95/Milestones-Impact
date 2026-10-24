// ════════════════════════════════════════════════════════════════
// النماذج التعليمية وإنجازاتي داخل كتاب القائد
// ════════════════════════════════════════════════════════════════
// كل نموذج أداة عمل يملؤها المشارك على مشروعه الحقيقي: مسودة تُحفظ،
// ثم تسليم يمنح نقاط النموذج مرة واحدة، ثم تقييم المستشار وملاحظاته.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { DIMENSIONS, levelOf } from '../labels.js';
import logoDark from '../milestone-impact.svg';

const STATUS = {
  draft: { t: 'مسودة', c: 'warn' },
  submitted: { t: 'بانتظار تقييم المستشار', c: 'gold' },
  returned: { t: 'أُعيد إليك للتطوير', c: 'bad' },
  reviewed: { t: 'قُيّم', c: 'ok' },
};
const RANKS = ['مستكشف', 'ممارس', 'متمكّن', 'قائد أثر', 'سفير الأثر'];
const RANK_AT = [0, 75, 200, 400, 650];
const SOURCE = { chapter: 'إتمام باب', model: 'تسليم نموذج', review: 'تميّز من المستشار', bonus: 'مكافأة' };
const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const date = (d) => (d ? new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short' }) : '');

function Field({ f, value, onChange, locked }) {
  if (f.type === 'select') {
    return (
      <div className="seg-opts">
        {f.options.map((o) => (
          <button key={o} type="button" disabled={locked} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>
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
        <table className="mtable">
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
        {!locked && <button type="button" className="link small" onClick={() => onChange([...rows, cols.map(() => '')])}>+ صف</button>}
      </div>
    );
  }
  if (f.type === 'textarea') return <textarea className="input" rows={4} disabled={locked} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  return <input className="input" disabled={locked} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
}

// هل اكتمل الحقل؟ نفس قاعدة الخادم قبل التسليم
const filledOf = (f, v) => (f.type === 'table'
  ? (Array.isArray(v) ? v : []).filter((r) => Array.isArray(r) && String(r[0] || '').trim()).length >= (f.min_rows || 1)
  : !!String(v ?? '').trim());
const codeOf = (m) => `${(DIMENSIONS.find((x) => x.key === m.dimension)?.short || 'M')[0]}-${String(m.sort || 1).padStart(2, '0')}`;
// معايير يقيّم بها المستشار كل نموذج
const RUBRIC = [
  ['الاكتمال', 'كل حقل مملوء بما يكفي ليُفهم دون شرح شفهي.'],
  ['التحديد', 'أرقام وتواريخ وأسماء أدوار، لا عبارات عامة.'],
  ['الارتباط بمشروعك', 'مبني على مشروع تقوده فعلًا، لا على مثال افتراضي.'],
  ['جودة القرار', 'يظهر فيه منطقك: لماذا هذا الترتيب، وما الذي ستفعله بالنتيجة.'],
];
const STEPS = ['افهم النموذج', 'طبّقه على مشروعك', 'سلّمه للمستشار', 'التقييم والملاحظات'];

function ModelView({ id, name, onBack, onPoints }) {
  const [d, setD] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    call('models.get', { id }).then((r) => {
      if (!r.success) return setMsg({ err: r.message });
      setD(r);
      setAnswers(r.submission?.answers || {});
      if (r.submission?.updated_at) setSavedAt(new Date(r.submission.updated_at));
    });
  }, [id]);

  const s = d?.submission;
  const auto = d && (!s || s.status === 'draft' || s.status === 'returned');
  // حفظ تلقائي للمسودة بعد ثوانٍ من آخر تعديل
  useEffect(() => {
    if (!dirty || !auto) return undefined;
    const t = setTimeout(async () => {
      const r = await call('models.save', { id: d.model.id, answers, submit: false });
      if (r.success) { setDirty(false); setSavedAt(new Date()); setD((x) => ({ ...x, submission: r.submission })); }
    }, 2500);
    return () => clearTimeout(t);
  }, [answers, dirty, auto, d]);

  if (!d) return msg ? <div className="alert err">{msg.err}</div> : <div className="center-load"><div className="spinner" /></div>;
  const m = d.model;
  const locked = s?.status === 'reviewed';
  const dim = DIMENSIONS.find((x) => x.key === m.dimension);
  const req = m.fields.filter((f) => f.required !== false);
  const filled = req.filter((f) => filledOf(f, answers[f.key])).length;
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
      <button className="link small" onClick={onBack}>→ مكتبة النماذج</button>
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
            <span className="mg-cap">معايير التقييم</span>
            <ul className="mrubric">{RUBRIC.map(([t, x]) => <li key={t}><b>{t}</b>{x}</li>)}</ul>
          </section>
          {s && s.status !== 'draft' && (
            <section className="mg-status">
              <div className={`chip ${STATUS[s.status].c}`}>{STATUS[s.status].t}</div>
              {s.rating && <div className="model-rate"><span>{stars(s.rating)}</span>{s.bonus ? <b>+{s.bonus} نقطة تميّز</b> : null}</div>}
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
            const ok = filledOf(f, answers[f.key]);
            return (
              <div key={f.key} className={`mf mf-${f.type}${ok ? ' ok' : ''}`}>
                <label><span className="mf-n">{ok ? '✓' : i + 1}</span><span><b>{f.label}{f.required === false && <small className="mf-opt"> (اختياري)</small>}</b>{f.hint && <small>{f.hint}</small>}</span></label>
                <Field f={f} locked={locked} value={answers[f.key]} onChange={(v) => set(f.key, v)} />
              </div>
            );
          })}
          {msg?.err && <div className="alert err">{msg.err}</div>}
          {msg?.ok && <div className="alert ok">{msg.ok}</div>}
          <div className="ws-bar">
            <div className="ws-prog">
              <span><b>{filled}</b> من {req.length} حقول مكتملة</span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              <small>{locked ? 'نموذج مقيّم ومغلق' : dirty ? 'تعديلات غير محفوظة…' : savedAt ? `محفوظ ${savedAt.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}` : 'يُحفظ تلقائيًا أثناء الكتابة'}</small>
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
                    <span className="mcard-sum">{m.summary_ar}</span>
                    <span className="mcard-prog"><span className="bar"><i style={{ width: `${m.submission && m.submission.status !== 'draft' && m.submission.status !== 'returned' ? 100 : p}%` }} /></span><small>{m.fields_n || pr.total} حقول · من {levelOf(m.min_level).title}</small></span>
                    <span className="mcard-foot">
                      {st ? <span className={`chip ${st.c}`}>{st.t}</span> : <span className="chip">لم تبدأ بعد</span>}
                      {m.submission?.rating ? <span className="stars">{stars(m.submission.rating)}</span> : <span className="mcard-go">افتح ←</span>}
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
          {RANKS.map((t, i) => (
            <li key={t} className={i < d.rank.index ? 'past' : i === d.rank.index ? 'now' : ''}>
              <span className="wl-dot">{i < d.rank.index ? '✓' : i + 1}</span>
              <b>{t}</b><small>{RANK_AT[i]} نقطة</small>
            </li>
          ))}
        </ol>
        <p className="muted small">النقاط من إتمام الأبواب واختباراتها (10 للباب، و5 لكل إجابة صحيحة، و5 للتأمل)، ومن تسليم النماذج التعليمية، ومن نقاط التميّز التي يمنحها مستشارك.</p>
      </section>
      <section className="wins-log">
        <h2>سجل نقاطك <span className="muted">{d.total} نقطة</span></h2>
        {d.ledger.length ? (
          <ul>
            {d.ledger.map((r, i) => (
              <li key={i}><span className="wl-pts">+{r.points}</span><div><b>{r.note || SOURCE[r.source]}</b><small>{SOURCE[r.source]} · {date(r.created_at)}</small></div></li>
            ))}
          </ul>
        ) : <p className="muted">ابدأ بأول باب في الكتاب، وستظهر نقاطك هنا.</p>}
      </section>
    </div>
  );
}
