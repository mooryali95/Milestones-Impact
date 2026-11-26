// قواعد العامل الخالصة (تُختبر بلا Chromium): ما يُسمح بطلبه أثناء الطباعة، وخيارات الطباعة، والأصول، ومفتاح السقف
export const PDF_OPTIONS = Object.freeze({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, tagged: true, outline: true });

/** أصول التطبيقات التي تطلب العامل (المرحلة 3ب): ALLOWED_ORIGINS بفواصل، ومعها APP_ORIGIN، بلا تكرار */
export function appOrigins(env = {}) {
  const list = [...String(env.ALLOWED_ORIGINS || '').split(','), String(env.APP_ORIGIN || '')].map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const o of list) { try { const x = new URL(o).origin; if (!out.includes(x)) out.push(x); } catch { /* أصل غير صالح يُترك */ } }
  return out.length ? out : ['https://leaders.sunkvalue.com'];
}

/** الطلب الفرعي مسموح؟ أصل تطبيق من القائمة (الخطوط والصور)، وdata: وabout: وblob:. origins قائمة أو أصل واحد نصًا (كما كان) */
export function allowedRequest(url, origins) {
  if (/^(data|about|blob):/i.test(url)) return true;
  const list = (Array.isArray(origins) ? origins : [origins]).map((o) => { try { return new URL(o).origin; } catch { return null; } }).filter(Boolean);
  try { return list.includes(new URL(url).origin); } catch { return false; }
}

// سقف الطلبات لكل صاحب تذكرة (ضبطًا لكلفة Browser Rendering): المفتاح صاحبها «نوع-معرّف» كما وقّعه leaders-api
export const limitKey = (sub) => String(sub || '').replace(/[^0-9a-zA-Z-]/g, '').slice(0, 80) || 'anon';
