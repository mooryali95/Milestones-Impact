// ════════════════════════════════════════════════════════════════
// واجهات مشتركة: الإشعار السريع، ونافذة التأكيد والإدخال، وسلوك كل نافذة حوارية
// ════════════════════════════════════════════════════════════════
// useUI().toast(نص) · await useUI().confirm(نص, {danger}) · await useUI().prompt(نص, قيمة)
// useEscape(إغلاق) ← Esc يغلق العليا وحدها · useGuardedClose(تغيّرت؟, إغلاق) ← إغلاق يسأل قبل أن يضيع ما كُتب
// التركيز في كل نافذة role="dialog" aria-modal="true" من useModalFocus هنا، بلا سطر في النافذة نفسها.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

// ── التركيز في النوافذ الحوارية، من مكان واحد ──
// يرصد كل نافذة aria-modal تظهر في الصفحة، فتستفيد منه كل نافذة قائمة أو قادمة:
// • عند فتحها يدخلها التركيز: أول حقل إن كان أول ما يُنتقل إليه فيها، وإلا النافذة نفسها فيُقرأ عنوانها
//   (لا يقع على زر إجراء فيُضغط سهوًا بـEnter)
// • Tab وShift+Tab يدوران داخل العليا منها، فلا يصل التركيز إلى ما خلف الغشاء
// • عند إغلاقها يعود التركيز إلى ما فتحها
// كانت نافذة التأكيد وحدها تفعل هذا، وبقية النوافذ يبقى التركيز فيها على زر الفتح خلف الغشاء.
const MODAL = '[aria-modal="true"]';
const TABBABLE = 'a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable="true"]';
const shown = (el) => el.getClientRects().length > 0;
const radioOff = (el, box) => el.type === 'radio' && !el.checked && el.name && box.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
const tabbables = (box) => [...box.querySelectorAll(TABBABLE)]
  .filter((el) => el.tabIndex >= 0 && el.type !== 'hidden' && !el.matches(':disabled') && shown(el) && !radioOff(el, box));
function enter(box) {
  const first = tabbables(box)[0];
  if (first?.matches('input,select,textarea')) first.focus();
  else box.focus();
}

function useModalFocus() {
  useEffect(() => {
    const open = [];   // { box, back } بترتيب الفتح؛ العليا آخرها
    let last = null;   // آخر ما دخله التركيز قبل الحالي: ما فتح النافذة إن سبقنا إليها حقلٌ فيها (autoFocus)
    let running = false;
    const top = () => open[open.length - 1]?.box || null;
    const sync = () => {
      if (running) return;
      running = true;
      try {
        const now = [...document.querySelectorAll(MODAL)].filter(shown);
        let lost = false;
        for (let i = open.length - 1; i >= 0; i -= 1) {
          const m = open[i];
          if (now.includes(m.box)) continue;
          open.splice(i, 1);
          const t = top();
          if (m.back?.isConnected && (!t || t.contains(m.back))) m.back.focus();
          else lost = true;
        }
        for (const box of now) {
          if (open.some((m) => m.box === box)) continue;
          const a = document.activeElement;
          const back = box.contains(a) ? (last && !box.contains(last) ? last : null) : (a && a !== document.body ? a : null);
          // قابلة للتركيز نفسها: يُقرأ عنوانها، والنقر على نص فيها لا يُسقط التركيز خارجها
          if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
          open.push({ box, back });
          if (!box.contains(a)) enter(box);
        }
        const t = top();
        if (lost && t && !t.contains(document.activeElement)) enter(t);
      } finally { running = false; }
    };
    const onFocusIn = (e) => {
      sync();   // نافذة ظهرت ودخلها التركيز قبل أن يرصدها المراقب
      const t = top();
      if (t && !t.contains(e.target)) enter(t);
      else last = e.target;
    };
    const onKey = (e) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      sync();
      const t = top();
      if (!t) return;
      const list = tabbables(t);
      const a = document.activeElement;
      if (!list.length) { e.preventDefault(); t.focus(); return; }
      const first = list[0], end = list[list.length - 1];
      if (e.shiftKey ? (a === first || a === t || !t.contains(a)) : (a === end || !t.contains(a))) {
        e.preventDefault();
        (e.shiftKey ? end : first).focus();
      }
    };
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKey);
    sync();
    return () => {
      mo.disconnect();
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}

function Dialog({ d, onDone }) {
  const [value, setValue] = useState(d.value || '');
  const field = useRef(null);
  const no = useRef(null);
  const yes = useRef(null);
  // التركيز الأول بحسب النوع: الحقل، أو «إلغاء» في الخطِر، أو «تأكيد». حبسه وعودته إلى ما فتحها من useModalFocus
  useEffect(() => {
    (field.current || (d.danger ? no.current : yes.current))?.focus();
    field.current?.select();
  }, [d]);
  const accept = () => onDone(d.input ? value : true);
  const cancel = () => onDone(d.input ? null : false);
  useEscape(cancel);
  const key = (e) => {
    if (e.key === 'Enter' && e.target !== no.current) { e.preventDefault(); accept(); }
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

  useModalFocus();

  return (
    <Ctx.Provider value={{ toast, confirm, prompt }}>
      {children}
      {dialog && <Dialog d={dialog} onDone={(v) => { dialog.resolve(v); setDialog(null); }} />}
      <div className={`toast${msg ? ' show' : ''}`} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}

// Esc يغلق آخر نافذة فُتحت وحدها: كل نافذة تسجّل إغلاقها عند فتحها، فالتأكيد فوق النموذج يُلغى ولا يُغلق النموذج تحته.
// كان الشرط «لا .mid-box في الصفحة»، فلا تُغلق بـEsc أبدًا نافذة صندوقها نفسه .mid-box (إعادة إصدار الشهادة).
// يُسجَّل مرة عند الفتح ويُقرأ آخر إغلاق من المرجع، فإعادة رسم النافذة لا تنقلها فوق ما فُتح بعدها.
const escapes = [];
const onEscape = (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || !escapes.length) return;
  e.preventDefault();
  escapes[escapes.length - 1].current?.();
};
export function useEscape(onClose, active = true) {
  const fn = useRef(onClose);
  useLayoutEffect(() => { fn.current = onClose; });
  useEffect(() => {
    if (!active) return undefined;
    if (!escapes.length) document.addEventListener('keydown', onEscape);
    escapes.push(fn);
    return () => {
      escapes.splice(escapes.lastIndexOf(fn), 1);
      if (!escapes.length) document.removeEventListener('keydown', onEscape);
    };
  }, [active]);
}

// إغلاق نافذة فيها تعديلات لم تُحفظ: Esc والنقر خارجها و«إلغاء» سواء، يُسأل قبله فلا يضيع ما كُتب سهوًا
export function useGuardedClose(dirty, onClose) {
  const { confirm } = useUI();
  return async () => {
    if (dirty && !(await confirm('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟', { danger: true, ok: 'إغلاق دون حفظ' }))) return;
    onClose();
  };
}

export const Spinner = () => <div className="spinner" aria-label="جارٍ التحميل" />;

// حالة فارغة واحدة لكل الشاشات: ماذا يظهر هنا، ولماذا هو فارغ، وما الخطوة التالية.
// كانت كل شاشة تكتب سطرها («لا نتائج») أو تترك جدولًا برؤوسه وحدها أو مساحة بيضاء.
export function Empty({ title, hint, children, compact = false }) {
  return (
    <div className={`la-blank${compact ? ' compact' : ''}`}>
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {children && <div className="la-blank-actions">{children}</div>}
    </div>
  );
}
