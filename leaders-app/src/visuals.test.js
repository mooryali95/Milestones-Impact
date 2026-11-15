// اللوحات المرئية (src/lib/brand/visuals.js): كل لوحة تُرسم من المثالين المحلولين كاملة، وما ينقص يُقال، والنص مهرَّب
import { describe, expect, it } from 'vitest';
import * as V from '../../src/lib/brand/visuals.js';
import { RISK_HIGH } from '../../supabase/functions/leaders-api/capstone.js';
import { BRAND } from '../../shared/js/brand.js';
import { EXAMPLES, exampleDoc } from './guide.js';

describe('كل لوحة تكتمل من المبادرة المحلولة', () => {
  for (const ex of EXAMPLES) {
    it(ex.sector, () => {
      const doc = exampleDoc(ex);
      const m = V.scheduleModel(doc);
      const boards = V.boardsFor(doc);
      expect(boards.map((b) => b.key)).toEqual(['gantt', 'network', 'wbs', 'roadmap', 'cost', 'risk', 'stakeholders', 'change', 'benefits', 'raci']);
      for (const b of boards) {
        for (const p of b.parts(doc, m)) {
          expect(p.svg, b.key).toMatch(/^<svg [^>]*role="img" aria-label="[^"]+"/);
          // منحنى الإنفاق وحده قد يذكر بندًا لم يرتبط بنشاط (إدارة المبادرة)، ومصفوفة المسؤوليات تكشف ما يخالف قاعدتها
          if (!['cost', 'raci'].includes(b.key)) expect(p.missing, b.key).toEqual([]);
        }
      }
      expect(m.analysis.cycle).toBeNull();
      expect(m.analysis.critical.length).toBeGreaterThan(2);
      expect(Object.keys(m.risks).length).toBeGreaterThan(0);
    });
  }
});

describe('ما ينقص يُقال، ولا رسم ناقص', () => {
  const empty = { meta: {}, sections: [{ key: 'schedule', fields: [{ key: 'activities', columns: ['الرمز', 'النشاط', 'البداية', 'النهاية', 'يعتمد على'], value: [['A1', 'نشاط', '', '', '']] }] }] };
  it('أنشطة بلا تواريخ: لا جانت ولا شبكة، والسبب مكتوب', () => {
    const m = V.scheduleModel(empty);
    expect(V.ganttSvg(m)).toMatchObject({ svg: '', missing: expect.arrayContaining(['اكتب تاريخي البداية والنهاية لكل نشاط']) });
    expect(V.networkSvg(m).svg).toBe('');
    expect(V.wbsChartSvg(empty).missing[0]).toMatch(/حزم العمل/);
    expect(V.boardsFor(empty).map((b) => b.key)).toEqual(['gantt', 'network']);
  });
  it('الحلقة تمنع الشبكة وتسمّي أنشطتها', () => {
    const d = { sections: [{ key: 'schedule', fields: [{ key: 'activities', columns: ['الرمز', 'النشاط', 'البداية', 'النهاية', 'يعتمد على'], value: [['A', 'أ', '2026-01-01', '2026-01-02', 'B'], ['B', 'ب', '2026-01-03', '2026-01-04', 'A']] }] }] };
    expect(V.networkSvg(V.scheduleModel(d)).missing[0]).toMatch(/احذف الحلقة بين/);
  });
});

describe('أمان الرسم ومصادره', () => {
  it('نص المشارك مهرَّب: لا وسم يخرج إلى الصفحة', () => {
    const d = { sections: [{ key: 'schedule', fields: [{ key: 'activities', columns: ['الرمز', 'النشاط', 'البداية', 'النهاية', 'يعتمد على'], value: [['A1', '<img src=x onerror=alert(1)>', '2026-01-01', '2026-01-05', '']] }] }] };
    const svg = V.ganttSvg(V.scheduleModel(d)).svg;
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img');
  });
  it('الألوان من الهوية، وحد الخطر العالي من مصدره', () => {
    for (const c of Object.values(V.VC)) expect(Object.values(BRAND)).toContain(c);
    expect(V.riskLegend()).toContain(`عالٍ (${RISK_HIGH} فأكثر)`);
  });
  it('المنافع بعد الاعتماد: الفعلي من المتابعة على خطه', () => {
    const doc = { ...exampleDoc(EXAMPLES[1]), tracking: { state: { benefits: [{ title: 'انتظار أقصر للموعد الأول', value: '19', realization: 0.75 }] } } };
    const b = V.benefitsSvg(doc);
    expect(b.svg).toContain('الفعلي 19 (تحقق 75%)');
  });
});
