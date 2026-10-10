import React from "react";
import wordmark from "../assets/brand/milestone-impact.svg";
import wordmarkInverted from "../assets/brand/milestone-impact-inverted.svg";

// ════════════════════════════════════════════════════════════════
// WORDMARK — الشعار الكامل
// ════════════════════════════════════════════════════════════════
// العلامة الكلمية الرسمية: «Milestone» فوق «impact»، والمعيّن الذهبي
// في الجيب بينهما. هذا هو توقيع العلامة — لا المعيّن وحده.
//
// المعيّن وحده أيقونة (MILogo)، ويُستعمل فقط حيث لا يتّسع الشعار:
// الموجز يحدّد الحد الأدنى للشعار المركّب بـ 120px على الشاشة،
// وللمعيّن 24px.
//
// النسختان (من الحزمة الرسمية):
//   primary  → نص بترولي + معيّن ذهبي — للأرضيات الفاتحة
//   inverted → نص ضبابي + معيّن ذهبي — للأرضيات الداكنة
//
// قواعد لا تُخالَف: لا يُمطّ ولا يُدوَّر ولا يُحاط بإطار، ولا يُضاف
// له ظل أو توهّج، ولا يُعاد تلوين المعيّن، ولا يُفصل عن الجيب.

const MIN_WIDTH = 120;   // الحد الأدنى المعتمد للشعار المركّب

const Wordmark = ({
  width = 200,
  variant = "primary",
  className,
  style,
  alt = "Milestone Impact",
}) => {
  const src = variant === "inverted" ? wordmarkInverted : wordmark;
  const w = Math.max(width, MIN_WIDTH);

  // import.meta.env.DEV لا process.env — الأخير غير معرَّف في Vite،
  // فيرمي ReferenceError في المتصفح بدل أن يحذفه البناء.
  if (import.meta.env.DEV && width < MIN_WIDTH) {
    console.warn(
      `Wordmark: العرض ${width}px دون الحد الأدنى ${MIN_WIDTH}px — ` +
      `استعمل MILogo (المعيّن) في المساحات الضيقة.`
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={w}
      height={Math.round((w * 1454) / 3200)}   // نسبة viewBox الأصلية
      className={className}
      // display:block يُسقط text-align:center عن الأب، فيلتصق الشعار
      // بحافة البداية (اليمين في RTL) بينما النص تحته في الوسط.
      // الهامش التلقائي يوسّطه؛ ومن أراد غير ذلك مرّر style.
      style={{ display: "block", height: "auto", marginInline: "auto", ...style }}
      draggable="false"
    />
  );
};

export default Wordmark;
