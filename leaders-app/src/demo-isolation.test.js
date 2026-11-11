// حساب العرض لا يشارك الدفعة المفتوحة الحقيقية (server-sec-5). السلوك على الخادم في demo_isolation_test.ts (Deno)؛
// هنا التوزيع في القاعة (منطق نقي)، وحراس المصدر لكل نقطة يلتقي فيها حساب العرض بالمشاركين الحقيقيين.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hallView } from '../../supabase/functions/leaders-api/logic.js';

const api = (f) => readFileSync(join(__dirname, '../../supabase/functions/leaders-api', f), 'utf8');

describe('حساب العرض خارج الدفعة المفتوحة الحقيقية', () => {
  it('توزيع جولة القاعة من إجابات أعضائها وحدهم: كاتون مشترك، فإجابة حساب العرض أو دفعة أخرى لا تدخله', () => {
    const session = { id: 's', stage: 'reveal', revealed: ['x'], round: 1, version: 2 };
    const sentence = { id: 'x', key: 'true', question: 'when', text_ar: 'جملة', tasks: {} };
    const members = [{ id: 'm1', name: 'عضو أول' }, { id: 'm2', name: 'عضو ثان' }];
    const answers = [
      { participant_id: 'm1', sentence_id: 'x', verdict: 'true', confidence: 2, stances: [] },
      { participant_id: 'demo', sentence_id: 'x', verdict: 'false', confidence: 3, stances: [] },
      { participant_id: 'other-cohort', sentence_id: 'x', verdict: 'false', confidence: 1, stances: [] },
    ];
    for (const viewer of [{ kind: 'admin' }, { kind: 'participant', id: 'm2' }]) {
      const v = hallView({ session, sentence, members, roles: {}, presence: [], answers, viewer });
      expect(v.distribution).toMatchObject({ true2: 1 });
      expect(Object.keys(v.distribution).some((k) => k.startsWith('false') && v.distribution[k] > 0)).toBe(false);
      expect(v.answered).toBe(1);
    }
  });

  it('المصدر: لا مستشار لحساب العرض، ولا قاعة، وطلبات التوجيه وإحصاء كاتون بلا إجاباته', () => {
    expect(api('advisor.ts')).toMatch(/export async function advisorOf\([^)]*\) \{\n {2}if \(p\.is_demo\) return null;/);
    const hall = api('hall.ts');
    expect(hall).toMatch(/async function hallCohortOf\(p: any\) \{\n {2}if \(p\.is_demo\) return null;/);
    // كل ما يحدد قاعة المشارك (الحالة والدخول واليد والفريق وبوابة إجابة كاتون) يمر بها، لا بـ cohortOf مباشرة
    expect(hall.match(/await hallCohortOf\(p\)/g)).toHaveLength(5);
    expect(hall.match(/await cohortOf\(p\)/g)).toHaveLength(1);
    const peer = api('peer.ts');
    expect(peer.match(/\.eq\('participants\.is_demo', /g)).toHaveLength(3);
    expect(peer).toMatch(/if \(!r \|\| !sameSide\(p, r\)\) throw new Fail\('الطلب غير موجود', 404\)/);
    expect(peer).toMatch(/r\.participants\?\.is_demo\) throw new Fail\('هذا الطلب ليس من دفعاتك', 403\)/);
    expect(api('katon.ts')).toMatch(/from\('katon_answers'\)\.select\('[^']*participants!inner\(is_demo\)'\)\.eq\('participants\.is_demo', false\)/);
  });
});
