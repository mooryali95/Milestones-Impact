// ════════════════════════════════════════════════════════════════
// نص الباب كما يقرؤه المشارك: عناوين وبنود واقتباس وغامق
// ════════════════════════════════════════════════════════════════
// عناصر React لا HTML خام، فلا حاجة لتهريب. كتل المستوى (:::) تُحذف قبله
// بـ filterHandbookMd، والأشكال (@chain …) تظهر سطرًا مختصرًا للإدارة.
import React from 'react';

const inline = (t) => String(t).split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));
export default function Md({ text }) {
  const out = [];
  let list = null;
  const flush = () => { if (list) { const T = list.tag; out.push(<T key={out.length}>{list.items}</T>); list = null; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    let m;
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
  flush();
  return out;
}

