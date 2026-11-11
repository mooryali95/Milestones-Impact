// server-sec-3 (تدقيق 2026-11-11): المسمى في طلب الانضمام المفتوح دخل بريد المالك بلا ترميز، فمن يرسل
// «<a href=…>راجع الطلب</a>» يضع رابطه في رسالة من مرسل المنصة وبقالبها. كل قيمة تدخل متن mailText/mailNote
// تمر بـesc() (أو hello() التي ترمّز)، أو تكون من قائمة قيم الخادم المراجعة أدناه. يقرأ القوالب من مصدرها
// بقوالبها المتداخلة، فأي قيمة جديدة بلا ترميز تُسقط الاختبار.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FN = join(__dirname, '../../supabase/functions/leaders-api');
// قيم يحددها الخادم لا المستخدم: تسميات الأدوار والأبواب، ونصوص الرسائل الثابتة، والعدّادات
const SERVER_VALUES = new Set(['portalUrl()', 'roleAr(req.role)', 'roleAr(r.role)', 'open', 'days', 'm.lead', 'DOOR[tried].title',
  "items.map(esc).join('، ')", "next[decision] || 'اعتُمد تقييمك الختامي.'"]);
const CONST = /^[A-Z][A-Z0-9_]*(\.[A-Za-z]+)?$/;   // APPLY_ALERT_HOURS وCONFIG.appUrl

// قارئ صغير للقوالب: يعيد تعبيرات ${…} في القالب الذي يبدأ عند src[i] === '`'
function template(src, i) {
  const parts = [];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === '`') return { end: j + 1, parts };
    if (src[j] === '$' && src[j + 1] === '{') { const e = expr(src, j + 2); parts.push(e.text); j = e.end - 1; }
  }
  throw new Error('قالب بلا نهاية');
}
// يتخطى نصًا أو قالبًا يبدأ عند j، أو يعيد null
function skip(src, j) {
  if (src[j] === '`') return template(src, j).end;
  if (src[j] === "'" || src[j] === '"') { const q = src[j]; for (j++; src[j] !== q; j++) if (src[j] === '\\') j++; return j + 1; }
  return null;
}
function expr(src, i) {
  let depth = 1;
  for (let j = i; j < src.length;) {
    const s = skip(src, j);
    if (s != null) { j = s; continue; }
    if (src[j] === '{') depth++;
    if (src[j] === '}' && !--depth) return { end: j + 1, text: src.slice(i, j) };
    j++;
  }
  throw new Error('تعبير بلا نهاية');
}
// التعبير كله استدعاء واحد لـfn: esc(a) نعم، وesc(a) + b لا
function wraps(e, fn) {
  if (!e.startsWith(`${fn}(`)) return false;
  let depth = 0;
  for (let j = fn.length; j < e.length;) {
    const s = skip(e, j);
    if (s != null) { j = s; continue; }
    if ('([{'.includes(e[j])) depth++;
    else if (')]}'.includes(e[j]) && !--depth) return j === e.length - 1;
    j++;
  }
  return false;
}
// تقسيم «شرط ? أ : ب» على المستوى الأعلى وحده
function ternary(e) {
  let depth = 0, q = -1;
  for (let j = 0; j < e.length;) {
    const s = skip(e, j);
    if (s != null) { j = s; continue; }
    const c = e[j];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (!depth && c === '?' && q < 0 && !['.', '?'].includes(e[j + 1]) && e[j - 1] !== '?') q = j;
    else if (!depth && c === ':' && q >= 0) return [e.slice(0, q), e.slice(q + 1, j), e.slice(j + 1)].map((x) => x.trim());
    j++;
  }
  return null;
}
// ما يخرج إلى البريد من التعبير بلا ترميز ولا هو من قيم الخادم
function unsafe(e) {
  e = e.trim();
  if (wraps(e, 'esc') || wraps(e, 'hello') || CONST.test(e) || SERVER_VALUES.has(e)) return [];
  const t = ternary(e);
  return t ? t.slice(1).flatMap(branch) : [e];
}
// فرع الشرط: نص ثابت، أو قالب كل قيمه آمنة
function branch(b) {
  if (/^'[^']*'$/.test(b)) return [];
  if (b.startsWith('`') && skip(b, 0) === b.length) return template(b, 0).parts.flatMap(unsafe);
  return unsafe(b);
}
function mailValues(file) {
  const src = readFileSync(join(FN, file), 'utf8');
  const out = [];
  for (const m of src.matchAll(/\bmail(?:Text|Note)\(\s*`/g)) {
    const line = src.slice(0, m.index).split('\n').length;
    for (const e of template(src, m.index + m[0].length - 1).parts) for (const bad of unsafe(e)) out.push(`${file}:${line}: ${bad}`);
  }
  return out;
}

describe('server-sec-3: لا قيمة بلا ترميز في متن البريد', () => {
  it('القارئ يلتقط القيمة الخام داخل قالب متداخل، ويقبل المرمّزة', () => {
    expect(unsafe("fields.title ? ` · ${fields.title}` : ''")).toEqual(['fields.title']);
    expect(unsafe("fields.title ? ` · ${esc(fields.title)}` : ''")).toEqual([]);
    expect(unsafe('esc(a) + b')).toEqual(['esc(a) + b']);
    expect(unsafe("open === 1 ? 'خطوة مفتوحة' : 'خطوات مفتوحة'")).toEqual([]);
    expect(unsafe('r.experts?.full_name ?? x')).toEqual(['r.experts?.full_name ?? x']);
  });
  it('كل ملفات leaders-api: ما يدخل mailText وmailNote مرمّز أو من قيم الخادم', () => {
    const files = readdirSync(FN).filter((f) => f.endsWith('.ts') && !f.endsWith('_test.ts'));
    expect(files).toEqual(expect.arrayContaining(['experts.ts', 'peer.ts', 'core.ts']));
    expect(files.flatMap(mailValues)).toEqual([]);
  });
  it('رسائل طلبات التوجيه تأخذ نصًا عاديًا وترمّزه مرة، فاسم الخبير لا يدخل وسمًا', () => {
    const peer = readFileSync(join(FN, 'peer.ts'), 'utf8');
    const at = peer.indexOf('async function mailAsker');
    expect(peer.slice(at, peer.indexOf('\n}', at))).toContain('mailText(esc(text))');
    expect(peer).not.toMatch(/mailAsker\([^\n]*\$\{esc\(/);   // لا ترميز مزدوج عند الاستدعاء
  });
});
