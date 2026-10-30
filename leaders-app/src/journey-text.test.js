// نصوص الرحلة تُولَّد من الإعدادات وتطابق ما كان مكتوبًا يدويًا حرفيًا
import { describe, expect, it } from 'vitest';
import { durationAr, hardcodedFacts, renderJourney, renderJourneyText, sessionsAr } from '../../supabase/functions/leaders-api/logic.js';

const reqs = [
  { code: 'O-SESS', config: { sessions_required: 4, minutes: 60 } }, { code: 'C-MEET', config: { sessions_required: 1, minutes: 90 } },
  { code: 'L-SESS', config: { sessions_required: 3, minutes: 60 } }, { code: 'S-CHECK', config: { sessions_required: 3, minutes: 45 } },
  { code: 'AP-INT', config: { sessions_required: 1, minutes: 20 } }, { code: 'T-ATTEND', config: { sessions_required: 4 } },
  { code: 'E-PRES', config: { minutes: 20 } },
];
const r = (t, extra = {}) => renderJourneyText(t, { reqs, readyMin: 80, assessmentMinutes: 12, ...extra });

describe('نصوص الرحلة من مصدرها', () => {
  it('تطابق النص القديم حرفيًا', () => {
    expect(r('{sessions:O-SESS} توجيه أسبوعية مدة كل منها {minutes:O-SESS}')).toBe('أربع جلسات توجيه أسبوعية مدة كل منها 60 دقيقة');
    expect(r('{sessions:L-SESS} فردية مدة كل منها {minutes:L-SESS}')).toBe('ثلاث جلسات فردية مدة كل منها 60 دقيقة');
    expect(r('جلسة متابعة شهرية مدتها {minutes:S-CHECK} ({sessions:S-CHECK})')).toBe('جلسة متابعة شهرية مدتها 45 دقيقة (ثلاث جلسات)');
    expect(r('جلسة استشارية مدتها {minutes:C-MEET}')).toBe('جلسة استشارية مدتها 90 دقيقة');
    expect(r('{days:T-ATTEND} تدريبية')).toBe('أربعة أيام تدريبية');
    expect(r('عرض مشروعك أمام لجنة التقييم في {minutes:E-PRES}')).toBe('عرض مشروعك أمام لجنة التقييم في 20 دقيقة');
    expect(r('جاهزيتها {ready_min}%')).toBe('جاهزيتها 80%');
    expect(r('{assessment_minutes}')).toBe('12 دقيقة');
    expect([28, 14, 90, 7, 3].map(durationAr)).toEqual(['4 أسابيع', 'أسبوعان', '3 أشهر', 'أسبوع', '3 أيام']);
  });
  it('تتبع الإعداد حين يتغير', () => {
    const changed = reqs.map((x) => (x.code === 'O-SESS' ? { ...x, config: { sessions_required: 3, minutes: 45 } } : x));
    expect(renderJourneyText('{sessions:O-SESS} مدة كل منها {minutes:O-SESS}', { reqs: changed })).toBe('ثلاث جلسات مدة كل منها 45 دقيقة');
    expect([1, 2, 11].map(sessionsAr)).toEqual(['جلسة واحدة', 'جلستان', '11 جلسة']);
  });
  it('رمز لمتطلب غير موجود يبقى ظاهرًا ولا يُخترع رقم', () => {
    expect(r('{sessions:X-NONE}')).toBe('{sessions:X-NONE}');
  });
  it('renderJourney يملأ المراحل والمتطلبات', () => {
    const def = renderJourney({ stages: [{ key: 'ojt', duration_days: 28, duration_label: '{duration}', activities_ar: '{sessions:O-SESS}' }], requirements: [{ ...reqs[0], title_ar: 'حضور {sessions:O-SESS}' }] });
    expect(def.stages[0]).toMatchObject({ duration_label: '4 أسابيع', activities_ar: 'أربع جلسات' });
    expect(def.requirements[0].title_ar).toBe('حضور أربع جلسات');
  });
  it('حارس الحفظ يرفض الرقم الصريح ويقبل الرمز', () => {
    expect(hardcodedFacts('أربع جلسات توجيه مدة كل منها 60 دقيقة')).toBeTruthy();
    expect(hardcodedFacts('4 أسابيع')).toBeTruthy();
    expect(hardcodedFacts('{sessions:O-SESS} مدة كل منها {minutes:O-SESS}')).toBeNull();
    expect(hardcodedFacts('قبل الجلسة بثلاثة أيام، وخطة بثلاثة أهداف')).toBeNull();
  });
});

import { journeyCoherence, unknownTokens } from '../../supabase/functions/leaders-api/logic.js';
describe('اتساق الرحلة', () => {
  const stage = { key: 'ojt', title_ar: 'التوجيه', duration_days: 28, activities_ar: '{sessions:O-SESS}' };
  it('الرحلة الحالية متسقة', () => {
    expect(journeyCoherence([stage], [{ code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', config: { sessions_required: 4, minutes: 60 } }])).toEqual([]);
  });
  it('جلسات أكثر مما تسعه المرحلة، ومدة غير معتادة', () => {
    const r = journeyCoherence([stage], [{ code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', config: { sessions_required: 12, minutes: 200 } }]);
    expect(r.map((x) => x.level)).toEqual(['warn', 'warn']);
    expect(r[0].msg).toContain('12 جلسة في 4 أسابيع');
  });
  it('رمز لنشاط غير موجود خطأ', () => {
    expect(unknownTokens('{minutes:X-1} و{sessions:O-SESS}', [{ code: 'O-SESS' }])).toEqual(['X-1']);
    expect(journeyCoherence([{ ...stage, activities_ar: '{minutes:X-1}' }], [])[0].level).toBe('error');
  });
});

import { programHours } from '../../supabase/functions/leaders-api/logic.js';
describe('ساعات البرنامج من أنشطته', () => {
  const reqs = [
    { code: 'T-ATTEND', kind: 'workshop', required: true, config: { sessions_required: 4, minutes: 360 } },
    { code: 'O-SESS', kind: 'coaching', required: true, config: { sessions_required: 4, minutes: 60 } },
    { code: 'E-PRES', kind: 'meeting', required: true, config: { minutes: 20 } },
    { code: 'L-360I', kind: 'check', required: true, config: {} },
    { code: 'X-OPT', kind: 'coaching', required: false, config: { sessions_required: 2, minutes: 60 } },
    { code: 'AP-INT', kind: 'coaching', required: true, config: { sessions_required: 1 } },
  ];
  it('يجمع الحضوري المطلوب، ولا يخمّن مدة غير مكتوبة', () => {
    expect(programHours(reqs)).toEqual({ hours: 28, minutes: 4 * 360 + 4 * 60 + 20, missing: ['AP-INT'] });
  });
  it('يحترم أنشطة مستوى المشارك', () => {
    const lvl = [{ code: 'L-ADV', kind: 'coaching', required: true, dimension: 'leadership', level: 'advanced', config: { sessions_required: 3, minutes: 60 } }];
    expect(programHours(lvl, { leadership: 'beginner' }).hours).toBe(0);
    expect(programHours(lvl, { leadership: 'advanced' }).hours).toBe(3);
  });
});
