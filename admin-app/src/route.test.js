import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from './route.js';

describe('المسار في عنوان الصفحة', () => {
  it('يقرأ السياق والتبويب والمعرّف', () => {
    expect(parseRoute('#/leaders/tracks/M1I1L2')).toEqual({ ctx: 'leaders', tab: 'tracks', id: 'M1I1L2' });
    expect(parseRoute('#/contacts')).toEqual({ ctx: 'contacts', tab: null, id: null });
    expect(parseRoute('#/visits')).toEqual({ ctx: 'visits', tab: null, id: null });
    expect(parseRoute('#leaders')).toEqual({ ctx: 'leaders', tab: null, id: null });
  });

  it('يتجاهل ما ليس سياقًا معروفًا', () => {
    expect(parseRoute('')).toEqual({ ctx: null, tab: null, id: null });
    expect(parseRoute('#/x/y')).toEqual({ ctx: null, tab: null, id: null });
  });

  it('البناء والقراءة متعاكسان، ويُرمَّز ما يحتاج ترميزًا', () => {
    const r = { ctx: 'leaders', tab: 'participants', id: 'a b/c' };
    expect(formatRoute(r)).toBe('#/leaders/participants/a%20b%2Fc');
    expect(parseRoute(formatRoute(r))).toEqual(r);
    expect(formatRoute({ ctx: 'leaders', tab: 'orgs' })).toBe('#/leaders/orgs');
  });
});
