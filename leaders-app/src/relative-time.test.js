// الزمن النسبي (تصور موائمة سفراء والزمن النسبي، المرحلة 1): الخلية تُقرأ تاريخًا أو «الأسبوع N»،
// وما كُتب بالتواريخ يبقى بالنتيجة نفسها تمامًا (لا أثر على من يعمل حاليًا).
import { describe, expect, it } from 'vitest';
import { parseDate, parseWhen, weekOf, whenAr, VIRTUAL_ANCHOR } from '../../supabase/functions/leaders-api/capstone.js';
import { activitiesOf, scheduleOf } from '../../supabase/functions/leaders-api/schedule.js';
import { trackingPlan } from '../../supabase/functions/leaders-api/tracking.js';
import { launchPlan } from '../../supabase/functions/leaders-api/business-case.js';

const D = 864e5;
const A = Date.UTC(2027, 0, 4);

describe('قراءة الخلية الزمنية', () => {
  it('الأسبوع بصيغه، بالأرقام العربية واللاتينية', () => {
    for (const v of ['الأسبوع 3', 'أسبوع 3', 'اسبوع3', 'الأسبوع ٣', 'W3', 'week 3']) expect(weekOf(v), v).toBe(3);
    for (const v of ['3', 'الأسبوع 0', 'الشهر 3', '', null, '2027-01-04']) expect(weekOf(v), String(v)).toBe(null);
  });
  it('التاريخ يُقرأ كما كان، بمرساة أو بلاها', () => {
    for (const v of ['2027-03-15', '15/3/2027']) {
      expect(parseWhen(v)).toBe(parseDate(v));
      expect(parseWhen(v, { anchor: A, virtual: true })).toBe(parseDate(v));
    }
  });
  it('الأسبوع من المرساة: أول يومه بداية، وآخره نهاية', () => {
    expect(parseWhen('الأسبوع 1', { anchor: A })).toBe(A);
    expect(parseWhen('الأسبوع 3', { anchor: A })).toBe(A + 14 * D);
    expect(parseWhen('الأسبوع 3', { anchor: A, edge: 'end' })).toBe(A + 20 * D);
  });
  it('بلا مرساة لا يُختلق تاريخ، إلا افتراضيًا للمقارنة ويُعرض أسبوعًا', () => {
    expect(parseWhen('الأسبوع 2')).toBe(null);
    const v = parseWhen('الأسبوع 2', { virtual: true });
    expect(v).toBe(VIRTUAL_ANCHOR + 7 * D);
    expect(whenAr(v)).toBe('الأسبوع 2');
  });
});

describe('الجدول بالأسابيع', () => {
  const cols = ['الرمز', 'النشاط أو الحزمة', 'البداية', 'النهاية', 'يعتمد على'];
  it('المدة والاعتماديات تعمل بلا تاريخ بدء', () => {
    const rows = [['A1', 'تحضير', 'الأسبوع 1', 'الأسبوع 1', ''], ['A2', 'تنفيذ', 'الأسبوع 2', 'الأسبوع 3', 'A1']];
    const acts = activitiesOf(cols, rows);
    expect(acts.map((a) => a.days)).toEqual([7, 14]);
    const sc = scheduleOf(cols, rows);
    expect(sc.broken).toEqual([]);
    expect(sc.analysis.finish).toBe(21);
  });
  it('الجدول المؤرخ: النتيجة نفسها بمرساة أو بلاها', () => {
    const rows = [['A1', 'تحضير', '2027-01-04', '2027-01-10', ''], ['A2', 'تنفيذ', '2027-01-08', '2027-01-20', 'A1']];
    expect(scheduleOf(cols, rows, { anchor: A })).toEqual(scheduleOf(cols, rows));
    expect(scheduleOf(cols, rows).broken.map((b) => b.code)).toEqual(['A2']);
  });
});

describe('المتابعة', () => {
  const snap = (due, start) => ({ meta: { start }, sections: [{ key: 'milestone-register', fields: [{ key: 'milestones', type: 'table', columns: ['المعلم', 'التاريخ'], value: [['إطلاق', due]] }] }] });
  it('التاريخ المكتوب لا يتغير', () => {
    expect(trackingPlan(snap('2027-02-01', null), '2027-01-01T08:00:00Z').milestones[0].due_ts).toBe(Date.UTC(2027, 1, 1));
    expect(trackingPlan(snap('2027-02-01', null)).milestones[0].due_ts).toBe(Date.UTC(2027, 1, 1));
  });
  it('الأسبوع من تاريخ البدء، وإلا من يوم الاعتماد', () => {
    expect(trackingPlan(snap('الأسبوع 2', '2027-01-04'), '2026-12-01T00:00:00Z').milestones[0].due_ts).toBe(A + 13 * D);
    expect(trackingPlan(snap('الأسبوع 2', null), '2027-01-04T09:00:00Z').milestones[0].due_ts).toBe(A + 13 * D);
    expect(trackingPlan(snap('الأسبوع 2', null)).milestones[0].due_ts).toBe(null);
  });
});

