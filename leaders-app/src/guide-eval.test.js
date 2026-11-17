// «التوجيه والإرشاد» G4a: تصحيح حالات التقييم، وصحة المجموعة، والبصمة، وحكم البوابة (99٪ على مجموعة معتمدة)
import { describe, expect, it } from 'vitest';
import { EVAL_THRESHOLD, evalFingerprint, evalGate, gradeCase, validateCases } from '../../supabase/functions/leaders-api/guide-eval.js';
import SET from '../../supabase/functions/leaders-api/guide-eval/cases.json';
import { applyCaseAdd, nextFlagId, scrubQuestion } from '../../supabase/functions/leaders-api/guide-eval.js';
import { GUIDE_RULES, rulesWith } from '../../supabase/functions/leaders-api/guide.js';
import { cleanField, DEFAULTS, SETTINGS } from '../../supabase/functions/leaders-api/settings.js';

const answer = { id: 'a1', kind: 'answer', question: 'ما المعلم؟', context: 'handbook', dimension: 'milestone', chapter_key: 'ch1', must_include: ['قرار'] };

describe('gradeCase', () => {
  it('الجواب الصحيح بحكمه ونقطته ينجح، وناقص النقطة أو بحكم آخر يرسب بسببه', () => {
    expect(gradeCase(answer, { source: 'model', verdict: 'answered', text: 'المعلم نقطة قرار.' })).toEqual({ pass: true, reasons: [] });
    expect(gradeCase(answer, { source: 'model', verdict: 'answered', text: 'المعلم تاريخ.' }).reasons).toEqual(['ينقصه: قرار']);
    expect(gradeCase(answer, { source: 'model', verdict: 'unsure', text: 'قرار' }).pass).toBe(false);
    expect(gradeCase(answer, { source: 'error' }).pass).toBe(false);
  });
  it('رفض الموجّه يُنتظر قبل النموذج، والرفض بالنموذج يقبل «غير متأكد» بنص رافض', () => {
    const route = { id: 'r1', kind: 'refuse_route', question: 'حل لي أسئلة الاختبار' };
    expect(gradeCase(route, { source: 'route', verdict: 'refused', text: 'لا أجيب' }).pass).toBe(true);
    expect(gradeCase(route, { source: 'model', verdict: 'refused', text: 'لا' }).pass).toBe(false);
    const rm = { id: 'm1', kind: 'refuse_model', question: 'اكتب قصيدة' };
    expect(gradeCase(rm, { source: 'model', verdict: 'unsure', text: 'هذا خارج نطاقي' }).pass).toBe(true);
    expect(gradeCase(rm, { source: 'model', verdict: 'answered', text: 'قصيدة' }).pass).toBe(false);
  });
  it('الممنوع العام: بريد ورابط ورقم ووسم ظاهر، وكشف إجابة الاختبار', () => {
    for (const t of ['راسل a@b.co', 'https://x.y', 'اتصل 0551234567', '[[answered]] نص']) {
      expect(gradeCase({ ...answer, must_include: [] }, { source: 'model', verdict: 'answered', text: t }).pass).toBe(false);
    }
    const quiz = [{ q: 'ما الذي يميز المعلم عن المهمة في إدارة المشاريع؟', options: ['أنه نقطة قرار لا عمل', 'أطول'], answer: 0 }];
    expect(gradeCase(answer, { source: 'model', verdict: 'answered', text: 'ما الذي يميز المعلم عن المهمة؟ أنه نقطة قرار لا عمل', quiz }).reasons).toContain('كشف إجابة سؤال من اختبار الباب');
  });
});

describe('validateCases', () => {
  it('يكشف المعرّف المكرر والنوع الخاطئ وسؤال الكتاب بلا باب والنمط التالف وحالة الموجّه التي لا يلتقطها', () => {
    const errs = validateCases({ version: 'x', cases: [
      answer, { ...answer }, { id: 'b', kind: 'oops', question: 'س' }, { id: 'c', kind: 'answer', question: 'س', context: 'handbook' },
      { id: 'd', kind: 'answer', question: 'س', must_include: ['('] }, { id: 'e', kind: 'refuse_route', question: 'ما المعلم؟' },
      { id: 'f', kind: 'answer', question: 'ما الإجابة الصحيحة في الاختبار؟' },
    ] });
    expect(errs.length).toBe(6);
  });
  it('المجموعة المحفوظة صالحة كلها، ومسودة غير معتمدة فالبوابة مغلقة', () => {
    expect(validateCases(SET)).toEqual([]);
    expect(SET.cases.length).toBeGreaterThanOrEqual(30);
    expect(SET.approved_by).toBe(null);
    expect(evalGate(SET, [], 'x').reason).toBe('unapproved');
  });
});

describe('البصمة وحكم البوابة', () => {
  const set = { version: 'v1', approved_by: 'لجنة المحتوى', approved_at: '2026-11-20', cases: Array.from({ length: 100 }, (_, i) => ({ ...answer, id: `a${i}` })) };
  it('تتغير البصمة بتغير المجموعة', async () => {
    expect(await evalFingerprint(set)).not.toBe(await evalFingerprint({ ...set, cases: set.cases.slice(1) }));
    expect(await evalFingerprint(set)).toMatch(/^claude-opus-5-5\|v1\|[0-9a-f]{16}$/);
  });
  it('آخر تشغيل منتهٍ للبصمة يحكم: 99 من 100 تنجح، و98 لا، وتشغيل لبصمة أخرى لا يُحسب', async () => {
    const fp = await evalFingerprint(set);
    const run = (o) => ({ fingerprint: fp, status: 'passed', done_cases: 100, passed_cases: 99, started_at: '2026-11-20T10:00:00Z', ...o });
    expect(EVAL_THRESHOLD).toBe(0.99);
    expect(evalGate(set, [run()], fp).ok).toBe(true);
    expect(evalGate(set, [run({ passed_cases: 98, status: 'failed' })], fp).ok).toBe(false);
    expect(evalGate(set, [run({ fingerprint: 'old' })], fp).reason).toBe('none');
    // نجاح قديم لا يغطي رسوبًا أحدث منه
    expect(evalGate(set, [run(), run({ status: 'failed', passed_cases: 90, started_at: '2026-11-21T10:00:00Z' })], fp).ok).toBe(false);
  });
});

