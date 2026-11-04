import { describe, expect, it } from 'vitest';
import { gateDone, impactOpen } from './gates.js';
import { buildJourney } from '../../supabase/functions/leaders-api/logic.js';

// برنامج يضع في مرحلة الملف متطلبًا إلزاميًا يدويًا غير بيانات الملف (كما في الإنتاج)
const stages = [{ key: 'profile', sort: 1 }, { key: 'assessment', sort: 2 }, { key: 'approval', sort: 3 }];
const req = (id, stage_key, code, kind, sort = 1) => ({ id, stage_key, code, kind, required: true, sort });
const requirements = [req('1', 'profile', 'P-INFO', 'form'), req('2', 'profile', 'P-PROJECT', 'check', 2), req('3', 'assessment', 'A-DONE', 'auto')];
const me = (state) => ({ journey: buildJourney({ stages, requirements, progress: {}, levels: {}, state }) });

describe('بوابات القبول لا تصنع طريقًا مسدودًا', () => {
  it('من أكمل ملفه يتجاوز شاشة الملف ولو بقي في المرحلة متطلب آخر', () => {
    const m = me({ profileCompleted: true });
    expect(m.journey[0].status).not.toBe('done');
    expect(gateDone(m, 'profile')).toBe(true);
  });
  it('من لم يكمل ملفه يبقى عليه، ومن أرسل القياس يتجاوزه', () => {
    expect(gateDone(me({}), 'profile')).toBe(false);
    expect(gateDone(me({ profileCompleted: true, baselineSubmitted: true }), 'assessment')).toBe(true);
  });
});

describe('قسم «أثري» يتبع مرحلة القياس البعدي لا مرحلة باسم الأثر', () => {
  const withPost = (status) => ({ journey: [
    { key: 'training', status: 'done', items: [] },
    { key: 'evaluation', status, items: [{ code: 'E-POST', status: 'open' }] },
  ] });
  it('مقفل ما دامت مرحلة E-POST مقفلة، ويُفتح حين تُفتح', () => {
    expect(impactOpen(withPost('locked'))).toBe(false);
    expect(impactOpen(withPost('open'))).toBe(true);
    expect(impactOpen(withPost('done'))).toBe(true);
  });
  it('بلا مرحلة تحمل E-POST لا يُقفل (كما يحكم الخادم)', () => {
    expect(impactOpen({ journey: [{ key: 'support', status: 'locked', items: [] }] })).toBe(true);
    expect(impactOpen(null)).toBe(true);
  });
});
