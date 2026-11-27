// ════════════════════════════════════════════════════════════════
// واجهات مشتركة: الإشعار السريع، ونافذة التأكيد والإدخال، وسلوك كل نافذة حوارية
// ════════════════════════════════════════════════════════════════
// useUI().toast(نص) · await useUI().confirm(نص, {danger}) · await useUI().prompt(نص, قيمة)
// confirm بـlines: سطور تحت السؤال (نص، أو { text, tone: 'warn' })، وبـcheck: { label, help?, checked } مربع اختيار داخل النافذة،
// فيعود التأكيد بـ{ checked } بدل true (اختيار «أبلغ المدعوين» قبل إلغاء جلسة)
// useEscape(إغلاق) ← Esc يغلق العليا وحدها · useGuardedClose(تغيّرت؟, إغلاق) ← إغلاق يسأل قبل أن يضيع ما كُتب
// التركيز في كل نافذة role="dialog" aria-modal="true" من useModalFocus (shared/ui/modal-focus.js) يُركَّب هنا، بلا سطر في النافذة نفسها.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hardReload, isChunkError, reloadOnce } from './lazy-retry.js';
import { useModalFocus } from '../../shared/ui/modal-focus.js';
import { useUnsavedFlag } from '../../shared/ui/unsaved-registry.js';
import { LEVELS, PARTICIPANT_STATUS, PARTICIPANT_STATUS_TONE } from '../../supabase/functions/leaders-api/labels.js';

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

// التركيز في النوافذ الحوارية من الوحدة المشتركة مع تطبيق القادة (shared/ui/modal-focus.js)

