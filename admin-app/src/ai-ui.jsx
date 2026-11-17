// ════════════════════════════════════════════════════════════════
// «المساعد الذكي»: مكونات العرض المشتركة بين تبويباته الثلاثة (المفتاح، وصف المؤشرات، وهيكل التحميل)
// ════════════════════════════════════════════════════════════════
// شكل واحد في التبويبات كلها: مفتاح تبديل بدور switch واسم من نصه المرئي وشارة حاله، وصف مؤشرات واحد، وهيكل تحميل
// بشكل المحتوى. السلوك والطلبات عند كل شاشة كما هي، وهذه للعرض وحده.
import React from 'react';

// مفتاح التبديل: زر بدور switch وaria-checked، واسمه النص المرئي بجانبه (والنقر عليه يبدل كالزر)، وشارة «مفعّل/متوقف»
export function Switch({ id, checked, onChange, disabled = false, label, describedBy, on = 'مفعّل', off = 'متوقف', chip = true, hint = null }) {
  return (
    <div className={`ai-sw-row${checked ? ' is-on' : ''}${disabled ? ' is-off' : ''}`}>
      <button type="button" role="switch" id={id} className="ai-sw" aria-checked={!!checked} aria-labelledby={`${id}-l`} aria-describedby={describedBy}
        disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="ai-sw-knob" aria-hidden="true" />
      </button>
      <span className="ai-sw-text">
        <label htmlFor={id} id={`${id}-l`} className="ai-sw-label">{label}</label>
        {hint}
      </span>
      {chip && <span className={`ai-chip ${checked ? 'on' : 'off'}`}>{checked ? on : off}</span>}
    </div>
  );
}

// صف المؤشرات في أول كل تبويب: القيمة الغائبة لا تُرسم (لا «غير مقروء» ولا شرطة مكانها)
export function Kpis({ label, items }) {
  const shown = items.filter((x) => x && x.value != null && x.value !== '');
  if (!shown.length) return null;
  return (
    <dl className="ai-kpis" aria-label={label}>
      {shown.map((x) => (
        <div key={x.label} className={`ai-kpi${x.tone ? ` ${x.tone}` : ''}`}>
          <dt>{x.label}</dt>
          <dd><b>{x.value}</b>{x.sub && <small>{x.sub}</small>}</dd>
        </div>
      ))}
    </dl>
  );
}

// هيكل التحميل بشكل التبويب: صف مؤشرات ثم بطاقات، بلا حركة لمن طلب تقليلها
export function AiSkeleton({ cards = 2 }) {
  return (
    <div className="ai-skel" aria-busy="true">
      <span className="sr-only">جارٍ التحميل</span>
      <div className="ai-skel-kpis" aria-hidden="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="ai-skel-card" aria-hidden="true"><i className="w40" /><i className="w90" /><i className="w70" /></div>
      ))}
    </div>
  );
}

// وصف التبويب في أوله: سطر واحد، وشارة «عرض فقط» لمن لا يكتب
export function TabIntro({ text, readOnly = false, children }) {
  return (
    <div className="ag-head ai-intro">
      <p className="ai-intro-text">{text}</p>
      {readOnly && <span className="la-chip">عرض فقط</span>}
      {children}
    </div>
  );
}
