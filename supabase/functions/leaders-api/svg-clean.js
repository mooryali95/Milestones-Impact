// ════════════════════════════════════════════════════════════════
// تعقيم شعار SVG عند الرفع (المرحلة 21): منطق خالص للخادم والاختبار
// ════════════════════════════════════════════════════════════════
// الشعار يُطبع في الوثيقة ويمر بمولّد PDF، فلا يبقى فيه سكربت ولا معالج حدث ولا كائن أجنبي ولا مرجع خارجي ولا كيان XML.
// ما يُزال يُزال، ثم يُفحص الناتج: إن بقي فيه ما يُشتبه رُفض الشعار كله ولا يُحفظ نصف معقّم.
const SVG_DATA = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)$/i;

const fromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
const toB64 = (t) => { let s = ''; for (const x of new TextEncoder().encode(t)) s += String.fromCharCode(x); return btoa(s); };

// ما يُرفض إن بقي بعد التعقيم: سكربت أو حدث أو كائن أجنبي أو مرجع خارج الملف أو كيان أو استيراد نمط
const DANGER = /<\s*(script|foreignObject|iframe|embed|object|handler|listener)\b|[\s/]on[a-z]+\s*=|javascript:|vbscript:|<!ENTITY|<!DOCTYPE|@import|url\(\s*['"]?\s*(?![#'"\s])|(?:xlink:)?href\s*=\s*['"]?\s*(?![#'"\s])/i;

/** نص SVG معقّم، أو يرمي برسالة عربية */
export function cleanSvgText(svg) {
  let t = String(svg ?? '');
  if (!/<svg[\s>/]/i.test(t)) throw new Error('ملف SVG غير صالح');
  t = t.replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|foreignObject|iframe|embed|object)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|embed|object)\b[^>]*\/?>/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/[\s/](?:[a-z0-9_-]+:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*'|(?!["'#])[^\s>]+)/gi, '')
    .trim();
  if (DANGER.test(t)) throw new Error('الشعار SVG يحمل ما لا يُسمح به (سكربت أو رابط خارجي). احفظه صورة PNG وارفعه من جديد');
  return t;
}

/** شعار data: معقّم إن كان SVG، وغيره كما هو */
export function cleanLogoData(logo) {
  const m = SVG_DATA.exec(String(logo || ''));
  if (!m) return logo;
  let text;
  try { text = fromB64(m[1]); } catch { throw new Error('ملف SVG غير صالح'); }
  return `data:image/svg+xml;base64,${toB64(cleanSvgText(text))}`;
}
