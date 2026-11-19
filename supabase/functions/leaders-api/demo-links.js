// ════════════════════════════════════════════════════════════════
// روابط تجربة حساب العرض (منطق خالص): المدد، وتنظيف الاسم، وحالة الرابط
// ════════════════════════════════════════════════════════════════
// مصدر واحد للخادم (demo.ts) وللوحة الإدارة (بطاقة حساب العرض في النظرة العامة). الرابط يُعطى لشخص ليجرّب المنصة بحساب
// العرض (مدير دفعة، مسؤول في جهة): يفتح جلسة مشارك لحساب العرض بلا رمز بريد، ولا يفتح شيئًا غيرها.

export const DEMO_LINK_DAYS = Object.freeze([1, 3, 7, 14, 30]);
export const DEMO_LINK_DEFAULT_DAYS = 7;
export const DEMO_LINK_MAX_ACTIVE = 20;
export const DEMO_LINK_LABEL_MAX = 80;
// حد المعدل: محاولات فتح من الشبكة نفسها (الخاطئة والصحيحة) في 10 دقائق، وجلسات يفتحها الرابط الواحد في الساعة
export const DEMO_LINK_LIMITS = Object.freeze({ triesPerNet10Min: 20, opensPerLinkHour: 30 });
// الرمز في جزء الرابط بعد # فلا يصل خادمًا ولا سجل وصول، وتقرؤه الصفحة مرة ثم تزيله من العنوان
export const DEMO_LINK_HASH = 'try';
export const demoLinkUrl = (appUrl, token) => `${String(appUrl || '').replace(/\/$/, '')}/#${DEMO_LINK_HASH}=${token}`;

/** حالة الرابط: active أو expired أو revoked */
export function demoLinkState(row, now = Date.now()) {
  if (row?.revoked_at) return 'revoked';
  if (!row?.expires_at || new Date(row.expires_at).getTime() <= now) return 'expired';
  return 'active';
}

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_LIKE = /(?:\+|00)?[\d٠-٩][\d٠-٩\s().-]{7,}[\d٠-٩]/;

/** مدخلات رابط جديد بعد تنظيفها. يرمي رسالة عربية إن لم تصح. الاسم وصف يكتبه المدير، لا بريد ولا جوال */
export function cleanDemoLinkInput(b) {
  const label = text(b?.label, DEMO_LINK_LABEL_MAX);
  if (label.length < 2) throw new Error('اكتب لمن هذا الرابط، مثل «مدير الدفعة» أو اسم المسؤول');
  if (EMAIL_LIKE.test(label) || PHONE_LIKE.test(label)) throw new Error('اكتب اسمًا أو صفة، لا بريدًا ولا رقم جوال');
  const days = b?.days == null || b.days === '' ? DEMO_LINK_DEFAULT_DAYS : Number(b.days);
  if (!DEMO_LINK_DAYS.includes(days)) throw new Error('اختر مدة الرابط من القائمة');
  return { label, days };
}

/** الرابط كما تعرضه اللوحة: بلا بصمة الرمز */
export const demoLinkView = (row, now = Date.now()) => ({
  id: row.id, label: row.label, created_by: row.created_by, created_at: row.created_at, expires_at: row.expires_at,
  last_used_at: row.last_used_at || null, uses: row.uses || 0, state: demoLinkState(row, now),
});
