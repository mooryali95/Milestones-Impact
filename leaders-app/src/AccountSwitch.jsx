// ════════════════════════════════════════════════════════════════
// تبديل الحساب: مشارك ↔ خبير ↔ منسق جهة بضغطة، دون خروج ودخول
// ════════════════════════════════════════════════════════════════
// يظهر حين يكون للبريد حساب في بوابة أخرى (switch_to من الخادم). الخادم يصدر جلسة الوجهة
// من الجلسة النافذة، فتُحفظ في مفتاح بوابتها ويُنتقل إليها.
import React, { useEffect, useRef, useState } from 'react';
import { coordSession, session, xpSession } from './api.js';

const DOOR = {
  participant: { label: 'رحلتي مشاركًا', path: '/', store: session },
  expert: { label: 'لوحة الخبير', path: '/x', store: xpSession },
  org: { label: 'لوحة الجهة', path: '/org', store: coordSession },
};
const HERE = { participant: 'مشارك', expert: 'خبير', org: 'منسق جهة' };

export default function AccountSwitch({ here, doors, doSwitch, light = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const list = (doors || []).filter((d) => DOOR[d] && d !== here);
  if (!list.length) return null;
  const go = async (to) => {
    setBusy(to); setErr('');
    const r = await doSwitch(to);
    if (r?.success && r.token) { DOOR[to].store.set(r.token); location.href = DOOR[to].path; return; }
    setBusy(''); setErr(r?.message || 'تعذّر التبديل');
  };
  return (
    <div className="acct-switch" ref={ref}>
      <button type="button" className={`acct-btn${light ? ' light' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {HERE[here]} <span aria-hidden="true">⇄</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <small>بدّل إلى</small>
          {list.map((d) => (
            <button key={d} type="button" role="menuitem" disabled={!!busy} onClick={() => go(d)}>{busy === d ? 'لحظة…' : DOOR[d].label}</button>
          ))}
          {err && <p className="small" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
