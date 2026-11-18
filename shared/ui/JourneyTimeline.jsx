// ════════════════════════════════════════════════════════════════
// الرحلة في لمحة (J1b): خط زمني للقراءة فقط للبرنامج والدفعة
// ════════════════════════════════════════════════════════════════
// يرسم نموذج journeyTimeline (supabase/functions/leaders-api/journey-timeline.js) كما هو، بلا أي حساب ولا خريطة تسميات:
// المواضع والنصوص والحالات كلها من النموذج. لا تحرير هنا: المدة تُحرر في المرحلة، والموعد في الدفعة (مصدر واحد).
// الحاسوب (حاوٍ أعرض من 640px): محاور ومراحل ومسارات مكدسة لما «تسير معًا» ومسطرة، ولوحة تفاصيل ثابتة المكان،
// ويتمرر المسار أفقيًا داخل إطاره وحده. الهاتف: خط رأسي بمراحل details أصلية. وتحتهما جدول بديل لقارئ الشاشة.
// السحب (D1، تصور 2026-11-18 ب5.3): بـeditable وحده (وضع تحرير خطة الدفعة لمن يكتب) يصير الشريط قابلًا للسحب بالمؤشر
// (فأرة وقلم ولمس) وطرفه لتغيير مدته، وبلوحة المفاتيح من زر المقبض. المكوّن يقيس المؤشر نسبةً على المسار ويرسم الشبح
// والسطر وحدهما، والمعنى كله عند المضيف (dropToEdit في cohort-journey.js). على الحاسوب وحده: الهاتف بلا مقابض.
import React, { useEffect, useRef, useState } from 'react';

// أيقونات الأنواع بالخط نفسه الذي في Ico.jsx (سماكة واحدة تأخذ لون النص)، زخرفية دائمًا والمعنى في aria-label
const PATHS = {
  training: 'M3.5 4.5h17v11h-17v-11ZM12 15.5v3M8 20.5h8M7 12l3-3 2.5 2.5L17 7',
  book: 'M4.5 5c2.5-1 5-1 7.5.5 2.5-1.5 5-1.5 7.5-.5v13.5c-2.5-1-5-1-7.5.5-2.5-1.5-5-1.5-7.5-.5V5ZM12 5.5V19',
  meeting: 'M4 6.5h16v13H4v-13ZM4 10.5h16M8.5 4v4M15.5 4v4M8 14h3',
  coaching: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19.5c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14 4.5h7v5h-3l-2 2v-2h-2v-5Z',
  upload: 'M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v4.5h15V15',
  form: 'M7 4.5h10v16H7v-16ZM9.5 3.5h5v2.5h-5V3.5ZM9.5 10h5M9.5 13.5h5M9.5 17h3',
  auto: 'M4.5 16a7.5 7.5 0 1 1 15 0M12 16l3.5-4.5M3.5 16h2M18.5 16h2',
  video: 'M3.5 5.5h17v13h-17v-13ZM10 9.5v5l4.5-2.5L10 9.5Z',
  flag: 'M6 20.5v-16M6 4.5h11l-2 4 2 4H6',
  target: 'M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 16.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12.5h.01',
  online: 'M3.5 5h17v11h-17V5ZM9 20h6M12 16v4',
  in_person: 'M12 21s6.5-5.5 6.5-11a6.5 6.5 0 0 0-13 0c0 5.5 6.5 11 6.5 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  hybrid: 'M3.5 5h11v8h-11V5ZM7 17h4M18 21s3-2.5 3-5.2a3 3 0 0 0-6 0C15 18.5 18 21 18 21Z',
  clock: 'M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 8v4.5l3 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};
function Glyph({ name, size = 18 }) {
  return (
    <svg className="jt-glyph" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] || PATHS.form} />
    </svg>
  );
}

