// ════════════════════════════════════════════════════════════════
// نافذة نموذج عامة: حقول نصية ورقمية وقوائم ومربعات نص
// ════════════════════════════════════════════════════════════════
// fields: [{ name, label, type?: text|number|select|textarea|email, options?, rows?, dir? }]
// onSave(قيم) ← وعد بـ { success, message }. الحذف اختياري بتأكيد.
import React, { useState } from 'react';
import { useEscape, useUI } from './ui.jsx';

export default function Form({ title, fields, values = {}, onSave, onDelete, onClose }) {
  const { confirm } = useUI();
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  const set = (name) => (e) => setV({ ...v, [name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const out = Object.fromEntries(fields.map((f) => {
      const x = v[f.name];
      if (f.type === 'number') return [f.name, x === '' ? null : Number(x)];
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
        {fields.map((f) => {
          const id = `f-${f.name}`;
          const common = { id, name: f.name, value: v[f.name], onChange: set(f.name), dir: f.dir };
          return (
            <label key={f.name} htmlFor={id}>
              <span>{f.label}</span>
              {f.type === 'select' ? (
                <select {...common}>{Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              ) : f.type === 'textarea' ? <textarea {...common} rows={f.rows || 3} />
                : <input {...common} type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'} step={f.type === 'number' ? 'any' : undefined} />}
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
