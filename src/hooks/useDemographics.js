// ════════════════════════════════════════════════════════════════
// التحليل الديموغرافي: تحميل الصفوف وتعديلها وحفظها على الخادم
// ════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { UserAPI } from '../lib/api';
import { LocalSession } from '../lib/session';

export const DEMO_KEY = 'demographic_analysis'; // مفتاح الحفظ في DB

export const emptyDemoRow = () => ({
  id: Date.now() + Math.random(),
  name: '', entity: '', position: '', relation: '',
  age: '', location: '', sharedEvent: '',
  strength: { knowledge: 0, social: 0, financial: 0, economic: 0, sovereign: 0 },
  myRelation: { knowledge: 0, social: 0, financial: 0, economic: 0 },
  target: { knowledge: false, social: false, financial: false, economic: false },
});

// صف صالح: اسم وبُعد قوة واحد على الأقل
export const validDemoRows = (rows) => rows.filter(
  (r) => r.name?.trim() && Object.values(r.strength || {}).some((v) => Number(v) > 0),
);

export default function useDemographics({ sessionToken, showToast, onSessionEnd }) {
  const [demoScreen, setDemoScreen] = useState(false);
  const [demoRows, setDemoRows] = useState([]);
  const [demoSaving, setDemoSaving] = useState(false);
  // الصفوف تُجلب من الخادم عند فتح الشاشة، وتبقى فارغة حتى تصل
  const [demoLoading, setDemoLoading] = useState(false);

  const loadDemoData = async () => {
    if (!sessionToken) return;
    setDemoLoading(true);
    const res = await UserAPI.get(sessionToken);
    if (!res?.success) {
      setDemoLoading(false);
      showToast(res?.message || 'تعذّر تحميل التحليل، أعد المحاولة');
      if (res?.message?.includes('الجلسة')) onSessionEnd();
      return;
    }
    const saved = res.registration?.[DEMO_KEY];
    setDemoRows(Array.isArray(saved) && saved.length > 0 ? saved : [emptyDemoRow(), emptyDemoRow(), emptyDemoRow()]);
    setDemoLoading(false);
  };

  const saveDemoData = async () => {
    if (!sessionToken) return;
    const valid = validDemoRows(demoRows);
    if (valid.length === 0) {
      showToast('⚠ يجب إدخال اسم شخص واحد على الأقل مع تحديد قوته');
      return;
    }
    setDemoSaving(true);
    const res = await UserAPI.save(sessionToken, { [DEMO_KEY]: demoRows });
    if (res?.success) {
      LocalSession.update({ [DEMO_KEY]: demoRows });
      showToast(`تم حفظ التحليل: ${valid.length} شخص ✓`);
    } else showToast(res?.message || 'خطأ في الحفظ');
    setDemoSaving(false);
  };

  const updateDemoRow = (id, field, value) => {
    setDemoRows((rows) => rows.map((r) => {
      if (r.id !== id) return r;
      if (Array.isArray(field)) {
        const [group, key] = field;
        return { ...r, [group]: { ...r[group], [key]: value } };
      }
      return { ...r, [field]: value };
    }));
  };

  const addDemoRow = () => setDemoRows((rows) => [...rows, emptyDemoRow()]);
  const removeDemoRow = (id) => setDemoRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));

  return {
    demoScreen, setDemoScreen, demoRows, setDemoRows, demoSaving, demoLoading,
    loadDemoData, saveDemoData, updateDemoRow, addDemoRow, removeDemoRow,
  };
}
