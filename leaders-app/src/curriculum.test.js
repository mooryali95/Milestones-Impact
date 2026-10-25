// منهج المسار: وسوم الجمهور، والترتيب، والإكمال، وتنظيف مادة البنك
import { describe, expect, it } from 'vitest';
import {
  activityFor, cleanConfig, cleanContentItem, contentApplies, curriculumFor, curriculumStatus, trackKey, trackLevels,
} from '../../supabase/functions/leaders-api/logic.js';

const lv = (m, i, l) => ({ milestone: m, impact: i, leadership: l });
const B = 'beginner', I = 'intermediate', A = 'advanced';

const items = [
  { id: 'all', kind: 'video', title_ar: 'ترحيب', url: 'https://youtu.be/abcdefghijk', sort: 1 },
  { id: 'imp-int', kind: 'file', title_ar: 'سجل المنافع', url: 'https://x/f.pdf', dimension: 'impact', min_level: I, sort: 1 },
  { id: 'lead-b', kind: 'link', title_ar: 'أساسيات القيادة', url: 'https://x/l', dimension: 'leadership', only_level: B, sort: 2 },
  { id: 'ms-all', kind: 'video', title_ar: 'المسار الحرج', url: 'https://youtu.be/bcdefghijkl', dimension: 'milestone', sort: 1, required: false },
  { id: 'only-1', kind: 'link', title_ar: 'لمسار بعينه', url: 'https://x/o', track_keys: ['M3I3L3'], sort: 9 },
  { id: 'not-111', kind: 'link', title_ar: 'إلا للمبتدئ', url: 'https://x/n', exclude_tracks: ['M1I1L1'], sort: 3 },
  { id: 'off', kind: 'link', title_ar: 'موقوف', url: 'https://x/z', active: false },
];

describe('trackLevels', () => {
  it('is the inverse of trackKey', () => {
    expect(trackLevels('M1I2L3')).toEqual(lv(B, I, A));
    expect(trackKey(trackLevels('M3I1L2'))).toBe('M3I1L2');
    expect(trackLevels('M4I1L1')).toBeNull();
  });
});

describe('contentApplies', () => {
  it('general items reach everyone, except excluded tracks', () => {
    expect(contentApplies(items[0], lv(B, B, B))).toBe(true);
    expect(contentApplies(items[5], lv(B, B, B))).toBe(false);
    expect(contentApplies(items[5], lv(B, B, I))).toBe(true);
  });
  it('min level and only level', () => {
    expect(contentApplies(items[1], lv(B, B, B))).toBe(false);
    expect(contentApplies(items[1], lv(B, A, B))).toBe(true);
    expect(contentApplies(items[2], lv(A, A, B))).toBe(true);
    expect(contentApplies(items[2], lv(A, A, I))).toBe(false);
  });
  it('explicit tracks win over tags; inactive never applies', () => {
    expect(contentApplies(items[4], lv(A, A, A))).toBe(true);
    expect(contentApplies(items[4], lv(A, A, I))).toBe(false);
    expect(contentApplies(items[6], lv(B, B, B))).toBe(false);
  });
});

describe('curriculumFor', () => {
  it('composes the 27 tracks from tags, general first then by dimension', () => {
    expect(curriculumFor(items, lv(B, I, B)).map((x) => x.id)).toEqual(['all', 'not-111', 'ms-all', 'imp-int', 'lead-b']);
    expect(curriculumFor(items, lv(A, A, A)).map((x) => x.id)).toEqual(['all', 'not-111', 'only-1', 'ms-all', 'imp-int']);
    expect(curriculumFor(items, lv(B, B, B)).map((x) => x.id)).toEqual(['all', 'ms-all', 'lead-b']);
  });
  it('can be limited to one dimension', () => {
    expect(curriculumFor(items, lv(B, I, B), 'impact').map((x) => x.id)).toEqual(['imp-int']);
  });
});

describe('curriculumStatus', () => {
  const levels = lv(B, B, B);
  it('done when every required item is watched or opened; optional items do not block', () => {
    const progress = {
      all: { duration: 100, watched_seconds: 95 },
      'lead-b': { opened_at: '2026-10-24T10:00:00Z' },
    };
    const st = curriculumStatus({}, items, levels, progress);
    expect(st).toMatchObject({ type: 'curriculum', done: true, count: 2, total: 2 });
    expect(st.items.find((x) => x.id === 'ms-all')).toMatchObject({ required: false, done: false, pct: 0 });
  });
  it('a video under its minimum is started, not done', () => {
    const st = curriculumStatus({}, items, levels, { all: { duration: 100, watched_seconds: 50 } });
    expect(st.done).toBe(false);
    expect(st.items[0]).toMatchObject({ pct: 50, started: true, done: false });
  });
  it('locked until placement approval', () => {
    const r = activityFor({ kind: 'curriculum', config: {} }, { curriculumLocked: true, content: items, levels });
    expect(r).toMatchObject({ done: false, locked: true, total: 0 });
  });
  it('config keeps only a valid dimension', () => {
    expect(cleanConfig('curriculum', { dimension: 'impact', x: 1 })).toEqual({ dimension: 'impact' });
    expect(cleanConfig('curriculum', { dimension: 'nope' })).toEqual({});
  });
});

describe('cleanContentItem', () => {
  it('validates kind, title and https link', () => {
    expect(() => cleanContentItem({ kind: 'pdf', title_ar: 'x', url: 'https://x' }, true)).toThrow(/نوع/);
    expect(() => cleanContentItem({ kind: 'link', title_ar: ' ', url: 'https://x' }, true)).toThrow(/عنوان/);
    expect(() => cleanContentItem({ kind: 'file', title_ar: 'x', url: 'http://x' }, true)).toThrow(/https/);
    expect(() => cleanContentItem({ kind: 'video', title_ar: 'x', url: 'https://example.com/page' }, true)).not.toThrow();
  });
  it('parses track lists and rejects bad keys', () => {
    expect(cleanContentItem({ track_keys: 'm1i2l3, M3I3L3،M1I2L3' }).track_keys).toEqual(['M1I2L3', 'M3I3L3']);
    expect(() => cleanContentItem({ exclude_tracks: 'M4I1L1' })).toThrow(/M4I1L1/);
  });
  it('clears level tags without a dimension, and keeps min and only exclusive', () => {
    expect(cleanContentItem({ dimension: '', min_level: I })).toMatchObject({ dimension: null, min_level: null, only_level: null });
    expect(cleanContentItem({ dimension: 'impact', min_level: I })).toMatchObject({ min_level: I, only_level: null });
    expect(cleanContentItem({ dimension: 'impact', only_level: B })).toMatchObject({ only_level: B, min_level: null });
  });
});
