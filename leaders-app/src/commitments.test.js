// حلقة الالتزام بعد الورشة (تصور المرحلة 3 §5.2، البند 3.2)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanCommitment, cleanReview, commitmentsOn, commitmentStepRow, coachBuckets, reviewDue, reviewOpen,
  COMMITMENT_REVIEW_DAYS, COMMITMENT_OUTCOMES,
} from '../../supabase/functions/leaders-api/commitments.js';
import { POINTS } from '../../supabase/functions/leaders-api/logic.js';

const read = (f) => readFileSync(join(__dirname, '../..', f), 'utf8');
const DAY = 86400e3;
const now = Date.parse('2026-12-20T10:00:00Z');

describe('الالتزام بعد الورشة', () => {
  it('حقلان: الفعل والموعد، والموعد خلال أسبوعين أو قريبًا منها', () => {
    expect(cleanCommitment({ action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: '2026-12-25' }, now)).toEqual({ action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: '2026-12-25' });
    expect(cleanCommitment({ action: 'شيء', due_on: '2026-12-25' }, now).error).toBeTruthy();
    expect(cleanCommitment({ action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: '' }, now).error).toBeTruthy();
    expect(cleanCommitment({ action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: '2026-12-01' }, now).error).toBeTruthy();
    expect(cleanCommitment({ action: 'سأبدأ اجتماع الفريق بسؤال عن الأثر', due_on: '2027-06-01' }, now).error).toBeTruthy();
  });

  it('المراجعة بثلاثة خيارات وسطر «ماذا تعلمت» اختياري', () => {
    expect(COMMITMENT_OUTCOMES).toEqual(['yes', 'partial', 'no']);
    expect(cleanReview({ outcome: 'no', learned: '' })).toEqual({ outcome: 'no', learned: null });
    expect(cleanReview({ outcome: 'maybe' }).error).toBeTruthy();
  });

  it('التذكير بعد 14 يومًا مرة واحدة، ولا تذكير لمن راجع', () => {
    expect(COMMITMENT_REVIEW_DAYS).toBe(14);
    const row = { created_at: new Date(now - 15 * DAY).toISOString(), reminded_at: null, reviewed_at: null };
    expect(reviewDue(row, now)).toBe(true);
    expect(reviewDue({ ...row, created_at: new Date(now - 13 * DAY).toISOString() }, now)).toBe(false);
    expect(reviewDue({ ...row, reminded_at: new Date(now - DAY).toISOString() }, now)).toBe(false);
    expect(reviewDue({ ...row, reviewed_at: new Date(now - DAY).toISOString() }, now)).toBe(false);
    expect(reviewOpen(row)).toBe(true);
    expect(reviewOpen({ ...row, reviewed_at: 'x' })).toBe(false);
  });

  it('النقاط: 10 عند الكتابة و15 عند المراجعة بأي نتيجة', () => {
    expect(POINTS.commitment).toBe(10);
    expect(POINTS.commitmentReview).toBe(15);
  });

  it('المنجز يصير صفًا في جدول الأنشطة بنقرة، ولا يُقترح ما لم يطبق', () => {
    expect(commitmentStepRow({ action: 'اجتماع أسبوعي للأثر', due_on: '2026-12-25', outcome: 'yes' }, 5)).toEqual(['', 'اجتماع أسبوعي للأثر', '2026-12-25', '2026-12-25', '']);
    expect(commitmentStepRow({ action: 'x', due_on: '2026-12-25', outcome: 'partial' }, 5)).toHaveLength(5);
    expect(commitmentStepRow({ action: 'x', due_on: '2026-12-25', outcome: 'no' }, 5)).toBeNull();
    expect(commitmentStepRow({ action: 'x', due_on: '2026-12-25', outcome: null }, 5)).toBeNull();
  });

  it('شاشة المستشار: طبّق ولم يطبق وينتظر', () => {
    const b = coachBuckets([{ outcome: 'yes' }, { outcome: 'partial' }, { outcome: 'no' }, { outcome: null }]);
    expect(b.applied).toHaveLength(2);
    expect(b.not_applied).toHaveLength(1);
    expect(b.pending).toHaveLength(1);
  });

  it('يُطفأ من إعداد البرنامج، ومفعّل ما لم يُطفأ صراحة', () => {
    expect(commitmentsOn({})).toBe(true);
    expect(commitmentsOn({ commitments: { enabled: false } })).toBe(false);
  });

  it('لا يحبس مرحلة ولا يدخل التقدم: ليس نوع متطلب، ومنطق الرحلة لا يقرؤه', () => {
    const logic = read('supabase/functions/leaders-api/logic.js');
    expect(logic).not.toMatch(/workshop_commitments|commitments\.js/);
    expect(read('supabase/functions/leaders-api/participant.ts')).not.toMatch(/workshop_commitments/);
  });
});
