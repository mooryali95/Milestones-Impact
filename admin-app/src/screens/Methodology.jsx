// ════════════════════════════════════════════════════════════════
// المنهجية: الرحلة والمتطلبات، وأسئلة القياس، والمستويات ومعيار التسكين
// ════════════════════════════════════════════════════════════════
// كلها تقرأ من admin.catalog وتكتب عبر admin.save / admin.delete / admin.reorder.
// ما يُحرَّر هنا يظهر للمشارك مباشرة، فكل حفظ يعيد تحميل الكتالوج.
import React, { useEffect, useMemo, useState } from 'react';
import { DIM, DIMS, L, LVL, placementLockAr, withRunningReason } from '../leaders.js';
import { completionSource, journeyCoherence, renderJourneyText, stageRuleSummary, stageRules } from '../../../supabase/functions/leaders-api/logic.js';
import { READY_MIN } from '../../../supabase/functions/leaders-api/capstone.js';
import { COMPLETION_AR } from '../../../supabase/functions/leaders-api/labels.js';
import {
  CELL_FIELDS, INST_FIELDS, KIND, LVLS, lockReqCode, MODE, MODEL_DEFAULT, PHASE, QUESTIONS_LOCK_AR, Q_SAFE, stageFields, stageToForm, formToStage, TIER,
  evaluate, formToReq, reorderIds, reqFields, reqToForm,
} from '../methodology.js';
import Form from '../Form.jsx';
import ItemQuality from './ItemQuality.jsx';
import { ProgramMilestones } from './Milestones.jsx';
import { useUI } from '../ui.jsx';
import { readQuery, writeQuery } from '../route.js';
import JourneyTimeline from '../../../shared/ui/JourneyTimeline.jsx';
import { journeyAudience, journeyAudienceAr } from '../program-reach.js';
import { journeyTimeline } from '../../../supabase/functions/leaders-api/journey-timeline.js';

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
function ProgramBar({ current, onProgram, programs }) {
  const list = programs ? programs.filter((p) => !p.archived_at || p.id === current) : null;
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

// فحص الاتساق: هل تتسع كل مرحلة لجلساتها، وهل لكل رمز في النصوص مصدر
function Coherence({ stages, reqs }) {
  const issues = journeyCoherence(stages, reqs);
  if (!issues.length) return <p className="la-chip ok" role="status">الرحلة متسقة: كل رقم في النصوص من إعداد نشاطه، وكل مرحلة تتسع لجلساتها</p>;
  return (
    <section className="la-card" role="alert" aria-label="اتساق الرحلة">
      <h3>اتساق الرحلة <small className="la-muted">· {issues.length} ملاحظة</small></h3>
      <ul className="la-reqs">{issues.map((x, i) => <li key={i}><span className={`la-chip ${x.level === 'error' ? 'bad' : 'warn'}`}>{x.level === 'error' ? 'خطأ' : 'تنبيه'}</span> {x.msg}</li>)}</ul>
    </section>
  );
}

// من يصله ما يُحرَّر هنا (P9): كل دفعة على البرنامج باسمها ونسختها وأعضائها، من admin.programs نفسه (program-reach.js)
function JourneyAudience({ pid, data }) {
  if (!data?.success) return <p className="la-muted">ما تحرره هنا مسودة البرنامج، ولا يصل إلى الدفعات المثبتة على نسخة حتى تحفظه نسخة وترقّيها إليها من «البرامج والدفعات».</p>;
  const lines = journeyAudienceAr(journeyAudience(pid, data.programs, data.cohorts));
  return <div className="j-audience" aria-label="من يصله التعديل">{lines.map((l, i) => <p key={i} className={l.tone === 'warn' ? 'la-note' : 'la-muted'} role={l.tone === 'warn' ? 'note' : undefined}>{l.text}</p>)}</div>;
}

export function Journey({ catalog, reload, canWrite, onProgram }) {
  const [edit, editor] = useEditor(reload);
  const { toast, prompt } = useUI();
  const pid = catalog.program_id;
  const [pdata, setPdata] = useState(null);
  useEffect(() => { L('admin.programs').then(setPdata); }, [pid]);
  const stages = [...catalog.journey_stages].sort((a, b) => a.sort - b.sort);
  const reqs = catalog.stage_requirements;
  const mv = { catalog, reload, canWrite };
  const shown = (t, s) => renderJourneyText(t, { reqs, durationDays: s?.duration_days, readyMin: READY_MIN });
  // الرحلة في لمحة (J1b): من الحمولة نفسها، فتتحدث فور الحفظ. النقر المزدوج أو «افتحه» ينقل إلى النشاط في القائمة تحتها
  const timeline = useMemo(() => journeyTimeline({ stages: catalog.journey_stages, requirements: reqs }, { title: 'رحلة البرنامج' }), [catalog.journey_stages, reqs]);
  const openReq = (a) => {
    const el = document.getElementById(`jreq-${a.requirement_id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.querySelector('button.la-link')?.focus({ preventScroll: true });
  };
  // القدوم من «الحضور والجلسات» (attendance-groups.js): ‎?add=workshop‎ يفتح نموذج المتطلب نفسه بنوع الجلسات الجماعية،
  // و‎?req=<id>‎ ينقل إلى المتطلب في القائمة. يُحفظ بالمسار نفسه (stage_requirements في المسودة)، فلا نسخة ثانية للمتطلب
  const newReq = (stageKey, kind = 'check') => edit({
    title: 'متطلب جديد', fields: reqFields(stages, catalog.learning_models || [], catalog.lab_links || []),
    values: reqToForm({ stage_key: stageKey, kind, required: true, active: true }),
    onSave: (v) => save('stage_requirements', { program_id: pid, sort: reqs.filter((x) => x.stage_key === v.stage_key).length + 1 })(formToReq(v)),
  });
  useEffect(() => {
    const q = new URLSearchParams(readQuery());
    const add = q.get('add'), req = q.get('req');
    if (!add && !req) return;
    writeQuery('');
    if (req) { setTimeout(() => openReq({ requirement_id: req }), 0); return; }
    const first = stages.find((s) => s.active) || stages[0];
    if (add === 'workshop' && canWrite && first) newReq(first.key, 'workshop');
  }, [pid]);
  // الرحلة الفارغة: زر الخط الزمني ينقل إلى أول «+ مرحلة» (لمن يملك الكتابة)
  const toAddStage = () => {
    const btn = document.querySelector('[data-add-stage]');
    if (!btn) return;
    btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    btn.focus({ preventScroll: true });
  };
  return (
    <>
      {onProgram && <ProgramBar current={pid} onProgram={onProgram} programs={pdata?.success ? pdata.programs : null} />}
      <JourneyAudience pid={pid} data={pdata} />
      <JourneyTimeline key={pid} id="jt-program" model={timeline} onOpen={openReq} openLabel={() => 'افتحه في القائمة'} onEmpty={canWrite ? toAddStage : undefined} />
      <Coherence stages={stages} reqs={reqs} />
      <ProgramMilestones pid={pid} stages={stages} canWrite={canWrite} />
      <p className="la-muted">الترتيب بالأسهم، والمتطلب يمكن تخصيصه لبُعد ومستوى. لكل مرحلة نوع (إلزامية، عند الحاجة، اختيارية) وشرط فتح وشرط اكتمال تضبطها من «تحرير».</p>
      {Object.entries(PHASE).map(([ph, phl]) => (
        <React.Fragment key={ph}>
          <div className="la-row between">
            <h3 className="la-phase">{phl}</h3>
            {canWrite && <button className="btn-sm ghost" data-add-stage={ph} onClick={async () => {
              const title_ar = await prompt(`اسم المرحلة الجديدة في «${phl}»`, '');
              if (!title_ar) return;
              const r = await L('admin.stage-create', { program_id: pid, title_ar, phase: ph });
              if (!r.success) return toast(r.message);
              toast('أُضيفت المرحلة آخر الرحلة. رتّبها بالأسهم واضبط نوعها ومتى تُفتح من «تحرير».');
              reload();
            }}>+ مرحلة</button>}
          </div>
          {stages.filter((s) => s.phase === ph).map((s) => (
            <section key={s.key} className={`la-card la-stage-ed${s.active ? '' : ' off'}`}>
              <div className="la-row between">
                <div><b>{s.sort}. {s.title_ar}</b> <small className="la-muted">{shown(s.duration_label, s)}{s.mode ? ` · ${MODE[s.mode]}` : ''}{s.active ? '' : ' · مخفية'}</small></div>
                <div className="la-row">
                  <Move {...mv} entity="journey_stages" id={s.key} />
                  {canWrite && <button className="btn-sm ghost" onClick={() => edit({ title: `مرحلة: ${s.title_ar}`, fields: stageFields(reqs, stages, s.key), values: stageToForm(s), onSave: (v) => save('journey_stages', { key: s.key, program_id: pid })(formToStage(v)) })}>تحرير</button>}
                </div>
              </div>
              <p className={`la-rule ${stageRules(s).mode}`}>{stageRuleSummary(s, stages)}</p>
              {s.description_ar && <p className="la-muted">{shown(s.description_ar, s)}</p>}
              <ul className="la-reqs">
                {reqs.filter((r) => r.stage_key === s.key).sort((a, b) => a.sort - b.sort).map((r) => (
                  <li key={r.id} id={`jreq-${r.id}`} className={r.active ? '' : 'off'}>
                    <span>
                      <code>{r.code}</code> {shown(r.title_ar)} <small className="la-chip">{KIND[r.kind]}</small> <small className={`la-chip ${completionSource(r) === 'manual' ? 'warn' : ''}`} title="كيف يكتمل">{COMPLETION_AR[completionSource(r)]}</small>
                      {r.dimension && <small className="la-chip">{DIM[r.dimension]}{r.level ? ` · ${LVL[r.level]}` : ''}</small>}
                      {!r.required && <small className="la-chip">اختياري</small>}
                      {r.needs_review && <small className="la-chip warn">مراجعة</small>}
                    </span>
                    <span className="la-row">
                      <Move {...mv} entity="stage_requirements" id={r.id} />
                      {canWrite && <button className="la-link" onClick={() => edit({ title: 'تحرير متطلب', fields: lockReqCode(reqFields(stages, catalog.learning_models || [], catalog.lab_links || [])), values: reqToForm(r), onSave: (v) => save('stage_requirements', { id: r.id })(formToReq(v)), onDelete: del('stage_requirements', r.id) })}>تحرير</button>}
                    </span>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <button className="la-link" onClick={() => newReq(s.key)}>+ متطلب</button>
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
// الأسئلة مجمعة بالجانب، والجانب الذي لا سؤال له في الأداة لا يظهر: «انتقال التعلم» للبعدي وحده، فكان عنوانه يظهر فارغًا في القبلي
export const tierGroups = (qs) => Object.entries(TIER).map(([t, title]) => ({ t, title, qs: qs.filter((q) => q.tier === t) })).filter((g) => g.qs.length);

export function Assessment({ catalog, reload, canWrite }) {
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


  return (
    <>
      <div className="la-row">
        <select value={inst.id} onChange={(e) => setInstId(e.target.value)} aria-label="أداة القياس">
          {insts.map((i) => <option key={i.id} value={i.id}>{i.title_ar} · {i.key}{i.active ? ' (فعّال)' : ''}</option>)}
        </select>
        {canWrite && <>
          <button className="btn-sm ghost" onClick={() => edit({ title: 'أداة القياس', fields: INST_FIELDS, values: inst, onSave: save('instruments', { id: inst.id }) })}>المقدمة والمدة</button>
        </>}
        <button className="btn-sm ghost" aria-pressed={quality} onClick={() => setQuality(!quality)}>جودة الأسئلة</button>
      </div>
      {quality && <ItemQuality instrumentId={inst.id} />}
      <div className="la-note" role="note">{QUESTIONS_LOCK_AR}{locked ? ' ولهذا الإصدار نتائج سابقة.' : ''}</div>
      <nav className="la-subtabs" aria-label="الأطر">
        {DIMS.map((d) => <button key={d} className={dim === d ? 'on' : ''} aria-current={dim === d ? 'true' : undefined} onClick={() => setDim(d)}>{DIM[d]} <small>{count(d)}</small></button>)}
      </nav>
      {!qs.length && <p className="la-muted">لا أسئلة لهذا الإطار في هذه الأداة.</p>}
      {tierGroups(qs).map(({ t, title, qs: list }) => (
        <React.Fragment key={t}>
          <h4 className="la-phase">{title}</h4>
          <ol className="la-qs">
            {list.map((q) => (
              <li key={q.id} className={q.active ? '' : 'off'}>
                <div className="la-row between">
                  <span><code>{q.code}</code> {q.text_ar}</span>
                  <span className="la-row">
                    <Move catalog={catalog} reload={reload} canWrite={canWrite} entity="questions" id={q.id} />
                    {canWrite && <button className="la-link" onClick={() => edit({
                      title: `سؤال ${q.code}`, fields: Q_SAFE, values: q,
                      onSave: save('questions', { id: q.id }), onDelete: null,
                    })}>تحرير</button>}
                  </span>
                </div>
                <div className="la-qopts">{(q.options || []).map((o, i) => <span key={i} className={Number(o.score) > 0 ? 'good' : ''}>{o.label} <b>{o.score}</b></span>)}</div>
              </li>
            ))}
          </ol>
        </React.Fragment>
      ))}
      {editor}
    </>
  );
}

// ══ معيار التسكين وحاسبته ══
function PlacementModel({ model, running, reload, canWrite }) {
  const { toast, prompt } = useUI();
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
    const r = await withRunningReason((extra) => L('admin.save', { entity: 'placement_model', row, ...extra }), prompt);
    if (r.cancelled) return;
    toast(r.success ? 'حُفظ معيار التسكين. يسري على القياسات القادمة ويظهر مقترحه لكل مشارك' : r.message);
    if (r.success) reload();
  };
  const calc = () => setOut(evaluate(p, m) || 'bad');
  return (
    <section className="la-card la-model">
      <h3>معيار التسكين</h3>
      {running && <div className="la-note" role="note">{placementLockAr(running)}</div>}
      <><p className="la-muted">المستوى بالمؤشر المركّب، بشرط حد أدنى لكل جانب.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>لكل إطار مؤشر مركّب من 100 = متوسط موزون لجوانبه الثلاثة. يُمنح المستوى بالمؤشر، بشرط ألا يقل أي جانب عن حد أدنى، فلا تُخفي قوة جانب فجوة في آخر. والحالة الحدّية تظهر لك لتحسمها بحكمك. يسري التعديل على القياسات القادمة، ويظهر مقترحه فورًا في صفحة كل مشارك.</p></details></>
      <div className="la-model-grid">
        <div><h4>1. أوزان الجوانب</h4>{f('w_skill', 'المواقف', 'الأصدق تنبؤًا بالأداء')}{f('w_knowledge', 'المعرفة', 'الفهم والمفاهيم')}{f('w_behavior', 'الممارسة', 'تقدير ذاتي يميل للتضخم')}</div>
        <div><h4>2. حدود المستويات</h4>{f('min_intermediate', 'المؤشر للمتوسط من 100', 'الحد الأدنى')}{f('min_advanced', 'المؤشر للاحترافي من 100', 'الحد الأدنى')}{f('borderline', 'هامش الحالة الحدّية', 'نقاط تحت الحد')}</div>
        <div><h4>3. الحد الأدنى للمعرفة والمواقف</h4>{f('floor_intermediate', 'للمتوسط', 'فوق نسبة التخمين 25%')}{f('floor_advanced', 'للاحترافي', 'الممارسة الذاتية ليست بوابة، وتُعلَّم إن قلّت')}</div>
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
              : <>المؤشر المركّب <b>{out.composite}</b> · أضعف اختبار {out.low ?? '·'}% ·{(out.flags || []).map((f) => <span key={f.key}> <span className="la-chip warn">{f.reason_ar}</span></span>)} · المستوى: <span className={`la-lvl ${out.level}`}>{LVL[out.level]}</span></>}
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
  return (
    <>
      <section className="la-card">
        <h3>خلايا المصفوفة: مرجع الفريق لكل مستوى في كل إطار</h3>
        {/* لا تصل المشارك: mePayload يرسل الخلايا للإدارة والخبير وحدهما (التدقيق 2026-11-11، admin-program-7) */}
        <p className="la-muted">لا تظهر للمشارك: يرى مستواه العام وملف تعريف مساره. عنوان المسار في الخلية يراه الخبير في ملف المشارك، والوصف مرجع للفريق هنا.</p>
        <div className="la-cells">
          <div />
          {DIMS.map((d) => <div key={d} className="la-ch">{DIM[d]}</div>)}
          {LVLS.map((l) => (
            <React.Fragment key={l}>
              <div className="la-ch">{LVL[l]}</div>
              {DIMS.map((d) => {
                const c = cell(d, l);
                const body = <><b>{c.path_title_ar || 'بلا عنوان مسار'}</b><p>{c.description_ar || ''}</p></>;
                return canWrite
                  ? <button key={d} className="la-cell" onClick={() => edit({ title: `${DIM[d]} · ${LVL[l]}`, fields: CELL_FIELDS, values: c, onSave: save('grid_cells', { dimension: d, level: l }) })}>{body}</button>
                  : <div key={d} className="la-cell">{body}</div>;
              })}
            </React.Fragment>
          ))}
        </div>
      </section>
      {/* معيار التسكين المركّب وحده؛ قواعد level_rules القديمة أُزيلت (الترحيل 20261030140000) */}
      <PlacementModel model={catalog.placement_model?.[0] || { id: 1, ...MODEL_DEFAULT }} running={catalog.running_cohort} reload={reload} canWrite={canWrite} />
      {editor}
    </>
  );
}
