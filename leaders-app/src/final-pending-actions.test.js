// التقييم الختامي بانتظار الاعتماد: من رفعه يسحبه، وإشعار الصوت من حال التقييم الفعلية (التدقيق 2026-11-11)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approvalState, voteBlock, voteNoticeAr } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('سحب التقييم المرفوع للتعديل (admin-eval-4)', () => {
  it('المعدِّل ممنوع من التصويت، فالخادم يتيح له السحب، والواجهة تعرض الزر بتأكيد', () => {
    const rec = { status: 'pending', submitted_by: 'a@x.sa', adjust: { score: { value: 90, reason: 'سبب طويل بما يكفي' }, edited_by: ['a@x.sa'] } };
    expect(voteBlock('a@x.sa', rec, {})).toMatch(/من عدّل التقييم/);
    const final = read('supabase/functions/leaders-api/final.ts');
    expect(final).toMatch(/can_withdraw: !!a && record\?\.status === 'pending' && finalEditors\(record\)\.includes\(/);
    // save يقبل المعلّق (لا يرفض إلا المعتمد) ويعيده مسودة بلا أصوات، ويُسجَّل سحبًا
    expect(final).toMatch(/if \(record\?\.status === 'approved'\) throw new Fail/);
    expect(final).toMatch(/status: submit \? 'pending' : 'draft', votes: \[\]/);
    expect(final).toMatch(/record\?\.status === 'pending' \? 'final\.withdraw' : 'final\.save'/);
    const ui = read('admin-app/src/screens/FinalEval.jsx');
    expect(ui).toMatch(/\{d\.can_withdraw && <button[^>]*onClick=\{withdraw\}>اسحب للتعديل<\/button>\}/);
    expect(ui).toMatch(/await confirm\('يعود التقييم مسودة وتسقط الأصوات/);
    expect(ui).toMatch(/run\('admin\.final-eval-save', \{ adjust: adj \}, 'سُحب التقييم وعاد مسودة'\)/);
  });
});

describe('إشعار الصوت من حال التقييم (admin-eval-5)', () => {
  const v = (...k) => k.map((vote, i) => ({ by: `u${i}@x.sa`, vote }));
  it('صوت إعادة واحد في لجنة أغلبية من ثلاثة لا يُعلن «أُعيد للمراجعة»', () => {
    const cfg = { approval: 'committee_majority', committee_size: 3 };
    const st = approvalState(v('return'), cfg);
    expect(st.returned).toBe(false);
    const msg = voteNoticeAr('return', 'pending', st);
    expect(msg).not.toBe('أُعيد للمراجعة');
    expect(msg).toMatch(/ما زال بانتظار الاعتماد/);
    expect(voteNoticeAr('return', 'returned', approvalState(v('return', 'return'), cfg))).toBe('أُعيد للمراجعة');
  });
  it('الخبير بتعديل كبير بعد اعتماد سابق: الإعادة لا تُعلن عودة', () => {
    const st = approvalState(v('approve', 'return'), { approval: 'expert' }, { largeAdjust: true });
    expect(voteNoticeAr('return', st.returned ? 'returned' : 'pending', st)).toMatch(/بانتظار الاعتماد/);
    expect(voteNoticeAr('approve', 'pending', approvalState(v('approve'), { approval: 'expert' }, { largeAdjust: true }))).toBe('سُجل اعتمادك: 1 من 2');
  });
  it('الواجهة تبني الإشعار من رد الخادم لا من نص ثابت', () => {
    const ui = read('admin-app/src/screens/FinalEval.jsx');
    expect(ui).not.toMatch(/\{ vote: 'return', note \}, 'أُعيد للمراجعة'\)/);
    expect(ui).toMatch(/voteNoticeAr\('return', r\.status, r\.approval\)/);
    expect(ui).toMatch(/voteNoticeAr\('approve', r\.status, r\.approval\)/);
  });
});
