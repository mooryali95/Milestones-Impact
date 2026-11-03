// ════════════════════════════════════════════════════════════════
// مطابقة اسم جهة مكتوب بالجهات المسجلة: للإدارة وحدها، ولا تُعرض للمشارك أبدًا
// ════════════════════════════════════════════════════════════════
// يُطبَّع الاسم (الهمزات والتاء المربوطة والتعريف والتشكيل والرموز)، ثم يُقاس بثلاث إشارات:
// تطابق كامل، واحتواء، وتقاطع الكلمات؛ ونطاق بريد المشارك إن طابق نطاقات الجهة يرفع الثقة.
const STOP = new Set(['وزارة', 'هيئة', 'شركة', 'مؤسسة', 'جامعة', 'مركز', 'الادارة', 'ادارة', 'العامة', 'عامة', 'of', 'the', 'and', 'co', 'company', 'ministry', 'authority']);

export function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')          // التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .join(' ');
}
const words = (s) => normName(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));

export function matchScore(typed, org, emailDomain = '') {
  const t = normName(typed);
  if (!t) return 0;
  const names = [org.name, org.short_name].filter(Boolean).map(normName);
  let score = 0;
  if (names.includes(t)) score = 1;
  else if (names.some((n) => n && (n.includes(t) || t.includes(n)) && Math.min(n.length, t.length) >= 3)) score = 0.8;
  else {
    const tw = new Set(words(typed));
    const best = Math.max(0, ...[org.name, org.short_name].filter(Boolean).map((n) => {
      const ow = new Set(words(n));
      if (!tw.size || !ow.size) return 0;
      const common = [...tw].filter((w) => ow.has(w)).length;
      return common / Math.max(tw.size, ow.size);
    }));
    score = best * 0.75;
  }
  const dom = String(emailDomain || '').toLowerCase();
  if (dom && (org.domains || []).some((d) => dom === d || dom.endsWith(`.${d}`))) score = Math.min(1, score + 0.35);
  return Math.round(score * 100) / 100;
}

export function suggestOrgs(typed, orgs, emailDomain = '', limit = 3) {
  return (orgs || []).map((o) => ({ id: o.id, name: o.name, short_name: o.short_name || null, score: matchScore(typed, o, emailDomain) }))
    .filter((x) => x.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, limit);
}
