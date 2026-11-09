// بوابات المراحل الخمس (scripts/ops/stage-gates.mjs): الحكم على النقاط واحتساب المكسب
import { describe, expect, it } from 'vitest';
import { evaluate, judge, STAGES, toMarkdown, BASE_SCORE, stateOf } from '../../scripts/ops/stage-gates.mjs';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const allPass = (stageIds) => {
  const facts = {}, attest = {};
  for (const s of STAGES.filter((x) => stageIds.includes(x.id))) {
    for (const c of s.checks) {
      if (c.kind === 'auto') facts[c.id] = { ok: true, reason: 'ok' };
      else attest[c.id] = { by: 'المالك', at: '2026-11-08' };
    }
  }
  return { facts, attest };
};

describe('بوابات المراحل', () => {
  it('الإقرار بلا اسم أو تاريخ لا يُعبر، والمتقادم يسقط', () => {
    const drill = STAGES[0].checks.find((c) => c.id === 'm1.restore-drill');
    expect(judge(drill, {}, {}, NOW).status).toBe('fail');
    expect(judge(drill, {}, { 'm1.restore-drill': { by: 'المالك' } }, NOW).status).toBe('fail');
    expect(judge(drill, {}, { 'm1.restore-drill': { by: 'المالك', at: '2026-11-01' } }, NOW).status).toBe('pass');
    expect(judge(drill, {}, { 'm1.restore-drill': { by: 'المالك', at: '2026-09-01' } }, NOW).reason).toContain('تقادم');
  });

  it('الإقرار بتاريخ مستقبلي لا يُقبل، فلا يتجاوز التقادم', () => {
    const drill = STAGES[0].checks.find((c) => c.id === 'm1.restore-drill');
    expect(judge(drill, {}, { 'm1.restore-drill': { by: 'المالك', at: '2099-01-01' } }, NOW).status).toBe('fail');
  });

  it('مرحلة مكتملة بعد مرحلة مفتوحة تظهر «بانتظار ما قبلها» ولا يُحتسب مكسبها', () => {
    const p = allPass([2]);
    const r = evaluate(p.facts, p.attest, NOW);
    expect(r.stages[1].crossed).toBe(true);
    expect(r.stages[1].effective).toBe(false);
    expect(stateOf(r.stages[1])).toBe('مكتملة بانتظار ما قبلها');
    expect(toMarkdown(r, 'x')).not.toContain('⚠️');
    expect(toMarkdown(evaluate({ 'm1.migrations': { status: 'unknown' } }, {}, NOW), 'x')).toContain('⚠️');
  });

  it('النقطة الآلية التي تعذّر فحصها لا تُحسب نجاحًا', () => {
    const r = evaluate({ 'm1.migrations': { status: 'unknown', reason: 'تعذّر' } }, {}, NOW);
    expect(r.stages[0].checks.find((c) => c.id === 'm1.migrations').status).toBe('unknown');
    expect(r.stages[0].crossed).toBe(false);
    expect(r.score).toBe(BASE_SCORE);
  });

  it('المكسب متسلسل: عبور م2 لا يُحتسب قبل عبور م1', () => {
    expect(evaluate(allPass([2]).facts, allPass([2]).attest, NOW).score).toBe(BASE_SCORE);
    const both = allPass([1, 2]);
    expect(evaluate(both.facts, both.attest, NOW).score).toBe(8.3);
  });

  it('عبور المراحل كلها يبلغ الهدف', () => {
    const all = allPass([1, 2, 3, 4, 5]);
    const r = evaluate(all.facts, all.attest, NOW);
    expect(r.stages.every((s) => s.crossed)).toBe(true);
    expect(r.score).toBe(r.target);
  });

  it('معرّفات النقاط فريدة، والتقرير يذكر كل مرحلة', () => {
    const ids = STAGES.flatMap((s) => s.checks.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    const md = toMarkdown(evaluate({}, {}, NOW), '2026-11-09');
    for (const s of STAGES) expect(md).toContain(`م${s.id} ${s.title}`);
  });
});
