import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ICO_NAMES } from './Ico.jsx';

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.jsx') ? [join(d, e.name)] : []));
const FILES = [...walk('leaders-app/src'), ...walk('shared/hall')];

describe('الأيقونات مجموعة مرسومة واحدة', () => {
  it('كل اسم أيقونة مستعمل معرّف في المجموعة', () => {
    const used = new Set();
    for (const f of FILES) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/<Ico name="([a-z]+)"/g)) used.add(m[1]);
      for (const m of s.matchAll(/<(?:FirstOpen|Empty)\b[^>]*\bicon="([^"]+)"/g)) used.add(m[1]);
    }
    expect([...used].filter((n) => !ICO_NAMES.includes(n))).toEqual([]);
  });
  it('لا رمز تعبيري ملون في واجهة القادة والقاعة', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{23F0}-\u{23F3}]/u;
    expect(FILES.filter((f) => emoji.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
