// ════════════════════════════════════════════════════════════════
// البحث الشامل: Ctrl+K (أو ⌘K) من أي شاشة
// ════════════════════════════════════════════════════════════════
// يبحث في المشاركين والجهات والمسارات والأبواب والنماذج وأقسام اللوحة،
// والأسهم تتنقل وEnter يفتح. البيانات تُحمَّل عند أول فتح فقط.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { L } from './leaders.js';
import { navigate } from './route.js';
import { KIND_LABEL, rank } from './search.js';
import { TABS } from './screens/Leaders.jsx';

const SECTIONS = [{ kind: 'tab', id: 'contacts', title: 'طلبات التواصل', to: { ctx: 'contacts' } },
  ...TABS.map(([k, l]) => ({ kind: 'tab', id: k, title: l, to: { ctx: 'leaders', tab: k } }))];

async function loadIndex() {
  const [p, o, c] = await Promise.all([L('admin.participants', {}), L('admin.orgs'), L('admin.catalog')]);
  const at = (tab, id) => ({ ctx: 'leaders', tab, id });
  return [
    ...SECTIONS,
    ...(p.participants || []).map((x) => ({ kind: 'participant', id: x.id, title: x.full_name, sub: x.organization_name || x.email, keys: [x.email, x.organization_name, x.job_title], to: at('participants', x.id) })),
    ...(o.orgs || []).map((x) => ({ kind: 'org', id: x.id, title: x.name, sub: x.short_name, keys: [x.short_name], to: at('orgs', x.id) })),
    ...(c.tracks || []).map((x) => ({ kind: 'track', id: x.key, title: x.title_ar || x.key, sub: x.key, keys: [x.key], to: at('tracks', x.key) })),
    ...(c.handbook_modules || []).map((x) => ({ kind: 'chapter', id: x.id, title: x.title_ar, sub: x.dimension, to: at('handbook') })),
    ...(c.learning_models || []).map((x) => ({ kind: 'model', id: x.id, title: x.title_ar, sub: x.dimension, to: at('handbook') })),
  ];
}

export default function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [i, setI] = useState(0);
  const input = useRef(null);

  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((x) => !x); }
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', key);
    window.addEventListener('mi:search', show);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mi:search', show); };
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ(''); setI(0);
    requestAnimationFrame(() => input.current?.focus());
    if (!items) loadIndex().then(setItems).catch(() => setItems(SECTIONS));
  }, [open]); // eslint-disable-line

  const hits = useMemo(() => (q.trim() ? rank(q, items || SECTIONS) : SECTIONS.slice(0, 8)), [q, items]);
  if (!open) return null;
  const go = (h) => { if (!h) return; setOpen(false); navigate(h.to); window.scrollTo({ top: 0 }); };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[i]); }
  };

  return (
    <div className="mid-ov pal-ov" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="البحث الشامل" onKeyDown={key}>
        <input ref={input} className="pal-in" value={q} placeholder="ابحث عن مشارك أو جهة أو مسار أو باب…" aria-label="البحث الشامل"
          role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={hits[i] ? `pal-${i}` : undefined}
          onChange={(e) => { setQ(e.target.value); setI(0); }} />
        <ul className="pal-list" id="pal-list" role="listbox">
          {!items && q.trim() && <li className="pal-empty">جارٍ تحميل الفهرس…</li>}
          {items && q.trim() && !hits.length && <li className="pal-empty">لا نتائج لـ«{q}»</li>}
          {hits.map((h, k) => (
            <li key={`${h.kind}:${h.id}`} id={`pal-${k}`} role="option" aria-selected={k === i} className={k === i ? 'on' : ''}
              onMouseEnter={() => setI(k)} onMouseDown={(e) => { e.preventDefault(); go(h); }}>
              <span className="pal-kind">{KIND_LABEL[h.kind]}</span>
              <b>{h.title}</b>{h.sub && <small dir="auto">{h.sub}</small>}
            </li>
          ))}
        </ul>
        <div className="pal-foot"><kbd>↑</kbd><kbd>↓</kbd> للتنقل · <kbd>Enter</kbd> للفتح · <kbd>Esc</kbd> للإغلاق</div>
      </div>
    </div>
  );
}
