// ════════════════════════════════════════════════════════════════
// تصدير مبادرات الدفعة (تصور 2026-11-27، المرحلة 1): ملخص المعتمد وحده بالنسخة المؤسسية في ملف XLSX
// ════════════════════════════════════════════════════════════════
// الصفوف من admin.cohort-export وحده (بلا بيانات تواصل، والخادم يسجل cohort_export)، والأعمدة والتقسيم من cohort-export.js،
// والملف من نافذة التصدير الموحدة (ExportDialog) بهويتها.
// المرحلة 2: «الكتاب المدمج (PDF)»: كل مبادرة من admin.doc-export وfinalDocument (المصدر الواحد للوثيقة المؤسسية) بالتتابع، عبر
// العامل المتجهي بتذكرتها مع إعادة عند 429، وإلا المتصفح، ثم الدمج بـ pdf-lib بغلاف الدفعة والملخص التنفيذي (src/lib/brand/cohort-export.js).
// كل مجلد من d.volumes ملف مستقل (التقسيم التلقائي)، والإيقاف ممكن في أي لحظة، والمتعذر يُذكر بالاسم.
// المرحلة 3: فهرس في الغلاف بأرقام صفحات تقفز إلى بداية كل مبادرة، وإشارات بمستويين (المبادرة ثم فصولها)، وملف العامل
// يُخزن في IndexedDB ببصمة الوثيقة (docKey) فيعيد الاستئناف ما لم يتغير دون توليد جديد.
// المرحلة 4: ما يتجاوز نحو 80MB أو 600 صفحة يُنزّل أجزاء مرقمة بالغلاف والملخص نفسيهما، وخيار ZIP للمبادرات منفردة.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { L } from '../leaders.js';
import { Spinner, useEscape } from '../ui.jsx';
import { ExportDialog } from '../ExportButton.jsx';
import { sheetColumns } from '../../../supabase/functions/leaders-api/cohort-export.js';

const BOOK_OPTIONS = { annex: false, decision: false, appendix: false, qr: true };

/** يبني مجلدًا واحدًا: يولد مبادراته بالتتابع ثم يدمجها بالغلاف والملخص ويحفظ الملف */
async function buildVolume({ cohort, rows, volume, signal, onProgress, zip = false }) {
  const [B, { finalDocument }, { pdfServer }, { humanDate }] = await Promise.all([
    import('../../../src/lib/brand/cohort-export.js'), import('../../../src/lib/brand/institutional.js'),
    import('../../../src/lib/brand/pdf-source.js'), import('../../../src/lib/brand/doc.js'),
  ]);
  let docMeta = null;
  const cache = B.idbCache();
  const run = await B.runBook(rows, {
    signal, onProgress,
    part: async (r) => {
      const x = await L('admin.doc-export', { participant_id: r.participant_id, preset: 'send', options: BOOK_OPTIONS });
      if (!x?.success) throw new Error(x?.message || 'تعذر جلب الوثيقة');
      docMeta = docMeta || x.doc?.meta || null;
      const out = finalDocument(x.doc, BOOK_OPTIONS);
      // المفتاح لوثيقة هذا المشارك وحده، فلا تُستعار وثيقة مشارك آخر ولو تطابق محتواهما
      const key = await B.docKey({ participant_id: r.participant_id, meta: out.meta }, out.body).catch(() => null);
      const p = await B.cachedPart(key, () => B.renderPart(out.meta, out.body, x.pdf), cache);
      return { ...p, fingerprint: B.bookCode(x.doc) };
    },
  });
  if (run.cancelled || !run.parts.length) return run;
  onProgress({ done: rows.length, total: rows.length, name: '', merging: true });
  const sizes = await Promise.all(run.parts.map(async (p) => ({ id: p.id, size: p.bytes.byteLength, pages: await B.pageCount(p.bytes) })));
  const server = await pdfServer();
  const label = (r) => [r.full_name, r.initiative].filter(Boolean).join(': ');
  const byId = Object.fromEntries(rows.map((r) => [r.participant_id, r]));
  const date = humanDate(new Date());
  // المرحلة 4: ما يتجاوز السقف يُقسم إلى أجزاء مرقمة، لكل منها الغلاف والملخص نفسيهما، وفهرسه بأرقام صفحات مبادراته هو
  const groups = B.splitBySize(sizes, splitLimits(B), { size: 512 * 1024, pages: 3 });
  for (let g = 0; g < groups.length; g++) {
    const ids = groups[g];
    const mine = sizes.filter((x) => ids.includes(x.id));
    const part = { n: g + 1, of: groups.length };
    const coverOf = async (coverPages) => {
      const starts = B.bookStarts(coverPages, mine);
      const results = Object.fromEntries(Object.entries(run.results).map(([id, v]) => [id, { ...v, start: starts[id] }]));
      const draft = B.bookCover({ cohort, docMeta, rows: B.summaryRows(rows, results), date, volume, part });
      const pdf = await B.renderPart(draft.meta, draft.body, server);
      return { draft, pdf, pages: await B.pageCount(pdf.bytes), coverPages };
    };
    const cover = await B.settleCover(coverOf);
    const book = await B.mergeBook([{ id: 'cover', label: 'الغلاف والملخص والفهرس', bytes: cover.pdf.bytes },
      ...run.parts.filter((p) => ids.includes(p.id)).map((p) => ({ ...p, label: label(byId[p.id] || {}) || p.id }))], { title: cover.draft.meta.title });
    await B.saveBook(book.bytes, cover.draft.meta);
  }
  if (zip) {
    const files = run.parts.map((p) => ({ name: label(byId[p.id] || {}) || p.id, bytes: p.bytes }));
    const index = files.map((f, i) => B.partFileName(i + 1, f.name)).join('\n');
    const meta = B.bookCover({ cohort, docMeta, rows: [], date, volume }).meta;
    B.saveZip(B.zipParts(files, { index }), meta);
  }
  return { ...run, files: groups.length };
}

