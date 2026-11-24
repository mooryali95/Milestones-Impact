// ════════════════════════════════════════════════════════════════
// أعمدة جدول المشاركين: ثلاث طبقات (تصور تبويبات الإدارة 2026-11-24، القسم 0.3، المرحلة أ2)
// ════════════════════════════════════════════════════════════════
// دائمًا: التحديد والاسم والحال وأين توقف وبانتظار. عند الاتساع (1280 فأكثر، بالتنسيق في leaders-admin.css): الجهة
// والمسار. اختيارية بمنتقي «الأعمدة»: المستويات الثلاثة والتسجيل، يُحفظ اختيارها لكل مدير في هذا المتصفح.
// التخزين محجوب (نافذة خاصة أو بيانات ممسوحة): الافتراضي، ولا يتعطل الجدول.
import { session } from './api.js';

export const OPTIONAL_COLS = [
  ['levels', 'المستويات الثلاثة'],
  ['joined', 'تاريخ التسجيل'],
];
export const DEFAULT_COLS = Object.freeze({ levels: false, joined: false });

const PREFIX = 'mi_admin_pt_cols';
// المفتاح باسم المدير (بريده): مديران على جهاز واحد لا يرث أحدهما اختيار الآخر
export const colsKey = (email = session.load()?.user?.email) => `${PREFIX}:${String(email || '').toLowerCase()}`;

export function readCols(key = colsKey(), store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store.getItem(key) || 'null');
    if (!v || typeof v !== 'object') return { ...DEFAULT_COLS };
    return Object.fromEntries(OPTIONAL_COLS.map(([k]) => [k, typeof v[k] === 'boolean' ? v[k] : DEFAULT_COLS[k]]));
  } catch {
    return { ...DEFAULT_COLS };
  }
}

export function writeCols(cols, key = colsKey(), store = globalThis.localStorage) {
  try { store.setItem(key, JSON.stringify(cols)); return true; } catch { return false; }
}

// صنف الجدول: كل عمود اختياري ظاهر يضيف show-<المفتاح>
export const colsClass = (cols) => OPTIONAL_COLS.filter(([k]) => cols[k]).map(([k]) => `show-${k}`).join(' ');
