// ════════════════════════════════════════════════════════════════
// «عندي سؤال هنا»: من موضع التعثر إلى مختص يعرف السياق (مرافق بناء المبادرة 4د)
// ════════════════════════════════════════════════════════════════
// يختار المشارك نوع حاجته، فيُختار دور الخبير (stuck.js NEED_TYPES)، ويُفتح «اطلب استشارة» القائم معبأً باسم الفصل والفحص
// وإطار الفصل. الخبير المطابق لقطاع المشارك يتقدم في الترشيح (sameSector في logic.js)، ويقرأ الوثيقة من بوابته.
import React, { useEffect, useRef, useState } from 'react';
import ChooseExpert from './ChooseExpert.jsx';
import { askNote, NEED_TYPES, roleForNeed } from '../../../supabase/functions/leaders-api/stuck.js';

export default function AskExpert({ chapterTitle, detail = null, dimension = '', onClose }) {
  const [need, setNeed] = useState('method');
  const ref = useRef(null);
  // يُفتح من موضع بعيد (فحص في الشريط الجانبي): يُمرَّر إليه
  useEffect(() => { ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [chapterTitle, detail]);
  return (
    <section ref={ref} className="card ask" aria-labelledby="ask-h">
      <div className="row between">
        <h3 id="ask-h">اسأل مختصًا عن «{chapterTitle}»</h3>
        {onClose && <button type="button" className="link small" onClick={onClose}>إغلاق</button>}
      </div>
      <div className="seg-opts" role="radiogroup" aria-label="ما الذي تحتاجه؟">
        {NEED_TYPES.map((n) => <button key={n.key} type="button" role="radio" aria-checked={need === n.key} className={need === n.key ? 'on' : ''} onClick={() => setNeed(n.key)}>{n.label}</button>)}
      </div>
      <p className="muted small">يصل الخبير اسم الفصل{detail ? ' والفحص' : ''} مع سؤالك، ويقرأ وثيقتك قبل أن يرد، فلا تحتاج أن تشرح من البداية.</p>
      <ChooseExpert context="capstone" title="الخبراء المرشحون" open role={roleForNeed(need)} dimension={dimension || ''} note={askNote(chapterTitle, detail)} />
    </section>
  );
}
