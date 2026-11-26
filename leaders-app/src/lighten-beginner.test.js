// تصور تخفيف وثيقة المبادرة للتأسيسي (docs/content/2026-11-26-تصور-تخفيف-المبادرة-للتأسيسي-v1.md)، اعتمده المالك
import { describe, expect, it } from 'vitest';
import { cleanDoc, institutionalGate } from '../../supabase/functions/leaders-api/doc-quality.js';
import { scheduleOf } from '../../supabase/functions/leaders-api/schedule.js';
import { capstoneChecks } from '../../supabase/functions/leaders-api/capstone.js';
import { workMinutes, WORK_MINUTES } from '../../supabase/functions/leaders-api/logic.js';
import { spineSummary } from '../../supabase/content/initiative-guide/v1/spine.js';

const sec = (key, fields) => ({ key, fields });
const f = (key, value, extra = {}) => ({ key, label: key, type: Array.isArray(value) ? 'table' : 'textarea', value, ...extra });
const longText = 'نص كامل له معنى واضح يصف المطلوب بجملة تامة مفهومة';
const fullDoc = (charterExtra) => ({
  meta: {}, summary: '',
  sections: [
    sec('initiative-charter', [f('problem', longText), f('objective', longText), f('deliverables', [['مخرج أول', 'معيار', 'الأسبوع 3']]), ...charterExtra]),
    sec('options-analysis', [f('recommendation', longText)]),
    sec('theory-of-change', [f('impact', longText)]),
    sec('benefits-register', [f('benefits', [['منفعة', 'مؤشر', '10', '20']])]),
    sec('evidence-plan', [f('success_signal', longText)]),
    sec('milestone-register', [f('milestones', [['معلم', '', 'الأسبوع 4']])]),
    sec('cost-plan', [f('items', [['1', 'كتب', '', '', '500']])]),
    sec('raid', [f('items', [['R1', 'خطر', 'غياب المتطوعين', '', '', '', 'قائمة احتياط']])]),
    sec('stakeholder-map', [f('stakeholders', [['المدرسة', '', 'الطلاب', '', 'اجتماع']])]),
    sec('change-sustain', [f('sustain', longText)]),
  ],
});

describe('المرحلة 1: فحص الإصدار يتبع المطلوب للمستوى', () => {
  it('المستفيدون والراعي اختياريان للتأسيسي: لا يحجبان إصدار بطاقة المبادرة', () => {
    const d = fullDoc([f('beneficiaries', '', { required: false }), { key: 'sponsor', label: 'الراعي', type: 'text', value: '', required: false }]);
    expect(institutionalGate(cleanDoc(d, { strict: true }).doc)).toEqual({ ok: true, missing: [] });
  });
  it('والمطلوب منهما (أو لقطة أقدم بلا required) يحجب كما كان', () => {
    const d = fullDoc([f('beneficiaries', ''), { key: 'sponsor', label: 'الراعي', type: 'text', value: '' }]);
    expect(institutionalGate(cleanDoc(d, { strict: true }).doc).missing.map((m) => m.n)).toEqual([1, 9]);
  });
});

describe('المرحلة 1: الجدول بالأسابيع بلا تنبيهات زائفة', () => {
  const cols = ['الرمز', 'النشاط أو الحزمة', 'البداية', 'النهاية', 'يعتمد على'];
  it('«بعد انتهاء» يسمح بالبدء في أسبوع انتهاء السابق، ولا تتضخم المدة', () => {
    const rows = [['A1', 'تحضير', 'الأسبوع 1', 'الأسبوع 1', ''], ['A2', 'دعوة', 'الأسبوع 1', 'الأسبوع 2', 'A1'], ['A3', 'لقاءات', 'الأسبوع 2', 'الأسبوع 11', 'A2'], ['A4', 'ختام', 'الأسبوع 12', 'الأسبوع 12', 'A3']];
    const sc = scheduleOf(cols, rows);
    expect(sc.broken).toEqual([]);
    expect(Math.ceil(sc.analysis.finish / 7)).toBeLessThanOrEqual(12);
  });
  it('والجدول بالتواريخ كما كان: البدء قبل انتهاء السابق مخالفة', () => {
    const rows = [['A1', 'أ', '2026-03-01', '2026-03-05', ''], ['A2', 'ب', '2026-03-05', '2026-03-09', 'A1']];
    expect(scheduleOf(cols, rows).broken.map((b) => b.code)).toEqual(['A2']);
  });
  it('رسالة المسار الحرج بالأسابيع حين يُكتب الجدول بالأسابيع', () => {
    const models = { 'initiative-charter': { fields: [] }, schedule: { fields: [{ key: 'activities', type: 'table', columns: cols }] } };
    const rows = [['A1', 'أ', 'الأسبوع 1', 'الأسبوع 8', ''], ['A2', 'ب', 'الأسبوع 8', 'الأسبوع 14', 'A1']];
    const c = capstoneChecks({ scope: 'project', models, answers: { 'initiative-charter': { end: 'الأسبوع 12' }, schedule: { activities: rows } } }).find((x) => x.key === 'critical-window');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('14 أسبوعًا');
    expect(c.detail).not.toContain('يومًا');
  });
});

