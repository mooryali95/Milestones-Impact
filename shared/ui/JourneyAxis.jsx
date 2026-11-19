// ════════════════════════════════════════════════════════════════
// المحور الزمني الكامل: خط أفقي واحد للرحلة كلها، من أول يوم إلى آخر يوم
// ════════════════════════════════════════════════════════════════
// يرسم نموذج timelineAxis (supabase/functions/leaders-api/journey-timeline.js) كما هو، بلا أي حساب: المواضع نسب مئوية على محور
// خطي (كل يوم بالعرض نفسه)، والتواريخ من نوافذ الخط الزمني نفسها (cohortPlan)، فلا مصدر ثانٍ لتاريخ مرحلة.
// صف لكل مرحلة، فما «يسير معًا» يُرى متراكبًا في الزمن، وفوقه الأشهر والأسابيع، وخط اليوم، ونهاية الرحلة والدفعة، ونقطة لكل يوم ورشة.
// يتمرر أفقيًا داخل إطاره وحده على كل المقاسات، ويبدأ عند اليوم. والشريط زر ينقل إلى بطاقة مرحلته (onStage).
import React, { useEffect, useRef } from 'react';

/** @param {{ axis: any, onStage?: (key: string) => void, id?: string, title?: string }} props */
export default function JourneyAxis({ axis, onStage, id = 'ja', title = 'المحور الزمني الكامل' }) {
  const scroll = useRef(null);
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
  return (
    <section className="ja" aria-labelledby={head} data-testid="cj-axis">
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
      </header>
      <div className="ja-scroll" ref={scroll} tabIndex={0} role="group" aria-label="المحور الزمني، يتحرك بالأسهم">
        <div className="ja-track" style={{ minWidth: `${axis.min_width}px` }}>
          <div className="ja-plot">
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
                    {onStage
                      ? <button type="button" className={cls} style={style} title={r.text} aria-label={`${r.text}. افتح ${r.kind === 'track' ? 'بطاقته' : 'بطاقتها'}`} onClick={() => onStage(r.key)}>{inner}</button>
                      : <div className={cls} style={style} title={r.text}>{inner}</div>}
                    {r.dots.map((d, i) => <i key={`${d.date}-${i}`} className={`ja-dot${d.required ? '' : ' opt'}${d.outside ? ' out' : ''}`} style={pos(d.at)} aria-hidden="true" />)}
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
      <p className="ja-hint">{axis.weeks_ar} مرقمة من {axis.start_ar}.{onStage ? ' اضغط شريط أي مرحلة لتفتح بطاقتها.' : ''}</p>
    </section>
  );
}
