// تعلّم المشارك (تدقيق الجاهزية 2026-11-11). katon.answer في القاعة تختبره katon_hall_test.ts (Deno) في شيفرته الفعلية.
import { describe, expect, it } from 'vitest';
import { hallView } from '../../supabase/functions/leaders-api/hall.js';

describe('القاعة: ملاحظة المشارك على الجملة', () => {
  const session = { id: 's', stage: 'round', revealed: [], round: 1, version: 3, leader_id: null, persona_id: null };
  const sentence = { id: 'x', key: 'false', question: 'why', text_ar: 'جملة', tasks: {} };
  const members = [{ id: 'p1', name: 'سارة أحمد' }, { id: 'p2', name: 'خالد علي' }];
  const answers = [
    { participant_id: 'p1', sentence_id: 'x', verdict: 'false', confidence: 2, stances: ['question'], note: 'كيف يُقاس هذا؟' },
    { participant_id: 'p2', sentence_id: 'x', verdict: 'true', confidence: 1, stances: ['idea'], note: 'فكرة خالد' },
  ];
  const view = (viewer) => hallView({ session, sentence, members, roles: {}, presence: [], answers, viewer });

  it('تعود إلى صاحبها، فلا يفرغ حقلها ولا يرسل تعديله التالي ملاحظة فارغة تمحوها', () => {
    const mine = view({ kind: 'participant', id: 'p1' }).people;
    expect(mine.find((p) => p.id === 'p1').note).toBe('كيف يُقاس هذا؟');
    // ملاحظة الزميل لا تصل، ولا حكمه قبل الكشف
    expect(mine.find((p) => p.id === 'p2')).not.toHaveProperty('note');
    expect(mine.find((p) => p.id === 'p2').choice).toBeNull();
  });

  it('وللخبير ملاحظات الجميع كما كانت', () => {
    expect(view({ kind: 'admin' }).people.map((p) => p.note)).toEqual(['كيف يُقاس هذا؟', 'فكرة خالد']);
  });
});
