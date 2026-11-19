// رابط لكل باب في قارئ الكتاب الأم (آخر بنود المرحلة 3 من «فصل خبراء الرحلة عن لجان المحتوى»)
import { describe, expect, it } from 'vitest';
import { chapterRef, hashRef, hashWithRef, refIndex } from '../../shared/master-book/reader.js';

const chapters = [
  { id: 'u1', dimension: 'milestone', chapter_key: 'ch1', sort: 1 },
  { id: 'u2', dimension: 'milestone', chapter_key: 'ch2', sort: 2 },
  { id: 'u3', dimension: 'impact', chapter_key: 'ch1', sort: 1 },
  { id: 'draft:x', dimension: 'draft', draft: true },
];

describe('chapterRef وrefIndex', () => {
  it('المرجع بالجزء ومفتاح الباب، فيبقى بعد إعادة الترتيب', () => {
    expect(chapterRef(chapters[0])).toBe('milestone.ch1');
    expect(chapterRef(chapters[2])).toBe('impact.ch1');
    expect(refIndex(chapters, 'impact.ch1')).toBe(2);
    const moved = [chapters[2], chapters[1], chapters[0]];
    expect(refIndex(moved, 'milestone.ch1')).toBe(2);
  });
  it('المسودة بمعرفها، وما لم يُعده الخادم لهذا القارئ لا يُوجد', () => {
    expect(chapterRef(chapters[3])).toBe('draft:x');
    expect(refIndex(chapters, 'draft:x')).toBe(3);
    expect(refIndex(chapters.slice(0, 3), 'draft:x')).toBe(-1);
    expect(refIndex(chapters, 'leadership.ch9')).toBe(-1);
    expect(refIndex(chapters, '')).toBe(-1);
    expect(refIndex(chapters, null)).toBe(-1);
    // المعرف وحده ليس مرجعًا لباب له مفتاح: الرابط واحد لكل باب
    expect(refIndex(chapters, 'u1')).toBe(-1);
    expect(chapterRef(null)).toBe('');
  });
});

describe('hashRef وhashWithRef', () => {
  it('اللوحة: الباب بعد «?» في مسار الشاشة، وبقية المعاملات كما هي', () => {
    expect(hashWithRef('#/leaders/book', 'milestone.ch1')).toBe('#/leaders/book?ch=milestone.ch1');
    expect(hashRef('#/leaders/book?ch=milestone.ch1')).toBe('milestone.ch1');
    expect(hashWithRef('#/leaders/book?x=1&ch=a.b', 'impact.ch1')).toBe('#/leaders/book?x=1&ch=impact.ch1');
    expect(hashWithRef('#/leaders/book?ch=a.b', null)).toBe('#/leaders/book');
    expect(hashWithRef('#/leaders/book?x=1&ch=a.b', null)).toBe('#/leaders/book?x=1');
    expect(hashRef('#/leaders/book')).toBe(null);
  });
  it('بوابة الخبير: ‎#ch=…‎ وحده، والرف بلا شيء', () => {
    expect(hashWithRef('', 'milestone.ch2')).toBe('#ch=milestone.ch2');
    expect(hashRef('#ch=milestone.ch2')).toBe('milestone.ch2');
    expect(hashWithRef('#ch=milestone.ch2', null)).toBe('');
    expect(hashRef('')).toBe(null);
    expect(hashRef('#invite=a.b')).toBe(null);
  });
  it('المسودة بمعرفها العربي أو بنقطتين تعود كما كُتبت', () => {
    const h = hashWithRef('', 'draft:مسودة 1');
    expect(hashRef(h)).toBe('draft:مسودة 1');
  });
});
