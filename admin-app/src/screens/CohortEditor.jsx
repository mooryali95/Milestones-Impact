// ════════════════════════════════════════════════════════════════
// محرر الدفعة بالأقسام (P6): الأساسيات ظاهرة، والرحلة مرئية بندًا بندًا، والتنفيذ والمتقدم مطويان
// ════════════════════════════════════════════════════════════════
// مصدر واحد لكل حقل: تعريفه في cohortFields (methodology.js) يقرؤه هذا المحرر والمعالج معًا، والتحقق cohortErrors
// للاثنين، والحفظ بالإجراء الواحد admin.cohort-save عبر saveCohort (حارس النقل من P1). الرحلة من admin.cohort-definition
// (P5): نسخة الدفعة المثبتة أو برنامجها الحي، وتُعاد قراءتها عند تغيير البرنامج أو النسخة. الإخفاء لا يحذف شيئًا:
// البند يبقى في القائمة بعلامته، وما أنجزه المشاركون منه محفوظ. وما يُضبط في نافذة أخرى (الجدول والفريق ووضع المراحل
// والرؤية والعقد) لا يُحرَّر هنا، بل يُذكر للقراءة برابط إلى نافذته.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { COACH_MODE, COHORT_SECTIONS, COHORT_STATUS, cohortErrors, cohortFields, cohortOut, cohortToForm, formToCohort, itemsAr, journeyView, KIND, NEW_EMPTY, stagesAr, UNPINNED_EMPTY, UNPINNED_UPGRADE, VERSION_ON_SAVE } from '../methodology.js';
import { LEVEL_MODE_AR, orgProgram, PROJECT_MODE_AR } from '../../../supabase/functions/leaders-api/logic.js';
import { Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { saveCohort } from '../cohort-guard.js';
import { KIND_AR, cohortKind } from '../cohort-hub.js';
import '../cohort-editor.css';
import JourneyTimeline from '../../../shared/ui/JourneyTimeline.jsx';
import { journeyTimeline, undatedAr } from '../../../supabase/functions/leaders-api/journey-timeline.js';

// حقل واحد بنوعه، كما يعرضه Form.jsx: العنوان ثم الإرشاد ثم المدخل. يستعمله المحرر والمعالج فلا يختلف حقل بينهما.
// short: ما يظهر من العنوان حين يكرر رأسُ المجموعة أوله (حقول التنفيذ)، ويبقى العنوان كاملًا لقارئ الشاشة
/** @param {{ f: any, v: any, set: (patch: any) => void, error?: string, className?: string, short?: string, autoFocus?: boolean, disabled?: boolean }} props */
export function CohortField({ f, v, set, error = '', className = '', short = '', autoFocus = false, disabled = false }) {
  const id = `f-${f.name}`;
  const help = typeof f.help === 'function' ? f.help(v) : f.help;
  const label = short ? <span><span className="sr-only">{f.label.slice(0, f.label.length - short.length)}</span>{short}</span> : <span>{f.label}</span>;
  if (f.type === 'check') {
    return (
      <label htmlFor={id} className={`la-check ${className}`}>
        <input id={id} type="checkbox" disabled={disabled} checked={!!v[f.name]} onChange={(e) => set({ [f.name]: e.target.checked })} /> {label}
      </label>
    );
  }
  const common = {
    id, name: f.name, value: v[f.name] ?? '', dir: f.dir, autoFocus, disabled, onChange: (e) => set({ [f.name]: e.target.value }),
    'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : undefined,
  };
  return (
    <label htmlFor={id} className={className}>
      {label}
      {help && <small className="la-muted">{help}</small>}
      {f.type === 'select' ? (
        <select {...common}>{f.empty != null && <option value="">{f.empty}</option>}{Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      ) : f.type === 'textarea' ? <textarea {...common} rows={f.rows || 3} />
        : <input {...common} type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? 'any' : undefined} />}
      {error && <small className="ce-err" id={`${id}-err`}>{error}</small>}
    </label>
  );
}

// قسم مطوي بسطر خلاصة (نمط بطاقة الصحة OpsHealth): زر العنوان يحمل الحال، والخلاصة بشارات بكلمات حين يُطوى
function Section({ k, title, open, onToggle, pills = [], summary = '', children }) {
  const body = `ce-${k}-body`;
  return (
    <section className="ce-sec" aria-labelledby={`ce-${k}-h`}>
      <div className="ce-sec-head">
        <h4 id={`ce-${k}-h`}>
          <button type="button" className="ce-toggle" aria-expanded={open} aria-controls={body} onClick={onToggle}>{title}<span className="ce-chev" aria-hidden="true" /></button>
        </h4>
        {pills.map((p) => <span key={p.text} className={`ce-pill ${p.tone || ''}`}><span aria-hidden="true">{p.icon || ''}</span>{p.text}</span>)}
      </div>
      {!open && summary && <p className="ce-summary">{summary}</p>}
      {open && <div id={body} className="ce-sec-body">{children}</div>}
    </section>
  );
}

const TOGGLE_HELP = 'البند المخفي يختفي فورًا من رحلات أعضاء الدفعة وتقدّمهم، ويبقى ما أنجزوه منه محفوظًا ويعود إن أظهرته. لا يُحذف شيء.';
const sameHidden = (x) => JSON.stringify({ ...x, hidden_requirements: [...(x.hidden_requirements || [])].sort() });

/** @param {{ cohort?: any, data: any, canWrite?: boolean, onClose: (saved?: boolean) => void, onOpen?: (k: string, at?: { program_id?: string }) => void }} props
 *  onOpen: يفتح نافذة ما لا يُحرَّر هنا بعد إغلاق المحرر (schedule، team، vis، journey)، والرحلة لبرنامج المحرر المختار */
export default function CohortEditor({ cohort = {}, data, canWrite = true, onClose, onOpen }) {
  const { confirm } = useUI();
  const programs = data.programs || [];
  const orgs = data.organizations || [];
  // الدفعة الجديدة تُنشأ بالمعالج وحده (CohortWizard.jsx) وفيه اقتراح برنامج الجهة (P4)، فالمحرر لدفعة قائمة
  const isNew = !cohort.id;
  const isDefault = !!cohort.is_default;
  const suggest = (orgId) => orgProgram(data.cohorts || [], programs, orgId || null);
  const [start] = useState(() => cohortToForm(cohort));
  const [v, setV] = useState(start);
  const [def, setDef] = useState(null);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState({ journey: true, delivery: false, advanced: false });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const advRef = useRef(null);

  const set = (patch) => setV((cur) => {
    const next = { ...cur, ...patch };
    // برنامج آخر: النسخة أحدث نسخه (والفارغ إن لم تُحفظ له نسخة: يُنشئها الخادم عند الحفظ). والعودة إلى برنامج الدفعة تعيد نسختها
    if ('program_id' in patch && patch.program_id !== cur.program_id) {
      next.program_version_id = patch.program_id === start.program_id ? start.program_version_id : programs.find((p) => p.id === patch.program_id)?.versions?.[0]?.id || '';
    }
    return next;
  });

  // الرحلة من تعريف الدفعة، وتُعاد قراءتها عند تغيير البرنامج أو النسخة
  useEffect(() => {
    let live = true;
    setDef((d) => ({ ...(d || {}), loading: true }));
    // الفارغ للدفعة الجديدة أو على برنامج آخر «أحدث نسخة عند الحفظ»: يُعاين ما ستُثبَّت عليه (أحدث نسخة، أو البرنامج كما هو
    // إن لم تُحفظ له نسخة). والفارغ لدفعة قائمة غير مثبتة على برنامجها: الحفظ لا يغيّر ما تمر به، فيُعاين البرنامج كما هو
    const own = !isNew && v.program_id === start.program_id;
    L('admin.cohort-definition', { ...(isNew ? {} : { cohort_id: cohort.id }), program_id: v.program_id, program_version_id: v.program_version_id || (own ? '' : 'latest') })
      .then((r) => { if (live) setDef(r?.success ? r : { error: r?.message || 'تعذّرت قراءة رحلة الدفعة' }); });
    return () => { live = false; };
  }, [v.program_id, v.program_version_id, retry]); // cohort.id ثابت ما دام المحرر مفتوحًا
  // حقول التنفيذ من بنود التعريف، فلا يُرسل التنفيذ قبل أن يُقرأ: إرسال «لا تخصيص» يمحو تخصيص الدفعة كله
  const defReady = !!def && !def.loading && !def.error;

  const prog = programs.find((p) => p.id === v.program_id);
  const org = orgs.find((o) => o.id === v.organization_id);
  const reqs = def?.requirements || [];
  // الدفعة القائمة على برنامجها: نسختها لا تتغير من هنا (cohortSave يرفض)، بل بالترقية من ملفها بمعاينة ما يتغير على
  // أعضائها. فلا تُعرض إلا نسختها، وغير المثبتة يُقال عنها ما يفعله الحفظ بالضبط
  const own = !isNew && v.program_id === start.program_id;
  const versionEmpty = own
    ? (start.program_version_id ? false : prog?.versions?.length ? UNPINNED_UPGRADE : !prog?.requirements ? UNPINNED_EMPTY : VERSION_ON_SAVE)
    : !prog?.versions?.length && prog && !prog.requirements ? NEW_EMPTY : true;
  const versions = own ? (prog?.versions || []).filter((x) => x.id === start.program_version_id) : prog?.versions || [];
  const fields = useMemo(() => cohortFields({ orgs, programs, versions, reqs, isDefault, isNew, versionEmpty, defVersion: def?.loading || !def ? undefined : def.version?.id || '' })
    // دفعة قائمة على برنامج أُرشف بعد إغلاقها: يُعرض برنامجها الحالي بعلامته ولا يُقترح لغيرها
    .map((f) => (f.name === 'program_id' && prog?.archived_at ? { ...f, options: { ...f.options, [prog.id]: `${prog.name} (مؤرشف)` } } : f))
    .map((f) => (f.name === 'program_version_id' && own ? { ...f, help: 'نسخة الدفعة تتغير بالترقية من ملفها، بعد معاينة ما يتغير على أعضائها ومن له تقدم فيما يختفي.' } : f)),
  [orgs, programs, prog, reqs, isDefault, isNew, def, versionEmpty, own, start.program_version_id]);
  const shown = (f) => !f.show || f.show(v);
  const bySection = (k) => fields.filter((f) => f.section === k && shown(f));
  const errs = cohortErrors(v);
  const errOf = (name) => (name === 'content_level' || tried ? errs[name] || '' : '');
  const jv = useMemo(() => journeyView(def || {}, v.hidden_requirements || [], v.hidden_before || []), [def, v.hidden_requirements, v.hidden_before]);

  const dirty = sameHidden(v) !== sameHidden(start);
  const close = useGuardedClose(dirty, () => onClose());
  useEscape(close);
  // ما يُضبط في نافذة أخرى: يُغلق المحرر أولًا (بالسؤال إن كان فيه تعديل) ثم تُفتح نافذته
  const go = (k, extra = {}) => async () => {
    if (dirty && !(await confirm('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟', { danger: true, ok: 'إغلاق دون حفظ' }))) return;
    onClose();
    onOpen?.(k, { program_id: v.program_id, ...extra });
  };

  const toggle = (code) => setV((cur) => {
    const h = cur.hidden_requirements || [];
    return { ...cur, hidden_requirements: h.includes(code) ? h.filter((x) => x !== code) : [...h, code] };
  });
  const coaching = reqs.filter((r) => r.active !== false && r.kind === 'coaching');
  const applyOrgDefault = () => set(Object.fromEntries(coaching.map((r) => [`d:${r.code}:mode`, org.delivery_default])));

  const save = async (e) => {
    e?.preventDefault();
    setTried(true);
    if (Object.keys(errs).length) {
      if (errs.content_level) setOpen((o) => ({ ...o, advanced: true }));
      return setError(errs.name || errs.ends_on || errs.content_level);
    }
    setBusy(true); setError('');
    const out = cohortOut(fields, v);
    // البرنامج المؤرشف يرفضه الخادم إن أُرسل، فلا يُرسل ما لم يتغير
    if (prog?.archived_at && v.program_id === start.program_id) delete out.program_id;
    const body = formToCohort(out);
    if (!defReady) delete body.delivery;
    const r = await saveCohort({ ...(isNew ? {} : { id: cohort.id }), ...body }, confirm);
    setBusy(false);
    if (r?.success) onClose(true); else setError(r?.message || 'تعذّر الحفظ');
  };

  // سطور الخلاصة والشارات بكلمات
  const hiddenN = jv.total - jv.shown;
  const journeyPills = def?.error ? [{ text: 'تعذّرت القراءة', tone: 'bad', icon: '✕' }]
    : !def || def.loading ? [] : [{ text: `${jv.shown} ظاهرة من ${jv.total}`, tone: hiddenN ? 'info' : 'ok', icon: hiddenN ? '' : '✓' }];
  const customized = new Set(Object.entries(v).filter(([k, x]) => k.startsWith('d:') && x != null && x !== '').map(([k]) => k.split(':')[1]))
    .size;
  const deliveryN = bySection('delivery').length;
  const deliveryPills = !deliveryN ? [] : customized ? [{ text: `${customized === 1 ? 'نشاط واحد مخصص' : `${customized} أنشطة مخصصة`}`, tone: 'info' }] : [{ text: 'كما في البرنامج', tone: '' }];
  const version = prog?.versions?.find((x) => x.id === v.program_version_id);
  const advSummary = [version ? `مثبتة على النسخة ${version.number}` : own && versionEmpty !== VERSION_ON_SAVE ? 'غير مثبتة' : 'تُثبَّت على أحدث نسخة عند الحفظ', LEVEL_MODE_AR[v.level_mode] || '', PROJECT_MODE_AR[v.project_mode] || '',
    v.organization_id && v.capacity_on && v.capacity ? `سعة تشغيلية ${v.capacity}` : ''].filter(Boolean).join(' · ');
  const advPills = errs.content_level ? [{ text: 'ينقصه مستوى المحتوى', tone: 'bad', icon: '✕' }] : [];
  const op = !isDefault && v.organization_id ? suggest(v.organization_id) : null;
  // نسخة الدفعة تتغير بهذا الحفظ (برنامج آخر أو نسخة أخرى): يُقال صراحة من أي نسخة، لا بتغير السطر وحده
  const was = start.program_version_id && v.program_version_id !== start.program_version_id
    ? (programs.find((p) => p.id === start.program_id)?.versions || []).find((x) => x.id === start.program_version_id) || { number: '' } : null;
  const groups = [...new Set(bySection('delivery').map((f) => f.req))];
  // الرحلة في لمحة بتواريخ الدفعة (J1b): تعريفها كما في قسم الرحلة بإخفائها الحالي، وجلساتها، وتاريخ بدايتها في النموذج.
  // النقر على جلسة جماعية يقفز إلى «+ موعد» عندها في «الحضور والجلسات»، وغيرها إلى رحلة البرنامج
  const timeline = useMemo(() => {
    if (!defReady || isNew) return null;
    const h = new Set(v.hidden_requirements || []);
    return journeyTimeline({ stages: def.stages || [], requirements: (def.requirements || []).map((r) => ({ ...r, hidden: h.has(r.code) })) },
      { cohort: { ...cohort, starts_on: v.starts_on || null }, sessions: def.sessions || [], today: new Date(), title: v.name || cohort.name || '' });
  }, [defReady, isNew, def, v.hidden_requirements, v.starts_on, v.name, cohort]);
  const openAct = onOpen ? (a) => (a.kind === 'workshop' ? go('activities', { req: a.requirement_id })() : go('journey')()) : undefined;
  const actLabel = (a) => (a.kind !== 'workshop' ? 'حرّره في رحلة البرنامج' : a.undated ? 'أضف موعده' : 'افتح مواعيده');
  const showDelivery = deliveryN > 0 || !!timeline;
  const title = isNew ? 'دفعة جديدة' : `دفعة: ${cohort.name}`;

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="la-form mi-form wide ce" role="dialog" aria-modal="true" aria-label={title} onSubmit={save} noValidate>
        <header className="ce-head">
          <h3>{isNew ? 'دفعة جديدة' : cohort.name}</h3>
          <p className="la-muted">{KIND_AR[cohortKind({ ...cohort, organization_id: v.organization_id })]}{!isNew && ` · ${COHORT_STATUS[cohort.status] || ''}`}</p>
          {!canWrite && <p className="ce-ro" role="note">للقراءة فقط: لا تملك صلاحية تعديل الدفعات، فالحقول معطلة.</p>}
        </header>

        <section className="ce-sec ce-basics" aria-labelledby="ce-basics-h">
          <h4 id="ce-basics-h">{COHORT_SECTIONS[0].title}</h4>
          <div className="ce-grid">
            {bySection('basics').map((f) => (
              <React.Fragment key={`${f.name}-${f.label}`}>
                <CohortField f={f} v={v} set={set} disabled={!canWrite} error={errOf(f.name)} className={`ce-field ce-${f.name}${['name', 'organization_id', 'program_id'].includes(f.name) ? ' wide' : ''}`} />
                {f.name === 'program_id' && (
                  <p className="ce-source wide" role="note">
                    {op && op.program_id !== v.program_id ? <span className="ce-warn-txt">برنامج الجهة «{op.program_name}». اخترت برنامجًا آخر: من له تقدم من أعضائها يُسأل عنه قبل الحفظ.{' '}
                      {canWrite && <button type="button" className="la-link" onClick={() => set({ program_id: op.program_id })}>ارجع إلى برنامج الجهة</button>} </span> : null}
                    {was ? <span className="ce-warn-txt">كانت الدفعة على النسخة {was.number}{v.program_id !== start.program_id ? ' من برنامجها' : ''}: بعد الحفظ تنتقل إلى ما تعرضه الرحلة أدناه. </span> : null}
                    {v.program_version_id && def?.version ? `الرحلة من النسخة ${def.version.number} المثبتة (${def.version.label}).`
                      : def?.version ? `تُثبَّت عند الحفظ على النسخة ${def.version.number} (${def.version.label}).`
                        : own && versionEmpty === UNPINNED_UPGRADE ? `الدفعة غير مثبتة وتتبع البرنامج كما هو. الحفظ لا يثبّتها: ثبّتها من ملفها على النسخة ${prog.versions[0].number} بعد مراجعة الفرق.`
                          : own && versionEmpty === UNPINNED_EMPTY ? 'الدفعة غير مثبتة، والبرنامج بلا متطلبات بعد فلا نسخة تُحفظ له. يُحفظ الباقي كما هو، وتُثبَّت حين تُبنى رحلته.'
                            : versionEmpty === NEW_EMPTY ? 'البرنامج بلا متطلبات بعد، فلا نسخة تُثبَّت عليها الدفعة ولا تُنشأ عليه. ابنِ رحلته أولًا أو اختر برنامجًا آخر.'
                              : 'لا نسخة محفوظة لهذا البرنامج بعد: تُحفظ نسخته الأولى من حاله الآن عند الحفظ، وتُثبَّت الدفعة عليها.'}{' '}
                    {own ? <span className="la-muted">نسختها تتغير بالترقية من ملف الدفعة.</span>
                      : <button type="button" className="la-link" onClick={() => { setOpen((o) => ({ ...o, advanced: true })); setTimeout(() => advRef.current?.querySelector('#f-program_version_id')?.focus(), 0); }}>غيّر النسخة</button>}
                  </p>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        <Section k="journey" title={COHORT_SECTIONS[1].title} open={open.journey} onToggle={() => setOpen((o) => ({ ...o, journey: !o.journey }))} pills={journeyPills}
          summary={def?.error ? 'تعذّرت قراءة الرحلة. افتح القسم لإعادة المحاولة.' : !defReady ? 'جارٍ تحميل الرحلة…' : `${stagesAr(jv.stages.length)}، ${itemsAr(jv.total)}.${hiddenN ? ` المخفي منها في هذه الدفعة: ${hiddenN}.` : ''}`}>
          {def?.loading && <Spinner />}
          {def?.error && <div className="la-err" role="alert">{def.error} <button type="button" className="la-link" onClick={() => setRetry((n) => n + 1)}>أعد المحاولة</button></div>}
          {def && !def.loading && !def.error && (
            <>
              <p className="la-muted ce-help">{TOGGLE_HELP}{onOpen && <> <button type="button" className="la-link" onClick={go('journey')}>حرّر رحلة البرنامج نفسها</button></>}</p>
              {!jv.total && <p className="la-muted">البرنامج بلا متطلبات بعد: لا رحلة يمر بها المشارك حتى تُبنى.</p>}
              {jv.stages.map((st) => (
                <section key={st.key} className="ce-stage" aria-label={st.title}>
                  <h5>{st.title} <span className={`ce-pill ${st.shown === st.total ? 'ok' : 'info'}`}>{st.shown} ظاهرة من {st.total}</span></h5>
                  {st.lockNote && <p className="ce-stage-note" id={`ce-note-${st.key}`}><span aria-hidden="true">⚠ </span>{st.lockNote}</p>}
                  <ul className="ce-items">
                    {st.items.map((it) => (
                      <li key={it.code} className={`ce-item${it.shown ? '' : ' off'}`}>
                        <div className="ce-item-main">
                          <b>{it.title}</b>
                          <small className="la-muted">{KIND[it.kind] || it.kind} · {it.required ? 'إلزامي' : 'اختياري'}</small>
                          {it.lock && <small className="ce-lock" id={`ce-lock-${it.code}`}><span aria-hidden="true">⚠ </span>لا يُخفى: {it.lock}</small>}
                          {it.warn && <small className={it.shown ? 'la-muted' : 'ce-lock'}>{it.shown ? '' : 'تنبيه: '}{it.warn}</small>}
                        </div>
                        <button type="button" role="switch" className="ce-switch" aria-checked={it.shown} aria-label={`إظهار ${it.label} في رحلة الدفعة`}
                          aria-describedby={it.lock ? `ce-lock-${it.code} ce-note-${st.key}` : undefined} disabled={!canWrite || (it.shown && !!it.lock)} onClick={() => toggle(it.code)}>
                          <span className="ce-knob" aria-hidden="true" /><span className="ce-switch-txt">{it.shown ? 'ظاهر' : 'مخفي'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {jv.total > 0 && <p className="ce-total">مجموع الدفعة: <b>{itemsAr(jv.total)} في {stagesAr(jv.stages.length)}، الظاهر منها {jv.shown}</b>.</p>}
            </>
          )}
        </Section>

        {showDelivery && (
          <Section k="delivery" title={COHORT_SECTIONS[2].title} open={open.delivery} onToggle={() => setOpen((o) => ({ ...o, delivery: !o.delivery }))}
            pills={[...(timeline?.counts.undated ? [{ text: undatedAr(timeline.counts.undated), tone: 'info', icon: '' }] : []), ...deliveryPills]}
            summary={`الرحلة في لمحة بتواريخ الدفعة${deliveryN ? '، وطريقة تنفيذ الأيام التدريبية وجلسات التوجيه في هذه الدفعة. الفارغ يبقى كما في البرنامج.' : '.'}`}>
            {timeline && <JourneyTimeline key={cohort.id} id="jt-cohort" model={timeline} onOpen={openAct} openLabel={actLabel} />}
            {org?.delivery_default && coaching.length > 0 && (
              <p className="ce-source">افتراضي الجهة لجلسات التوجيه: {COACH_MODE[org.delivery_default] || org.delivery_default}. يُعدَّل من ملف الجهة.{' '}
                {canWrite && <button type="button" className="la-link" onClick={applyOrgDefault}>طبّقه على هذه الدفعة</button>}</p>
            )}
            {groups.map((code) => {
              const list = bySection('delivery').filter((f) => f.req === code);
              const head = list[0].label.slice(0, list[0].label.lastIndexOf(': '));
              return (
                <fieldset key={code} className="ce-act">
                  <legend>{list[0].group || head}{list[0].groupStage && <small> · {list[0].groupStage}</small>}</legend>
                  {list.map((f) => <CohortField key={f.name} f={f} v={v} set={set} disabled={!canWrite} className="ce-field" short={f.label.slice(head.length + 2)} />)}
                </fieldset>
              );
            })}
          </Section>
        )}

        <div ref={advRef}>
          <Section k="advanced" title={COHORT_SECTIONS[3].title} open={open.advanced} onToggle={() => setOpen((o) => ({ ...o, advanced: !o.advanced }))} pills={advPills} summary={advSummary}>
            <div className="ce-grid">
              {bySection('advanced').map((f) => (
                <CohortField key={`${f.name}-${f.label}`} f={f} v={v} set={set} disabled={!canWrite} error={errOf(f.name)} className={`ce-field ce-${f.name}${['notes_ar', 'capacity_on'].includes(f.name) ? ' wide' : ''}`} />
              ))}
            </div>
          </Section>
        </div>

        {!isNew && onOpen && (
          <nav className="ce-links" aria-label="يُضبط في نوافذه">
            <span className="la-muted">يُضبط في نافذته:</span>
            <button type="button" className="la-link" onClick={go('schedule')}>الجدول</button>
            <button type="button" className="la-link" onClick={go('team')}>الفريق والمجموعات ووضع المراحل</button>
            <button type="button" className="la-link" onClick={go('vis')}>الرؤية</button>
          </nav>
        )}

        <footer className="ce-foot">
          {error && <div className="la-err" role="alert">{error}</div>}
          <div className="la-row">
            <button className="btn-sm primary" type="submit" disabled={busy || !canWrite}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            <button className="btn-sm ghost" type="button" onClick={close}>إلغاء</button>
            {dirty && <small className="la-muted">تعديلات غير محفوظة</small>}
          </div>
        </footer>
      </form>
    </div>
  );
}
