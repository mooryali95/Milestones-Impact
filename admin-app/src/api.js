// ════════════════════════════════════════════════════════════════
// الاتصال بدالة admin-api والجلسة
// ════════════════════════════════════════════════════════════════
// المفتاح العام يرضي بوابة Supabase فقط؛ ما يصرّح فعلًا بكل إجراء هو
// توكن جلسة المدير داخل الجسم، ويُتحقق منه على الخادم.
import { netMessage, postAction } from '../../src/lib/api.js';
import { dateTime } from './dates.js';

export const ROLE_LABELS = { super_admin: 'مدير عام', admin: 'مدير نظام', viewer: 'مراقب' };

// مفتاح الجلسة ومدتها (مفتاح v3 ثابت فلا تنتهي جلسات المدراء الحالية)
const KEY = 'mi_admin_v3';
const TTL = 8 * 60 * 60 * 1000;
export const session = {
  load() {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!d?.token || !d.user?.email) return null;
      if (Date.now() - d.ts > TTL) { this.clear(); return null; }
      return d;
    } catch { return null; }
  },
  save(token, user) { try { sessionStorage.setItem(KEY, JSON.stringify({ token, user, ts: Date.now() })); } catch { /* وضع خاص */ } },
  // تحديث بيانات المستخدم دون تمديد عمر الجلسة
  patchUser(patch) {
    const d = this.load();
    if (!d) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ ...d, user: { ...d.user, ...patch } })); } catch { /* */ }
  },
  clear() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch { /* */ } },
};

let onExpired = () => {};
export const setExpiredHandler = (fn) => { onExpired = fn; };

// إقلاع الدالة يرد 502/503/504 مؤقتًا قبل أن يعمل الإجراء، فتُعاد المحاولة دون أن يراها المدير. سياسة الإعادة من نوع الفعل
// (postAction في src/lib/api.js، ش9): القراءة تُعاد بمهلة وميزانية، وكتابة leaders-api بمفتاح منع التكرار، وكتابة admin-api
// لا تُعاد بعد خطأ شبكة («تعذّر التأكد، تحقّق قبل الإعادة»)
const BUSY = [502, 503, 504];
export async function post(fn, payload, fail) {
  try {
    const { r } = await postAction(fn, payload);
    if (BUSY.includes(r.status)) return { success: false, message: 'الخادم مشغول لحظيًا، حدّث الصفحة بعد ثوانٍ' };
    return await r.json();
  } catch (e) {
    return { success: false, message: netMessage(e, fail) };
  }
}

export async function call(action, body = {}) {
  const token = session.load()?.token;
  const res = await post('admin-api', { action, ...(token ? { token } : {}), ...body }, 'خطأ في الاتصال بالخادم');
  if (!res.success && token && res.message?.includes('الجلسة')) { session.clear(); onExpired(); }
  return res;
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// صيغة التاريخ من dates.js وحدها (كانت هنا ar-SA فتُظهر التاريخ هجريًا خلاف بقية اللوحة)
export const fmtDate = (iso) => dateTime(iso) || '—';