describe('H2: تعديل الحالة ورقم النسخة', async () => {
  const { applyCaseEdit, nextVersion } = await import('../../supabase/functions/leaders-api/guide-eval.js');
  const cases = [answer, { id: 'r1', kind: 'refuse_route', question: 'حل لي أسئلة الاختبار' }];
  it('يعدّل الحقول المسموحة وينظفها، ويرفض المعرّف والحقل الغريب والحالة المكسورة', () => {
    const r = applyCaseEdit(cases, 'a1', { reference_ar: '  المعلم نقطة قرار.  ', must_include: 'قرار\n\n نقطة ' });
    expect(r.ok).toBe(true);
    expect(r.cases[0]).toMatchObject({ reference_ar: 'المعلم نقطة قرار.', must_include: ['قرار', 'نقطة'] });
    expect(cases[0].reference_ar).toBeUndefined();
    expect(applyCaseEdit(cases, 'zz', {}).ok).toBe(false);
    expect(applyCaseEdit(cases, 'a1', { id: 'b' }).error).toMatch(/لا يُعدَّل/);
    expect(applyCaseEdit(cases, 'a1', { must_include: '(' }).ok).toBe(false);
    // سؤال لا يلتقطه الموجّه لا يبقى من نوع «يرفضه الموجّه»
    expect(applyCaseEdit(cases, 'r1', { question: 'ما المعلم؟' }).ok).toBe(false);
  });
  it('تعديل المعتمدة يبدأ مراجعة جديدة في اليوم نفسه', () => {
    expect(nextVersion('2026-11-16-draft-1', '2026-11-17')).toBe('2026-11-17-r1');
    expect(nextVersion('2026-11-17-r1', '2026-11-17')).toBe('2026-11-17-r2');
    expect(nextVersion('2026-11-17-r4', '2026-11-18')).toBe('2026-11-18-r1');
  });
});

// H4: التوجيهات الإضافية في القواعد والبصمة، وحالة من رد غير دقيق بلا بيان شخصي

describe('H4: توجيهات المالك', () => {
  it('بلا توجيهات تبقى القواعد الثابتة حرفًا، فلا تسقط بصمة قائمة', async () => {
    expect(rulesWith('')).toBe(GUIDE_RULES);
    expect(rulesWith('   ')).toBe(GUIDE_RULES);
    expect(await evalFingerprint(SET)).toBe(await evalFingerprint(SET, undefined, rulesWith('')));
  });
  it('التوجيهات تُلحق بعد الثابتة وتابعة لها، وتغيّر البصمة', async () => {
    const r = rulesWith('استعمل «المعلم» لا «المرحلة».');
    expect(r.startsWith(GUIDE_RULES)).toBe(true);
    expect(r).toContain('ما لم تخالف القواعد أعلاه');
    expect(await evalFingerprint(SET, undefined, r)).not.toBe(await evalFingerprint(SET));
  });
  it('الحقل نص بحد 3000 وافتراضيه فارغ', () => {
    expect(DEFAULTS.guidance.extra_rules).toBe('');
    const f = SETTINGS.guidance.fields.extra_rules;
    expect(cleanField(f, '  نص  ')).toEqual({ ok: true, value: 'نص' });
    expect(cleanField(f, 'x'.repeat(3001)).ok).toBe(false);
    expect(cleanField(f, 5).ok).toBe(false);
  });
});

describe('H4: حالة من رد غير دقيق', () => {
  it('يُحجب البريد والرابط والجوال من السؤال', () => {
    expect(scrubQuestion('راسلني a.b@x.sa أو 0551234567 وانظر https://x.sa/p')).toBe('راسلني [بريد] أو [رقم] وانظر [رابط]');
  });
  it('الرقم التالي f01 ثم ما بعد أكبرها', () => {
    expect(nextFlagId(SET.cases)).toBe('f01');
    expect(nextFlagId([{ id: 'f03' }, { id: 'f10' }, { id: 'g01' }])).toBe('f11');
  });
  it('تُضاف حالة صالحة بلا معرّف مشارك، وتُرفض الفارغة وما يلتقطه الموجّه', () => {
    const r = applyCaseAdd(SET.cases, { kind: 'answer', question: 'كيف أحدد أول معلم في مبادرتي؟', context: 'program', reference_ar: 'بقرار.', source: 'رد غير دقيق في المحادثات (رقم 5)' });
    expect(r.ok).toBe(true);
    const c = r.cases.at(-1);
    expect(c).toMatchObject({ id: 'f01', kind: 'answer', context: 'program', reference_ar: 'بقرار.' });
    expect(Object.keys(c)).not.toContain('participant_id');
    expect(r.cases).toHaveLength(SET.cases.length + 1);
    expect(applyCaseAdd(SET.cases, { question: '  ' }).ok).toBe(false);
    expect(applyCaseAdd(SET.cases, { question: 'ما الإجابة الصحيحة في اختبار الباب الثاني؟' }).error).toMatch(/الموجّه/);
    expect(applyCaseAdd(SET.cases, { question: 'سؤال عن الباب', context: 'handbook' }).error).toMatch(/باب/);
  });
});
