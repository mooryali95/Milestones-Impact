// ════════════════════════════════════════════════════════════════
// المحور الزمني الكامل: خط أفقي واحد للرحلة كلها، من أول يوم إلى آخر يوم
// ════════════════════════════════════════════════════════════════
// يرسم نموذج timelineAxis (supabase/functions/leaders-api/journey-timeline.js) كما هو، بلا أي حساب: المواضع نسب مئوية على محور
// خطي (كل يوم بالعرض نفسه)، والتواريخ من نوافذ الخط الزمني نفسها (cohortPlan)، فلا مصدر ثانٍ لتاريخ مرحلة.
// صف لكل مرحلة، فما «يسير معًا» يُرى متراكبًا في الزمن، وفوقه الأشهر والأسابيع، وخط اليوم، ونهاية الرحلة والدفعة، ونقطة لكل يوم ورشة.
// يتمرر أفقيًا داخل إطاره وحده على كل المقاسات، ويبدأ عند اليوم. والشريط زر ينقل إلى بطاقة مرحلته (onStage).
// وضع الإضافة (add، تصور تشغيل الدفعة 2026-11-19، المرحلة 4): بزر صريح في الرأس وحده يصير كل صف مرحلة ممرًا يُختار منه يوم.
// المؤشر يُظهر علامة «+» بتاريخ اليوم تحته، والنقرة تسلّم المرحلة واليوم للمضيف (add.onPick) فيفتح نموذج الجلسة ولا يُحفظ شيء
// هنا. ولوحة المفاتيح: Tab إلى صف المرحلة، والأسهم تغيّر اليوم (Shift أسبوعًا)، ومفتاح Enter يفتح النموذج، ومفتاح Esc ينهي الوضع.
// خارج الوضع لا يتغير شيء: نقرة الشريط تفتح بطاقته وحدها. والمكوّن لا يحسب تاريخًا: اليوم وتسميته وموضعه من المضيف.
import React, { useEffect, useRef, useState } from 'react';

/** add: { on, onToggle(), can: { مفتاح: bool }, dayAt(pct), day(d), startDay(key), range(key), onPick(key, info) } و info: { day, date, at, label }
 * @param {{ axis: any, onStage?: (key: string) => void, id?: string, title?: string, add?: any }} props */
