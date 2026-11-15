import { describe, expect, it } from 'vitest';
import { evaluate, MODEL_DEFAULT, reorderIds, trackKey, trackLevels, lines } from './methodology.js';

describe('المنهجية', () => {
  it('رمز المسار يُقرأ ويُبنى بالاتجاهين', () => {
    expect(trackLevels('M2I1L3')).toEqual({ milestone: 'intermediate', impact: 'beginner', leadership: 'advanced' });
    expect(trackKey('advanced', 'beginner', 'intermediate')).toBe('M3I1L2');
  });

  it('المؤشر المركّب موزون، والجانب الأضعف يمنع المستوى الأعلى', () => {
    const r = evaluate({ knowledge: 75, skill: 25, behavior: 69 }, MODEL_DEFAULT);
    expect(r.composite).toBe(49.1);
    expect(r.level).toBe('beginner');
    expect(evaluate({ knowledge: 90, skill: 90, behavior: 90 }, MODEL_DEFAULT).level).toBe('advanced');
    // مؤشر عالٍ لكن مواقف تحت حد الاحترافي
    expect(evaluate({ knowledge: 100, skill: 50, behavior: 100 }, MODEL_DEFAULT).level).toBe('intermediate');
    // الممارسة الذاتية ليست بوابة: تُعلَّم ولا تمنع
    const lp = evaluate({ knowledge: 100, skill: 100, behavior: 50 }, MODEL_DEFAULT);
    expect(lp.level).toBe('advanced');
    expect(lp.low).toBe(100);
    expect(lp.low_practice).toBe(true);
    expect(evaluate({}, MODEL_DEFAULT)).toBeNull();
  });

  it('إعادة الترتيب داخل مجموعة العنصر فقط، ولا شيء على الطرف', () => {
    const rows = [
      { id: 'a', stage_key: 's1', sort: 1 }, { id: 'b', stage_key: 's1', sort: 2 },
      { id: 'x', stage_key: 's2', sort: 1 }, { id: 'c', stage_key: 's1', sort: 3 },
    ];
    expect(reorderIds(rows, 'stage_requirements', 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(reorderIds(rows, 'stage_requirements', 'c', 1)).toBeNull();
    expect(reorderIds([{ key: 'k1', sort: 1 }, { key: 'k2', sort: 2 }], 'journey_stages', 'k1', 1)).toEqual(['k2', 'k1']);
  });

  it('البنود تُنظَّف من الترقيم والشرطات', () => {
    expect(lines('1. أول\n- ثانٍ\n\n•  ثالث')).toEqual(['أول', 'ثانٍ', 'ثالث']);
  });
});

// admin-program-7 (مراجعة الجولة ب-1): نموذج تحرير الخلية كان يقول «الوصف للمشارك» والشاشة نفسها تقول إن الخلايا لا تصل المشارك
describe('خلايا المصفوفة في المنهجية: نص صادق', () => {
  it('حقل وصف الخلية لا يَعِد بظهوره للمشارك', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'methodology.js'), 'utf8');
    expect(src).not.toContain("'الوصف للمشارك'");
    expect(src).toContain('لا يظهر للمشارك');
  });
});

// P2: أسماء مقروءة في نموذج الدفعة. خيارات البنود المخفية وتسميات حقول التنفيذ بلا رموز خام ولا رمز داخلي،
// والعنوانان المتطابقان يتميزان بالمرحلة
describe('نموذج الدفعة: أسماء البنود كما يقرؤها المدير', async () => {
  const { cohortFields, hiddenHelp, reqLabel } = await import('./methodology.js');
  const reqs = [
    { code: 'O-SESS', title_ar: 'جلسات التوجيه ({sessions:O-SESS})', kind: 'coaching', active: true, stage_key: 's2', stage_title_ar: 'التطبيق', config: { sessions_required: 4, mode: 'online' } },
    { code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', kind: 'workshop', active: true, stage_key: 's1', stage_title_ar: 'التأسيس', required: true, config: { sessions_required: 3 } },
    { code: 'R-A', title_ar: 'تأمل', kind: 'check', active: true, stage_key: 's1', stage_title_ar: 'التأسيس', required: false },
    { code: 'R-B', title_ar: 'تأمل', kind: 'check', active: true, stage_key: 's2', stage_title_ar: 'التطبيق', required: false },
    { code: 'E-MGR', title_ar: 'إفادة المدير', kind: 'check', active: true, stage_key: 's2', stage_title_ar: 'التطبيق', required: false },
  ];
  const fields = cohortFields({ reqs });
  const texts = fields.flatMap((f) => [f.label, ...Object.values(f.options || {})]).map(String);
  it('لا نمط {x:y} ولا رمز داخلي في المخرجات', () => {
    expect(texts.filter((t) => /\{[a-z_]+(:[A-Z0-9-]+)?\}/.test(t))).toEqual([]);
    expect(texts.filter((t) => /O-SESS|T-ATTEND|R-A|R-B/.test(t))).toEqual([]);
  });
  it('{sessions:O-SESS} يصير «أربع جلسات»، والمرحلة بين قوسين', () => {
    expect(reqLabel(reqs[0], reqs)).toBe('جلسات التوجيه (أربع جلسات) (التطبيق)');
    const hidden = fields.find((f) => f.name === 'hidden_requirements');
    expect(hidden.options['O-SESS']).toBe('جلسات التوجيه (أربع جلسات) (التطبيق)');
    expect(fields.find((f) => f.name === 'd:O-SESS:mode').label).toBe('جلسات التوجيه (أربع جلسات) (التطبيق): طريقة الجلسة');
  });
  it('عنوانان متطابقان يتميزان بالمرحلة', () => {
    const hidden = fields.find((f) => f.name === 'hidden_requirements');
    expect(hidden.options['R-A']).toBe('تأمل (التأسيس)');
    expect(hidden.options['R-B']).toBe('تأمل (التطبيق)');
  });
  it('الإخفاء الكاسر يُنبَّه إليه قبل الحفظ، ورمز تعتمد عليه ميزة يُحذَّر منه', () => {
    expect(hiddenHelp({ hidden_requirements: ['T-ATTEND'] }, reqs)).toContain('لن يُحفظ: إخفاء هذه البنود يترك مرحلة «التأسيس»');
    expect(hiddenHelp({ hidden_requirements: ['R-A'] }, reqs)).not.toContain('لن يُحفظ');
    expect(hiddenHelp({ hidden_requirements: ['E-MGR'] }, reqs)).toContain('تنبيه: «إفادة المدير (التطبيق)» يكتمل بتقدير المدير المباشر');
  });
});