describe('المرحلة 1: تقدير زمن واحد من الحقول الظاهرة', () => {
  it('الجدول بأعمدته المطلوبة × صفوفه، والاختياري والمربوط لا يُحسبان', () => {
    const fields = [{ key: 'a', type: 'textarea' }, { key: 'b', type: 'text', required: false }, { key: 'p', type: 'text', bind: 'initiative' },
      { key: 't', type: 'table', columns: ['1', '2', '3'], min_rows: 2 }];
    expect(workMinutes(fields)).toBe(Math.round((WORK_MINUTES.textarea + 6 * WORK_MINUTES.cell) * WORK_MINUTES.review));
  });
  it('خط الوثيقة يقرأ دقائق الفصل من الخادم', () => {
    const s = (id, minutes) => ({ id, key: id, title: id, level: 'beginner', minutes, complete: false });
    expect(spineSummary([s('a', 90), s('b', 90)]).hours).toBe(3);
  });
});

import { canSubmit, closingState, CLOSING_AR, programEnd } from '../../supabase/functions/leaders-api/capstone.js';
describe('المرحلة 5: الفصلان الختاميان للتأسيسي', () => {
  const day = (s) => Date.parse(`${s}T00:00:00Z`);
  it('نهاية البرنامج: الدفعة أولًا، ثم انتهاء المبادرة تاريخًا، ثم أسبوعًا من البدء أو من أول اعتماد', () => {
    expect(programEnd({ ends_on: '2027-03-31', end: 'الأسبوع 12', since: '2026-01-01T00:00:00Z' })).toBe(day('2027-03-31'));
    expect(programEnd({ end: '2027-02-28' })).toBe(day('2027-02-28'));
    expect(programEnd({ start: '2027-01-03', end: 'الأسبوع 12' })).toBe(day('2027-03-27'));
    expect(programEnd({ end: 'الأسبوع 12', since: '2027-01-03T00:00:00Z' })).toBe(day('2027-03-27'));
    expect(programEnd({ end: 'الأسبوع 12' })).toBeNull();
  });
  it('مقفل للتأسيسي حتى آخر أسبوعين، ثم يُفتح؛ وغير التأسيسي والفصول الأخرى كما هي', () => {
    const end = day('2027-03-27');
    expect(closingState('impact-report', 'beginner', end, day('2027-03-01'))).toEqual({ deferred: true, opens_at: '2027-03-14' });
    expect(closingState('transformation-story', 'beginner', end, day('2027-03-14')).deferred).toBe(false);
    expect(closingState('impact-report', 'intermediate', end, day('2027-03-01')).deferred).toBe(false);
    expect(closingState('raid', 'beginner', end, day('2027-03-01')).deferred).toBe(false);
    expect(closingState('impact-report', 'beginner', null).deferred).toBe(false);
    expect(CLOSING_AR).toBe('يُفتح في الأسابيع الأخيرة');
  });
  it('الفصل المؤجل الناقص لا يمنع التقديم الأول', () => {
    const base = { status: 'draft', scope: 'project', initiative: 'م', readiness: 90, checks: [] };
    expect(canSubmit({ ...base, sections: [{ title: 'أ', complete: true }, { title: 'تقرير الأثر', complete: false, deferred: true }] })).toEqual({ ok: true });
    expect(canSubmit({ ...base, sections: [{ title: 'تقرير الأثر', complete: false }] }).ok).toBe(false);
  });
});
