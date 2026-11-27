// ════════════════════════════════════════════════════════════════
// معالجة شعار الجهة للعلامة المشتركة: تفريغ الخلفية، القصّ، والفحص
// ════════════════════════════════════════════════════════════════
// الخلفية تُفرَّغ بالتعبئة من الحواف فقط (لا كل بكسل أبيض)، فتبقى الأجزاء
// البيضاء داخل الشعار كما هي. الحافة ناعمة بقناة شفافية متدرجة.
// النواة (removeBackground · trim · inspect) تعمل على مصفوفة RGBA فتُختبر
// بلا متصفح، وprocessLogo يلفّها بـ canvas في المتصفح.

const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const lum = ([r, g, b]) => {
  const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// لون الخلفية من حواف الصورة: يُعتمد إن تشابهت ≥ 85٪ من بكسلات الحافة وكانت معتمة
export function detectBackground(data, w, h) {
  const px = [];
  const at = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  for (let x = 0; x < w; x += 1) { px.push(at(x, 0), at(x, h - 1)); }
  for (let y = 0; y < h; y += 1) { px.push(at(0, y), at(w - 1, y)); }
  const transparent = px.filter((p) => p[3] < 200).length / px.length;
  if (transparent > 0.5) return { kind: 'transparent' };
  const avg = [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / px.length);
  const share = px.filter((p) => dist(p, avg) < 28).length / px.length;
  return share >= 0.85 ? { kind: 'solid', color: avg.map(Math.round), share } : { kind: 'complex', share };
}

// تعبئة من الحواف: كل بكسل متصل بالحافة وقريب من لون الخلفية يصير شفافًا،
// وما بين tol وtol*2 شفاف جزئيًا لحافة ناعمة بلا هالة
export function removeBackground(data, w, h, bg, tol = 34) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h && !seen[y * w + x]) { seen[y * w + x] = 1; stack.push(y * w + x); } };
  for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }
  let cleared = 0;
  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    const d = dist([data[i], data[i + 1], data[i + 2]], bg);
    if (d >= tol * 2) continue;
    if (d < tol) { data[i + 3] = 0; cleared += 1; } else { data[i + 3] = Math.round(data[i + 3] * ((d - tol) / tol)); }
    const x = p % w, y = (p / w) | 0;
    if (d < tol) { push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  }
  return cleared / (w * h);
}

// حدود المحتوى المعتم مع هامش صغير
export function trimBox(data, w, h, pad = 0.02) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const px = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
  return { x: Math.max(0, x0 - px), y: Math.max(0, y0 - px), w: Math.min(w, x1 + px + 1) - Math.max(0, x0 - px), h: Math.min(h, y1 + px + 1) - Math.max(0, y0 - px) };
}

// متوسط لون الحبر (البكسلات المعتمة) لقياس تباينه على أرضية الشهادة
export function inkColor(data) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
  return n ? [r / n, g / n, b / n].map(Math.round) : null;
}

// تقرير الفحص: كل بند { ok, level: 'ok'|'warn'|'bad', text }
export function inspect({ width, height, bg, cleared, ink, ground = [255, 255, 255], box = { w: 48, h: 13 } }) {
  const out = [];
  // الدقة الفعلية عند الطباعة في مساحة العلامة المشتركة (حتى 48×13 مم على الشهادة)
  const printMm = Math.min(box.w / width, box.h / height) * width;
  const dpi = Math.round(width / (printMm / 25.4));
  out.push(dpi >= 300 ? { level: 'ok', text: `الدقة ممتازة للطباعة (${dpi} نقطة/بوصة عند ${printMm.toFixed(0)} مم)` }
    : dpi >= 150 ? { level: 'warn', text: `الدقة مقبولة (${dpi} نقطة/بوصة): الأفضل ملف SVG أو PNG أكبر للطباعة الفاخرة` }
      : { level: 'bad', text: `الدقة منخفضة (${dpi} نقطة/بوصة): سيظهر الشعار مشوشًا، اطلب من الجهة ملفًا أكبر` });
  if (bg.kind === 'transparent') out.push({ level: 'ok', text: 'الشعار شفاف أصلًا' });
  else if (bg.kind === 'solid') out.push({ level: 'ok', text: `فُرِّغت الخلفية (${Math.round(cleared * 100)}٪ من المساحة) مع الإبقاء على الأجزاء الداخلية` });
  else out.push({ level: 'warn', text: 'الخلفية مركّبة (صورة أو تدرّج) فلم تُفرَّغ آليًا: اطلب نسخة شفافة من الجهة' });
  if (ink) {
    const cr = contrast(ink, ground);
    out.push(cr >= 3 ? { level: 'ok', text: `التباين على ورق الشهادة جيد (${cr.toFixed(1)}:1)` }
      : { level: 'warn', text: `الشعار فاتح على ورق الشهادة (${cr.toFixed(1)}:1): يُنصح بالنسخة أحادية اللون` });
  }
  const ratio = width / height;
  if (ratio > 5 || ratio < 0.25) out.push({ level: 'warn', text: 'أبعاد الشعار متطرفة: سيظهر صغيرًا في مساحة العلامة المشتركة' });
  return out;
}

