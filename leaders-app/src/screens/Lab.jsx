// ════════════════════════════════════════════════════════════════
// مختبر القائد: قسم مستقل في المنصة، فيه أدوات العمل ومواقف المحاكاة
// ════════════════════════════════════════════════════════════════
// الخادم يرسل الخطوات بلا حلولها، ويصحح كل خطوة عند إرسالها ويحدد
// التالية (قد يتفرع الموقف بحسب القرار). كل التفاعل بالنقر لا بالسحب،
// فيعمل باللمس على الجوال. يظهر لمن فتحته له الإدارة أو لجهته، وتحت كل
// باب في الكتيب بطاقات "طبّق ما قرأت" للأدوات المرتبطة به.
import React, { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { DIMENSIONS, dimOf, levelOf } from '../labels.js';
import { computeSchedule, EXCELLENCE, KINDS, LINK_LABEL, LINK_TYPES, MASTERY } from '../../../supabase/functions/leaders-api/lab.js';

const pctOf = (s) => Math.round((Number(s) || 0) * 100);
const tone = (p) => (p >= EXCELLENCE ? 'ok' : p >= MASTERY ? 'gold' : p >= 40 ? 'warn' : 'bad');
const labelOf = (list, id) => (list || []).find((x) => x.id === id)?.label || id;

// ── لوحة مؤشرات الموقف ──
function Meters({ meters, values, prev }) {
  if (!meters?.length) return null;
  return (
    <div className="lab-meters" aria-label="مؤشرات الموقف">
      {meters.map((m) => {
        const v = values?.[m.id] ?? m.start;
        const d = prev ? v - (prev[m.id] ?? v) : 0;
        return (
          <div key={m.id} className="lab-meter">
            <span>{m.label}</span>
            <span className="bar"><i className={v < 35 ? 'low' : ''} style={{ width: `${v}%` }} /></span>
            <b>{v}{d ? <em className={d > 0 ? 'up' : 'down'}>{d > 0 ? `+${d}` : d}</em> : null}</b>
          </div>
        );
      })}
    </div>
  );
}

// ── مخطط جانت: من الأنشطة والاعتماديات، والمسار الحرج بلون مميز ──
export function Gantt({ tasks, links, title }) {
  const plan = useMemo(() => computeSchedule(tasks, links), [tasks, links]);
  if (plan.cycle) return <div className="alert err">في الاعتماديات حلقة مغلقة: نشاط ينتظر نفسه. احذف إحدى الاعتماديات.</div>;
  const total = Math.max(plan.duration, 1);
  // الزمن يجري من اليمين إلى اليسار، والأسماء في عمود على اليمين
  const W = 640; const L = 170; const rowH = 30; const H = tasks.length * rowH + 34;
  const x = (d) => W - L - ((W - L - 16) * d) / total;
  const step = total > 120 ? 30 : total > 50 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const crit = new Set(plan.critical);
  return (
    <figure className="lab-gantt">
      {title && <figcaption>{title}<span>المدة {plan.duration} يومًا</span></figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} direction="rtl" role="img" aria-label={`مخطط زمني مدته ${plan.duration} يومًا`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1="20" y2={H - 4} className="g-grid" />
            <text x={x(t)} y="13" textAnchor="middle" className="g-tick">{t}</text>
          </g>
        ))}
        {tasks.map((t, i) => {
          const r = plan.rows[t.id];
          const y = 26 + i * rowH;
          const c = crit.has(t.id);
          return (
            <g key={t.id}>
              <text x={W - 8} y={y + 15} textAnchor="start" className={`g-name${c ? ' crit' : ''}`}>{t.label}</text>
              {r.float > 0 && <line x1={x(r.lf)} x2={x(r.ef)} y1={y + 11} y2={y + 11} className="g-float" />}
              {t.dur === 0
                ? <path d={`M${x(r.es)} ${y + 3}l8 8l-8 8l-8 -8z`} className={c ? 'g-crit' : 'g-bar'} />
                : <rect x={x(r.ef)} y={y + 4} width={Math.max(2, x(r.es) - x(r.ef))} height="15" rx="4" className={c ? 'g-crit' : 'g-bar'} />}
            </g>
          );
        })}
      </svg>
      <div className="lab-legend"><span><i className="crit" />المسار الحرج</span><span><i />له فائض زمني</span><span><i className="float" />الفائض الزمني</span></div>
    </figure>
  );
}

