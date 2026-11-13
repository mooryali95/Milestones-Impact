import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { onboardingOf, profileComplete, profileMissing, PROFILE_FIELDS, servedTotal } from '../../supabase/functions/leaders-api/onboarding.js';

const full = { full_name: 'سارة', phone: '0500000000', job_title: 'مديرة مشروع', organization_name: 'جهة', years_experience: 0, status: 'profiled' };

describe('أين توقف المشارك قبل الاعتماد', () => {
  it('الملف: يسمّي الناقص بترتيب النموذج، وصفر سنوات خبرة قيمة لا نقص', () => {
    expect(profileComplete(full)).toBe(true);
    expect(profileMissing({ full_name: 'سارة', phone: ' ', years_experience: null })).toEqual(['الجوال', 'المسمى الوظيفي', 'جهة العمل', 'سنوات الخبرة']);
    const o = onboardingOf({ ...full, phone: null, status: 'registered' });
    expect(o.step).toBe('profile');
    expect(o.remaining).toBe('ينقص الملف: الجوال');
  });
  it('القياس: لم يفتحه، فتحه بلا إجابة، جارٍ بعدّه', () => {
    expect(onboardingOf(full).remaining).toBe('لم يفتح القياس');
    expect(onboardingOf(full, { status: 'in_progress', answered: 0, total: 63 })).toMatchObject({ step: 'assessment_todo', remaining: 'فتح القياس ولم يجب عن أي سؤال' });
    expect(onboardingOf(full, { status: 'in_progress', answered: 42, total: 63 })).toMatchObject({ step: 'assessment_doing', remaining: 'أجاب 42 من 63، وبقي 21' });
  });
  it('من سلّم ينتظر الاعتماد، ومن اعتُمد انتهى', () => {
    expect(onboardingOf({ ...full, status: 'pending_approval' }, { status: 'submitted', answered: 63, total: 63 }).step).toBe('approval');
    expect(onboardingOf({ ...full, status: 'placed' }, { status: 'submitted', answered: 63, total: 63 }).step).toBe('done');
    // مستورد اعتُمد مستواه بلا قياس وملفه ناقص: ليس متعثرًا
    expect(onboardingOf({ status: 'placed' }).step).toBe('done');
  });
  it('عدد الأسئلة المعروضة: بصيغة المشارك، وبلا صيغة يُحسب بالأولى', () => {
    const qs = [{ form: null }, { form: null }, { form: 'A' }, { form: 'B' }, { form: 'B' }];
    expect(servedTotal(qs, 'B')).toBe(4);
    expect(servedTotal(qs, null)).toBe(3);
    expect(servedTotal([{}, {}], null)).toBe(2);
  });
  it('profileSave يحكم على الاكتمال من المصدر نفسه', () => {
    const src = readFileSync(join(__dirname, '../..', 'supabase/functions/leaders-api/participant.ts'), 'utf8');
    expect(src).toContain('const complete = profileComplete(merged);');
    expect(PROFILE_FIELDS.map((f) => f.key)).toEqual(['full_name', 'phone', 'job_title', 'organization_name', 'years_experience']);
  });
});

import { effortOf } from '../../supabase/functions/leaders-api/answer-review.js';
import { cohortSetup, setupMissing } from '../../supabase/functions/leaders-api/cohort-setup.js';

describe('مؤشر الجهد (استشاري)', () => {
  const mk = (n, seconds, kind = 'choice', k = 0) => Array.from({ length: n }, () => ({ seconds, kind, k }));
  it('من استعجل في أغلب القياس «جهد منخفض» ولو كان وسيطه هو السريع', () => {
    const e = effortOf([...mk(40, 2), ...mk(15, 20)]);
    expect(e.level).toBe('low');
    expect(e.note).toContain('40 من 55 إجابة أسرع من زمن القراءة');
    expect(e.note).toContain('إعادة القياس');
  });
  it('إجابات بزمن قراءة طبيعي «جهد طبيعي»، والقليل السريع لا يُعلَّم', () => {
    expect(effortOf([...mk(2, 3), ...mk(50, 30)]).level).toBe('ok');
    expect(effortOf([...mk(8, 3), ...mk(42, 30)]).level).toBe('watch');
  });
  it('النمط الواحد في عبارات الممارسة يرفع إلى «يُراجع»', () => {
    const e = effortOf([...mk(30, 30), ...mk(14, 6, 'likert', 3), ...mk(1, 6, 'likert', 1)]);
    expect(e.straight).toBe(true);
    expect(e.level).toBe('watch');
  });
  it('أزمنة صالحة قليلة: لا حكم', () => {
    expect(effortOf(mk(5, 1)).level).toBeNull();
  });
  it('لا يدخل الدرجة: لا يستورده منطق التسكين ولا الإرسال', () => {
    const logic = readFileSync(join(__dirname, '../..', 'supabase/functions/leaders-api/logic.js'), 'utf8');
    expect(logic).not.toContain('effortOf');
    expect(readFileSync(join(__dirname, '../..', 'supabase/functions/leaders-api/participant.ts'), 'utf8')).not.toContain('effortOf');
  });
});

describe('جاهزية الدفعة', () => {
  it('دفعة بأعضاء بلا مستشار ولا نهاية ولا جدول: أربعة بنود ناقصة بأسبابها', () => {
    const s = cohortSetup({ cohort: { starts_on: '2026-11-10', ends_on: null, schedule: {}, advisor_expert_id: null }, members: 27 });
    expect(setupMissing(s)).toBe(4);
    expect(s.find((x) => x.key === 'members')).toMatchObject({ ok: true, detail: '27 في الدفعة (من سُجّل فيها ومن انضم بجهتها)' });
    expect(s.find((x) => x.key === 'period').detail).toContain('بلا تاريخ نهاية');
    expect(s.find((x) => x.key === 'advisor').where).toBe('team');
  });
  it('دفعة مكتملة: لا ناقص', () => {
    const s = cohortSetup({ cohort: { starts_on: '2026-11-10', ends_on: '2027-02-10', schedule: { s1: {} }, advisor_expert_id: 'e1' }, advisorName: 'د. سلمان', teamCount: 2, members: 27, upcomingSessions: 3 });
    expect(setupMissing(s)).toBe(0);
    expect(s.find((x) => x.key === 'advisor').detail).toBe('د. سلمان، ومعه 2 في الفريق');
  });
});
