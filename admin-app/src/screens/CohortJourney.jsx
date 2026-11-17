// ════════════════════════════════════════════════════════════════
// تبويب «الرحلة» في ملف الدفعة (R1 في تصور محرر رحلة الدفعة): الرحلة كاملة في نظرة واحدة، للقراءة فقط
// ════════════════════════════════════════════════════════════════
// ثلاث طبقات من أعلى لأسفل: الرأس (البداية والنهاية والمدة واليوم)، والخط الزمني الحي (JourneyTimeline نفسه، نُقل من
// محرر الدفعة)، وبطاقات المراحل بالمحاور، والمراحل التي «تسير معًا» ممرات تحت بعضها. ثم خريطة الرحلة (R0) بأعداد الناس.
// النموذج كله من cohort-journey.js، والتواريخ من stageWindows وmilestoneDueInfo وحدهما. لا كتابة هنا: المدة والإيقاف
// والتوازي للدفعة في R2، وحتى ذلك تُضبط المدد في رحلة البرنامج والمواعيد في نافذة «الجدول».
// البيانات بإجراءات قراءة قائمة: admin.cohort-definition وadmin.milestones وadmin.cohort-journey.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner } from '../ui.jsx';
import JourneyTimeline from '../../../shared/ui/JourneyTimeline.jsx';
import JourneyMap from '../../../shared/ui/JourneyMap.jsx';
import { cohortTimeline, journeyHeader, journeyKpis, journeyLanes, membersAr, TAB_TIMELINE_OMIT } from '../cohort-journey.js';
import '../cohort-journey.css';

// الخريطة تُحسب من رحلة كل عضو على الخادم: تلقائيًا للدفعة الصغيرة، وللمفتوحة أو الكبيرة بطلب صريح (R0)
export const JOURNEY_AUTO_MAX = 300;

