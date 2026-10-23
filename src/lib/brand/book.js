// ════════════════════════════════════════════════════════════════
// كتاب القائد: الغلاف والنسخة الشخصية PDF بهوية Milestone Impact
// ════════════════════════════════════════════════════════════════
// مصدر واحد: محلل الـ Markdown نفسه يغذي القراءة على اللوحة (Handbook.jsx)
// والنسخة المطبوعة، والغلاف نفسه يظهر داخل المنصة وأول صفحة في الـ PDF.
// النسخة الشخصية تحمل على كل صفحة اسم المشارك وبريده ورقم الإصدار، فأي
// تسريب يُعرف مصدره. كل نص يمر عبر esc().
import LOGO_SRC from '../../assets/brand/milestone-impact.svg?raw';
import { C, esc } from './doc.js';

const LOGO = LOGO_SRC.replace(/<\?xml[^>]*>\s*/, '');

// ── Markdown المبسط إلى كتل: ## و### وقوائم واقتباس وفقرات ──
export function parseMd(md) {
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m;
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); blocks.push({ type: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); }
    else if ((m = line.match(/^[-•]\s+(.*)$/))) { flush(); blocks.push({ type: 'li', marker: '•', text: m[1] }); }
    else if ((m = line.match(/^(\d+)[.)]\s+(.*)$/))) { flush(); blocks.push({ type: 'li', marker: `${m[1]}.`, text: m[2] }); }
    else if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ type: 'quote', text: m[1] }); }
    else para.push(line);
  }
  flush();
  return blocks;
}

// **غامق** إلى وزن متوسط (الهوية بلا خط عريض)، بعد الترميز
const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

const fmt = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });

// ── الغلاف ──
// c: { title, name, level?, issued_at?, ref? }
export const COVER_CSS = `
.bk-cover { position: relative; background: #fff; border: 1px solid ${C.line}; aspect-ratio: 210 / 297; width: 100%; overflow: hidden; color: ${C.graphite}; font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; }
.bk-cover .bk-frame { position: absolute; inset: 4.5%; border: 1px solid ${C.gold}; }
.bk-cover .bk-frame::after { content: ''; position: absolute; inset: 1.4%; border: 1px solid ${C.line}; }
.bk-cover .bk-in { position: absolute; inset: 9% 11%; display: grid; grid-template-rows: auto 1fr auto; text-align: center; }
.bk-cover .bk-logo svg { width: 34%; height: auto; display: block; margin: 0 auto; }
.bk-cover .bk-mid { align-self: center; }
.bk-cover .bk-en { font: 300 clamp(7px, 1.25cqi, 11px) "Noto Sans", sans-serif; letter-spacing: .42em; text-transform: uppercase; color: ${C.gold}; margin: 0 0 3%; }
.bk-cover h1 { font-weight: 200; font-size: clamp(22px, 7.5cqi, 54px); line-height: 1.25; margin: 0; }
.bk-cover .bk-rule { display: flex; align-items: center; gap: 3%; width: 46%; margin: 6% auto; }
.bk-cover .bk-rule i { flex: 1; height: 1px; background: ${C.gold}; opacity: .55; }
.bk-cover .bk-rule b { width: 7px; height: 7px; background: ${C.gold}; transform: rotate(45deg); }
.bk-cover .bk-track { font-weight: 300; font-size: clamp(12px, 3.2cqi, 22px); color: ${C.slate}; margin: 0; }
.bk-cover .bk-for { font-size: clamp(9px, 1.9cqi, 13px); color: ${C.muted}; margin: 9% 0 1%; }
.bk-cover .bk-name { font-weight: 300; font-size: clamp(14px, 4.2cqi, 30px); margin: 0; }
.bk-cover .bk-meta { font-size: clamp(8px, 1.6cqi, 11px); color: ${C.muted}; line-height: 1.9; }
.bk-cover .bk-meta bdi { font-family: "Noto Sans", sans-serif; letter-spacing: .06em; }
.bk-cover-host { container-type: inline-size; }
`;

export function coverHtml(c) {
  return `<div class="bk-cover"><div class="bk-frame"></div><div class="bk-in">
  <div class="bk-logo">${LOGO}</div>
  <div class="bk-mid">
    <p class="bk-en">The Leader's Book</p>
    <h1>كتاب القائد</h1>
    <div class="bk-rule"><i></i><b></b><i></i></div>
    ${c.title ? `<p class="bk-track">${esc(c.title)}</p>` : ''}
    <p class="bk-for">نسخة شخصية مركّبة لمسار</p>
    <p class="bk-name">${esc(c.name)}</p>
  </div>
  <div class="bk-meta">${c.level ? `المستوى العام: ${esc(c.level)}<br>` : ''}${c.ref ? `رقم النسخة <bdi dir="ltr">${esc(c.ref)}</bdi> · ${esc(fmt(c.issued_at))}<br>` : ''}جميع الحقوق محفوظة <bdi dir="ltr">© ${new Date(c.issued_at || Date.now()).getFullYear()} Milestone Impact</bdi></div>
</div></div>`;
}

