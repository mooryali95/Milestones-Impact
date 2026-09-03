import React from "react";
import { RESULT } from "../lib/api";

// ════════════════════════════════════════════════════════════════
// حالةٌ مكتوبة بدل فراغٍ صامت
// ════════════════════════════════════════════════════════════════
// أربع حالاتٍ تبدو واحدةً على الشاشة إن لم تُميَّز: لا بيانات،
// وتعذّر الوصول، وليس لك صلاحية، والخادم لا يعرف هذا الإجراء بعد.
// المستشار الذي يرى فراغاً يستنتج «لا طلبات» في الحالات الأربع.
//
// وهذا يهمّ هنا أكثر من غيره: اللوحة تسبق الخادم — أُنجزت الواجهة
// قبل أن تُنفَّذ إجراءات admin-api — فحالة «لم يُنفَّذ بعد» ستُرى
// فعلاً، ولا يجوز أن تُقرأ «لا يوجد شيء».

export default function StateNotice({ state, message, onRetry, emptyTitle, emptyBody }) {
  if (state === RESULT.OK) {
    return (
      <div className="empty">
        <h3>{emptyTitle || "لا شيء بعد"}</h3>
        <p>{emptyBody || "لم يصل أي سجلّ في هذا المصدر."}</p>
      </div>
    );
  }

  if (state === RESULT.UNSUPPORTED) {
    return (
      <div className="notice notice-wait">
        <h3>هذا المصدر لم يُفعَّل في الخادم بعد</h3>
        <p>
          الواجهة جاهزة، وينقص إجراءٌ في <strong>admin-api</strong>. الخطوات في
          <strong> server/admin-api-contract.md</strong> — ولا شيء ينكسر حتى تُنفَّذ.
        </p>
        {message && <p className="notice-detail">{message}</p>}
      </div>
    );
  }

  if (state === RESULT.DENIED) {
    return (
      <div className="notice notice-deny">
        <h3>لا تملك صلاحية على هذا المصدر</h3>
        <p>{message || "اطلب من صاحب إدارة الوصول أن يمنحك إذن العرض."}</p>
      </div>
    );
  }

  return (
    <div className="notice notice-err">
      <h3>تعذّر جلب البيانات</h3>
      <p>{message || "لم يصل ردٌّ مفهوم من الخادم."}</p>
      {onRetry && <button className="btn btn-s btn-outline" style={{ marginTop: ".6rem", width: "auto" }} onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}
