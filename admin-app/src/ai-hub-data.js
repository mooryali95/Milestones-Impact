// ════════════════════════════════════════════════════════════════
// «المساعد الذكي»: طلبات حال المساعدَين مشتركة بين رأس القسم وشاشاته، بلا نقطة خادم جديدة
// ════════════════════════════════════════════════════════════════
// الرأس يعرض سطر الحال من الطلبات نفسها التي تقرؤها الشاشات (admin.agent-state وadmin.agent-usage وadmin.guide-dashboard).
// القراءة الأولى للشاشة تنضم إلى طلب الرأس الجاري أو تأخذ رده القريب (reuse)، فلا يتضاعف الطلب. وإعادة التحميل بعد
// أي تغيير (التشغيل، المفتاح، التقييم، الإتاحة) طلب جديد دائمًا، ورده يصل الرأس أيضًا فيبقى الرأس والشاشة على حال واحدة.
// ولأن الرأس يعرض المساعدَين معًا فكل تبويب يقرأ حال الآخر أيضًا: طلبان أو ثلاثة لكل فتح للقسم من نقاط قائمة.
// المخزن على مستوى الوحدة، فيُمسح عند الخروج والدخول وانتهاء الجلسة (App.jsx) فلا يرث مدير رد غيره.
import { useEffect, useState } from 'react';
import { L } from './leaders.js';

const FRESH_MS = 15_000;
const inflight = new Map();
const last = new Map();
const subs = new Set();

export function aiLoad(action, { reuse = false } = {}) {
  if (reuse) {
    if (inflight.has(action)) return inflight.get(action);
    const l = last.get(action);
    if (l && Date.now() - l.at < FRESH_MS) return Promise.resolve(l.value);
  }
  const p = L(action, {}).then((r) => {
    last.set(action, { value: r, at: Date.now() });
    return r;
  });
  inflight.set(action, p);
  // يُبلَّغ المشتركون بعد انتهاء الطلب نجح أو تعذّر، فلا يبقى الرأس في هيكل التحميل
  const clear = () => { if (inflight.get(action) === p) inflight.delete(action); subs.forEach((f) => f()); };
  p.then(clear, clear);
  return p;
}

// آخر رد لكل طلب، ويتحدث كلما وصل رد جديد من الرأس أو من الشاشة. pending: طلب أول لم يرجع بعد
export function useAiData(actions) {
  const read = () => ({ ...Object.fromEntries(actions.map((a) => [a, last.get(a)?.value ?? null])), pending: actions.some((a) => !last.has(a) && inflight.has(a)) });
  const [v, setV] = useState(read);
  const key = actions.join('|');
  useEffect(() => {
    const f = () => setV(read());
    subs.add(f);
    actions.forEach((a) => aiLoad(a, { reuse: true }).catch(() => {}));
    f();
    return () => { subs.delete(f); };
  }, [key]);
  return v;
}

// يمسح ما حُفظ: عند الخروج والدخول وانتهاء الجلسة، وبين حالات الاختبار
export function resetAiData() { inflight.clear(); last.clear(); }
