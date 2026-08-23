import React from "react";

// ════════════════════════════════════════════════════════════════
// ICON — مجموعة الأيقونات الرسمية من حزمة الهوية
// ════════════════════════════════════════════════════════════════
// المصدر: 03_ELEMENTS/icons/svg-transparent — مسارات منقولة حرفياً.
// التعديل الوحيد: اللون الثابت #A97A2E صار currentColor ليتكيّف مع
// السياق؛ الحزمة نفسها تشحن أربع درجات لونية للغرض ذاته.
//
// خمس من هذه الأيقونات هي سلسلة الأثر في الهوية:
//   decision ← process ← output ← outcome ← impact
//
// الهوية تحظر الإيموجي؛ هذه بديلها المعتمد.

const PATHS = {
  decision: <><path d="M60 34 L86 60 L60 86 L34 60 Z" fill="none" stroke="currentColor" strokeWidth="2.2" opacity="1"/><path d="M60 50 L70 60 L60 70 L50 60 Z" fill="currentColor" opacity="1"/></>,
  process: <><path d="M28 60 H92" stroke="currentColor" strokeWidth="2.2"/><path d="M28 52 L36 60 L28 68 L20 60 Z" fill="none" stroke="currentColor" strokeWidth="2" opacity="1"/><path d="M60 52 L68 60 L60 68 L52 60 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" opacity="1"/><path d="M92 52 L100 60 L92 68 L84 60 Z" fill="none" stroke="currentColor" strokeWidth="2" opacity="1"/></>,
  output: <><rect x="30" y="34" width="60" height="52" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M60 48 L72 60 L60 72 L48 60 Z" fill="currentColor" opacity="1"/></>,
  outcome: <><circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M60 47 L73 60 L60 73 L47 60 Z" fill="currentColor" opacity="1"/></>,
  impact: <><circle cx="60" cy="60" r="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeOpacity="1.0"/><circle cx="60" cy="60" r="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.78"/><circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.56"/><path d="M60 53 L67 60 L60 67 L53 60 Z" fill="currentColor" opacity="1"/></>,
  milestone: <><path d="M60 92 V34" stroke="currentColor" strokeWidth="2.2"/><path d="M60 22 L72 34 L60 46 L48 34 Z" fill="currentColor" opacity="1"/></>,
  governance: <><path d="M60 28 L88 42 V64 C88 80 60 92 60 92 C60 92 32 80 32 64 V42 Z" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M60 50 L70 60 L60 70 L50 60 Z" fill="currentColor" opacity="1"/></>,
  alignment: <><path d="M30 44 H90 M30 76 H90" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.6"/><path d="M60 35 L69 44 L60 53 L51 44 Z" fill="currentColor" opacity="1"/><path d="M60 67 L69 76 L60 85 L51 76 Z" fill="none" stroke="currentColor" strokeWidth="2" opacity="1"/></>,
  growth: <><path d="M28 88 L48 66 L68 78 L92 40" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M92 32 L100 40 L92 48 L84 40 Z" fill="currentColor" opacity="1"/></>,
  insight: <><path d="M60 60 L94.0 60.0" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L84.04163056034261 84.04163056034261" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L60.0 94.0" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L35.95836943965739 84.04163056034261" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L26.0 60.00000000000001" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L35.958369439657375 35.95836943965739" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L59.99999999999999 26.0" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 60 L84.04163056034261 35.958369439657375" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.7"/><path d="M60 48 L72 60 L60 72 L48 60 Z" fill="currentColor" opacity="1"/></>,
  report: <><rect x="34" y="30" width="52" height="60" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M46 50 H74 M46 62 H74 M46 74 H62" stroke="currentColor" strokeWidth="1.6"/></>,
  value: <><path d="M34 46 H86 L60 92 Z" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M60 35 L71 46 L60 57 L49 46 Z" fill="currentColor" opacity="1"/></>,
};

const LABELS = {
  decision: "قرار",
  process: "عملية",
  output: "مخرج",
  outcome: "نتيجة",
  impact: "أثر",
  milestone: "معلَم",
  governance: "حوكمة",
  alignment: "مواءمة",
  growth: "نمو",
  insight: "استبصار",
  report: "تقرير",
  value: "قيمة",
};

/**
 * أيقونة رسمية.
 * @param name  اسم المفهوم — decision · process · output · outcome · impact · milestone · governance · alignment · growth · insight · report · value
 * @param size  الحجم بالبكسل (افتراضي 20)
 * @param label نص بديل لقارئ الشاشة؛ مرّر null للأيقونات الزخرفية
 */
const Icon = ({ name, size = 20, label, className, style }) => {
  const path = PATHS[name];
  if (!path) return null;
  const alt = label === undefined ? LABELS[name] : label;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flex: "none", ...style }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : "true"}
      focusable="false"
    >
      {path}
    </svg>
  );
};

export default Icon;
