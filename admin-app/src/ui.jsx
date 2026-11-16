// ════════════════════════════════════════════════════════════════
// واجهات مشتركة: الإشعار السريع، ونافذة التأكيد والإدخال، وسلوك كل نافذة حوارية
// ════════════════════════════════════════════════════════════════
// useUI().toast(نص) · await useUI().confirm(نص, {danger}) · await useUI().prompt(نص, قيمة)
// useEscape(إغلاق) ← Esc يغلق العليا وحدها · useGuardedClose(تغيّرت؟, إغلاق) ← إغلاق يسأل قبل أن يضيع ما كُتب
// التركيز في كل نافذة role="dialog" aria-modal="true" من useModalFocus (shared/ui/modal-focus.js) يُركَّب هنا، بلا سطر في النافذة نفسها.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isChunkError, reloadOnce } from './lazy-retry.js';
import { useModalFocus } from '../../shared/ui/modal-focus.js';

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

// التركيز في النوافذ الحوارية من الوحدة المشتركة مع تطبيق القادة (shared/ui/modal-focus.js)

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
// القائمة فيها بيانات والفلاتر لم تُبقِ منها شيئًا: رسالة واحدة في كل اللوحة
export const NoMatch = ({ what = 'نتائج' }) => <Empty compact title={`لا ${what} لهذه الفلاتر`} hint="جرّب مسحها أو تغيير البحث." />;

export function Empty({ title, hint, children, compact = false }) {
  return (
    <div className={`la-blank${compact ? ' compact' : ''}`}>
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {children && <div className="la-blank-actions">{children}</div>}
    </div>
  );
}

// فهرس أقسام صفحة طويلة: ينقل إلى القسم ويضع التركيز عليه. sections: [[معرّف العنصر، الاسم]]، وما ليس في الصفحة يُخفى
export function SectionIndex({ label, sections }) {
  const [here, setHere] = useState(null);
  useEffect(() => { setHere(sections.filter(([id]) => document.getElementById(id)).map(([id]) => id)); }, [sections]);
  const go = (id) => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } };
  return (
    <nav className="pf-index" aria-label={label}>
      {sections.filter(([id]) => !here || here.includes(id)).map(([id, name]) => <button key={id} type="button" className="la-pill" onClick={() => go(id)}>{name}</button>)}
    </nav>
  );
}

// حاجز أخطاء لمنطقة الشاشة: خطأ في رسم شاشة واحدة يعرض رسالة وزر إعادة، ولا يُسقط اللوحة كلها صفحةً بيضاء.
// يُعطى key بالتبويب فيُصفَّر عند الانتقال، والترويسة والتنقل خارجه فيبقيان يعملان.
// خطأ تحميل ملف القسم (نشر أحدث حذف الملف القديم) لا يصلحه «حاول مرة أخرى» (React.lazy يحفظ الوعد المرفوض):
// رسالته تطلب إعادة تحميل الصفحة. وأي خطأ آخر يُعرض نوعه ورسالته مختصرين، فتدل لقطة الشاشة على سببه
// scope="app" (main.jsx): الحاجز الأخير حول اللوحة كلها، فما فات حواجز الشاشات (سياق أو نافذة أو الإطار نفسه) لا يترك صفحة
// بيضاء. هناك خطأ الملف يعيد تحميل الصفحة مرة واحدة بنفسه (reloadOnce، بلا حلقة)، وإن سبقته إعادة قريبة بقي الزر
export class ScreenBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    console.error(this.props.scope === 'app' ? 'تعذّر رسم اللوحة:' : 'تعذّر رسم الشاشة:', error?.message || error, error);   // eslint-disable-line no-console
    if (this.props.scope === 'app' && isChunkError(error)) (this.props.reloadPage || reloadOnce)();
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const app = this.props.scope === 'app';
    if (isChunkError(error)) {
      return (
        <div className={`la-err${app ? ' la-err-app' : ''}`} role="alert">
          {app ? 'صدر تحديث للوحة، فأعد تحميل الصفحة. بياناتك لم تتأثر.' : 'صدر تحديث للوحة، فأعد تحميل الصفحة لتفتح هذه الشاشة. بياناتك لم تتأثر.'}{' '}
          <button className="btn-sm ghost" type="button" onClick={() => window.location.reload()}>أعد تحميل الصفحة</button>
        </div>
      );
    }
    const detail = String(`${error?.name || 'Error'}: ${error?.message || error}`).slice(0, 200);
    return (
      <div className={`la-err${app ? ' la-err-app' : ''}`} role="alert">
        {app ? 'تعذّر عرض اللوحة. بياناتك لم تتأثر.' : 'تعذّر عرض هذه الشاشة. بقية اللوحة تعمل، وبياناتك لم تتأثر.'}{' '}
        <button className="btn-sm ghost" type="button" onClick={() => this.setState({ error: null })}>حاول مرة أخرى</button>
        {app && <button className="btn-sm ghost" type="button" onClick={() => window.location.reload()}>أعد تحميل الصفحة</button>}
        <small className="la-err-detail" dir="ltr">{detail}</small>
      </div>
    );
  }
}

// نسخ رابط إلى الحافظة، وإن منعها المتصفح يُعرض الرابط لينسخه المدير بنفسه (صفحة الجهة وملف الدفعة)
export function useCopy() {
  const { toast, prompt } = useUI();
  return async (text, ok) => {
    try { await navigator.clipboard.writeText(text); toast(ok); } catch { await prompt('انسخ الرابط:', text); }
  };
}
