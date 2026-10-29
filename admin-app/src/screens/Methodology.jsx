// ════════════════════════════════════════════════════════════════
// المنهجية: الرحلة والمتطلبات، وأسئلة القياس، والمستويات ومعيار التسكين
// ════════════════════════════════════════════════════════════════
// كلها تقرأ من admin.catalog وتكتب عبر admin.save / admin.delete / admin.reorder.
// ما يُحرَّر هنا يظهر للمشارك مباشرة، فكل حفظ يعيد تحميل الكتالوج.
import React, { useEffect, useState } from 'react';
import { DIM, DIM_EN, DIMS, L, LVL } from '../leaders.js';
import {
  CELL_FIELDS, INST_FIELDS, KIND, LVLS, MODE, MODEL_DEFAULT, PHASE, Q_FIELDS, Q_SAFE, STAGE_FIELDS, TIER,
  evaluate, formToReq, reorderIds, reqFields, reqToForm,
} from '../methodology.js';
import Form from '../Form.jsx';
import ItemQuality from './ItemQuality.jsx';
import { useUI } from '../ui.jsx';

const save = (entity, base) => (row) => L('admin.save', { entity, row: { ...base, ...row } });
const del = (entity, id) => () => L('admin.delete', { entity, id });

// نافذة التحرير المشتركة: edit({ title, fields, values, onSave, onDelete? })
function useEditor(reload) {
  const { toast } = useUI();
  const [form, setForm] = useState(null);
  const node = form && (
    <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); reload(); } }} />
  );
  return [setForm, node];
}

function Move({ catalog, entity, id, reload, canWrite }) {
  const { toast } = useUI();
  if (!canWrite) return null;
  const go = async (dir) => {
    const ids = reorderIds(catalog[entity], entity, id, dir);
    if (!ids) return;
    const r = await L('admin.reorder', { entity, ids, program_id: catalog.program_id });
    if (!r.success) return toast(r.message);
    reload();
  };
  return (
    <>
      <button className="la-mv" onClick={() => go(-1)} aria-label="نقل لأعلى" title="أعلى">▲</button>
      <button className="la-mv" onClick={() => go(1)} aria-label="نقل لأسفل" title="أسفل">▼</button>
    </>
  );
}

