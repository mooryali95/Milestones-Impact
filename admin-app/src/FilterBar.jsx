// شريط الفلترة الموحّد: بحث، وعروض سريعة بعدّاداتها، وحقول، ورقائق للفلاتر المفعّلة،
// وعروض محفوظة باسم. المنطق في filters.js، والحالة في عنوان الصفحة عبر useFilters.
import React, { useEffect, useRef, useState } from 'react';
import { activeChips, decodeState, deleteView, encodeState, isFiltered, loadViews, ltrDigits, nextSort, PERIODS, recallState, rememberState, saveView, splitPresets, startState } from './filters.js';
import { readQuery, writeQuery } from './route.js';

// حالة الفلاتر لشاشة واحدة، مقروءة من العنوان ومكتوبة إليه.
// scope: تبقى الفلاتر عند العودة للشاشة. defaults: ما تبدأ به أول مرة. url=false لقائمة داخل صفحة لها عنوانها.
export function useFilters(keys, initial = {}, { scope = '', defaults = {}, url = true } = {}) {
  const [state, setState] = useState(() => startState(keys, { fromUrl: url ? readQuery() : '', initial, kept: scope ? recallState(scope) : null, defaults }));
  useEffect(() => { if (url) writeQuery(encodeState(state)); if (scope) rememberState(scope, state); }, [state]); // eslint-disable-line
  // مغادرة الشاشة تُفرغ الفلاتر من العنوان
  useEffect(() => () => { if (url) writeQuery(''); }, []); // eslint-disable-line
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const clear = () => setState((s) => ({ ...decodeState('', keys), ...(s.sort ? { sort: s.sort } : {}) }));   // المسح للفلاتر، والفرز يبقى
  return [state, set, clear, setState];
}

// رأس عمود يُفرز به: نقرة تصاعدي، ثم تنازلي، ثم ترتيب الخادم. الحالة في state.sort فتُحفظ مع الفلاتر
export function SortTh({ k, state, set, children, ...rest }) {
  const dir = state.sort === k ? 'ascending' : state.sort === `-${k}` ? 'descending' : 'none';
  return (
    <th scope="col" aria-sort={dir} {...rest}>
      <button type="button" className={`th-sort ${dir}`} title="افرز بهذا العمود" onClick={() => set({ sort: nextSort(state.sort, k) })}>
        {children}<span className="th-sort-ico" aria-hidden="true">{dir === 'ascending' ? '▲' : dir === 'descending' ? '▼' : '↕'}</span>
      </button>
    </th>
  );
}

