// ════════════════════════════════════════════════════════════════
// «حدّث» مع رسالة رفض الخادم (update_required): الرسالة تبقى حتى يتصرف المشارك، وزرها بجانبها
// ════════════════════════════════════════════════════════════════
// يظهر أسفل الشاشة فوق شريط التنقل حين يرفض الخادم طلبًا لأن الواجهة أقدم منه. «حدّث» هو فعل شريط «تحديث جديد متاح»
// نفسه (applyUpdate إلى القسم الحالي، وتنبيه ما لم يُحفظ أولًا). وإن كان الموقع ما زال يقدّم البناء نفسه (الدوال تسبق
// الواجهة دقائق عند النشر) فلا إعادة تحميل لا تغيّر شيئًا: يُقال ذلك ويبقى الزر للمحاولة. لا يغيّر منطق الإصدار ولا الفحص
import React, { useState, useSyncExternalStore } from 'react';
import { appUpdate, applyUpdate } from '../../shared/ui/app-update.js';
import { hasUnsaved } from '../../shared/ui/unsaved-registry.js';
import { updateRefusal } from './update-refusal.js';

export const NOT_YET_AR = 'التحديث لم يصل إلى جهازك بعد. أعد المحاولة بعد دقائق.';
export const UNSAVED_AR = 'لديك ما لم يُحفظ، احفظه ثم حدّث';

export default function UpdateRefusal({ to = null, store = updateRefusal, update = appUpdate, apply = applyUpdate, unsaved = hasUnsaved }) {
  const msg = useSyncExternalStore(store.subscribe, store.get, () => null);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);
  const [notYet, setNotYet] = useState(false);
  if (!msg) return null;
  const dirty = (() => { try { return !!unsaved(); } catch { return true; } })();
  const warning = warn && dirty;
  const close = () => { setWarn(false); setNotYet(false); store.clear(); };
  const go = async () => {
    if (!warning && dirty) { setWarn(true); return; }
    setBusy(true); setNotYet(false);
    try {
      const up = update();
      // مثيل حي (بناء منشور): التحديث يُؤكَّد من version.json قبل إعادة التحميل. وبلا مثيل (خادم التطوير) تُعاد الصفحة
      const live = !!up?.current && up.current !== 'dev';
      if (live && !up.available && !(await up.check({ force: true }))) { setBusy(false); setNotYet(true); return; }
      await apply({ to });
    } catch { setBusy(false); }
  };
  return (
    <div className="update-refusal" role="alert" data-testid="update-refusal">
      <span className="update-refusal-text">{warning ? UNSAVED_AR : notYet ? NOT_YET_AR : msg}</span>
      <span className="update-refusal-acts">
        <button type="button" className="update-bar-btn" onClick={go} disabled={busy}>{warning ? 'حدّث دون حفظ' : 'حدّث'}</button>
        <button type="button" className="update-refusal-x" onClick={close}>إغلاق</button>
      </span>
    </div>
  );
}
