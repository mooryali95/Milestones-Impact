// محرك الجدول الزمني: صيغة العلاقات، والمسار الحرج، والمخالفات (supabase/functions/leaders-api/schedule.js)
import { describe, expect, it } from 'vitest';
import { activitiesOf, cpm, depAr, formatDeps, parseDeps, scheduleOf, violations } from '../../supabase/functions/leaders-api/schedule.js';

const COLS = ['الرمز', 'النشاط أو الحزمة', 'البداية', 'النهاية', 'يعتمد على'];

describe('صيغة العلاقات في عمود «يعتمد على»', () => {
  it('ما كُتب قبلها يبقى صالحًا: رموز بفواصل أو مسافات تعني FS', () => {
    expect(parseDeps('A1، A2')).toEqual([{ code: 'A1', type: 'FS', lag: 0 }, { code: 'A2', type: 'FS', lag: 0 }]);
    expect(parseDeps('A3, A4')).toHaveLength(2);
    expect(parseDeps('')).toEqual([]);
  });
  it('النوع والتأخير والتقديم، ملتصقة أو منفصلة، وبأرقام عربية', () => {
    expect(parseDeps('A2 SS+3، A3 FF، A4 SF-1')).toEqual([{ code: 'A2', type: 'SS', lag: 3 }, { code: 'A3', type: 'FF', lag: 0 }, { code: 'A4', type: 'SF', lag: -1 }]);
    expect(parseDeps('a2ss+3')).toEqual([{ code: 'A2', type: 'SS', lag: 3 }]);
    expect(parseDeps('A2 SS +٣ أيام')).toEqual([{ code: 'A2', type: 'SS', lag: 3 }]);
    expect(parseDeps('1.2 FS+2')).toEqual([{ code: '1.2', type: 'FS', lag: 2 }]);
  });
  it('الكتابة والقراءة تتطابقان، والوصف عربي', () => {
    const d = [{ code: 'A1', type: 'FS', lag: 0 }, { code: 'A2', type: 'SS', lag: 3 }, { code: 'A3', type: 'FS', lag: 2 }];
    expect(formatDeps(d)).toBe('A1، A2 SS+3، A3 FS+2');
    expect(parseDeps(formatDeps(d))).toEqual(d);
    expect(depAr(d[1])).toBe('يبدأ مع بدء A2 بعد 3 أيام');
  });
});

describe('المسار الحرج (CPM)', () => {
  const rows = [
    ['A1', 'تحليل', '2026-01-01', '2026-01-10', ''],
    ['A2', 'تصميم', '2026-01-11', '2026-01-20', 'A1'],
    ['A3', 'تدريب', '2026-01-11', '2026-01-14', 'A1'],
    ['A4', 'إطلاق', '2026-01-21', '2026-01-25', 'A2، A3'],
  ];
  it('الأطول حرج وفائضه صفر، والأقصر له فائض', () => {
    const r = cpm(activitiesOf(COLS, rows));
    expect(r.finish).toBe(25);
    expect(r.critical).toEqual(['A1', 'A2', 'A4']);
    expect(r.nodes.A3).toMatchObject({ es: 10, ef: 14, float: 6, critical: false });
  });
  it('SS وFF وSF مع التأخير', () => {
    const r = cpm(activitiesOf(COLS, [
      ['A', 'أ', '2026-01-01', '2026-01-10', ''],
      ['B', 'ب', '2026-01-03', '2026-01-08', 'A SS+2'],
      ['C', 'ج', '2026-01-05', '2026-01-12', 'A FF+2'],
      ['D', 'د', '2026-01-01', '2026-01-03', 'A SF+3'],
    ]));
    expect(r.nodes.B.es).toBe(2);
    expect(r.nodes.C.ef).toBe(12);
    expect(r.nodes.D.ef).toBe(3);
    expect(r.critical).toContain('C');
  });
  it('الحلقة تُكشف ولا يُحسب معها مسار', () => {
    const r = cpm(activitiesOf(COLS, [['A', 'أ', '2026-01-01', '2026-01-02', 'B'], ['B', 'ب', '2026-01-03', '2026-01-04', 'A']]));
    expect(r.cycle.sort()).toEqual(['A', 'B']);
  });
});

describe('مخالفات التواريخ والرموز المجهولة', () => {
  it('نشاط يبدأ قبل انتهاء سابقه في FS مخالفة، وفي SS لا', () => {
    const acts = activitiesOf(COLS, [['A', 'أ', '2026-01-01', '2026-01-10', ''], ['B', 'ب', '2026-01-05', '2026-01-12', 'A'], ['C', 'ج', '2026-01-05', '2026-01-12', 'A SS']]);
    expect(violations(acts).map((v) => v.code)).toEqual(['B']);
  });
  it('رمز يعتمد عليه ولا نشاط له ولا حزمة', () => {
    expect(scheduleOf(COLS, [['A', 'أ', '2026-01-01', '2026-01-02', 'Z9 SS'], ['B', 'ب', '2026-01-03', '2026-01-04', '1.1']], { extraCodes: ['1.1'] }).orphan).toEqual(['Z9']);
  });
});
