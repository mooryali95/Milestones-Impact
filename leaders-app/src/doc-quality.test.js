import { describe, expect, it } from 'vitest';
import { cleanDoc, cleanRows, gibberishToken, institutionalGate, isGibberish, isPlaceholder, reasonOf, validDate, validValue } from '../../supabase/functions/leaders-api/doc-quality.js';

// سلاسل من وثيقة يحيى (مستوى تأسيسي) كما وصلت المالك، ونظائرها
const YAHYA = {
  duration: 'شسيبلاتنمكطظزو٣٤٥ سيبلاتنم asdkjh',
  mash: 'ضصثقفغعهخ',
  latin: 'asdfghjkl qwerty',
  mixed: 'kjh٣٤٥ققsd23ف',
  date: '123-04820-209',
  none: ['لايوجد', 'لا يوجد', 'لا شيء', '-', '—', '...', 'n/a', 'N/A', 'none', 'لا يُوجد', '؟', '.'],
};

// نصوص سليمة يجب ألا تُرفض أبدًا
const GOOD = [
  'تقليل زمن انتظار المراجعين في العيادات الخارجية من 45 دقيقة إلى 20 دقيقة خلال ستة أشهر',
  'المستفيدون هم طلاب المرحلة المتوسطة في مدارس الحي وأولياء أمورهم',
  'فاستسقيناكموها',
  'الاستراتيجيات والسياسات التنظيمية',
  'برنامج تدريبي على Excel وPower BI لموظفي الإدارة المالية',
  'رفع نسبة الرضا إلى 85% وفق استبيان ربعي',
  'https://example.org/report-2026',
  'منصة رقمية لحجز المواعيد عبر تطبيق توكلنا',
  'إطلاق النسخة التجريبية (MVP) في الربع الأول من 2027',
  'نعم',
  'مدير إدارة التحول الرقمي، ويعتمد الميزانية',
  'الأسبوع 3',
  'ISO 9001',
  'SMS',
  'ههه لا، المشكلة حقيقية وموثقة في تقرير الإدارة',
];

describe('بوابة جودة القيم: ما يقوم مقام الفراغ', () => {
  it.each(YAHYA.none)('«%s» فراغ', (v) => expect(isPlaceholder(v)).toBe(true));
  it('النص الحقيقي ليس فراغًا', () => {
    for (const t of GOOD) expect(isPlaceholder(t)).toBe(false);
    expect(isPlaceholder('لا يوجد بديل مناسب حاليًا في السوق المحلي')).toBe(false);
  });
});

describe('بوابة جودة القيم: العبث', () => {
  it('سلاسل يحيى عبث', () => {
    expect(isGibberish(YAHYA.duration)).toBe(true);
    expect(isGibberish(YAHYA.mash)).toBe(true);
    expect(isGibberish(YAHYA.latin)).toBe(true);
    expect(isGibberish(YAHYA.mixed)).toBe(true);
    expect(isGibberish('ههههههههه')).toBe(true);
    expect(isGibberish('#$%^&')).toBe(true);
  });
  it.each(GOOD)('سليم: %s', (t) => expect(isGibberish(t)).toBe(false));
  it('كلمة عابثة واحدة في جملة طويلة لا تُسقط الجملة', () => {
    expect(isGibberish('نريد تقليل الهدر في المستودع الرئيس بنسبة واضحة asdfg')).toBe(false);
  });
  it('الكلمات العربية الطويلة والمختصرات تمر', () => {
    for (const w of ['والمستشفيات', 'بالاستراتيجيات', 'KPI', 'OKRs', 'COVID-19', 'B2B', 'v2.1']) expect(gibberishToken(w)).toBe(false);
  });
});

