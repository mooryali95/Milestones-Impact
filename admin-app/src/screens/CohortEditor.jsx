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
import { COACH_MODE, COHORT_SECTIONS, COHORT_STATUS, cohortErrors, cohortFields, cohortOut, cohortToForm, formToCohort, itemsAr, journeyView, KIND, stagesAr } from '../methodology.js';
import { LEVEL_MODE_AR, orgProgram, PROJECT_MODE_AR } from '../../../supabase/functions/leaders-api/logic.js';
import { Spinner, useEscape, useGuardedClose, useUI } from '../ui.jsx';
import { saveCohort } from '../cohort-guard.js';
import { KIND_AR, cohortKind } from '../cohort-hub.js';
import '../cohort-editor.css';

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
    // برنامج آخر: النسخة من برنامجه، فتعود إلى «آخر تعديل» حتى يُختار غيرها. والعودة إلى برنامج الدفعة تعيد نسختها المثبتة
    if ('program_id' in patch && patch.program_id !== cur.program_id) next.program_version_id = patch.program_id === start.program_id ? start.program_version_id : '';
    return next;
  });

  // الرحلة من تعريف الدفعة، وتُعاد قراءتها عند تغيير البرنامج أو النسخة
  useEffect(() => {
    let live = true;
    setDef((d) => ({ ...(d || {}), loading: true }));
    L('admin.cohort-definition', { ...(isNew ? {} : { cohort_id: cohort.id }), program_id: v.program_id, program_version_id: v.program_version_id || '' })
      .then((r) => { if (live) setDef(r?.success ? r : { error: r?.message || 'تعذّرت قراءة رحلة الدفعة' }); });
    return () => { live = false; };
  }, [v.program_id, v.program_version_id, retry]); // cohort.id ثابت ما دام المحرر مفتوحًا
  // حقول التنفيذ من بنود التعريف، فلا يُرسل التنفيذ قبل أن يُقرأ: إرسال «لا تخصيص» يمحو تخصيص الدفعة كله
  const defReady = !!def && !def.loading && !def.error;

  const prog = programs.find((p) => p.id === v.program_id);
  const org = orgs.find((o) => o.id === v.organization_id);
  const reqs = def?.requirements || [];
  const fields = useMemo(() => cohortFields({ orgs, programs, versions: prog?.versions || [], reqs, isDefault, isNew, defVersion: def?.loading || !def ? undefined : def.version?.id || '' })
    // دفعة قائمة على برنامج أُرشف بعد إغلاقها: يُعرض برنامجها الحالي بعلامته ولا يُقترح لغيرها
    .map((f) => (f.name === 'program_id' && prog?.archived_at ? { ...f, options: { ...f.options, [prog.id]: `${prog.name} (مؤرشف)` } } : f)),
  [orgs, programs, prog, reqs, isDefault, isNew, def]);
  const shown = (f) => !f.show || f.show(v);
  const bySection = (k) => fields.filter((f) => f.section === k && shown(f));
  const errs = cohortErrors(v);
  const errOf = (name) => (name === 'content_level' || tried ? errs[name] || '' : '');
  const jv = useMemo(() => journeyView(def || {}, v.hidden_requirements || [], v.hidden_before || []), [def, v.hidden_requirements, v.hidden_before]);

  const dirty = sameHidden(v) !== sameHidden(start);
  const close = useGuardedClose(dirty, () => onClose());
  useEscape(close);
  // ما يُضبط في نافذة أخرى: يُغلق المحرر أولًا (بالسؤال إن كان فيه تعديل) ثم تُفتح نافذته
  const go = (k) => async () => {
    if (dirty && !(await confirm('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟', { danger: true, ok: 'إغلاق دون حفظ' }))) return;
    onClose();
    onOpen?.(k, { program_id: v.program_id });
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
  const advSummary = [version ? `مثبتة على النسخة ${version.number}` : 'تتبع البرنامج كما هو الآن', LEVEL_MODE_AR[v.level_mode] || '', PROJECT_MODE_AR[v.project_mode] || '',
    v.organization_id && v.capacity_on && v.capacity ? `سعة تشغيلية ${v.capacity}` : ''].filter(Boolean).join(' · ');
  const advPills = errs.content_level ? [{ text: 'ينقصه مستوى المحتوى', tone: 'bad', icon: '✕' }] : [];
  const op = !isDefault && v.organization_id ? suggest(v.organization_id) : null;
  // النسخة المثبتة التي ألغاها تغيير البرنامج أو اختيار «آخر تعديل»: يُقال صراحة لا بتغير السطر وحده
  const unpinned = start.program_version_id && !v.program_version_id ? (programs.find((p) => p.id === start.program_id)?.versions || []).find((x) => x.id === start.program_version_id) || { number: '' } : null;
  const groups = [...new Set(bySection('delivery').map((f) => f.req))];
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
                    {unpinned ? <span className="ce-warn-txt">أُلغي تثبيت النسخة {unpinned.number}: بعد الحفظ تتبع الدفعة البرنامج كما هو الآن. </span> : null}
                    {def?.version ? `الرحلة من النسخة ${def.version.number} المثبتة (${def.version.label}).` : 'الرحلة تتبع البرنامج كما هو الآن.'}{' '}
                    <button type="button" className="la-link" onClick={() => { setOpen((o) => ({ ...o, advanced: true })); setTimeout(() => advRef.current?.querySelector('#f-program_version_id')?.focus(), 0); }}>غيّر النسخة</button>
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

        {deliveryN > 0 && (
          <Section k="delivery" title={COHORT_SECTIONS[2].title} open={open.delivery} onToggle={() => setOpen((o) => ({ ...o, delivery: !o.delivery }))} pills={deliveryPills}
            summary="طريقة تنفيذ الأيام التدريبية وجلسات التوجيه في هذه الدفعة. الفارغ يبقى كما في البرنامج.">
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