function StageCard({ s }) {
  const head = `cj-st-${s.key}`;
  return (
    <article id={`cj-stage-${s.key}`} tabIndex={-1} className={`cj-card${s.status ? ` st-${s.status}` : ''}${s.optional ? ' opt' : ''}${s.lead ? '' : ' lane'}`} aria-labelledby={head}>
      <header className="cj-card-head">
        <h5 id={head}>{s.title}</h5>
        <span className="cj-dur">{s.label}</span>
        {s.optional && <span className="cj-tag">اختيارية</span>}
        {s.status_ar && <span className={`cj-state ${s.status}`}><i aria-hidden="true" />{s.status_ar}</span>}
      </header>
      {s.window_ar ? (
        <p className="cj-window"><b>{s.window_ar}</b><small>{s.window_source_ar}</small></p>
      ) : <p className="cj-window"><small>بلا تواريخ: {s.label}</small></p>}
      {(s.with_ar || s.rule_ar) && (
        <ul className="cj-rules">
          {s.with_ar && <li className="cj-with">{s.with_ar}</li>}
          {s.rule_ar && <li>{s.rule_ar}</li>}
        </ul>
      )}
      {s.today_ar && <p className="cj-today">{s.today_ar}</p>}
      <dl className="cj-facts">
        <div><dt>الأنشطة</dt><dd>{s.acts.text}{s.undated && <small className="cj-warn"> · موعد يُحدد لاحقًا</small>}</dd></div>
        {s.people && (
          <div><dt>الناس</dt><dd>
            {s.people.here ? `${s.people.here} الآن` : 'لا أحد الآن'}
            {s.people.late > 0 && <small className="cj-warn"> · {s.people.late} تجاوز موعدها</small>}
            {s.people.done > 0 && <small> · أنهاها {s.people.done}</small>}
          </dd></div>
        )}
      </dl>
      {s.milestones.length > 0 && (
        <ul className="cj-ms" aria-label={`معالم ${s.title}`}>
          {s.milestones.map((m) => (
            <li key={m.id} className={m.due ? '' : 'none'}>
              <span className="cj-ms-flag" aria-hidden="true" />
              <span className="cj-ms-t"><b>{m.title}</b><small>{m.anchor_ar}</small></span>
              <span className="cj-ms-due"><b>{m.due_ar}</b>{m.source_ar && <small>{m.source_ar}</small>}</span>
              {m.late > 0 && <span className="cj-ms-late">{m.late} متأخر</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** @param {{ c: any, canWrite?: boolean, on?: Record<string, any> }} props
 *  on: أزرار ملف الدفعة نفسها (edit وschedule وjourney)، فلا مدخل ثانٍ لأي إعداد */
export default function CohortJourney({ c, canWrite = false, on = {} }) {
  const [d, setD] = useState(null);
  const [retry, setRetry] = useState(0);
  const auto = !c.is_default && (Number(c.members) || 0) <= JOURNEY_AUTO_MAX;
  const [want, setWant] = useState(auto);
  const [map, setMap] = useState(null);
  const [mapRetry, setMapRetry] = useState(0);

  useEffect(() => {
    let live = true;
    setD(null);
    Promise.all([L('admin.cohort-definition', { cohort_id: c.id }), L('admin.milestones', { program_id: c.program_id })]).then(([def, ms]) => {
      if (!live) return;
      // فشل قراءة المعالم يُقال صراحة، فلا يُخلط بـ«برنامج بلا معالم»
      const msBad = !ms || ms.success === false;
      setD(def?.success === false ? { error: def.message || 'تعذّرت قراءة رحلة الدفعة' }
        : { def, milestones: msBad ? [] : ms.milestones || [], msError: msBad ? ms?.message || 'تعذّرت قراءة معالم البرنامج' : '' });
    });
    return () => { live = false; };
  }, [c.id, c.program_id, retry]);
  useEffect(() => { setWant(auto); }, [c.id, auto]);
  useEffect(() => {
    let live = true;
    setMap(null);
    // ردّ دفعة سابقة يصل بعد الانتقال إلى غيرها لا يكتب فوقها
    if (want) L('admin.cohort-journey', { cohort_id: c.id }).then((r) => { if (live) setMap(r); });
    return () => { live = false; };
  }, [c.id, want, mapRetry]);

  const jm = map?.success ? map.journey_map : null;
  const model = useMemo(() => (d?.def ? cohortTimeline(d.def, c, new Date()) : null), [d, c]);
  const lanes = useMemo(() => (model ? journeyLanes(model, { def: d.def, cohort: c, milestones: d.milestones, map: jm }) : null), [model, d, c, jm]);
  const head = model ? journeyHeader(model, c) : null;
  const kpis = model ? journeyKpis(model, lanes, jm, { msError: !!d?.msError }) : [];
  const mapFailed = want && map && !map.success;
  // القفز إلى البطاقة: التركيز البرمجي بعد نقرة الفأرة لا يُظهر :focus-visible، فإبراز قصير يدل على البطاقة
  const flashT = useRef(0);
  useEffect(() => () => clearTimeout(flashT.current), []);
  const toCard = (k) => {
    const el = document.getElementById(`cj-stage-${k}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    document.querySelectorAll('.cj-card.flash').forEach((x) => x.classList.remove('flash'));
    el.classList.add('flash');
    clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => el.classList.remove('flash'), 1600);
  };
  // النقر على نشاط: الورشة إلى «+ موعد» عندها في «الحضور والجلسات»، وغيرها إلى رحلة البرنامج (كما كان في محرر الدفعة)
  const openAct = (a) => {
    if (a.kind === 'workshop') window.location.hash = `#/leaders/activities?req=${encodeURIComponent(a.requirement_id || '')}`;
    else on.journey?.();
  };
  const actLabel = (a) => (a.kind !== 'workshop' ? 'افتحه في رحلة البرنامج' : a.undated ? 'أضف موعده' : 'افتح مواعيده');

  if (!d) return <div className="cj"><Spinner /></div>;
  if (d.error) return <div className="cj"><p className="la-err" role="alert">{d.error} <button type="button" className="la-link" onClick={() => setRetry((n) => n + 1)}>أعد المحاولة</button></p></div>;

  const version = d.def.version;
  return (
    <div className="cj">
      <header className="cj-hero" aria-labelledby="cj-title">
        <div className="cj-hero-txt">
          <p className="cj-eyebrow">رحلة الدفعة · {version ? `النسخة ${version.number} المثبتة (${version.label})` : 'البرنامج كما هو الآن'}</p>
          <h3 id="cj-title" className="sr-only">رحلة الدفعة</h3>
          {head.kind === 'dated' ? (
            <p className="cj-title">تبدأ الدفعة <b>{head.start_ar}</b>، وتنتهي الرحلة <b>{head.end_ar}</b> <span className="cj-total">({head.total})</span></p>
          ) : <p className="cj-title">{head.text}</p>}
          {head.kind === 'undated' && canWrite && on.edit && <button type="button" className="cj-hero-btn" onClick={on.edit}>حدد تاريخ البداية</button>}
        </div>
        {head.kind === 'dated' && (
          <div className={`cj-now${head.today ? ' live' : ''}`} role="status">
            <span className="cj-now-dot" aria-hidden="true" />
            <span><small>{head.today ? head.today.label : 'الآن'}</small><b>{head.now}</b></span>
          </div>
        )}
      </header>

      {kpis.length > 0 && (
        <dl className="cj-kpis" aria-label="الرحلة بالأرقام">
          {kpis.map((k) => <div key={k.key} className={k.tone ? `tone-${k.tone}` : ''}><dt>{k.label}</dt><dd>{k.value}</dd></div>)}
        </dl>
      )}
      {head.over_ar && <p className="cj-alert" role="note"><span aria-hidden="true">!</span>{head.over_ar}</p>}
      {d.msError && (
        <p className="cj-alert" role="alert"><span aria-hidden="true">!</span>
          <span>{d.msError}، فلا تظهر المعالم في البطاقات. <button type="button" className="la-link" onClick={() => setRetry((n) => n + 1)}>أعد المحاولة</button></span></p>
      )}
      {mapFailed && (
        <p className="cj-alert" role="note"><span aria-hidden="true">!</span>
          <span>تعذّرت قراءة أعداد الناس، فلا تظهر في البطاقات. <button type="button" className="la-link" onClick={() => setMapRetry((n) => n + 1)}>أعد المحاولة</button></span></p>
      )}
      <p className="cj-ro" role="note">
        للقراءة: تعديل المدة وإيقاف مرحلة والتوازي لهذه الدفعة يأتي في هذا التبويب لاحقًا. حتى ذلك تُضبط المدد في رحلة البرنامج، والمواعيد في الجدول.
        {' '}{on.journey && <button type="button" className="la-link" onClick={on.journey}>رحلة البرنامج</button>}
        {canWrite && on.schedule && <> · <button type="button" className="la-link" onClick={on.schedule}>الجدول</button></>}
      </p>

      {!model.empty && <JourneyTimeline key={c.id} id="jt-cohort" model={model} onOpen={openAct} openLabel={actLabel} onStage={toCard} omitCards={TAB_TIMELINE_OMIT} />}

      {lanes.phases.length > 0 && (
        <section className="cj-stages" aria-labelledby="cj-stages-h">
          <h3 id="cj-stages-h" className="cj-h">المراحل</h3>
          {lanes.phases.map((p) => (
            <section key={p.key} className={`cj-phase ph-${p.key}`} aria-labelledby={`cj-ph-${p.key}`}>
              <header className="cj-phase-head"><h4 id={`cj-ph-${p.key}`}>{p.title}</h4><small>{p.label}</small></header>
              <div className="cj-groups">
                {p.groups.map((g) => (g.together ? (
                  <div key={g.key} className="cj-group together" role="group" aria-label={`مراحل تسير معًا: ${g.note_ar}`}>
                    <p className="cj-group-note"><span>تسير معًا</span>{g.note_ar}</p>
                    <div className="cj-lanes">{g.stages.map((s) => <StageCard key={s.key} s={s} />)}</div>
                  </div>
                ) : <div key={g.key} className="cj-group">{g.stages.map((s) => <StageCard key={s.key} s={s} />)}</div>))}
              </div>
            </section>
          ))}
          {lanes.cohort_milestones.length > 0 && (
            <section className="cj-phase cj-cohort-ms" aria-labelledby="cj-cms-h">
              <header className="cj-phase-head"><h4 id="cj-cms-h">معالم الدفعة</h4><small>مرتبطة بتاريخ الدفعة لا بمرحلة</small></header>
              <ul className="cj-ms">
                {lanes.cohort_milestones.map((m) => (
                  <li key={m.id} className={m.due ? '' : 'none'}>
                    <span className="cj-ms-flag" aria-hidden="true" />
                    <span className="cj-ms-t"><b>{m.title}</b><small>{m.anchor_ar}</small></span>
                    <span className="cj-ms-due"><b>{m.due_ar}</b>{m.source_ar && <small>{m.source_ar}</small>}</span>
                    {m.late > 0 && <span className="cj-ms-late">{m.late} متأخر</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}

      {/* خريطة الرحلة (R0): المكوّن نفسه الذي في صفحة الجهة وبوابتها، ومنها أعداد الناس في البطاقات أعلاه */}
      <section className="cohort-journey" aria-labelledby="cj-h">
        <h3 className="cj-h" id="cj-h">خريطة الرحلة</h3>
        {!want ? (
          <p className="la-muted">{c.is_default ? 'الدفعة المفتوحة تضم كل من ليس في دفعة، ' : `في الدفعة ${membersAr(Number(c.members) || 0)}، `}
            وتُحسب الخريطة من رحلة كل عضو. <button type="button" className="btn-sm ghost" onClick={() => setWant(true)}>اعرض خريطة الرحلة</button></p>
        ) : !map ? <Spinner /> : !map.success ? (
          <p className="la-err" role="alert">{map.message || 'تعذّرت قراءة خريطة الرحلة'} <button type="button" className="la-link" onClick={() => setMapRetry((n) => n + 1)}>أعد المحاولة</button></p>
        )
          : !jm?.stages?.length ? <p className="la-muted">لا مراحل معرّفة لبرنامج هذه الدفعة بعد.</p>
          : <>
            {!jm.totals?.total && <p className="la-muted">لا أعضاء في الرحلة بعد، فالأعداد كلها صفر.</p>}
            {jm.cohort?.starts_on && !jm.cohort?.is_default && <p className="la-muted small">«متأخر» هنا من تجاوز اليوم موعد نهاية مرحلته على جدول الدفعة بعد مهلة ثلاثة أيام، أيًا كان يوم دخوله إليها.</p>}
            <JourneyMap map={jm} embedded />
          </>}
      </section>
    </div>
  );
}