/** السقف المعتمد، ويُخفض في الاختبارات الطرفية وحدها عبر window.__MI_COHORT_SPLIT */
function splitLimits(B) {
  const o = typeof window !== 'undefined' ? window.__MI_COHORT_SPLIT : null;
  return o && o.bytes > 0 && o.pages > 0 ? o : B.SPLIT_LIMITS;
}

function BookRunner({ cohort, rows, volumes, zip, onDone }) {
  const [p, setP] = useState({ done: 0, total: rows.length, name: '' });
  const [vol, setVol] = useState(1);
  const [report, setReport] = useState(null);
  const ac = useRef(null);
  useEffect(() => {
    ac.current = new AbortController();
    const signal = ac.current.signal;
    (async () => {
      const failed = [];
      let cancelled = false;
      let files = 0;
      const list = volumes.length ? volumes : [{ n: 1, ids: rows.map((r) => r.participant_id) }];
      for (const v of list) {
        if (signal.aborted) { cancelled = true; break; }
        setVol(v.n);
        const part = rows.filter((r) => v.ids.includes(r.participant_id));
        try {
          const r = await buildVolume({ cohort, rows: part, volume: { n: v.n, of: list.length }, signal, onProgress: setP, zip });
          failed.push(...r.failed);
          files += r.files || 0;
          if (r.cancelled) { cancelled = true; break; }
        } catch (e) { failed.push({ participant_id: `v${v.n}`, full_name: `المجلد ${v.n}`, message: e?.message || String(e) }); }
      }
      setReport({ failed, cancelled, files });
    })();
    return () => ac.current?.abort();
  }, []);
  if (report) {
    return (
      <div data-testid="cohort-book-report">
        <p>{report.cancelled ? 'أُوقف التصدير.' : report.failed.length ? 'اكتمل الكتاب، وتعذرت مبادرات:' : 'اكتمل الكتاب ونُزّل.'}{!report.cancelled && report.files > 1 ? ` نُزّل في ${report.files} أجزاء مرقمة لكبر حجمه.` : ''}</p>
        {report.failed.length > 0 && <ul>{report.failed.map((f) => <li key={f.participant_id}>{f.full_name}: {f.message}</li>)}</ul>}
        <button type="button" className="btn-sm ghost" onClick={onDone}>رجوع</button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" data-testid="cohort-book-progress">
      {p.merging ? <p>يُدمج الكتاب{volumes.length > 1 ? ` (المجلد ${vol} من ${volumes.length})` : ''}…</p>
        : <p>تُجهز المبادرة <b>{Math.min(p.done + 1, p.total)}</b> من <b>{p.total}</b>{volumes.length > 1 ? ` في المجلد ${vol} من ${volumes.length}` : ''}{p.name ? <>: {p.name}</> : null}</p>}
      <progress max={p.total || 1} value={p.done} />
      <div className="la-row"><button type="button" className="btn-sm ghost" onClick={() => ac.current?.abort()}>إيقاف</button></div>
    </div>
  );
}

export default function CohortExport({ cohort, onClose }) {
  const [d, setD] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [book, setBook] = useState(false);
  const [zip, setZip] = useState(false);
  useEscape(() => { if (!sheet && !book) onClose(); });
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
            {book ? <BookRunner cohort={d.cohort || cohort} rows={rows} volumes={d.volumes || []} zip={zip} onDone={() => setBook(false)} /> : (
            <>
            <label className="la-check"><input type="checkbox" checked={zip} disabled={!rows.length} onChange={(e) => setZip(e.target.checked)} /> ومعه المبادرات منفردة (ZIP)</label>
            <div className="la-row">
              <button type="button" className="btn-sm primary" disabled={!rows.length} onClick={() => setBook(true)}>الكتاب المدمج (PDF)</button>
              <button type="button" className="btn-sm" disabled={!rows.length} onClick={() => setSheet(true)}>ملخص الدفعة (Excel)</button>
              <button type="button" className="btn-sm ghost" onClick={() => onClose()}>إغلاق</button>
            </div>
            </>)}
          </>
        )}
      </div>
    </div>
  );
}
