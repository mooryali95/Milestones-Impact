// ════════════════════════════════════════════════════════════════
// كتاب القائد: الغلاف والنسخة الشخصية PDF بهوية Milestone Impact
// ════════════════════════════════════════════════════════════════
// مصدر واحد: محلل الـ Markdown نفسه يغذي القراءة على اللوحة (Handbook.jsx)
// والنسخة المطبوعة، والغلاف نفسه يظهر داخل المنصة وأول صفحة في الـ PDF.
// الكتاب عام: لا يذكر من المسار إلا رمزه (M1I2L3). الأبواب نفسها مصفّاة
// بمستوى صاحبه على الخادم. النسخة تحمل على كل صفحة اسمه وبريده ورقمها.
// الإنفوجرافيك يُستخرج آليًا من أنماط النص، فلا يحتاج المحرر وسومًا خاصة.
// كل نص يمر عبر esc().
import LOGO_SRC from '../../assets/brand/milestone-impact.svg?raw';
import LOGO_INV_SRC from '../../assets/brand/milestone-impact-inverted.svg?raw';
import COVER_IMG from '../../assets/book/cover.webp';
import IMG_MILESTONE from '../../assets/book/milestone.webp';
import IMG_IMPACT from '../../assets/book/impact.webp';
import IMG_LEADERSHIP from '../../assets/book/leadership.webp';
import CH_MANIFEST from '../../assets/book/chapters/manifest.json';
import { C, esc } from './doc.js';

const svgOf = (s) => s.replace(/<\?xml[^>]*>\s*/, '');
const LOGO = svgOf(LOGO_SRC);
const LOGO_INV = svgOf(LOGO_INV_SRC);
const PART_IMG = { milestone: IMG_MILESTONE, impact: IMG_IMPACT, leadership: IMG_LEADERSHIP };
// صور الأبواب: تُستعمل فقط حين تكتمل كلها (complete في manifest.json)، وقبل ذلك يبقى الكتاب كما هو
const CH_IMGS = import.meta.glob('../../assets/book/chapters/*.webp', { eager: true, query: '?url', import: 'default' });
const chapterImg = (id) => (CH_MANIFEST.complete && CH_MANIFEST.images[id] ? CH_IMGS[`../../assets/book/chapters/${CH_MANIFEST.images[id]}`] || null : null);
const abs = (u) => new URL(u, typeof location !== 'undefined' ? location.href : 'http://localhost/').href;

// ── Markdown المبسط إلى كتل: ## و### وقوائم واقتباس وفقرات ──
// الرسوم: سطر يبدأ بـ @النوع ثم عنوان اختياري، وبنودها أسطر حتى أول سطر فارغ
//   @chain سلسلة القيمة        @cycle · @compare · @pyramid · @matrix · @timeline · @stat · @layers
//   المخرج: ما يُسلَّم
// لا تستعمل ::: حتى لا تتعارض مع كتل المستوى التي يحذفها الخادم
export const FIGURES = ['chain', 'cycle', 'compare', 'pyramid', 'matrix', 'timeline', 'stat', 'layers'];
export function parseMd(md) {
  const blocks = [];
  let para = [];
  let fig = null;
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    if (fig) {
      if (line) { fig.lines.push(line.replace(/^[-•]\s+|^\d+[.)]\s+/, '')); continue; }
      blocks.push(fig); fig = null; continue;
    }
    if (!line || /^:::/.test(line)) { flush(); continue; }
    let m;
    if ((m = line.match(/^@([a-z]+)\s*(.*)$/)) && FIGURES.includes(m[1])) { flush(); fig = { type: 'fig', kind: m[1], title: m[2], lines: [] }; continue; }
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); blocks.push({ type: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); }
    else if ((m = line.match(/^[-•]\s+(.*)$/))) { flush(); blocks.push({ type: 'li', marker: '•', text: m[1] }); }
    else if ((m = line.match(/^(\d+)[.)]\s+(.*)$/))) { flush(); blocks.push({ type: 'li', marker: `${m[1]}.`, text: m[2] }); }
    else if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ type: 'quote', text: m[1] }); }
    else para.push(line);
  }
  if (fig) blocks.push(fig);
  flush();
  return blocks;
}

// للقراءة على اللوحة (Handbook.jsx): الرسم يُبسَّط إلى عنوان وبنود نصية
export const readingBlocks = (md) => parseMd(md).flatMap((b) => (b.type !== 'fig' ? [b]
  : [...(b.title ? [{ type: 'h3', text: b.title }] : []), ...b.lines.map((t) => ({ type: 'li', marker: '◆', text: t.replace(/\s*\|\s*/g, ' · ') }))]));

// **غامق** إلى وزن متوسط (الهوية بلا خط عريض)، بعد الترميز
const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const fmt = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
const two = (n) => String(n).padStart(2, '0');
const DEF = /^\*\*([^*]{1,60})\*\*\s*[:：]\s*(.+)$/;

// ── تحويل الكتل إلى إخراج: القوائم تُجمع ثم يُختار شكلها من نمطها ──
// قائمة كل بنودها «**مصطلح**: شرح» ← بطاقات · قائمة مرقّمة ← مسار خطوات · غير ذلك ← نقاط
function layout(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === 'li' && last?.type === 'list' && (last.numbered === (b.marker !== '•'))) last.items.push(b.text);
    else if (b.type === 'li') out.push({ type: 'list', numbered: b.marker !== '•', items: [b.text] });
    else out.push(b);
  }
  return out;
}

