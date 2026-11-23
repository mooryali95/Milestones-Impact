// ════════════════════════════════════════════════════════════════
// خريطة الرحلة: مراحل برنامج الجهة كلها، وكم يقف عند كل مرحلة (قرار المالك 2026-11-11)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد: رحلة كل مشارك كما يراها هو (journeyFor)، مجمّعة على الخادم في journey_map. الأعداد المجمّعة لكل منسق،
// والأسماء عند المرحلة لمن له صلاحية «القائمة» وحده (people)، وإلا أسباب مجمّعة (reasons). لا درجات.
// الحاسوب: مسار أفقي من اليمين بأطواره الثلاثة. الجوال: خط زمني رأسي. وجدول بديل لقارئ الشاشة.
import React, { useMemo, useState } from 'react';

const PHASES = [
  { key: 'admission', title: 'القبول' },
  { key: 'qualification', title: 'التأهيل' },
  { key: 'impact', title: 'الأثر' },
];
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' }) : '');
const daysAr = (n) => (n === 1 ? 'يوم' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`);
const durationAr = (d) => (!d ? 'بلا مدة' : d % 7 === 0 && d >= 14 ? `${d / 7} أسابيع` : daysAr(d));
// «متأخر» في دفعة مؤرخة (لها بداية وليست المفتوحة) معناه تجاوز موعد نافذتها على جدول الدفعة (R0)، لا مدة المكوث فيها،
// فقد يتأخر من دخلها أمس إن انقضت نافذتها. وبلا تاريخ يبقى المعنى مدة المرحلة من دخول المشارك
export const lateWords = (map) => (map?.cohort?.starts_on && !map?.cohort?.is_default
  ? { one: 'تجاوزوا موعدها', all: 'تجاوزوا موعد مرحلتهم' } : { one: 'تجاوزوا مدتها', all: 'تجاوزوا مدة مرحلتهم' });
// التوازي والمسار المستمر (map.lanes من mapLanes: together مفتاح أول المجموعة، وtracks): سطر تحت المرحلة كما في الخط وتبويب «الرحلة»
// lanes: من الخادم بجانب الخريطة (mapLanes)، وخريطة بلا lanes (قبل هذا الإصدار) كما كانت
// المطابقة: المثنى «تسيران» لاثنتين وحدهما، والواحدة وجمع غير العاقل (ثلاث فأكثر) «تسير»
export function laneAr(s, stages, lanes) {
  const tg = lanes?.together || {};
  if ((lanes?.tracks || []).includes(s.key)) return 'مسار مستمر يسير بجانب الرحلة';
  const head = tg[s.key];
  if (!head) return '';
  const title = (k) => stages.find((x) => x.key === k)?.title || k;
  if (head !== s.key) return `تسير مع «${title(head)}»`;
  const rest = stages.filter((x) => tg[x.key] === s.key && x.key !== s.key).map((x) => `«${x.title}»`);
  return rest.length ? `${rest.join(' و')} ${rest.length === 2 ? 'تسيران' : 'تسير'} معها` : '';
}
const peopleAr = (n) => (n === 0 ? 'لا أحد' : n === 1 ? 'شخص واحد' : n === 2 ? 'شخصان' : n <= 10 ? `${n} أشخاص` : `${n} شخصًا`);

function StagePanel({ stage, total, onClose, late, onPeople }) {
  const ahead = Math.max(0, total - stage.done - stage.here);
  return (
    <div className="jm-panel" id={`jm-panel-${stage.key}`} role="region" aria-label={`تفاصيل مرحلة ${stage.title}`}>
      <div className="jm-panel-head">
        <div>
          <p className="eyebrow">{PHASES.find((p) => p.key === stage.phase)?.title}</p>
          <h3>{stage.title}</h3>
          <p className="small muted">
            المدة المخططة {durationAr(stage.duration_days)}
            {stage.window && <> · من {fmtDate(stage.window.from)} إلى {fmtDate(stage.window.to)}</>}
          </p>
        </div>
        <button type="button" className="link small" onClick={onClose}>إغلاق</button>
      </div>
      <dl className="jm-panel-stats">
        <div><dt>هنا الآن</dt><dd>{stage.here}</dd></div>
        <div><dt>تجاوزوها</dt><dd>{stage.done}</dd></div>
        <div><dt>لم يصلوها</dt><dd>{ahead}</dd></div>
        <div className={stage.late ? 'is-late' : ''}><dt>{late.one}</dt><dd>{stage.late}</dd></div>
      </dl>
      {onPeople && stage.here > 0 && (
        <p className="jm-follow"><button type="button" className="link small" onClick={() => onPeople(stage.key)}>اعرضهم في «المتابعة» ({stage.here})</button></p>
      )}
      {stage.people ? (
        stage.people.length ? (
          <table className="jm-people">
            <caption className="sr-only">من يقفون عند {stage.title}</caption>
            <thead><tr><th scope="col">المشارك</th><th scope="col">في المرحلة منذ</th><th scope="col">ما ينقصه</th></tr></thead>
            <tbody>
              {stage.people.map((p) => (
                <tr key={p.id} className={p.late ? 'is-late' : ''}>
                  <td>{p.name}</td>
                  <td>{daysAr(p.days)}{p.late && <span className="jm-tag">متأخر</span>}</td>
                  <td className="small">{p.needs || '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="small muted">لا أحد هنا الآن.</p>
      ) : (
        stage.reasons?.length ? (
          <ul className="jm-reasons">{stage.reasons.map((r) => <li key={r.text}><b>{r.count}</b> {r.text}</li>)}</ul>
        ) : <p className="small muted">{stage.here ? 'الأسماء تظهر لمن له صلاحية قائمة المشاركين.' : 'لا أحد هنا الآن.'}</p>
      )}
    </div>
  );
}

// embedded: داخل صفحة لها عنوانها (ملف الدفعة)، فلا يكرر الرأس اسم الدفعة ولا «خريطة الرحلة» عنوانًا ثانيًا
// onPeople(مفتاح المرحلة): ملف الدفعة في لوحة الإدارة وحده يمرره، فيظهر في تفاصيل المرحلة زر يفتح أهلها صفوفًا في «المتابعة»
export default function JourneyMap({ map, embedded = false, onPeople = null }) {
  const [open, setOpen] = useState(null);
  // الخدمة (T2، ب5.2) لمن يريد: ليست محطة على المسار، فتُعرض تحته بمؤشر استخدامها («استفاد 7 من 20») لا بحالة
  const all = map?.stages || [];
  const services = all.filter((s) => s.service);
  const stages = services.length ? all.filter((s) => !s.service) : all;
  const total = map?.totals?.total || 0;
  const byPhase = useMemo(() => PHASES.map((ph) => ({ ...ph, stages: stages.filter((s) => (s.phase || 'qualification') === ph.key) })).filter((ph) => ph.stages.length), [stages]);
  if (!stages.length) return null;
  const late = lateWords(map);
  // موقع الدفعة اليوم: كل ما يسير اليوم معًا (today_stages، R3b)، وما قبله قيمة واحدة
  const todayKeys = map.cohort?.today_stages || (map.cohort?.today_stage ? [map.cohort.today_stage] : []);
  const todays = todayKeys.map((k) => stages.find((s) => s.key === k)).filter(Boolean);
  // مرحلتان تسيران معًا: من فيهما يُعدّ مرة واحدة على أولاهما (here_by_group)، والأخرى «ضمنها»، فمجموع المحور صحيح
  const tg = map.lanes?.together || {};
  const groupHere = (s) => (tg[s.key] === s.key ? map.here_by_group?.[s.key] ?? s.here : s.here);
  const groupLate = (s) => (tg[s.key] === s.key ? map.late_by_group?.[s.key] ?? s.late : s.late);
  const inGroup = (s) => !!tg[s.key] && tg[s.key] !== s.key && map.here_by_group != null;
  const groupTitle = (s) => (tg[s.key] === s.key ? stages.filter((x) => tg[x.key] === s.key).map((x) => x.title) : [s.title]);
  const peakAt = stages.filter((s) => !s.off && !inGroup(s)).reduce((b, s) => (groupHere(s) > (b ? groupHere(b) : 0) ? s : b), null);
  const peak = peakAt && { title: groupTitle(peakAt).join(' و'), together: groupTitle(peakAt).length > 1, here: groupHere(peakAt), late: groupLate(peakAt) };
  // متأخرة عن جدولها: الجدول اليوم عند مراحل لا أحد فيها، والناس قبلها
  const behind = todays.length > 0 && todays.every((t) => groupHere(t) === 0 && !(inGroup(t) && map.here_by_group?.[tg[t.key]])) && (map.totals?.late || 0) > 0;
  const max = Math.max(1, ...stages.map((s) => groupHere(s)));
  const openStage = stages.find((s) => s.key === open);
  // من في مرحلتي قبول تسيران معًا يُطرح مرة واحدة (here_by_phase، R3b)، وإلا مجموع مراحل القبول كما كان
  const admHere = map.here_by_phase?.admission ?? stages.filter((s) => s.phase === 'admission').reduce((a, s) => a + s.here, 0);
  const passedAdmission = total - admHere - (map.totals.not_started || 0);

  return (
    <section className="jm" {...(embedded ? { 'aria-label': 'مراحل الدفعة ومن عند كل منها' } : { 'aria-labelledby': 'jm-h' })}>
      <header className="jm-head">
        <div>
          {!embedded && <p className="eyebrow">خريطة الرحلة</p>}
          {!embedded && <h2 id="jm-h">{map.cohort?.name || map.program?.name}</h2>}
          <p className="jm-sub">
            {map.program?.name}
            {map.cohort?.starts_on && <> · بدأت {fmtDate(map.cohort.starts_on)}</>}
            {todays.length > 0 && <> · الجدول اليوم عند {todays.map((t, i) => <React.Fragment key={t.key}>{i ? ' و' : ''}<b>{t.title}</b></React.Fragment>)}{todays.length > 1 ? ' معًا' : ''}</>}
            {behind && <> · <b className="jm-behind">الدفعة متأخرة عن جدولها</b></>}
          </p>
        </div>
        <dl className="jm-totals">
          <div><dt>في الرحلة</dt><dd>{total}</dd></div>
          <div><dt>تجاوزوا القبول</dt><dd>{Math.max(0, passedAdmission)}</dd></div>
          <div><dt>أنهوا الرحلة</dt><dd>{map.totals.finished || 0}</dd></div>
          <div className={map.totals.late ? 'is-late' : ''}><dt>{late.all}</dt><dd>{map.totals.late || 0}</dd></div>
        </dl>
      </header>

      {peak && peak.here > 0 && (
        <p className="jm-alert" role="note">
          <span className="jm-alert-mark" aria-hidden="true" />
          <span>أكبر تجمع الآن {peopleAr(peak.here)} عند «<b>{peak.title}</b>»{peak.together ? ' معًا' : ''}{peak.late ? <>، منهم <b>{peak.late}</b> {late.one}</> : null}</span>
        </p>
      )}

      <div className="jm-path" style={{ '--n': stages.length }}>
        {byPhase.map((ph) => {
          // من يقف في مرحلتين تسيران معًا يُعدّ في محوره مرة واحدة (here_by_phase)، وإلا مجموع المراحل كما كان
          const here = map.here_by_phase?.[ph.key] ?? ph.stages.reduce((a, s) => a + s.here, 0);
          return (
            <div key={ph.key} className={`jm-phase jm-${ph.key}`} style={{ '--k': ph.stages.length }}>
              <div className="jm-phase-head">
                <b>{ph.title}</b>
                <small>{ph.stages.length === 1 ? 'مرحلة' : `${ph.stages.length} مراحل`}{ph.stages.some((s) => s.off) ? ` (${ph.stages.filter((s) => s.off).length} موقوفة)` : ''} · {peopleAr(here)} الآن</small>
              </div>
              <ol>
                {ph.stages.map((s) => {
                  // موقوفة لهذه الدفعة (R2b): في مكانها باهتة بلا أعداد ولا تفاصيل، فلا يُظن أن أحدًا تجاوزها أو ينتظرها
                  if (s.off) {
                    return (
                      <li key={s.key} className="jm-stage off">
                        <div className="jm-node" role="note" aria-label={`${s.title}: موقوفة لهذه الدفعة`}>
                          <span className="jm-title">{s.title}</span>
                          <small className="jm-dur jm-off">موقوفة لهذه الدفعة</small>
                        </div>
                      </li>
                    );
                  }
                  const isToday = todayKeys.includes(s.key);
                  const sub = inGroup(s);
                  const here = groupHere(s), lateN = sub ? 0 : groupLate(s);
                  const ahead = Math.max(0, total - s.done - s.here);
                  const lane = laneAr(s, stages, map.lanes);
                  return (
                    <li key={s.key} className={`jm-stage${s.here ? ' has' : ''}${sub ? ' jm-sub' : ''}${isToday ? ' today' : ''}${open === s.key ? ' on' : ''}${map.lanes?.together?.[s.key] ? ' jm-with' : ''}${map.lanes?.tracks?.includes(s.key) ? ' jm-track' : ''}`}>
                      <button type="button" className="jm-node" aria-expanded={open === s.key} aria-controls={`jm-panel-${s.key}`}
                        aria-label={`${s.title}${lane ? ` (${lane})` : ''}${isToday ? ' (موقع الدفعة على جدولها اليوم)' : ''}: ${peopleAr(s.here)} هنا، ${s.done} تجاوزوها، ${ahead} لم يصلوها${s.late ? `، ${s.late} ${late.one}` : ''}`}
                        onClick={() => setOpen(open === s.key ? null : s.key)}>
                        {isToday && <span className={`jm-today${here || (sub && map.here_by_group?.[tg[s.key]]) ? '' : ' quiet'}`}>{here || sub ? 'اليوم' : 'موعدها اليوم'}</span>}
                        <span className="jm-mark" aria-hidden="true" style={{ '--w': (sub ? 0 : here) / max }} />
                        {sub ? <small className="jm-here jm-within" title="من فيها يُعدّ مرة واحدة مع المرحلة التي تسير معها">ضمن العدد</small> : <b className="jm-here">{here}</b>}
                        <span className="jm-title">{s.title}</span>
                        <small className="jm-dur">{durationAr(s.duration_days)}</small>
                        {lane && <small className="jm-lane">{lane}</small>}
                        <span className="jm-bar" aria-hidden="true">
                          <i className="d" style={{ width: `${total ? (s.done / total) * 100 : 0}%` }} />
                          <i className="h" style={{ width: `${total ? (s.here / total) * 100 : 0}%` }} />
                        </span>
                        {lateN > 0 && <span className="jm-late">{lateN} متأخر</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      <p className="jm-legend small" aria-hidden="true">
        <span><i className="d" /> تجاوزوا المرحلة</span><span><i className="h" /> هنا الآن</span><span><i className="a" /> لم يصلوها</span>
      </p>

      {openStage && <StagePanel stage={openStage} total={total} late={late} onClose={() => setOpen(null)} onPeople={onPeople} />}

      {services.length > 0 && (
        <section className="jm-svc" aria-labelledby="jm-svc-h" data-testid="jm-services">
          <h3 id="jm-svc-h">الخدمات</h3>
          <p className="small muted">لمن يريد حتى نهاية الرحلة، فلا تُعد في المراحل ولا في التقدم.</p>
          <ul>
            {services.map((s) => (
              <li key={s.key} className={`jm-svc-row${s.off ? ' off' : ''}`}>
                <b>{s.title}</b>
                {s.off ? <small>موقوفة لهذه الدفعة</small> : (
                  <>
                    <span className="jm-m-bar" aria-hidden="true"><i style={{ width: `${s.of ? (s.used / s.of) * 100 : 0}%` }} /></span>
                    <small className="jm-usage">{s.usage_ar}</small>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {map.milestones?.length > 0 && (
        <div className="jm-ms" aria-labelledby="jm-ms-h">
          <h3 id="jm-ms-h">المعالم</h3>
          <ol>
            {map.milestones.map((m) => (
              <li key={m.id} className={`jm-m ${m.late ? 'is-late' : m.done === total && total ? 'is-done' : ''}`}>
                <b>{m.title}</b>
                <small>{m.due ? `موعده ${fmtDate(m.due)}` : 'بلا موعد بعد'}</small>
                <span className="jm-m-bar" aria-hidden="true"><i style={{ width: `${total ? (m.done / total) * 100 : 0}%` }} /></span>
                <small>{m.done} من {total} أنجزوه{m.late ? <> · <span className="jm-tag">{m.late} متأخر</span></> : null}</small>
              </li>
            ))}
          </ol>
        </div>
      )}

      <table className="sr-only">
        <caption>خريطة الرحلة: عدد المشاركين عند كل مرحلة</caption>
        <thead><tr><th scope="col">الطور</th><th scope="col">المرحلة</th><th scope="col">هنا الآن</th><th scope="col">تجاوزوها</th><th scope="col">{late.one}</th></tr></thead>
        <tbody>{stages.map((s) => <tr key={s.key}><td>{PHASES.find((p) => p.key === s.phase)?.title}</td><td>{s.title}{s.off ? ' (موقوفة لهذه الدفعة)' : ''}{laneAr(s, stages, map.lanes) ? ` (${laneAr(s, stages, map.lanes)})` : ''}</td><td>{s.here}</td><td>{s.done}</td><td>{s.late}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