describe('بوابة جودة القيم: التواريخ والأرقام', () => {
  it('التاريخ', () => {
    expect(validDate('2027-03-15')).toBe(true);
    expect(validDate('15/3/2027')).toBe(true);
    expect(validDate('٢٠٢٧-٠٣-١٥')).toBe(true);
    expect(validDate('الأسبوع 12')).toBe(true);
    expect(validDate(YAHYA.date)).toBe(false);
    expect(validDate('2027-13-01')).toBe(false);
    expect(validDate('2027-02-30')).toBe(false);
    expect(validDate('قريبًا')).toBe(false);
  });
  it('الرقم والمبلغ والصفر', () => {
    expect(reasonOf('money', '12,000 ريال')).toBe(null);
    expect(reasonOf('money', '٥٠٠٠')).toBe(null);
    expect(reasonOf('money', '0')).toBe('zero');
    expect(reasonOf('text', '0')).toBe(null);
    expect(reasonOf('text', '45%')).toBe(null);
    expect(reasonOf('text', YAHYA.date)).toBe('bad_date');
    expect(reasonOf('money', '0.0')).toBe('zero');
    expect(reasonOf('money', 'مجانًا')).toBe('bad_number');
    expect(reasonOf('number', '10')).toBe(null);
  });
});

describe('بوابة جودة القيم: الحقول', () => {
  it('الأسباب', () => {
    expect(reasonOf({ key: 'problem', type: 'textarea' }, '')).toBe('empty');
    expect(reasonOf({ key: 'problem', type: 'textarea' }, 'لايوجد')).toBe('placeholder');
    expect(reasonOf({ key: 'problem', type: 'textarea' }, 'مشكلة')).toBe('too_short');
    expect(reasonOf({ key: 'problem', type: 'textarea' }, GOOD[0])).toBe(null);
    expect(reasonOf({ key: 'end', type: 'text' }, YAHYA.duration)).toBe('bad_date');
    expect(reasonOf({ key: 'end', type: 'text' }, 'الأسبوع 12')).toBe(null);
    expect(reasonOf({ key: 'need', type: 'select' }, 'لا')).toBe(null);
    expect(validValue({ key: 'title', type: 'text' }, 'منصة المواعيد')).toBe(true);
  });
  it('الجدول: صفوف «لا يوجد» والتواريخ التالفة تسقط، والخلية التالفة في صف سليم تُفرَّغ', () => {
    const t = { columns: ['المخرج', 'المعيار', 'التاريخ'], value: [
      ['لايوجد', 'لايوجد', 'لايوجد'],
      ['-', '', YAHYA.date],
      ['دليل إجراءات معتمد', 'يعتمده المدير', YAHYA.date],
      ['', '', ''],
    ] };
    const c = cleanRows(t);
    expect(c.rows).toEqual([['دليل إجراءات معتمد', 'يعتمده المدير', '']]);
    expect(c.dropped).toBe(2);
  });
});

const fixture = (over = {}) => ({
  meta: { initiative: 'منصة المواعيد', start: YAHYA.duration, end: '', sponsor: 'لايوجد', status: 'draft' },
  summary: YAHYA.latin,
  sections: [
    { key: 'initiative-charter', title: 'بطاقة المبادرة', fields: [
      { key: 'problem', label: 'المشكلة', type: 'textarea', value: GOOD[0] },
      { key: 'start', label: 'البداية', type: 'text', value: YAHYA.duration },
      { key: 'sponsor', label: 'الراعي', type: 'text', value: 'لايوجد' },
      { key: 'deliverables', label: 'المخرجات', type: 'table', columns: ['المخرج', 'التاريخ'], value: [['لايوجد', 'لايوجد']] },
    ] },
    ...(over.sections || []),
  ],
});

