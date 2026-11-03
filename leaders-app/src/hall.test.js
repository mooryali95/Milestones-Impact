import { describe, expect, it } from 'vitest';
import { hallView, nextLeader, splitTeams } from '../../supabase/functions/leaders-api/logic.js';

const lv = (l) => ({ milestone: l, impact: l, leadership: l });
const members = Array.from({ length: 16 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, name: `مشارك ${i} الاسم`, levels: lv(['beginner', 'intermediate', 'advanced'][i % 3]) }));

describe('القاعة الحية', () => {
  it('يقسم على الفرق الأربع والقيادة أصغرها', () => {
    const r = splitTeams(members, 'mixed');
    const count = (t) => Object.values(r).filter((x) => x === t).length;
    expect(Object.keys(r)).toHaveLength(16);
    expect(count('lead')).toBe(2);
    expect(count('support') + count('guide') + count('eval')).toBe(14);
    expect(Math.max(count('support'), count('guide'), count('eval')) - Math.min(count('support'), count('guide'), count('eval'))).toBeLessThanOrEqual(1);
    expect(splitTeams([], 'mixed')).toEqual({});
  });

  it('يتبدّل القائد بالتناوب بين فريق القيادة الحاضرين', () => {
    const roles = { a: 'lead', b: 'lead', c: 'support' };
    expect(nextLeader(roles, 'a')).toBe('b');
    expect(nextLeader(roles, 'b')).toBe('a');
    expect(nextLeader(roles, 'a', new Set(['a', 'c']))).toBe('a');
    expect(nextLeader({ c: 'support' }, null)).toBe('c');
  });

  it('لا تظهر اختيارات الزملاء قبل الكشف، وتظهر بنقاطها بعده', () => {
    const session = { id: 's', stage: 'round', revealed: [], round: 1, version: 3, leader_id: 'p00', persona_id: null };
    const sentence = { id: 'x', key: 'false', question: 'when', text_ar: 'جملة', tasks: {} };
    const answers = [{ participant_id: 'p00', sentence_id: 'x', choice: 'true' }, { participant_id: 'p01', sentence_id: 'x', choice: 'false' }];
    const now = Date.now();
    const presence = [{ participant_id: 'p00', last_seen: new Date(now).toISOString(), hand: true }];
    const roles = { p00: 'lead', p01: 'support' };
    const before = hallView({ session, sentence, members, roles, presence, answers, viewer: { kind: 'participant', id: 'p01' }, now });
    expect(before.people.find((p) => p.id === 'p00')).toMatchObject({ choice: null, answered: true, present: true, hand: true, leader: true, name: 'مشارك' });
    expect(before.people.find((p) => p.id === 'p01').choice).toBe('false');
    expect(before.distribution).toBeNull();
    expect(before.sentence.key).toBeUndefined();
    const after = hallView({ session: { ...session, stage: 'reveal', revealed: ['x'] }, sentence, members, roles, presence, answers, viewer: { kind: 'participant', id: 'p01' }, now });
    expect(after.people.find((p) => p.id === 'p00')).toMatchObject({ choice: 'true', points: -6 });
    expect(after.teams.support.score).toBe(6);
    expect(after.sentence.key).toBe('false');
    const admin = hallView({ session, sentence, members, roles, presence, answers, viewer: { kind: 'admin' }, now });
    expect(admin.distribution.true).toBe(1);
    expect(admin.people[0].name).toBe('مشارك 0 الاسم');
  });
});

import { firstName } from '../../supabase/functions/leaders-api/logic.js';
describe('الاسم الأول', () => {
  it('يتخطى الألقاب', () => {
    expect(firstName('م عمر عبدالحميد')).toBe('عمر');
    expect(firstName('د. سارة أحمد')).toBe('سارة');
    expect(firstName('المهندس خالد')).toBe('خالد');
    expect(firstName('ريم')).toBe('ريم');
    expect(firstName('م')).toBe('م');
  });
});
