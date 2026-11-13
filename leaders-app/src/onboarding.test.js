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