// النشاط: مربع مملوء للإلزامي ومفرغ متقطع للاختياري، وشارة الطريقة، وساعة لما ينقصه موعد
function Act({ a, sel, onPick, onOpen }) {
  return (
    <button type="button" className={`jt-act${a.required ? ' req' : ' opt'}${a.undated ? ' tbd' : ''}${sel ? ' on' : ''}`}
      aria-label={a.aria_ar} aria-pressed={sel} data-act={a.id}
      onMouseEnter={() => onPick(a.id)} onFocus={() => onPick(a.id)} onClick={() => onPick(a.id)} onDoubleClick={() => onOpen?.(a)}>
      <Glyph name={a.icon} />
      {a.mode && <span className="jt-badge mode"><Glyph name={a.mode} size={10} /></span>}
      {a.undated && <span className="jt-badge tbd"><Glyph name="clock" size={10} /></span>}
    </button>
  );
}

// الشبح: الموضع الناتج على المسار وتواريخه، في صف الشريط المسحوب، ولا يأخذ المؤشر
function GhostBar({ ghost, band }) {
  if (!band) return null;
  return (
    <div className={`jt-ghost${ghost.bad ? ' bad' : ''}`} data-testid="jt-ghost" aria-hidden="true"
      style={{ insetInlineStart: `${ghost.at}%`, width: `${Math.max(1, ghost.width)}%`, top: `${band.top}px`, height: `${band.height}px` }}>
      <span>{ghost.label}</span>
    </div>
  );
}
function measureNow(ref, k) {
  const t = ref.current;
  const b = t?.querySelector(`[data-stage="${k}"],[data-track="${k}"]`);
  if (!t || !b) return null;
  const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
  return { top: br.top - tr.top, height: br.height };
}

function Panel({ a, model, onOpen, openLabel }) {
  if (!a) return <div className="jt-panel" aria-live="polite"><p className="jt-muted">مرر المؤشر أو اضغط أي نشاط لترى تفاصيله.</p></div>;
  return (
    <div className="jt-panel" aria-live="polite">
      <p className="jt-eyebrow">النشاط</p>
      <h4>{a.title}</h4>
      <p className="jt-chips">
        <span>مرحلة {a.stage_title}</span><span>{a.kind_ar}</span>
        <span className={a.required ? 'jt-chip req' : 'jt-chip opt'}>{a.required ? 'إلزامي' : 'اختياري'}</span>
        {a.mode_ar && <span>{a.mode_ar}</span>}{a.level_ar && <span className="jt-chip">{a.level_ar}</span>}
      </p>
      <p className={`jt-when${a.undated ? ' tbd' : ''}`}>{a.undated && <Glyph name="clock" size={14} />} {a.when_ar}</p>
      {a.outside && <p className="jt-when tbd">{model.outside_ar}</p>}
      <p className="jt-muted">{a.owner_ar}</p>
      {onOpen && <button type="button" className="jt-open" onClick={() => onOpen(a)}>{openLabel(a)}</button>}
    </div>
  );
}

// عتبة بدء السحب بالبكسل (كما في LabBoard): نقرة لا تصير سحبًا، والسحب لا يُبدأ تحت 640 بكسل
const DRAG_THRESHOLD = 4;
const DRAG_MIN_WIDTH = 640;

/** مقابض السحب لشريط واحد: المقبض (لوحة المفاتيح، ويُسحب بالمؤشر أيضًا) وطرف المدة. pointer: بدء الحركة من المضيف */
function Grips({ k, title, editable, pointer }) {
  const bar = editable.bars?.[k];
  if (!bar) return null;
  const picked = editable.drag?.key === k && editable.drag?.kbd;
  return (
    <>
      <button type="button" className={`jt-grip${picked ? ' on' : ''}`} data-grip={k} aria-pressed={!!picked}
        aria-label={`حرّك «${title}»: Enter يلتقط، والأسهم يومًا وShift أسبوعًا، وAlt مع الأسهم للمدة، وEsc يلغي`}
        aria-describedby={editable.hintId} onKeyDown={(e) => editable.onKey?.(k, e)} onPointerDown={(e) => pointer(e, k, 'move')}>
        <svg viewBox="0 0 12 16" width="10" height="14" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" /></g></svg>
      </button>
      <span className="jt-edge" data-edge={k} aria-hidden="true" title={bar.edge_ar || 'اسحب الطرف لتغيير المدة'} onPointerDown={(e) => pointer(e, k, 'end')} />
    </>
  );
}

