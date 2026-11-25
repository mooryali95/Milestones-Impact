// بطاقة المسار، المرحلة 4: الجسور بين الأطر (حدها 12) كتل :::when، وصفحة الإدارة للمسارات الـ27 من trackManifest نفسه.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterHandbookMd, trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { bridgesFor, CARDS, SLICES, trackManifest, withBridges } from '../../supabase/functions/leaders-api/track-manifest.js';
import { ALL_TRACKS, cardRow } from '../../admin-app/src/screens/Tracks.jsx';
import { chapters as MODULES } from '../../scripts/tracks/matrix.mjs';

const ROOT = join(__dirname, '../..');
const LIST = SLICES.bridges.list;

describe('الجسور بين الأطر', () => {
  it('حدها 12، ولكل جسر باب قائم في إطاره وشرط في إطار آخر', () => {
    expect(LIST.length).toBeLessThanOrEqual(CARDS.base.bridges.cap);
    expect(CARDS.base.bridges.cap).toBe(12);
    for (const b of LIST) {
      expect(MODULES.some((m) => m.dimension === b.dimension && m.chapter_key === b.chapter_key), b.key).toBe(true);
      const [d] = b.when.split(':');
      expect(d, b.key).not.toBe(b.dimension);
      expect(b.when).toMatch(/^(milestone|impact|leadership):(beginner|intermediate|advanced)\+?$/);
      expect(b.md).not.toMatch(/(^|[^ت])كلفة|كتيب/);
    }
    expect(new Set(LIST.map((b) => b.key)).size).toBe(LIST.length);
  });
  it(':::when يظهر بمستوى الإطار الآخر وحده، ويُقص بلا مستويات', () => {
    const md = 'قبل\n:::when=impact:advanced\nجسر\n:::\n:::when=leadership:intermediate+\nثان\n:::\nبعد';
    expect(filterHandbookMd(md, 'beginner', null, trackLevels('M1I3L1'))).toBe('قبل\nجسر\nبعد');
    expect(filterHandbookMd(md, 'beginner', null, trackLevels('M1I1L2'))).toBe('قبل\nثان\nبعد');
    expect(filterHandbookMd(md, 'beginner', null, trackLevels('M1I3L3'))).toBe('قبل\nجسر\nثان\nبعد');
    expect(filterHandbookMd(md, 'beginner')).toBe('قبل\nبعد');
  });
  it('جسور البطاقة = ما يُلحق فعلًا بأبواب الكتاب بعد القص، في المسارات الـ27', () => {
    for (const k of ALL_TRACKS) {
      const lv = trackLevels(k);
      const shown = MODULES.flatMap((m) => {
        const md = filterHandbookMd(withBridges(m), lv[m.dimension], null, lv);
        return LIST.filter((b) => b.dimension === m.dimension && b.chapter_key === m.chapter_key && md.includes(`## ${b.title}`)).map((b) => b.key);
      });
      expect(shown.sort(), k).toEqual(bridgesFor(lv).map((b) => b.key).sort());
      expect(trackManifest(k).card.bridges.map((b) => b.key)).toEqual(bridgesFor(lv).map((b) => b.key));
    }
    expect(bridgesFor(trackLevels('M1I1L1'))).toEqual([]);
    expect(bridgesFor(trackLevels('M3I3L3')).length).toBe(LIST.length);
  });
  it('الخادم يلحق الجسور بالباب وبالنسخة الشخصية وبعدّ كلمات القراءة', () => {
    const p = readFileSync(join(ROOT, 'supabase/functions/leaders-api/participant.ts'), 'utf8');
    expect(p.match(/filterHandbookMd\(withBridges\(m\), levels\[m\.dimension\], p\.work_scope, levels\)/g)).toHaveLength(2);
    expect(readFileSync(join(ROOT, 'supabase/functions/leaders-api/activities.ts'), 'utf8')).toMatch(/filterHandbookMd\(withBridges\(m\)/);
  });
});

describe('صفحة الإدارة: بطاقات المسارات الـ27', () => {
  it('سبعة وعشرون سطرًا، كل سطر من trackManifest', () => {
    expect(ALL_TRACKS).toHaveLength(27);
    for (const k of ALL_TRACKS) {
      const r = cardRow(k);
      const m = trackManifest(k);
      expect(r.doc).toContain(m.card.initiative.name);
      expect(r.cap).toBe(m.card.initiative.required_cap);
      expect(r.journey).toBe(m.card.journey.requirements.join(' '));
      expect(r.bridges).toBe(m.card.bridges.length);
    }
  });
  it('لا تحسب الصفحة شيئًا من المستويات بنفسها', () => {
    const src = readFileSync(join(ROOT, 'admin-app/src/screens/Tracks.jsx'), 'utf8');
    const part = src.slice(src.indexOf('export function cardRow'), src.indexOf('export default function Tracks'));
    expect(part).toMatch(/trackManifest\(k\)/);
    expect(part).not.toMatch(/priorityFor|profileKey|overallLevel|requirementApplies|labVisible/);
  });
});
