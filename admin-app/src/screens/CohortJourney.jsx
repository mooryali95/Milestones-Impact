// ════════════════════════════════════════════════════════════════
// تبويب «الرحلة» في ملف الدفعة: الرحلة كاملة في نظرة واحدة (R1)، ومكان تعديل مدة كل مرحلة لهذه الدفعة (R2a)
// ════════════════════════════════════════════════════════════════
// ثلاث طبقات من أعلى لأسفل: الرأس (البداية والنهاية والمدة واليوم)، والخط الزمني الحي (JourneyTimeline نفسه)، وبطاقات
// المراحل بالمحاور، والمراحل التي «تسير معًا» ممرات تحت بعضها. ثم خريطة الرحلة (R0) بأعداد الناس.
// وضع التحرير (R2a): عداد مدة في كل بطاقة (أيام أو أسابيع، القرار 9)، والخط والبطاقات معاينة حية للمسودة، ثم «راجع
// واحفظ» تفتح نافذة الأثر من الخادم (admin.cohort-plan op=preview)، والحفظ والتراجع والسجل بالإجراء نفسه. هذا التبويب
// كاتب خطة الدفعة الوحيد (القرار 23). لا حساب تاريخ هنا: المسودة من planEdit وتواريخها من cohortPlan (cohort-journey.js).
// والإيقاف (R2b): مفتاح «أوقف لهذه الدفعة» في كل بطاقة، مقفل بسببه للمحمية ولمرجع «تبدأ مع»، والموقوفة باهتة في مكانها
// وتعود بنقرة. ونافذة الأثر تسمي من ينتقل والقواعد التي سقط شرطها والمعالم المستبعدة، وفيها «أبلغ المشاركين» (القرار 13)
// وسؤال من تجاوز مرحلة تعود (القرار 12).
// والتوازي (R3a): «تسير مع» وإزاحة من بداية المرجع في كل بطاقة، وتنبيه التجاوز، والممر في الخط يبدأ بإزاحته.
// وأيام الورشة (W3، تصور 2026-11-18 ب5.4): في بطاقة كل مرحلة فيها حضور جلسات أيامها لهذه الدفعة بموعدها ومكانها وطريقتها
// وحضورها وسعتها، و«+ يوم أو ورشة» والتحرير والإلغاء بنموذج «الحضور والجلسات» وadmin.workshop-save نفسيهما (مسار كتابة واحد).
// وغير الإلزامية (T0): «عند الحاجة» أو «اختيارية» بإطار متقطع في الخط والبطاقة.
// والسحب (D1، ب5.3): في وضع التحرير لمن يكتب، سحب الشريط في الخط يكتب في المسودة نفسها التي تكتبها العدادات (dropToEdit ثم
// mergeEdit ثم planDraft)، والحفظ بنافذة الأثر نفسها. البداية للممر والمسار (الإزاحة)، والطرف للمدة أو نهاية المسار، والإفلات
// على مرحلة أخرى «تسير مع»، والإفلات في «مسارات مستمرة» يُرفض برابط «غيّرها في البرنامج». بلا مكتبة، والعدادات بديل دائم.
// البيانات: admin.cohort-definition وadmin.milestones وadmin.cohort-journey وadmin.cohort-workshops للقراءة، وadmin.cohort-plan للخطة.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useEscape, useUI } from '../ui.jsx';
import Form from '../Form.jsx';
import { Attendance, inviteSession, QrScreen, sessionFields } from './Activities.jsx';
import { workshopDays } from '../workshop-days.js';
import { dateOnly, dateTime } from '../dates.js';
import JourneyTimeline from '../../../shared/ui/JourneyTimeline.jsx';
import JourneyMap from '../../../shared/ui/JourneyMap.jsx';
import {
  applyDrop, cohortTimeline, endsOffer, dragGhostAr, dropToEdit, fromUnit, historyRows, mergeEdit, impactAr, inUnit, journeyHeader, journeyKpis, journeyLanes, membersAr, planBody, planCohort, planDraft,
  planLock, stepDays, suggestDays, TAB_TIMELINE_OMIT, unitFor,
} from '../cohort-journey.js';
import { PLAN_DAYS_MAX, planDaysMin } from '../../../supabase/functions/leaders-api/stage-windows.js';
import { outsideSessions, scalePos } from '../../../supabase/functions/leaders-api/journey-timeline.js';
import { countAr } from '../../../supabase/functions/leaders-api/labels.js';
import { durationAr } from '../../../supabase/functions/leaders-api/journey.js';
import '../cohort-journey.css';

const GENERAL_EDIT_AR = 'جلسة عامة لكل دفعات البرنامج: ما تغيّره هنا أو تحذفه يسري على كل الدفعات.';
const editsAr = (n) => countAr(n, 'تعديل واحد', 'تعديلان', 'تعديلات', 'تعديلًا');

// الخريطة تُحسب من رحلة كل عضو على الخادم: تلقائيًا للدفعة الصغيرة، وللمفتوحة أو الكبيرة بطلب صريح (R0)
export const JOURNEY_AUTO_MAX = 300;

// عداد المدة في البطاقة: [-] الرقم بوحدته [+]، والوحدة أيام أو أسابيع، ومصدر المدة، و«ارجع لمدة البرنامج».
// المثبتة بتاريخ لا تتبع مدتها: العداد مقفل وسببه مكتوب، والحل «حرّر التواريخ لتتبع المدد» أعلى البطاقات
function PlanControl({ s, row, stage, onDays }) {
  const [unit, setUnit] = useState(() => unitFor(row.days));
  const [text, setText] = useState(null);
  const min = planDaysMin(stage || {});
  const id = `cj-days-${s.key}`;
  const set = (d) => { setText(null); onDays(s.key, Math.max(min, Math.min(PLAN_DAYS_MAX, d))); };
  if (row.pinned) {
    return <p className="cj-plan locked" id={id}><span className="cj-lock" aria-hidden="true" />مثبتة بتاريخ ({row.days_ar})، فلا تتبع المدد. حرّرها بـ«حرّر التواريخ لتتبع المدد».</p>;
  }
  const value = text ?? String(inUnit(row.days, unit));
  return (
    <div className={`cj-plan${row.edited ? ' edited' : ''}`} role="group" aria-label={`مدة ${s.title}`}>
      <div className="cj-step">
        <button type="button" aria-label={`أنقص مدة ${s.title}`} disabled={row.days <= min} onClick={() => set(stepDays(row.days, unit, -1, min))}>−</button>
        <input id={id} type="text" inputMode="numeric" dir="ltr" aria-label={`مدة ${s.title} ب${unit === 'weeks' ? 'الأسابيع' : 'الأيام'}`} value={value}
          onChange={(e) => { setText(e.target.value); const d = fromUnit(e.target.value, unit); if (d != null && e.target.value.trim() !== '') onDays(s.key, Math.max(min, Math.min(PLAN_DAYS_MAX, d))); }}
          onBlur={() => setText(null)} />
        <select aria-label={`وحدة مدة ${s.title}`} value={unit} onChange={(e) => { setUnit(e.target.value); setText(null); }}>
          <option value="days">أيام</option><option value="weeks">أسابيع</option>
        </select>
        <button type="button" aria-label={`زد مدة ${s.title}`} disabled={row.days >= PLAN_DAYS_MAX} onClick={() => set(stepDays(row.days, unit, 1, min))}>+</button>
      </div>
      <span className="cj-plan-meta">
        <b>{row.days_ar}</b>
        <small className={row.source === 'cohort' ? 'own' : ''}>{row.source_ar}</small>
        {row.was_ar && <small className="cj-was">{row.was_ar}</small>}
        {row.source === 'cohort' && <button type="button" className="la-link" onClick={() => onDays(s.key, null)}>ارجع لمدة البرنامج</button>}
      </span>
    </div>
  );
}

