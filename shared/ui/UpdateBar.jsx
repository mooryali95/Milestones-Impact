// ════════════════════════════════════════════════════════════════
// شريط «تحديث جديد متاح»: سطر واحد وزر «حدّث»، بلا رقم نسخة ولا تفاصيل (المرحلة 5 البند 3)
// ════════════════════════════════════════════════════════════════
// يظهر حين يختلف version.json عن بصمة الصفحة، أو حين يرد الخادم update_required (app-update.js). غير حاجب: الصفحة تعمل
// تحته كما هي، وإعادة التحميل التلقائية تنتظر أول تنقل داخلي بلا نموذج غير محفوظ. يستعمله التطبيقان بأصنافهما.
import React, { useState, useSyncExternalStore } from 'react';
import { appUpdate, applyUpdate } from './app-update.js';

const noop = () => () => {};

/** هل التحديث متاح الآن؟ (يتبع مثيل الصفحة) */
export function useUpdateAvailable(update = appUpdate()) {
  return useSyncExternalStore(update ? update.subscribe : noop, () => !!update?.available, () => false);
}

/** to: دالة تعطي رابط القسم الحالي (تطبيق القادة)، وبلا قيمة تُعاد الصفحة نفسها */
export default function UpdateBar({ to = null, update = appUpdate(), apply = applyUpdate }) {
  const on = useUpdateAvailable(update);
  const [busy, setBusy] = useState(false);
  if (!on) return null;
  const go = async () => { setBusy(true); try { await apply({ to }); } catch { setBusy(false); } };
  return (
    <div className="update-bar" role="status" aria-live="polite" data-testid="update-bar">
      <span className="update-bar-text">تحديث جديد متاح</span>
      <button type="button" className="update-bar-btn" onClick={go} disabled={busy}>حدّث</button>
    </div>
  );
}