export default function JourneyAxis({ axis, onStage, id = 'ja', title = 'المحور الزمني الكامل', add = null }) {
  const scroll = useRef(null);
  const plot = useRef(null);
  // اليوم تحت المؤشر أو المختار بالأسهم في صف مرحلة: { key, info, kbd }
  const [pick, setPick] = useState(null);
  const adding = !!add?.on;
  useEffect(() => { if (!adding) setPick(null); }, [adding]);
  const todayAt = axis?.today?.at ?? null;
  // يبدأ العرض عند اليوم: تمرير أفقي داخل الإطار وحده (لا scrollIntoView، فلا تتحرك الصفحة)
  useEffect(() => {
    const box = scroll.current;
    const mark = box?.querySelector('.ja-today');
    if (!box || !mark || box.scrollWidth <= box.clientWidth) return;
    const b = box.getBoundingClientRect(), m = mark.getBoundingClientRect();
    box.scrollLeft += m.left + m.width / 2 - (b.left + b.width / 2);
  }, [todayAt, axis?.min_width]);
  if (!axis) return null;
  const head = `${id}-h`;
  const pos = (at) => ({ insetInlineStart: `${at}%` });
  const hasDots = axis.rows.some((r) => r.dots.length);
  const hasTrack = axis.rows.some((r) => r.kind === 'track');
  // نسبة المؤشر على المحور باتجاه الزمن (مع RTL)، من إطار الرسم نفسه الذي تُحسب عليه مواضع الأشرطة
  const pctOf = (x) => {
    const el = plot.current;
    if (!el) return 0;
    const b = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    return ((rtl ? b.right - x : x - b.left) / (b.width || 1)) * 100;
  };
  // تسمية العلامة تنقلب إلى الجهة الأخرى حين لا يسعها ما بقي ظاهرًا من إطار التمرير بعد العلامة (فلا تُقص على الهاتف)
  const flipAt = (at) => {
    const el = plot.current, box = scroll.current;
    if (!el || !box) return at > 60;
    const b = el.getBoundingClientRect(), v = box.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const x = rtl ? b.right - (at / 100) * b.width : b.left + (at / 100) * b.width;
    return (rtl ? x - v.left : v.right - x) < 190;
  };
  const kbdDay = (key) => (pick?.key === key ? pick.info : add.day(add.startDay(key)));
  const laneKey = (key, e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); add.onToggle(); return; }
    const [lo, hi] = add.range(key);
    const cur = kbdDay(key).day;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const later = rtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
      next = cur + (later ? 1 : -1) * (e.shiftKey ? 7 : 1);
    } else if (e.key === 'Home') next = lo;
    else if (e.key === 'End') next = hi;
    if (next == null) return;
    e.preventDefault();
    setPick({ key, info: add.day(next), kbd: true });
  };
  const titleOf = (key) => axis.rows.find((r) => r.key === key)?.title || '';
  return (
    <section className={`ja${adding ? ' ja-adding' : ''}`} aria-labelledby={head} data-testid="cj-axis" data-days={axis.days} onKeyDown={adding ? (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); add.onToggle(); } } : undefined}>
      <header className="ja-head">
        <div>
          <p className="ja-eyebrow">{axis.dated ? 'كل المراحل على خط واحد بتواريخها' : 'كل المراحل على خط واحد بالأسابيع'}</p>
          <h3 id={head}>{title}</h3>
        </div>
        <ul className="ja-legend" aria-label="مفتاح المحور">
          {axis.today && <li><i className="ln" />اليوم</li>}
          {axis.markers.length > 0 && <li><i className="ja-ln-end" />{axis.markers.some((m) => m.kind === 'chain') ? 'نهاية الرحلة والدفعة' : 'نهاية الدفعة'}</li>}
          {hasDots && <li><i className="ja-dot-key" />يوم ورشة</li>}
          {hasTrack && <li><i className="sq lane" />مسار مستمر</li>}
        </ul>
        {add && (
          <button type="button" className={`ja-add${adding ? ' on' : ''}`} aria-pressed={adding} data-testid="ja-add" onClick={add.onToggle}>
            {adding ? 'أنهِ الإضافة' : <><span aria-hidden="true">+ </span>ورشة على الخط</>}
          </button>
        )}
      </header>
      {adding && <p className="ja-add-hint" role="note" data-testid="ja-add-hint">اختر يومًا في صف المرحلة: النقرة تفتح نموذج الورشة بمرحلتها وتاريخها، ولا يُحفظ شيء قبل تأكيدك.<span className="ja-add-kbd"> بلوحة المفاتيح: انتقل إلى الصف بمفتاح Tab، وغيّر اليوم بالأسهم، وافتح النموذج بمفتاح Enter، وأنهِ بمفتاح Esc.</span></p>}
      <div className="ja-scroll" ref={scroll} tabIndex={0} role="group" aria-label="المحور الزمني، يتحرك بالأسهم">
        <div className="ja-track" style={{ minWidth: `${axis.min_width}px` }}>
          <div className="ja-plot" ref={plot}>
            <div className="ja-lines" aria-hidden="true">
              {axis.weeks.map((w) => <i key={w.n} style={pos(w.at)} />)}
            </div>
            {axis.today && <div className="ja-today" style={pos(axis.today.at)}><span><b>{axis.today.label}</b></span></div>}
            {axis.markers.map((m) => <div key={m.key} className={`ja-mark k-${m.kind}`} style={pos(m.at)} aria-hidden="true" />)}
            {axis.months.length > 0 && (
              <div className="ja-months" aria-hidden="true">
                {axis.months.map((m) => <span key={`${m.at}-${m.label}`} style={{ ...pos(m.at), width: `${m.width}%` }}><b>{m.label}</b></span>)}
              </div>
            )}
            <div className="ja-weeks" aria-hidden="true">
              {axis.weeks.map((w) => <span key={w.n} style={{ ...pos(w.at), width: `${w.width}%` }} title={w.label}><b>{w.n}</b></span>)}
            </div>
            <ol className="ja-rows" aria-label="المراحل على المحور">
              {axis.rows.map((r) => {
                const cls = `ja-bar${r.instant ? ' instant' : ''}${r.flip ? ' flip' : ''}`;
                const style = { ...pos(r.at), width: `${r.width}%` };
                const inner = <><span className="ja-label"><b>{r.title}</b><small>{r.when_ar}</small></span><i className="ja-fill" aria-hidden="true" /></>;
                return (
                  <li key={r.key} className={`ja-row ph-${r.phase} k-${r.kind}${r.status ? ` st-${r.status}` : ''}${r.optional ? ' opt' : ''}`} data-axis={r.key}>
                    {onStage && !adding
                      ? <button type="button" className={cls} style={style} title={r.text} aria-label={`${r.text}. افتح ${r.kind === 'track' ? 'بطاقته' : 'بطاقتها'}`} onClick={() => onStage(r.key)}>{inner}</button>
                      : <div className={cls} style={style} title={r.text}>{inner}</div>}
                    {r.dots.map((d, i) => <i key={`${d.date}-${i}`} className={`ja-dot${d.required ? '' : ' opt'}${d.outside ? ' out' : ''}`} style={pos(d.at)} aria-hidden="true" />)}
                    {adding && (
                      <button type="button" className={`ja-add-lane${add.can?.[r.key] ? '' : ' off'}`} data-add-lane={r.key}
                        aria-label={`${add.can?.[r.key] ? 'أضف ورشة في' : 'لا نشاط حضور في'} «${r.title}»${pick?.key === r.key ? `، ${pick.info.label}` : ''}. الأسهم تغيّر اليوم، ومفتاح Enter يفتح النموذج`}
                        onPointerMove={(e) => setPick({ key: r.key, info: add.dayAt(pctOf(e.clientX)) })}
                        onPointerLeave={() => setPick((h) => (h?.kbd ? h : null))}
                        onFocus={() => setPick((h) => (h?.key === r.key ? h : { key: r.key, info: add.day(add.startDay(r.key)), kbd: true }))}
                        onBlur={() => setPick((h) => (h?.key === r.key ? null : h))}
                        onKeyDown={(e) => laneKey(r.key, e)}
                        // نقرة المؤشر باليوم تحته، ونقرة لوحة المفاتيح (بلا موضع) باليوم المختار بالأسهم
                        onClick={(e) => add.onPick(r.key, e.detail > 0 && (e.clientX || e.clientY) ? add.dayAt(pctOf(e.clientX)) : kbdDay(r.key))} />
                    )}
                    {adding && pick?.key === r.key && (
                      <span className={`ja-add-mark${add.can?.[r.key] ? '' : ' off'}${flipAt(pick.info.at) ? ' flip' : ''}`} style={pos(pick.info.at)} aria-hidden="true" data-testid="ja-add-mark"><i>+</i><b>{pick.info.label}</b></span>
                    )}
                  </li>
                );
              })}
            </ol>
            {axis.markers.length > 0 && (
              <div className="ja-foot" style={{ blockSize: `${axis.markers.length * 22}px` }}>
                {axis.markers.map((m, i) => <span key={m.key} className={`k-${m.kind}`} style={{ insetInlineEnd: `${100 - m.at}%`, top: `${i * 22}px` }}>{m.label}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
      {adding && <p className="sr-only" aria-live="polite">{pick?.kbd ? `${titleOf(pick.key)}، ${pick.info.label}` : ''}</p>}
      <p className="ja-hint">{axis.weeks_ar} مرقمة من {axis.start_ar}.{onStage ? ' اضغط شريط أي مرحلة لتفتح بطاقتها.' : ''}</p>
    </section>
  );
}
