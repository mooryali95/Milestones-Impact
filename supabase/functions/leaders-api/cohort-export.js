// ════════════════════════════════════════════════════════════════
// تصدير مبادرات الدفعة (تصور 2026-11-27، المرحلة 1 باعتماد المالك): المنطق الصرف المشترك بين الخادم واللوحة
// ════════════════════════════════════════════════════════════════
// القرارات: المعتمد وحده، والنسخة المؤسسية، وتُحذف بيانات التواصل (بريد وهاتف) للراعي والمشارك في التصدير الجماعي، ومنسق
// الجهة لجهته وحدها، والجدول المصاحب XLSX من هذه الصفوف نفسها، والتقسيم التلقائي إلى مجلدات للدفعات الكبيرة.

// مفاتيح التواصل الشخصي: تُحذف من كل ما يخرج في التصدير الجماعي
const CONTACT = /(^|_)(email|emails|phone|mobile|whatsapp|tel|contact)(_|$)/i;
export function withoutContact(v) {
  if (Array.isArray(v)) return v.map(withoutContact);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !CONTACT.test(k)).map(([k, x]) => [k, withoutContact(x)]));
}

// أعمدة الملخص: المصدر الواحد للجدول المصاحب، وللملخص التنفيذي في الكتاب لاحقًا
export const COHORT_EXPORT_COLUMNS = [
  { key: 'n', label: 'م' },
  { key: 'full_name', label: 'المشارك' },
  { key: 'organization', label: 'الجهة' },
  { key: 'initiative', label: 'عنوان المبادرة' },
  { key: 'sponsor', label: 'الراعي' },
  { key: 'readiness', label: 'الجاهزية %' },
  { key: 'score', label: 'الدرجة' },
  { key: 'approved_at', label: 'تاريخ الاعتماد' },
];

// حد المبادرات في المجلد الواحد: نحو 40 مبادرة × 20 صفحة يبقى الملف دون 150MB تقريبًا (التصور، البند 7)
export const COHORT_EXPORT_VOLUME = 40;

const text = (v) => String(v ?? '').trim() || null;
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** صفوف الملخص: المعتمد وحده من أعضاء الدفعة، ومع orgId صفوف تلك الجهة وحدها، مرتبة بالاسم */
export function exportRows({ people = [], capstones = [], charters = [], orgId = null } = {}) {
  const byP = new Map(people.map((p) => [p.id, p]));
  const title = new Map(charters.map((c) => [c.participant_id, text(c.answers?.title)]));
  return capstones
    .filter((c) => c.status === 'approved' && byP.has(c.participant_id))
    .filter((c) => !orgId || byP.get(c.participant_id).organization_id === orgId)
    .map((c) => {
      const p = byP.get(c.participant_id);
      return {
        participant_id: c.participant_id, full_name: text(p.full_name), organization: text(p.organization_name),
        initiative: title.get(c.participant_id) || null, sponsor: text(c.sponsor_name),
        readiness: num(c.readiness), score: num(c.score), approved_at: c.approved_at ? String(c.approved_at).slice(0, 10) : null,
      };
    })
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ar'));
}

/** أعمدة نافذة التصدير الموحدة (ExportDialog): الأعمدة نفسها بقارئ لكل منها، والترقيم المتصل من موضع الصف */
export function sheetColumns(rows) {
  const at = new Map(rows.map((r, i) => [r, i + 1]));
  return COHORT_EXPORT_COLUMNS.map((c) => ({ ...c, get: (r) => (c.key === 'n' ? at.get(r) ?? null : r[c.key] ?? null) }));
}

/** التقسيم التلقائي: مجلدات متتالية لا يتجاوز كل منها الحد، بأرقام المبادرات التي يضمها */
export function volumesOf(rows, max = COHORT_EXPORT_VOLUME) {
  const out = [];
  for (let i = 0; i < rows.length; i += max) {
    const part = rows.slice(i, i + max);
    out.push({ n: out.length + 1, from: i + 1, to: i + part.length, count: part.length, ids: part.map((r) => r.participant_id) });
  }
  return out;
}
