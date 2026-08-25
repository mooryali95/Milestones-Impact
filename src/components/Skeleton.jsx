import React from "react";

// ════════════════════════════════════════════════════════════════
// SKELETON — هيكل انتظار
// ════════════════════════════════════════════════════════════════
// يشغل مكان المحتوى القادم فلا تقفز الصفحة عند وصوله، ويُعلم
// المستخدم أن شيئاً يُحمَّل بدل صمت يبدو تعطّلاً.
//
// ملاحظة هوية: اللمعة المعتادة في هياكل الانتظار تدرّجٌ متحرك،
// والهوية تحظر التدرّجات — فالنبض هنا في العتامة لا في اللون.
// ويحترم prefers-reduced-motion عبر القاعدة العامة في global.css.

const Skeleton = ({ lines = 3, width = "100%", height = 12, gap = 8, style }) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    style={{ display: "flex", flexDirection: "column", gap, ...style }}
  >
    <span className="sr-only">جارٍ التحميل…</span>
    {Array.from({ length: lines }).map((_, i) => (
      <span
        key={i}
        aria-hidden="true"
        className="skl-line"
        style={{
          height,
          // آخر سطر أقصر — يحاكي إيقاع الفقرة الحقيقي
          width: i === lines - 1 && lines > 1 ? "62%" : width,
        }}
      />
    ))}
  </div>
);

export default Skeleton;
