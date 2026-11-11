import React, { useRef } from "react";
import { useDialog } from "../lib/a11y";

// ════════════════════════════════════════════════════════════════
// CONFIRM DIALOG — حوار التأكيد
// ════════════════════════════════════════════════════════════════

const ConfirmDialog = (p) => {
  const {
    confirmAction,
    setConfirmAction,
  } = p;

  const box = useRef(null);
  useDialog(box, () => setConfirmAction(null));
  // التركيز الأول على الخيار الأسلم: «إلغاء» أمام فعل لا رجعة فيه، والتأكيد أمام عرض نافع
  const primary = confirmAction.tone === "primary";
  return (
      <div className="confirm-overlay" onClick={()=>setConfirmAction(null)}>
        <div ref={box} className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" tabIndex={-1} onClick={e=>e.stopPropagation()}>
          <h3 id="confirm-title">{confirmAction.title}</h3>
          <p id="confirm-msg">{confirmAction.message}</p>
          <div className="confirm-btns">
            <button className={`btn ${primary ? "" : "btn-danger"}`} data-autofocus={primary || undefined} onClick={confirmAction.onConfirm}>{confirmAction.confirmLabel || "نعم، متأكد"}</button>
            <button className="btn btn-outline" data-autofocus={!primary || undefined} onClick={()=>setConfirmAction(null)}>{confirmAction.cancelLabel || "إلغاء"}</button>
          </div>
        </div>
      </div>
  );
};

export default ConfirmDialog;
