import { describe, expect, it } from 'vitest';
import { advisedParticipantIds, cleanTeamIds, effectiveAdvisorId, rankExperts, TEAM_MAX, teamFirst } from '../../supabase/functions/leaders-api/logic.js';

const isId = (x) => /^[a-z]\d+$/.test(x);
describe('فريق خبراء الدفعة', () => {
  it('الفريق أولًا بترتيب مطابقتهم، ثم البقية بترتيبهم', () => {
    const ranked = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e4' }];
    expect(teamFirst(ranked, ['e3', 'e2']).map((e) => [e.id, e.team])).toEqual([['e2', true], ['e3', true], ['e1', false], ['e4', false]]);
  });
  it('بلا فريق: الترتيب كما هو والكل خارج الفريق', () => {
    const ranked = [{ id: 'e1' }, { id: 'e2' }];
    expect(teamFirst(ranked, []).map((e) => [e.id, e.team])).toEqual([['e1', false], ['e2', false]]);
    expect(teamFirst(ranked, null).map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('عضو الفريق غير المؤهل لا يدخل العرض: الأهلية قبل الفريق', () => {
    const experts = [
      { id: 'e1', status: 'active', roles: ['coach'] },
      { id: 'e2', status: 'paused', roles: ['coach'] },
      { id: 'e3', status: 'active', roles: ['advisor'] },
    ];
    const out = teamFirst(rankExperts(experts, { role: 'coach' }), ['e2', 'e3']);
    expect(out.map((e) => e.id)).toEqual(['e1']);
  });
  it('قائمة الفريق: معرّفات صالحة فريدة، وحد أعلى', () => {
    expect(cleanTeamIds(['e1', 'e1', 'bad id', 'e2'], isId)).toEqual(['e1', 'e2']);
    expect(cleanTeamIds(null, isId)).toEqual([]);
    expect(() => cleanTeamIds(Array.from({ length: TEAM_MAX + 1 }, (_, i) => `e${i}`), isId)).toThrow(String(TEAM_MAX));
  });
});

describe('خبير المجموعة: الأخص يغلب', () => {
  const approved = ['adv', 'g1', 'g2'];
  it('خبير المجموعة المعتمد يغلب مستشار الدفعة، وغير المعتمد يعيده إليه', () => {
    expect(effectiveAdvisorId({ group: 'g1', cohort: 'adv' }, approved)).toBe('g1');
    expect(effectiveAdvisorId({ group: null, cohort: 'adv' }, approved)).toBe('adv');
    expect(effectiveAdvisorId({ group: 'gone', cohort: 'adv' }, approved)).toBe('adv');
    expect(effectiveAdvisorId({ group: 'gone', cohort: 'gone2' }, approved)).toBeNull();
    expect(effectiveAdvisorId({}, approved)).toBeNull();
  });
  it('مستشار الدفعة لا يرى من له خبير مجموعة معتمد غيره، وخبير المجموعة يرى أعضاءها وحدهم', () => {
    const cohort = ['p1', 'p2', 'p3', 'p4'];
    const links = [{ participant_id: 'p1', advisor_expert_id: 'g1' }, { participant_id: 'p2', advisor_expert_id: 'g1' }, { participant_id: 'p3', advisor_expert_id: 'gone' }];
    expect(advisedParticipantIds('adv', cohort, links, approved).sort()).toEqual(['p3', 'p4']);
    expect(advisedParticipantIds('g1', [], links, approved).sort()).toEqual(['p1', 'p2']);
    // مستشار الدفعة هو نفسه خبير إحدى مجموعاتها: يبقى أعضاؤها عنده
    expect(advisedParticipantIds('adv', cohort, [{ participant_id: 'p1', advisor_expert_id: 'adv' }], approved).sort()).toEqual(cohort);
    expect(advisedParticipantIds('adv', cohort, [], approved)).toEqual(cohort);
  });
});
