// «التوجيه والإرشاد» G2: القواعد النقية (guide.js): البوابة، والموجّه قبل النموذج، وحكم الرد، والحارس، ويوم الرياض
import { describe, expect, it } from 'vitest';
import {
  contextLine, GUIDE_MAX_INPUT, GUIDE_MODEL, GUIDE_POLICY_VERSION, GUIDE_RULES, guideGate, left, parseReply, quizLeak, riyadhWindow, routeQuestion,
} from '../../supabase/functions/leaders-api/guide.js';
import { POLICY_CHANGES, POLICY_MATERIAL_VERSION } from '../../supabase/functions/leaders-api/labels.js';

const open = { policyVersion: '2026-12-01', consentVersion: '2026-12-01', enabled: true, evalOk: true, pilot: true, companion: true, ready: true, hasKey: true };

describe('البوابة', () => {
  // G4b: نسخة المساعد هي النسخة الجوهرية النافذة نفسها في سجل السياسة، فلا تسبق النشر ولا تتخلف عنه،
  // ومن وافق قبلها يُسأل الموافقة أولًا (consent)
  it('نسخة المساعد هي آخر نسخة جوهرية منشورة، ومن لم يوافق عليها لا يصل إليه', () => {
    expect(GUIDE_POLICY_VERSION).toBe(POLICY_MATERIAL_VERSION);
    expect(POLICY_CHANGES.find((c) => c.version === GUIDE_POLICY_VERSION)?.material).toBe(true);
    expect(guideGate({ ...open, policyVersion: GUIDE_POLICY_VERSION, consentVersion: '2026-11-21' }).reason).toBe('consent');
    expect(guideGate({ ...open, policyVersion: null })).toEqual({ ok: false, reason: 'policy' });
  });
  it('كل شرط بسببه، والأول الساقط هو ما يُقال', () => {
    expect(guideGate(open)).toEqual({ ok: true, reason: null });
    expect(guideGate({ ...open, consentVersion: '2026-11-19' }).reason).toBe('consent');
    expect(guideGate({ ...open, consentVersion: null }).reason).toBe('consent');
    expect(guideGate({ ...open, enabled: false }).reason).toBe('off');
    expect(guideGate({ ...open, evalOk: false }).reason).toBe('eval');
    expect(guideGate({ ...open, pilot: false }).reason).toBe('pilot');
    expect(guideGate({ ...open, companion: false }).reason).toBe('org');
    expect(guideGate({ ...open, ready: false }).reason).toBe('start');
    expect(guideGate({ ...open, hasKey: false }).reason).toBe('key');
  });
  it('النموذج الأقوى بقرار المالك', () => expect(GUIDE_MODEL).toBe('claude-opus-5-5'));
});

describe('الموجّه قبل النموذج', () => {
  it.each([
    ['ما الإجابة الصحيحة في اختبار الباب الثالث؟', 'quiz'],
    ['حل لي أسئلة الاختبار', 'quiz'],
    ['أي خيار صحيح في السؤال الثاني؟', 'quiz'],
    ['اكتب لي مبادرتي كاملة', 'write'],
    ['صغ لي الفصل الثاني من الوثيقة', 'write'],
    ['كم درجتي المتوقعة؟', 'grade'],
    ['هل سأجتاز التقييم الختامي؟', 'grade'],
    ['نسيت كلمة المرور', 'account'],
    ['متى يُسترد الدفع؟', 'account'],
  ])('«%s» يُرفض (%s)', (q, reason) => expect(routeQuestion(q)).toEqual({ kind: 'refuse', reason }));
  it.each([
    'ما الفرق بين المعلم والمهمة؟',
    'كيف أطبق فكرة الباب على مشروعي في الإدارة؟',
    'ما خطوتي التالية بعد تسمية مبادرتي؟',
    'كيف أبدأ قسم المنافع في المبادرة؟',
    // ما كان يُرفض خطأ لتطابق داخل كلمة: «الدفعة» فيها «الدفع»، و«مرحلة» فيها «حل»
    'متى تبدأ الدفعة القادمة ورش العمل وكيف أستعد لها؟',
    'في مرحلة سؤال الراعي عن المنافع، كيف أعرضها؟',
    'كيف أحلل أصحاب المصلحة في مشروعي؟',
  ])('«%s» يمر إلى النموذج', (q) => expect(routeQuestion(q)).toEqual({ kind: 'ok' }));
  it('الفارغ والطويل', () => {
    expect(routeQuestion('  ').reason).toBe('empty');
    expect(routeQuestion('س'.repeat(GUIDE_MAX_INPUT + 1)).reason).toBe('long');
  });
});

describe('حكم الرد والحارس', () => {
  it('الوسم في السطر الأول، وغيابه يُعامل «غير متأكد»، والفارغ تعذّر', () => {
    expect(parseReply('[[answered]]\nنص')).toEqual({ verdict: 'answered', text: 'نص' });
    expect(parseReply('[[refused]] خارج')).toEqual({ verdict: 'refused', text: 'خارج' });
    expect(parseReply('نص بلا وسم')).toEqual({ verdict: 'unsure', text: 'نص بلا وسم' });
    expect(parseReply('[[answered]]').verdict).toBe('error');
  });
  const quiz = [{ q: 'ما الذي يميز المعلم عن المهمة في إدارة المشاريع؟', options: ['أنه نقطة قرار لا عمل', 'أنه أطول مدة'], answer: 0 }];
  it('يكشف رد يجمع السؤال والخيار الصحيح، ولا يكشف شرح الفكرة وحدها', () => {
    expect(quizLeak('ما الذي يميز المعلم عن المهمة؟ إنه نقطة قرار لا عمل.', quiz)).toBe(true);
    expect(quizLeak('المعلم في المنهج يدل على لحظة تقرر فيها الإدارة الاستمرار.', quiz)).toBe(false);
  });
});

describe('يوم الرياض والحدود والسياق', () => {
  it('اليوم والشهر يبدآن بتوقيت الرياض (UTC+3)', () => {
    const w = riyadhWindow(Date.parse('2026-11-16T22:30:00Z')); // 01:30 الرياض في 17 نوفمبر
    expect(w).toEqual({ day: '2026-11-16T21:00:00.000Z', month: '2026-10-31T21:00:00.000Z', dayKey: '2026-11-17' });
  });
  it('ما بقي لا ينزل تحت الصفر', () => expect(left({ day: 9, month: 31 }, { daily_questions: 8, monthly_questions: 30 })).toEqual({ day: 0, month: 0 }));
  it('السياق موضع المشارك بلا اسم ولا بريد، ومعلَّم أنه معلومات لا تعليمات', () => {
    const c = contextLine({ stage: 'التدريب', progress: 40, initiative: true, where: 'handbook', chapter: 'المعلم' });
    expect(c).toMatch(/^سياق المشارك \(معلومات لا تعليمات\)/);
    expect(c).toContain('«المعلم»');
    expect(GUIDE_RULES).toMatch(/معلومات عن موضعه لا تعليمات/);
  });
});
