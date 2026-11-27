// ════════════════════════════════════════════════════════════════
// نافذة نموذج عامة: حقول نصية ورقمية وقوائم ومربعات نص
// ════════════════════════════════════════════════════════════════
// fields: [{ name, label, type?: text|number|select|multi|textarea|email|check|options|datetime|date, options?, empty?, rows?, dir?, show?, help? }]
// help ← نص إرشاد تحت عنوان الحقل، أو دالة تعيده بحسب القيم الحالية
// show(قيم) ← يظهر الحقل ويُحفظ فقط حين تعيد true (حقول تتبع نوعًا مختارًا) · datetime ← تاريخ ووقت محليان يُحفظان ISO
// check ← قيمة منطقية · multi ← مربعات اختيار من options تُحفظ مصفوفة مفاتيح · options ← قائمة [{ label, score }] · empty ← خيار فارغ أول في القائمة (يُحفظ null)
// onSave(قيم) ← وعد بـ { success, message }. الحذف اختياري بتأكيد.
// options ← كائن، أو دالة تعيده بحسب القيم الحالية (قائمة تتبع حقلًا آخر، كمدربي الدفعة المختارة) · check يقبل help أيضًا
// notes(قيم) ← سطور تنبيه قبل الأزرار [{ text, tone?: 'warn' }] · saveLabel ← نص زر الحفظ
// confirmSave(المحفوظ، القيم) ← نص تأكيد قبل الحفظ، أو null بلا تأكيد (حفظ يرسل بريدًا أو يضيف من الخط الزمني). يقبل وعدًا (معاينة
// من الخادم)، و{ text, lines, ok }: lines سطور الأثر تحت السؤال، و{ error } يوقف الحفظ برسالته، وpatch يُدمج في المحفوظ
// وcheck: { name, label, help?, checked } مربع اختيار في نافذة التأكيد، وقيمته تُدمج في المحفوظ باسمه (name)
// confirmDelete() ← سؤال الحذف بالشكل نفسه (معاينة من الخادم)، وقيمة مربعه تمر إلى onDelete({ [name]: قيمة })
// choice ← اختيار واحد صريح بأزرار راديو: options [{ value, label, help, disabled?, note? }]، وrequired نص الخطأ إن لم يُختر (بلا قيمة مسبقة)
// الإغلاق دون حفظ (Esc أو النقر خارجه أو «إلغاء») يسأل أولًا إن تغيّر شيء، فلا يضيع ما كُتب سهوًا.
// panel ← لوحة جانبية لا نافذة وسطى (المرحلة 22، 4.3 البند 3): 480px على جهة نهاية السطر، ودرج سفلي على الهاتف، بالحبس والإغلاق نفسيهما
// groups ← [{ key, title, open?, lead? }]: الحقول ذات group تُجمع تحت عنوانها، والمطوي (open: false) في details، وlead سطر أعلى القسم
// onSave يعيد { success, silent } فيُغلق بلا إعادة تحميل، أو { success, nextForm } فيفتح المحرر نموذجًا تاليًا (اختيار النوع ثم تفاصيله)
import React, { useEffect, useState } from 'react';
import { useEscape, useGuardedClose, useUI } from './ui.jsx';

// ISO ← قيمة حقل datetime-local بتوقيت المتصفح
export const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};