describe('خطة الانطلاق', () => {
  const doc = (start, when) => ({ sections: [
    { key: 'initiative-charter', fields: [{ key: 'start', type: 'text', value: start }] },
    { key: 'schedule', fields: [{ key: 'activities', type: 'table', columns: ['الرمز', 'النشاط أو الحزمة', 'البداية', 'النهاية'], value: [['A1', 'تحضير', when, when]] }] },
  ] });
  it('بلا تاريخ بدء لا يُختلق تاريخ للأسبوع', () => {
    const p = launchPlan(doc('', 'الأسبوع 2'));
    expect(JSON.stringify(p)).not.toContain('2000');
  });
});


// نسبة الجاهزية خارج المنصة (قرار المالك 2026-11-24، ب + ج)
import { publicDoc, cleanShareInput, ownerView } from '../../supabase/functions/leaders-api/share.js';
import { capstoneReport, withoutReadiness } from '../../src/lib/brand/capstone.js';
import { VISIBILITY } from '../../supabase/functions/leaders-api/visibility.js';

describe('الجاهزية في الوثيقة المشاركة', () => {
  const doc = { meta: { readiness: 20, initiative: 'خطتي' }, sections: [] };
  it('مخفية في الرابط افتراضيًا، وظاهرة بإذن صاحبه', () => {
    expect(publicDoc(doc, {}).meta.readiness).toBe(null);
    expect(publicDoc(doc, { show_readiness: true }).meta.readiness).toBe(20);
  });
  it('حجب الإدارة يغلب اختيار صاحب الرابط', () => {
    expect(publicDoc(doc, { show_readiness: true }, { readiness: false }).meta.readiness).toBe(null);
    expect(VISIBILITY.par_share_readiness.default).toBe(true);
  });
  it('الرابط الجديد بلا جاهزية ما لم تُطلب، والرابط القائم يُقرأ بلا جاهزية', () => {
    expect(cleanShareInput({ label: 'مديري', days: 30 }).show_readiness).toBe(false);
    expect(cleanShareInput({ label: 'مديري', days: 30, show_readiness: true }).show_readiness).toBe(true);
    expect(ownerView({ id: 'x', expires_at: new Date(Date.now() + 864e5).toISOString() }).show_readiness).toBe(false);
  });
  it('التقرير لا يعرض «الجاهزية» إن خلت منها الوثيقة، وwithoutReadiness تحذفها', () => {
    expect(withoutReadiness(doc).meta.readiness).toBe(null);
    expect(doc.meta.readiness).toBe(20);
  });
  void capstoneReport;
});

// بطاقة المبادرة من سفراء (المرحلة 3)، والمدة بلا تاريخ بدء
import { charterData, durationAr } from '../../supabase/functions/leaders-api/business-case.js';
describe('الميثاق: المستفيدون والوصول، والمدة', () => {
  const card = (ans) => ({ sections: [{ key: 'initiative-charter', fields: Object.entries(ans).map(([key, value]) => ({ key, type: 'text', value })) }] });
  it('المدة بلا تاريخ بدء تُقرأ «حتى»', () => {
    expect(durationAr('', 'الأسبوع 12')).toContain('حتى');
    expect(durationAr('2027-01-03', '2027-03-31')).toContain('إلى');
    expect(durationAr('', '')).toBe(null);
  });
  it('المستفيدون والوصول بعد المشكلة، ويغيبان إن لم يُكتبا', () => {
    const rows = charterData(card({ title: 'خطتي', problem: 'تنظيم المذاكرة', beneficiaries: '20 طالبًا', reach: 'عبر المدرسة' })).rows.map((r) => r[0]);
    expect(rows.slice(1, 4)).toEqual(['المشكلة أو الفرصة', 'المستفيدون', 'الوصول إليهم واختيارهم']);
    expect(charterData(card({ title: 'خطتي' })).rows.map((r) => r[0])).not.toContain('المستفيدون');
  });
});
