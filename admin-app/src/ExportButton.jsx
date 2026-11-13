// زر التصدير الموحد: يسأل ماذا تصدّر وأي أعمدة، ثم يخرج ملف Excel بهوية واحدة. المنطق في exports.js.
import React, { useState } from 'react';
import { chosenColumns, loadColumns, rowsFor, saveColumns, subtitleFor, tableOf, whichOptions } from './exports.js';
import { useEscape, useUI } from './ui.jsx';

export function ExportDialog({ scope, meta, columns, sets, noun, onClose }) {
  const { toast } = useUI();
  const options = whichOptions(sets);
  const [which, setWhich] = useState(options[0].key);
  const [keys, setKeys] = useState(() => chosenColumns(columns, loadColumns(scope)).map((c) => c.key));
  const [busy, setBusy] = useState(false);
  useEscape(onClose);
  const rows = rowsFor(which, sets);
  const toggle = (k) => setKeys((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    const cols = chosenColumns(columns, keys);
    saveColumns(scope, cols.length === columns.length ? columns.map((c) => c.key) : cols.map((c) => c.key));
    const { exportWorkbook } = await import('../../src/lib/brand/xlsx.js');
    const { head, body } = tableOf(rows, cols);
    await exportWorkbook({ ...meta, subtitle: [meta.subtitle, subtitleFor(which, rows.length, sets.all.length, noun)].filter(Boolean).join(' · ') }, head, body);
    setBusy(false);
    toast(`صُدّر ${rows.length} ${noun}`);
    onClose();
  };
  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="la-form mi-form exp-form" role="dialog" aria-modal="true" aria-label="تصدير Excel" onSubmit={run}>
        <h3>تصدير Excel: {meta.title}</h3>
        <fieldset className="exp-set">
          <legend>ماذا تصدّر</legend>
          {options.map((o) => (
            <label key={o.key} className="la-check">
              <input type="radio" name="exp-which" checked={which === o.key} onChange={() => setWhich(o.key)} /> <span>{o.label} <b>({o.n})</b></span>
            </label>
          ))}
        </fieldset>
        <fieldset className="exp-set">
          <legend>الأعمدة <small className="la-muted">({keys.length} من {columns.length})</small></legend>
          <div className="exp-acts">
            <button type="button" className="flt-link" onClick={() => setKeys(columns.map((c) => c.key))}>كل الأعمدة</button>
            <button type="button" className="flt-link" onClick={() => setKeys([])}>لا شيء</button>
          </div>
          <div className="exp-cols">
            {columns.map((c) => (
              <label key={c.key} className="la-check">
                <input type="checkbox" checked={keys.includes(c.key)} onChange={() => toggle(c.key)} /> <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="la-muted">اختيار الأعمدة يُحفظ لهذه القائمة في هذا المتصفح.</p>
        <div className="la-row">
          <button className="btn-sm primary" type="submit" disabled={busy || !rows.length || !keys.length}>{busy ? 'جارٍ التصدير…' : `صدّر ${rows.length} ${noun}`}</button>
          <button className="btn-sm ghost" type="button" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

/**
 * @param {{ scope: string, meta: { kind: string, title: string, sheet?: string, file: string, for?: string, code?: string, subtitle?: string },
 *   columns: { key: string, label: string, width?: number, get: (row: any) => any }[],
 *   all: any[], filtered?: any[], selected?: any[], noun?: string, className?: string, label?: string }} p
 */
export default function ExportButton({ scope, meta, columns, all, filtered = all, selected = [], noun = 'سجل', className = 'refresh-btn', label = 'تصدير Excel' }) {
  const [open, setOpen] = useState(false);
  const n = selected.length || filtered.length;
  return (
    <>
      <button className={className} type="button" disabled={!all.length} onClick={() => setOpen(true)}>
        {label}{selected.length ? ` (${n} محدد)` : filtered.length !== all.length ? ` (${n})` : ''}
      </button>
      {open && <ExportDialog scope={scope} meta={meta} columns={columns} sets={{ selected, filtered, all }} noun={noun} onClose={() => setOpen(false)} />}
    </>
  );
}
