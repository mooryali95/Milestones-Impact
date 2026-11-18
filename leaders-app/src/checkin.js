// ════════════════════════════════════════════════════════════════
// مسح رمز الحضور قبل الدخول (W1، تصور الحضور 2026-11-18 ب5.5)
// ════════════════════════════════════════════════════════════════
// الرمز على الشاشة يتغير كل 30 ثانية ويُقبل دقيقة، والدخول برمز البريد يأخذ دقائق. فمن مسح وهو خارج يأخذ فورًا
// إيصالًا من الخادم (workshop.scan) يُحفظ في هذا الجهاز وحده (localStorage، لا في رابط يُشارَك)، ويُسجَّل به حضوره بعد
// الدخول بلا مسح ثانٍ. ومن مسح وهو داخل يُسجَّل برمزه مباشرة كما كان.
import { SCAN_RECEIPT_MINUTES } from '../../supabase/functions/leaders-api/logic.js';
import { countAr } from '../../supabase/functions/leaders-api/labels.js';

const KEY = 'mi_checkin';
// الرمز نفسه (قبل ترحيل الإيصال أو تعذّر الاتصال) لا يصلح بعد دقيقة على الخادم، فلا معنى لحفظه أطول من مهلة الإيصال
const LEGACY_MS = SCAN_RECEIPT_MINUTES * 6e4;

export const checkinKeep = {
  set: (v, now = Date.now()) => { try { localStorage.setItem(KEY, JSON.stringify({ ...v, at: now })); } catch { /* تخزين محجوب: يبقى في الذاكرة */ } },
  get: (now = Date.now()) => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v) return null;
      if (v.r) return Date.parse(v.exp) > now ? { r: v.r, exp: v.exp, title: v.title || '' } : null;
      // الشكل القديم { t, at } وما حُفظ بلا إيصال
      return v.t && now - v.at < LEGACY_MS ? { t: v.t, kept: true } : null;
    } catch { return null; }
  },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* لا شيء محفوظ */ } },
};

// رفض نهائي من الخادم لحظة المسح: يُعرض سببه ولا يُحفظ شيء. وما سواه (الترحيل لم يُطبَّق، أو الشبكة) يحفظ الرمز كما كان
const FINAL = new Set(['qr_invalid', 'qr_expired', 'undated', 'closed', 'method', 'rate']);

// الرمز الممسوح بلا دخول ← إيصال، أو الرمز نفسه احتياطًا، أو خطأ يُعرض في شاشة الدخول
export async function receiptFor(t, call) {
  const r = await call('workshop.scan', { t });
  if (r.success && r.receipt) return { r: r.receipt, exp: r.expires_at, title: r.session?.title || '' };
  if (FINAL.has(r.code)) return { error: r.message };
  return { t };
}

// سطر شاشة الدخول لمن مسح قبل دخوله: ما حُفظ، وكم يبقى، وأنه لا مسح ثانيًا
export function signInNote(c, now = Date.now()) {
  if (!c) return '';
  if (c.error) return `${c.error} ادخل لمتابعة رحلتك، أو امسح الرمز المعروض الآن.`;
  if (c.r) {
    const left = Math.max(1, Math.ceil((Date.parse(c.exp) - now) / 6e4));
    return `حفظنا مسحك${c.title ? ` لـ«${c.title}»` : ''}. سجّل دخولك خلال ${countAr(left, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}، ونسجّل حضورك بعده مباشرة دون مسح الرمز مرة أخرى.`;
  }
  return 'سجّل دخولك، ونسجّل حضورك بعده مباشرة دون مسح الرمز مرة أخرى.';
}