// «تسير مع» لهذه الدفعة (R3a): قائمة بالمراحل السابقة في المحور (planWithCandidates) أو «لا شيء»، ومعها عداد الإزاحة
// «تبدأ بعد N من بدايتها» بأيام أو أسابيع، من 0 إلى مدة المرجع (البند 4.6). الإزاحة تخطيط للتواريخ وحدها: الفتح يبقى مع
// بداية المرجع (القرار 6). وتنبيه التجاوز إن انتهت بعد مرجعها: مسموح، والمجموعة تطول به
function WithControl({ s, row, onWith, onOffset }) {
  const [unit, setUnit] = useState(() => unitFor(row.offset));
  const [text, setText] = useState(null);
  if (row.with_lock || (!row.with_options.length && !row.with)) return null;
  const sel = `cj-with-${s.key}`;
  const id = `cj-offset-${s.key}`;
  const max = row.offset_max;
  const setOff = (d) => { setText(null); onOffset(s.key, Math.max(0, Math.min(max, d))); };
  const value = text ?? String(inUnit(row.offset, unit));
  const own = row.par_source === 'cohort';
  const refTitle = row.with ? (row.with_options.find((o) => o.key === row.with)?.title || row.with) : '';
  return (
    <div className={`cj-plan cj-par${row.edited ? ' edited' : ''}`} role="group" aria-label={`توازي ${s.title}`}>
      <label className="cj-par-with" htmlFor={sel}>
        <span>{row.track ? 'يبدأ مع' : 'تسير مع'}</span>
        <select id={sel} value={row.with || ''} onChange={(e) => onWith(s.key, e.target.value || false)}>
          {!row.track && <option value="">لا شيء (تبدأ بعد ما قبلها)</option>}
          {row.with_options.map((o) => <option key={o.key} value={o.key}>{o.title}</option>)}
          {row.with && !row.with_options.some((o) => o.key === row.with) && <option value={row.with}>{refTitle}</option>}
        </select>
      </label>
      {row.with && (
        <div className="cj-par-off">
          <span id={`${id}-l`}>تبدأ بعد</span>
          <div className="cj-step">
            <button type="button" aria-label={`أنقص إزاحة ${s.title}`} disabled={row.offset <= 0} onClick={() => setOff(stepDays(row.offset, unit, -1, 0, max))}>−</button>
            <input id={id} type="text" inputMode="numeric" dir="ltr" aria-label={`إزاحة ${s.title} عن بداية «${refTitle}» ب${unit === 'weeks' ? 'الأسابيع' : 'الأيام'}`} value={value}
              aria-describedby={`${id}-max`}
              onChange={(e) => {
                const d = fromUnit(e.target.value, unit);
                if (d == null || e.target.value.trim() === '') { setText(e.target.value); return; }
                onOffset(s.key, Math.max(0, Math.min(max, d)));
                // خارج المدى: يُحصر في المسودة، فيعرض الحقل ما حُفظ فعلًا لا ما كُتب
                setText(d > max || d < 0 ? null : e.target.value);
              }}
              onBlur={() => setText(null)} />
            <select aria-label={`وحدة إزاحة ${s.title}`} value={unit} onChange={(e) => { setUnit(e.target.value); setText(null); }}>
              <option value="days">أيام</option><option value="weeks">أسابيع</option>
            </select>
            <button type="button" aria-label={`زد إزاحة ${s.title}`} disabled={row.offset >= max} onClick={() => setOff(stepDays(row.offset, unit, 1, 0, max))}>+</button>
          </div>
          <span>من بدايتها</span>
          <small id={`${id}-max`} className="cj-par-max">{row.track ? `مسار مستمر: يبدأ بعد أي عدد أيام من بداية «${refTitle}»، حتى ${max} يومًا` : <>أقصاها مدة «{refTitle}»: {max ? durationAr(max) : 'صفر'}</>}</small>
        </div>
      )}
      <span className="cj-plan-meta">
        <small className={own ? 'own' : ''}>{own ? 'معدّل لهذه الدفعة' : 'من البرنامج'}</small>
        {row.with && <small>{row.track ? `يُفتح مع بداية «${refTitle}»، والإزاحة تخطيط للتواريخ` : `الإزاحة تخطيط للتواريخ: تُفتح مع بداية «${refTitle}»`}</small>}
        {own && <button type="button" className="la-link" onClick={() => onWith(s.key, null)}>ارجع لقاعدة البرنامج</button>}
      </span>
    </div>
  );
}

