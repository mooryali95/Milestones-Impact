// ════════════════════════════════════════════════════════════════
// البحث الشامل (Ctrl+K): مطابقة وترتيب بلا واجهة
// ════════════════════════════════════════════════════════════════
// يطابق النص العربي بعد توحيد الهمزات والتاء المربوطة والألف المقصورة
// وحذف التشكيل، فـ«اسامه» تجد «أسامة». الأولوية: تطابق تام ثم بداية ثم احتواء.

export function norm(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}

// درجة تطابق نص واحد: 3 تام · 2 بداية كلمة · 1 احتواء · 0 لا شيء
export function scoreText(q, text) {
  const t = norm(text);
  if (!q || !t) return 0;
  if (t === q) return 3;
  if (t.startsWith(q) || t.includes(` ${q}`)) return 2;
  return t.includes(q) ? 1 : 0;
}

// items: [{ kind, id, title, sub?, keys?: [نصوص إضافية] }] → أفضل النتائج مرتبة، بحد لكل نوع
export function rank(query, items, { perKind = 6 } = {}) {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored = items
    .map((it) => ({ it, s: Math.max(scoreText(q, it.title) * 2, ...(it.keys || []).map((k) => scoreText(q, k))) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(a.it.title).localeCompare(String(b.it.title), 'ar'));
  const per = {};
  return scored.filter(({ it }) => (per[it.kind] = (per[it.kind] || 0) + 1) <= perKind).map(({ it }) => it);
}

export const KIND_LABEL = { participant: 'مشارك', org: 'جهة', track: 'مسار', chapter: 'باب', model: 'نموذج', tab: 'قسم' };
