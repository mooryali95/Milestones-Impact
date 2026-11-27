// زر التصدير الموحد: يسأل ماذا تصدّر وأي أعمدة، ثم يخرج ملف Excel بهوية واحدة. المنطق في exports.js.
import React, { useState } from 'react';
import { chosenColumns, loadColumns, rowsFor, saveColumns, sensitivePicked, subtitleFor, tableOf, whichOptions } from './exports.js';
import { useEscape, useUI } from './ui.jsx';

// isTest: إن مُرّرت ظهر خيار «تضمين حسابات الاختبار» مطفأً افتراضيًا (withTest يبدأ به)، فلا تدخل الاختبارات الملف إلا صراحة (المرحلة 9)
export function ExportDialog({ scope, meta, columns, sets: given, noun, onClose, isTest = null, withTest: startWith = false }) {
  const { toast } = useUI();
  const [withTest, setWithTest] = useState(startWith);
  const sets = isTest && !withTest ? Object.fromEntries(Object.entries(given).map(([k, v]) => [k, (v || []).filter((r) => !isTest(r))])) : given;
  const testN = isTest ? (given.all || []).filter(isTest).length : 0;
  const options = whichOptions(sets);
  const [pick, setWhich] = useState(options[0].key);
  // الاختيار يبقى صالحًا إن تغيرت الخيارات بتبديل حسابات الاختبار
  const which = options.some((o) => o.key === pick) ? pick : options[0].key;
  const [keys, setKeys] = useState(() => chosenColumns(columns, loadColumns(scope)).map((c) => c.key));
  const [busy, setBusy] = useState(false);
  useEscape(onClose);
  const rows = rowsFor(which, sets);
  const toggle = (k) => setKeys((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    const cols = chosenColumns(columns, keys);
    saveColumns(scope, cols.map((c) => c.key));
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
          {isTest && testN > 0 && (
            <label className="la-check exp-test">
              <input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} /> <span>تضمين حسابات الاختبار <b>({testN})</b></span>
            </label>
          )}
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
        {sensitivePicked(columns, keys).length > 0 && (
          <p className="exp-warn" role="status">تنبيه: اخترت بيانات شخصية ({sensitivePicked(columns, keys).map((c) => c.label).join('، ')}). احفظ الملف في مكان آمن ولا تشاركه إلا لحاجة.</p>
        )}
        <p className="la-muted">اختيار الأعمدة يُحفظ لهذه القائمة في هذا المتصفح.</p>
        <div className="la-row">
          <button className="btn-sm primary" type="submit" disabled={busy || !rows.length || !keys.length}>{busy ? 'جارٍ التصدير…' : `صدّر ${rows.length} ${noun}`}</button>
          <button className="btn-sm ghost" type="button" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}

export const EXPORT_EMPTY = 'لا سجلات في هذا العرض';
// نص الزر وحاله: المحدد أولًا، ثم المرشح إن اختلف عن الكل. الصفر في العرض يعطل الزر بلا «(0)»
export function exportLabel({ label, all, filtered, selected = 0 }) {
  const n = selected || filtered;
  if (!all || !n) return { text: label, empty: true };
  return { text: `${label}${selected ? ` (${n} محدد)` : filtered !== all ? ` (${n})` : ''}`, empty: false };
}

/**
 * @param {{ scope: string, meta: { kind: string, title: string, sheet?: string, file: string, for?: string, code?: string, subtitle?: string },
 *   columns: { key: string, label: string, width?: number, get: (row: any) => any }[],
 *   all: any[], filtered?: any[], selected?: any[], noun?: string, className?: string, label?: string }} p
 */
export default function ExportButton({ scope, meta, columns, all, filtered = all, selected = [], noun = 'سجل', className = 'refresh-btn', label = 'تصدير Excel', isTest = null, withTest = false }) {
  const [open, setOpen] = useState(false);
  const { text, empty } = exportLabel({ label, all: all.length, filtered: filtered.length, selected: selected.length });
  // عند الصفر (المرحلة 15): الزر يبقى مكانه وفي ترتيب Tab بـaria-disabled، وسببه في title ونص sr-only، ولا يُعرض «(0)»
  return (
    <>
      <button className={className} type="button" aria-disabled={empty ? 'true' : undefined} title={empty ? EXPORT_EMPTY : undefined} onClick={() => { if (!empty) setOpen(true); }}>
        {text}{empty && <span className="sr-only">: {EXPORT_EMPTY}</span>}
      </button>
      {open && <ExportDialog scope={scope} meta={meta} columns={columns} sets={{ selected, filtered, all }} noun={noun} isTest={isTest} withTest={withTest} onClose={() => setOpen(false)} />}
    </>
  );
}
