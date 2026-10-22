// ════════════════════════════════════════════════════════════════
// نسب الزائر لجهته: رمز الرابط، والحملة، والموقع الذي جاء منه
// ════════════════════════════════════════════════════════════════
// يُلتقط عند أول تحميل ويبقى 30 يومًا في المتصفح حتى يسجّل الزائر.
// رابط جديد برمز جهة يحل محل القديم؛ أما الموقع المُحيل فيُحفظ أول مرة فقط.
const KEY = 'mi_leaders_ref';
export const KEEP_DAYS = 30;

const clean = (v, re) => {
  const s = String(v || '').trim().toLowerCase();
  return re.test(s) ? s : '';
};
export const cleanCode = (v) => clean(v, /^[a-z0-9-]{4,40}$/);
export const cleanCampaign = (v) => clean(v, /^[a-z0-9_-]{1,40}$/);

export function refHost(referrer, ownHost) {
  try {
    const h = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    return h && h !== String(ownHost || '').toLowerCase().replace(/^www\./, '') ? h : '';
  } catch { return ''; }
}

// يدمج ما وصل الآن مع المحفوظ وفق قواعد الأولوية
export function mergeAttribution(prev, incoming, now = Date.now()) {
  const fresh = prev && now - (prev.at || 0) < KEEP_DAYS * 864e5 ? prev : null;
  const next = { org: '', campaign: '', ref: '', ...(fresh || {}) };
  if (incoming.org) {
    next.org = incoming.org;
    next.campaign = incoming.campaign || '';
    next.at = now;
  } else if (incoming.campaign && !next.campaign) {
    next.campaign = incoming.campaign;
  }
  if (incoming.ref && !next.ref) { next.ref = incoming.ref; next.at = next.at || now; }
  if (!next.at) next.at = now;
  return next.org || next.campaign || next.ref ? next : null;
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function captureAttribution() {
  const q = new URLSearchParams(location.search);
  const incoming = {
    org: cleanCode(q.get('org')),
    campaign: cleanCampaign(q.get('c') || q.get('utm_campaign')),
    ref: refHost(document.referrer, location.hostname),
  };
  const next = mergeAttribution(read(), incoming);
  try { if (next) localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* تصفح خاص */ }
  // رابط نظيف في شريط العنوان
  if (['org', 'c', 'utm_campaign', 'utm_source', 'utm_medium'].some((k) => q.has(k))) {
    ['org', 'c', 'utm_campaign', 'utm_source', 'utm_medium', 'utm_content', 'utm_term'].forEach((k) => q.delete(k));
    const s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? `?${s}` : '') + location.hash);
  }
  return next;
}

// ما يُرسل للخادم مع التسجيل
export function attribution() {
  const a = mergeAttribution(read(), {});
  return a ? { org: a.org || undefined, campaign: a.campaign || undefined, ref: a.ref || undefined } : {};
}