export default function FilterBar({ scope, state, set, clear, replace, fields = [], presets = [], counts = {}, shown, total, noun, placeholder, actions, capped, sorts, collapseZero = false }) {
  const [views, setViews] = useState(() => loadViews(scope));
  const [more, setMore] = useState(false);
  const [zeroOpen, setZeroOpen] = useState(false);
  const searchRef = useRef(null);
  const presetsRef = useRef(null);
  // collapseZero: العروض السريعة الصفرية غير المختارة تُطوى تحت «المزيد (n)» (splitPresets في filters.js)
  const { shown: presetsShown, folded } = splitPresets(presets, counts, state.view || '', collapseZero);
  const chips = activeChips(state, fields);
  // حقل { hidden: true } يُرشِّح ويظهر رقاقةً ويُحفظ في الرابط، ولا قائمة له هنا (تكتبه بطاقات FilterCards مثلًا)
  const visible = fields.filter((f) => !f.hidden);
  const filtered = isFiltered(state);
  // حين لا يبقى ما يُطوى يعود الطي إلى أصله، ولا يسقط التركيز إلى body إن كان على زر «المزيد»
  useEffect(() => {
    if (folded.length === 0 && zeroOpen) {
      const had = presetsRef.current && presetsRef.current.contains(document.activeElement);
      setZeroOpen(false);
      if (had || document.activeElement === document.body) presetsRef.current?.querySelector('button')?.focus();
    }
  }, [folded.length, zeroOpen]);
  // «امسح الكل» يختفي بعد المسح، فيعود التركيز إلى البحث (WCAG 2.4.3)
  const clearAll = () => { clear(); requestAnimationFrame(() => searchRef.current?.focus()); };

  const save = () => {
    const name = window.prompt('اسم العرض المحفوظ', '');
    if (name && name.trim()) setViews(saveView(scope, name.trim().slice(0, 40), state));
  };

  return (
    <div className="flt" role="search">
      <div className="flt-row">
        <div className="search-wrap flt-search">
          <input ref={searchRef} className="search-input" type="search" aria-label="بحث" placeholder={placeholder || 'ابحث'} value={state.q || ''} {...ltrDigits(state.q)} onChange={(e) => set({ q: e.target.value })} />
        </div>
        {visible.slice(0, more ? visible.length : 3).map((f) => (
          <select key={f.key} className={`filter-select${state[f.key] ? ' on' : ''}`} aria-label={f.aria || f.label} value={state[f.key] || ''} onChange={(e) => set({ [f.key]: e.target.value })}>
            <option value="">{f.all || `كل ${f.label}`}</option>
            {(f.type === 'period' ? PERIODS : f.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {visible.length > 3 && <button type="button" className="flt-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'فلاتر أقل' : `+ ${visible.length - 3} فلاتر`}</button>}
        {sorts && (
          <select className={`filter-select${state.sort ? ' on' : ''}`} aria-label="الترتيب" value={state.sort || ''} onChange={(e) => set({ sort: e.target.value })}>
            {sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        {actions}
      </div>

      {presets.length > 0 && (
        <div ref={presetsRef} className="flt-row flt-presets" role="group" aria-label="عروض سريعة">
          {[...presetsShown, ...(zeroOpen ? folded : [])].map((p) => (
            <button key={p.key} type="button" className={`flt-preset${state.view === p.key ? ' on' : ''}${(counts[p.key] ?? 0) === 0 ? ' zero' : ''}`} aria-pressed={state.view === p.key}
              onClick={() => set({ view: state.view === p.key ? '' : p.key })}>
              {p.label}<b>{counts[p.key] ?? 0}</b>
            </button>
          ))}
          {folded.length > 0 && (
            <button type="button" className="flt-more flt-zero-more" aria-expanded={zeroOpen} onClick={() => setZeroOpen(!zeroOpen)}>
              {`المزيد (${folded.length})`}
            </button>
          )}
        </div>
      )}

      <div className="flt-row flt-status">
        <span className="la-muted" aria-live="polite">{shown === total ? `${total} ${noun}` : <><b>{shown}</b> من {total} {noun}</>}</span>
        {chips.map((c) => (
          <span key={c.key} className="flt-chip">{c.label}<button type="button" aria-label={`إزالة ${c.label}`} onClick={() => set({ [c.key]: '' })}>×</button></span>
        ))}
        {/* «امسح الكل» رقاقة في صف الرقاقات نفسه (المرحلة 6)، تظهر مع أي فلتر مفعّل */}
        {filtered && <button type="button" className="flt-chip flt-chip-clear" onClick={clearAll}>امسح الكل</button>}
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
      {capped && (
        <div className="flt-cap" role="status">
          القائمة بلغت حدها ({capped.limit} {noun})، فالظاهر هو الأحدث فقط، والبحث والفلاتر هنا لا ترى ما بعده.
          {capped.onSearch && (state.q || '').trim() && <button type="button" className="flt-link" onClick={() => capped.onSearch(state.q.trim())}>ابحث عن «{state.q.trim()}» في الكل</button>}
          {capped.onSearch && !(state.q || '').trim() && <span> اكتب في البحث ثم اختر «ابحث في الكل».</span>}
        </div>
      )}
    </div>
  );
}

// بطاقات الرأس المرشِّحة (مشتركة): كل بطاقة زر يكتب قيمته في حقل واحد من useFilters (state[field])، فلا مصدر ترشيح ثانٍ:
// الرابط والرقاقة والتصدير يرون الشيء نفسه. ضغطة ثانية على البطاقة المختارة تلغيها. counts من القائمة كلها لا المرشَّحة.
// cards: [{ key, label, sub?, tone? }] · clearLabel: رابط «الكل» الصغير (يظهر حين تكون بطاقة مختارة)
export function FilterCards({ cards, field, state, set, counts = {}, loading = false, label = 'ترشيح سريع', clearLabel = 'الكل', total }) {
  const cur = state[field] || '';
  return (
    <div className="fcards" role="group" aria-label={label}>
      {cards.map((c) => {
        const on = cur === c.key;
        return (
          <button key={c.key} type="button" className={`fcard${c.tone ? ` t-${c.tone}` : ''}${on ? ' on' : ''}`} aria-pressed={on}
            onClick={() => set({ [field]: on ? '' : c.key })}>
            <span className="fcard-l">{c.label}</span>
            <span className="fcard-v">{loading ? '—' : (counts[c.key] ?? 0)}</span>
            {c.sub && <span className="fcard-s">{c.sub}</span>}
          </button>
        );
      })}
      {cur && <button type="button" className="flt-link fcards-all" onClick={() => set({ [field]: '' })}>{clearLabel}{total != null ? ` (${total})` : ''}</button>}
    </div>
  );
}
