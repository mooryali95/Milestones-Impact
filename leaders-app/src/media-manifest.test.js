// ‏/media/* يُخدم بتخزين immutable لسنة، فالاسم الواحد لبايتات واحدة أبدًا (RUNBOOK §1):
// ملف أعيد توليده بالاسم نفسه يبقى قديمه في حافة Cloudflare سنة. البيان leaders-app/media-manifest.json خارج public فلا يُنشر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compare, MANIFEST, MEDIA_DIRS, mediaFiles, readManifest } from '../../scripts/ops/media-manifest.mjs';

const root = join(__dirname, '../..');
const m = readManifest();

describe('وسائط تطبيق القادة لا يتغير اسم منشور منها', () => {
  it('كل ملف في المصدر والمبني المودع في البيان، ولا اسم قائم تغيّرت بايتاته', () => {
    for (const dir of MEDIA_DIRS) {
      const files = mediaFiles(dir);
      expect(Object.keys(files).length, dir).toBeGreaterThan(0);
      expect(compare(m, files), dir).toEqual({ changed: [], unknown: [] });
    }
  // يحسب بصمات نحو 280 ميغابايت (المصدر والمبني): المهلة الافتراضية 5 ثوانٍ كانت تُتجاوز حين تعمل الاختبارات كلها معًا
  }, 60_000);
  it('المقارنة تميّز الاسم المعدَّل من الجديد، والبيان ببصمات sha256', () => {
    expect(compare({ files: { a: 'h1', b: 'h2' } }, { a: 'h1', b: 'x', c: 'h3' })).toEqual({ changed: ['b'], unknown: ['c'] });
    expect(Object.values(m.files).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });
  it('التخزين الطويل باقٍ على /media/*، والبيان ليس تحت public', () => {
    expect(read('leaders-app/public/_headers')).toMatch(/\/media\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    expect(MANIFEST).not.toMatch(/[\\/]public[\\/]/);
    expect(read('RUNBOOK.md')).toMatch(/node scripts\/ops\/media-manifest\.mjs/);
  });
});

function read(p) { return readFileSync(join(root, p), 'utf8'); }
