// الكتب الـ27 المشتقة من الكتاب الأم: سلامة كل كتاب، وأن تعديل الأصل يصل كل مشتق كما ينبغي
// (طلب المالك 2026-11-16). لا نسخة مخزنة لأي كتاب: يُبنى عند قراءته من الأبواب نفسها (handbookModulesFor
// وfilterHandbookMd في logic.js، وهي ما يستعمله الخادم للمشارك ولمعاينة الإدارة)، فهذا الاختبار يحرس الدالتين على المحتوى الحقيقي.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterHandbookMd, handbookModulesFor, parseQuiz, trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { loadChapters } from '../../scripts/handbook/content.mjs';

const ORDER = ['intro', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'labs', 'close'];
const MODS = loadChapters().map((c) => ({
  id: `${c.dimension}/${c.chapter_key}`, dimension: c.dimension, chapter_key: c.chapter_key, sort: ORDER.indexOf(c.chapter_key) + 1,
  min_level: c.min_level || 'beginner', body_md: c.body_md, quiz_md: c.quiz_md, reflection_ar: c.reflection_ar,
}));
const TRACKS = [1, 2, 3].flatMap((a) => [1, 2, 3].flatMap((b) => [1, 2, 3].map((c) => `M${a}I${b}L${c}`)));
const SCOPES = [null, 'project', 'program', 'portfolio'];
const { profiles } = JSON.parse(readFileSync(join(process.cwd(), 'supabase/content/tracks/v2/profiles.json'), 'utf8'));

/** الكتاب كما يصل مسارًا بنطاق: [{ id, md }] */
const bookOf = (mods, key, scope) => {
  const levels = trackLevels(key);
  return handbookModulesFor(mods, levels).map((m) => ({ ...m, md: filterHandbookMd(m.body_md, levels[m.dimension], scope) }));
};

describe('الكتب الـ27: كل كتاب سليم بكل نطاق عمل', () => {
  it('27 مسارًا بأربع حالات للنطاق: لا وسم باقٍ، ولا باب فارغ، ولا عنوان بلا محتوى، ولا عنوان مكرر', () => {
    expect(TRACKS).toHaveLength(27);
    const bad = [];
    for (const key of TRACKS) for (const scope of SCOPES) {
      for (const ch of bookOf(MODS, key, scope)) {
        const where = `${key}${scope ? `/${scope}` : ''} ${ch.id}`;
        if (!ch.md.trim()) bad.push(`${where}: باب فارغ`);
        if (/^:::/m.test(ch.md) || /\b(min|only|scope)=(beginner|intermediate|advanced|project|program|portfolio)\b/.test(ch.md)) bad.push(`${where}: وسم مستوى باقٍ`);
        const lines = ch.md.split('\n');
        lines.forEach((l, i) => {
          const h = l.match(/^(#{2,3})\s+(.+)/);
          if (!h) return;
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          const n = lines[j]?.match(/^(#{2,3})\s/);
          if (j >= lines.length || (n && n[1].length <= h[1].length)) bad.push(`${where}: «${h[2]}» بلا محتوى`);
        });
        const h2 = lines.filter((l) => /^##\s/.test(l)).map((l) => l.trim());
        const dup = h2.find((x, i) => h2.indexOf(x) !== i);
        if (dup) bad.push(`${where}: عنوان مكرر ${dup}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('كل باب يصل المشارك له اختبار وسؤال تأمل، وكل وعد مسار بباب يصل كتابه', () => {
    for (const m of MODS) {
      expect(parseQuiz(m.quiz_md || '').length, m.id).toBeGreaterThan(0);
      expect(String(m.reflection_ar || '').trim(), m.id).not.toBe('');
    }
    // ملفات المسارات التسعة بإطار الأولوية ومستواه: وعدها يصل كل كتاب من الـ27 يقع فيه ذلك الإطار بذلك المستوى
    expect(profiles).toHaveLength(9);
    for (const p of profiles) {
      const keys = TRACKS.filter((k) => trackLevels(k)[p.priority_dimension] === p.level);
      expect(keys, p.key).toHaveLength(9);
      for (const key of keys) {
        const book = bookOf(MODS, key, null);
        for (const pr of (p.promises || []).filter((x) => x.kind === 'chapter')) {
          expect(book.some((m) => m.dimension === p.priority_dimension && m.chapter_key === pr.chapter), `${key} ← ${p.key}/${pr.chapter}`).toBe(true);
        }
      }
    }
  });
  it('الأعمق يقرأ أكثر: كتاب المسار الاحترافي في إطار لا يقل عن كتاب المتوسط فيه، ولا المتوسط عن التأسيسي', () => {
    const words = (key) => bookOf(MODS, key, null).reduce((n, m) => n + m.md.split(/\s+/).length, 0);
    for (const [lo, mid, hi] of [['M1I1L1', 'M2I1L1', 'M3I1L1'], ['M1I1L1', 'M1I2L1', 'M1I3L1'], ['M1I1L1', 'M1I1L2', 'M1I1L3']]) {
      expect(words(mid)).toBeGreaterThanOrEqual(words(lo));
      expect(words(hi)).toBeGreaterThanOrEqual(words(mid));
    }
  });
});

describe('تعديل الكتاب الأم يصل الكتب الـ27 كما ينبغي', () => {
  // تعديل على باب حقيقي: فقرة عامة، وفقرة للاحترافي، وفقرة لقادة البرامج فأعلى
  const target = MODS.find((m) => m.dimension === 'impact' && m.chapter_key === 'ch2');
  const edited = MODS.map((m) => (m === target
    ? { ...m, body_md: `${m.body_md}\n\nعلامة-عامة\n\n:::min=advanced\nعلامة-احترافي\n:::\n\n:::scope=program\nعلامة-برامج\n:::` } : m));
  const has = (key, scope, mark) => bookOf(edited, key, scope).find((m) => m.id === target.id)?.md.includes(mark) || false;

  it('الفقرة العامة تصل الكتب الـ27 كلها بكل نطاق', () => {
    for (const key of TRACKS) for (const scope of SCOPES) expect(has(key, scope, 'علامة-عامة'), `${key}/${scope}`).toBe(true);
  });
  it('فقرة الاحترافي تصل التسعة التي مستوى الأثر فيها احترافي، ولا تصل غيرها', () => {
    const got = TRACKS.filter((k) => has(k, null, 'علامة-احترافي'));
    expect(got).toEqual(TRACKS.filter((k) => k[3] === '3'));
    expect(got).toHaveLength(9);
  });
  it('فقرة البرامج تصل من نطاقه برنامج أو محفظة ومن لم يحدد نطاقه، ولا تصل قائد المشروع', () => {
    expect(has('M1I1L1', 'project', 'علامة-برامج')).toBe(false);
    for (const scope of [null, 'program', 'portfolio']) expect(has('M1I1L1', scope, 'علامة-برامج'), String(scope)).toBe(true);
  });
  it('الأبواب الأخرى لا تتغير في أي كتاب', () => {
    for (const key of TRACKS) {
      const before = bookOf(MODS, key, null).filter((m) => m.id !== target.id).map((m) => m.md);
      const after = bookOf(edited, key, null).filter((m) => m.id !== target.id).map((m) => m.md);
      expect(after).toEqual(before);
    }
  });
});
