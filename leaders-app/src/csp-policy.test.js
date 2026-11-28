// أ9: قيم سياسة أمن المحتوى للتطبيقين كما تُرسل في الإنتاج، تمنع رجوعها أو اتساعها دون قصد
// الأسباب الموثقة لما أُبقي (media-src https: وstyle-src unsafe-inline) في رأس leaders-app/public/_headers
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const csp = (p) => Object.fromEntries(read(p).match(/Content-Security-Policy: (.+)/)[1].split(';')
  .map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

describe.each([['leaders-app/public/_headers', 'leaders/_headers'], ['admin-app/public/_headers', 'admin/_headers']])('%s', (src, built) => {
  const p = csp(src);
  it('الناتج المبني يحمل السياسة نفسها', () => expect(csp(built)).toEqual(p));
  it('لا سكربت مضمّن ولا eval، ولا مضيف عام في السكربت', () => {
    for (const k of ['script-src', 'default-src']) {
      expect(p[k]).not.toContain("'unsafe-inline'");
      expect(p[k]).not.toContain("'unsafe-eval'");
      expect(p[k]).not.toContain('https:');
      expect(p[k]).not.toContain('*');
    }
    expect(p['default-src']).toEqual(["'self'"]);
  });
  it('الحمايات الأساسية قائمة', () => {
    expect(p['object-src']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'self'"]);
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['form-action']).toEqual(["'self'"]);
  });
  it('index.html بلا <style> أو سكربت مضمّن (فلا حاجة لبصمة)', () => {
    const html = read(built.replace('_headers', 'index.html'));
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  });
});

it('leaders: القيم المضبوطة بعد الحصر بالضبط', () => {
  const p = csp('leaders-app/public/_headers');
  expect(p['media-src']).toEqual(["'self'", 'https:']);
  expect(p['style-src']).toEqual(["'self'", "'unsafe-inline'", 'https://accounts.google.com']);
  expect(p['frame-src']).toContain('https://accounts.google.com');
  expect(p['script-src']).toContain('https://accounts.google.com');
  expect(p['font-src']).toEqual(["'self'"]);
  expect(p['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https://i.ytimg.com', 'https://*.googleusercontent.com']);
  expect(p['connect-src']).toEqual(["'self'", 'https://eormhcupwgwpllhrfxxg.supabase.co', 'https://accounts.google.com', 'https://pdf.sunkvalue.com', 'https://cloudflareinsights.com']);
});

it('admin: لا media-src (يرث self)، وstyle-src كما هو', () => {
  const p = csp('admin-app/public/_headers');
  expect(p['media-src']).toBeUndefined();
  expect(p['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  expect(p['img-src']).toEqual(["'self'", 'data:']);
});
