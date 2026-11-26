// المرحلة 23: نصوص الوثيقة المطبوعة مصدرها labels.js وحده؛ لا تُكتب حرفيًا في src/lib/brand
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from '../../supabase/functions/leaders-api/labels.js';
import { missingMessage } from '../../src/lib/brand/institutional.js';
import { documentHtml } from '../../src/lib/brand/doc.js';

const dir = join(__dirname, '../../src/lib/brand');
const files = readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), 'utf8')]));

// العبارات الجديدة والقديمة التي استُبدلت: لا تظهر حرفيًا في أي ملف brand
const FORBIDDEN = [
  L.DOC_RIGHTS_AR, L.REPORT_RIGHTS_AR, L.CONFIDENTIAL_AR, L.DOC_VERIFY_AR.lead, L.DOC_VERIFY_AR.note, L.DOC_VERIFY_AR.draft, L.DOC_CHARTER_NOTE_AR,
  "'مسودة للمراجعة'", "'قيد الاعتماد'", "'مسودة عمل'", "'بانتظار مراجعته'", "'بانتظار تأييده'", "'الخلاصة التنفيذية'",
  'نسخة حية', 'قيد المراجعة', 'لم يؤيد بعد', 'رسالة القائد', 'يُولَّد من', 'ملك قائد المبادرة', 'ملكية فكرية لـ',
  'بُنيت هذه النسخة', 'صدرت هذه النسخة المعتمدة', 'تُتداول بإذنه',
  L.DOC_DECISION_AR.title, L.DOC_DECISION_AR.lead, L.BUDGET_TOTAL_AR, 'ما المطلوب منك', 'ثلاث منافع', 'أعلى ثلاث مخاطر', 'Decision Summary', 'يلزم القرار قبل', 'اعتماد بشروط',
];

describe('نصوص الوثيقة: المصدر الواحد', () => {
  for (const f of files) {
    it(`لا نص حرفي من نصوص الوثيقة في ${f}`, () => {
      // book.js كتاب المشارك لا وثيقة المبادرة، وحقوقه مختلفة عمدًا
      const list = f === 'book.js' ? FORBIDDEN.filter((x) => x !== 'ملكية فكرية لـ') : FORBIDDEN;
      for (const x of list) expect(src[f], x).not.toContain(x);
    });
  }
  it('الحقوق نص واحد بلا تناقض، ويُلف اسم المنصة في bdi', () => {
    const h = documentHtml({ title: 'x', rights: L.DOC_RIGHTS_AR, confidential: L.CONFIDENTIAL_AR }, '<p>x</p>');
    expect(h).toContain('<bdi dir="ltr">Milestone Impact</bdi>، ومحتوى المبادرة ملك قائدها');
    expect(h).toContain('ولا تُتداول إلا بإذنه.');
    expect(h).not.toContain('..');
  });
  it('أسرة الحالات وخانات الاعتماد', () => {
    expect([L.DOC_LIVE_AR, L.DOC_PENDING_AR, L.DOC_WORKING_AR]).toEqual(['مسودة للمراجعة', 'قيد الاعتماد', 'مسودة عمل']);
    expect(L.DOC_SIGN_AR).toEqual({ reviewerPending: 'بانتظار مراجعته', sponsorPending: 'بانتظار تأييده' });
  });
  it('الإغلاق ورسالة الحجب', () => {
    expect(L.docClosingLiveAr('1 يناير')).toBe('بُنيت هذه النسخة في 1 يناير من فصول المبادرة كما كانت لحظتها، وتتغير بتغيّرها.');
    expect(L.docClosingApprovedAr('1 يناير', 'AB-CD')).toBe('صدرت هذه النسخة المعتمدة في 1 يناير، ولا يغيّرها تعديل لاحق. بصمتها AB-CD.');
    expect(missingMessage([{ title: 'أ' }, { title: 'ب' }, { title: 'ج' }], 'حالة العمل')).toBe('بقيت 3 أسئلة لتكتمل حالة العمل: أ، ب، ج. تجدها مفصلة في ملحق ملف العمل الكامل.');
    expect(missingMessage([{ title: 'أ' }], 'حالة العمل')).toMatch(/^بقي سؤال واحد لتكتمل/);
    expect(missingMessage([{ title: 'أ' }, { title: 'ب' }], 'حالة العمل')).toMatch(/^بقي سؤالان لتكتمل/);
  });
  it('الأرقام: لاتينية 0 إلى 9 مع فاصل الآلاف، ولا أرقام هندية في ملفات brand', () => {
    const h = documentHtml({ title: 'x', rows: [['المبلغ', '1']], rights: L.DOC_RIGHTS_AR }, '<p>x</p>');
    expect(h).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
    // كل تنسيق رقم أو تاريخ في brand بأرقام لاتينية: en-* أو nu-latn
    for (const f of files) for (const m of src[f].matchAll(/toLocale(?:Date|Time)?String\('([^']+)'/g)) expect(m[1], f).toMatch(/^en-|nu-latn/);
  });
});
