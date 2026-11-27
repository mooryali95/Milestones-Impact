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
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOARD_COL_MIN, boardMinWidth, tickShortAr } from '../../supabase/functions/leaders-api/journey-timeline.js';

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
// pop (المرحلة 19، محرر الرحلة): البلاطة زر إفصاح بـaria-expanded، وتحت الأيقونة اسم النشاط القصير من title_ar (يُقص بالنقاط
// في CSS والاسم كاملًا في DOM، فيبدأ aria-label بالنص المرئي نفسه)، والنقر يفتح التفاصيل ملاصقة لها لا في لوحة ثابتة
function Act({ a, sel, onPick, onOpen, pop = null }) {
  if (pop) {
    return (
      <button type="button" className={`jt-act jt-tile${a.required ? ' req' : ' opt'}${a.undated ? ' tbd' : ''}${sel ? ' on' : ''}`}
        aria-label={a.aria_ar} aria-expanded={sel} aria-controls={sel ? pop.id : undefined} data-act={a.id}
        onClick={(e) => pop.toggle(a.id, e.currentTarget)} onDoubleClick={() => onOpen?.(a)}>
        <span className="jt-tile-ico"><Glyph name={a.icon} />
          {a.mode && <span className="jt-badge mode"><Glyph name={a.mode} size={10} /></span>}
          {a.undated && <span className="jt-badge tbd"><Glyph name="clock" size={10} /></span>}
        </span>
        <span className="jt-tile-name">{a.title}</span>
      </button>
    );
  }
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

function Panel({ a, model, onOpen, openLabel, pop = null }) {
  if (pop) {
    if (!a) return null;
    return (
      <div className="jt-panel jt-pop" id={pop.id} role="dialog" aria-modal="false" aria-labelledby={`${pop.id}-t`} tabIndex={-1} ref={pop.ref}
        style={pop.at ? { top: `${pop.at.top}px`, insetInlineStart: `${pop.at.start}px` } : undefined}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pop.close(); } }}>
        <p className="jt-eyebrow">النشاط</p>
        <h4 id={`${pop.id}-t`}>{a.title}</h4>
        <p className="jt-chips">
          <span>مرحلة {a.stage_title}</span><span>{a.kind_ar}</span>
          <span className={a.required ? 'jt-chip req' : 'jt-chip opt'}>{a.required ? 'إلزامي' : 'اختياري'}</span>
          {a.mode_ar && <span>{a.mode_ar}</span>}{a.level_ar && <span className="jt-chip">{a.level_ar}</span>}
        </p>
        <p className={`jt-when${a.undated ? ' tbd' : ''}`}>{a.undated && <Glyph name="clock" size={14} />} {a.when_ar}</p>
        {a.outside && <p className="jt-when tbd">{model.outside_ar}</p>}
        <p className="jt-muted">{a.owner_ar}</p>
        <div className="jt-pop-acts">
          {onOpen && <button type="button" className="jt-open" onClick={() => { pop.close(false); onOpen(a); }}>{openLabel(a)}</button>}
          <button type="button" className="jt-open ghost" onClick={() => pop.close()}>أغلق</button>
        </div>
      </div>
    );
  }
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
function Grips({ k, title, editable, pointer, clicked }) {
  const bar = editable.bars?.[k];
  if (!bar) return null;
  const picked = editable.drag?.key === k && editable.drag?.kbd;
  return (
    <>
      <button type="button" className={`jt-grip${picked ? ' on' : ''}`} data-grip={k} aria-pressed={!!picked}
        aria-label={`حرّك «${title}»: Enter يلتقط، والأسهم يومًا وShift أسبوعًا، وAlt مع الأسهم للمدة، وEsc يلغي`}
        aria-describedby={editable.hintId} onKeyDown={(e) => editable.onKey?.(k, e)} onPointerDown={(e) => pointer(e, k, 'move')}
        onClick={() => { if (clicked()) editable.onToggle?.(k); }} onBlur={() => editable.onBlur?.(k)}>
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
// usage: مؤشر استخدام كل خدمة بمفتاحها («استفاد 7 من 20») من خريطة الدفعة، إن قُرئت (T2)
// add (المرحلة 4، كما في JourneyAxis): وضع إضافة ورشة بزر صريح. فيه يغطي كل شريط مرحلة ممر يُختار منه يوم بالمؤشر أو بالأسهم،
// والنقرة تسلّم المرحلة واليوم للمضيف (add.onPick). لا يجتمع مع السحب (editable)، وعلى الحاسوب وحده كاللوحة نفسها
// pop (المرحلة 19): بلاطات بأسمائها وتفاصيل ملاصقة للبلاطة (ودرج سفلي على الهاتف) بدل اللوحة الثابتة؛ لمحرر الرحلة وحده،
// فتبقى لوحة الدفعة كما اعتُمدت (تبدأ بأول نشاط ينقصه موعد)
export default function JourneyTimeline({ model, onOpen, openLabel = () => 'فتح', onEmpty, onStage, id = 'jt', omitCards = [], editable = null, usage = null, add = null, pop: popMode = false }) {
  const [sel, setSel] = useState(popMode ? null : model?.selected || null);
  // الإطار المتمرر: الحافتان (هل بقي ما يُمرر نحو البداية أو النهاية) وموضع التفاصيل الملاصقة للبلاطة
  const scrollRef = useRef(null);
  const deskRef = useRef(null);
  const secRef = useRef(null);
  const popRef = useRef(null);
  const tileRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const [popAt, setPopAt] = useState(null);
  // اليوم تحت المؤشر أو المختار بالأسهم على شريط مرحلة في وضع الإضافة: { key, info, kbd, band }
  const [addPick, setAddPick] = useState(null);
  const adding = !!add?.on && !editable;
  useEffect(() => { if (!adding) setAddPick(null); }, [adding]);
  const trackRef = useRef(null);
  const press = useRef(null);
  // نقرة تأتي بعد سحب بالمؤشر على المقبض ليست التقاطًا بلوحة المفاتيح
  const dragged = useRef(false);
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
  // الحافتان: التدرج وزرا التمرير يظهران حيث بقي ما يُمرر. scrollLeft في RTL سالب، فالمقياس قيمته المطلقة
  const readEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const x = Math.abs(el.scrollLeft);
    setEdges((o) => { const n = { start: max > 1 && x > 1, end: max > 1 && x < max - 1 }; return o.start === n.start && o.end === n.end ? o : n; });
  };
  // موضع التفاصيل على الشاشة العريضة: تحت البلاطة ولا تخرج عن عرض .jt-desk. التفاصيل ابنة القسم (.jt) لا .jt-desk،
  // فتبقى ظاهرة على الهاتف حيث .jt-desk مخفي، وتصير هناك درجًا سفليًا بـCSS (الموضع المحسوب يُتجاهل)
  const placePop = () => {
    const t = tileRef.current, d = deskRef.current, sc = secRef.current;
    if (!t || !d || !sc || !t.isConnected || !d.offsetWidth) return;
    const tr = t.getBoundingClientRect(), dr = d.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const w = Math.min(320, dr.width);
    const rtl = getComputedStyle(d).direction === 'rtl';
    const fromStart = rtl ? dr.right - tr.right : tr.left - dr.left;
    const deskStart = (rtl ? sr.right - dr.right : dr.left - sr.left) - sc.clientLeft;
    setPopAt({ top: Math.round(tr.bottom - sr.top - sc.clientTop + 8), start: Math.round(deskStart + Math.max(0, Math.min(fromStart, dr.width - w))) });
  };
  // عند الفتح: المرحلة الحالية إلى داخل الإطار (الجارية في الدفعة، وأول مراحل التأهيل في البرنامج)، بتمرير الإطار وحده لا الصفحة
  const firstKey = model && !model.empty ? (model.stages.find((x) => x.status === 'active') || model.stages.find((x) => x.phase === 'qualification'))?.key : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const bar = firstKey && el.querySelector(`[data-stage="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(firstKey) : firstKey}"]`);
    if (bar && el.scrollWidth > el.clientWidth) {
      const er = el.getBoundingClientRect(), br = bar.getBoundingClientRect();
      if (br.left < er.left || br.right > er.right) {
        const rtl = getComputedStyle(el).direction === 'rtl';
        el.scrollLeft += rtl ? br.right - er.right + 24 : br.left - er.left - 24;
      }
    }
    readEdges();
    return undefined;
  }, [firstKey]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    readEdges();
    const on = () => {
      readEdges();
      if (!(popMode && sel)) return;
      // البلاطة خرجت من الإطار: تُغلق التفاصيل بلا إعادة تركيز، فلا تشير إلى بلاطة غير ظاهرة
      const t = tileRef.current;
      if (t && t.isConnected && el.offsetWidth && el.contains(t)) {
        const tr = t.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (tr.right <= er.left || tr.left >= er.right) { setSel(null); return; }
      }
      placePop();
    };
    el.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { el.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [popMode, sel, model]);
  // التفاصيل الملاصقة: يأخذها التركيز عند الفتح، وEsc أو «أغلق» أو النقر خارجها يغلقها ويعيد التركيز إلى البلاطة
  useLayoutEffect(() => {
    if (!popMode || !sel) return undefined;
    placePop();
    popRef.current?.focus({ preventScroll: true });
    const out = (e) => { if (!popRef.current?.contains(e.target) && !tileRef.current?.contains(e.target)) setSel(null); };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [popMode, sel]);
  const nudge = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };
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
  const current = acts.get(sel) || (popMode ? null : acts.get(model.selected)) || null;
  const cohort = model.context === 'cohort';
  const pick = (k) => setSel(k);
  const pop = popMode ? {
    id: `${id}-pop`, ref: popRef, at: popAt,
    toggle: (k, el) => { tileRef.current = el; setSel((o) => (o === k ? null : k)); },
    close: (refocus = true) => { const t = tileRef.current; setSel(null); if (refocus) t?.focus(); },
  } : null;
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
    dragged.current = false;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* المتصفح بلا التقاط: يكفي التتبع */ }
    press.current = { k, kind, x: e.clientX, y: e.clientY, p0: pctOf(e.clientX), on: false, id: e.pointerId, grip: !!e.currentTarget.closest?.('.jt-grip') };
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
    if (p.on) { dragged.current = p.grip; editable.onEnd?.({ pct: pctOf(e.clientX) - p.p0, over: overAt(e.clientX, e.clientY, p.k) }); }
    else if (p.kind === 'move') e.target?.closest?.('.jt-grip')?.focus?.();
  };
  const onPointerCancel = () => { if (press.current?.on) editable.onCancel?.(); press.current = null; };
  // لوحة المفاتيح: المضيف يلتقط ويحرك، وهنا يُقاس صف الشريط للشبح
  const kbdBand = editable?.drag?.kbd ? editable.drag.key : null;
  const ghost = editable?.drag?.ghost || null;
  const bandNow = band && editable?.drag && !editable.drag.kbd ? band : null;
  const clicked = () => { const was = dragged.current; dragged.current = false; return !was; };
  // ── وضع الإضافة: ممر فوق كل شريط، يومه من نسبة المؤشر على المسار (pctOf نفسها التي يقيس بها السحب) ──
  const addKbd = (k) => (addPick?.key === k ? addPick.info : add.day(add.startDay(k), k));
  const addKey = (k, e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); add.onToggle(); return; }
    const [lo, hi] = add.range(k);
    const cur = addKbd(k).day;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const later = rtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
      next = cur + (later ? 1 : -1) * (e.shiftKey ? 7 : 1);
    } else if (e.key === 'Home') next = lo;
    else if (e.key === 'End') next = hi;
    if (next == null) return;
    e.preventDefault();
    setAddPick({ key: k, info: add.day(next, k), kbd: true, band: measure(k) });
  };
  const addLane = (k, title) => (adding ? (
    <button type="button" className={`jt-add-lane${add.can?.[k] ? '' : ' off'}`} data-add-lane={k}
      aria-label={`${add.can?.[k] ? 'أضف ورشة في' : 'لا نشاط حضور في'} «${title}»${addPick?.key === k ? `، ${addPick.info.label}` : ''}. الأسهم تغيّر اليوم، ومفتاح Enter يفتح النموذج`}
      onPointerMove={(e) => setAddPick({ key: k, info: add.dayAt(pctOf(e.clientX), k), band: measure(k) })}
      onPointerLeave={() => setAddPick((h) => (h?.kbd ? h : null))}
      onFocus={() => setAddPick((h) => (h?.key === k ? h : { key: k, info: add.day(add.startDay(k), k), kbd: true, band: measure(k) }))}
      onBlur={() => setAddPick((h) => (h?.key === k ? null : h))}
      onKeyDown={(e) => addKey(k, e)}
      onClick={(e) => add.onPick(k, e.detail > 0 && (e.clientX || e.clientY) ? add.dayAt(pctOf(e.clientX), k) : addKbd(k))} />
  ) : null);
  const grips = (k, title) => (editable ? <Grips k={k} title={title} editable={editable} pointer={pointer} clicked={clicked} /> : null);
  // جسم الشريط بالفأرة والقلم وحدهما: اللمس عليه يمرر الخط، ويُسحب باللمس من المقبض والطرف
  const barDrag = (k) => (editable?.bars?.[k] ? { onPointerDown: (e) => { if (e.pointerType !== 'touch' && !e.target.closest('button,a,input,select,.jt-edge')) pointer(e, k, 'move'); } } : {});
  // الممر داخل خانة «تسير معًا» وشريط المسار المستمر: موضعهما وعرضهما من المقياس، ولا ينزل العرض عن حد العمود المقروء ولا يخرج
  // من حاويه (كان الممر القصير شريحة يُقص نصها حرفًا حرفًا). والمسار كله يتسع حتى تبلغ أضيق خانة حدها (boardMinWidth)
  const laneBox = (at, width) => ({ marginInlineStart: `min(${at}%, calc(100% - ${BOARD_COL_MIN}px))`, width: `max(${width}%, ${BOARD_COL_MIN}px)` });
  const trackBox = (at, width) => ({ insetInlineStart: `min(${at}%, calc(100% - ${BOARD_COL_MIN}px))`, width: `max(${width}%, ${BOARD_COL_MIN}px)` });
  const lane = (s) => (
    <div key={s.key} data-stage={s.key} {...barDrag(s.key)} className={`jt-stage${editable?.bars?.[s.key] ? ' drag' : ''}${editable?.drag?.key === s.key ? ' dragging' : ''} ph-${s.phase}${s.status ? ` st-${s.status}` : ''}${s.together ? ' lane' : ''}${s.mode_ar ? ` nonreq md-${s.mode}` : ''}`}
      style={s.together ? laneBox(s.lane_at, Math.min(s.lane_width, 100 - s.lane_at)) : undefined}>
      {grips(s.key, s.title)}
      {addLane(s.key, s.title)}
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
          : s.activities.map((k) => <Act key={k} a={acts.get(k)} sel={current?.id === k} onPick={pick} onOpen={onOpen} pop={pop} />)}
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
  // الخدمة (T2، ب5.2): صف «الخدمات» بلا مقياس، لكل خدمة بطاقة بإتاحتها وحد جلساتها ومؤشر استخدامها، لا شريط ولا تاريخ
  const services = model.services || [];
  const serviceSub = (s) => [s.avail_ar, s.max_ar, usage?.[s.key]].filter(Boolean).join('، ');
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
    <section ref={secRef} className={`jt ctx-${model.context}${pop ? ' jt-popmode' : ''}${editable ? ' jt-editable' : ''}${dragging ? ' jt-dragging' : ''}${adding ? ' jt-adding' : ''}`} aria-labelledby={head}
      onKeyDown={adding ? (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); add.onToggle(); } } : undefined}>
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
      <div className="jt-desk" ref={deskRef}>
        {add && !editable && (
          <div className="jt-addbar">
            <button type="button" className={`jt-add${adding ? ' on' : ''}`} aria-pressed={adding} data-testid="jt-add" onClick={add.onToggle}>
              {adding ? 'أنهِ الإضافة' : <><span aria-hidden="true">+ </span>ورشة على الخط</>}
            </button>
            {adding && <span className="jt-add-hint" role="note">اختر يومًا على شريط المرحلة: النقرة تفتح نموذج الورشة بمرحلتها وتاريخها، ولا يُحفظ شيء قبل تأكيدك. بلوحة المفاتيح: انتقل إلى الشريط بمفتاح Tab، وغيّر اليوم بالأسهم، وافتح النموذج بمفتاح Enter، وأنهِ بمفتاح Esc.</span>}
          </div>
        )}
        {/* الإطار المتمرر (المرحلة 19): تدرج على حافتي البداية والنهاية حيث بقي ما يُمرر، ومحاذاة للخانات، وزرا تمرير */}
        <div className={`jt-scrollbox${edges.start ? ' more-start' : ''}${edges.end ? ' more-end' : ''}`}>
        <button type="button" className="jt-nudge start" title="مرر نحو البداية" aria-disabled={!edges.start} tabIndex={edges.start ? 0 : -1} onClick={() => nudge(-1)} data-testid="jt-nudge-start">
          <span aria-hidden="true">›</span><span className="jt-sr">مرر نحو البداية</span>
        </button>
        <button type="button" className="jt-nudge end" title="مرر نحو النهاية" aria-disabled={!edges.end} tabIndex={edges.end ? 0 : -1} onClick={() => nudge(1)} data-testid="jt-nudge-end">
          <span aria-hidden="true">‹</span><span className="jt-sr">مرر نحو النهاية</span>
        </button>
        <div className="jt-scroll" ref={scrollRef} tabIndex={0} role="group" aria-label="الخط الزمني، يتحرك بالأسهم">
          <div className="jt-track" ref={trackRef} style={{ minWidth: `${boardMinWidth(model.slots)}px` }} onPointerMove={editable ? onPointerMove : undefined} onPointerUp={editable ? onPointerUp : undefined}
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
                    {...barDrag(s.key)} style={{ ...trackBox(s.at, s.width), top: `${20 + i * 106}px` }}>
                    {grips(s.key, s.title)}
                    {addLane(s.key, s.title)}
                    {trackHead(s)}
                    <div className="jt-acts">
                      {s.empty ? <span className="jt-none">لا أنشطة بعد</span>
                        : s.activities.map((k) => <Act key={k} a={acts.get(k)} sel={current?.id === k} onPick={pick} onOpen={onOpen} pop={pop} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {services.length > 0 && (
              <div className="jt-row jt-services" role="group" aria-label={model.services_ar} data-testid="jt-services">
                <span className="jt-row-label">{model.services_ar}</span>
                <ul className="jt-svc-list">
                  {services.map((s) => (
                    <li key={s.key} className={`jt-svc ph-${s.phase}`} data-service={s.key}>
                      <div className="jt-stage-head">
                        {onStage ? (
                          <button type="button" className="jt-stage-link" onClick={() => onStage(s.key)} aria-label={`${s.title}: انتقل إلى بطاقته`}><b>{s.title}</b></button>
                        ) : <b>{s.title}</b>}
                        <span className="jt-mode jt-svc-tag">{s.lane_ar}</span>
                        <small>{serviceSub(s)}</small>
                      </div>
                      <div className="jt-acts">
                        {s.empty ? <span className="jt-none">لا أنشطة بعد</span>
                          : s.activities.map((k) => <Act key={k} a={acts.get(k)} sel={current?.id === k} onPick={pick} onOpen={onOpen} pop={pop} />)}
                      </div>
                    </li>
                  ))}
                </ul>
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
            {adding && addPick?.band && (
              <div className={`jt-add-mark${add.can?.[addPick.key] ? '' : ' off'}${addPick.info.at > 60 ? ' flip' : ''}`} data-testid="jt-add-mark" aria-hidden="true"
                style={{ insetInlineStart: `${addPick.info.at}%`, top: `${addPick.band.top}px`, height: `${addPick.band.height}px` }}><i>+</i><b>{addPick.info.label}</b></div>
            )}
            {ghost && (bandNow || kbdBand) && (
              <GhostBar ghost={ghost} band={bandNow || measureNow(trackRef, kbdBand)} />
            )}
            <div className="jt-row jt-ruler">
              {model.ticks.map((t) => { const short = tickShortAr(t.label); return <span key={`${t.at}-${t.label}`} style={{ insetInlineStart: `${t.at}%` }} title={short ? t.label : undefined}>{short || t.label}</span>; })}
            </div>
          </div>
        </div>
        </div>
        {adding && <p className="sr-only" aria-live="polite">{addPick?.kbd ? `${stageBy.get(addPick.key)?.title || ''}، ${addPick.info.label}` : ''}</p>}
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
            {services.length > 0 && <li><i className="sq svc" />خدمة لمن يريد، لا تأخذ من الرحلة أيامًا</li>}
            {model.today && <li><i className="ln" />اليوم</li>}
          </ul>
          {!pop && <Panel a={current} model={model} onOpen={onOpen} openLabel={openLabel} />}
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
      {services.length > 0 && (
        <ul className="jt-phone jt-m-services" aria-label={model.services_ar}>
          {services.map((s) => (
            <li key={s.key} className={`jt-m-svc ph-${s.phase}`} data-service={s.key}>
              <p className="jt-m-title"><b>{s.title}</b><span className="jt-mode jt-svc-tag">{s.lane_ar}</span></p>
              <small>{serviceSub(s)}</small>
              <small>{s.note_ar}.</small>
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
                                {pop && (
                                  <button type="button" className={`jt-open sm ghost jt-m-more${sel === a.id ? ' on' : ''}`} data-act-m={a.id}
                                    aria-expanded={sel === a.id} aria-controls={sel === a.id ? pop.id : undefined} aria-label={`التفاصيل: ${a.title}`}
                                    onClick={(e) => pop.toggle(a.id, e.currentTarget)}>التفاصيل</button>
                                )}
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

      {/* التفاصيل الملاصقة (pop): ملاصقة للبلاطة على العريضة، ودرج سفلي على الهاتف */}
      {pop && <Panel a={current} model={model} onOpen={onOpen} openLabel={openLabel} pop={pop} />}

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
