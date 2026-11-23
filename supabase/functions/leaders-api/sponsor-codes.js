// ════════════════════════════════════════════════════════════════
// رموز الرعاية: منطق نقي مشترك بين الخادم (sponsor-codes.ts) ولوحة الجهة في الإدارة (Orgs.jsx)
// ════════════════════════════════════════════════════════════════
// الرمز يكتبه المشارك في «رشّحتك جهة؟» بجانب رمز رابط الجهة، فقاعدته قاعدة ذلك النموذج نفسها (orgByCode).

export const SPONSOR_CODE_RE = /^[a-z0-9-]{4,40}$/;
export const SPONSOR_CODE_RULE_AR = 'أحرف إنجليزية وأرقام وشرطة، من 8 إلى 40';
// الرمز الذي يكتبه المدير بنفسه 8 أحرف على الأقل (القاعدة تقبل 4 فما فوق ليبقى نموذج المشارك كما هو)
export const CUSTOM_CODE_RE = /^[a-z0-9-]{8,40}$/;
// أحرف لا تلتبس عند القراءة أو الإملاء: بلا 0 وo و1 وl وi
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const NOTE_MAX = 300;
export const MAX_USES_LIMIT = 100000;
// رد واحد للرمز الذي توقف أو انتهى أو اكتمل عدده: لا يفرّق بينها للمشارك
export const SPONSOR_CODE_SPENT_AR = 'انتهت صلاحية هذا الرمز أو اكتمل عدد مستخدميه. تواصل مع جهتك، أو تابع دونه وتربطك الإدارة لاحقًا.';

export const normalizeSponsorCode = (s) => String(s ?? '').trim().toLowerCase();

// بادئة الرمز من اسم الجهة المختصر أو الإنجليزي (MANZ من Manzoma)، وإلا «org»
export function codePrefix(org = {}) {
  for (const s of [org.short_name, org.name_en, org.name]) {
    const ascii = String(s || '').toLowerCase().replace(/[^a-z]/g, '');
    if (ascii.length >= 2) return ascii.slice(0, 4);
  }
  return 'org';
}

// bytes: أرقام عشوائية (0-255) يمررها المستدعي، فتبقى الدالة نقية وقابلة للاختبار
// 8 أحرف عشوائية على الأقل في مجموعتين من أربعة: manz-7k4q-x9m2 (31^8 ≈ 8.5×10^11، فلا تُخمَّن بالمحاولات المحدودة)
export const RANDOM_CHARS = 8;
export function formatCode(prefix, bytes) {
  const chars = [...bytes].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
  return [prefix, ...chars.match(/.{1,4}/g)].join('-');
}

// حالة الرمز الآن: الإيقاف أولًا، ثم الانتهاء، ثم اكتمال العدد
export function codeState(c, now = Date.now()) {
  if (!c) return 'unknown';
  if (c.active === false) return 'stopped';
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return 'expired';
  if (c.max_uses != null && Number(c.used || 0) >= Number(c.max_uses)) return 'exhausted';
  return 'active';
}
export const CODE_STATE_AR = { active: 'فعّال', stopped: 'موقوف', expired: 'منتهٍ', exhausted: 'اكتمل العدد', unknown: 'غير معروف' };

export const usageAr = (c) => (c.max_uses != null ? `${Number(c.used || 0)} من ${c.max_uses}` : `${Number(c.used || 0)} · بلا حد`);

// رسالة قصيرة يرسلها المدير أو المنسق للمشارك: الرابط والرمز وأين يكتبه
export const participantMessage = (code, url, orgName = '') =>
  `${orgName ? `ترعى ${orgName} مشاركتك في برنامج القادة. ` : ''}سجّل من ${url} ثم اكتب الرمز ${code.toUpperCase()} في «رشّحتك جهة؟».`;

// تحقق مدخلات الإنشاء والتعديل: يعيد { value } أو { error } بالعربية
export function cleanMaxUses(v) {
  if (v === '' || v == null) return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_USES_LIMIT) return { error: 'عدد المستخدمين رقم صحيح من 1 فأكثر، أو اتركه فارغًا بلا حد' };
  return { value: n };
}
export function cleanExpiry(v) {
  if (v === '' || v == null) return { value: null };
  // تاريخ وحده (من حقل التاريخ) ينتهي آخر ذلك اليوم بتوقيت الرياض
  const s = String(v);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59+03:00`) : new Date(s);
  if (Number.isNaN(t.getTime())) return { error: 'تاريخ الانتهاء غير صالح' };
  return { value: t.toISOString() };
}
