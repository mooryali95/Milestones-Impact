// شريط الفلترة الموحّد: بحث، وعروض سريعة بعدّاداتها، وحقول، ورقائق للفلاتر المفعّلة،
// وعروض محفوظة باسم. المنطق في filters.js، والحالة في عنوان الصفحة عبر useFilters.
import React, { useEffect, useState } from 'react';
import { activeChips, decodeState, deleteView, encodeState, isFiltered, loadViews, PERIODS, saveView } from './filters.js';
import { readQuery, writeQuery } from './route.js';

// حالة الفلاتر لشاشة واحدة، مقروءة من العنوان ومكتوبة إليه
export function useFilters(keys, initial = {}) {
  const [state, setState] = useState(() => {
    const fromUrl = decodeState(readQuery(), keys);
    return isFiltered(fromUrl) ? fromUrl : { ...decodeState('', keys), ...initial };
  });
  useEffect(() => { writeQuery(encodeState(state)); }, [state]);
  useEffect(() => () => writeQuery(''), []);   // مغادرة الشاشة تُفرغ الفلاتر من العنوان
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const clear = () => setState(decodeState('', keys));
  return [state, set, clear, setState];
}

export default function FilterBar({ scope, state, set, clear, replace, fields = [], presets = [], counts = {}, shown, total, noun, placeholder, actions }) {
  const [views, setViews] = useState(() => loadViews(scope));
  const [more, setMore] = useState(false);
  const chips = activeChips(state, fields);
  const filtered = isFiltered(state);

  const save = () => {
    const name = window.prompt('اسم العرض المحفوظ', '');
    if (name && name.trim()) setViews(saveView(scope, name.trim().slice(0, 40), state));
  };

  return (
    <div className="flt" role="search">
      <div className="flt-row">
        <div className="search-wrap flt-search">
          <input className="search-input" type="search" aria-label="بحث" placeholder={placeholder || 'ابحث'} value={state.q || ''} onChange={(e) => set({ q: e.target.value })} />
        </div>
        {fields.slice(0, more ? fields.length : 3).map((f) => (
          <select key={f.key} className={`filter-select${state[f.key] ? ' on' : ''}`} aria-label={f.label} value={state[f.key] || ''} onChange={(e) => set({ [f.key]: e.target.value })}>
            <option value="">{f.all || `كل ${f.label}`}</option>
            {(f.type === 'period' ? PERIODS : f.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {fields.length > 3 && <button type="button" className="flt-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'فلاتر أقل' : `+ ${fields.length - 3} فلاتر`}</button>}
        {actions}
      </div>

      {presets.length > 0 && (
        <div className="flt-row flt-presets" aria-label="عروض سريعة">
          {presets.map((p) => (
            <button key={p.key} type="button" className={`flt-preset${state.view === p.key ? ' on' : ''}`} aria-pressed={state.view === p.key}
              onClick={() => set({ view: state.view === p.key ? '' : p.key })}>
              {p.label}<b>{counts[p.key] ?? 0}</b>
            </button>
          ))}
        </div>
      )}

      <div className="flt-row flt-status">
        <span className="la-muted" aria-live="polite">{shown === total ? `${total} ${noun}` : <><b>{shown}</b> من {total} {noun}</>}</span>
        {chips.map((c) => (
          <span key={c.key} className="flt-chip">{c.label}<button type="button" aria-label={`إزالة ${c.label}`} onClick={() => set({ [c.key]: '' })}>×</button></span>
        ))}
        {filtered && <button type="button" className="flt-link" onClick={clear}>مسح الكل</button>}
        {filtered && <button type="button" className="flt-link" onClick={save}>حفظ هذا العرض</button>}
        {views.length > 0 && (
          <select className="filter-select flt-views" aria-label="العروض المحفوظة" value="" onChange={(e) => {
            const v = views.find((x) => x.name === e.target.value.slice(4));
            if (e.target.value.startsWith('del:')) setViews(deleteView(scope, e.target.value.slice(4)));
            else if (v) replace(v.state);
          }}>
            <option value="">العروض المحفوظة ({views.length})</option>
            <optgroup label="فتح">{views.map((v) => <option key={v.name} value={`get:${v.name}`}>{v.name}</option>)}</optgroup>
            <optgroup label="حذف">{views.map((v) => <option key={`d${v.name}`} value={`del:${v.name}`}>حذف «{v.name}»</option>)}</optgroup>
          </select>
        )}
      </div>
    </div>
  );
}