// نهاية المسار المستمر لهذه الدفعة (T1): نهاية الرحلة (نهاية الدفعة في ملفها)، أو مدته، أو نهاية طور، أو نهاية مرحلة.
// يكتب until في المسودة نفسها، ونافذة الأثر تسمي تغير امتداده قبل الحفظ
function UntilControl({ s, row, onUntil }) {
  const id = `cj-until-${s.key}`;
  const own = row.until_source === 'cohort';
  return (
    <div className={`cj-plan cj-until${row.edited ? ' edited' : ''}`} role="group" aria-label={`نهاية ${s.title}`}>
      <label className="cj-par-with" htmlFor={id}>
        <span>يمتد حتى</span>
        <select id={id} value={row.until} onChange={(e) => onUntil(s.key, e.target.value)}>
          {Object.entries(row.until_options).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>
      <span className="cj-plan-meta">
        <small className={own ? 'own' : ''}>{own ? 'معدّلة لهذه الدفعة' : 'من البرنامج'}</small>
        <small>يسير بجانب المراحل، فلا يؤخر ما بعده ولا يطيل الرحلة</small>
        {own && <button type="button" className="la-link" onClick={() => onUntil(s.key, null)}>ارجع لقاعدة البرنامج</button>}
      </span>
    </div>
  );
}

// مفتاح «أوقف لهذه الدفعة» (R2b): مفتاح تبديل بحالته، والمحمية ومرجع «تبدأ مع» مقفلة وسببها مكتوب تحته ومربوط به،
// والموقوفة التي تبدأ مع مرجع موقوف لا تُعاد قبله (القرار 22)
function OffSwitch({ s, row, onOff }) {
  const id = `cj-off-${s.key}`;
  const why = `${id}-why`;
  const disabled = !!row.block;
  return (
    <div className={`cj-off${row.off ? ' on' : ''}${disabled ? ' locked' : ''}`}>
      <button type="button" role="switch" id={id} className="cj-switch" aria-checked={row.off} disabled={disabled}
        aria-describedby={disabled ? why : undefined} onClick={() => onOff(s.key, !row.off)}>
        <span className="cj-switch-track" aria-hidden="true"><span className="cj-switch-knob" /></span>
        <span className="cj-switch-label">أوقف لهذه الدفعة</span>
      </button>
      {disabled && <small id={why} className="cj-off-why"><span className="cj-lock" aria-hidden="true" />{row.block.msg}</small>}
      {row.off && !disabled && <small className="cj-off-why">موقوفة في هذه المسودة: تختفي من الخط ويُزاح ما بعدها. أعدها بالمفتاح نفسه.</small>}
    </div>
  );
}

// أيام الورشة في البطاقة (W3): العداد «X من Y محددة»، وصف لكل يوم، وأدوات الكتابة لمن يكتب وحده (canWrite)
function StageDays({ s, days, act }) {
  const id = `cj-days-${s.key}`;
  return (
    <section className="cj-days" id={id} tabIndex={-1} aria-labelledby={`${id}-h`}>
      <header className="cj-days-head">
        <h6 id={`${id}-h`}>{days.head_ar}</h6>
        <span className={`cj-days-count tone-${days.tone}`}>{days.count_ar}</span>
        {act.canWrite && <button type="button" className="btn-sm primary cj-day-add" aria-label={`يوم أو ورشة في ${s.title}`} onClick={() => act.add(days, s)}>+ يوم أو ورشة</button>}
      </header>
      {act.error && <p className="cj-alert" role="alert"><span aria-hidden="true">!</span><span>{act.error} <button type="button" className="la-link" onClick={act.retry}>أعد المحاولة</button></span></p>}
      {!days.rows.length ? <p className="la-muted cj-days-none">{days.empty_ar}</p> : (
        <ul className="cj-day-list">
          {days.rows.map((r) => (
            <li key={r.id} className={`cj-day${r.active ? '' : ' off'}${r.held ? ' held' : ''}${r.undated ? ' tbd' : ''}`} data-day={r.id}>
              <div className="cj-day-main">
                <b className="cj-day-t">{r.title}</b>
                {!r.active && <span className="cj-tag">ملغى لهذه الدفعة</span>}
                {r.general && <span className="cj-tag" title="جلسة عامة تظهر لكل دفعات البرنامج">لكل الدفعات</span>}
                {days.reqs.length > 1 && <small className="cj-day-req">{r.req_title}</small>}
              </div>
              <p className="cj-day-meta">
                <span className={r.undated ? 'cj-warn' : ''}>{r.when_ar}</span>
                <span>{r.place_ar}</span>
                <span>{r.verify_ar}</span>
              </p>
              {(r.counts_ar || r.capacity_ar) && (
                <p className="cj-day-nums">
                  {r.counts_ar && <span>{r.counts_ar}</span>}
                  {r.capacity_ar && <span className={r.over ? 'over' : ''}>{r.capacity_ar}</span>}
                </p>
              )}
              {r.over && <p className="cj-day-warn" role="note"><span aria-hidden="true">!</span>{r.over_ar}</p>}
              {r.outside && <p className="cj-day-warn" role="note"><span aria-hidden="true">!</span>خارج نافذة المرحلة لهذه الدفعة. الحضور يُحسب، وراجع الموعد أو مدة المرحلة.</p>}
              <div className="la-row cj-day-acts">
                {r.qr && r.active && <button type="button" className="btn-sm ghost" onClick={() => act.qr(r)}>اعرض رمز الحضور</button>}
                {r.expected != null && <button type="button" className="la-link" onClick={() => act.attendance(r)}>قائمة الحضور</button>}
                {act.canWrite && r.can_invite && <button type="button" className="la-link" title="بريد بالموعد والمكان وملف تقويم لأعضاء الدفعة. التذكير قبل يوم وقبل ساعة يُرسل آليًا." onClick={() => act.invite(r)}>{r.invited ? 'أُرسلت الدعوة' : 'أرسل الدعوة'}</button>}
                {act.canWrite && <button type="button" className="la-link" aria-label={`حرّر: ${r.title}`} onClick={() => act.edit(r)}>حرّر</button>}
                {act.canWrite && (r.active
                  ? <button type="button" className="la-link danger" aria-label={`ألغِ اليوم: ${r.title}`} onClick={() => act.cancel(r)}>ألغِ اليوم</button>
                  : <button type="button" className="la-link" aria-label={`أعده: ${r.title}`} onClick={() => act.restore(r)}>أعده</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// rows: صف كل مرحلة في خطة الدفعة (planDraft) دائمًا، وplan: أدوات التحرير في وضع التحرير وحده
// days: أيام الورشة لهذه المرحلة (workshopDays) إن كان فيها حضور جلسات، وact: أدواتها
function StageCard({ s, rows = null, plan = null, days = null, act = null }) {
  const head = `cj-st-${s.key}`;
  const row = rows?.[s.key];
  const off = !!(s.off || row?.off);
  return (
    <article id={`cj-stage-${s.key}`} tabIndex={-1} className={`cj-card${s.status ? ` st-${s.status}` : ''}${s.optional ? ` opt md-${s.mode}` : ''}${s.lead ? '' : ' lane'}${row?.edited ? ' edited' : ''}${off ? ' off' : ''}`} aria-labelledby={head}>
      <header className="cj-card-head">
        <h5 id={head}>{s.title}</h5>
        {s.lane === 'track' && <span className="cj-tag cj-lane">{s.lane_ar}</span>}
        <span className="cj-dur">{s.label}</span>
        {!plan && !off && row?.source === 'cohort' && <span className="cj-tag own">معدّلة لهذه الدفعة</span>}
        {s.mode_ar && <span className="cj-tag cj-mode">{s.mode_ar}</span>}
        {s.status_ar && <span className={`cj-state ${s.status}`}><i aria-hidden="true" />{s.status_ar}</span>}
      </header>
      {plan && row && <OffSwitch s={s} row={row} onOff={plan.onOff} />}
      {plan && row && !off && (!row.track || row.until === 'days') && <PlanControl s={s} row={row} stage={plan.stageOf(s.key)} onDays={plan.onDays} />}
      {plan && row && !off && <WithControl s={s} row={row} onWith={plan.onWith} onOffset={plan.onOffset} />}
      {plan && row?.track && !off && <UntilControl s={s} row={row} onUntil={plan.onUntil} />}
      {plan && row?.over && !off && <p className="cj-over" role="note"><span aria-hidden="true">!</span>{row.over.msg}. التجاوز مسموح، والمجموعة تنتهي بأطول أعضائها.</p>}
      {off ? <p className="cj-window"><small>لا نافذة لها في هذه الدفعة، وما بعدها يبدأ في مكانها. من يقف فيها ينتقل إلى ما بعدها، وما أنجزه محفوظ.</small></p>
        : s.window_ar ? (
          <p className="cj-window"><b>{s.window_ar}</b><small>{s.window_source_ar}</small></p>
        ) : <p className="cj-window"><small>بلا تواريخ: {s.label}</small></p>}
      {(s.with_ar || s.offset_ar || s.rule_ar || s.until_ar) && (
        <ul className="cj-rules">
          {s.with_ar && <li className="cj-with">{s.with_ar}</li>}
          {s.until_ar && <li className="cj-until-ar">{s.until_ar}، ولا يؤخر ما بعده</li>}
          {s.due_ar && <li className="cj-due">{s.due_ar}</li>}
          {s.offset_ar && <li className="cj-offset">{s.offset_ar}</li>}
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
            <li key={m.id} className={m.excluded ? 'excluded' : m.due ? '' : 'none'}>
              <span className="cj-ms-flag" aria-hidden="true" />
              <span className="cj-ms-t"><b>{m.title}</b><small>{m.anchor_ar}</small></span>
              <span className="cj-ms-due"><b>{m.due_ar}</b>{m.source_ar && <small>{m.source_ar}</small>}</span>
              {m.late > 0 && <span className="cj-ms-late">{m.late} متأخر</span>}
            </li>
          ))}
        </ul>
      )}
      {days && act && !off && <StageDays s={s} days={days} act={act} />}
    </article>
  );
}

// بطاقة الخدمة (T2، ب5.2): إتاحتها وحد جلساتها، ومؤشر الاستخدام بدل الحالة («استفاد 7 من 20»). لا نافذة ولا مدة ولا عدادات:
// طبيعتها وإتاحتها من البرنامج، وإيقافها لهذه الدفعة بمفتاحها
function ServiceCard({ s, rows = null, plan = null }) {
  const head = `cj-st-${s.key}`;
  const row = rows?.[s.key];
  // المسودة تحكم إن وُجدت (إيقاف أو إعادة قبل الحفظ)، وإلا المحفوظ (s.off: خدمة موقوفة لهذه الدفعة)
  const off = row ? !!row.off : !!s.off;
  return (
    <article id={`cj-stage-${s.key}`} tabIndex={-1} className={`cj-card svc${off ? ' off' : ''}`} aria-labelledby={head} data-testid={`cj-service-${s.key}`}>
      <header className="cj-card-head">
        <h5 id={head}>{s.title}</h5>
        <span className="cj-tag cj-svc">{s.lane_ar}</span>
        {s.mode_ar && <span className="cj-tag cj-mode">{s.mode_ar}</span>}
      </header>
      {plan && row && <OffSwitch s={s} row={row} onOff={plan.onOff} />}
      <p className="cj-window"><b>{off ? 'موقوفة لهذه الدفعة' : s.avail_ar}</b><small>{s.note_ar}</small></p>
      <dl className="cj-facts">
        <div><dt>الأنشطة</dt><dd>{s.acts.text}{s.max_ar && <small> · {s.max_ar}</small>}</dd></div>
        <div><dt>الاستخدام</dt><dd className="cj-usage">{off ? 'لا حجز ما دامت موقوفة' : s.usage ? s.usage.text : 'يظهر بعد قراءة الخريطة'}</dd></div>
      </dl>
    </article>
  );
}

// نافذة الأثر قبل الحفظ (البند 4.2 هـ): ما تغيّر سطرًا سطرًا، ومن يتأثر، والمعالم، والبريد، من الخادم وحده
// «أبلغ المشاركين» (القرار 13) مطفأ افتراضيًا، ومن تجاوز مرحلة تعود (القرار 12) «اعفِ من تجاوزها» افتراضيًا
function ImpactDialog({ r, busy, canSave, lock, onSave, onClose, opts, setOpts }) {
  useEscape(onClose);
  const lines = r?.impact ? impactAr(r.impact, { notify: opts.notify }) : [];
  const changes = lines.filter((x) => x.kind === 'change');
  const reen = lines.filter((x) => x.kind === 'reenable');
  const rest = lines.filter((x) => x.kind !== 'change' && x.kind !== 'reenable');
  const members = r?.impact?.notify?.members || 0;
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form cj-impact" role="dialog" aria-modal="true" aria-labelledby="cj-impact-h">
        <h3 id="cj-impact-h">راجع أثر التعديل قبل الحفظ</h3>
        {!r ? <Spinner /> : !r.success ? <p className="la-err" role="alert">{r.message}</p> : (
          <>
            <section aria-labelledby="cj-imp-c"><h4 id="cj-imp-c">ما يتغير</h4>
              {changes.length ? <ul className="cj-imp-list">{changes.map((x) => <li key={x.key} className={`change${x.off ? ` off-${x.off}` : ''}`}>{x.text}</li>)}</ul>
                : <p className="la-muted">لا تغيير في المدد أو التواريخ.</p>}
            </section>
            <section aria-labelledby="cj-imp-w"><h4 id="cj-imp-w">الأثر</h4>
              <ul className="cj-imp-list">{rest.map((x) => <li key={x.key} className={x.kind}>{x.text}</li>)}</ul>
            </section>
            {reen.length > 0 && (
              <fieldset className="cj-imp-choice">
                <legend>من تجاوز مرحلة تعود</legend>
                <ul className="cj-imp-list">{reen.map((x) => <li key={x.key} className="warn">{x.text}</li>)}</ul>
                <label><input type="radio" name="cj-reenable" checked={opts.reenable !== 'apply'} disabled={!canSave} onChange={() => setOpts((o) => ({ ...o, reenable: 'exempt' }))} />
                  <span><b>اعفِ من تجاوزها</b><small>تُعد لهم مكتملة بإعفاء يظهر في ملفهم، فلا يُقفل عليهم ما بعدها. الموصى به</small></span></label>
                <label><input type="radio" name="cj-reenable" checked={opts.reenable === 'apply'} disabled={!canSave} onChange={() => setOpts((o) => ({ ...o, reenable: 'apply' }))} />
                  <span><b>أعدها عليهم</b><small>تصير نشطة عليهم، وقد تقفل ما بعدها حتى يكملوها</small></span></label>
              </fieldset>
            )}
            {members > 0 && canSave && (
              <label className="cj-imp-notify">
                <input type="checkbox" checked={!!opts.notify} onChange={(e) => setOpts((o) => ({ ...o, notify: e.target.checked }))} />
                <span><b>أبلغ المشاركين المتأثرين بالمواعيد الجديدة</b>
                  <small>ملاحظة «تغيّرت مواعيد رحلتك» في ملف {members === 1 ? 'المشارك' : `${members} مشاركين`} في الرحلة، وتصلهم ببريد الملاحظات المعتاد. مطفأ ما لم تختره</small></span>
              </label>
            )}
            {r.impact.issues?.length > 0 && (
              <section aria-labelledby="cj-imp-i"><h4 id="cj-imp-i">تنبيهات الخطة</h4>
                <ul className="cj-imp-list">{r.impact.issues.map((x) => <li key={`${x.code}-${x.stage}`} className="warn">{x.msg}</li>)}</ul>
              </section>
            )}
            {lock && <p className="cj-alert" role="note"><span aria-hidden="true">!</span>{lock.msg}</p>}
            {!canSave && !lock && <p className="la-muted">صلاحيتك للعرض فقط: ترى الأثر ولا تحفظه.</p>}
          </>
        )}
        <div className="la-row">
          {canSave && r?.success && <button type="button" className="btn-sm primary" disabled={busy || !r.changed} onClick={onSave}>{busy ? 'جارٍ الحفظ…' : 'احفظ الخطة'}</button>}
          <button type="button" className="btn-sm ghost" onClick={onClose}>عُد للتعديل</button>
        </div>
      </div>
    </div>
  );
}

/** @param {{ c: any, canWrite?: boolean, on?: Record<string, any>, onSaved?: () => void }} props
 *  on: أزرار ملف الدفعة نفسها (edit وjourney)، فلا مدخل ثانٍ لأي إعداد. onSaved: بعد حفظ الخطة أو التراجع (تحديث قائمة الدفعات) */
export default function CohortJourney({ c, canWrite = false, on = {}, onSaved = () => {} }) {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [retry, setRetry] = useState(0);
  const auto = !c.is_default && (Number(c.members) || 0) <= JOURNEY_AUTO_MAX;
  const [want, setWant] = useState(auto);
  const [map, setMap] = useState(null);
  const [mapRetry, setMapRetry] = useState(0);
  // خطة الدفعة كما قرأها التبويب أو حفظها، والمسودة في وضع التحرير ({ days, follow })، ونافذة الأثر، وسطر «حُفظ. تراجع»
  const [cp, setCp] = useState(null);
  const [edit, setEdit] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [history, setHistory] = useState(null);
  const [saveOpts, setSaveOpts] = useState({ notify: false, reenable: 'exempt' });
  // أيام الورشة (W3): جلسات متطلبات الحضور لهذه الدفعة من admin.cohort-workshops، ونموذج اليوم وشاشتا الرمز والحضور
  const [ws, setWs] = useState(null);
  const [wsRetry, setWsRetry] = useState(0);
  const [dayForm, setDayForm] = useState(null);
  const [qr, setQr] = useState(null);
  const [att, setAtt] = useState(null);

  useEffect(() => {
    let live = true;
    setD(null); setEdit(null); setSavedNote(false); setHistory(null);
    Promise.all([L('admin.cohort-definition', { cohort_id: c.id }), L('admin.milestones', { program_id: c.program_id })]).then(([def, ms]) => {
      if (!live) return;
      // فشل قراءة المعالم يُقال صراحة، فلا يُخلط بـ«برنامج بلا معالم»
      const msBad = !ms || ms.success === false;
      setCp(def?.cohort_plan || null);
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

  // متطلبات الحضور بجلسات في تعريف الدفعة: تُقرأ أيامها مرة، ثم بعد كل حفظ يوم دون إعادة رسم التبويب
  const wsReqs = useMemo(() => (d?.def?.requirements || []).filter((r) => r.kind === 'workshop' && r.id && r.active !== false && !r.hidden).map((r) => r.id).join(','), [d]);
  useEffect(() => { setWs(null); }, [c.id]);
  useEffect(() => {
    let live = true;
    if (!wsReqs) return undefined;
    L('admin.cohort-workshops', { cohort_id: c.id, requirement_ids: wsReqs.split(',') }).then((r) => { if (live) setWs(r || { success: false }); });
    return () => { live = false; };
  }, [c.id, wsReqs, wsRetry]);
  // الخط يرسم الأيام من القراءة نفسها، فيظهر اليوم الجديد نقطة على شريط مرحلته فور حفظه
  const wsList = ws?.success && Array.isArray(ws.sessions) ? ws.sessions : null;
  const defShown = useMemo(() => (d?.def && wsList ? { ...d.def, sessions: wsList } : d?.def), [d, wsList]);
  const cohort = useMemo(() => planCohort(c, cp), [c, cp]);
  const draft = useMemo(() => (d?.def ? planDraft({ def: d.def, cohort, edit }) : null), [d, cohort, edit]);
  // المعاينة الحية: الخط والبطاقات من المسودة نفسها، فيُرى أثر كل نقرة قبل الحفظ
  const shown = draft ? draft.cohort : cohort;
  const jm = map?.success ? map.journey_map : null;
  const model = useMemo(() => (defShown ? cohortTimeline(defShown, shown, new Date()) : null), [defShown, shown]);
  const lanes = useMemo(() => (model ? journeyLanes(model, { def: d.def, cohort: shown, milestones: d.milestones, map: jm }) : null), [model, d, shown, jm]);
  const head = model ? journeyHeader(model, shown) : null;
  const outside = useMemo(() => outsideSessions(model), [model]);
  const kpis = model ? journeyKpis(model, lanes, jm, { msError: !!d?.msError }) : [];
  const mapFailed = want && map && !map.success;
  const lock = planLock(cohort);
  const ends = d?.def ? endsOffer({ def: d.def, cohort: shown, canWrite, lock }) : null;
  const stageOf = (k) => (d?.def?.stages || []).find((x) => x.key === k);
  // العدادات والسحب يدمجان بالدالة نفسها (mergeEdit): الإيقاف والنهاية ما يطابق المحفوظ منهما لا يبقى تعديلًا، وتغيير
  // المرجع يعيد إزاحته إلى قاعدته (planEdit)، وnull يعيد قاعدة البرنامج
  const put = (patch) => setEdit((e) => mergeEdit(e, patch, cohort.schedule || {}));
  const onDays = (k, v) => put({ days: { [k]: v } });
  const onOff = (k, v) => put({ off: { [k]: v } });
  const onWith = (k, v) => put({ with: { [k]: v } });
  const onOffset = (k, v) => put({ offset: { [k]: v } });
  const onUntil = (k, v) => put({ until: { [k]: v } });
  const planCtl = edit && draft ? { rows: draft.rows, onDays, onOff, onWith, onOffset, onUntil, stageOf } : null;

  // ── السحب في الخط (D1): لمن يكتب في وضع التحرير وحده، والخطة غير مقفلة. الحركة تُحسب من مقياس الخط عند الالتقاط ──
  const [drag, setDrag] = useState(null);
  const [dragNote, setDragNote] = useState(null);
  const [dragLive, setDragLive] = useState('');
  const canDrag = !!(edit && draft && canWrite && !lock && model && !model.empty && model.scale);
  useEffect(() => { if (!canDrag) setDrag(null); }, [canDrag]);
  // خارج وضع التحرير لا يبقى سبب رفض ولا سطر قديم: الدخول التالي يبدأ بالتلميح الافتراضي (وهو وصف كل مقبض)
  useEffect(() => { if (!edit) { setDragNote(null); setDragLive(''); } }, [edit]);
  const titleAt = (k) => [...(model?.stages || []), ...(model?.tracks || [])].find((x) => x.key === k)?.title || stageOf(k)?.title_ar || k;
  // الحركة إلى تعديل، ثم فحصه بالمسودة نفسها، ثم الشبح بتواريخه: ما يُرفض يُرسم أحمر بسببه
  const evalDrag = (g) => {
    const res = dropToEdit({ scale: model.scale, draft, key: g.key, kind: g.kind, shift: g.shift || 0, pct: g.kbd ? null : g.pct ?? 0, over: g.over || null,
      snap: g.kbd ? 'exact' : 'near', stage: stageOf(g.key), title: titleAt });
    const check = res.patch ? applyDrop({ def: d.def, cohort, edit, patch: res.patch }) : null;
    const reject = res.reject || check?.reject || null;
    const sp = model.scale.spans[g.key];
    const [a, b] = res.ghost || sp;
    const at = scalePos(model.scale.slots, a);
    const label = reject ? reject.msg : dragGhostAr((check?.draft || draft).rows[g.key], titleAt(g.key));
    return { ...g, res, check, reject, ghost: { at, width: Math.max(1, scalePos(model.scale.slots, Math.max(a, b)) - at), label, bad: !!reject } };
  };
  // committed: لوحة المفاتيح كتبت جزءًا من الحركة في المسودة قبل أن تنتقل من البداية إلى المدة أو العكس، وorig ما كانت عليه عند الالتقاط
  const finishDrag = (g) => {
    setDrag(null);
    if (!g) return;
    if (g.reject) {
      if (g.committed) setEdit(g.orig);
      setDragNote({ ...g.reject, key: g.key });
      // السبب في التنبيه (role=alert) وحده، فلا يُقرأ مرتين
      setDragLive('لم يتغير شيء.');
      return;
    }
    setDragNote(null);
    if (g.check?.edit) setEdit(g.check.edit);
    if (g.check?.edit || g.committed) setDragLive(`${g.ghost.label}. التعديل في المسودة، واحفظه بـ«راجع واحفظ».`);
    else setDragLive('لم يتغير شيء.');
  };
  const cancelDrag = () => {
    const g = dragRef.current;
    setDrag(null);
    if (g?.committed) { setEdit(g.orig); setDragLive('أُلغي السحب، وعادت المسودة كما كانت قبل الالتقاط.'); } else setDragLive('أُلغي السحب، ولم يتغير شيء.');
  };
  // لوحة المفاتيح: الحركة بما تحرك فعلًا بعد الحدود (applied)، فالسهم المعاكس يعيدها من أول ضغطة
  const kbdEval = (g) => { const n = evalDrag(g); const a = n.res?.applied; return a == null ? n : { ...n, shift: a }; };
  const bars = canDrag ? Object.fromEntries([...model.stages, ...(model.tracks || [])].filter((x) => draft.rows[x.key] && !draft.rows[x.key].off)
    .map((x) => [x.key, { edge_ar: draft.rows[x.key].track ? 'اسحب الطرف لتغيير نهايته (يلتصق بنهاية الطور والرحلة)' : 'اسحب الطرف لتغيير المدة' }])) : null;
  const dragRef = useRef(null);
  dragRef.current = drag;
  // بعد أن تُكتب الحركة السابقة في المسودة تتجدد المسودة والمقياس، فتُحسب الحركة الجديدة عليهما
  useEffect(() => {
    const g = dragRef.current;
    if (!g?.kbd || !g.rebase || !canDrag) return;
    const n = kbdEval({ ...g, rebase: false });
    setDrag(n);
    setDragLive(`الحركة السابقة في المسودة. ${n.ghost.label}`);
  }, [draft]); // eslint-disable-line
  const editable = canDrag ? {
    bars, drag, hintId: 'cj-drag-hint', live: dragLive,
    onStart: ({ key, kind }) => { setDragNote(null); setDrag(evalDrag({ key, kind, pct: 0 })); },
    onMove: ({ pct, over }) => { const g = dragRef.current; if (g && !g.kbd) setDrag(evalDrag({ ...g, pct, over })); },
    onEnd: ({ pct, over }) => { const g = dragRef.current; if (g && !g.kbd) finishDrag(evalDrag({ ...g, pct, over })); },
    onCancel: cancelDrag,
    // لوحة المفاتيح (WCAG 2.5.7): نقرة المقبض تلتقط وتُفلت (Enter ومسافة، ونقرة قارئ الشاشة في وضع التصفح، وهي click لا keydown)،
    // والأسهم يومًا وShift أسبوعًا، وAlt للمدة، وEsc يلغي. RTL: اليسار لاحق
    onToggle: (key) => {
      const g = dragRef.current;
      if (g?.kbd && g.key === key) { finishDrag(g); return; }
      setDragNote(null);
      setDrag(evalDrag({ key, kind: 'move', shift: 0, kbd: true, orig: edit }));
      setDragLive(`التقطت «${titleAt(key)}». الأسهم تحرك بدايتها يومًا وShift أسبوعًا، وAlt مع الأسهم يغير المدة، والحركتان تجتمعان، وEnter يُفلت، وEsc يلغي.`);
    },
    // التركيز يغادر المقبض الملتقط (Tab أو نقرة في غيره أو «راجع واحفظ»): يُلغى الالتقاط، فلا يبقى شبح لا يطابق المسودة
    onBlur: (key) => { const g = dragRef.current; if (g?.kbd && g.key === key) cancelDrag(); },
    onKey: (key, e) => {
      const g = dragRef.current;
      const picked = g?.kbd && g.key === key;
      if (!picked) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelDrag(); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const later = rtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
      const step = (later ? 1 : -1) * (e.shiftKey ? 7 : 1);
      const kind = e.altKey ? 'end' : 'move';
      if (g.kind !== kind && g.shift && g.check?.edit) {
        // من البداية إلى المدة أو العكس: الحركة السابقة تُكتب في المسودة أولًا، والجديدة تُحسب عليها بعد أن تتجدد (أثر rebase)
        setEdit(g.check.edit);
        setDrag({ ...g, kind, shift: step, rebase: true, committed: true, check: null, res: null, reject: null });
        return;
      }
      const dropped = g.kind !== kind && g.shift && g.reject ? g.reject.msg : '';
      const n = kbdEval({ ...g, kind, shift: (g.kind === kind ? g.shift || 0 : 0) + step });
      setDrag(n);
      setDragLive(dropped ? `لم تُحسب الحركة السابقة: ${String(dropped).replace(/[.،\s]+$/, '')}. ${n.ghost.label}` : n.ghost.label);
    },
  } : null;
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
  // النقر على نشاط: الورشة إلى أيامها في بطاقة مرحلتها (W3، «من بطاقة المرحلة لا من تبويب منفصل»)، وغيرها إلى رحلة البرنامج
  const openAct = (a) => {
    if (a.kind !== 'workshop') { on.journey?.(); return; }
    toCard(a.stage);
    const box = document.getElementById(`cj-days-${a.stage}`);
    (box?.querySelector('.cj-day-add') || box)?.focus?.({ preventScroll: true });
  };
  const actLabel = (a) => (a.kind !== 'workshop' ? 'افتحه في رحلة البرنامج' : a.undated ? 'أضف موعده' : 'افتح مواعيده');

  // ── أيام الورشة: النموذج والتحقق من «الحضور والجلسات» نفسه (sessionFields)، والحفظ بـadmin.workshop-save وحده ──
  const capacity = !!ws?.capacity_ready;
  const wsError = ws && !ws.success ? `${ws.message || 'تعذّرت قراءة الأيام'}، فلا تظهر الأعداد والسعة` : '';
  const daysOf = (st) => (d?.def ? workshopDays({ def: d.def, stage: st, sessions: wsList, model, cohortId: c.id }) : null);
  const savedDay = (msg) => (r) => { if (r?.success) { toast(r.capacity_skipped ? `${msg}، والسعة لم تُحفظ لأن قاعدة البيانات لم تُحدَّث بعد` : msg); setWsRetry((n) => n + 1); } return r; };
  const dayRow = (r) => ({ title_ar: r.raw.title_ar, mode: r.raw.mode || 'in_person', location_ar: r.raw.location_ar || null, join_url: r.raw.join_url || null, starts_at: r.raw.starts_at || null, ends_at: r.raw.ends_at || null });
  const dayAct = {
    canWrite, error: wsError, retry: () => setWsRetry((n) => n + 1),
    add: (days, st) => {
      // بند حضور واحد في المرحلة يكفي، وأكثر من واحد يُسأل «لأي نشاط؟» (ب5.4)
      const pick = days.reqs.length > 1 ? [{ name: 'requirement_id', label: 'لأي نشاط؟', type: 'select', options: Object.fromEntries(days.reqs.map((r) => [r.id, r.title])) }] : [];
      setDayForm({
        title: `يوم أو ورشة في «${st.title}»`, fields: [...pick, ...sessionFields([], null, { capacity })],
        values: { active: true, mode: 'in_person', requirement_id: days.reqs[0].id, title_ar: `اليوم ${days.rows.length + 1}` },
        onSave: (v) => L('admin.workshop-save', { row: { ...v, requirement_id: v.requirement_id || days.reqs[0].id, cohort_id: c.id } }).then(savedDay('أُضيف اليوم ويظهر للمشاركين في رحلتهم')),
      });
    },
    // الجلسة العامة يسري تحريرها وحذفها على كل دفعات البرنامج، فيُقال ذلك في العنوان وتحت أول حقل كما يقوله الإلغاء
    edit: (r) => setDayForm({
      title: r.general ? `تحرير «${r.title}» (جلسة عامة لكل الدفعات)` : `تحرير «${r.title}»`,
      fields: r.general ? sessionFields([], null, { capacity }).map((f, i) => (i ? f : { ...f, help: GENERAL_EDIT_AR })) : sessionFields([], null, { capacity }),
      values: r.raw,
      onSave: (v) => L('admin.workshop-save', { row: { ...v, id: r.id } }).then(savedDay('حُفظ اليوم')),
      onDelete: r.attended ? undefined : () => L('admin.workshop-delete', { id: r.id }).then(savedDay('حُذف اليوم')),
    }),
    cancel: async (r) => {
      const all = r.general ? ' وهو جلسة عامة، فيُلغى لكل دفعات البرنامج.' : '';
      if (!(await confirm(`يُلغى «${r.title}»: يختفي من رحلة المشاركين ولا تُرسل له دعوة ولا تذكير، وما سُجّل من حضور محفوظ.${all} يُعاد بنقرة.`, { danger: true, ok: 'ألغِ اليوم' }))) return;
      const res = await L('admin.workshop-save', { row: { ...dayRow(r), active: false, id: r.id } });
      if (!res.success) toast(res.message); else savedDay('أُلغي اليوم')(res);
    },
    restore: async (r) => {
      const res = await L('admin.workshop-save', { row: { ...dayRow(r), active: true, id: r.id } });
      if (!res.success) toast(res.message); else savedDay('أُعيد اليوم ويظهر للمشاركين')(res);
    },
    invite: async (r) => { if (await inviteSession(r.raw, { confirm, toast })) setWsRetry((n) => n + 1); },
    qr: (r) => setQr(r.id),
    attendance: (r) => setAtt(r.id),
  };

  // راجع واحفظ: الأثر من الخادم وحده (planImpact على رحلة كل عضو)، ثم الحفظ بما بُنيت عليه المسودة
  const openReview = async () => {
    setReview({ r: null });
    setSaveOpts({ notify: false, reenable: 'exempt' });
    const r = await L('admin.cohort-plan', planBody(cohort, edit, 'preview'));
    setReview({ r });
  };
  const applySaved = (r, msg) => {
    setCp((x) => ({ ...(x || {}), schedule: r.cohort.schedule, updated_at: r.cohort.updated_at, ...(r.cohort.ends_on !== undefined ? { ends_on: r.cohort.ends_on } : {}) }));
    setEdit(null); setReview(null); setHistory(null);
    setMapRetry((n) => n + 1);
    toast(msg);
    onSaved();
  };
  const save = async () => {
    setBusy(true);
    const r = await L('admin.cohort-plan', planBody(cohort, edit, 'save', saveOpts));
    setBusy(false);
    if (!r.success) { setReview((x) => ({ ...x, r: { ...(x?.r || {}), success: false, message: r.message } })); return; }
    if (r.unchanged) { setEdit(null); setReview(null); toast('لا تغيير في الخطة'); return; }
    setSavedNote(true);
    const extra = [r.exempted ? `وأُعفي ${r.exempted} من مرحلة تجاوزوها` : '', r.notified ? `وأُبلغ ${r.notified} بالمواعيد الجديدة` : saveOpts.notify && r.notified === null ? 'وتعذّر إبلاغ المشاركين، فأبلغهم من ملفاتهم' : ''].filter(Boolean).join('، ');
    applySaved(r, `حُفظت خطة الدفعة. التواريخ والمعالم تتبعها الآن${extra ? `، ${extra}` : ''}`);
  };
  const undo = async () => {
    setBusy(true);
    const r = await L('admin.cohort-plan', { cohort_id: c.id, op: 'undo', ...(cohort.updated_at ? { base_updated_at: cohort.updated_at } : {}) });
    setBusy(false);
    if (!r.success) { toast(r.message); return; }
    setSavedNote(false);
    applySaved(r, 'تراجعت الخطة إلى ما كانت عليه قبل آخر حفظ');
  };
  const loadHistory = async () => {
    setHistory({ loading: true });
    const r = await L('admin.cohort-plan', { cohort_id: c.id, op: 'history' });
    setHistory(r.success ? { rows: historyRows(r.history), can_undo: !!r.can_undo } : { error: r.message || 'تعذّرت قراءة سجل الخطة' });
  };
  const suggest = () => {
    const sug = suggestDays((d.def.stages || []).filter((x) => x.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), cohort.starts_on, cohort.ends_on, draft?.schedule || cohort.schedule);
    setEdit((e) => ({ ...(e || {}), days: { ...(e?.days || {}), ...sug } }));
  };

  if (!d) return <div className="cj"><Spinner /></div>;
  if (d.error) return <div className="cj"><p className="la-err" role="alert">{d.error} <button type="button" className="la-link" onClick={() => setRetry((n) => n + 1)}>أعد المحاولة</button></p></div>;

  const version = d.def.version;
  const editing = !!edit;
  return (
    <div className={`cj${editing ? ' editing' : ''}`}>
      <header className="cj-hero" aria-labelledby="cj-title">
        <div className="cj-hero-txt">
          <p className="cj-eyebrow">رحلة الدفعة · {version ? `النسخة ${version.number} المثبتة (${version.label})` : 'البرنامج كما هو الآن'}{editing ? ' · معاينة قبل الحفظ' : ''}</p>
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
      {head.gap_ar && <p className="cj-alert" role="note" data-testid="chain-gap"><span aria-hidden="true">!</span>{head.gap_ar}</p>}
      {/* «اجعل نهاية الدفعة …» (4.2 أ): يضع نهاية السلسلة في المسودة وحدها، والحفظ بنافذة الأثر وحارس البريد كبقية الخطة */}
      {ends && (
        <p className="cj-ends" data-testid="cj-ends">
          <button type="button" className="btn-sm primary" onClick={() => put({ ends_on: ends.end })}>{ends.label}</button>
          <small>{ends.code === 'over_end' ? 'أو قصّر مرحلة.' : 'أو اقترح مددًا تملأ مدة الدفعة.'} لا يُحفظ شيء قبل «راجع واحفظ»، وتسمي نافذة الأثر المعالم التي يتغير موعدها.</small>
        </p>
      )}
      {draft.ends && (
        <p className="cj-ends on" role="note" data-testid="cj-ends-draft">
          <span>في المسودة: نهاية الدفعة <b>{dateOnly(draft.ends.after)}</b> بدل {draft.ends.before ? dateOnly(draft.ends.before) : 'بلا تاريخ'}.</span>
          <button type="button" className="la-link" onClick={() => put({ ends_on: draft.ends.before })}>أبقِ النهاية كما كانت</button>
        </p>
      )}
      {/* أيام ورش خارج نافذة مرحلتها (4.2 د): من علامة الخط نفسه، تنبيه لا منع، والنقر يفتح بطاقة المرحلة */}
      {outside.length > 0 && (
        <div className="cj-alert" role="note" data-testid="cj-outside"><span aria-hidden="true">!</span>
          <span>{outside.length === 1 ? 'يوم ورشة خارج نافذة مرحلته' : `${countAr(outside.length, 'يوم', 'يومان', 'أيام', 'يومًا')} ورش خارج نافذة مراحلها`}. الحضور يُحسب، وراجع الموعد أو مدة المرحلة:
            <ul className="cj-outside">{outside.map((x) => <li key={x.session}><button type="button" className="la-link" onClick={() => toCard(x.stage)}>{x.text}</button></li>)}</ul></span>
        </div>
      )}
      {d.msError && (
        <p className="cj-alert" role="alert"><span aria-hidden="true">!</span>
          <span>{d.msError}، فلا تظهر المعالم في البطاقات. <button type="button" className="la-link" onClick={() => setRetry((n) => n + 1)}>أعد المحاولة</button></span></p>
      )}
      {mapFailed && (
        <p className="cj-alert" role="note"><span aria-hidden="true">!</span>
          <span>تعذّرت قراءة أعداد الناس، فلا تظهر في البطاقات. <button type="button" className="la-link" onClick={() => setMapRetry((n) => n + 1)}>أعد المحاولة</button></span></p>
      )}

      {/* شريط الخطة: الدخول إلى التحرير، أو سبب القفل، و«حُفظ. تراجع» صالح حتى الحفظ التالي، والسجل */}
      <section className="cj-planbar" aria-label="خطة الدفعة">
        <div className="cj-planbar-txt">
          <b>خطة الدفعة</b>
          <span>{lock ? lock.msg
            : draft.changed || draft.off ? [
              draft.changed ? `${countAr(draft.changed, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')} بمدة خاصة بهذه الدفعة` : '',
              draft.off ? `${countAr(draft.off, 'مرحلة واحدة موقوفة', 'مرحلتان موقوفتان', 'مراحل موقوفة', 'مرحلة موقوفة')} لهذه الدفعة` : '',
            ].filter(Boolean).join('، و') + '، والباقي من البرنامج.'
              : 'كل المدد من البرنامج. عدّل مدة أي مرحلة لهذه الدفعة وحدها أو أوقفها أو اجعلها تسير مع غيرها، ويُزاح ما بعدها.'}</span>
        </div>
        <div className="la-row">
          {!editing && !lock && <button type="button" className="btn-sm primary" onClick={() => setEdit({ days: {}, off: {}, with: {}, offset: {}, until: {} })}>عدّل المدد</button>}
          {savedNote && canWrite && !editing && <span className="cj-saved" role="status">حُفظ. <button type="button" className="la-link" disabled={busy} onClick={undo}>تراجع</button></span>}
          <button type="button" className="la-link" aria-expanded={!!history} onClick={() => (history ? setHistory(null) : loadHistory())}>سجل الخطة</button>
        </div>
        {draft.pinned > 0 && !lock && (
          <p className="cj-pinned" role="note">
            {countAr(draft.pinned, 'مرحلة واحدة مثبتة', 'مرحلتان مثبتتان', 'مراحل مثبتة', 'مرحلة مثبتة')} بتاريخ من الجدول السابق، فلا تتبع المدد ولا تتحرك بتغيير ما قبلها.
            {' '}<button type="button" className="btn-sm ghost" disabled={!!edit?.follow} onClick={() => setEdit((e) => ({ ...(e || { days: {} }), follow: true }))}>حرّر التواريخ لتتبع المدد</button>
            {edit?.follow && draft.anchored.length > 0 && <small className="cj-anchored"> بقيت بداية {draft.anchored.map((k) => `«${stageOf(k)?.title_ar || k}»`).join(' و')} مثبتة، لأن بينها وبين ما قبلها فجوة أو تداخلًا، فلا يتحرك تاريخ بالتحرير.</small>}
          </p>
        )}
        {history && (
          <div className="cj-history">
            {history.loading ? <Spinner /> : history.error ? <p className="la-err" role="alert">{history.error}</p>
              : !history.rows.length ? <p className="la-muted">لم تُحفظ خطة لهذه الدفعة بعد: كل المدد من البرنامج أو الجدول السابق.</p>
                : <ol>{history.rows.map((h) => <li key={h.id} className={h.undo ? 'undo' : ''}><b>{h.text}</b><small>{dateTime(h.at)}{h.by ? ` · ${h.by}` : ''}</small></li>)}</ol>}
            {history.can_undo && canWrite && !lock && <button type="button" className="btn-sm ghost" disabled={busy} onClick={undo}>تراجع عن آخر حفظ</button>}
          </div>
        )}
      </section>

      {editing && (
        <p className="cj-ro" role="note">
          تعديل المدد والإيقاف والتوازي لهذه الدفعة وحدها، والبرنامج لا يتغير. الخط والبطاقات تعرض التواريخ الجديدة قبل الحفظ، ونافذة الأثر تسمي من يتأثر قبل أن يُحفظ شيء.
          {cohort.starts_on && cohort.ends_on && <> <button type="button" className="la-link" onClick={suggest}>اقترح مددًا تملأ مدة الدفعة</button></>}
        </p>
      )}

      {!model.empty && <JourneyTimeline key={c.id} id="jt-cohort" model={model} onOpen={openAct} openLabel={actLabel} onStage={toCard} omitCards={TAB_TIMELINE_OMIT} editable={editable}
        usage={lanes.services ? Object.fromEntries(lanes.services.filter((x) => x.usage).map((x) => [x.key, x.usage.text])) : null} />}
      {dragNote && (
        <p className="cj-alert cj-drag-note" role="alert" data-testid="cj-drag-note"><span aria-hidden="true">!</span>
          <span>{String(dragNote.msg).replace(/[.،\s]+$/, '')}. لم تتغير المسودة.{dragNote.program && on.journey && <> <button type="button" className="la-link" onClick={() => on.journey()}>غيّرها في البرنامج</button></>}
            {' '}<button type="button" className="la-link" onClick={() => {
              // التركيز إلى الشريط المرفوض قبل أن يختفي الزر، وإلا إلى الخط نفسه، فلا يسقط إلى أول الصفحة
              const k = dragNote.key;
              const el = (k && document.querySelector(`[data-grip="${CSS.escape(k)}"]`)) || document.querySelector('.jt-scroll');
              el?.focus?.();
              setDragNote(null);
            }}>حسنًا</button></span></p>
      )}

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
                    <div className="cj-lanes">{g.stages.map((s) => <StageCard key={s.key} s={s} rows={draft.rows} plan={planCtl} days={daysOf(s)} act={dayAct} />)}</div>
                  </div>
                ) : <div key={g.key} className={`cj-group${g.off ? ' off' : ''}`}>{g.stages.map((s) => <StageCard key={s.key} s={s} rows={draft.rows} plan={planCtl} days={daysOf(s)} act={dayAct} />)}</div>))}
              </div>
            </section>
          ))}
          {lanes.tracks?.length > 0 && (
            <section className="cj-phase cj-tracks" aria-labelledby="cj-tracks-h" data-testid="cj-tracks">
              <header className="cj-phase-head"><h4 id="cj-tracks-h">مسارات مستمرة</h4><small>تسير بجانب المراحل، فلا تؤخر ما بعدها ولا تُعد في مراحل الرحلة</small></header>
              <div className="cj-groups">
                {lanes.tracks.map((s) => <div key={s.key} className="cj-group track"><StageCard s={s} rows={draft.rows} plan={planCtl} days={daysOf(s)} act={dayAct} /></div>)}
              </div>
            </section>
          )}
          {lanes.services?.length > 0 && (
            <section className="cj-phase cj-services" aria-labelledby="cj-services-h" data-testid="cj-services">
              <header className="cj-phase-head"><h4 id="cj-services-h">الخدمات</h4><small>يطلبها من يريد حتى نهاية الرحلة، فلا تأخذ منها أيامًا ولا تُعد في مراحلها</small></header>
              <div className="cj-groups">
                {lanes.services.map((s) => <div key={s.key} className="cj-group svc"><ServiceCard s={s} rows={draft.rows} plan={planCtl} /></div>)}
              </div>
            </section>
          )}
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

      {/* شريط الحفظ: يظهر عند وجود تعديل، ويبقى في أسفل الشاشة فلا يضيع بين البطاقات */}
      {editing && (
        <div className="cj-savebar" role="region" aria-label="حفظ الخطة">
          {/* منطقة الإعلان الوحيدة في وضع التحرير: سطر واحد لكل تغيير بدل إعلان لكل بطاقة تزاح تواريخها */}
          <span aria-live="polite">{draft.errors.length ? draft.errors[0].msg : draft.edits ? `${editsAr(draft.edits)} غير ${draft.edits === 1 ? 'محفوظ' : draft.edits === 2 ? 'محفوظين' : 'محفوظة'}${head.kind === 'dated' ? `، وتنتهي الرحلة ${head.end_ar}` : ''}${draft.ends ? `، ونهاية الدفعة ${dateOnly(draft.ends.after)}` : ''}` : 'لا تعديل بعد'}</span>
          <div className="la-row">
            <button type="button" className="btn-sm ghost" onClick={() => setEdit(null)}>ألغِ</button>
            <button type="button" className="btn-sm primary" disabled={!draft.edits || draft.errors.length > 0} onClick={openReview}>راجع واحفظ</button>
          </div>
        </div>
      )}
      {dayForm && <Form {...dayForm} onClose={() => setDayForm(null)} />}
      {qr && <QrScreen id={qr} onClose={() => { setQr(null); setWsRetry((n) => n + 1); }} />}
      {att && <Attendance id={att} cohortId={c.id} canWrite={canWrite} onClose={() => { setAtt(null); setWsRetry((n) => n + 1); }} />}
      {review && <ImpactDialog r={review.r} busy={busy} canSave={canWrite && !lock} lock={lock} onSave={save} onClose={() => setReview(null)} opts={saveOpts} setOpts={setSaveOpts} />}

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
