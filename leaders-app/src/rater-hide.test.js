// تقدير الزملاء مع مفتاح 360، وتقدير المدير خارجه (تصور المرحلة 3، القرار 2، 2026-11-26؛ كان مع المفتاح بقرار 2026-11-16):
// مطفأ يختفي E-360 وحده كالبنود المخفية ولا يحبس مرحلة، ويبقى T-360 وE-MGR وأفعال المقيّم (pre وpost)
import { describe, expect, it } from 'vitest';
import { F360_JOURNEY_CODES, featureGate, featureHiddenCodes, featureHiddenFor } from '../../supabase/functions/leaders-api/features.js';
import { buildJourney, hideBreaksStage } from '../../supabase/functions/leaders-api/logic.js';

const stage = (key, sort) => ({ key, title_ar: key, sort, active: true, rules: {} });
const req = (n, stage_key, code, required = true) => ({ id: `r${n}`, stage_key, code, title_ar: code, kind: 'check', required, active: true, sort: n, config: {} });
const STAGES = [stage('training', 1), stage('evaluation', 2), stage('after', 3)];
const REQS = [req(1, 'training', 'T-AGREE'), req(2, 'training', 'T-360'), req(3, 'evaluation', 'E-POST'), req(4, 'evaluation', 'E-360'), req(5, 'evaluation', 'E-MGR', false), req(6, 'after', 'A-LAST')];

describe('بنود 360 في الرحلة', () => {
  it('مطفأ يخفي تقدير الزملاء وحده، ومُظهَر لا يخفي شيئًا', () => {
    expect(F360_JOURNEY_CODES).toEqual(['E-360']);
    expect(featureHiddenCodes({ f360: false })).toEqual(F360_JOURNEY_CODES);
    expect(featureHiddenCodes(undefined)).toEqual(F360_JOURNEY_CODES);
    expect(featureHiddenCodes({ f360: true })).toEqual([]);
  });
  it('الإخفاء لا يحبس مرحلة: ما بقي منجز فالمرحلة تكتمل وما بعدها يُفتح', () => {
    const { hidden } = featureHiddenFor({ stages: STAGES, requirements: REQS, flags: { f360: false }, breaks: hideBreaksStage });
    const reqs = REQS.filter((r) => !hidden.includes(r.code));
    expect(reqs.map((r) => r.code)).toEqual(['T-AGREE', 'T-360', 'E-POST', 'E-MGR', 'A-LAST']);
    // T-360 يكتمل بتقدير المدير أو «ذاتي فقط»، فلا يحبس من لا مدير له
    const j = buildJourney({ stages: STAGES, requirements: reqs, progress: { r1: { status: 'done' } }, levels: {}, state: { postSubmitted: true, selfOnly: true } });
    expect(j.map((s) => s.status)).toEqual(['done', 'done', 'active']);
  });
  it('مرحلة لا يكملها إلا بند منها: يبقى ظاهرًا (kept) ولا تخلو المرحلة، وتنتظر الإظهار', () => {
    const lone = [req(1, 'training', 'T-AGREE'), req(2, 'evaluation', 'E-360'), req(3, 'after', 'A-LAST')];
    expect(featureHiddenFor({ stages: STAGES, requirements: lone, flags: { f360: false }, breaks: hideBreaksStage })).toEqual({ hidden: [], kept: ['E-360'] });
  });
  it('دعوة مقيّم الأثر وإلغاؤه وتأكيد المستشار تمر والمفتاح مطفأ (خانة المدير، impact.ts)، وأفعال 360 مرفوضة', () => {
    for (const a of ['rater.invite', 'rater.revoke', 'xp.rater-confirm']) {
      expect(featureGate(a, { f360: false })).toBeNull();
      expect(featureGate(a, { f360: true })).toBeNull();
    }
    expect(featureGate('f360.nominate', { f360: false })?.fail?.code).toBe('f360_off');
    expect(featureGate('impact.mine', { f360: false })).toBeNull();
  });
});

