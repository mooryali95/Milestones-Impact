// المرحلة 14: لا يصل رمز غير محلول إلى ما يراه المشارك، والإدارة تأخذ مدة القياس من المصدر الواحد
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ASSESSMENT_TBD_AR, journeyCoherence, journeyCtx, renderJourney, renderJourneyText, unresolvedTokens } from '../../supabase/functions/leaders-api/logic.js';

const reqs = [{ code: 'O-SESS', stage_key: 's1', kind: 'coaching', title_ar: 'جلسات', config: { sessions_required: 3, minutes: 45 } }];
const TOKENS = ['{assessment_minutes}', '{ready_min}', '{duration}', '{sessions:O-SESS}', '{minutes:O-SESS}', '{days:O-SESS}', '{sessions:NOPE}', '{minutes:NOPE}', '{days:NOPE}'];
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('رموز الرحلة', () => {
  it('كل رمز، بقيمة أو بلا قيمة، لا يصل «{» منه إلى نص المشارك', () => {
    for (const am of [null, 12]) for (const dd of [0, 14]) {
      const text = TOKENS.join(' و');
      const def = renderJourney({ stages: [{ key: 's1', title_ar: text, duration_days: dd, duration_label: text, description_ar: text, activities_ar: text, outcome_ar: text, mode_note_ar: text, builds_on_ar: text }], requirements: [{ ...reqs[0], title_ar: text, help_ar: text }] }, { readyMin: null, assessmentMinutes: am });
      const s = JSON.stringify(def);
      expect(s).not.toMatch(/\{[a-z_]+(?::[A-Z0-9-]+)?\}/);
    }
  });
  it('مدة القياس بلا قيمة تصير عبارة محايدة للمشارك، وبقيمة تُملأ', () => {
    const d = (am) => renderJourney({ stages: [{ key: 's1', description_ar: 'يستغرق {assessment_minutes}' }], requirements: [] }, { assessmentMinutes: am }).stages[0].description_ar;
    expect(d(null)).toBe(`يستغرق ${ASSESSMENT_TBD_AR}`);
    expect(d(12)).toBe('يستغرق 12 دقيقة');
  });
  it('المحرر يبقى يرى الرمز (بلا neutral)، و journeyCtx يحمل مدة القياس من رد الإدارة', () => {
    expect(renderJourneyText('{assessment_minutes}', {})).toBe('{assessment_minutes}');
    const ctx = journeyCtx({ stage_requirements: reqs, assessment_minutes: 9 }, { duration_days: 7 });
    expect(renderJourneyText('{assessment_minutes} {duration}', ctx)).toBe('9 دقيقة أسبوع');
    expect(unresolvedTokens('{assessment_minutes}', {})).toEqual(['assessment_minutes']);
  });
  it('journeyCoherence يلاحظ «رمز بلا قيمة» حين تعرف الإدارة القيم', () => {
    const stages = [{ key: 's1', title_ar: 'القياس', active: true, description_ar: 'نحو {assessment_minutes}' }];
    expect(journeyCoherence(stages, [], { assessmentMinutes: null }).some((x) => x.msg.includes('رمز بلا قيمة'))).toBe(true);
    expect(journeyCoherence(stages, [], { assessmentMinutes: 12 }).some((x) => x.msg.includes('رمز بلا قيمة'))).toBe(false);
  });
  it('الإدارة: الرد يحمل assessment_minutes من baselineMinutes، وMethodology يمررها عبر journeyCtx بلا رقم ثابت', () => {
    expect(src('../../supabase/functions/leaders-api/admin.ts')).toContain('out.assessment_minutes = await baselineMinutes()');
    const m = src('../../admin-app/src/screens/Methodology.jsx');
    expect(m).toContain('assessmentMinutes: catalog.assessment_minutes');
    expect(m).toMatch(/renderJourneyText\(t, ctxOf\(s\)\)/);
  });
});

describe('معاينة نموذج المرحلة في الإدارة', async () => {
  const { preview } = await import('../../admin-app/src/methodology.js');
  it('تملأ مدة القياس من قيمتها', () => {
    expect(preview(reqs, 'activities_ar', 25)({ activities_ar: 'قياس {assessment_minutes}' })).toBe('يظهر للمشارك: قياس ' + renderJourneyText('{assessment_minutes}', journeyCtx({ assessmentMinutes: 25 }, null, { neutral: true })));
  });
  it('بلا قيمة تعرض ما يراه المشارك لا الرمز الخام', () => {
    const out = preview(reqs, 'activities_ar')({ activities_ar: 'قياس {assessment_minutes}' });
    expect(out).toBe(`يظهر للمشارك: قياس ${ASSESSMENT_TBD_AR}`);
    expect(out).not.toContain('{');
  });
});