describe('الوثيقة النظيفة وشرط الاكتمال المؤسسي', () => {
  it('cleanDoc يفرغ التالف ويجمع أسبابه ولا يمس الأصل', () => {
    const d = fixture();
    const { doc, gaps } = cleanDoc(d);
    expect(d.sections[0].fields[1].value).toBe(YAHYA.duration);
    expect(doc.meta.start).toBe(null);
    expect(doc.meta.sponsor).toBe(null);
    expect(doc.summary).toBe('');
    expect(doc.sections[0].fields[3].value).toEqual([]);
    expect(gaps.map((g) => g.field_key)).toEqual(['summary', 'start', 'sponsor', 'deliverables']);
    expect(gaps.find((g) => g.field_key === 'start').reason).toBe('bad_date');
  });
  it('البوابة تسمي الأسئلة الناقصة', () => {
    const g = institutionalGate(cleanDoc(fixture()).doc);
    expect(g.ok).toBe(false);
    expect(g.missing.map((m) => m.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // السؤال الأول: المشكلة وحدها لا تكفي حين يكون حقل المستفيدين في النموذج
    const d = fixture();
    d.sections[0].fields.push({ key: 'beneficiaries', label: 'المستفيدون', type: 'textarea', value: '' });
    expect(institutionalGate(cleanDoc(d).doc).missing[0].n).toBe(1);
  });
});

describe('مراجعة مستقلة: توسيع ما يُقبل وما يُرفض', () => {
  it('التاريخ: شهر وسنة، اسم الشهر، الربع، السنة، مدى الأسابيع', () => {
    for (const v of ['مارس 2027', '1 مارس 2027', 'الربع الأول 2027', 'Q1 2027', '2027', 'عام 2027', '03/2027', 'الأسبوع 3–5', 'الأسبوع 3-5', 'week 4']) expect(validDate(v), v).toBe(true);
    for (const v of ['قريبًا', 'مارس', '2027-13-01', 'Q5 2027', 'الأسبوع']) expect(validDate(v), v).toBe(false);
  });
  it('المبلغ: ألف ومليون والتقريب والأرقام الهندية', () => {
    for (const v of ['50 ألف', 'نحو 50 ألف', '50 ألف ريال', '1.5 مليون', '٥٠٠٠٠', '12,500 ريال']) expect(reasonOf('money', v), v).toBe(null);
    expect(reasonOf('money', 'مجانًا')).toBe('bad_number');
  });
  it('خلية المبلغ في الجدول: الصفر والمساهمة العينية مقبولان', () => {
    const c = cleanRows({ columns: ['البند', 'التكلفة'], value: [['قاعة التدريب', '0'], ['المدرب', 'مجانية من الشريك']] });
    expect(c.rows).toEqual([['قاعة التدريب', '0'], ['المدرب', 'مجانية من الشريك']]);
  });
  it('العبث القصير والمكرر', () => {
    for (const v of ['فغفغفغ', 'dfgdfg', 'sdf sdf sdf', 'هههههه', 'تتتتت', 'ثقفغبشسكتنمق']) expect(isGibberish(v), v).toBe(true);
  });
  it('لا ترفض: Strengths، وCloudflare، 1000000، الكلمات العربية الشائعة', () => {
    for (const v of ['Strengths', 'وCloudflare', 'نستخدم وCloudflare للحماية', '1000000', 'rhythm', 'مستشفى', 'تحسين', 'بالتنسيق', 'المملكة', 'فتشكلت لجنة', 'الثالث', 'الربع الثالث', 'وأبواب', 'للمستخدم', 'واجهة للمستخدم', 'للمستثمر', 'للمستهلك', 'فنستعمله', 'فتستخدمه']) expect(isGibberish(v), v).toBe(false);
  });
  it('الجدول المؤسسي: موضوع الصف شرط', () => {
    const t = { columns: ['المخرج', 'المعيار', 'التاريخ'], value: [['لايوجد', 'يعتمده المدير', '2027-03-01']] };
    expect(cleanRows(t).rows.length).toBe(1);
    expect(cleanRows(t, { strict: true }).rows.length).toBe(0);
  });
});

// كل كلمة عربية في محتوى المستودع (الوثائق والمحتوى والترحيلات) سليمة: صفر ضربات خارج قائمة العبث الصريحة
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
describe('مدونة المستودع: لا كلمة عربية حقيقية تُعد عبثًا', () => {
  it('صفر ضربات', () => {
    const ALLOWED = new Set(['هههه', 'ههههه', 'هههههه', 'ههههههههه', 'تتتتت', 'فغفغفغ', 'ضصثقفغعهخ', 'شسيبلاتنمكطظزو', 'سيبلاتنم', 'شسيبلاتنمكطظ', 'ثقفغبشسكتنمق', 'لايوجد', 'لايوجدشيء']);
    const files = [];
    const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(md|json|sql)$/.test(e)) files.push(p); } };
    ['docs', 'supabase/content', 'supabase/migrations'].forEach((r) => walk(r));
    const hits = new Set();
    for (const f of files) for (const w of readFileSync(f, 'utf8').match(/[\u0621-\u064A\u064B-\u0652]+/g) || []) if (!ALLOWED.has(w) && gibberishToken(w)) hits.add(w);
    expect([...hits].slice(0, 40)).toEqual([]);
  });
});
