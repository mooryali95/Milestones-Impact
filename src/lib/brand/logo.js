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
  const dataUrl = out.toDataURL('image/png');
  monochrome(trimmed.data);
  outCtx.putImageData(trimmed, 0, 0);
  return { dataUrl, mono: out.toDataURL('image/png'), report, width: box.w, height: box.h, background: bg.kind };
}
