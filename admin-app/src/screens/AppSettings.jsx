// ════════════════════════════════════════════════════════════════
// الإعدادات العامة: القيم التي يضبطها المالك (تقييم 360، وزمن الإجابة في مراجعة القياس)
// ════════════════════════════════════════════════════════════════
// المحرر يُرسم من التعريف نفسه الذي يتحقق به الخادم (SETTINGS في settings.js)، فلا قائمة حقول ثانية هنا.
// الحفظ للمدير ذي الكتابة، ويُسجَّل في السجل بالقيمة قبل وبعد (settings.ts).
import React, { useEffect, useState } from 'react';
import { date, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { cleanGroup, SETTINGS } from '../../../supabase/functions/leaders-api/settings.js';

// أيام التذكير تُعرض مفصولة بفاصلة وتُحرَّر نصًا، ويحولها التحقق نفسه (cleanField) إلى قائمة
const asText = (v) => (Array.isArray(v) ? v.join('، ') : v ?? '');

function Field({ id, f, value, error, onChange, disabled }) {
  const hint = f.hint_ar ? <small className="la-muted" id={`${id}-h`}>{f.hint_ar}</small> : null;
  const err = error ? <small className="la-err" role="alert">{error}</small> : null;
  if (f.type === 'bool') {
    return (
      <div className="of-field">
        <label className="row"><input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined} /> <span className="of-label">{f.label_ar}</span></label>
        {hint}{err}
      </div>
    );
  }
  if (f.type === 'labels') {
    return (
      <fieldset className="of-field">
        <legend className="of-label">{f.label_ar}</legend>
        {value.map((x, i) => (
          <label key={i} className="row"><span>{i + 1}</span>
            <input value={x} disabled={disabled} maxLength={60} aria-label={`${f.label_ar}: ${i + 1}`} onChange={(e) => onChange(value.map((y, j) => (j === i ? e.target.value : y)))} /></label>
        ))}
        {hint}{err}
      </fieldset>
    );
  }
  return (
    <label className="of-field"><span className="of-label">{f.label_ar}</span>
      <input dir="ltr" inputMode={f.type === 'int' ? 'numeric' : 'decimal'} value={asText(value)} disabled={disabled}
        aria-describedby={hint ? `${id}-h` : undefined} aria-invalid={error ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value)} />
      {hint}{err}
    </label>
  );
}

function Group({ group, values, updated, canWrite, onSaved }) {
  const { toast } = useUI();
  const def = SETTINGS[group];
  const [v, setV] = useState(values);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(values); setErrors({}); }, [values]);
  const dirty = JSON.stringify(v) !== JSON.stringify(values);
  const save = async (e) => {
    e.preventDefault();
    // التحقق نفسه الذي يجريه الخادم، قبل الإرسال، فيظهر الخطأ بجوار حقله
    const c = cleanGroup(group, v);
    if (!c.ok) { setErrors(c.errors); return; }
    setBusy(true);
    const r = await L('admin.settings-save', { group, values: c.value });
    setBusy(false);
    if (!r.success) { setErrors(r.errors || { _: r.message }); toast(r.message); return; }
    setErrors({});
    toast('حُفظت الإعدادات');
    onSaved(r);
  };
  return (
    <form className="la-card" onSubmit={save} aria-labelledby={`st-${group}`}>
      <h3 id={`st-${group}`}>{def.title_ar}</h3>
      <p className="la-muted">{def.note_ar}</p>
      {updated && <p className="la-muted small">آخر تعديل: {updated.by} · {date(updated.at)}</p>}
      <div className="of-grid">
        {Object.entries(def.fields).map(([k, f]) => (
          <Field key={k} id={`st-${group}-${k}`} f={f} value={v[k]} error={errors[k]} disabled={!canWrite}
            onChange={(x) => setV((cur) => ({ ...cur, [k]: x }))} />
        ))}
      </div>
      {errors._ && <div className="la-err" role="alert">{errors._}</div>}
      {canWrite && (
        <div className="la-row">
          <button className="btn-sm primary" disabled={busy || !dirty}>{busy ? 'لحظة…' : 'حفظ'}</button>
          <button type="button" className="btn-sm ghost" disabled={busy || !dirty} onClick={() => { setV(values); setErrors({}); }}>تراجع</button>
        </div>
      )}
    </form>
  );
}

export default function AppSettings({ canWrite }) {
  const [d, setD] = useState(null);
  useEffect(() => { L('admin.settings').then(setD); }, []);
  if (!d) return <Spinner />;
  if (!d.success) return <div className="la-err">{d.message}</div>;
  return (
    <div className="stack">
      {!d.ready && <div className="la-card la-muted" role="status">مخزن الإعدادات لم يُرحَّل بعد، فتعمل القيم الافتراضية ولا يُحفظ تعديل حتى يُطبَّق ترحيله.</div>}
      {Object.keys(SETTINGS).map((g) => (
        <Group key={g} group={g} values={d.values[g]} updated={d.updated?.[g]} canWrite={canWrite && d.ready} onSaved={setD} />
      ))}
    </div>
  );
}
