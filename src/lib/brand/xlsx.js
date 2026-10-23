// ════════════════════════════════════════════════════════════════
// ملفات Excel بهوية Milestone Impact (xlsx حقيقي، لا CSV)
// ════════════════════════════════════════════════════════════════
// ورقة من اليمين لليسار بلا خطوط شبكة: ترويسة بالاسم والعنوان، صف بيانات
// الوثيقة، رأس جدول بلون Graphite، صفوف بخطوط شعرية، وسطر حقوق في النهاية.
// المكتبة تُحمَّل عند أول تصدير فقط، فلا تثقل الصفحات.
import { C, docId, today } from './doc.js';

const FONT = 'Noto Kufi Arabic';

// columns: [{ label, width? }]، rows: مصفوفات قيم (نص أو رقم)
// meta: { kind, title, subtitle?, for?, file: 'Participants', code?: 'wt01', sheet? }
// اسم الملف إنجليزي ثابت (Milestone-Impact_<file>[_<code>]_<تاريخ>.xlsx): بعض المتصفحات
// وأنظمة البريد تُسقط الأسماء العربية، والمحتوى نفسه عربي بالكامل.
export const fileNameFor = (meta, d = new Date()) => ['Milestone-Impact', meta.file || 'Report', meta.code, d.toISOString().slice(0, 10)]
  .filter(Boolean).map((x) => String(x).replace(/[^A-Za-z0-9-]+/g, '-')).join('_') + '.xlsx';
export async function exportWorkbook(meta, columns, rows) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const n = columns.length;
  const id = docId(meta.kind || 'XLS');
  const year = new Date().getFullYear();
  const span = (cell) => ({ ...cell, columnSpan: n });
  const blankRow = () => [span({ value: '' }), ...Array(n - 1).fill(null)];
  const fill = (cell) => [span(cell), ...Array(n - 1).fill(null)];

  const data = [
    fill({ value: 'MILESTONE IMPACT', fontSize: 9, textColor: C.gold, fontFamily: 'Noto Sans', height: 18 }),
    fill({ value: meta.title, fontSize: 18, textColor: C.graphite, height: 34, alignVertical: 'center' }),
    fill({ value: [meta.subtitle, meta.for ? `الجهة: ${meta.for}` : null, `تاريخ الإصدار: ${today()}`, `رقم الوثيقة: ${id}`].filter(Boolean).join('   ·   '), fontSize: 9, textColor: C.muted, height: 20 }),
    fill({ value: '', bottomBorderColor: C.gold, bottomBorderStyle: 'thin', height: 6 }),
    blankRow(),
    columns.map((c) => ({ value: c.label, fontWeight: 'bold', fontSize: 10, textColor: C.mist, backgroundColor: C.graphite, height: 24, alignVertical: 'center', wrap: true })),
    ...rows.map((r) => r.map((v) => ({
      value: v == null ? '' : v,
      type: typeof v === 'number' ? Number : String,
      fontSize: 10, textColor: C.graphite, height: 20, alignVertical: 'center', bottomBorderColor: C.line, bottomBorderStyle: 'thin',
    }))),
    blankRow(),
    fill({ value: `${rows.length} سجل`, fontSize: 9, textColor: C.slate }),
    fill({ value: `© ${year} Milestone Impact. جميع الحقوق محفوظة. بيانات سرية مخصصة ${meta.for ? `لـ ${meta.for}` : 'للاستخدام الداخلي'}، ولا يجوز مشاركتها مع طرف ثالث دون إذن كتابي.`, fontSize: 8, textColor: C.muted, wrap: true, height: 30, topBorderColor: C.gold, topBorderStyle: 'thin' }),
  ];

  const blob = await writeExcelFile(data, {
    sheet: (meta.sheet || 'التقرير').slice(0, 31),
    columns: columns.map((c) => ({ width: c.width || 18 })),
    rightToLeft: true,
    showGridLines: false,
    stickyRowsCount: 6,
  }, { fontFamily: FONT, fontSize: 10 }).toBlob();
  save(blob, fileNameFor(meta));
  return id;
}

// تحرير الرابط بعد مهلة كافية، وإلا فقد المتصفح اسم الملف قبل قراءته
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
