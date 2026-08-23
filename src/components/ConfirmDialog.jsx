import React from "react";

// ════════════════════════════════════════════════════════════════
// CONFIRM DIALOG — حوار التأكيد
// ════════════════════════════════════════════════════════════════

const ConfirmDialog = (p) => {
  const {
    confirmAction,
    setConfirmAction,
  } = p;

  return (
      <div className="confirm-overlay" onClick={()=>setConfirmAction(null)}>
        <div className="confirm-box" onClick={e=>e.stopPropagation()}>
          <h3>{confirmAction.title}</h3>
          <p>{confirmAction.message}</p>
          <div className="confirm-btns">
            <button className="btn btn-danger" onClick={confirmAction.onConfirm}>نعم، متأكد</button>
            <button className="btn btn-outline" onClick={()=>setConfirmAction(null)}>إلغاء</button>
          </div>
        </div>
      </div>
  );
};

export default ConfirmDialog;
