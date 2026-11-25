// ════════════════════════════════════════════════════════════════
// تلميح المصطلح: كل مصطلح من مسرد المبادرة يُعرَّف في موضعه (anatomy.json، مصدر واحد)
// ════════════════════════════════════════════════════════════════
// يظهر بالمرور وبالتركيز وباللمس (الحقل قابل للتركيز)، ويُعلَّم أول ظهور للمصطلح في النص وحده فلا يزدحم.
// الفقاعة خارج الاسم الذي يقرؤه قارئ الشاشة للحقل (aria-hidden)، ويصله التعريف وصفًا (aria-describedby)،
// فلا يتغير اسم الحقل ولا الجدول الذي تبحث به الاختبارات وأدوات الوصول.
import React, { createContext, useContext, useId, useRef, useState } from 'react';
import { annotate } from '../../supabase/content/initiative-guide/v1/anatomy.js';
import { SLICES } from '../../supabase/functions/leaders-api/track-manifest.js';

// مستويات المشارك في الأطر الثلاثة (من trackManifest): المصطلح الذي له أعماق في slices.json يُعرَّف بعمق مستواه في إطاره،
// فالتأسيسي يرى تعريفًا مبسطًا، والمتوسط مثالًا، والاحترافي المعيار. بلا مستويات: تعريف المسرد العام (anatomy.json)
export const TermLevels = createContext(null);
const DEEP = Object.entries(SLICES.frameworks).flatMap(([d, f]) => (f.terms || []).map((t) => ({ ...t, dimension: d })));
export function deepDef(g, levels) {
  if (!levels) return null;
  const names = [g.term, ...(g.aka || [])];
  const t = DEEP.find((x) => names.includes(x.term));
  const lv = t && levels[t.dimension];
  return (lv && (t[lv] || (lv === 'advanced' ? t.intermediate || t.beginner : t.beginner))) || null;
}

// الفقاعة بموضع ثابت على الشاشة تحت المصطلح: الجداول داخل حاوية تمرير تقص ما يخرج منها لو كانت مطلقة الموضع
export function Term({ g, children }) {
  const id = useId();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(300, window.innerWidth * 0.8);
    // تبدأ من الحافة اليمنى للمصطلح (الواجهة عربية)، ولا تخرج من الشاشة
    const right = Math.min(Math.max(8, window.innerWidth - r.right), window.innerWidth - w - 8);
    const below = r.bottom + 6 + 120 < window.innerHeight;
    setPos(below ? { top: r.bottom + 6, right, width: w } : { bottom: window.innerHeight - r.top + 6, right, width: w });
  };
  const hide = () => setPos(null);
  const def = deepDef(g, useContext(TermLevels)) || g.def;
  return (
    <span ref={ref} className={`term${pos ? ' on' : ''}`} tabIndex={0} aria-describedby={id} data-term={g.term}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}>
      {children}
      <span className="term-tip" id={id} role="tooltip" aria-hidden="true" style={pos || undefined}><b>{g.term}</b>{def}</span>
    </span>
  );
}

/** نص بمصطلحاته معرّفة في موضعها */
export function Annotated({ text }) {
  const parts = annotate(text);
  if (parts.length === 1 && !parts[0].term) return <>{text}</>;
  return <>{parts.map((p, i) => (p.term ? <Term key={i} g={p.term}>{p.text}</Term> : <React.Fragment key={i}>{p.text}</React.Fragment>))}</>;
}
