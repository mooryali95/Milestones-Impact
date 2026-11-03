// ════════════════════════════════════════════════════════════════
// جولة العرض التوضيحي: شريط أنيق أسفل الشاشة يقود الورشة خطوة خطوة
// ════════════════════════════════════════════════════════════════
// يظهر لحساب العرض وحده (رابط من لوحة الإدارة). كل خطوة تنقل إلى القسم المعني وتشرحه بجملتين،
// وبعض الخطوات تُنفَّذ بضغطة: الدخول، وتعبئة الملف، وتعبئة القياس وإرساله.
import React, { useState } from 'react';
import { call } from './api.js';
import { TRACK_COUNT } from '../../supabase/functions/leaders-api/labels.js';

const KEY = 'mi_demo_step';
export const DEMO_PENDING = 'mi_demo_pending';
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* وضع خاص */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* وضع خاص */ } },
};

// رابط العرض: /#demo=<جلسة> يُحفظ ولا يُدخل تلقائيًا، فيبدأ العرض من شاشة الدخول
export function captureDemoLink() {
  const m = location.hash.match(/^#demo=([A-Za-z0-9_-]{20,})$/);
  if (!m) return false;
  store.set(DEMO_PENDING, m[1]);
  store.set(KEY, '0');
  history.replaceState(null, '', location.pathname);
  return true;
}
export const demoPending = () => !!store.get(DEMO_PENDING);

const STEPS = [
  { t: 'الدخول', d: 'يدخل المشارك ببريده (رمز أو رابط)، أو بحساب Google، أو بمفتاح المرور على جهازه. لا كلمات مرور تُنسى.', act: 'login', btn: 'سجّل الدخول' },
  { t: 'الملف الشخصي', d: 'بيانات قليلة تحدد سياق المشارك: مسماه وجهته وخبرته ونطاق عمله، فيتكيّف محتواه ومشروعه معها.', act: 'profile', btn: 'املأ الملف وأكمل' },
  { t: 'القياس المبدئي', d: 'ثلاثة أطر: المعالم والأثر والقيادة، ولكل إطار ثلاث طبقات: المعرفة والمواقف والممارسة. الممارسة أولًا حتى لا تلمّح الأسئلة الأخرى إلى المتوقَّع.', act: 'assessment', btn: 'أجب وأرسل القياس' },
  { t: 'النتيجة والمسار', d: `مستوى في كل إطار (تأسيسي، متوسط، احترافي)، ومنها مسار من ${TRACK_COUNT} مسارًا، وملف تعريف يشرح نقاط القوة والأولوية. في البرنامج الفعلي يعتمده المستشار.`, go: 'home' },
  { t: 'الرحلة', d: 'مراحل يضبطها البرنامج: الإلزامي يقود ما بعده، وما هو «عند الطلب» كالتوجيه والاستشارة متاح متى احتاجه المشارك دون أن يوقفه.', go: 'home' },
  { t: 'المشروع والمعالم', d: 'المشروع من اليوم الأول. لكل معلم موعد من جدول الدفعة، ويرى المشارك موقعه وتأخره بالأيام، ويقيّمه الخبير بمعيار وصفي.', go: 'capstone' },
  { t: 'الكتيب و«كاتون»', d: 'لكل جملة ثمانية خيارات: صحيحة أو خاطئة 100%، أو لدي سؤال، أو تحتاج بحث، أو لدي فكرة… اليقين يُكافأ إن صدق ويُخصم إن خاب، فيتعلّم القائد دقة التحليل.', go: 'katon' },
  { t: 'القاعة والفرق', d: 'بعد التدريب يُقسَّم المشاركون إلى أربعة فرق: الدعم والقيادة والتوجيه والتقييم، وقائد يتبدّل كل جولة، وشخصية افتراضية كراعي المشروع. حيّة في القاعة، أو ذاتية دون اجتماع.', go: 'hall' },
  { t: 'التقييم', d: 'تقييم مستمر من خمسة مصادر طوال التأهيل، ثم تقييم ختامي بدرجة آلية مشروحة، يعدّلها الخبير بتعليل، ويعتمد القرار خبير أو لجنة.', go: 'home' },
];

export default function DemoTour({ me, onAccept, onGo }) {
  const [i, setI] = useState(() => Math.min(STEPS.length - 1, Math.max(0, Number(store.get(KEY)) || 0)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [min, setMin] = useState(false);
  const step = STEPS[i];
  const to = (n) => { const k = Math.min(STEPS.length - 1, Math.max(0, n)); setI(k); store.set(KEY, String(k)); setErr(''); if (STEPS[k].go && me) onGo(STEPS[k].go); };

  const run = async () => {
    setBusy(true); setErr('');
    try {
      if (step.act === 'login') {
        const token = store.get(DEMO_PENDING);
        if (!token) throw new Error('افتح رابط العرض من لوحة الإدارة من جديد');
        onAccept({ token });
        const r = await call('me');
        if (!r.success) throw new Error(r.message);
        store.del(DEMO_PENDING);
        onAccept(r);
      } else if (step.act === 'profile') {
        const r = await call('demo.fill-profile');
        if (!r.success) throw new Error(r.message);
        onAccept(r);
      } else if (step.act === 'assessment') {
        const r = await call('demo.fill-assessment');
        if (!r.success) throw new Error(r.message);
        onAccept(r);
      }
      to(i + 1);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (min) return <button className="demo-pill" onClick={() => setMin(false)}>جولة العرض · {i + 1} من {STEPS.length}</button>;
  return (
    <aside className="demo-tour" role="region" aria-label="جولة العرض التوضيحي">
      <div className="demo-steps" aria-hidden="true">{STEPS.map((s, k) => <i key={s.t} className={k < i ? 'done' : k === i ? 'on' : ''} />)}</div>
      <div className="demo-body">
        <p className="demo-eyebrow">جولة العرض · {i + 1} من {STEPS.length}</p>
        <h2>{step.t}</h2>
        <p>{step.d}</p>
        {err && <p className="demo-err" role="alert">{err}</p>}
      </div>
      <div className="demo-actions">
        {step.act && <button className="btn" disabled={busy} onClick={run}>{busy ? 'لحظة…' : step.btn}</button>}
        {!step.act && i < STEPS.length - 1 && <button className="btn" onClick={() => to(i + 1)}>التالي</button>}
        {i > 0 && <button className="btn ghost" onClick={() => to(i - 1)}>السابق</button>}
        <button className="link small" onClick={() => setMin(true)}>إخفاء</button>
      </div>
    </aside>
  );
}
