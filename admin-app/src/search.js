// ════════════════════════════════════════════════════════════════
// البحث الشامل (Ctrl+K): مطابقة وترتيب بلا واجهة
// ════════════════════════════════════════════════════════════════
// يطابق النص العربي بعد توحيد الهمزات والتاء المربوطة والألف المقصورة
// وحذف التشكيل، فـ«اسامه» تجد «أسامة». الأولوية: تطابق تام ثم بداية ثم احتواء.

// التوحيد من search-text.js: المصدر نفسه لبحث قائمة المشاركين وبحث الخادم
import { foldText, phoneMatches, phoneNeedle } from '../../supabase/functions/leaders-api/search-text.js';

export const norm = foldText;

// درجة تطابق نص واحد: 3 تام · 2 بداية كلمة · 1 احتواء · 0 لا شيء
export function scoreText(q, text) {
  const t = norm(text);
  if (!q || !t) return 0;
  if (t === q) return 3;
  if (t.startsWith(q) || t.includes(` ${q}`)) return 2;
  return t.includes(q) ? 1 : 0;
}

// items: [{ kind, id, title, sub?, keys?: [نصوص إضافية], phone? }] → أفضل النتائج مرتبة، بحد لكل نوع.
// phone: جوال المشارك، يُطابَق بأي صيغة يُكتب بها (05 و5 و9665 و+9665) ولا يدخل في النصوص
export function rank(query, items, { perKind = 6 } = {}) {
  const q = norm(query);
  if (q.length < 2) return [];
  const byPhone = !!phoneNeedle(query);
  const scored = items
    .map((it) => ({ it, s: Math.max(scoreText(q, it.title) * 2, ...(it.keys || []).map((k) => scoreText(q, k)), byPhone && phoneMatches(query, it.phone) ? 2 : 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(a.it.title).localeCompare(String(b.it.title), 'ar'));
  const per = {};
  return scored.filter(({ it }) => (per[it.kind] = (per[it.kind] || 0) + 1) <= perKind).map(({ it }) => it);
}

export const KIND_LABEL = { participant: 'مشارك', org: 'جهة', expert: 'خبير', cohort: 'دفعة', capstone: 'مبادرة', track: 'مسار', chapter: 'باب', model: 'نموذج', tab: 'قسم' };
