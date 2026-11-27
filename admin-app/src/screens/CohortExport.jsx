// ════════════════════════════════════════════════════════════════
// تصدير مبادرات الدفعة (تصور 2026-11-27، المرحلة 1): ملخص المعتمد وحده بالنسخة المؤسسية في ملف XLSX
// ════════════════════════════════════════════════════════════════
// الصفوف من admin.cohort-export وحده (بلا بيانات تواصل، والخادم يسجل cohort_export)، والأعمدة والتقسيم من cohort-export.js،
// والملف من نافذة التصدير الموحدة (ExportDialog) بهويتها. الكتاب المدمج PDF في المرحلة التالية من الخطة نفسها.
import React, { useEffect, useMemo, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useEscape } from '../ui.jsx';
import { ExportDialog } from '../ExportButton.jsx';
import { sheetColumns } from '../../../supabase/functions/leaders-api/cohort-export.js';

export default function CohortExport({ cohort, onClose }) {
  const [d, setD] = useState(null);
  const [sheet, setSheet] = useState(false);
  useEscape(() => { if (!sheet) onClose(); });
  useEffect(() => { L('admin.cohort-export', { cohort_id: cohort.id }).then(setD); }, [cohort.id]);
  const rows = d?.success ? d.rows : [];
  const columns = useMemo(() => sheetColumns(rows), [rows]);
  if (sheet) {
    return <ExportDialog scope="cohort-initiatives" noun="مبادرة" columns={columns} sets={{ all: rows, filtered: rows }}
      meta={{ title: `مبادرات ${d.cohort?.name || cohort.name}`, subtitle: 'المبادرات المعتمدة، النسخة المؤسسية', file: 'Cohort-Initiatives', kind: 'XLS', sheet: 'ملخص الدفعة' }}
      onClose={() => setSheet(false)} />;
  }
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="la-form mi-form cv-form" role="dialog" aria-modal="true" aria-label={`تصدير مبادرات ${cohort.name}`}>
        <h3>تصدير مبادرات «{cohort.name}»</h3>
        {!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : (
          <>
            <p className="la-muted">المبادرات المعتمدة وحدها، بالنسخة المؤسسية، ومن غير بريد أو هاتف للراعي أو المشارك.</p>
            {rows.length ? (
              <p data-testid="cohort-export-count"><b>{rows.length}</b> مبادرة معتمدة{d.volumes.length > 1 && <> تُقسم تلقائيًا إلى <b>{d.volumes.length}</b> مجلدات</>}.</p>
            ) : <p className="la-muted" data-testid="cohort-export-empty">لا مبادرة معتمدة في هذه الدفعة بعد.</p>}
            <div className="la-row">
              <button type="button" className="btn-sm primary" disabled={!rows.length} onClick={() => setSheet(true)}>ملخص الدفعة (Excel)</button>
              <button type="button" className="btn-sm ghost" onClick={() => onClose()}>إغلاق</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