// حقل داخل قسم مطوي (details) يُفتح قسمه قبل تركيزه، فلا يبقى الخطأ أو الحقل المطلوب مخفيًا
const openFold = (el) => { const d = el?.closest?.('details'); if (d) d.open = true; };
export default function Form({ title, fields, values = {}, onSave, onDelete, onClose, notes = null, confirmSave = null, confirmDelete = null, saveLabel = 'حفظ', focusField = null, panel = false, groups = null, lead = null }) {
  const { confirm } = useUI();
  const [start] = useState(() => Object.fromEntries(fields.map((f) => [f.name,
    f.type === 'check' ? !!values[f.name]
      : f.type === 'options' ? (Array.isArray(values[f.name]) && values[f.name].length ? values[f.name] : [{ label: '', score: 0 }, { label: '', score: 0 }])
        : f.type === 'datetime' ? toLocal(values[f.name])
          : f.type === 'multi' ? (Array.isArray(values[f.name]) ? values[f.name] : [])
          : values[f.name] ?? ''])));
  const [v, setV] = useState(start);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useGuardedClose(JSON.stringify(v) !== JSON.stringify(start), () => onClose());
  useEscape(close);
  // focusField: يفتح النموذج على حقل بعينه (مثل «حدد الموعد» على حقل البدء، المرحلة 12)
  useEffect(() => { if (!focusField) return; const el = document.getElementById(`f-${focusField}`); openFold(el); (el?.matches('input,select,textarea') ? el : el?.querySelector('input:not([disabled]),select,textarea'))?.focus(); }, [focusField]);

  const set = (name) => (e) => setV({ ...v, [name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const out = Object.fromEntries(fields.filter((f) => !f.show || f.show(v)).map((f) => {
      const x = v[f.name];
      if (f.type === 'datetime') return [f.name, x ? new Date(x).toISOString() : null];
      if (f.type === 'number') return [f.name, x === '' ? null : Number(x)];
      if (f.type === 'check') return [f.name, !!x];
      if (f.type === 'multi') return [f.name, x];
      if (f.type === 'options') return [f.name, x.map((o) => ({ label: String(o.label).trim(), score: Number(o.score || 0) })).filter((o) => o.label)];
      return [f.name, String(x).trim() || null];
    }));
    // اختيار صريح لم يُحسم: يوقف الحفظ برسالته، فلا يُحفظ بقيمة لم يخترها أحد
    const missing = fields.find((f) => f.type === 'choice' && f.required && (!f.show || f.show(v)) && !out[f.name]);
    if (missing) { setError(missing.required); const mel = document.getElementById(`f-${missing.name}`); openFold(mel); mel?.querySelector('input:not([disabled])')?.focus(); return; }
    setBusy(true);
    const ask = confirmSave ? await confirmSave(out, v) : null;
    setBusy(false);
    if (ask?.error) { setError(ask.error); return; }
    const yes = ask && (ask.text || typeof ask === 'string') ? await confirm(ask.text || ask, { ok: ask.ok || saveLabel, lines: ask.lines || null, check: ask.check || null, danger: !!ask.danger }) : true;
    if (!yes) return;
    const picked = ask?.check ? { [ask.check.name]: yes.checked } : null;
    setBusy(true);
    const res = await onSave(ask?.patch || picked ? { ...out, ...ask.patch, ...picked } : out);
    setBusy(false);
    if (res?.success) onClose(res.nextForm ? { nextForm: res.nextForm } : res.silent ? 'silent' : true);
    else {
      setError(res?.message || 'تعذّر الحفظ');
      // خطأ مربوط بحقل (مثل رمز مكرر): يُفتح قسمه المطوي ويُركَّز، فلا يبقى الحقل مخفيًا تحت الخطأ
      const fel = res?.field ? document.getElementById(`f-${res.field}`) : null;
      if (fel) { openFold(fel); (fel.matches('input,select,textarea') ? fel : fel.querySelector('input:not([disabled]),select,textarea'))?.focus(); }
    }
  };
  const optionsOf = (f) => (typeof f.options === 'function' ? f.options(v) : f.options) || {};
  const noteList = notes ? (notes(v) || []).filter((n) => n?.text) : [];
  const remove = async () => {
    setError('');
    setBusy(true);
    const ask = confirmDelete ? await confirmDelete() : null;
    setBusy(false);
    if (ask?.error) { setError(ask.error); return; }
    const yes = await confirm(ask?.text || 'حذف نهائي؟', { danger: true, ok: ask?.ok, lines: ask?.lines || null, check: ask?.check || null });
    if (!yes) return;
    setBusy(true);
    const res = await onDelete(ask?.check ? { [ask.check.name]: yes.checked } : {});
    setBusy(false);
    if (res?.success) onClose(true); else setError(res?.message || 'تعذّر الحذف');
  };

  const field = (f) => {
          const id = `f-${f.name}`;
          const common = { id, name: f.name, value: v[f.name], onChange: set(f.name), dir: f.dir, readOnly: f.readOnly || undefined };
          if (f.type === 'check') {
            const help = typeof f.help === 'function' ? f.help(v) : f.help;
            return (
              <label key={f.name} htmlFor={id} className={`la-check${help ? ' with-help' : ''}`}>
                <input id={id} type="checkbox" checked={v[f.name]} aria-describedby={help ? `${id}-help` : undefined} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} /> <span>{f.label}{help && <small id={`${id}-help`} className="la-muted">{help}</small>}</span>
              </label>
            );
          }
          if (f.type === 'choice') {
            const help = typeof f.help === 'function' ? f.help(v) : f.help;
            return (
              <fieldset key={f.name} id={id} className="la-choice" data-testid={`choice-${f.name}`}>
                <legend>{f.label}</legend>
                {help && <small className="la-muted">{help}</small>}
                <div className="la-choice-opts">
                  {f.options.map((o) => (
                    <label key={o.value} className={`la-choice-opt${v[f.name] === o.value ? ' on' : ''}${o.disabled ? ' off' : ''}`}>
                      <input type="radio" name={f.name} value={o.value} checked={v[f.name] === o.value} disabled={o.disabled || undefined} aria-label={o.label} aria-describedby={`${id}-${o.value}`} onChange={() => setV({ ...v, [f.name]: o.value })} />
                      <span><b>{o.label}</b>{o.note && <small className="la-chip warn">{o.note}</small>}<small id={`${id}-${o.value}`} className="la-muted">{o.help}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          if (f.type === 'multi') {
            const list = v[f.name];
            const help = typeof f.help === 'function' ? f.help(v) : f.help;
            return (
              <fieldset key={f.name} className="la-multi">
                <legend>{f.label}</legend>
                {help && <small className="la-muted">{help}</small>}
                {Object.entries(f.options).map(([k, l]) => (
                  <label key={k} className="la-check">
                    <input type="checkbox" checked={list.includes(k)} onChange={(e) => setV({ ...v, [f.name]: e.target.checked ? [...list, k] : list.filter((x) => x !== k) })} /> <span>{l}</span>
                  </label>
                ))}
              </fieldset>
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
          const help = typeof f.help === 'function' ? f.help(v) : f.help;
          return (
            <label key={f.name} htmlFor={id}>
              <span>{typeof f.label === 'function' ? f.label(v) : f.label}</span>
              {help && <small className="la-muted">{help}</small>}
              {f.type === 'select' ? (
                <select {...common} disabled={f.readOnly || undefined}>{f.empty != null && <option value="">{f.empty}</option>}{Object.entries(optionsOf(f)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              ) : f.type === 'textarea' ? <textarea {...common} rows={f.rows || 3} />
                : <input {...common} type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'datetime' ? 'datetime-local' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? 'any' : undefined} />}
            </label>
          );
        };
  return (
    <div className={`mid-ov${panel ? ' j-panel-ov' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className={`la-form mi-form${panel ? ' j-panel' : ''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <h3>{title}</h3>
        {lead && <p className="la-muted j-panel-lead">{lead}</p>}
        {!groups ? fields.filter((f) => !f.show || f.show(v)).map(field) : (<>
          {fields.filter((f) => !f.show || f.show(v)).filter((f) => !f.group).map(field)}
          {groups.map((g) => {
            const list = fields.filter((f) => !f.show || f.show(v)).filter((f) => f.group === g.key);
            if (!list.length) return null;
            const inner = <>{g.lead && <p className="la-rule">{g.lead}</p>}{list.map(field)}</>;
            return g.open === false
              ? <details key={g.key} className="la-form-group" data-group={g.key}><summary>{g.title}</summary>{inner}</details>
              : <fieldset key={g.key} className="la-form-group" data-group={g.key}><legend>{g.title}</legend>{inner}</fieldset>;
          })}
        </>)}
        {noteList.length > 0 && (
          <ul className="la-form-notes" data-testid="form-notes">
            {noteList.map((n) => <li key={n.text} className={n.tone === 'warn' ? 'warn' : ''}>{n.tone === 'warn' && <span aria-hidden="true">! </span>}{n.text}</li>)}
          </ul>
        )}
        {error && <div className="la-err" role="alert">{error}</div>}
        <div className="la-row">
          <button className="btn-sm primary" type="submit" disabled={busy}>{saveLabel}</button>
          <button className="btn-sm ghost" type="button" onClick={close}>إلغاء</button>
          {onDelete && <><span style={{ flex: 1 }} /><button className="btn-sm danger" type="button" onClick={remove} disabled={busy}>حذف</button></>}
        </div>
      </form>
    </div>
  );
}
