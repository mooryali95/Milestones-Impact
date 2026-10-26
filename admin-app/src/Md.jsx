// ════════════════════════════════════════════════════════════════
// نص الباب كما يقرؤه المشارك: عناوين وبنود واقتباس وغامق
// ════════════════════════════════════════════════════════════════
// عناصر React لا HTML خام، فلا حاجة لتهريب. كتل المستوى (:::) تُحذف قبله
// بـ filterHandbookMd، والأشكال (@chain …) تظهر سطرًا مختصرًا للإدارة.
// ومع tierLabel (الكتاب الأصلي الكامل) تبقى الكتل وتظهر في إطار موسوم بمن يقرؤها.
import React from 'react';

const inline = (t) => String(t).split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));
export default function Md({ text, tierLabel }) {
  const out = [];
  let list = null;
  let box = null;
  const flush = () => { if (list) { const T = list.tag; out.push(<T key={out.length}>{list.items}</T>); list = null; } };
  const close = () => {
    flush();
    if (!box) return;
    const kids = out.splice(box.from);
    out.push(<div key={out.length} className="hb-tier"><span className="hb-tier-l">{box.label}</span>{kids}</div>);
    box = null;
  };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    let m;
    if (tierLabel && (m = line.match(/^:::\s*(\S.*)$/))) { close(); box = { label: tierLabel(m[1]), from: out.length }; continue; }
    if (tierLabel && line === ':::') { close(); continue; }
    if (!line || /^:::/.test(line)) { flush(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { flush(); const H = `h${m[1].length + 1}`; out.push(<H key={out.length}>{inline(m[2])}</H>); continue; }
    if ((m = line.match(/^@(\w+)\s*(.*)$/))) { flush(); out.push(<p key={out.length} className="la-muted">[شكل {m[1]}] {m[2]}</p>); continue; }
    const li = line.match(/^[-•]\s+(.*)$/) ? ['ul', line.replace(/^[-•]\s+/, '')] : line.match(/^\d+[.)]\s+/) ? ['ol', line.replace(/^\d+[.)]\s+/, '')] : null;
    if (li) {
      if (list?.tag !== li[0]) { flush(); list = { tag: li[0], items: [] }; }
      list.items.push(<li key={list.items.length}>{inline(li[1])}</li>);
      continue;
    }
    flush();
    out.push((m = line.match(/^>\s?(.*)$/)) ? <blockquote key={out.length}>{inline(m[1])}</blockquote> : <p key={out.length}>{inline(line)}</p>);
  }
  close();
  return out;
}

