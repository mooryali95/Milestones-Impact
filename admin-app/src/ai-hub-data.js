// ════════════════════════════════════════════════════════════════
// «المساعد الذكي»: طلبات حال المساعدَين مشتركة بين رأس القسم وشاشاته، بلا طلب جديد في الخادم
// ════════════════════════════════════════════════════════════════
// الرأس يعرض سطر الحال من الطلبات نفسها التي تقرؤها الشاشات (admin.agent-state وadmin.agent-usage وadmin.guide-dashboard).
// القراءة الأولى للشاشة تنضم إلى طلب الرأس الجاري أو تأخذ رده القريب (reuse)، فلا يتضاعف الطلب. وإعادة التحميل بعد
// أي تغيير (التشغيل، المفتاح، التقييم) طلب جديد دائمًا، ورده يصل الرأس أيضًا فيبقى الرأس والشاشة على حال واحدة.
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
    subs.forEach((f) => f());
    return r;
  });
  inflight.set(action, p);
  const clear = () => { if (inflight.get(action) === p) inflight.delete(action); };
  p.then(clear, clear);
  return p;
}

// آخر رد لكل طلب، ويتحدث كلما وصل رد جديد من الرأس أو من الشاشة
export function useAiData(actions) {
  const read = () => Object.fromEntries(actions.map((a) => [a, last.get(a)?.value ?? null]));
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

// للاختبارات: يمسح ما حُفظ بين حالة وأخرى
export function resetAiData() { inflight.clear(); last.clear(); }
