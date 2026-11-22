// ════════════════════════════════════════════════════════════════
// «عندي سؤال هنا»: من موضع التعثر إلى مختص يعرف السياق (مرافق بناء المبادرة 4د)
// ════════════════════════════════════════════════════════════════
// يختار المشارك نوع حاجته، فيُختار دور الخبير (stuck.js NEED_TYPES)، ويُفتح «اطلب استشارة» القائم معبأً باسم الفصل والفحص
// وإطار الفصل. الخبير المطابق لقطاع المشارك يتقدم في الترشيح (sameSector في logic.js)، ويقرأ الوثيقة من بوابته.
import React, { useEffect, useRef, useState } from 'react';
import ChooseExpert from './ChooseExpert.jsx';
import { GuideChat } from './Guidance.jsx';
import { askNote, NEED_TYPES, roleForNeed } from '../../../supabase/functions/leaders-api/stuck.js';

export default function AskExpert({ chapterTitle, detail = null, dimension = '', onClose }) {
  const [need, setNeed] = useState('method');
  // «أريد التأكد» من رد المساعد يملأ طلب الخبير بالسؤال نفسه، فينتقل المشارك من الإجابة الفورية إلى الخبير بلا إعادة كتابة
  const [confirm, setConfirm] = useState(null);
  const ref = useRef(null);
  // يُفتح من موضع بعيد (فحص في الشريط الجانبي): يُمرَّر إليه
  useEffect(() => { ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [chapterTitle, detail]);
  return (
    <section ref={ref} className="card ask" aria-labelledby="ask-h">
      <div className="row between">
        <h3 id="ask-h">اسأل مختصًا عن «{chapterTitle}»</h3>
        {onClose && <button type="button" className="link small" onClick={onClose}>إغلاق</button>}
      </div>
      {/* الخطوة الأولى: إجابة فورية من الكتاب. GuideChat لا يظهر إلا والمساعد مفتوح لهذا المشارك (بوابته من الخادم)، وإلا تبقى النافذة للخبير وحده */}
      <GuideChat context="capstone" onConfirm={(q) => setConfirm({ note: `${askNote(chapterTitle, detail)} سألت المساعد الذكي: «${q}» وأريد التأكد من خبير.`, at: Date.now() })} />
      <div className="seg-opts" role="radiogroup" aria-label="ما الذي تحتاجه؟">
        {NEED_TYPES.map((n) => <button key={n.key} type="button" role="radio" aria-checked={need === n.key} className={need === n.key ? 'on' : ''} onClick={() => setNeed(n.key)}>{n.label}</button>)}
      </div>
      <p className="muted small">يصل الخبير اسم الفصل{detail ? ' والفحص' : ''} مع سؤالك، ويقرأ وثيقتك قبل أن يرد، فلا تحتاج أن تشرح من البداية.</p>
      <ChooseExpert key={confirm?.at || 'cx'} context="capstone" title="الخبراء المرشحون" open role={roleForNeed(need)} dimension={dimension || ''} note={confirm?.note || askNote(chapterTitle, detail)} />
    </section>
  );
}
