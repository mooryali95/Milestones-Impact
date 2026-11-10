// ════════════════════════════════════════════════════════════════
// واجهات مشتركة: الإشعار السريع، ونافذة التأكيد والإدخال
// ════════════════════════════════════════════════════════════════
// useUI().toast(نص) · await useUI().confirm(نص, {danger}) · await useUI().prompt(نص, قيمة)
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

function Dialog({ d, onDone }) {
  const [value, setValue] = useState(d.value || '');
  const field = useRef(null);
  const no = useRef(null);
  const yes = useRef(null);
  useEffect(() => {
    const back = document.activeElement;
    (field.current || (d.danger ? no.current : yes.current))?.focus();
    field.current?.select();
    return () => back?.focus?.();
  }, [d]);
  const accept = () => onDone(d.input ? value : true);
  const cancel = () => onDone(d.input ? null : false);
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter' && e.target !== no.current) { e.preventDefault(); accept(); }
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && cancel()} onKeyDown={key}>
      <div className="mid-box" role={d.input ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="mid-msg">
        <p className="mid-msg" id="mid-msg">{d.msg}</p>
        {d.input && <input ref={field} className="mid-in" value={value} onChange={(e) => setValue(e.target.value)} />}
        <div className="mid-act">
          <button ref={yes} className={`mid-btn ${d.danger ? 'danger' : 'ok'}`} onClick={accept}>{d.ok || 'تأكيد'}</button>
          <button ref={no} className="mid-btn" onClick={cancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

export function UIProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [dialog, setDialog] = useState(null);
  const timer = useRef(null);

  const toast = useCallback((m) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2500);
  }, []);
  const ask = useCallback((d) => new Promise((resolve) => setDialog({ ...d, resolve })), []);
  const confirm = useCallback((m, o = {}) => ask({ msg: m, ...o }), [ask]);
  const prompt = useCallback((m, value = '', o = {}) => ask({ msg: m, value, input: true, ...o }), [ask]);

  return (
    <Ctx.Provider value={{ toast, confirm, prompt }}>
      {children}
      {dialog && <Dialog d={dialog} onDone={(v) => { dialog.resolve(v); setDialog(null); }} />}
      <div className={`toast${msg ? ' show' : ''}`} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}

// يغلق النافذة بـ Esc ما لم تكن نافذة تأكيد (.mid-box) مفتوحة فوقها
export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (e.key === 'Escape' && !document.querySelector('.mid-box')) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, active]);
}

export const Spinner = () => <div className="spinner" aria-label="جارٍ التحميل" />;

// حالة فارغة واحدة لكل الشاشات: ماذا يظهر هنا، ولماذا هو فارغ، وما الخطوة التالية.
// كانت كل شاشة تكتب سطرها («لا نتائج») أو تترك جدولًا برؤوسه وحدها أو مساحة بيضاء.
export function Empty({ title, hint, children, compact = false }) {
  return (
    <div className={`la-blank${compact ? ' compact' : ''}`} role="status">
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {children && <div className="la-blank-actions">{children}</div>}
    </div>
  );
}