// ══ الرحلة والمتطلبات ══
// برامج الرحلة: يختار المشرف أيها يحرر
function ProgramBar({ current, onProgram }) {
  const [list, setList] = useState(null);
  useEffect(() => { L('admin.programs').then((r) => setList(r.success ? r.programs.filter((p) => !p.archived_at || p.id === current) : [])); }, [current]);
  if (!list || list.length < 2) return null;
  return (
    <label className="la-row">
      <span>البرنامج</span>
      <select value={current || ''} onChange={(e) => onProgram(e.target.value)} aria-label="البرنامج">
        {list.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (الافتراضي)' : ''}</option>)}
      </select>
    </label>
  );
}

export function Journey({ catalog, reload, canWrite, onProgram }) {
  const [edit, editor] = useEditor(reload);
  const pid = catalog.program_id;
  const stages = [...catalog.journey_stages].sort((a, b) => a.sort - b.sort);
  const reqs = catalog.stage_requirements;
  const mv = { catalog, reload, canWrite };
  return (
    <>
      {onProgram && <ProgramBar current={pid} onProgram={onProgram} />}
      <p className="la-muted">ما تحرره هنا يظهر مباشرة لمشاركي الدفعات التي تتبع آخر تعديل على هذا البرنامج، والدفعات المثبتة على نسخة لا تتأثر حتى ترقيها. الترتيب بالأسهم، والمتطلب يمكن تخصيصه لبُعد ومستوى.</p>
      {Object.entries(PHASE).map(([ph, phl]) => (
        <React.Fragment key={ph}>
          <h3 className="la-phase">{phl}</h3>
          {stages.filter((s) => s.phase === ph).map((s) => (
            <section key={s.key} className={`la-card la-stage-ed${s.active ? '' : ' off'}`}>
              <div className="la-row between">
                <div><b>{s.sort}. {s.title_ar}</b> <small className="la-muted">{s.duration_label}{s.mode ? ` · ${MODE[s.mode]}` : ''}{s.active ? '' : ' · مخفية'}</small></div>
                <div className="la-row">
                  <Move {...mv} entity="journey_stages" id={s.key} />
                  {canWrite && <button className="btn-sm ghost" onClick={() => edit({ title: `مرحلة: ${s.title_ar}`, fields: STAGE_FIELDS, values: s, onSave: save('journey_stages', { key: s.key, program_id: pid }) })}>تحرير</button>}
                </div>
              </div>
              {s.description_ar && <p className="la-muted">{s.description_ar}</p>}
              <ul className="la-reqs">
                {reqs.filter((r) => r.stage_key === s.key).sort((a, b) => a.sort - b.sort).map((r) => (
                  <li key={r.id} className={r.active ? '' : 'off'}>
                    <span>
                      <code>{r.code}</code> {r.title_ar} <small className="la-chip">{KIND[r.kind]}</small>
                      {r.dimension && <small className="la-chip">{DIM_EN[r.dimension]}{r.level ? ` · ${LVL[r.level]}` : ''}</small>}
                      {!r.required && <small className="la-chip">اختياري</small>}
                      {r.needs_review && <small className="la-chip warn">مراجعة</small>}
                    </span>
                    <span className="la-row">
                      <Move {...mv} entity="stage_requirements" id={r.id} />
                      {canWrite && <button className="la-link" onClick={() => edit({ title: 'تحرير متطلب', fields: reqFields(stages, catalog.learning_models || []), values: reqToForm(r), onSave: (v) => save('stage_requirements', { id: r.id })(formToReq(v)), onDelete: del('stage_requirements', r.id) })}>تحرير</button>}
                    </span>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <button className="la-link" onClick={() => edit({
                  title: 'متطلب جديد', fields: reqFields(stages, catalog.learning_models || []),
                  values: reqToForm({ stage_key: s.key, kind: 'check', required: true, active: true }),
                  onSave: (v) => save('stage_requirements', { program_id: pid, sort: reqs.filter((x) => x.stage_key === s.key).length + 1 })(formToReq(v)),
                })}>+ متطلب</button>
              )}
            </section>
          ))}
        </React.Fragment>
      ))}
      {editor}
    </>
  );
}

// ══ أسئلة القياس ══
export function Assessment({ catalog, reload, canWrite }) {
  const { toast, confirm } = useUI();
  const [edit, editor] = useEditor(reload);
  const insts = [...catalog.instruments].sort((a, b) => (a.kind + b.version).localeCompare(b.kind + a.version));
  const [instId, setInstId] = useState(() => (insts.find((i) => i.active && i.kind === 'baseline') || insts[0])?.id);
  const [dim, setDim] = useState('milestone');
  const [quality, setQuality] = useState(false);
  const inst = insts.find((i) => i.id === instId) || insts[0];
  if (!inst) return <p className="la-muted">لا أدوات قياس.</p>;
  const locked = catalog.locked_instruments.includes(inst.id);
  const qs = catalog.questions.filter((q) => q.instrument_id === inst.id && q.dimension === dim).sort((a, b) => a.sort - b.sort);
  const count = (d) => catalog.questions.filter((q) => q.instrument_id === inst.id && q.dimension === d && q.active).length;

  const clone = async () => {
    if (!(await confirm('إنشاء إصدار جديد غير مفعّل بنسخة من كل الأسئلة؟'))) return;
    const r = await L('admin.clone-instrument', { id: inst.id });
    if (!r.success) return toast(r.message);
    setInstId(r.instrument.id); toast('أُنشئ الإصدار. عدّله ثم فعّله'); reload();
  };
  const activate = async () => {
    if (!(await confirm('تفعيل هذا الإصدار للمشاركين الجدد؟ من بدأ القياس يكمل على إصداره.'))) return;
    const r = await L('admin.activate-instrument', { id: inst.id });
    toast(r.success ? 'فُعّل' : r.message); if (r.success) reload();
  };

  return (
    <>
      <div className="la-row">
        <select value={inst.id} onChange={(e) => setInstId(e.target.value)} aria-label="أداة القياس">
          {insts.map((i) => <option key={i.id} value={i.id}>{i.title_ar} · {i.key}{i.active ? ' (فعّال)' : ''}</option>)}
        </select>
        {canWrite && <>
          <button className="btn-sm ghost" onClick={() => edit({ title: 'أداة القياس', fields: INST_FIELDS, values: inst, onSave: save('instruments', { id: inst.id }) })}>المقدمة والمدة</button>
          <button className="btn-sm ghost" onClick={clone}>إصدار جديد</button>
          {!inst.active && <button className="btn-sm primary" onClick={activate}>تفعيل هذا الإصدار</button>}
        </>}
        <button className="btn-sm ghost" aria-pressed={quality} onClick={() => setQuality(!quality)}>جودة الأسئلة</button>
      </div>
      {quality && <ItemQuality instrumentId={inst.id} />}
      {locked && <div className="la-note">لهذا الإصدار نتائج سابقة، فيُسمح بتعديل الصياغة والترتيب فقط. لتغيير الخيارات أو الدرجات أو إضافة أسئلة أنشئ إصدارًا جديدًا ثم فعّله؛ النتائج القديمة تبقى سليمة.</div>}
      <nav className="la-subtabs" aria-label="الأطر">
        {DIMS.map((d) => <button key={d} className={dim === d ? 'on' : ''} aria-current={dim === d ? 'true' : undefined} onClick={() => setDim(d)}>{DIM_EN[d]} <small>{count(d)}</small></button>)}
      </nav>
      {Object.entries(TIER).map(([t, tl]) => (
        <React.Fragment key={t}>
          <h4 className="la-phase">{tl}</h4>
          <ol className="la-qs">
            {qs.filter((q) => q.tier === t).map((q) => (
              <li key={q.id} className={q.active ? '' : 'off'}>
                <div className="la-row between">
                  <span><code>{q.code}</code> {q.text_ar}</span>
                  <span className="la-row">
                    <Move catalog={catalog} reload={reload} canWrite={canWrite} entity="questions" id={q.id} />
                    {canWrite && <button className="la-link" onClick={() => edit({
                      title: `سؤال ${q.code}`, fields: locked ? Q_SAFE : Q_FIELDS, values: q,
                      onSave: save('questions', { id: q.id }), onDelete: locked ? null : del('questions', q.id),
                    })}>تحرير</button>}
                  </span>
                </div>
                <div className="la-qopts">{(q.options || []).map((o, i) => <span key={i} className={Number(o.score) > 0 ? 'good' : ''}>{o.label} <b>{o.score}</b></span>)}</div>
              </li>
            ))}
          </ol>
        </React.Fragment>
      ))}
      {canWrite && !locked && (
        <button className="btn-sm primary" onClick={() => edit({
          title: `سؤال جديد في ${DIM_EN[dim]}`, fields: Q_FIELDS, values: { tier: 'knowledge', kind: 'choice', weight: 1, active: true },
          onSave: save('questions', { instrument_id: inst.id, dimension: dim, sort: catalog.questions.filter((x) => x.instrument_id === inst.id).length + 1 }),
        })}>+ سؤال في {DIM_EN[dim]}</button>
      )}
      {editor}
    </>
  );
}

// ══ معيار التسكين وحاسبته ══
function PlacementModel({ model, reload, canWrite }) {
  const { toast } = useUI();
  const [m, setM] = useState(() => ({ ...MODEL_DEFAULT, ...model }));
  const [p, setP] = useState({ knowledge: 75, skill: 25, behavior: 69 });
  const [out, setOut] = useState(null);
  const f = (k, label, hint) => (
    <label className="la-mf">
      <span>{label}</span>
      <input type="number" min="0" max="100" step="1" value={m[k]} disabled={!canWrite} onChange={(e) => setM({ ...m, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />
      <small>{hint}</small>
    </label>
  );
  const store = async () => {
    if (+m.min_advanced <= +m.min_intermediate) return toast('حد الاحترافي يجب أن يكون أعلى من حد المتوسط');
    const row = { id: 1, ...Object.fromEntries(Object.keys(MODEL_DEFAULT).map((k) => [k, Number(m[k])])) };
    const r = await L('admin.save', { entity: 'placement_model', row });
    toast(r.success ? 'حُفظ معيار التسكين. يسري على القياسات القادمة ويظهر مقترحه لكل مشارك' : r.message);
    if (r.success) reload();
  };
  const calc = () => setOut(evaluate(p, m) || 'bad');
  return (
    <section className="la-card la-model">
      <h3>معيار التسكين</h3>
      <p className="la-muted">لكل إطار مؤشر مركّب من 100 = متوسط موزون لجوانبه الثلاثة. يُمنح المستوى بالمؤشر، بشرط ألا يقل أي جانب عن حد أدنى، فلا تُخفي قوة جانب فجوة في آخر. والحالة الحدّية تظهر لك لتحسمها بحكمك. يسري التعديل على القياسات القادمة، ويظهر مقترحه فورًا في صفحة كل مشارك.</p>
      <div className="la-model-grid">
        <div><h4>1. أوزان الجوانب</h4>{f('w_skill', 'المواقف', 'الأصدق تنبؤًا بالأداء')}{f('w_knowledge', 'المعرفة', 'الفهم والمفاهيم')}{f('w_behavior', 'الممارسة', 'تقدير ذاتي يميل للتضخم')}</div>
        <div><h4>2. حدود المستويات</h4>{f('min_intermediate', 'المؤشر للمتوسط من 100', 'الحد الأدنى')}{f('min_advanced', 'المؤشر للاحترافي من 100', 'الحد الأدنى')}{f('borderline', 'هامش الحالة الحدّية', 'نقاط تحت الحد')}</div>
        <div><h4>3. الحد الأدنى لأي جانب</h4>{f('floor_intermediate', 'للمتوسط', 'فوق نسبة التخمين 25%')}{f('floor_advanced', 'للاحترافي', 'نسبة الجانب الأضعف')}</div>
      </div>
      {canWrite && <button className="btn-sm primary" onClick={store}>حفظ المعيار</button>}
      <div className="la-calc">
        <h4>جرّب المعيار</h4>
        <div className="la-row">
          {[['knowledge', 'معرفة %'], ['skill', 'مواقف %'], ['behavior', 'ممارسة %']].map(([k, l]) => (
            <label key={k}>{l} <input type="number" min="0" max="100" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
          ))}
          <button className="btn-sm ghost" onClick={calc}>احسب</button>
        </div>
        <div className="la-muted" role="status">
          {!out ? 'أدخل نسبًا واضغط احسب. القيم الافتراضية مثال من مشارك حقيقي.'
            : out === 'bad' ? 'أدخل نسبًا صحيحة'
              : <>المؤشر المركّب <b>{out.composite}</b> · أضعف جانب {out.low}% · المستوى: <span className={`la-lvl ${out.level}`}>{LVL[out.level]}</span></>}
        </div>
      </div>
    </section>
  );
}

// ══ المستويات ══
export function Levels({ catalog, reload, canWrite }) {
  const { toast } = useUI();
  const [edit, editor] = useEditor(reload);
  const cell = (d, l) => catalog.grid_cells.find((c) => c.dimension === d && c.level === l) || {};
  const rule = (d, l) => catalog.level_rules.find((r) => r.dimension === d && r.level === l) || {};
  const [rules, setRules] = useState({});
  const ruleVal = (d, l, k) => rules[`${d}|${l}|${k}`] ?? rule(d, l)[k] ?? 0;
  const saveRule = async (d, l) => {
    const row = { dimension: d, level: l, ...Object.fromEntries(['min_knowledge', 'min_skill', 'min_behavior'].map((k) => [k, Number(ruleVal(d, l, k))])) };
    const r = await L('admin.save', { entity: 'level_rules', row });
    toast(r.success ? 'حُفظت القاعدة' : r.message); if (r.success) reload();
  };
  const hasModel = catalog.placement_model?.length > 0;
  return (
    <>
      <section className="la-card">
        <h3>خلايا المصفوفة: ما يقرؤه المشارك عن مستواه ومساره</h3>
        <div className="la-cells">
          <div />
          {DIMS.map((d) => <div key={d} className="la-ch">{DIM_EN[d]}<small>{DIM[d]}</small></div>)}
          {LVLS.map((l) => (
            <React.Fragment key={l}>
              <div className="la-ch">{LVL[l]}</div>
              {DIMS.map((d) => {
                const c = cell(d, l);
                const body = <><b>{c.path_title_ar || 'بلا عنوان مسار'}</b><p>{c.description_ar || ''}</p></>;
                return canWrite
                  ? <button key={d} className="la-cell" onClick={() => edit({ title: `${DIM_EN[d]} · ${LVL[l]}`, fields: CELL_FIELDS, values: c, onSave: save('grid_cells', { dimension: d, level: l }) })}>{body}</button>
                  : <div key={d} className="la-cell">{body}</div>;
              })}
            </React.Fragment>
          ))}
        </div>
      </section>
      {hasModel ? <PlacementModel model={catalog.placement_model[0]} reload={reload} canWrite={canWrite} /> : (
        <section className="la-card">
          <div className="la-note">معيار التسكين المركّب غير مفعّل بعد (الترحيل leaders-008-placement-model). حتى ذلك الحين تعمل القواعد التالية.</div>
          <h3>قواعد تحديد المستوى</h3>
          <p className="la-muted">يُمنح المشارك أعلى مستوى تتحقق كل شروطه في البُعد. النسب من 0 إلى 100 لكل نوع من الأسئلة.</p>
          <table className="la-table">
            <thead><tr><th>البُعد</th><th>المستوى</th><th>معرفة (حد أدنى)</th><th>مواقف (حد أدنى)</th><th>ممارسة (حد أدنى)</th><th /></tr></thead>
            <tbody>{DIMS.flatMap((d) => LVLS.map((l) => (
              <tr key={`${d}${l}`}>
                <td>{DIM_EN[d]}</td><td>{LVL[l]}</td>
                {['min_knowledge', 'min_skill', 'min_behavior'].map((k) => (
                  <td key={k}>{canWrite
                    ? <input type="number" min="0" max="100" aria-label={`${DIM_EN[d]} ${LVL[l]} ${k}`} value={ruleVal(d, l, k)} onChange={(e) => setRules({ ...rules, [`${d}|${l}|${k}`]: e.target.value })} />
                    : ruleVal(d, l, k)}</td>
                ))}
                <td>{canWrite && <button className="la-link" onClick={() => saveRule(d, l)}>حفظ</button>}</td>
              </tr>
            )))}</tbody>
          </table>
        </section>
      )}
      {editor}
    </>
  );
}
