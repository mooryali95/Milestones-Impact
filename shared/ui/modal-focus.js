// ════════════════════════════════════════════════════════════════
// التركيز في النوافذ الحوارية، من مكان واحد للوحة الإدارة وتطبيق القادة
// ════════════════════════════════════════════════════════════════
// يُركَّب مرة واحدة في جذر كل تطبيق (UIProvider في admin-app/src/ui.jsx، وApp في leaders-app/src/App.jsx)، فتستفيد
// منه كل نافذة role="dialog" aria-modal="true" قائمة أو قادمة، ومنها نوافذ الكتاب الأم المشتركة (shared/master-book).
// نافذة تدير Tab بنفسها وتمنعه (preventDefault) عند طرفيها لا يتدخل فيها، فلا يتعارض الاثنان.
import { useEffect } from 'react';

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

export function useModalFocus() {
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
