// ════════════════════════════════════════════════════════════════
// سؤال الخروج حين توجد على الجهاز جلسة دور آخر (مشارك، خبير، منسق جهة)
// ════════════════════════════════════════════════════════════════
// نافذة من التطبيق بثلاثة أزرار صريحة بدل window.confirm: كان «إلغاء» فيه يُخرج من البوابة وحدها، وأزراره بلغة
// المتصفح لا بالنص المكتوب، ولا طريق للتراجع (فحص الجاهزية p-entry-9). المكوّن نفسه في البوابات الثلاث.
// askSignOut يعيد true إن خرج المستخدم، وfalse إن تراجع فتبقى الشاشة كما هي.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { otherRoleSessions, roleLabel, signOut } from './api.js';

export function SignOutDialog({ here, others, onChoose }) {
  const panel = useRef(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    panel.current?.querySelector('button')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const choose = (v) => { if (busy) return; if (v) setBusy(true); onChoose(v); };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); choose(null); return; }
    if (e.key !== 'Tab') return;
    // نافذة حوارية: Tab يدور داخلها
    const all = [...panel.current.querySelectorAll('button:not([disabled])')];
    const at = all.indexOf(document.activeElement);
    if (e.shiftKey && at <= 0) { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (!e.shiftKey && at === all.length - 1) { e.preventDefault(); all[0]?.focus(); }
  };
  return (
    <div className="acct-sheet-backdrop" onKeyDown={keys} onClick={(e) => { if (e.target === e.currentTarget) choose(null); }}>
      <div ref={panel} className="acct-sheet signout-sheet" role="dialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-desc">
        <span className="acct-sheet-grip" aria-hidden="true" />
        <h2 id="signout-title">الخروج من المنصة</h2>
        <p id="signout-desc" className="acct-sheet-now">أنت داخل على هذا الجهاز أيضًا بصفة {others.join(' و')}. على جهاز مشترك اخرج من كل الأدوار.</p>
        <div className="acct-sheet-options">
          <button type="button" disabled={busy} onClick={() => choose('all')}>اخرج من كل الأدوار</button>
          <button type="button" disabled={busy} onClick={() => choose('here')}>اخرج من حساب {roleLabel(here)} وحده</button>
        </div>
        <button type="button" className="acct-sheet-cancel" disabled={busy} onClick={() => choose(null)}>تراجع</button>
      </div>
    </div>
  );
}

export async function askSignOut(here) {
  const others = otherRoleSessions(here);
  if (!others.length) { await signOut(here); return true; }
  const back = document.activeElement;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const choice = await new Promise((resolve) => {
    root.render(<SignOutDialog here={here} others={others} onChoose={resolve} />);
  });
  if (choice) await signOut(here, choice === 'all');
  root.unmount();
  host.remove();
  // التراجع يعيد التركيز إلى زر «خروج»
  if (!choice) back?.focus?.();
  return !!choice;
}
