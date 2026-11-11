// links-expert-4: «اعتمد» في التقييم الختامي يسبقه تأكيد في البوابة واللوحة، يذكر الدرجة والقرار وما يحدث الآن
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalApproveConfirm } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('تأكيد اعتماد التقييم الختامي', () => {
  it('التوقيع الذي يكمل العدد يذكر الإبلاغ الفوري، والشهادة للاجتياز وحده', () => {
    const pass = finalApproveConfirm({ score: 78, decision: 'pass' }, { yes: 0, need: 1 });
    expect(pass).toContain('78٪ · اجتاز');
    expect(pass).toContain('يُبلغ المشارك بالقرار الآن وتصدر شهادته');
    expect(pass).toContain('إعادة فتح من الإدارة');
    const fail = finalApproveConfirm({ score: 40, decision: 'fail' }, { yes: 1, need: 2 });
    expect(fail).toContain('يُبلغ المشارك بالقرار الآن،');
    expect(fail).not.toContain('شهادته');
  });
  it('التوقيع الذي لا يكمل العدد يُسجَّل ولا يحسم', () => {
    const t = finalApproveConfirm({ score: 78, decision: 'pass' }, { yes: 0, need: 2 });
    expect(t).toContain('1 من 2');
    expect(t).not.toContain('يُبلغ المشارك');
  });
  it('زر «اعتمد» في البوابة واللوحة لا يرسل التصويت قبل التأكيد', () => {
    expect(read('leaders-app/src/screens/ExpertFile.jsx')).toMatch(/window\.confirm\(finalApproveConfirm\(live, f\.approval\)\)\) run\('xp\.final-eval-vote', \{ vote: 'approve' \}/);
    const admin = read('admin-app/src/screens/FinalEval.jsx');
    expect(admin).toMatch(/await confirm\(finalApproveConfirm\(live, d\.approval\)/);
    expect(admin).toMatch(/onClick=\{voteApprove\}>اعتمد</);
  });
});
