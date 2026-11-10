// فحص مقروئية شاشة على عرض الجوال: لا تمرير أفقي، ولا نص يُقرأ دون 13 بكسل.
// المستثنى زخرفي: ما داخل svg، وما وُسم aria-hidden، وغلاف الكتيب المصغّر.
export async function readable(page) {
  return page.evaluate(() => {
    const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const tiny = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; const el = n.parentElement; const t = n.textContent.trim();
      if (t.length < 2 || !el || !vis(el) || el.closest('svg, [aria-hidden="true"], .bk-cover')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 13) tiny.push(`${el.tagName.toLowerCase()}.${el.className}:${fs}:${t.slice(0, 20)}`);
    }
    const de = document.documentElement;
    return { hscroll: de.scrollWidth > window.innerWidth + 1, tiny: [...new Set(tiny)] };
  });
}