function Dialog({ d, onDone }) {
  const [value, setValue] = useState(d.value || '');
  const [checked, setChecked] = useState(d.check ? d.check.checked !== false : false);
  const field = useRef(null);
  const no = useRef(null);
  const yes = useRef(null);
  // التركيز الأول بحسب النوع: الحقل، أو «إلغاء» في الخطِر، أو «تأكيد». حبسه وعودته إلى ما فتحها من useModalFocus
  useEffect(() => {
    (field.current || (d.danger ? no.current : yes.current))?.focus();
    field.current?.select();
  }, [d]);
  const accept = () => onDone(d.input ? value : d.check ? { checked } : true);
  const cancel = () => onDone(d.input ? null : false);
  useEscape(cancel);
  const key = (e) => {
    if (e.key === 'Enter' && e.target !== no.current) { e.preventDefault(); accept(); }
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && cancel()} onKeyDown={key}>
      <div className="mid-box" role={d.input ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="mid-msg">
        <p className="mid-msg" id="mid-msg">{d.msg}</p>
        {/* سطور الأثر تحت السؤال (معاينة قبل الحفظ): كل سطر جملة برقمها */}
        {d.lines?.length > 0 && <ul className="mid-lines" data-testid="confirm-lines">{d.lines.map((x) => (typeof x === 'string' ? <li key={x}>{x}</li> : <li key={x.text} className={x.tone === 'warn' ? 'warn' : ''}>{x.tone === 'warn' && <span aria-hidden="true">! </span>}{x.text}</li>))}</ul>}
        {d.check && (
          <label className="mid-check" data-testid="confirm-check">
            <input type="checkbox" checked={checked} aria-describedby={d.check.help ? 'mid-check-help' : undefined} onChange={(e) => setChecked(e.target.checked)} />
            <span><b>{d.check.label}</b>{d.check.help && <small id="mid-check-help">{d.check.help}</small>}</span>
          </label>
        )}
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
  // لكل سؤال مفتاحه: سؤال يتبع سؤالًا مباشرة (تأكيد ثم اسم) نافذة جديدة بقيمتها الأولى، لا الأولى بحالتها
  const seq = useRef(0);
  const ask = useCallback((d) => new Promise((resolve) => setDialog({ ...d, resolve, id: (seq.current += 1) })), []);
  const confirm = useCallback((m, o = {}) => ask({ msg: m, ...o }), [ask]);
  const prompt = useCallback((m, value = '', o = {}) => ask({ msg: m, value, input: true, ...o }), [ask]);

  useModalFocus();

  return (
    <Ctx.Provider value={{ toast, confirm, prompt }}>
      {children}
      {dialog && <Dialog key={dialog.id} d={dialog} onDone={(v) => { dialog.resolve(v); setDialog(null); }} />}
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
// والنافذة ذات التعديل غير المحفوظ تمنع إعادة التحميل التلقائية للتحديث (shared/ui/unsaved-registry.js، المرحلة 5)
export function useGuardedClose(dirty, onClose) {
  const { confirm } = useUI();
  useUnsavedFlag(dirty);
  return async () => {
    if (dirty && !(await confirm('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟', { danger: true, ok: 'إغلاق دون حفظ' }))) return;
    onClose();
  };
}

export const Spinner = () => <div className="spinner" aria-label="جارٍ التحميل" />;
// هيكل صفوف للتحميل الأول في جدول (مشترك): يحجز الارتفاع فلا تقفز الصفحة، ويعلن التحميل مرة واحدة
export function SkeletonRows({ rows = 6, cols = 5 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i} className="sk-row" aria-hidden={i > 0 || undefined}>
      {Array.from({ length: cols }, (__, j) => <td key={j}>{i === 0 && j === 0 && <span className="sr-only">جارٍ التحميل</span>}<span className="sk" /></td>)}
    </tr>
  ));
}
// خطأ تحميل (مشترك): role=alert وزر إعادة. stale=true حين تبقى البيانات السابقة ظاهرة تحته
export function LoadError({ message, onRetry, stale = false }) {
  return (
    <div className="load-err" role="alert">
      <span>{stale ? 'تعذّر التحديث، والظاهر آخر ما حُمّل' : 'تعذّر تحميل البيانات'}{message ? `: ${message}` : ''}</span>
      {onRetry && <button className="btn-sm ghost" type="button" onClick={onRetry}>حاول مرة أخرى</button>}
    </div>
  );
}

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
    if (this.props.scope === 'app' && isChunkError(error)) (this.props.reloadPage || reloadOnce)({ error });
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
          {/* إن تكررت الرسالة: تحديث كامل يتجاوز مخزن المتصفح (hardReload، shared/ui/lazy-retry.js) */}
          <button className="btn-sm ghost" type="button" onClick={() => hardReload()}>تحديث كامل</button>
        </div>
      );
    }
    const detail = String(`${error?.name || 'Error'}: ${error?.message || error}`).slice(0, 200);
    return (
      <div className={`la-err${app ? ' la-err-app' : ''}`} role="alert">
        {app ? 'تعذّر عرض اللوحة. بياناتك لم تتأثر.' : 'تعذّر عرض هذه الشاشة. بقية اللوحة تعمل، وبياناتك لم تتأثر.'}{' '}
        <button className="btn-sm ghost" type="button" onClick={() => this.setState({ error: null })}>حاول مرة أخرى</button>
        {app && <button className="btn-sm ghost" type="button" onClick={() => window.location.reload()}>أعد تحميل الصفحة</button>}
        {/* نص الخطأ التقني (TypeError…) لا يُعرض في وجه المدير: مطوي تحت «تفاصيل تقنية» لمن يبلّغ عنه (تدقيق 2026-11-23) */}
        <details className="la-err-more"><summary>تفاصيل تقنية</summary><small className="la-err-detail" dir="ltr">{detail}</small></details>
      </div>
    );
  }
}