// ── النسخة الشخصية PDF (A4 طولي) ──
// book: { ref, issued_at, name, email, track?: { title }, chapters: [{ dimension, title, md }] }
// parts: [{ key, roman, label, title }] ترتيب الأجزاء ومسمياتها من التطبيق
// levelTitle: اسم المستوى العام للعرض
function blocksHtml(md) {
  return parseMd(md).map((b) => {
    if (b.type === 'h2') return `<h3>${inline(b.text)}</h3>`;
    if (b.type === 'h3') return `<h4>${inline(b.text)}</h4>`;
    if (b.type === 'li') return `<p class="li"><span>${esc(b.marker)}</span>${inline(b.text)}</p>`;
    if (b.type === 'quote') return `<blockquote>${inline(b.text)}</blockquote>`;
    return `<p>${inline(b.text)}</p>`;
  }).join('');
}

export function bookHtml(book, parts, levelTitle) {
  const mark = `${book.name} · ${book.email} · ${book.ref}`;
  const wm = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='520' height='300'><text x='260' y='150' text-anchor='middle' transform='rotate(-28 260 150)' font-family='Noto Sans, Arial' font-size='15' fill='${C.graphite}' fill-opacity='.055'>${esc(mark)}</text></svg>`);
  const groups = parts.map((p) => ({ ...p, items: book.chapters.filter((c) => c.dimension === p.key) })).filter((p) => p.items.length);
  let n = 0;
  const toc = groups.map((g) => `<div class="toc-part"><span class="roman">${esc(g.roman)}</span><div><small>${esc(g.label)}</small><b>${esc(g.title)}</b></div></div>
    ${g.items.map((c, i) => `<p class="toc-ch"><span>${String(i + 1).padStart(2, '0')}</span>${esc(c.title)}</p>`).join('')}`).join('');
  const body = groups.map((g) => `
<section class="part"><div class="part-in"><span class="roman">${esc(g.roman)}</span><small>${esc(g.label)}</small><h2>${esc(g.title)}</h2><div class="rule"><i></i><b></b><i></i></div></div></section>
${g.items.map((c, i) => { n += 1; return `<article class="ch"><header><small>${esc(g.label)} · الباب ${String(i + 1).padStart(2, '0')}</small><h2>${esc(c.title)}</h2></header>${blocksHtml(c.md)}</article>`; }).join('')}`).join('');

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كتاب القائد · ${esc(book.name)} · ${esc(book.ref)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@200;300;400&family=Noto+Sans:wght@200;300;400&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 20mm 22mm 22mm;
  @bottom-right { content: "نسخة شخصية مرخصة لـ ${esc(book.name).replace(/"/g, '')} · يُمنع النسخ والتداول"; font: 300 7pt "Noto Kufi Arabic", sans-serif; color: ${C.muted}; }
  @bottom-left { content: "${esc(book.ref)} · " counter(page); font: 300 7pt "Noto Sans", sans-serif; color: ${C.muted}; } }
@page cover { margin: 0; @bottom-right { content: none; } @bottom-left { content: none; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: #fff; }
body { font: 300 10.5pt/2 "Noto Kufi Arabic", "Noto Sans", sans-serif; color: ${C.graphite}; }
body::before { content: ''; position: fixed; inset: 0; background: url("data:image/svg+xml,${wm}") repeat; pointer-events: none; z-index: 5; }
.toolbar { display: flex; gap: 8px; justify-content: center; padding: 10px; background: ${C.graphite}; position: sticky; top: 0; z-index: 9; }
.toolbar button { font: 400 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${C.gold}; background: transparent; color: ${C.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; }
.toolbar button.pri { background: ${C.gold}; color: ${C.graphite}; }
@media print { .toolbar { display: none; } }
@media screen { body { background: ${C.faint}; } .sheet { max-width: 190mm; margin: 10mm auto; background: #fff; padding: 14mm 18mm; } }
${COVER_CSS}
.cover-page { page: cover; break-after: page; height: 297mm; width: 210mm; }
@media screen { .cover-page { width: auto; height: auto; margin: -14mm -18mm 14mm; } }
.cover-page .bk-cover { border: 0; height: 100%; aspect-ratio: auto; container-type: inline-size; }
.toc { break-after: page; }
.toc h2, .part h2, .ch h2 { font-weight: 200; margin: 0; }
.toc h2 { font-size: 22pt; margin-bottom: 8mm; }
.toc-part { display: flex; gap: 4mm; align-items: center; margin: 7mm 0 2mm; padding-top: 3mm; border-top: 1px solid ${C.line}; }
.toc-part small { display: block; color: ${C.gold}; font-size: 8pt; } .toc-part b { font-weight: 300; font-size: 12pt; }
.roman { font: 200 22pt "Noto Sans", serif; color: ${C.gold}; min-width: 12mm; text-align: center; }
.toc-ch { margin: 0; padding: 1.4mm 0; border-bottom: 1px dotted ${C.line}; font-size: 10pt; }
.toc-ch span { display: inline-block; width: 10mm; color: ${C.muted}; font-family: "Noto Sans", sans-serif; }
.part { break-before: page; break-after: page; height: 230mm; display: grid; place-items: center; text-align: center; }
.part .roman { display: block; font-size: 54pt; } .part small { color: ${C.gold}; letter-spacing: .2em; } .part h2 { font-size: 26pt; margin-top: 3mm; }
.rule { display: flex; align-items: center; gap: 3mm; width: 60mm; margin: 6mm auto 0; } .rule i { flex: 1; height: 1px; background: ${C.gold}; opacity: .55; } .rule b { width: 2.2mm; height: 2.2mm; background: ${C.gold}; transform: rotate(45deg); }
.ch { break-before: page; }
.ch header { border-bottom: 1px solid ${C.gold}; padding-bottom: 3mm; margin-bottom: 6mm; }
.ch header small { color: ${C.gold}; font-size: 8pt; letter-spacing: .08em; } .ch h2 { font-size: 18pt; }
.ch h3 { font-weight: 300; font-size: 13pt; margin: 6mm 0 2mm; color: ${C.graphite}; break-after: avoid; }
.ch h4 { font-weight: 400; font-size: 10.5pt; margin: 4mm 0 1mm; color: ${C.slate}; break-after: avoid; }
.ch p { margin: 0 0 2.5mm; color: ${C.slate}; text-align: justify; orphans: 3; widows: 3; }
.ch p.li { padding-right: 6mm; position: relative; text-align: start; } .ch p.li span { position: absolute; right: 0; color: ${C.gold}; }
.ch b { font-weight: 400; color: ${C.graphite}; }
.ch blockquote { margin: 4mm 0; padding: 3mm 5mm; border-right: 0.6mm solid ${C.gold}; background: ${C.mist}; color: ${C.graphite}; }
.end { break-before: page; text-align: center; padding-top: 80mm; color: ${C.muted}; font-size: 9pt; line-height: 2.2; }
.end bdi { font-family: "Noto Sans", sans-serif; }
</style></head><body>
<div class="toolbar"><button class="pri" data-act="print">طباعة أو حفظ PDF</button><button data-act="close">إغلاق</button></div>
<main class="sheet">
<section class="cover-page">${coverHtml({ title: book.track?.title, name: book.name, level: levelTitle, issued_at: book.issued_at, ref: book.ref })}</section>
<section class="toc"><h2>المحتويات</h2>${toc}</section>
${body}
<section class="end">
  <p>انتهت النسخة الشخصية من كتاب القائد · ${n} بابًا</p>
  <p>صدرت لـ ${esc(book.name)} في ${esc(fmt(book.issued_at))} برقم <bdi dir="ltr">${esc(book.ref)}</bdi></p>
  <p>هذا المحتوى ملكية فكرية لـ <bdi dir="ltr">Milestone Impact</bdi>، ومرخص لصاحب النسخة للاستخدام الشخصي فقط.<br>يُمنع نسخه أو نشره أو مشاركته مع أي طرف آخر، وكل صفحة تحمل اسم صاحبها ورقم نسختها.</p>
</section>
</main>
</body></html>`;
}

// تُكتب في نافذة فُتحت متزامنة مع النقرة، وتُربط أزرارها من هنا (سياسة المحتوى تمنع السكربت في الصفحة)
export function writeBook(win, book, parts, levelTitle) {
  if (!win) return false;
  win.document.open();
  win.document.write(bookHtml(book, parts, levelTitle));
  win.document.close();
  win.document.querySelector('[data-act="print"]')?.addEventListener('click', () => win.print());
  win.document.querySelector('[data-act="close"]')?.addEventListener('click', () => win.close());
  return true;
}
