// رمز الرابط المفتوح (?t=) لشاشات المقيّم والراعي ومؤكد الأثر وعرض الخبير: يُقرأ مرة ثم يُزال من العنوان،
// فلا يبقى في سجل التصفح ولا في لقطة شاشة ولا في عنوان يُنسخ (تدقيق 2026-11-14، F7 / L3).
// يبقى في sessionStorage لهذا التبويب وحده بمفتاح المسار، فإعادة تحميل الصفحة لا تُضيع الرابط.
const KEY = (path) => `mi_link_${path}`;

export function linkToken(loc = window.location, hist = window.history, store = window.sessionStorage) {
  const q = new URLSearchParams(loc.search);
  const fromUrl = q.get('t') || '';
  if (fromUrl) {
    try { store.setItem(KEY(loc.pathname), fromUrl); } catch { /* وضع خاص: يبقى في الذاكرة لهذا التحميل */ }
    q.delete('t');
    const rest = q.toString();
    try { hist.replaceState(null, '', loc.pathname + (rest ? `?${rest}` : '') + (loc.hash || '')); } catch { /* */ }
    return fromUrl;
  }
  try { return store.getItem(KEY(loc.pathname)) || ''; } catch { return ''; }
}
