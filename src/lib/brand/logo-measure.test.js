// قياس شعار الجهة من الصورة المحمّلة (فاتح · فئة الأبعاد · سقف الحدة) مرة لكل شعار، وتطبيقه على HTML الوثيقة والشهادة
import { describe, it, expect, beforeEach } from 'vitest';
import { measureLogo, setLogoLoader, resetLogoCache, primeLogos, logoInfo } from './logo.js';
import { documentHtml, writeDocument } from './doc.js';
import { certificateHtml } from './certificate.js';

// صورة بأبعاد طبيعية وبكسلات عينة بلون واحد معتم
const fake = (w, h, rgb) => ({ w, h, data: Uint8ClampedArray.from({ length: 16 * 4 }, (_, i) => (i % 4 === 3 ? 255 : rgb[i % 4])) });
let calls;
const loader = (table) => async (src) => { calls += 1; if (!table[src]) throw new Error('load'); return table[src]; };
const WHITE = '/logos/white.png', DARK = '/logos/dark.webp', LOW = '/logos/low.png';
const T = { [WHITE]: fake(800, 200, [255, 255, 255]), [DARK]: fake(300, 900, [11, 39, 47]), [LOW]: fake(80, 80, [11, 39, 47]) };
const brand = (logo) => ({ name: 'جهة', logo, color: '#1F6F5C' });
const cert = (logo) => ({ serial: 'S1', name_ar: 'س', name_en: 'S', program_ar: 'ب', program_en: 'P', issued_at: '2026-10-23T09:00:00Z', signatories: [], verify_url: 'https://x/v', org: { name: 'جهة', logo } });

beforeEach(() => { resetLogoCache(); calls = 0; setLogoLoader(loader(T)); });

describe('measureLogo', () => {
  it('يكشف الفاتح والفئة من الأبعاد الطبيعية، ويحمّل الشعار مرة واحدة', async () => {
    const a = await measureLogo(WHITE);
    expect(a).toMatchObject({ light: true, aspect: 'w', w: 800, h: 200 });
    await measureLogo(WHITE); await Promise.all([measureLogo(DARK), measureLogo(DARK)]);
    expect(calls).toBe(2);
    expect(logoInfo(DARK)).toMatchObject({ light: false, aspect: 't' });
  });
  it('تعذر التحميل لا يكسر: null', async () => {
    expect(await measureLogo('/missing.png')).toBeNull();
  });
});

describe('تطبيقه على الوثيقة والشهادة', () => {
  it('رابط نسبي فاتح: لوحة جرافيتية وفئة عريضة بعد التهيئة', async () => {
    expect(documentHtml({ title: 'ت', brand: brand(WHITE) }, '')).not.toMatch(/class="org plate w light"/);
    await primeLogos(documentHtml({ title: 'ت', brand: brand(WHITE) }, ''));
    expect(documentHtml({ title: 'ت', brand: brand(WHITE) }, '')).toMatch(/class="org plate w light"/);
  });
  it('webp طويل داكن يأخذ فئة t لا المربع الافتراضي', async () => {
    await measureLogo(DARK);
    expect(documentHtml({ title: 'ت', brand: brand(DARK) }, '')).toMatch(/class="org plate t"/);
  });
  it('الدقة المنخفضة: سقف 8 بكسل لكل مم فلا يُكبَّر فوق دقته', async () => {
    await measureLogo(LOW);
    const html = documentHtml({ title: 'ت', brand: brand(LOW) }, '');
    expect(html).toMatch(/max-height:10mm;max-width:10mm/);
  });
  it('الشهادة: شعار فاتح يأخذ light وفئته', async () => {
    await measureLogo(WHITE);
    expect(certificateHtml(cert(WHITE), '')).toMatch(/class="org w light"/);
    expect(certificateHtml(cert(WHITE), '')).toMatch(/\.brands \.org\.light img \{[^}]*background/);
  });
  it('writeDocument ينتظر القياس قبل الكتابة', async () => {
    let written = '';
    const doc = { open() {}, write(h) { written = h; }, close() {}, querySelector: () => null };
    expect(writeDocument({ document: doc }, { title: 'ت', brand: brand(WHITE) }, '')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(written).toMatch(/class="org plate w light"/);
  });
});
