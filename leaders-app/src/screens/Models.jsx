// ════════════════════════════════════════════════════════════════
// النماذج التعليمية وإنجازاتي داخل كتاب القائد
// ════════════════════════════════════════════════════════════════
// كل نموذج أداة عمل يملؤها المشارك على مشروعه الحقيقي: مسودة تُحفظ،
// ثم تسليم يمنح نقاط النموذج مرة واحدة، ثم تقييم المستشار وملاحظاته.
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { DIMENSIONS, levelOf } from '../labels.js';

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

function ModelView({ id, onBack, onPoints }) {
  const [d, setD] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    call('models.get', { id }).then((r) => {
      if (!r.success) return setMsg({ err: r.message });
      setD(r);
      setAnswers(r.submission?.answers || {});
    });
  }, [id]);

  if (!d) return msg ? <div className="alert err">{msg.err}</div> : <div className="center-load"><div className="spinner" /></div>;
  const { model: m, submission: s } = d;
  const locked = s?.status === 'reviewed';
  const dim = DIMENSIONS.find((x) => x.key === m.dimension);

  const save = async (submit) => {
    setBusy(submit ? 'submit' : 'save'); setMsg(null);
    const r = await call('models.save', { id: m.id, answers, submit });
    setBusy('');
    if (!r.success) return setMsg({ err: r.message });
    setD({ ...d, submission: r.submission });
    setMsg({ ok: submit ? (r.gained ? `سُلّم النموذج، و+${r.gained} نقطة أضيفت إلى رصيدك.` : 'سُلّم النموذج للمستشار.') : 'حُفظت المسودة.' });
    if (submit) onPoints(r);
  };

  return (
    <div className="model">
      <button className="link small" onClick={onBack}>→ كل النماذج</button>
      <header className="model-hero">
        <span className="model-icon">{m.icon || '◆'}</span>
        <div>
          <small>{dim?.short} · {dim?.title} · من مستوى {levelOf(m.min_level).title}</small>
          <h2>{m.title_ar}</h2>
          <p>{m.summary_ar}</p>
        </div>
        <span className="model-pts"><b>{m.points}</b>نقطة</span>
      </header>

      <div className="model-grid">
        <aside className="model-guide">
          {m.when_ar && <><h4>متى تستخدمه</h4><p>{m.when_ar}</p></>}
          {m.steps_ar && <><h4>الخطوات</h4><ol>{m.steps_ar.split('\n').filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ol></>}
          {m.source_ar && <p className="model-src">{m.source_ar}</p>}
          {s && <div className={`chip ${STATUS[s.status].c}`}>{STATUS[s.status].t}</div>}
          {s?.rating && <div className="model-rate"><span>{stars(s.rating)}</span>{s.bonus ? <b>+{s.bonus} نقطة تميّز</b> : null}</div>}
          {s?.feedback_ar && <blockquote className="model-fb"><b>ملاحظات المستشار</b>{s.feedback_ar}</blockquote>}
        </aside>

        <form className="model-form" onSubmit={(e) => { e.preventDefault(); save(true); }}>
          {m.fields.map((f) => (
            <div key={f.key} className={`mf mf-${f.type}`}>
              <label><b>{f.label}</b>{f.hint && <small>{f.hint}</small>}</label>
              <Field f={f} locked={locked} value={answers[f.key]} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
            </div>
          ))}
          {msg?.err && <div className="alert err">{msg.err}</div>}
          {msg?.ok && <div className="alert ok">{msg.ok}</div>}
          {!locked && (
            <div className="row model-acts">
              <button type="button" className="btn ghost" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'لحظة…' : 'حفظ مسودة'}</button>
              <button className="btn gold" disabled={!!busy}>{busy === 'submit' ? 'لحظة…' : s?.status === 'submitted' ? 'تحديث التسليم' : `تسليم للمستشار · ${m.points} نقطة`}</button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export function Models({ onPoints }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => call('models.list').then((r) => setD(r));
  useEffect(() => { load(); }, []);

  if (open) return <ModelView id={open} onBack={() => { setOpen(null); load(); }} onPoints={onPoints} />;
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  if (!d.success) return <div className="alert err">{d.message}</div>;
  const done = d.models.filter((m) => m.submission && m.submission.status !== 'draft').length;

  return (
    <div className="models">
      <div className="models-intro">
        <div>
          <h2>النماذج التعليمية</h2>
          <p className="muted">أدوات عمل عالمية مكيّفة لمسارك. املأ كل نموذج على مشروعك الحقيقي، وسلّمه لمستشارك ليقيّمه. كل تسليم يضيف نقاطه إلى رصيدك.</p>
        </div>
        <div className="models-count"><b>{done}</b><small>من {d.models.length} مسلّمة</small></div>
      </div>
      {DIMENSIONS.map((dim) => {
        const items = d.models.filter((m) => m.dimension === dim.key);
        if (!items.length) return null;
        return (
          <section key={dim.key} className="models-part">
            <h3><span>{dim.short}</span>{dim.title}</h3>
            <div className="models-grid">
              {items.map((m) => {
                const st = m.submission ? STATUS[m.submission.status] : null;
                return (
                  <button key={m.id} className={`mcard${st ? ` is-${m.submission.status}` : ''}`} onClick={() => setOpen(m.id)}>
                    <span className="mcard-top"><span className="model-icon sm">{m.icon || '◆'}</span><span className="chip gold">{m.points} نقطة</span></span>
                    <b>{m.title_ar}</b>
                    <span className="mcard-sum">{m.summary_ar}</span>
                    <span className="mcard-foot">
                      {st ? <span className={`chip ${st.c}`}>{st.t}</span> : <span className="chip">لم تبدأ بعد</span>}
                      {m.submission?.rating ? <span className="stars">{stars(m.submission.rating)}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
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
