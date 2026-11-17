// ════════════════════════════════════════════════════════════════
// «المساعد الذكي»: مكونات العرض المشتركة بين تبويباته الثلاثة (المفتاح، وصف المؤشرات، وهيكل التحميل)
// ════════════════════════════════════════════════════════════════
// شكل واحد في التبويبات كلها: مفتاح تبديل بدور switch واسم من نصه المرئي وشارة حاله، وصف مؤشرات واحد، وهيكل تحميل
// بشكل المحتوى. السلوك والطلبات عند كل شاشة كما هي، وهذه للعرض وحده.
import React from 'react';

// مفتاح التبديل: زر بدور switch وaria-checked، واسمه النص المرئي بجانبه (والنقر عليه يبدل كالزر)، وشارة «مفعّل/متوقف»
// ملاصقة للاسم في سطره (تنزل تحته في الضيق)، فتقرأ العين المفتاح واسمه وحاله معًا
export function Switch({ id, checked, onChange, disabled = false, label, describedBy, on = 'مفعّل', off = 'متوقف', chip = true, hint = null }) {
  return (
    <div className={`ai-sw-row${checked ? ' is-on' : ''}${disabled ? ' is-off' : ''}`}>
      <button type="button" role="switch" id={id} className="ai-sw" aria-checked={!!checked} aria-labelledby={`${id}-l`} aria-describedby={describedBy}
        disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="ai-sw-knob" aria-hidden="true" />
      </button>
      <span className="ai-sw-text">
        <span className="ai-sw-line">
          <label htmlFor={id} id={`${id}-l`} className="ai-sw-label">{label}</label>
          {chip && <span className={`ai-chip ${checked ? 'on' : 'off'}`}>{checked ? on : off}</span>}
        </span>
        {hint}
      </span>
    </div>
  );
}

// صف المؤشرات في أول كل تبويب: القيمة الغائبة لا تُرسم (لا «غير مقروء» ولا شرطة مكانها). الاسم على مجموعة تلف
// القائمة، لأن dl لا دور له يقبل الاسم
export function Kpis({ label, items }) {
  const shown = items.filter((x) => x && x.value != null && x.value !== '');
  if (!shown.length) return null;
  return (
    <div role="group" aria-label={label} className="ai-kpis-g"><dl className="ai-kpis">
      {shown.map((x) => (
        <div key={x.label} className={`ai-kpi${x.tone ? ` ${x.tone}` : ''}`}>
          <dt>{x.label}</dt>
          <dd><b>{x.value}</b>{x.sub && <small>{x.sub}</small>}</dd>
        </div>
      ))}
    </dl></div>
  );
}

// هيكل التحميل بشكل التبويب: صف مؤشرات ثم بطاقات، بلا حركة لمن طلب تقليلها
export function AiSkeleton({ cards = 2 }) {
  return (
    <div className="ai-skel" aria-busy="true">
      <span className="sr-only">جارٍ التحميل</span>
      <div className="ai-skel-kpis" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="ai-skel-kpi"><i className="w50" /><i className="w70 big" /></div>)}</div>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="ai-skel-card" aria-hidden="true"><i className="w40" /><i className="w90" /><i className="w70" /></div>
      ))}
    </div>
  );
}

// صيغة واحدة للمال والنسبة في التبويبات الثلاثة والرأس: «1.20 دولار» و«24٪»، فلا تنقلب علامة $ داخل النص العربي
export const dollars = (n) => `${Number(n || 0).toFixed(2)} دولار`;
export const dollarsOf = (a, b) => `${Number(a || 0).toFixed(2)} من ${Number(b || 0).toFixed(2)} دولار`;
// اسم واحد لحال التوجيه والإرشاد في الرأس والمؤشرات وتبويب الإتاحة: نتيجة البوابة
export const guideWord = (open) => (open ? 'مفتوح للتجربة' : 'مغلق');

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
