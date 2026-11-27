// ضبط الفراغات (قرار المالك 2026-11-27): باب حالة العمل يكمل في الصفحة نفسها إن اتسع ما بقي منها، والعنوان مع أول فقرة،
// وما يبقى أسفل الصفحة تملؤه زخرفة الهوية بشفافية منخفضة؛ والكلمة المفردة في خلية الجدول لا تنكسر
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPORT_PRESETS, finalDocument, SOFT_KEEP_MM, IN_STYLE } from './institutional.js';
import { table, oneWord, mmPx } from './doc.js';
import { columnWidths } from './capstone.js';
import { ORNAMENT, PAGE, pageGap } from './pdf.js';

const FULL = JSON.parse(readFileSync('e2e/initiative-doc-fixture.json', 'utf8'));
const CONTENT_H = PAGE.h - PAGE.top - PAGE.bottom;

describe('الأبواب تنساب ولا تفرض صفحة جديدة', () => {
  const html = finalDocument(structuredClone(FULL), EXPORT_PRESETS.send).body;
  it('لا باب بكسر إجباري إلا الاعتماد، والبقية بحاجز واسع', () => {
    const np = [...html.matchAll(/<section class="in-sec np" id="([^"]+)"/g)].map((m) => m[1]);
    expect(np).toEqual(['in-approval']);
    expect((html.match(/class="in-keep wide"/g) || []).length).toBeGreaterThan(3);
  });
  it('الحاجز نحو ثلث المتن، ومعرف في CSS بالقيمة نفسها', () => {
    expect(mmPx(SOFT_KEEP_MM) / CONTENT_H).toBeGreaterThan(0.28);
    expect(mmPx(SOFT_KEEP_MM) / CONTENT_H).toBeLessThan(0.45);
    expect(IN_STYLE).toContain(`.in-keep.wide { height: ${SOFT_KEEP_MM}mm; margin-bottom: -${SOFT_KEEP_MM}mm; }`);
  });
});

describe('زخرفة الفراغ', () => {
  it('لا زخرفة على الغلاف ولا في صفحة ممتلئة', () => {
    expect(pageGap({ start: 0, end: 200 }, 0).zone).toBeNull();
    expect(pageGap({ start: 0, end: CONTENT_H - 20 }, 3).zone).toBeNull();
  });
  it('فراغ فوق الحد: منطقة تبدأ بعد المتن بفاصل وتنتهي قبل التذييل', () => {
    const g = pageGap({ start: 1000, end: 1000 + CONTENT_H * 0.7 }, 4);
    expect(g.ratio).toBeCloseTo(0.3, 2);
    expect(g.zone.y0).toBeCloseTo(PAGE.top + CONTENT_H * 0.7 + ORNAMENT.pad, 3);
    expect(g.zone.y1).toBeLessThanOrEqual(PAGE.top + CONTENT_H);
  });
  it('صفحة بسطور قليلة: الزخرفة لا تتجاوز سقفها من المتن وتثبت فوق التذييل', () => {
    const g = pageGap({ start: 1000, end: 1000 + CONTENT_H * 0.15 }, 4);
    expect(g.ratio).toBeCloseTo(0.85, 2);
    // فراغ فوق ORNAMENT.big: الزخرفة تملأ الفراغ إلا شريطًا رقيقًا تحت المتن، فلا يبقى شريط أبيض بين النص والنقش
    expect(g.zone.y1 - g.zone.y0).toBeLessThanOrEqual(CONTENT_H * (g.ratio - 0.12) + 0.5);
    expect(g.zone.y1 - g.zone.y0).toBeGreaterThan(CONTENT_H * ORNAMENT.capBig - 0.5);
    expect(g.zone.y0 - (PAGE.top + CONTENT_H * 0.15)).toBeLessThanOrEqual(CONTENT_H * 0.12 + 0.5);
    expect(g.zone.y0).toBeGreaterThan(PAGE.top + CONTENT_H * 0.15 + ORNAMENT.pad);
  });
  it('فراغ متوسط (دون big): الزخرفة لا تتجاوز سقفها cap', () => {
    const g = pageGap({ start: 0, end: CONTENT_H * 0.5 }, 3);
    expect(g.zone.y1 - g.zone.y0).toBeLessThanOrEqual(CONTENT_H * ORNAMENT.cap + 0.5);
  });
  it('رأس الجدول المكرر يُحسب من المستعمل', () => {
    expect(pageGap({ start: 0, end: CONTENT_H * 0.5 }, 2, { headH: CONTENT_H * 0.4 }).zone).toBeNull();
  });
  it('شفافية منخفضة لا تشتت القراءة', () => {
    expect(ORNAMENT.lattice).toBeLessThanOrEqual(0.1);
    expect(ORNAMENT.mark).toBeLessThanOrEqual(0.6);
  });
});

describe('الكلمة المفردة في الخلية', () => {
  it('شهري لا تنكسر، والنص متعدد الكلمات ينساب', () => {
    expect(oneWord('شهري')).toBe(true);
    expect(oneWord('اجتماع شهري')).toBe(false);
    const h = table([{ label: 'المؤشر' }, { label: 'التكرار' }], [['رضا المستفيدين عن الخدمة', 'شهري']]);
    expect(h).toContain('<td class="w1">شهري</td>');
    expect(h).toContain('<td>رضا المستفيدين عن الخدمة</td>');
  });
  it('عرض عمود الكلمة المفردة يتسع لها مع هامش الخلية في الجدول العريض', () => {
    const cols = ['المنفعة', 'المؤشر وطريقة القياس', 'خط الأساس', 'المستهدف', 'المالك بعد التسليم', 'معلم القيمة', 'تاريخ التحقق', 'تكرار القياس'];
    const row = ['تقليص زمن الترخيص المهني من أيام إلى يوم واحد', 'متوسط زمن الإصدار من نظام التراخيص بعد الربط', '5 أيام', 'يوم واحد', 'مدير إدارة الخدمات', 'إطلاق الخدمة', '2026-12-31', 'شهري'];
    const w = columnWidths(cols, [row, row]).map(parseFloat);
    // نحو 170 مم عرض المتن: «شهري» بخط 9pt تحتاج نحو 9 مم مع هامش الخلية
    expect((w[7] / 100) * 170).toBeGreaterThan(9);
  });
});
