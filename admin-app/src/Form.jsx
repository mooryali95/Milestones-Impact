// ════════════════════════════════════════════════════════════════
// نافذة نموذج عامة: حقول نصية ورقمية وقوائم ومربعات نص
// ════════════════════════════════════════════════════════════════
// fields: [{ name, label, type?: text|number|select|textarea|email|check|options|datetime, options?, empty?, rows?, dir?, show? }]
// show(قيم) ← يظهر الحقل ويُحفظ فقط حين تعيد true (حقول تتبع نوعًا مختارًا) · datetime ← تاريخ ووقت محليان يُحفظان ISO
// check ← قيمة منطقية · options ← قائمة [{ label, score }] · empty ← خيار فارغ أول في القائمة (يُحفظ null)
// onSave(قيم) ← وعد بـ { success, message }. الحذف اختياري بتأكيد.
import React, { useState } from 'react';
import { useEscape, useUI } from './ui.jsx';

// ISO ← قيمة حقل datetime-local بتوقيت المتصفح
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};

export default function Form({ title, fields, values = {}, onSave, onDelete, onClose }) {
  const { confirm } = useUI();
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.name,
    f.type === 'check' ? !!values[f.name]
      : f.type === 'options' ? (Array.isArray(values[f.name]) && values[f.name].length ? values[f.name] : [{ label: '', score: 0 }, { label: '', score: 0 }])
        : f.type === 'datetime' ? toLocal(values[f.name])
          : values[f.name] ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  const set = (name) => (e) => setV({ ...v, [name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const out = Object.fromEntries(fields.filter((f) => !f.show || f.show(v)).map((f) => {
      const x = v[f.name];
      if (f.type === 'datetime') return [f.name, x ? new Date(x).toISOString() : null];
      if (f.type === 'number') return [f.name, x === '' ? null : Number(x)];
      if (f.type === 'check') return [f.name, !!x];
      if (f.type === 'options') return [f.name, x.map((o) => ({ label: String(o.label).trim(), score: Number(o.score || 0) })).filter((o) => o.label)];
      return [f.name, String(x).trim() || null];
    }));
    const res = await onSave(out);
    setBusy(false);
    if (res?.success) onClose(true); else setError(res?.message || 'تعذّر الحفظ');
  };
  const remove = async () => {
    if (!(await confirm('حذف نهائي؟', { danger: true }))) return;
    setBusy(true);
    const res = await onDelete();
    setBusy(false);
    if (res?.success) onClose(true); else setError(res?.message || 'تعذّر الحذف');
  };

  return (
    <div className="mid-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="la-form mi-form" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <h3>{title}</h3>
        {fields.filter((f) => !f.show || f.show(v)).map((f) => {
          const id = `f-${f.name}`;
          const common = { id, name: f.name, value: v[f.name], onChange: set(f.name), dir: f.dir };
          if (f.type === 'check') {
            return (
              <label key={f.name} htmlFor={id} className="la-check">
                <input id={id} type="checkbox" checked={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} /> <span>{f.label}</span>
              </label>
            );
          }
          if (f.type === 'options') {
            const list = v[f.name];
            const put = (next) => setV({ ...v, [f.name]: next });
            return (
              <div key={f.name} className="la-opts">
                <span>{f.label}</span>
                {list.map((o, i) => (
                  <div key={i} className="la-opt">
                    <input value={o.label} placeholder="نص الخيار" aria-label={`الخيار ${i + 1}`} onChange={(e) => put(list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                    <input type="number" step="any" value={o.score} title="الدرجة" aria-label={`درجة الخيار ${i + 1}`} onChange={(e) => put(list.map((x, k) => (k === i ? { ...x, score: e.target.value } : x)))} />
                    <button type="button" className="la-link" aria-label={`حذف الخيار ${i + 1}`} onClick={() => put(list.filter((_, k) => k !== i))}>✕</button>
                  </div>
                ))}
                <button type="button" className="la-link" onClick={() => put([...list, { label: '', score: 0 }])}>+ خيار</button>
              </div>
            );
          }
          return (
            <label key={f.name} htmlFor={id}>
              <span>{f.label}</span>
              {f.type === 'select' ? (
                <select {...common}>{f.empty != null && <option value="">{f.empty}</option>}{Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              ) : f.type === 'textarea' ? <textarea {...common} rows={f.rows || 3} />
                : <input {...common} type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'datetime' ? 'datetime-local' : 'text'} step={f.type === 'number' ? 'any' : undefined} />}
            </label>
          );
        })}
        {error && <div className="la-err" role="alert">{error}</div>}
        <div className="la-row">
          <button className="btn-sm primary" type="submit" disabled={busy}>حفظ</button>
          <button className="btn-sm ghost" type="button" onClick={() => onClose()}>إلغاء</button>
          {onDelete && <><span style={{ flex: 1 }} /><button className="btn-sm danger" type="button" onClick={remove} disabled={busy}>حذف</button></>}
        </div>
      </form>
    </div>
  );
}
