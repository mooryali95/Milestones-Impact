// ════════════════════════════════════════════════════════════════
// تبديل الحساب: مشارك ↔ خبير ↔ منسق جهة بضغطة، دون خروج ودخول
// ════════════════════════════════════════════════════════════════
// يظهر حين يكون للبريد حساب في بوابة أخرى (switch_to من الخادم). الخادم يصدر جلسة الوجهة
// من الجلسة النافذة، فتُحفظ في مفتاح بوابتها ويُنتقل إليها.
//
// العرض (2026-11-11، بقرار المالك بعد لقطتي جوال): الخيارات تُرسم في جسم الصفحة لا داخل البطاقة الداكنة،
// لأن البطاقة تقص ما يخرج من حدودها (.hero overflow: hidden) فكانت القائمة تُقطع.
// - الجوال (الشاشة الضيقة): لوح من أسفل الشاشة بعرضها، بخلفية تغلقه، وأزرار بارتفاع لمسي، و«إلغاء».
// - الحاسوب: قائمة منسدلة ثابتة الموضع تحت الزر، تتمدد نحو داخل الصفحة وتبقى في الشاشة، وتنفتح لأعلى إن ضاق ما تحتها.
// وفي الحالين: Escape يغلق ويعيد التركيز إلى الزر، والأسهم تتنقل بين الخيارات.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { coordSession, session, xpSession } from './api.js';

const DOOR = {
  participant: { label: 'رحلتي مشاركًا', path: '/', store: session },
  expert: { label: 'لوحة الخبير', path: '/x', store: xpSession },
  org: { label: 'لوحة الجهة', path: '/org', store: coordSession },
};
const HERE = { participant: 'مشارك', expert: 'خبير', org: 'منسق جهة' };
export const SHEET_QUERY = '(max-width: 640px)';
const GAP = 6;
const EDGE = 8;

// موضع القائمة المنسدلة من مستطيل الزر وحجم الشاشة: تبدأ من حافة الزر الأولى (اليمنى في العربية) وتتمدد نحو الداخل،
// ولا تخرج عن الشاشة، وتنفتح لأعلى إن لم يتسع ما تحت الزر ووسعها ما فوقه.
export function menuPosition(rect, { vw, vh, width, height, rtl }) {
  const w = Math.min(width, vw - EDGE * 2);
  const left = Math.max(EDGE, Math.min(rtl ? rect.right - w : rect.left, vw - w - EDGE));
  const below = rect.bottom + GAP;
  const fitsBelow = below + height <= vh - EDGE;
  const fitsAbove = rect.top - GAP - height >= EDGE;
  return { left, top: !fitsBelow && fitsAbove ? rect.top - GAP - height : below, width: w };
}

export default function AccountSwitch({ here, doors, doSwitch, light = false }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const btn = useRef(null);
  const panel = useRef(null);
  const list = (doors || []).filter((d) => DOOR[d] && d !== here);

  const close = useCallback((focusBack = true) => {
    setOpen(false); setPos(null);
    if (focusBack) btn.current?.focus();
  }, []);

  const place = useCallback(() => {
    if (!btn.current || !panel.current) return;
    const rtl = getComputedStyle(btn.current).direction === 'rtl';
    setPos(menuPosition(btn.current.getBoundingClientRect(), {
      vw: document.documentElement.clientWidth, vh: window.innerHeight, width: 240, height: panel.current.offsetHeight, rtl,
    }));
  }, []);

  // القائمة المنسدلة تُقاس بعد رسمها ثم توضع، وتتبع الزر عند التمرير وتغيّر المقاس
  useLayoutEffect(() => {
    if (!open || sheet) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, sheet, place]);

  useEffect(() => {
    if (!open) return undefined;
    // التركيز على أول خيار، والإغلاق بالنقر خارج الزر واللوح
    panel.current?.querySelector('button')?.focus();
    const outside = (e) => { if (!btn.current?.contains(e.target) && !panel.current?.contains(e.target)) close(false); };
    document.addEventListener('pointerdown', outside);
    // اللوح يثبّت الصفحة خلفه فلا تتمرر تحته
    const prev = document.body.style.overflow;
    if (sheet) document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('pointerdown', outside); document.body.style.overflow = prev; };
  }, [open, sheet, close]);

  if (!list.length) return null;

  const toggle = () => {
    if (open) { close(); return; }
    setErr('');
    setSheet(typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches);
    setOpen(true);
  };
  const go = async (to) => {
    setBusy(to); setErr('');
    const r = await doSwitch(to);
    if (r?.success && r.token) { DOOR[to].store.set(r.token); location.href = DOOR[to].path; return; }
    setBusy(''); setErr(r?.message || 'تعذّر التبديل');
  };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab' && !sheet) { close(false); return; }
    // اللوح نافذة حوارية: Tab يدور داخله ولا يخرج إلى الصفحة خلفه
    if (e.key === 'Tab') {
      const all = [...panel.current.querySelectorAll('button:not([disabled])')];
      const at = all.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); all[all.length - 1]?.focus(); }
      else if (!e.shiftKey && at === all.length - 1) { e.preventDefault(); all[0]?.focus(); }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...panel.current.querySelectorAll('button[data-door]')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[e.key];
    items[next].focus();
  };

  const options = list.map((d) => (
    <button key={d} type="button" data-door={d} role={sheet ? undefined : 'menuitem'} disabled={!!busy} onClick={() => go(d)}>
      {busy === d ? 'لحظة…' : DOOR[d].label}
    </button>
  ));

  return (
    <div className="acct-switch">
      <button ref={btn} type="button" className={`acct-btn${light ? ' light' : ''}`} aria-haspopup={sheet ? 'dialog' : 'menu'} aria-expanded={open} onClick={toggle}>
        {HERE[here]} <span aria-hidden="true">⇄</span>
      </button>
      {open && createPortal(sheet ? (
        <div className="acct-sheet-backdrop" onKeyDown={keys}>
          <div ref={panel} className="acct-sheet" role="dialog" aria-modal="true" aria-labelledby="acct-sheet-title">
            <span className="acct-sheet-grip" aria-hidden="true" />
            <h2 id="acct-sheet-title">بدّل الحساب</h2>
            <p className="acct-sheet-now">أنت الآن في حساب {HERE[here]}</p>
            <div className="acct-sheet-options">{options}</div>
            {err && <p className="small acct-err" role="alert">{err}</p>}
            <button type="button" className="acct-sheet-cancel" onClick={() => close()}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div ref={panel} className="acct-menu" role="menu" aria-label="بدّل إلى" onKeyDown={keys}
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { opacity: 0, pointerEvents: 'none', left: 0, top: 0 }}>
          <small>بدّل إلى</small>
          {options}
          {err && <p className="small acct-err" role="alert">{err}</p>}
        </div>
      ), document.body)}
    </div>
  );
}
