import { describe, it, expect } from 'vitest';
import { csv, filterRows, sortRows, stageOf, stageOptions, NOT_STARTED } from './coord.js';

const rows = [
  { full_name: 'سارة', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'البداية', progress: 40, last_login_at: '2026-10-20' },
  { full_name: 'عمر', job_title: 'مهندس', status: 'pending_approval', track: null, progress: 10, last_login_at: '2026-10-22' },
];

describe('لوحة المنسق', () => {
  it('تصفي بالبحث والحالة والمسار', () => {
    expect(filterRows(rows, { q: 'مهندس' })).toHaveLength(1);
    expect(filterRows(rows, { track: 'M1I1L2' })).toHaveLength(1);
  });
  // org-2: المرشّح كان على الحالة الإدارية والعمود يعرض مرحلة الرحلة، فاختيار «في البرنامج» أظهر «التأهيل» و«التدريب»
  it('مرشّح المرحلة يطابق ما يعرضه عمود المرحلة، ويجمع من لم يكمل القياس المبدئي', () => {
    const ps = [
      { full_name: 'أ', status: 'enrolled', stage: 'التدريب' },
      { full_name: 'ب', status: 'enrolled', stage: 'التأهيل' },
      { full_name: 'ج', status: 'registered', stage: 'التأهيل' },
      { full_name: 'د', status: 'profiled', stage: 'الملف الشخصي' },
      { full_name: 'هـ', status: 'assessing', stage: 'التأهيل' },
      { full_name: 'و', status: 'withdrawn', stage: null },
    ];
    expect(stageOptions(ps, ['الملف الشخصي', 'التأهيل', 'التدريب'])).toEqual(['الملف الشخصي', 'التأهيل', 'التدريب', 'منسحب']);
    for (const t of stageOptions(ps)) expect(filterRows(ps, { stage: t }).every((p) => stageOf(p) === t)).toBe(true);
    expect(filterRows(ps, { stage: 'التأهيل' }).map((p) => p.full_name)).toEqual(['ب', 'ج', 'هـ']);
    expect(filterRows(ps, { stage: NOT_STARTED }).map((p) => p.full_name)).toEqual(['ج', 'د', 'هـ']);
    expect(filterRows(ps, { stage: 'منسحب' }).map((p) => p.full_name)).toEqual(['و']);
  });
  it('ترتب بالإنجاز وبآخر نشاط', () => {
    expect(sortRows(rows, 'progress')[0].full_name).toBe('سارة');
    expect(sortRows(rows, 'recent')[0].full_name).toBe('عمر');
  });
  it('csv بعلامة BOM', () => {
    expect(csv(['a'], [['b']]).charCodeAt(0)).toBe(0xfeff);
  });
});
