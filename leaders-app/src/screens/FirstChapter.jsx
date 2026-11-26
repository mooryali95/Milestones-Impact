// ════════════════════════════════════════════════════════════════
// «ابدأ بالفصل الأول» أثناء انتظار اعتماد المسار (تصور المرحلة 2، 2.5)
// ════════════════════════════════════════════════════════════════
// الفصل الأول المشترك بين المسارات بنصه المشترك وحده (handbook.preview على الخادم)، قراءة فقط: لا اختبار ولا قراءة
// محتسبة ولا إتمام، فلا يدخل شيء في عدّ المسار قبل تثبيته. الكتاب كاملًا بأبواب المسار يُفتح بعد الاعتماد.
import React, { useState } from 'react';
import { call } from '../api.js';

// Markdown المبسط في الكتاب: ## و### وقوائم واقتباس وفقرات، والرسم (@النوع) بنوده أسطر عادية
function blocks(md) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) flush();
    else if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); out.push({ type: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); }
    else if ((m = line.match(/^(?:[-•]|\d+[.)])\s+(.*)$/))) { flush(); out.push({ type: 'li', text: m[1] }); }
    else if ((m = line.match(/^>\s?(.*)$/))) { flush(); out.push({ type: 'quote', text: m[1] }); }
    else if ((m = line.match(/^@[a-z]+\s*(.*)$/))) { flush(); if (m[1]) out.push({ type: 'h3', text: m[1] }); }
    else para.push(line);
  }
  flush();
  return out;
}
const plain = (t) => String(t).replace(/\*\*([^*]+)\*\*/g, '$1');

export default function FirstChapter() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const r = await call('handbook.preview').catch(() => null);
    setBusy(false);
    setData(r?.success ? r : { success: false, message: r?.message || 'تعذّر فتح الفصل الآن، حاول بعد قليل' });
  };
  return (
    <div className="banner mist j-first-chapter">
      <div className="grow stack" style={{ gap: 8 }}>
        <b>ابدأ بالفصل الأول</b>
        {!data?.success && <p className="small">فصل مشترك بين المسارات تقرؤه الآن. يُفتح كتابك كاملًا بأبواب مسارك بعد اعتماده.</p>}
        {data && !data.success && <div className="alert err" role="alert">{data.message}</div>}
        {!data?.success && <div className="row"><button type="button" className="btn gold sm" disabled={busy} onClick={open}>{busy ? 'لحظة…' : 'اقرأ الفصل الأول'}</button></div>}
        {data?.success && (
          <article className="stack" aria-label={data.chapter.title}>
            <p className="small muted">قراءة فقط · {data.chapter.title}</p>
            {blocks(data.chapter.md).map((b, i) => {
              const t = plain(b.text);
              if (b.type === 'h2') return <h2 key={i} style={{ fontSize: 18 }}>{t}</h2>;
              if (b.type === 'h3') return <h3 key={i} style={{ fontSize: 16 }}>{t}</h3>;
              if (b.type === 'li') return <p key={i} className="small">• {t}</p>;
              if (b.type === 'quote') return <blockquote key={i} className="small">{t}</blockquote>;
              return <p key={i} className="small">{t}</p>;
            })}
          </article>
        )}
      </div>
    </div>
  );
}
