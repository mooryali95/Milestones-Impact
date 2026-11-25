// ════════════════════════════════════════════════════════════════
// هوية الشخص عند إنشاء الحساب: مفتاح الهاتف المطبَّع، ومفتاح الاسم للتحذير، ورسائل الرد
// ════════════════════════════════════════════════════════════════
// phoneKey هو المصدر الواحد في الدوال لتعبير الفهرس الفريد في القاعدة (ترحيل 20261128180000)
// participants_phone_key_uniq ونسخته في 20261128170000: الأرقام الهندية والفارسية إلى لاتينية، ثم الأرقام وحدها، ثم حذف 00 الدولية، ثم 05XXXXXXXX
// و5XXXXXXXX السعودي إلى 9665XXXXXXXX (قاعدة normalizePhone). أي تغيير هنا يتبعه تغيير الفهرس بترحيل.
import { latinDigits } from './digits.js';

export const PHONE_KEY_MIN = 8;

export function phoneKey(raw) {
  const d = latinDigits(raw || '').replace(/\D/g, '').replace(/^00/, '');
  if (/^05\d{8}$/.test(d)) return '966' + d.slice(1);
  if (/^5\d{8}$/.test(d)) return '966' + d;
  return d;
}

// الصيغ التي قد يكون الرقم محفوظًا بها في participants.phone (المحفوظ اليوم +9665… من normalizePhone، والقديم قد يكون محليًا)،
// فيُقرأ صاحب الهاتف بمرشح in عادي بلا دالة في القاعدة، فيعمل قبل الترحيل وبعده
export function phoneVariants(key) {
  if (!key) return [];
  const out = new Set([key, '+' + key, '00' + key]);
  if (/^9665\d{8}$/.test(key)) { out.add('0' + key.slice(3)); out.add(key.slice(3)); }
  return [...out];
}

// الحساب الذي يحجز الهاتف: حقيقي قائم، كشرط الفهرس الجزئي
export const holdsPhone = (p) => !!p && !p.is_demo && !['suspended', 'withdrawn'].includes(p.status);

// الاسم المطبَّع للتحذير «قد يكون مكررًا» (كما في scripts/db/verify-duplicate-people.sql): بلا مسافات ولا تشكيل ولا تطويل،
// وصور الهمزة على الألف ألفًا، والألف المقصورة ياءً، والتاء المربوطة هاءً، فـ«سامر نوفل» و«سامرنوفل» اسم واحد
export function nameKey(name) {
  return String(name || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

// رسالة المشارك: محايدة، لا تسمي صاحب الحساب ولا تكشف بريده بأي صورة
export const PHONE_TAKEN_AR = 'هذا الرقم مرتبط بحساب قائم، ادخل ببريدك الذي سجلت به أولًا';

// رسالة الإدارة: تسمي الحساب القائم لترسل الدعوة إليه بدل إنشاء حساب ثانٍ
export const phoneTakenAdminAr = (p) => `هذا الجوال مسجل لحساب قائم: ${p.full_name || 'بلا اسم'} (${p.email}). أرسل الدعوة إلى هذا الحساب بدل إنشاء حساب جديد.`;

export const MAYBE_DUP_AR = 'قد يكون مكررًا';
