// المرحلة 30: HTML مولّد الخادم يحمل خطوطه وشعاراته في داخله (data URI)، فلا يعتمد على شبكة العامل، وما يتعذر يبقى رابطه
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { embedAssets, CHROME_FONTS } from './pdf.js';
import { documentHtml } from './doc.js';

const CSS = "@font-face{font-family:'Noto Kufi Arabic';src:url(/fonts/A.woff2) format('woff2')}@font-face{font-family:'Noto Sans';src:url('/fonts/B.woff2')}";
const get = (calls) => async (path, as) => {
  calls.push(`${as}:${path}`);
  if (path === '/fonts/fonts.css') return CSS;
  if (path.endsWith('.woff2')) return `data:font/woff2;base64,${Buffer.from(path).toString('base64')}`;
  if (path === '/logo.png') return 'data:image/png;base64,AAAA';
  throw new Error('404');
};

describe('embedAssets', () => {
  it('يضمّن fonts.css وخطوطه data URI ويستبدل الشعار المحلي، ويجلب كل أصل مرة واحدة', async () => {
    const calls = [];
    const html = documentHtml({ title: 'وثيقة', selfFonts: true, id: 'MI-X-1' }, '<img src="/logo.png" alt=""><img src="/logo.png" alt="">', { print: true, base: 'https://leaders.example/' });
    expect(html).toContain('href="/fonts/fonts.css"');
    const out = await embedAssets(html, get(calls));
    expect(out).not.toContain('href="/fonts/fonts.css"');
    expect(out).not.toMatch(/url\(['"]?\/fonts\//);
    expect(out).toContain('data:font/woff2;base64,');
    expect(out).not.toContain('src="/logo.png"');
    expect(out.match(/data:image\/png;base64,AAAA/g)).toHaveLength(2);
    expect(calls.filter((c) => c === 'data:/logo.png')).toHaveLength(1);
    expect(out.startsWith('<!doctype html>')).toBe(true);
  });

  it('ما يتعذر جلبه يبقى رابطه كما هو، ولا يفشل الملف', async () => {
    const html = '<!doctype html><link rel="stylesheet" href="/fonts/fonts.css"><img src="/missing.svg">';
    const out = await embedAssets(html, async () => { throw new Error('offline'); });
    expect(out).toBe(html);
  });

  it('لا يلمس الروابط الخارجية ولا data: الموجودة', async () => {
    const html = '<!doctype html><img src="data:image/png;base64,QQ=="><img src="//evil.example/x.png">';
    const out = await embedAssets(html, async () => 'data:image/png;base64,ZZ');
    expect(out).toBe(html);
  });

  it('خط CSS لا يكسر وسم style المضمَّن', async () => {
    const out = await embedAssets('<!doctype html><link rel="stylesheet" href="/fonts/fonts.css">', async (p, as) => (as === 'text' ? 'a{}</style><script>x</script>' : null));
    expect(out).not.toMatch(/<\/style><script>/);
  });
});

describe('خط الترويسة والتذييل في PDF المتصفح', () => {
  const src = readFileSync('src/lib/brand/pdf.js', 'utf8');
  it('الخطان من CHROME_FONTS، ولوحة الصفحة من مستند الإطار بعد انتظار الخط', () => {
    expect(CHROME_FONTS.ar).toMatch(/Noto Kufi Arabic/);
    expect(src).toContain("const page = doc.createElement('canvas')");
    expect(src).not.toContain("const page = document.createElement('canvas')");
    expect(src.indexOf('await loadChromeFonts(doc')).toBeGreaterThan(0);
    expect(src.indexOf('await loadChromeFonts(doc')).toBeLessThan(src.indexOf('footer(ctx, k + 1'));
  });
});

describe('المرحلة 30: لا رابط /fonts/ يبقى بعد التضمين', () => {
  const get = async (path, as) => (as === 'text' ? '@font-face{src:url(/fonts/a.woff2)}' : 'data:font/woff2;base64,AA==');
  it('ناتج documentHtml بخطوط ذاتية يخلو من روابط /fonts/', async () => {
    const out = await embedAssets(documentHtml({ title: 'و', selfFonts: true, id: 'MI-X-2' }, '<p>x</p>', { print: true }), get);
    expect(out).not.toMatch(/<link[^>]*\/fonts\//);
  });
  it('يتحمل تغير ترتيب السمات وإضافة crossorigin', async () => {
    const out = await embedAssets('<link crossorigin href="/fonts/fonts.css" rel="stylesheet" />', get);
    expect(out).not.toMatch(/<link/);
    expect(out).toContain('data:font/woff2');
  });
});
