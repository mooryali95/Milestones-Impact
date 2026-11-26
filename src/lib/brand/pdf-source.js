// ════════════════════════════════════════════════════════════════
// مصدر تذكرة مولّد PDF على الخادم (المرحلة 3أ): ملف صغير بلا محرك، يسجله كل تطبيق عند إقلاعه
// ════════════════════════════════════════════════════════════════
// writeDocument (doc.js) وdownloadBest (pdf.js) يقرآنه لحظة النقر. الدالة تطلب pdf.ticket بجلسة التطبيق وتعيد { url, ticket } أو null.
// بلا مصدر، أو حين يعيد null أو يتعذر: يبني المتصفح الملف كما كان.
let source = null;
/** @param {null | (() => Promise<{ url: string, ticket: string } | null>)} fn */
export const setPdfTicketSource = (fn) => { source = typeof fn === 'function' ? fn : null; };
/** @param {null | (() => Promise<any>)} [own] مصدر لهذه الوثيقة وحدها */
export async function pdfServer(own = null) {
  const fn = own || source;
  if (!fn) return null;
  try { const t = await fn(); return t?.url && t?.ticket ? t : null; } catch { return null; }
}
