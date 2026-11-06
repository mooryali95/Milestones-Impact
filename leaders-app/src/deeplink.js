// ════════════════════════════════════════════════════════════════
// رابط يفتح قسمًا بعينه في منصة المشارك: /?tab=profile
// ════════════════════════════════════════════════════════════════
// يرسله بريد الأمان (أجهزتك) وإشعار مشاركة الجهة (ماذا ترى جهتك) في core.ts. يُقرأ مرة عند الإقلاع
// ويُحذف من العنوان، والقسم غير المتاح بعد يقع على الرحلة بحراس العرض نفسها في App.jsx.
export const TABS = ['profile', 'handbook', 'capstone', 'hall', 'impact', 'lab'];

/** @returns {{ view: string, search: string } | null} القسم وما بقي من العنوان، أو null حين لا رابط قسم */
export function tabFromSearch(search) {
  const q = new URLSearchParams(search);
  if (!q.has('tab')) return null;
  const t = q.get('tab');
  q.delete('tab');
  const rest = q.toString();
  return { view: TABS.includes(t) ? t : 'home', search: rest ? `?${rest}` : '' };
}
