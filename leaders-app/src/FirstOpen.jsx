// بطاقة أول فتح لشاشة (الكتيب، القاعة، المبادرة): ثلاث جمل وزر «فهمت»، تُغلق مرة واحدة بالمخزن المحلي
// (راحة عرض لا حالة رحلة، كبطاقة الترحيب). لا جولة فقاعات: بطاقة واحدة لكل شاشة.
import React, { useState } from 'react';
import { firstOpenSeen } from './api.js';

export default function FirstOpen({ id, title, lines, icon = '💡' }) {
  const store = firstOpenSeen(id);
  const [open, setOpen] = useState(() => !store.get());
  if (!open) return null;
  return (
    <div className="banner mist first-open" role="note">
      <span className="ico" aria-hidden="true">{icon}</span>
      <div className="grow">
        <b>{title}</b>
        <ol className="small">{lines.map((l) => <li key={l}>{l}</li>)}</ol>
      </div>
      <button type="button" className="link small" onClick={() => { store.set(true); setOpen(false); }}>فهمت</button>
    </div>
  );
}
