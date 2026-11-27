#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// أي مسار أنتج ملف PDF؟ قراءة فقط (تصور الفخامة، المرحلة 1)
// ════════════════════════════════════════════════════════════════
// vector: المولّد المتجهي (workers/pdf-render): خطوط مضمنة وطبقة نص. raster: البديل المصور في المتصفح (src/lib/brand/pdf.js):
// صور بلا خط، أو كلمة scanned-copy في بياناته. لا يكتب شيئًا ولا يرسل شيئًا.
// الاستعمال: node scripts/pdf-path.mjs ملف.pdf [ملف آخر...]  ويخرج سطر JSON لكل ملف، ورمز خروج 1 إن كان أحدها غير متجهي.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const count = (s, re) => (s.match(re) || []).length;

/** نص الملف ومعه محتوى تياراته المضغوطة (Flate)، فتظهر الخطوط والنص في تيارات الكائنات أيضًا */
function expand(bytes) {
  const raw = Buffer.from(bytes).toString('latin1');
  let out = raw;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try { out += `\n${inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1')}`; } catch { /* ليس Flate أو صورة */ }
    re.lastIndex = end;
  }
  return out;
}

/** @param {Uint8Array} bytes */
export function pdfPath(bytes) {
  const head = Buffer.from(bytes.slice(0, 8)).toString('latin1');
  if (!head.startsWith('%PDF-')) return { path: 'unknown', text: false, fonts: 0, images: 0, scanned: false, producer: null };
  const s = expand(bytes);
  // الخط المضمن وحده دليل النص: jsPDF يكتب قاموس Helvetica في كل ملف ولو لم يكتب حرفًا
  const fonts = count(s, /\/FontFile[23]?\s/g);
  const images = count(s, /\/Subtype\s*\/Image/g);
  const text = fonts > 0 && /\bT[jJ]\b/.test(s);
  const scanned = /\/Keywords\s*\((?:[^)]*\b)?scanned-copy/.test(s);
  const producer = (s.match(/\/Producer\s*\(([^)]*)\)/) || [])[1] || null;
  const path = scanned ? 'raster' : text ? 'vector' : images ? 'raster' : 'unknown';
  return { path, text: scanned ? false : text, fonts, images, scanned, producer };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('الاستعمال: node scripts/pdf-path.mjs ملف.pdf'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    const r = pdfPath(readFileSync(f));
    if (r.path !== 'vector') bad++;
    console.log(JSON.stringify({ file: f, ...r }));
  }
  process.exit(bad ? 1 : 0);
}
