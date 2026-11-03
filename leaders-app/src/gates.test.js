import { describe, expect, it } from 'vitest';
import { gateDone } from './gates.js';
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
