// ════════════════════════════════════════════════════════════════
// رفض الخادم لعميل قديم (update_required): آخر رسالة رفض، لتُعرض بزر «حدّث» (UpdateRefusal.jsx)
// ════════════════════════════════════════════════════════════════
// الشاشات تعرض رسالة الرفض إشعارًا عابرًا بلا زر، فيبقى المشارك أمام فعل لم ينفذ بلا علاج (جولة المشارك 2026-11-19).
// هنا مخزن صغير بلا React يكتب فيه api.js رسالة الرفض، ولا يغيّر شيئًا في منطق الإصدار والتحديث (shared/ui/app-update.js)
let message = null;
const subs = new Set();
const emit = () => { for (const fn of subs) { try { fn(); } catch { /* مستمع معطوب لا يوقف غيره */ } } };
export const DEFAULT_REFUSAL_AR = 'صدر تحديث للمنصة. حدّث لتكمل ما كنت تفعله.';
export const updateRefusal = {
  get: () => message,
  /** رد الخادم برمز update_required: رسالته كما هي، أو النص الاحتياطي */
  set(text) { message = String(text || '').trim() || DEFAULT_REFUSAL_AR; emit(); },
  clear() { if (message === null) return; message = null; emit(); },
  subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
};