// ── الخطوات: كل نوع يبني إجابته، ويعرض الحل بعد التصحيح ──
function OrderStep({ step, value, onChange, result }) {
  const list = value || step.items.map((x) => x.id);
  useEffect(() => { if (!value) onChange(list); }, []);
  const move = (i, d) => { const a = [...list]; [a[i], a[i + d]] = [a[i + d], a[i]]; onChange(a); };
  return (
    <ol className="lab-order">
      {list.map((id, i) => {
        const right = result ? result.solution?.[i] === id : null;
        return (
          <li key={id} className={right === null ? '' : right ? 'is-ok' : 'is-bad'}>
            <span className="lab-n">{i + 1}</span>
            <span className="grow">{labelOf(step.items, id)}{result && !right ? <small>الصحيح هنا: {labelOf(step.items, result.solution?.[i])}</small> : null}</span>
            {!result && (
              <span className="lab-move">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="أعلى">▲</button>
                <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="أسفل">▼</button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PickStep({ items, options, value, onChange, result, solution }) {
  const a = value || {};
  const noteOf = (id) => (result?.notes || []).find((n) => n.id === id)?.note_ar;
  return (
    <div className="lab-picks">
      {items.map((it) => {
        const mine = a[it.id];
        const right = result ? solution?.[it.id] === mine : null;
        return (
          <div key={it.id} className={`lab-pick${right === null ? '' : right ? ' is-ok' : ' is-bad'}`}>
            <p>{it.label}</p>
            <div className="seg-opts">
              {options.map((o) => (
                <button key={o.id} type="button" disabled={!!result}
                  className={`${mine === o.id ? 'on' : ''}${result && solution?.[it.id] === o.id && mine !== o.id ? ' answer' : ''}`}
                  onClick={() => onChange({ ...a, [it.id]: o.id })}>{o.label}</button>
              ))}
            </div>
            {result && !right && noteOf(it.id) && <small className="lab-note">{noteOf(it.id)}</small>}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceStep({ step, value, onChange, result }) {
  return (
    <div className="lab-choices" role="radiogroup">
      {step.options.map((o) => {
        const mine = value === o.id;
        const best = result?.solution?.includes(o.id);
        return (
          <button key={o.id} type="button" role="radio" aria-checked={mine} disabled={!!result}
            className={`lab-choice${mine ? ' on' : ''}${result && best ? ' best' : ''}${result && mine && !best ? ' is-bad' : ''}`}
            onClick={() => onChange(o.id)}>
            {o.label}
            {result && best && !mine && <small>الأفضل هنا</small>}
          </button>
        );
      })}
    </div>
  );
}

function AllocateStep({ step, value, onChange, result }) {
  const a = value || {};
  const sum = step.items.reduce((s, it) => s + (Number(a[it.id]) || 0), 0);
  return (
    <div className="lab-alloc">
      {step.items.map((it) => (
        <label key={it.id} className="lab-alloc-row">
          <span className="grow">{it.label}</span>
          <input type="range" min="0" max={step.total} step="5" disabled={!!result} value={Number(a[it.id]) || 0}
            onChange={(e) => onChange({ ...a, [it.id]: Number(e.target.value) })} aria-label={it.label} />
          <input type="number" className="input" min="0" max={step.total} disabled={!!result} value={a[it.id] ?? ''}
            onChange={(e) => onChange({ ...a, [it.id]: e.target.value === '' ? '' : Number(e.target.value) })} />
          {result && <small className="lab-ideal">المقترح {result.solution?.[it.id] ?? 0}</small>}
        </label>
      ))}
      <p className={`lab-sum${sum === step.total ? ' ok' : ''}`}>المجموع {sum} من {step.total} {step.unit_ar}</p>
    </div>
  );
}

function ScheduleStep({ step, value, onChange, result }) {
  const links = value?.links || [];
  const [f, setF] = useState({ from: '', type: 'FS', to: '', lag: 0 });
  const set = (l) => onChange({ links: l });
  const add = () => {
    if (!f.from || !f.to || f.from === f.to) return;
    set([...links, { ...f, lag: Number(f.lag) || 0 }]);
    setF({ ...f, to: '', lag: 0 });
  };
  const name = (id) => labelOf(step.tasks, id);
  return (
    <div className="lab-sched">
      {step.rules_ar?.length > 0 && (
        <ol className="lab-rules">{step.rules_ar.map((r, i) => <li key={i}>{r}</li>)}</ol>
      )}
      {!result && (
        <div className="lab-linkform">
          <select className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="من">
            <option value="">من النشاط…</option>
            {step.tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="نوع الاعتمادية">
            {LINK_TYPES.map((t) => <option key={t} value={t}>{t} · {LINK_LABEL[t]}</option>)}
          </select>
          <select className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="إلى">
            <option value="">إلى النشاط…</option>
            {step.tasks.filter((t) => t.id !== f.from).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label className="lab-lag">إزاحة <input className="input" type="number" value={f.lag} onChange={(e) => setF({ ...f, lag: e.target.value })} /> يوم</label>
          <button type="button" className="btn sm" disabled={!f.from || !f.to} onClick={add}>أضف</button>
        </div>
      )}
      {links.length > 0 && (
        <ul className="lab-links">
          {links.map((l, i) => (
            <li key={i}>
              <span>{name(l.from)}</span><b dir="ltr">{l.type}{l.lag ? ` ${l.lag > 0 ? '+' : ''}${l.lag}` : ''}</b><span>{name(l.to)}</span>
              {!result && <button type="button" className="mt-x" aria-label="حذف" onClick={() => set(links.filter((_, j) => j !== i))}>×</button>}
            </li>
          ))}
        </ul>
      )}
      <Gantt tasks={step.tasks} links={links} title={result ? 'جدولك' : 'المخطط الحي'} />
      {result && (
        <>
          <p className="small">أصبت {result.right} من {result.expected_n} اعتمادية{result.extra ? `، وأضفت ${result.extra} لا تفرضها القواعد` : ''}.</p>
          <Gantt tasks={step.tasks} links={result.solution} title="الجدول الصحيح" />
          <ul className="lab-links sol">
            {result.solution.map((l, i) => (
              <li key={i}><span>{name(l.from)}</span><b dir="ltr">{l.type}{l.lag ? ` +${l.lag}` : ''}</b><span>{name(l.to)}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PlotStep({ step, value, onChange, result }) {
  const a = value || {};
  const [sel, setSel] = useState(null);
  const n = step.size;
  const at = (src, x, y) => step.items.filter((it) => { const p = src?.[it.id]; return p && p[0] === x && p[1] === y; });
  const place = (x, y) => { if (!sel || result) return; onChange({ ...a, [sel]: [x, y] }); setSel(null); };
  const left = step.items.filter((it) => !a[it.id]);
  const rows = Array.from({ length: n }, (_, i) => n - 1 - i);
  return (
    <div className="lab-plot">
      {!result && (
        <div className="lab-tray">
          {left.length ? left.map((it) => (
            <button key={it.id} type="button" className={`lab-token${sel === it.id ? ' on' : ''}`} onClick={() => setSel(sel === it.id ? null : it.id)}>{it.label}</button>
          )) : <span className="small muted">وُضعت كل العناصر. انقر عنصرًا في المصفوفة لتحريكه.</span>}
        </div>
      )}
      {sel && <p className="small lab-hint">اختر الخانة المناسبة لـ «{labelOf(step.items, sel)}»</p>}
      <div className="lab-grid-wrap">
        <div className="lab-grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {rows.map((y) => Array.from({ length: n }, (_, x) => (
            <div key={`${x}${y}`} role="button" tabIndex={result ? -1 : 0} className={`lab-cell${sel ? ' target' : ''}`}
              onClick={() => place(x, y)} onKeyDown={(e) => { if (e.key === 'Enter') place(x, y); }}
              aria-label={`${step.x_ar[x] || x}، ${step.y_ar[y] || y}`}>
              {step.cells_ar?.[y]?.[x] && <small className="lab-cell-name">{step.cells_ar[y][x]}</small>}
              {(x === 0 || y === 0) && <small className="lab-cell-axis">{x === 0 && step.y_ar[y]}{x === 0 && y === 0 && ' · '}{y === 0 && step.x_ar[x]}</small>}
              {at(a, x, y).map((it) => {
                const ok = result ? (result.solution?.[it.id] || [])[0] === x && result.solution[it.id][1] === y : null;
                return (
                  <button key={it.id} type="button" disabled={!!result}
                    className={`lab-token sm${sel === it.id ? ' on' : ''}${ok === null ? '' : ok ? ' is-ok' : ' is-bad'}`}
                    onClick={(e) => { e.stopPropagation(); setSel(it.id); }}>{it.label}</button>
                );
              })}
              {result && at(result.solution, x, y).filter((it) => !at(a, x, y).includes(it)).map((it) => (
                <span key={it.id} className="lab-token sm ghost">{it.label}</span>
              ))}
            </div>
          )))}
        </div>
      </div>
      {result && <p className="small muted">الخانة المنقّطة هي الموضع الصحيح إن اختلف عن اختيارك.</p>}
      {result?.notes?.map((x) => <small key={x.id} className="lab-note">{labelOf(step.items, x.id)}: {x.note_ar}</small>)}
    </div>
  );
}

function MatrixStep({ step, value, onChange, result }) {
  const a = value || {};
  const set = (r, c, v) => onChange({ ...a, [r]: { ...(a[r] || {}), [c]: v } });
  const broken = (r) => step.once_per_row.filter((v) => step.cols.filter((c) => a[r]?.[c.id] === v).length !== 1);
  return (
    <div className="mtable-wrap">
      <table className="mtable lab-matrix">
        <thead><tr><th>المهمة</th>{step.cols.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
        <tbody>
          {step.rows.map((r) => (
            <tr key={r.id}>
              <td className="lab-mrow">{r.label}{!result && broken(r.id).length > 0 && Object.keys(a[r.id] || {}).length > 0 && <small>يلزم صاحب قرار واحد ({broken(r.id).join('، ')}) بالضبط</small>}</td>
              {step.cols.map((c) => {
                const mine = a[r.id]?.[c.id] || '';
                const exp = result ? (result.solution?.[r.id]?.[c.id] || '') : null;
                return (
                  <td key={c.id} className={exp === null ? '' : exp === mine ? 'is-ok' : 'is-bad'}>
                    <select className="lab-cellsel" disabled={!!result} value={mine} onChange={(e) => set(r.id, c.id, e.target.value)} aria-label={`${r.label}، ${c.label}`}>
                      <option value="">—</option>
                      {step.values.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
                    </select>
                    {result && exp !== mine && <small className="lab-exp">{exp || '—'}</small>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{step.values.map((v) => v.label).join(' · ')}</p>
    </div>
  );
}

function StepBody(props) {
  const { step } = props;
  if (step.type === 'order') return <OrderStep {...props} />;
  if (step.type === 'classify') return <PickStep {...props} items={step.items} options={step.bins} solution={props.result?.solution} />;
  if (step.type === 'match') return <PickStep {...props} items={step.left} options={step.right} solution={props.result?.solution} />;
  if (step.type === 'choice') return <ChoiceStep {...props} />;
  if (step.type === 'allocate') return <AllocateStep {...props} />;
  if (step.type === 'schedule') return <ScheduleStep {...props} />;
  if (step.type === 'plot') return <PlotStep {...props} />;
  if (step.type === 'matrix') return <MatrixStep {...props} />;
  return null;
}

// هل اكتملت الإجابة بما يكفي للإرسال؟
function ready(step, v) {
  if (step.type === 'order') return Array.isArray(v);
  if (step.type === 'classify') return step.items.every((it) => v?.[it.id]);
  if (step.type === 'match') return step.left.every((it) => v?.[it.id]);
  if (step.type === 'choice') return !!v;
  if (step.type === 'allocate') return step.items.reduce((s, it) => s + (Number(v?.[it.id]) || 0), 0) === step.total;
  if (step.type === 'schedule') return (v?.links || []).length > 0;
  if (step.type === 'plot') return step.items.every((it) => v?.[it.id]);
  if (step.type === 'matrix') return step.rows.every((r) => Object.values(v?.[r.id] || {}).some(Boolean));
  return false;
}

function Feedback({ step, result }) {
  const p = pctOf(result.score);
  return (
    <div className={`lab-fb ${tone(p)}`}>
      <div className="lab-fb-head"><b>{result.ok ? 'إجابة متقنة' : p >= 50 ? 'قريب' : 'راجع هذه'}</b><span className={`chip ${tone(p)}`}>{p}%</span></div>
      {result.feedback_ar && <p>{result.feedback_ar}</p>}
      {result.then_ar && <p className="lab-then">{result.then_ar}</p>}
      {result.broken?.length > 0 && <p className="small">صفوف بلا صاحب قرار واحد: {result.broken.map((b) => labelOf(step.rows, b.row)).join('، ')}</p>}
      {result.why && <p className="lab-why"><b>لماذا</b>{result.why}</p>}
    </div>
  );
}

// ── تشغيل أداة أو موقف ──
function Runner({ id, onExit, onPoints }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState('intro');
  const [cur, setCur] = useState(0);
  const [answer, setAnswer] = useState(undefined);
  const [result, setResult] = useState(null);
  const [next, setNext] = useState(null);
  const [meters, setMeters] = useState(null);
  const [prevMeters, setPrevMeters] = useState(null);
  const [path, setPath] = useState([]);
  const [scores, setScores] = useState({});
  const [finish, setFinish] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (fresh) => {
    setErr(''); setD(null); setFinish(null); setResult(null); setAnswer(undefined); setPrevMeters(null);
    const r = await call('lab.start', { id, fresh });
    if (!r.success) return setErr(r.message);
    setD(r);
    setMeters(r.attempt.meters);
    setPath(r.attempt.path);
    setScores(Object.fromEntries(Object.entries(r.attempt.results || {}).map(([k, v]) => [k, v.score])));
    setCur(r.attempt.current);
    setPhase(r.attempt.path.length ? 'step' : 'intro');
  };
  useEffect(() => { load(false); }, [id]);

  if (err) return <div className="lab-run"><div className="alert err">{err}</div><button className="btn ghost sm" onClick={onExit}>→ المختبر</button></div>;
  if (!d) return <div className="center-load"><div className="spinner" /></div>;
  const { item, spec } = d;
  const step = spec.steps[cur];
  const dim = dimOf(item.dimension);

  const submit = async () => {
    setBusy(true);
    const r = await call('lab.answer', { attempt: d.attempt.id, step: cur, answer });
    setBusy(false);
    if (!r.success) {
      if (r.code === 'step' || r.code === 'finished') return load(false);
      return setErr(r.message);
    }
    setResult(r.result); setNext(r.next);
    setPrevMeters(meters); setMeters(r.meters);
    setPath((x) => [...x, cur]); setScores((s) => ({ ...s, [cur]: r.result.score }));
    if (r.finish) { setFinish(r.finish); onPoints?.({ gained: r.finish.gained }); }
  };
  const goNext = () => {
    setResult(null); setAnswer(undefined); setPrevMeters(null);
    if (next < 0 || finish) return setPhase('done');
    setCur(next);
    window.scrollTo({ top: document.querySelector('.lab-run')?.offsetTop - 70 || 0, behavior: 'smooth' });
  };

  return (
    <div className="lab-run">
      <div className="lab-hero">
        <div>
          <small>{KINDS[item.kind]} · {dim.title}</small>
          <h2>{item.title}</h2>
          {spec.role_ar && <p>دورك: {spec.role_ar}</p>}
        </div>
        <button className="link small lab-exit" onClick={onExit}>→ المختبر</button>
      </div>

      {phase !== 'done' && <Meters meters={spec.meters} values={meters} prev={prevMeters} />}

      {phase === 'intro' && (
        <div className="lab-card">
          <p className="lab-story">{spec.story_ar}</p>
          <p className="small muted">{spec.steps.length > 1 ? `${spec.steps.length} ${item.kind === 'scenario' ? 'قرارات وخطوات' : 'خطوات'} · ` : ''}نحو {item.minutes} دقيقة · {item.points} نقطة عند {MASTERY}%</p>
          <button className="btn gold" onClick={() => setPhase('step')}>ابدأ</button>
        </div>
      )}

      {phase === 'step' && step && (
        <div className="lab-card">
          <div className="lab-progress">
            {path.map((i) => <i key={i} className={tone(pctOf(scores[i]))} title={spec.steps[i].title_ar} />)}
            <i className="now" />
          </div>
          <small className="lab-step-n">{item.kind === 'scenario' ? 'الموقف' : 'الخطوة'} {path.length + (result ? 0 : 1)}</small>
          {step.title_ar && <h3>{step.title_ar}</h3>}
          {step.context_ar && <p className="lab-context">{step.context_ar}</p>}
          <p className="lab-prompt">{step.prompt_ar}</p>
          <StepBody key={cur} step={step} value={answer} onChange={setAnswer} result={result} />
          {result && <Feedback step={step} result={result} />}
          <div className="row lab-actions">
            {!result
              ? <button className="btn" disabled={busy || !ready(step, answer)} onClick={submit}>{busy ? 'يُصحَّح…' : 'أرسل الإجابة'}</button>
              : <button className="btn gold" onClick={goNext}>{next < 0 ? 'النتيجة' : 'التالي'}</button>}
          </div>
        </div>
      )}

      {phase === 'done' && finish && (
        <div className="lab-card lab-done">
          <div className={`lab-score ${tone(finish.pct)}`}><b>{finish.pct}%</b><small>{finish.pct >= EXCELLENCE ? 'تميّز' : finish.pct >= MASTERY ? 'إتقان' : 'دون عتبة الإتقان'}</small></div>
          {finish.gained > 0 && <p className="chip gold">+{finish.gained} نقطة</p>}
          {finish.first && <p className="small muted">هذه محاولتك الأولى، وتُحفظ قياسًا ابتدائيًا يُقارن به تقدمك.</p>}
          {finish.pct < MASTERY && <p className="small">تُمنح نقاط الأداة عند {MASTERY}%. أعد المحاولة بعد مراجعة الباب.</p>}
          <Meters meters={spec.meters} values={meters} />
          <ol className="lab-recap">
            {path.map((i) => <li key={i}><span>{spec.steps[i].title_ar || spec.steps[i].prompt_ar}</span><span className={`chip ${tone(pctOf(scores[i]))}`}>{pctOf(scores[i])}%</span></li>)}
          </ol>
          {finish.closing_ar && <p className="lab-why"><b>الخلاصة</b>{finish.closing_ar}</p>}
          <div className="row">
            <button className="btn" onClick={() => load(true)}>محاولة جديدة</button>
            <button className="btn ghost" onClick={onExit}>→ المختبر</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemCard({ it, onOpen }) {
  const p = it.progress;
  const state = p.best !== null ? `أفضل نتيجة ${p.best}%` : p.open ? 'محاولة جارية' : 'لم تبدأ';
  return (
    <button type="button" className={`mcard lab-item${p.best >= MASTERY ? ' is-reviewed' : ''}`} onClick={() => onOpen(it.id)}>
      <div className="mcard-top">
        <span className={`chip ${it.kind === 'scenario' ? 'dark' : 'gold'}`}>{KINDS[it.kind]}</span>
        <small className="muted">{it.minutes} دقيقة · {it.points} نقطة</small>
      </div>
      <b>{it.title}</b>
      <span className="mcard-sum">{it.summary}</span>
      <div className="mcard-foot">
        <span className={`chip ${p.best === null ? '' : tone(p.best)}`}>{state}</span>
        {it.min_level !== 'beginner' && <small className="muted">{levelOf(it.min_level).title}</small>}
      </div>
    </button>
  );
}

// بطاقات "طبّق ما قرأت" تحت صفحة الباب في الكتيب
export function ChapterLab({ items, onOpen }) {
  if (!items?.length) return null;
  return (
    <section className="lab-apply" aria-label="طبّق ما قرأت">
      <h4>طبّق ما قرأت في المختبر</h4>
      <div className="lab-apply-list">
        {items.map((it) => (
          <button key={it.id} type="button" className="lab-apply-item" onClick={() => onOpen(it.id)}>
            <span className={`chip ${it.kind === 'scenario' ? 'dark' : 'gold'}`}>{KINDS[it.kind]}</span>
            <b>{it.title}</b>
            <small>{it.progress.best !== null ? `أفضل نتيجة ${it.progress.best}%` : `${it.minutes} دقيقة · ${it.points} نقطة`}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Lab({ items, open, onOpen, onPoints, reload }) {
  if (open) return <Runner id={open} onExit={() => { onOpen(null); reload(); }} onPoints={onPoints} />;
  if (!items) return <div className="center-load"><div className="spinner" /></div>;
  const mastered = items.filter((it) => it.progress.best >= MASTERY).length;
  return (
    <div className="lab">
      <div className="models-intro">
        <div>
          <span className="book-eyebrow">The Leader's Lab</span>
          <h2>مختبر القائد</h2>
          <p className="muted">أدوات ومواقف تُصحَّح فورًا مع سببها من الكتيب. تُمنح نقاط الأداة عند {MASTERY}%.</p>
        </div>
        <div className="models-count"><b>{mastered}</b><small>من {items.length} أتقنتها</small></div>
      </div>
      {DIMENSIONS.map((dm) => {
        const list = items.filter((it) => it.dimension === dm.key);
        if (!list.length) return null;
        return (
          <section key={dm.key} className="models-part">
            <h3>{dm.title} <span>{dm.short}</span></h3>
            <div className="models-grid">{list.map((it) => <ItemCard key={it.id} it={it} onOpen={onOpen} />)}</div>
          </section>
        );
      })}
      {!items.length && <div className="alert info">لم يُفتح لك شيء من المختبر بعد.</div>}
    </div>
  );
}

// القسم المستقل: صفحة المختبر من الرحلة أو من الشريط العلوي
export default function LabScreen({ items, points, open, onOpen, reload, onBack }) {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="page lab-page stack">
      <div className="row between">
        <button className="link small" onClick={onBack}>→ رحلتي</button>
        {points && <span className="chip gold">{points.total} نقطة · {points.rank.title}</span>}
      </div>
      <Lab items={items} open={open} onOpen={onOpen} reload={reload} onPoints={(r) => { if (r.gained) setToast(`+${r.gained} نقطة`); }} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
