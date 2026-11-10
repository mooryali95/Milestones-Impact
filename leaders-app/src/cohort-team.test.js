import { describe, expect, it } from 'vitest';
import { cleanTeamIds, rankExperts, TEAM_MAX, teamFirst } from '../../supabase/functions/leaders-api/logic.js';

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