// تلوين أحادي (Graphite) يحافظ على الشفافية: للانسجام حين يتعارض لون الشعار مع الهوية
export function monochrome(data, rgb = [11, 39, 47]) {
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; }
}

// في المتصفح: ملف ← { dataUrl, mono, report, width, height }
export async function processLogo(file, { maxSide = 1600 } = {}) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const bg = detectBackground(img.data, w, h);
  const cleared = bg.kind === 'solid' ? removeBackground(img.data, w, h, bg.color) : 0;
  const box = trimBox(img.data, w, h) || { x: 0, y: 0, w, h };
  ctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d').drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const outCtx = out.getContext('2d', { willReadFrequently: true });
  const trimmed = outCtx.getImageData(0, 0, box.w, box.h);
  const ink = inkColor(trimmed.data);
  const report = inspect({ width: box.w, height: box.h, bg, cleared, ink });
  const small = document.createElement('canvas');
  const k = Math.min(1, 64 / Math.max(box.w, box.h));
  small.width = Math.max(1, Math.round(box.w * k)); small.height = Math.max(1, Math.round(box.h * k));
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(out, 0, 0, small.width, small.height);
  const light = isLightLogo(sctx.getImageData(0, 0, small.width, small.height).data);
  const dataUrl = out.toDataURL('image/png');
  monochrome(trimmed.data);
  outCtx.putImageData(trimmed, 0, 0);
  return { dataUrl, mono: out.toDataURL('image/png'), report, width: box.w, height: box.h, background: bg.kind, light, aspect: aspectClass(box.w / box.h) };
}

// ── أبعاد الشعار وفئته (تُحسب مرة هنا، وتستعملها الوثيقة والشهادة) ──
// عريض (نسبة > 3) · مربع (0.8 إلى 3) · طويل (< 0.8). الفئة تحدد الارتفاع والعرض الأقصى في CSS (.org.w/.org.s/.org.t)
export const aspectClass = (ratio) => (!(ratio > 0) ? 's' : ratio > 3 ? 'w' : ratio < 0.8 ? 't' : 's');

const decode = (src) => {
  const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(String(src || ''));
  if (!m) return null;
  try { return { type: m[1].toLowerCase(), bin: atob(m[2]) }; } catch { return null; }
};
const u32 = (s, i) => ((s.charCodeAt(i) << 24) | (s.charCodeAt(i + 1) << 16) | (s.charCodeAt(i + 2) << 8) | s.charCodeAt(i + 3)) >>> 0;
const u16 = (s, i) => (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1);

function svgDims(text) {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (vb) return { w: +vb[1], h: +vb[2] };
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(text), h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(text);
  return w && h ? { w: +w[1], h: +h[1] } : null;
}

// الأبعاد الطبيعية من رابط data: (ترويسة PNG، مقطع SOF في JPEG، viewBox في SVG)؛ وإلا null
export function logoDims(src) {
  const d = decode(src);
  if (!d) return null;
  const s = d.bin;
  if (d.type === 'svg+xml') return svgDims(s);
  if (d.type === 'png' && s.slice(12, 16) === 'IHDR') return { w: u32(s, 16), h: u32(s, 20) };
  if (/jpe?g/.test(d.type)) {
    for (let i = 2; i + 9 < s.length;) {
      if (s.charCodeAt(i) !== 0xff) return null;
      const mk = s.charCodeAt(i + 1);
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { w: u16(s, i + 7), h: u16(s, i + 5) };
      i += 2 + u16(s, i + 2);
    }
  }
  return null;
}

export const logoClass = (src, dims = logoDims(src)) => aspectClass(dims && dims.h ? dims.w / dims.h : null);

// الشعار الفاتح: متوسط الإضاءة النسبية للبكسلات المعتمة فوق 0.85 (عينة على canvas صغير في المتصفح)
export function isLightLogo(data, threshold = 0.85) {
  let s = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) { s += lum([data[i], data[i + 1], data[i + 2]]); n += 1; }
  return n > 0 && s / n > threshold;
}