function listHtml(l) {
  const defs = l.items.map((t) => t.match(DEF));
  if (l.items.length >= 2 && defs.every(Boolean)) {
    return `<div class="cards${l.items.length % 3 === 0 ? ' c3' : ''}">${defs.map((m, i) => `<div class="card"><span class="n">${two(i + 1)}</span><b>${esc(m[1])}</b><p>${inline(m[2])}</p></div>`).join('')}</div>`;
  }
  if (l.numbered && l.items.length >= 3) {
    return `<ol class="steps">${l.items.map((t, i) => `<li><span class="dot">${i + 1}</span><p>${inline(t)}</p></li>`).join('')}</ol>`;
  }
  return `<ul class="bul">${l.items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`;
}

// ── الرسوم بهوية مَعلَم: خطوط ذهبية دقيقة وكتل Graphite ومعيّن ──
const item = (t) => { const m = t.match(/^\*{0,2}([^:：*]{1,50})\*{0,2}\s*[:：]\s*(.+)$/); return m ? { k: m[1].trim(), v: m[2] } : { k: t, v: '' }; };
const cells = (t) => t.split('|').map((x) => x.trim());
function figureHtml(f) {
  const its = f.lines.map(item);
  const head = f.title ? `<figcaption>${inline(f.title)}</figcaption>` : '';
  let body = '';
  if (f.kind === 'chain') {
    body = `<div class="f-chain">${its.map((x, i) => `${i ? '<i class="arw"></i>' : ''}<div class="node"><span>${two(i + 1)}</span><b>${inline(x.k)}</b>${x.v ? `<p>${inline(x.v)}</p>` : ''}</div>`).join('')}</div>`;
  } else if (f.kind === 'cycle') {
    const n = its.length;
    // عكس عقارب الساعة: الأول أعلى ثم يسارًا، كاتجاه القراءة العربية
    const ang = (i) => (-90 - (360 / n) * i) * Math.PI / 180;
    const at = (a, r = 38) => ({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
    const pos = its.map((_, i) => at(ang(i)));
    // رأس سهم ذهبي في منتصف كل قوس، مماسّ للدائرة باتجاه الحركة
    const heads = its.map((_, i) => { const a = (ang(i) + ang(i + 1)) / 2; const p = at(a); const deg = (a * 180) / Math.PI - 90; return `<path d="M-1.6 -1.3 L1.2 0 L-1.6 1.3 Z" fill="${C.gold}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${deg.toFixed(1)})"/>`; }).join('');
    body = `<div class="f-cycle"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="${C.gold}" stroke-width=".35"/>${heads}<rect x="45.5" y="45.5" width="9" height="9" transform="rotate(45 50 50)" fill="${C.graphite}"/></svg>${its.map((x, i) => `<div class="cnode" style="left:${pos[i].x.toFixed(2)}%;top:${pos[i].y.toFixed(2)}%"><span>${i + 1}</span><b>${inline(x.k)}</b>${x.v ? `<p>${inline(x.v)}</p>` : ''}</div>`).join('')}</div>`;
  } else if (f.kind === 'compare') {
    const [h, ...rows] = f.lines.map(cells);
    body = `<table class="f-compare"><thead><tr><th></th>${h.map((x) => `<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th>${inline(r[0])}</th>${r.slice(1).map((x) => `<td>${inline(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } else if (f.kind === 'pyramid') {
    body = `<div class="f-pyramid">${its.map((x, i) => `<div class="lvl" style="width:${34 + (66 * i) / Math.max(1, its.length - 1)}%"><b>${inline(x.k)}</b>${x.v ? `<span>${inline(x.v)}</span>` : ''}</div>`).join('')}</div>`;
  } else if (f.kind === 'matrix') {
    const ax = f.lines[0]?.match(/^محاور\s*[:：]\s*(.+)$/);
    const q = (ax ? its.slice(1) : its).slice(0, 4);
    const [x, y] = ax ? cells(ax[1]) : ['', ''];
    // الربع الأول (أعلى اليمين) هو المرتفع في المحورين: المحور الأفقي يرتفع نحو اليمين، والرأسي نحو الأعلى
    const axis = (cls, label) => `<div class="${cls}"><span>مرتفع</span><b>${inline(label)}</b><span>منخفض</span></div>`;
    body = `<div class="f-matrix">${y ? axis('ay', y) : '<i></i>'}<div class="grid">${q.map((c, i) => `<div class="q${i === 0 ? ' hi' : ''}"><b>${inline(c.k)}</b>${c.v ? `<p>${inline(c.v)}</p>` : ''}</div>`).join('')}</div>${x ? axis('ax', x) : ''}</div>`;
  } else if (f.kind === 'timeline') {
    body = `<div class="f-timeline">${its.map((x) => `<div class="t"><i></i><b>${inline(x.k)}</b>${x.v ? `<p>${inline(x.v)}</p>` : ''}</div>`).join('')}</div>`;
  } else if (f.kind === 'stat') {
    body = `<div class="f-stat">${f.lines.map(cells).map(([v, l]) => `<div><b>${inline(v)}</b><span>${inline(l || '')}</span></div>`).join('')}</div>`;
  } else if (f.kind === 'layers') {
    body = `<div class="f-layers">${its.map((x, i) => `<div class="ly" style="margin-inline:${i * 4}%"><b>${inline(x.k)}</b>${x.v ? `<span>${inline(x.v)}</span>` : ''}</div>`).join('')}</div>`;
  }
  return `<figure class="fig f-${f.kind}-w">${head}${body}</figure>`;
}

function chapterBody(md) {
  const blocks = layout(parseMd(md));
  const quotes = blocks.filter((b) => b.type === 'quote');
  const key = quotes[quotes.length - 1];
  const html = blocks.map((b) => {
    if (b === key) return '';
    if (b.type === 'h2') return `<h3>${inline(b.text)}</h3>`;
    if (b.type === 'h3') return `<h4>${inline(b.text)}</h4>`;
    if (b.type === 'list') return listHtml(b);
    if (b.type === 'fig') return figureHtml(b);
    if (b.type === 'quote') return `<blockquote class="pull"><span dir="ltr">«</span>${inline(b.text)}</blockquote>`;
    return `<p>${inline(b.text)}</p>`;
  }).join('');
  return { html, key: key?.text, heads: blocks.filter((b) => b.type === 'h2').map((b) => b.text.replace(/\*\*/g, '')) };
}

// تعريف كل إطار كما ورد في القسم التمهيدي من الكتاب (عام، لا يخص مسارًا)
const FW_LINE = {
  milestone: 'ربط التنفيذ بالأثر عبر نقاط تحكم واضحة وحوكمة فعالة تدعم اتخاذ القرار.',
  impact: 'تحقيق القيمة وقياسها عبر سلسلة مترابطة من المخرجات إلى الأثر المستدام.',
  leadership: 'تطوير قادة قادرين على التعامل مع التعقيد وقيادة التحول.',
};

// ── الأطر الثلاثة: رسم المعالم ← الأثر ← القيادة والحالي مضاء ──
function frameworks(parts, active) {
  return `<div class="fw">${parts.map((p, i) => `${i ? '<i class="fw-l"></i>' : ''}<div class="fw-n${p.key === active ? ' on' : ''}"><span>${esc(p.roman)}</span><small>${esc(p.short || p.title)}</small></div>`).join('')}</div>`;
}

// ── الغلاف الداكن (يُستعمل داخل المنصة وأول صفحة في النسخة) ──
// c: { name?, code?, ref?, issued_at? }
export const COVER_CSS = `
.bk-cover { position: relative; aspect-ratio: 210 / 297; width: 100%; overflow: hidden; color: #F7F8F6; background: ${C.graphite}; font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; container-type: inline-size; }
.bk-cover .bk-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: .55; }
.bk-cover .bk-shade { position: absolute; inset: 0; background: rgba(11,39,47,.35); }
.bk-cover .bk-frame { position: absolute; inset: 4.5%; border: 1px solid rgba(217,168,90,.55); }
.bk-cover .bk-in { position: absolute; inset: 9% 11%; display: grid; grid-template-rows: auto 1fr auto; text-align: center; }
.bk-cover .bk-logo svg { width: 30%; height: auto; display: block; margin: 0 auto; }
.bk-cover .bk-mid { align-self: center; }
.bk-cover .bk-en { font: 300 2.1cqi "Noto Sans", sans-serif; letter-spacing: .42em; text-transform: uppercase; color: ${C.goldLight}; margin: 0 0 3cqi; }
.bk-cover h1 { font-weight: 200; font-size: 11cqi; line-height: 1.2; margin: 0; color: #fff; }
.bk-cover .bk-rule { display: flex; align-items: center; gap: 2.4cqi; width: 46%; margin: 5cqi auto; }
.bk-cover .bk-rule i { flex: 1; height: 1px; background: ${C.goldLight}; opacity: .6; }
.bk-cover .bk-rule b { width: 1.6cqi; height: 1.6cqi; background: ${C.goldLight}; transform: rotate(45deg); }
.bk-cover .bk-sub { font: 300 2.7cqi "Noto Sans", sans-serif; letter-spacing: .28em; text-transform: uppercase; color: rgba(247,248,246,.88); margin: 0; direction: ltr; }
.bk-cover .bk-sub i { font-style: normal; color: ${C.goldLight}; font-size: 1.6cqi; margin: 0 1.6cqi; vertical-align: middle; }
.bk-cover .bk-code { display: inline-block; margin-top: 5cqi; padding: 1cqi 3cqi; border: 1px solid rgba(217,168,90,.6); font: 300 2.6cqi "Noto Sans", sans-serif; letter-spacing: .3em; color: ${C.goldLight}; direction: ltr; }
.bk-cover .bk-meta { font-size: 2cqi; color: rgba(247,248,246,.7); line-height: 2; }
.bk-cover .bk-meta b { font-weight: 300; color: #fff; font-size: 2.6cqi; }
.bk-cover .bk-meta bdi { font-family: "Noto Sans", sans-serif; letter-spacing: .06em; }
`;

export function coverHtml(c) {
  return `<div class="bk-cover"><div class="bk-bg" style="background-image:url('${abs(COVER_IMG)}')"></div><div class="bk-shade"></div><div class="bk-frame"></div><div class="bk-in">
  <div class="bk-logo">${LOGO_INV}</div>
  <div class="bk-mid">
    <p class="bk-en">The Leader's Book</p>
    <h1>كتاب القائد</h1>
    <div class="bk-rule"><i></i><b></b><i></i></div>
    <p class="bk-sub">Milestone <i>◆</i> Impact <i>◆</i> Leadership</p>
    ${c.code ? `<span class="bk-code">${esc(c.code)}</span>` : ''}
  </div>
  <div class="bk-meta">${c.name ? `نسخة شخصية مرخصة لـ<br><b>${esc(c.name)}</b><br>` : ''}${c.ref ? `<bdi dir="ltr">${esc(c.ref)}</bdi> · ${esc(fmt(c.issued_at))}` : ''}</div>
</div></div>`;
}

// ── النسخة الشخصية PDF (A4 طولي) ──
// book: { ref, issued_at, name, email, code, chapters: [{ dimension, title, md, reflection }], tools: [...] }
// parts: [{ key, roman, label, title, short }] ترتيب الأجزاء ومسمياتها من التطبيق
export function bookHtml(book, parts) {
  const mark = `${book.name} · ${book.email} · ${book.ref}`;
  const wm = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='560' height='320'><text x='280' y='160' text-anchor='middle' direction='rtl' transform='rotate(-28 280 160)' font-family='Noto Sans, Arial' font-size='14' fill='${C.graphite}' fill-opacity='.045'>${esc(mark)}</text></svg>`);
  const groups = parts.map((p) => ({ ...p, items: book.chapters.filter((c) => c.dimension === p.key), tools: (book.tools || []).filter((t) => t.dimension === p.key) })).filter((p) => p.items.length);
  const total = groups.reduce((s, g) => s + g.items.length, 0);

  const toc = groups.map((g) => `<div class="toc-part"><span class="roman">${esc(g.roman)}</span><div><small>${esc(g.label)}</small><b>${esc(g.title)}</b></div><span class="cnt">${g.items.length} أبواب</span></div>
    ${g.items.map((c, i) => `<p class="toc-ch"><span>${two(i + 1)}</span>${esc(c.title)}</p>`).join('')}`).join('')
    + ((book.tools || []).length ? `<div class="toc-part"><span class="roman">◆</span><div><small>ملحق</small><b>عدّة القائد</b></div><span class="cnt">${book.tools.length} أدوات</span></div>` : '');

  const body = groups.map((g) => `
<section class="full part">
  <div class="part-img" style="background-image:url('${abs(PART_IMG[g.key] || COVER_IMG)}')"></div>
  <div class="part-in">
    <span class="roman">${esc(g.roman)}</span><small>${esc(g.label)}</small><h2>${esc(g.title)}</h2>
    <div class="rule"><i></i><b></b><i></i></div>
    ${frameworks(parts, g.key)}
    <ol class="part-list">${g.items.map((c, i) => `<li><span>${two(i + 1)}</span>${esc(c.title)}</li>`).join('')}</ol>
  </div>
</section>
${g.items.map((c, i) => {
    const b = chapterBody(c.md);
    const img = chapterImg(c.id);
    return `<article class="ch${img ? ' has-img' : ''}"${img ? ` style="--chimg:url('${abs(img)}')"` : ''}>
  ${img ? '<div class="ch-band" aria-hidden="true"></div>' : ''}
  <header class="ch-open">
    <span class="ch-num">${two(i + 1)}</span>
    <div><small>${esc(g.label)}</small><h2>${esc(c.title)}</h2></div>
  </header>
  ${b.heads.length > 1 ? `<aside class="inside"><b>في هذا الباب</b><ol>${b.heads.map((h, k) => `<li><span>${k + 1}</span>${esc(h)}</li>`).join('')}</ol></aside>` : ''}
  <div class="txt">${b.html}</div>
  ${b.key ? `<div class="key"><small>الفكرة المحورية</small><p>${inline(b.key)}</p></div>` : ''}
  ${c.reflection ? `<div class="reflect"><small>تأمل</small><p>${inline(c.reflection)}</p><div class="lines"><i></i><i></i><i></i><i></i></div></div>` : ''}
</article>`;
  }).join('')}`).join('');

  const tools = (book.tools || []).length ? `
<section class="appx">
  <header class="ch-open"><span class="ch-num">◆</span><div><small>ملحق</small><h2>عدّة القائد</h2></div></header>
  <p class="lead">أدوات عملية مرافقة لأبواب الكتاب، لكل منها متى تستعملها وكيف تطبقها خطوة بخطوة.</p>
  ${book.tools.map((t) => `<div class="tool">
    <div class="tool-h"><b>${esc(t.title)}</b><small>${esc(parts.find((p) => p.key === t.dimension)?.title || '')}</small></div>
    ${t.summary ? `<p>${inline(t.summary)}</p>` : ''}
    ${t.when ? `<p class="when"><span>متى</span>${inline(t.when)}</p>` : ''}
    ${t.steps ? `<ol class="steps sm">${String(t.steps).split('\n').map((s) => s.trim()).filter(Boolean).map((s, i) => `<li><span class="dot">${i + 1}</span><p>${inline(s.replace(/^\d+[.)]\s*/, ''))}</p></li>`).join('')}</ol>` : ''}
    ${t.source ? `<p class="src">${esc(t.source)}</p>` : ''}
  </div>`).join('')}
</section>` : '';

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كتاب القائد · ${esc(book.name)} · ${esc(book.ref)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@200;300;400&family=Noto+Sans:wght@200;300;400&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 22mm 22mm 22mm;
  @top-right { content: "كتاب القائد"; font: 300 7pt "Noto Kufi Arabic", sans-serif; color: ${C.gold}; }
  @top-left { content: "${esc(book.code || '')}"; font: 300 7pt "Noto Sans", sans-serif; letter-spacing: .2em; color: ${C.muted}; }
  @bottom-right { content: "نسخة شخصية مرخصة لـ ${esc(book.name).replace(/"/g, '')} · يُمنع النسخ والتداول"; font: 300 6.8pt "Noto Kufi Arabic", sans-serif; color: ${C.muted}; }
  @bottom-left { content: "${esc(book.ref)}   ·   " counter(page); font: 300 6.8pt "Noto Sans", sans-serif; color: ${C.muted}; } }
@page full { margin: 0; @top-right { content: none; } @top-left { content: none; } @bottom-right { content: none; } @bottom-left { content: none; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet, .txt, .ch, .appx { max-width: 100%; overflow-wrap: break-word; }
html, body { margin: 0; background: #fff; }
body { font: 300 11pt/2.05 "Noto Kufi Arabic", "Noto Sans", sans-serif; color: ${C.graphite}; }
body::before { content: ''; position: fixed; inset: 0; background: url("data:image/svg+xml,${wm}") repeat; pointer-events: none; z-index: 5; }
.toolbar { display: flex; gap: 8px; justify-content: center; padding: 10px; background: ${C.graphite}; position: sticky; top: 0; z-index: 9; }
.toolbar button { font: 400 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${C.gold}; background: transparent; color: ${C.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; }
.toolbar button.pri { background: ${C.gold}; color: ${C.graphite}; }
@media print { .toolbar { display: none; } }
@media screen { body { background: ${C.faint}; } .sheet { max-width: 200mm; margin: 10mm auto; background: #fff; padding: 16mm 18mm; } }
${COVER_CSS}
.full { page: full; break-after: page; width: 210mm; height: 296.5mm; position: relative; overflow: hidden; }
.full .bk-cover { width: 210mm; height: 296.5mm; }
@media screen { .full { width: auto; height: auto; aspect-ratio: 210/297; margin: -16mm -18mm 16mm; } }
.full .bk-cover { height: 100%; aspect-ratio: auto; }
.roman { font: 200 22pt "Noto Sans", serif; color: ${C.gold}; }
.rule { display: flex; align-items: center; gap: 3mm; width: 60mm; margin: 5mm auto; } .rule i { flex: 1; height: 1px; background: ${C.gold}; opacity: .55; } .rule b { width: 2.2mm; height: 2.2mm; background: ${C.gold}; transform: rotate(45deg); }
h1, h2, h3, h4 { font-weight: 200; margin: 0; }
/* صفحة العنوان والقراءة */
.title-pg { break-after: page; min-height: 240mm; display: grid; align-content: center; text-align: center; }
.title-pg .lg svg { width: 46mm; height: auto; margin: 0 auto 14mm; display: block; }
.title-pg h1 { font-size: 34pt; } .title-pg p { color: ${C.slate}; margin: 0; }
.howto { break-after: page; }
.howto h2, .toc h2 { font-size: 22pt; margin-bottom: 6mm; }
.hw-h { font-weight: 300; font-size: 14pt; margin: 9mm 0 3mm; }
.hw-fw .node { padding: 5mm 3mm; } .hw-fw .node span { font: 200 16pt "Noto Sans", serif; }
.hw-note { color: ${C.slate}; font-size: 9.8pt; margin-top: 4mm; }
.legend { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 6mm; }
.legend div { border: 1px solid ${C.line}; padding: 4mm 5mm; border-radius: 2px; } .legend b { display: block; font-weight: 400; font-size: 10pt; color: ${C.gold}; } .legend p { margin: 1mm 0 0; font-size: 9pt; color: ${C.slate}; line-height: 1.8; }
/* المحتويات */
.toc { break-after: page; }
.toc-part { display: flex; gap: 4mm; align-items: center; margin: 5mm 0 1.5mm; padding-top: 3mm; border-top: 1px solid ${C.line}; }
.toc-part > div { flex: 1; } .toc-part small { display: block; color: ${C.gold}; font-size: 8pt; } .toc-part b { font-weight: 300; font-size: 12pt; }
.toc-part .roman { min-width: 12mm; text-align: center; } .toc-part .cnt { font-size: 8pt; color: ${C.muted}; }
.toc-ch { margin: 0 16mm 0 0; padding: .7mm 0; border-bottom: 1px dotted ${C.line}; font-size: 9.6pt; }
.toc-ch span { display: inline-block; width: 9mm; color: ${C.gold}; font-family: "Noto Sans", sans-serif; }
/* فاصل الجزء */
.full.part { break-before: page; display: grid; grid-template-rows: 118mm 1fr; background: #fff; }
.part-img { background-size: cover; background-position: center; }
.part-in { text-align: center; padding: 12mm 26mm 0; }
.part-in .roman { display: block; font-size: 44pt; line-height: 1; } .part-in small { color: ${C.gold}; letter-spacing: .14em; font-size: 8.5pt; } .part-in h2 { font-size: 24pt; margin-top: 2mm; }
.fw { display: flex; align-items: center; justify-content: center; gap: 2mm; margin: 4mm 0 7mm; }
.fw-n { width: 26mm; text-align: center; border: 1px solid ${C.line}; padding: 2mm 1mm; border-radius: 2px; color: ${C.muted}; }
.fw-n span { display: block; font: 200 13pt "Noto Sans", serif; } .fw-n small { font-size: 7pt; letter-spacing: 0; color: inherit; }
.fw-n.on { border-color: ${C.gold}; background: ${C.graphite}; color: #fff; } .fw-n.on span { color: ${C.goldLight}; }
.fw-l { width: 8mm; height: 1px; background: ${C.gold}; opacity: .5; }
.part-list { list-style: none; margin: 0 auto; padding: 0; max-width: 120mm; text-align: start; columns: 1; }
.part-list li { padding: 1.4mm 0; border-bottom: 1px solid ${C.line}; font-size: 9.6pt; color: ${C.slate}; } .part-list span { display: inline-block; width: 9mm; color: ${C.gold}; font-family: "Noto Sans", sans-serif; }
/* افتتاحية الباب */
.ch, .appx { break-before: page; }
.ch-open { display: flex; gap: 6mm; align-items: flex-end; padding-bottom: 4mm; border-bottom: 1px solid ${C.gold}; margin-bottom: 6mm; }
.ch-num { font: 200 46pt/0.9 "Noto Sans", sans-serif; color: ${C.gold}; }
.ch-open small { color: ${C.gold}; font-size: 8pt; letter-spacing: .06em; } .ch-open h2 { font-size: 19pt; line-height: 1.4; }
.inside { background: ${C.mist}; border-right: 0.6mm solid ${C.gold}; padding: 3.5mm 5mm; margin-bottom: 6mm; }
.inside b { font-weight: 400; font-size: 9pt; color: ${C.gold}; } .inside ol { list-style: none; margin: 1mm 0 0; padding: 0; font-size: 10pt; color: ${C.graphite}; line-height: 1.8; }
.txt h3 { font-weight: 400; font-size: 13.5pt; margin: 7mm 0 2mm; break-after: avoid; }
.txt h3::before { content: ''; display: inline-block; width: 2mm; height: 2mm; background: ${C.gold}; transform: rotate(45deg); margin-left: 2.5mm; vertical-align: middle; }
.txt h4 { font-weight: 400; font-size: 10.4pt; margin: 4mm 0 1mm; color: ${C.slate}; break-after: avoid; }
.txt p { margin: 0 0 3mm; color: ${C.graphite}; text-align: start; orphans: 3; widows: 3; }
.txt b, .card p b, .key b { font-weight: 400; color: ${C.graphite}; }
/* إنفوجرافيك: بطاقات تعريف */
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3.5mm; margin: 4mm 0 5mm; }
.cards.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.card { border: 1px solid ${C.line}; border-top: 0.6mm solid ${C.gold}; padding: 3.5mm 4mm; break-inside: avoid; background: #fff; }
.card { min-width: 0; overflow-wrap: anywhere; }
.card .n { font: 300 8pt "Noto Sans", sans-serif; color: ${C.gold}; } .card b { display: block; font-weight: 400; font-size: 10.5pt; margin: .5mm 0 1mm; color: ${C.graphite}; }
.card p { margin: 0; font-size: 9.6pt; line-height: 1.85; color: ${C.graphite}; text-align: start; }
/* إنفوجرافيك: مسار خطوات */
.steps { list-style: none; margin: 4mm 0 5mm; padding: 0; position: relative; }
.steps::before { content: ''; position: absolute; right: 3.6mm; top: 3mm; bottom: 3mm; width: 1px; background: ${C.gold}; opacity: .45; }
.steps li { display: flex; gap: 4mm; align-items: flex-start; margin-bottom: 2.6mm; position: relative; break-inside: avoid; }
.steps .dot { flex: none; width: 7.2mm; height: 7.2mm; border-radius: 50%; background: ${C.graphite}; color: ${C.goldLight}; font: 300 8.5pt/7.2mm "Noto Sans", sans-serif; text-align: center; }
.steps p { margin: .6mm 0 0; color: ${C.graphite}; font-size: 10.6pt; line-height: 1.85; text-align: start; }
.steps.sm .dot { width: 6mm; height: 6mm; line-height: 6mm; font-size: 7.5pt; } .steps.sm::before { right: 3mm; } .steps.sm p { font-size: 9pt; }
.bul { margin: 2mm 0 4mm; padding: 0; list-style: none; } .bul li { position: relative; padding-right: 5mm; color: ${C.graphite}; margin-bottom: 1.4mm; }
.bul li::before { content: ''; position: absolute; right: 0; top: 2.6mm; width: 1.6mm; height: 1.6mm; background: ${C.gold}; transform: rotate(45deg); }
/* صورة الباب: شريط افتتاحي داكن خلف رقم الباب وعنوانه */
.ch.has-img { position: relative; }
.ch-band { height: 64mm; margin-bottom: -30mm; background: ${C.graphite} var(--chimg) center / cover; position: relative; }
.ch-band::after { content: ''; position: absolute; inset: 0; background: rgba(11,39,47,.45); }
.ch.has-img .ch-open { position: relative; z-index: 1; border-bottom-color: ${C.goldLight}; color: #fff; padding: 0 6mm 4mm; margin-bottom: 10mm; }
.ch.has-img .ch-open h2 { color: #fff; } .ch.has-img .ch-open small, .ch.has-img .ch-num { color: ${C.goldLight}; }
/* الرسوم */
.inside li span { display: inline-block; width: 6mm; color: ${C.gold}; font-family: "Noto Sans", sans-serif; }
.fig { margin: 6mm 0; break-inside: avoid; }
.fig.f-compare-w, .fig.f-layers-w { break-inside: auto; } .f-compare tr { break-inside: avoid; }
.fig figcaption { font-size: 9pt; color: ${C.gold}; letter-spacing: .06em; margin-bottom: 3mm; }
.fig figcaption::before { content: ''; display: inline-block; width: 6mm; height: 1px; background: ${C.gold}; margin-left: 2mm; vertical-align: middle; }
.fig b { font-weight: 400; } .fig p { margin: 1mm 0 0; font-size: 9pt; line-height: 1.75; color: ${C.slate}; }
.f-chain { display: flex; align-items: stretch; gap: 0; }
.f-chain .node { flex: 1; min-width: 0; background: ${C.graphite}; color: #fff; padding: 3.5mm 3mm; text-align: center; overflow-wrap: anywhere; }
.f-chain .node:nth-child(4n+1) { background: ${C.graphite}; } .f-chain .node:nth-child(4n+3) { background: #173A44; }
.f-chain .node span { display: block; font: 300 8pt "Noto Sans", sans-serif; color: ${C.goldLight}; } .f-chain .node b { font-size: 10pt; color: #fff; } .f-chain .node p { color: rgba(255,255,255,.78); font-size: 8.3pt; }
.f-chain .arw { flex: none; width: 0; height: 0; align-self: center; border-block: 4mm solid transparent; border-right: 3mm solid ${C.gold}; margin: 0 -.5mm; z-index: 1; }
.f-cycle { position: relative; width: 120mm; height: 104mm; margin: 0 auto; }
.f-cycle svg { position: absolute; inset: 6mm 14mm; width: calc(100% - 28mm); height: calc(100% - 12mm); }
.f-cycle .cnode { position: absolute; transform: translate(-50%, -50%); width: 36mm; text-align: center; background: #fff; border: 1px solid ${C.line}; border-top: .6mm solid ${C.gold}; padding: 2mm; }
.f-cycle .cnode span { display: inline-block; width: 5mm; height: 5mm; border-radius: 50%; background: ${C.graphite}; color: ${C.goldLight}; font: 300 7pt/5mm "Noto Sans", sans-serif; }
.f-cycle .cnode b { display: block; font-size: 9.5pt; } .f-cycle .cnode p { font-size: 8pt; }
.f-compare { width: 100%; border-collapse: collapse; font-size: 9.4pt; table-layout: fixed; }
.f-compare thead th { background: ${C.graphite}; color: #fff; font-weight: 300; padding: 2.5mm 3mm; text-align: center; }
.f-compare thead th:first-child { background: transparent; }
.f-compare tbody th { width: 26mm; text-align: start; color: ${C.gold}; font-weight: 400; padding: 2.5mm 2mm; border-bottom: 1px solid ${C.line}; vertical-align: top; }
.f-compare td { padding: 2.5mm 3mm; border-bottom: 1px solid ${C.line}; color: ${C.graphite}; vertical-align: top; line-height: 1.75; }
.f-compare td + td { border-right: 1px solid ${C.line}; }
.f-pyramid { display: grid; justify-items: center; gap: 1.2mm; }
.f-pyramid .lvl { background: ${C.graphite}; color: #fff; text-align: center; padding: 2.4mm 3mm; clip-path: polygon(4% 0, 96% 0, 100% 100%, 0 100%); }
.f-pyramid .lvl:first-child { background: ${C.gold}; color: ${C.graphite}; } .f-pyramid .lvl:first-child b { color: ${C.graphite}; }
.f-pyramid .lvl b { color: #fff; font-size: 10pt; } .f-pyramid .lvl span { display: block; font-size: 8.3pt; opacity: .8; }
.f-matrix { display: grid; grid-template-columns: auto 1fr; grid-template-rows: 1fr auto; gap: 2mm; }
.f-matrix .grid { grid-column: 2; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm; }
.f-matrix .q { border: 1px solid ${C.line}; padding: 4mm; min-height: 26mm; background: #fff; } .f-matrix .q.hi { background: ${C.graphite}; color: #fff; } .f-matrix .q.hi b { color: ${C.goldLight}; } .f-matrix .q.hi p { color: rgba(255,255,255,.8); }
.f-matrix .ay, .f-matrix .ax { display: flex; justify-content: space-between; align-items: center; gap: 2mm; font-size: 7.6pt; color: ${C.muted}; }
.f-matrix .ay b, .f-matrix .ax b { font-weight: 400; color: ${C.gold}; font-size: 8.4pt; }
.f-matrix .ay { grid-column: 1; grid-row: 1; flex-direction: column; width: 9mm; text-align: center; }
.f-matrix .ay b { writing-mode: vertical-rl; }
.f-matrix .ax { grid-column: 2; grid-row: 2; border-top: 1px solid ${C.gold}; padding-top: 1.2mm; }
.f-matrix .ay { border-left: 1px solid ${C.gold}; padding-left: 1.2mm; }
.f-timeline { display: flex; position: relative; padding-top: 6mm; }
.f-timeline::before { content: ''; position: absolute; top: 7.6mm; right: 0; left: 0; height: 1px; background: ${C.gold}; }
.f-timeline .t { flex: 1; min-width: 0; text-align: center; padding: 0 2mm; position: relative; }
.f-timeline .t i { display: block; width: 3.4mm; height: 3.4mm; margin: 0 auto 3mm; background: ${C.graphite}; border: .5mm solid ${C.gold}; transform: rotate(45deg); }
.f-timeline .t b { font-size: 9.8pt; }
.f-stat { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border-block: 1px solid ${C.line}; }
.f-stat div { text-align: center; padding: 4mm 2mm; } .f-stat div + div { border-right: 1px solid ${C.line}; }
.f-stat b { display: block; font: 200 24pt/1.2 "Noto Sans", "Noto Kufi Arabic", sans-serif; color: ${C.gold}; } .f-stat span { font-size: 8.8pt; color: ${C.slate}; }
.f-layers { display: grid; gap: 1.2mm; }
.f-layers .ly { background: ${C.mist}; border-right: .8mm solid ${C.gold}; padding: 2.6mm 4mm; display: flex; gap: 4mm; align-items: baseline; }
.f-layers .ly:nth-child(odd) { background: #EEF1F0; } .f-layers .ly b { font-size: 10pt; min-width: 30mm; } .f-layers .ly span { font-size: 9pt; color: ${C.slate}; }
/* اقتباس بارز والفكرة المحورية والتأمل */
.pull { break-inside: avoid; margin: 6mm 8mm; padding: 2mm 0 3mm; font-size: 13.5pt; font-weight: 200; line-height: 1.8; color: ${C.graphite}; text-align: center; border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line}; }
.pull span { display: block; font: 200 30pt/1 "Noto Sans", serif; color: ${C.gold}; height: 9mm; }
.key { background: ${C.graphite}; color: #fff; padding: 6mm 8mm; margin: 8mm 0 5mm; break-inside: avoid; }
.key small { color: ${C.goldLight}; letter-spacing: .14em; font-size: 8pt; } .key p { margin: 2mm 0 0; font-size: 13pt; font-weight: 200; line-height: 1.8; } .key b { color: #fff; }
.reflect { border: 1px solid ${C.gold}; padding: 5mm 6mm; break-inside: avoid; margin-top: 5mm; }
.reflect small { color: ${C.gold}; font-size: 8.5pt; letter-spacing: .14em; } .reflect p { margin: 1mm 0 3mm; color: ${C.graphite}; }
.reflect .lines i { display: block; height: 9mm; border-bottom: 1px dotted ${C.muted}; }
/* الملحق */
.lead { color: ${C.slate}; margin: 0 0 6mm; }
.tool { border: 1px solid ${C.line}; padding: 5mm 6mm; margin-bottom: 5mm; break-inside: avoid; }
.tool-h { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid ${C.line}; padding-bottom: 2mm; margin-bottom: 2.5mm; }
.tool-h b { font-weight: 300; font-size: 13pt; } .tool-h small { color: ${C.gold}; font-size: 8pt; }
.tool p { margin: 0 0 2mm; color: ${C.graphite}; font-size: 10.2pt; } .tool .when span { display: inline-block; color: ${C.gold}; margin-left: 2mm; font-weight: 400; }
.tool .src { font-size: 8pt; color: ${C.muted}; margin: 2mm 0 0; }
/* الختام */
.end { break-before: page; text-align: center; padding-top: 70mm; color: ${C.muted}; font-size: 9pt; line-height: 2.2; }
.end .lg svg { width: 34mm; height: auto; margin: 0 auto 10mm; display: block; }
.end bdi { font-family: "Noto Sans", sans-serif; }
</style></head><body>
<div class="toolbar"><button class="pri" data-act="print">طباعة أو حفظ PDF</button><button data-act="close">إغلاق</button></div>
<main class="sheet">
<section class="full">${coverHtml({ name: book.name, code: book.code, issued_at: book.issued_at, ref: book.ref })}</section>
<section class="title-pg">
  <div class="lg">${LOGO}</div>
  <p style="font:300 8pt 'Noto Sans';letter-spacing:.42em;color:${C.gold}">THE LEADER'S BOOK</p>
  <h1>كتاب القائد</h1>
  <div class="rule"><i></i><b></b><i></i></div>
  <p>الأطر الثلاثة لبرنامج القادة من Milestone Impact</p>
  <p style="margin-top:3mm;font-size:9pt;color:${C.muted}">${parts.map((p) => esc(p.title)).join(' · ')}</p>
</section>
<section class="howto">
  <h2>كيف تقرأ هذا الكتاب</h2>
  <p style="color:${C.slate}">يتألف الكتاب من ${groups.length} أجزاء و${total} بابًا، يبني كل جزء إطارًا من أطر البرنامج، ويسلّم الجزء التالي ما بناه. اقرأ الأبواب بترتيبها، وقف عند كل «تأمل» قبل أن تمضي.</p>
  <div class="legend">
    <div><b>في هذا الباب</b><p>خريطة الباب في أوله: عناوينه الكبرى قبل أن تقرأها.</p></div>
    <div><b>بطاقات المفاهيم</b><p>المصطلحات الأساسية في بطاقات متجاورة تسهل المقارنة بينها.</p></div>
    <div><b>مسار الخطوات</b><p>الخطوات والأهداف المرقّمة على خط واحد بترتيب تطبيقها.</p></div>
    <div><b>الفكرة المحورية</b><p>خلاصة الباب في جملة واحدة تحملها معك.</p></div>
    <div><b>تأمل</b><p>سؤال يربط الباب بعملك، مع مساحة لتكتب إجابتك.</p></div>
    <div><b>عدّة القائد</b><p>ملحق الأدوات العملية بخطوات تطبيقها.</p></div>
  </div>
  <h3 class="hw-h">الأطر الثلاثة</h3>
  <div class="f-chain hw-fw">${parts.map((p, i) => `${i ? '<i class="arw"></i>' : ''}<div class="node"><span>${esc(p.roman)}</span><b>${esc(p.title)}</b><p>${esc(FW_LINE[p.key] || '')}</p></div>`).join('')}</div>
  <p class="hw-note">تُقرأ الأطر بترتيبها: يستلم كل إطار ما بناه الذي قبله، فالتنفيذ المنضبط يصنع قيمة مقيسة، والقيمة المقيسة تمكّن القائد من التحول.</p>
</section>
<section class="toc"><h2>المحتويات</h2>${toc}</section>
${body}
${tools}
<section class="end">
  <div class="lg">${LOGO}</div>
  <p>انتهت النسخة الشخصية من كتاب القائد · ${total} بابًا</p>
  <p>صدرت لـ ${esc(book.name)} في ${esc(fmt(book.issued_at))} برقم <bdi dir="ltr">${esc(book.ref)}</bdi></p>
  <p>هذا المحتوى ملكية فكرية لـ <bdi dir="ltr">Milestone Impact</bdi>، ومرخص لصاحب النسخة للاستخدام الشخصي فقط.<br>يُمنع نسخه أو نشره أو مشاركته مع أي طرف آخر، وكل صفحة تحمل اسم صاحبها ورقم نسختها.</p>
  <p>جميع الحقوق محفوظة <bdi dir="ltr">© ${new Date(book.issued_at).getFullYear()} Milestone Impact</bdi></p>
</section>
</main>
</body></html>`;
}

// تُكتب في نافذة فُتحت متزامنة مع النقرة، وتُربط أزرارها من هنا (سياسة المحتوى تمنع السكربت في الصفحة)
export function writeBook(win, book, parts) {
  if (!win) return false;
  win.document.open();
  win.document.write(bookHtml(book, parts));
  win.document.close();
  win.document.querySelector('[data-act="print"]')?.addEventListener('click', () => win.print());
  win.document.querySelector('[data-act="close"]')?.addEventListener('click', () => win.close());
  return true;
}