/** onStage: إن مُرر صار اسم المرحلة على المسار زرًا ينقل إلى بطاقتها خارج الخط (تبويب «الرحلة» في ملف الدفعة)
 * omitCards: مفاتيح بطاقات الملخص التي يعرضها المضيف فوق الخط، فلا تتكرر (تبويب «الرحلة» يحمل المدة والنافذة والآن في رأسه)
 * @param {{ model: any, onOpen?: (a: any) => void, openLabel?: (a: any) => string, onEmpty?: () => void, onStage?: (key: string) => void, id?: string, omitCards?: readonly string[] }} props */
/* editable (D1): { bars: { مفتاح: { edge_ar } }, drag: { key, kind, kbd, ghost: { at, width, label, bad } } | null,
 *   onStart({ key, kind }), onMove({ pct, over }), onEnd({ pct, over }), onCancel(), onKey(key, event), live, hintId }
 *   pct: النقاط المئوية التي تحرّكها المؤشر على المسار من موضع الالتقاط باتجاه الزمن (مع مراعاة RTL)، وover: الصف والشريط تحت المؤشر */
export default function JourneyTimeline({ model, onOpen, openLabel = () => 'فتح', onEmpty, onStage, id = 'jt', omitCards = [], editable = null }) {
  const [sel, setSel] = useState(model?.selected || null);
  const trackRef = useRef(null);
  const press = useRef(null);
  // موضع الشريط المسحوب على المسار (أعلاه وارتفاعه)، فيُرسم الشبح في صفه
  const [band, setBand] = useState(null);
  const dragging = !!editable?.drag;
  // Esc يلغي السحب بالمؤشر أينما كان التركيز، ولا يصل إلى غيره (نافذة أو ملف)
  useEffect(() => {
    if (!dragging || editable?.drag?.kbd) return undefined;
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); press.current = null; editable.onCancel?.(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [dragging, editable]);
  if (!model) return null;
  const head = `${id}-h`;
  if (model.empty) {
    return (
      <section className="jt jt-empty" aria-labelledby={head}>
        <h3 id={head} className="jt-eyebrow">{model.title}</h3>
        <p>{model.empty_ar}</p>
        {onEmpty && <button type="button" className="jt-open" onClick={onEmpty}>أضف أول مرحلة</button>}
      </section>
    );
  }
  const acts = new Map(model.activities.map((a) => [a.id, a]));
  const stageBy = new Map(model.stages.map((s) => [s.key, s]));
  const current = acts.get(sel) || acts.get(model.selected) || null;
  const cohort = model.context === 'cohort';
  const pick = (k) => setSel(k);
  // ── السحب بالمؤشر: النسبة على المسار باتجاه الزمن، وما تحت المؤشر (الصف والشريط)، وعتبة قبل البدء ──
  const pctOf = (x) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    return (((rtl ? r.right - x : x - r.left) / (r.width || 1)) * 100);
  };
  const overAt = (x, y, own) => {
    const el = typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null;
    if (!el || !trackRef.current?.contains(el)) return { zone: null, key: null };
    const bar = el.closest('[data-stage],[data-track]');
    const k = bar ? bar.getAttribute('data-stage') || bar.getAttribute('data-track') : null;
    const zone = el.closest('.jt-tracks') ? 'tracks' : el.closest('.jt-services') ? 'services' : el.closest('.jt-slots') ? 'stages' : null;
    return { zone, key: k && k !== own ? k : null };
  };
  const measure = (k) => {
    const t = trackRef.current;
    const b = t?.querySelector(`[data-stage="${k}"],[data-track="${k}"]`);
    if (!t || !b) return null;
    const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { top: br.top - tr.top, height: br.height };
  };
  const pointer = (e, k, kind) => {
    if (!editable?.bars?.[k] || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const box = trackRef.current?.closest('.jt');
    if (box && box.getBoundingClientRect().width < DRAG_MIN_WIDTH) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* المتصفح بلا التقاط: يكفي التتبع */ }
    press.current = { k, kind, x: e.clientX, y: e.clientY, p0: pctOf(e.clientX), on: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.on) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
      p.on = true;
      setBand(measure(p.k));
      editable.onStart?.({ key: p.k, kind: p.kind });
    }
    editable.onMove?.({ pct: pctOf(e.clientX) - p.p0, over: overAt(e.clientX, e.clientY, p.k) });
  };
  const onPointerUp = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (p.on) editable.onEnd?.({ pct: pctOf(e.clientX) - p.p0, over: overAt(e.clientX, e.clientY, p.k) });
    else if (p.kind === 'move') e.target?.closest?.('.jt-grip')?.focus?.();
  };
  const onPointerCancel = () => { if (press.current?.on) editable.onCancel?.(); press.current = null; };
  // لوحة المفاتيح: المضيف يلتقط ويحرك، وهنا يُقاس صف الشريط للشبح
  const kbdBand = editable?.drag?.kbd ? editable.drag.key : null;
  const ghost = editable?.drag?.ghost || null;
  const bandNow = band && editable?.drag && !editable.drag.kbd ? band : null;
  const grips = (k, title) => (editable ? <Grips k={k} title={title} editable={editable} pointer={pointer} /> : null);
  const barDrag = (k) => (editable?.bars?.[k] ? { onPointerDown: (e) => { if (!e.target.closest('button,a,input,select,.jt-edge')) pointer(e, k, 'move'); } } : {});
  const lane = (s) => (
    <div key={s.key} data-stage={s.key} {...barDrag(s.key)} className={`jt-stage${editable?.bars?.[s.key] ? ' drag' : ''}${editable?.drag?.key === s.key ? ' dragging' : ''} ph-${s.phase}${s.status ? ` st-${s.status}` : ''}${s.together ? ' lane' : ''}${s.mode_ar ? ` nonreq md-${s.mode}` : ''}`}
      style={s.together ? { marginInlineStart: `${s.lane_at}%`, width: `${Math.min(s.lane_width, 100 - s.lane_at)}%` } : undefined}>
      {grips(s.key, s.title)}
      <div className="jt-stage-head">
        {onStage ? (
          <button type="button" className="jt-stage-link" onClick={() => onStage(s.key)} aria-label={`${s.title}: انتقل إلى بطاقتها`}>
            <b>{s.status === 'done' && <Glyph name="check" size={12} />}{s.title}</b>
          </button>
        ) : <b>{s.status === 'done' && <Glyph name="check" size={12} />}{s.title}</b>}
        <small>{cohort && s.window_ar ? s.window_ar : s.label}{s.with_note ? `، ${s.with_note}` : ''}</small>
        {s.mode_ar && <span className="jt-mode">{s.mode_ar}</span>}
        {s.status_ar && s.status !== 'upcoming' && <span className={`jt-status ${s.status}`}>{s.status_ar}</span>}
      </div>
      <div className="jt-acts">
        {s.empty ? <span className="jt-none">لا أنشطة بعد</span>
          : s.activities.map((k) => <Act key={k} a={acts.get(k)} sel={current?.id === k} onPick={pick} onOpen={onOpen} />)}
      </div>
    </div>
  );
  // المواعيد (الدفعة): نقطة لكل جلسة مؤرخة، وشارة «يُحدد لاحقًا» لكل مرحلة فيها جلسة بلا موعد
  const dots = model.activities.flatMap((a) => a.dates.map((d, i) => ({ ...d, a, key: `${a.id}-${i}` })));
  const tbd = model.stages.filter((s) => s.undated);
  const slotAt = new Map(model.slots.map((x) => [x.key, x]));
  const cards = model.cards.filter((c) => !omitCards.includes(c.key));
  const openFirst = (s) => (cohort ? s.status === 'active' : s.key === model.stages.find((x) => x.phase === 'qualification')?.key);
  // المسار المستمر (T1): صف «مسارات مستمرة» بجانب السلسلة على المقياس نفسه، بشريط من بدايته إلى نهايته
  const tracks = model.tracks || [];
  for (const x of tracks) stageBy.set(x.key, x);
  const trackHead = (s) => (
    <div className="jt-stage-head">
      {onStage ? (
        <button type="button" className="jt-stage-link" onClick={() => onStage(s.key)} aria-label={`${s.title}: انتقل إلى بطاقته`}>
          <b>{s.status === 'done' && <Glyph name="check" size={12} />}{s.title}</b>
        </button>
      ) : <b>{s.status === 'done' && <Glyph name="check" size={12} />}{s.title}</b>}
      <span className="jt-mode jt-lane-tag">{s.lane_ar}</span>
      {s.status_ar && s.status !== 'upcoming' && <span className={`jt-status ${s.status}`}>{s.status_ar}</span>}
      <small>{cohort && s.window_ar ? s.window_ar : s.label}، {s.note_ar}</small>
    </div>
  );

  return (
    <section className={`jt ctx-${model.context}${editable ? ' jt-editable' : ''}${dragging ? ' jt-dragging' : ''}`} aria-labelledby={head}>
      <header className="jt-head">
        <div>
          <p className="jt-eyebrow">الرحلة في لمحة{cohort ? '، بالتواريخ' : '، بالأسابيع'}</p>
          <h3 id={head}>{model.title}</h3>
        </div>
        {cards.length > 0 && (
          <dl className="jt-cards">
            {cards.map((c) => <div key={c.key} className={c.tone ? `tone-${c.tone}` : ''}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}
          </dl>
        )}
      </header>
      {model.notice && <p className="jt-notice" role="note">{model.notice}</p>}

      {/* الحاسوب: المسار على مقياس واحد، يتمرر وحده إن ضاق الحاوي */}
      <div className="jt-desk">
        <div className="jt-scroll" tabIndex={0} role="group" aria-label="الخط الزمني، يتحرك بالأسهم">
          <div className="jt-track" ref={trackRef} onPointerMove={editable ? onPointerMove : undefined} onPointerUp={editable ? onPointerUp : undefined}
            onPointerCancel={editable ? onPointerCancel : undefined} onLostPointerCapture={editable ? onPointerUp : undefined}>
            {model.today && <div className="jt-today" style={{ insetInlineStart: `${model.today.at}%` }}><span>{model.today.label}</span></div>}
            <div className="jt-row jt-phases">
              {model.phases.map((p) => (
                <div key={p.key} className={`jt-phase ph-${p.key}`} style={{ insetInlineStart: `${p.at}%`, width: `${p.width}%` }}>
                  <b>{p.title}</b><small>{p.label}</small>
                </div>
              ))}
            </div>
            <div className="jt-row jt-slots">
              {model.slots.map((x) => (
                <div key={x.key} className={`jt-slot${x.together ? ' together' : ''}`} style={{ flexBasis: `${x.width}%` }}>
                  {x.together && <p className="jt-together"><span>{model.together_ar}</span> {x.note_ar}</p>}
                  {x.stages.map((k) => lane(stageBy.get(k)))}
                </div>
              ))}
            </div>
            {tracks.length > 0 && (
              <div className="jt-row jt-tracks" role="group" aria-label={model.tracks_ar} style={{ minHeight: `${24 + tracks.length * 106}px` }}>
                <span className="jt-row-label">{model.tracks_ar}</span>
                {tracks.map((s, i) => (
                  <div key={s.key} className={`jt-trackbar ph-${s.phase}${s.status ? ` st-${s.status}` : ''}${editable?.bars?.[s.key] ? ' drag' : ''}${editable?.drag?.key === s.key ? ' dragging' : ''}`} data-track={s.key}
                    {...barDrag(s.key)} style={{ insetInlineStart: `${s.at}%`, width: `${s.width}%`, top: `${20 + i * 106}px` }}>
                    {grips(s.key, s.title)}
                    {trackHead(s)}
                    <div className="jt-acts">
                      {s.empty ? <span className="jt-none">لا أنشطة بعد</span>
                        : s.activities.map((k) => <Act key={k} a={acts.get(k)} sel={current?.id === k} onPick={pick} onOpen={onOpen} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cohort && model.dated && (
              <div className="jt-row jt-dates" aria-label="المواعيد">
                <span className="jt-row-label">المواعيد</span>
                {dots.map((d) => (
                  <span key={d.key} className={`jt-dot${d.required ? '' : ' opt'}${d.outside ? ' out' : ''}`} style={{ insetInlineStart: `${d.at}%` }}
                    title={`${d.a.title}، ${d.label}${d.outside ? '، خارج نافذة المرحلة' : ''}`} />
                ))}
                {tbd.map((s) => {
                  const x = slotAt.get(s.slot);
                  return <span key={s.key} className="jt-tbd" style={{ insetInlineStart: `${x.at + x.width / 2}%` }}><Glyph name="clock" size={11} /> موعد يُحدد لاحقًا</span>;
                })}
              </div>
            )}
            {ghost && (bandNow || kbdBand) && (
              <GhostBar ghost={ghost} band={bandNow || measureNow(trackRef, kbdBand)} />
            )}
            <div className="jt-row jt-ruler">
              {model.ticks.map((t) => <span key={`${t.at}-${t.label}`} style={{ insetInlineStart: `${t.at}%` }}>{t.label}</span>)}
            </div>
          </div>
        </div>
        {editable && (
          <p className="jt-drag-live" id={editable.hintId} aria-live="polite">{editable.live || 'اسحب الشريط لتغيير بدايته، وطرفه لتغيير مدته، أو استعمل المقبض بلوحة المفاتيح. والعدادات في البطاقات تفعل الشيء نفسه.'}</p>
        )}
        <div className="jt-foot">
          <ul className="jt-legend" aria-label="مفتاح الرموز">
            <li><i className="sq req" />إلزامي</li><li><i className="sq opt" />اختياري</li>
            <li><Glyph name="online" size={13} />عن بعد</li><li><Glyph name="in_person" size={13} />حضوري</li>
            <li><Glyph name="clock" size={13} />يُحدد لاحقًا</li><li><i className="sq tog" />تسير معًا</li>
            {model.stages.some((s) => s.mode_ar) && <li><i className="sq nonreq" />مرحلة غير إلزامية</li>}
            {tracks.length > 0 && <li><i className="sq lane" />مسار مستمر يسير بجانب المراحل</li>}
            {model.today && <li><i className="ln" />اليوم</li>}
          </ul>
          <Panel a={current} model={model} onOpen={onOpen} openLabel={openLabel} />
        </div>
      </div>

      {/* الهاتف: خط رأسي، كل مرحلة details تفتح بطاقات أنشطتها، والمسار المستمر قبلها بشريط «يسير بجانب المراحل» */}
      {tracks.length > 0 && (
        <ul className="jt-phone jt-m-tracks" aria-label={model.tracks_ar}>
          {tracks.map((s) => (
            <li key={s.key} className={`jt-m-track ph-${s.phase}${s.status ? ` st-${s.status}` : ''}`} data-track={s.key}>
              <p className="jt-m-title"><b>{s.title}</b><span className="jt-mode jt-lane-tag">{s.lane_ar}</span>{s.status_ar && <span className={`jt-status ${s.status}`}>{s.status_ar}</span>}</p>
              <small>{cohort && s.window_ar ? s.window_ar : s.label}</small>
              <small>{s.note_ar}. {s.due_ar}.</small>
              {s.today_ar && <p className="jt-m-today">{s.today_ar}</p>}
            </li>
          ))}
        </ul>
      )}
      <ol className="jt-phone" aria-label="مراحل الرحلة">
        {model.phases.map((p) => (
          <li key={p.key} className={`jt-m-phase ph-${p.key}`}>
            <p className="jt-m-phase-head"><b>{p.title}</b><small>{p.label}</small></p>
            <ol>
              {model.stages.filter((s) => s.phase === p.key).map((s) => (
                <li key={s.key} className={`jt-m-stage${s.status ? ` st-${s.status}` : ''}${s.together ? ' together' : ''}${s.mode_ar ? ` nonreq md-${s.mode}` : ''}`}>
                  <details open={openFirst(s)}>
                    <summary>
                      <span className="jt-m-node" aria-hidden="true" />
                      <span className="jt-m-title"><b>{s.title}</b>{s.mode_ar && <span className="jt-mode">{s.mode_ar}</span>}{s.status_ar && <span className={`jt-status ${s.status}`}>{s.status_ar}</span>}</span>
                      <small>{cohort && s.window_ar ? s.window_ar : s.label}{s.with_note ? `، ${s.with_note}` : ''}</small>
                      <span className="jt-m-bar" aria-hidden="true"><i style={{ width: `${s.bar}%` }} /></span>
                      <span className="jt-m-icons" aria-hidden="true">
                        {s.activities.map((k) => { const a = acts.get(k); return <i key={k} className={`${a.required ? 'req' : 'opt'}${a.undated ? ' tbd' : ''}`}><Glyph name={a.icon} size={14} /></i>; })}
                      </span>
                    </summary>
                    {s.today_ar && <p className="jt-m-today">{s.today_ar}</p>}
                    {s.empty ? <p className="jt-none">لا أنشطة بعد</p> : (
                      <ul className="jt-m-cards">
                        {s.activities.map((k) => {
                          const a = acts.get(k);
                          return (
                            <li key={k} className={a.undated ? 'tbd' : ''}>
                              <i className={a.required ? 'req' : 'opt'}><Glyph name={a.icon} size={16} /></i>
                              <div>
                                <b>{a.title}</b>
                                <p className="jt-chips">
                                  <span className={a.required ? 'jt-chip req' : 'jt-chip opt'}>{a.required ? 'إلزامي' : 'اختياري'}</span>
                                  {a.mode_ar && <span>{a.mode_ar}</span>}{a.level_ar && <span className="jt-chip">{a.level_ar}</span>}
                                  {a.undated && <span className="jt-chip tbd"><Glyph name="clock" size={11} /> يُحدد لاحقًا</span>}
                                </p>
                                <small>{a.when_ar}، {a.owner_ar}</small>
                                {onOpen && <button type="button" className="jt-open sm" onClick={() => onOpen(a)} aria-label={`${openLabel(a)}: ${a.title}`}>{openLabel(a)}</button>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </details>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <details className="jt-table">
        <summary>عرض الرحلة جدولًا</summary>
        <div className="jt-table-wrap">
          <table>
            <caption className="jt-sr">{model.title}: كل الأنشطة بمراحلها</caption>
            <thead><tr><th scope="col">المرحلة</th><th scope="col">النشاط</th><th scope="col">النوع</th><th scope="col">الإلزام</th><th scope="col">الطريقة</th><th scope="col">الموعد</th></tr></thead>
            <tbody>
              {model.activities.map((a) => (
                <tr key={a.id}><td>{a.stage_title}</td><td>{a.title}</td><td>{a.kind_ar}</td><td>{a.required ? 'إلزامي' : 'اختياري'}</td><td>{a.mode_ar || '·'}</td><td>{a.when_ar}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