const hexRgb = (h) => { let x = h.replace('#', ''); if (x.length === 3) x = x.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
// SVG بألوان التعبئة الصريحة (fill="#..." أو fill:#...)؛ بلا ألوان يُعد غير فاتح
export function svgIsLight(text, threshold = 0.85) {
  const cols = [...String(text).matchAll(/fill\s*[:=]\s*["']?\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\b/gi)].map((m) => hexRgb(m[1]));
  if (!cols.length) return false;
  return cols.reduce((a, c) => a + lum(c), 0) / cols.length > threshold;
}

// تزامني للوثيقة: SVG بألوانه، والنقطي null (يُكشف في processLogo ويُحفظ مع الشعار)
export function logoIsLight(src) {
  const d = decode(src);
  return d && d.type === 'svg+xml' ? svgIsLight(d.bin) : null;
}

// ── قياس الشعار من الصورة المحمّلة (المصدر الواحد للفاتح والفئة وسقف الحدة في المتصفح) ──
// يُحمَّل كل شعار مرة ويُحفظ في الذاكرة. يصلح الروابط النسبية وwebp وPNG الفاتح التي لا تكشفها الترويسة.
// orgLogoHtml يطبع المخزَّن، وwriteDocument/writeCertificate ينتظران primeLogos قبل الكتابة فيصل HTML بفئاته للخادم أيضًا.
export const LOGO_PX_PER_MM = 8;
// [الارتفاع، العرض الأقصى] بالمم لكل لوحة وفئة، مطابقة لـ .mast.co .org.* (doc.js) و.brands .org.* (certificate.js)
const NOMINAL = { 'org plate': { w: [14, 64], s: [20, 60], t: [24, 20] }, org: { w: [15, 64], s: [15, 48], t: [15, 18] } };
const CACHE = new Map(); // src → Promise
const INFO = new Map(); // src → { w, h, light, aspect } | null
const browserLoader = (src) => new Promise((res, rej) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      const k = Math.min(1, 64 / Math.max(w, h, 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      let data = null;
      try { data = ctx.getImageData(0, 0, cv.width, cv.height).data; } catch { /* صورة من أصل آخر بلا CORS: الأبعاد وحدها */ }
      res({ w, h, data });
    } catch (e) { rej(e); }
  };
  img.onerror = () => rej(new Error('logo load'));
  img.src = src;
});
let loader = browserLoader;
export const setLogoLoader = (fn) => { loader = fn || browserLoader; };
export const resetLogoCache = () => { CACHE.clear(); INFO.clear(); };
export const logoInfo = (src) => INFO.get(src) || null;

export function measureLogo(src) {
  if (!src) return Promise.resolve(null);
  if (!CACHE.has(src)) {
    CACHE.set(src, Promise.resolve().then(() => loader(src)).then(({ w, h, data }) => {
      const d = decode(src);
      const light = d && d.type === 'svg+xml' ? svgIsLight(d.bin) : data ? isLightLogo(data) : false;
      return { w, h, light, aspect: aspectClass(h ? w / h : null) };
    }).catch(() => null).then((info) => { INFO.set(src, info); return info; }));
  }
  return CACHE.get(src);
}

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const SRC_RE = /<img data-org-logo src="([^"]*)"/g;
// كل شعارات الجهة في HTML مبني، تُقاس قبل الكتابة (بمهلة فلا تتعطل الوثيقة بشعار بطيء)
export async function primeLogos(html, timeout = 2500) {
  const srcs = [...new Set([...String(html).matchAll(SRC_RE)].map((m) => unesc(m[1])))].filter((s) => !INFO.has(s));
  if (!srcs.length) return;
  await Promise.race([Promise.all(srcs.map(measureLogo)), new Promise((r) => setTimeout(r, timeout))]);
}
export const logosPending = (html) => [...String(html).matchAll(SRC_RE)].some((m) => !INFO.has(unesc(m[1])));

// لوحة شعار الجهة: الفئة والفاتح من القياس إن وُجد، وإلا من الترويسة وSVG. سقف الحدة: لا يُعرض فوق دقته الأصلية ÷ 8 بكسل/مم
export function orgLogoHtml(src, { escape, alt = '', base = 'org', light: light0 = null, after = '' }) {
  const info = logoInfo(src);
  const aspect = info ? info.aspect : logoClass(src);
  const light = info ? info.light : (light0 ?? logoIsLight(src));
  const dims = info || logoDims(src);
  // السقف يُكتب فقط حين يقل عن المقاس الاسمي للفئة (CSS في doc.js وcertificate.js) فلا يوسّع حدًا قائمًا
  const nom = NOMINAL[base]?.[aspect];
  const mh = dims && dims.h ? +(dims.h / LOGO_PX_PER_MM).toFixed(1) : Infinity, mw = dims && dims.w ? +(dims.w / LOGO_PX_PER_MM).toFixed(1) : Infinity;
  const cap = nom && (mh < nom[0] || mw < nom[1]) ? ` style="max-height:${Math.min(mh, nom[0])}mm;max-width:${Math.min(mw, nom[1])}mm"` : '';
  return `<div class="${base} ${aspect}${light ? ' light' : ''}"><img data-org-logo src="${escape(src)}"${cap} alt="${escape(alt)}">${after}</div>`;
}

// يعيد بناء لوحات الشعار في HTML مكتمل بالقياس المخزَّن الآن (الجسم المبني سلفًا كصفحة الاعتماد يُصحَّح هنا أيضًا)
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PANEL_RE = /<div class="(org(?: plate)?) [wst](?: light)?"><img data-org-logo src="([^"]*)"(?: style="[^"]*")? alt="([^"]*)">/g;
export const refreshLogos = (html) => String(html).replace(PANEL_RE, (m, base, src, alt) => {
  const s = unesc(src);
  return logoInfo(s) ? orgLogoHtml(s, { escape: escHtml, alt: unesc(alt), base }).replace(/<\/div>$/, '') : m;
});
