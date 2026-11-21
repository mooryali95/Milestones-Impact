// ════════════════════════════════════════════════════════════════
// ما فتحه المشارك وما طواه في رئيسية رحلته: يُتذكر على جهازه
// ════════════════════════════════════════════════════════════════
// راحة عرض لا حالة: تُحفظ في متصفحه وحده (localStorage)، لكل مشارك مفتاحه، ولا تصل الخادم ولا جهازًا آخر.
// كل قراءة وكتابة محروسة: في التصفح الخاص أو مع حجب التخزين تعمل الرحلة بالافتراضي (الحالية مفتوحة وما سواها مطوي).
// مفتاح المرحلة يحمل حالتها (stage:<المفتاح>@<الحالة>): ما طواه وهي مقفلة لا يبقيها مطوية حين تصير الحالية.
const PREFIX = 'mi_leaders_folds_';
const MAX = 80;   // أقصى ما يُحفظ من اختيارات، فلا يكبر السجل مع السنين

/** @param {string} participantId */
export function foldStore(participantId) {
  const key = `${PREFIX}${participantId || 'me'}`;
  let state = {};
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) state = raw;
  } catch { /* تخزين محجوب أو قيمة تالفة: الافتراضي */ }
  return {
    /** الاختيار المحفوظ، أو undefined إن لم يختر @param {string} id @returns {boolean|undefined} */
    get: (id) => (typeof state[id] === 'boolean' ? state[id] : undefined),
    /** @param {string} id @param {boolean} open */
    set(id, open) {
      delete state[id];
      state[id] = !!open;
      const ids = Object.keys(state);
      for (const old of ids.slice(0, Math.max(0, ids.length - MAX))) delete state[old];
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* محجوب: يبقى الاختيار لهذه الزيارة */ }
    },
  };
}
export const stageFoldId = (stage) => `stage:${stage.key}@${stage.status}`;