// نسخ رابط إلى الحافظة، وإن منعها المتصفح يُعرض الرابط لينسخه المدير بنفسه (صفحة الجهة وملف الدفعة)
// reveal=false لبيانات شخصية (البريد): عند الفشل يُعلن الفشل ولا يُعرض النص في نافذة
export function useCopy() {
  const { toast, prompt } = useUI();
  return async (text, ok, { reveal = true } = {}) => {
    try { await navigator.clipboard.writeText(text); toast(ok); } catch { if (reveal) await prompt('انسخ الرابط:', text); else toast('تعذّر النسخ'); }
  };
}

// شارة الحالة الواحدة (المرحلة 6): التسمية والنبرة من labels (PARTICIPANT_STATUS وPARTICIPANT_STATUS_TONE) لا من الشاشة.
// labels/tones لخريطة حالة أخرى من labels نفسها. لا تُكسر الشارة على سطرين (nowrap في CSS).
const TONES = new Set(['', 'ok', 'warn', 'bad']);
export function statusTone(status, tones = PARTICIPANT_STATUS_TONE) {
  const t = tones?.[status] || '';
  return TONES.has(t) ? t : '';
}
export function StatusChip({ status, labels = PARTICIPANT_STATUS, tones = PARTICIPANT_STATUS_TONE, className = '' }) {
  if (status == null || status === '') return null;
  const tone = statusTone(status, tones);
  return <span className={`la-chip st-chip${tone ? ` ${tone}` : ''}${className ? ` ${className}` : ''}`} data-status={status}>{labels?.[status] || status}</span>;
}

// نسبة عرض الشريط (0 إلى 100، عدد صحيح): المقام صفر أو غير رقم يعطي 0، وما فوق المقام يقف عند 100،
// والقيمة الموجبة الصغيرة جدًا تظهر 1 فلا تبدو صفرًا.
export function barPct(value, max) {
  const v = Number(value); const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0 || v <= 0) return 0;
  const p = Math.round((v / m) * 100);
  return Math.min(100, Math.max(1, p));
}

// مقياس بمقام صريح (المرحلة 6): شريط ونص «القيمة من المقام» ظاهر، وrole=meter لقارئ الشاشة.
// label يسمي ما يُقاس. tone اختيارية (ok/warn/bad).
export function Meter({ value, max, label, tone = '', unit = '' }) {
  // role=meter لا progressbar: القيمة مقدار ضمن مدى معلوم (3 من 10) لا تقدم مهمة جارية. aria-valuetext يعلن المقام صريحًا.
  const v = Math.max(0, Number(value) || 0); const m = Math.max(0, Number(max) || 0);
  const pct = barPct(v, m);
  const text = `${v} من ${m}${unit ? ` ${unit}` : ''}`;
  return (
    <span className={`la-meter${TONES.has(tone) && tone ? ` ${tone}` : ''}`} role="meter" aria-valuemin={0} aria-valuemax={m > 0 ? m : 1} aria-valuenow={m > 0 ? Math.min(v, m) : 0}
      aria-valuetext={text} aria-label={label ? `${label}: ${text}` : text}>
      <span className="la-meter-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      <span className="la-meter-num" aria-hidden="true">{text}</span>
    </span>
  );
}

// مستوى الوثيقة بالمكون Meter (المرحلة 24): خطوة المستوى من ثلاث بالاسم، الشكل نفسه في ملحق المراجع وشارة الإدارة
export function DocLevelMeter({ level }) {
  const l = LEVELS.find((x) => x.key === level);
  if (!l) return null;
  return <span className="la-chip">مستوى الوثيقة: {l.title} <Meter value={l.step} max={LEVELS.length} label="مستوى الوثيقة" /></span>;
}

// الشاشة العريضة (مشتركة: التواصل، وكثافة المشاركين في المرحلة 9)
export const WIDE = '(min-width: 1100px)';
export function useWide(query = WIDE) {
  const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null);
  const [wide, setWide] = useState(() => !!mq()?.matches);
  useEffect(() => {
    const m = mq();
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [query]); // eslint-disable-line
  return wide;
}
