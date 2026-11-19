// حالة ورقة الحضور (shared/ui/attendance-sheet.js، تصور تشغيل الدفعة 2026-11-19، المرحلة 2): المسودة فوق قائمة الخادم، والفرق
// الذي يُرسل في حفظ واحد، وما يُسمح لكل دور بتغييره، وما يمنع الحفظ، ونص التأكيد والنتيجة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARK_REASON_MAX, MARK_REASONS_AR } from '../../supabase/functions/leaders-api/labels.js';
import {
  allChecked, canToggle, confirmLines, filterPeople, initialChecked, lockedWhy, notListed, presentCount, reasonOf, savedAr, selfMarked, sheetBlock, sheetDiff,
  sheetPayload, stateAr, toggled,
} from '../../shared/ui/attendance-sheet.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const P = (id, full_name, attendance = null) => ({ id, full_name, attendance });
const PEOPLE = [
  P('a', 'أسامة الأحمد'),
  P('b', 'منى العلي', { method: 'qr', checked_in_at: '2026-11-18T06:04:00Z', recorded_by: null }),
  P('c', 'هدى القحطاني', { method: 'manual', checked_in_at: '2026-11-18T07:00:00Z', recorded_by: 'a@x', note: 'بلا هاتف' }),
  P('d', 'خالد العتيبي'),
];

describe('المسودة والفرق', () => {
  it('تبدأ بالحاضرين كما في الخادم، فلا فرق ولا حفظ', () => {
    const c = initialChecked(PEOPLE);
    expect([...c]).toEqual(['b', 'c']);
    expect(sheetDiff(PEOPLE, c)).toEqual({ add: [], manual: [], self: [], changed: false });
    expect(presentCount(PEOPLE)).toBe(2);
  });
  it('«علّم الكل حاضرًا» يضيف الغائبين وحدهم، ولا يمس من هو حاضر', () => {
    const c = allChecked(initialChecked(PEOPLE), PEOPLE);
    expect(sheetDiff(PEOPLE, c)).toEqual({ add: ['a', 'd'], manual: [], self: [], changed: true });
    // مع البحث: المعروضون وحدهم
    const shown = filterPeople(PEOPLE, 'خالد');
    expect(sheetDiff(PEOPLE, allChecked(initialChecked(PEOPLE), shown)).add).toEqual(['d']);
  });
  it('إزالة علامة حاضر: اليدوي يُلغى، وما سجّله صاحبه يُفرز وحده لأنه يحتاج سببًا', () => {
    let c = initialChecked(PEOPLE);
    c = toggled(PEOPLE, c, 'b', 'admin');
    c = toggled(PEOPLE, c, 'c', 'admin');
    c = toggled(PEOPLE, c, 'a', 'admin');
    expect(sheetDiff(PEOPLE, c)).toEqual({ add: ['a'], manual: ['c'], self: ['b'], changed: true });
    // النقر مرتين يعيد الحالة، ومعرّف ليس في القائمة لا يغيّر شيئًا
    expect(sheetDiff(PEOPLE, toggled(PEOPLE, toggled(PEOPLE, initialChecked(PEOPLE), 'a', 'admin'), 'a', 'admin')).changed).toBe(false);
    expect([...toggled(PEOPLE, initialChecked(PEOPLE), 'zz', 'admin')]).toEqual(['b', 'c']);
  });
  it('المحددون مسبقًا من جدول الأعضاء يُعلَّمون إن كانوا في القائمة، ومن ليس فيها يُذكر ولا يُرسل', () => {
    const c = initialChecked(PEOPLE, ['a', 'b', 'x1', 'x2']);
    expect(sheetDiff(PEOPLE, c).add).toEqual(['a']);
    expect(notListed(PEOPLE, ['a', 'b', 'x1', 'x2'])).toEqual(['x1', 'x2']);
    expect(notListed(PEOPLE, [])).toEqual([]);
  });
});

describe('ما يُسمح لكل دور', () => {
  const mine = P('m', 'سعاد', { method: 'manual', mine: true });
  const others = P('o', 'ليلى', { method: 'manual' });
  const self = P('s', 'نورة', { method: 'code' });
  it('المدير يغيّر كل مربع، والمدرب يعلّم الغائب ويلغي ما سجّله هو وحده', () => {
    for (const p of [PEOPLE[0], mine, others, self]) expect(canToggle(p, 'admin')).toBe(true);
    expect([PEOPLE[0], mine, others, self].map((p) => canToggle(p, 'trainer'))).toEqual([true, true, false, false]);
    expect(lockedWhy(self, 'trainer')).toBe('سجّل حضوره بنفسه، وإلغاؤه للإدارة');
    expect(lockedWhy(others, 'trainer')).toBe('سجّله غيرك، وإلغاؤه لمن سجّله أو للإدارة');
    expect(lockedWhy(mine, 'trainer')).toBe('');
  });
  it('المربع المقفل لا يتغير ولو نُقر', () => {
    const list = [mine, others, self];
    let c = initialChecked(list);
    for (const id of ['o', 's']) c = toggled(list, c, id, 'trainer');
    expect(sheetDiff(list, c).changed).toBe(false);
    expect(sheetDiff(list, toggled(list, c, 'm', 'trainer'))).toEqual({ add: [], manual: ['m'], self: [], changed: true });
  });
  it('سجّل نفسه: أي طريقة غير «يدوي»', () => {
    expect(['qr', 'code', 'join', 'hall', 'remote'].every((method) => selfMarked({ method }))).toBe(true);
    expect([selfMarked({ method: 'manual' }), selfMarked(null)]).toEqual([false, false]);
  });
});

describe('السبب وما يمنع الحفظ والطلب الواحد', () => {
  const add = { add: ['a', 'd'], manual: [], self: [], changed: true };
  it('السبب من القائمة القصيرة أو نص حر بحده', () => {
    expect(MARK_REASONS_AR).toEqual(['تعطل الرمز', 'بلا هاتف', 'سُجل لاحقًا']);
    expect(reasonOf('تعطل الرمز', 'يُهمل')).toBe('تعطل الرمز');
    expect(reasonOf('other', '  حضر متأخرًا  ')).toBe('حضر متأخرًا');
    expect(reasonOf('', 'x')).toBe('');
    expect(reasonOf('other', 'س'.repeat(1000))).toHaveLength(MARK_REASON_MAX);
  });
  it('المدير يحفظ بلا سبب، والمدرب لا يسجّل بلا سبب، ولا حفظ بلا تغيير', () => {
    expect(sheetBlock({ diff: add, reason: '', unmarkReason: '', role: 'admin' })).toBeNull();
    expect(sheetBlock({ diff: add, reason: '', unmarkReason: '', role: 'trainer' })).toEqual({ field: 'reason', message: 'اختر سبب التسجيل اليدوي أو اكتبه' });
    expect(sheetBlock({ diff: add, reason: 'بلا هاتف', unmarkReason: '', role: 'trainer' })).toBeNull();
    // إلغاء ما سجّله المدرب نفسه لا يحتاج سببًا
    expect(sheetBlock({ diff: { add: [], manual: ['m'], self: [], changed: true }, reason: '', unmarkReason: '', role: 'trainer' })).toBeNull();
    expect(sheetBlock({ diff: { add: [], manual: [], self: [], changed: false }, reason: 'x', unmarkReason: '', role: 'admin' }).message).toBe('لا تغيير للحفظ');
  });
  it('إلغاء حضور سجّله صاحبه يحتاج سببًا مكتوبًا، والفراغ ليس سببًا', () => {
    const diff = { add: [], manual: ['c'], self: ['b'], changed: true };
    for (const unmarkReason of ['', '   ', undefined]) expect(sheetBlock({ diff, reason: '', unmarkReason, role: 'admin' })).toEqual({ field: 'unmark', message: 'اكتب سبب إلغاء حضور من سجّل نفسه' });
    expect(sheetBlock({ diff, reason: '', unmarkReason: 'مسح من الخارج', role: 'admin' })).toBeNull();
  });
  it('الطلب يحمل الفرق وحده: سبب التسجيل مع من يُسجَّل، وسبب الإلغاء مع من سجّل نفسه', () => {
    expect(sheetPayload({ sessionId: 'w1', diff: add, reason: 'تعطل الرمز', unmarkReason: '' })).toEqual({ session_id: 'w1', present: ['a', 'd'], reason: 'تعطل الرمز' });
    expect(sheetPayload({ sessionId: 'w1', diff: add, reason: '', unmarkReason: 'x' })).toEqual({ session_id: 'w1', present: ['a', 'd'] });
    expect(sheetPayload({ sessionId: 'w1', diff: { add: ['a'], manual: ['c'], self: ['b'], changed: true }, reason: 'بلا هاتف', unmarkReason: '  مسح من الخارج ' }))
      .toEqual({ session_id: 'w1', present: ['a'], absent: ['c', 'b'], reason: 'بلا هاتف', unmark_reason: 'مسح من الخارج' });
    // إلغاء يدوي وحده: لا سبب تسجيل ولا سبب إلغاء في الطلب
    expect(sheetPayload({ sessionId: 'w1', diff: { add: [], manual: ['c'], self: [], changed: true }, reason: 'بلا هاتف', unmarkReason: 'x' })).toEqual({ session_id: 'w1', absent: ['c'] });
  });
});

describe('نص التأكيد والنتيجة وحالة الصف', () => {
  it('التأكيد يقول ما سيُكتب بعدده وسببه', () => {
    expect(confirmLines({ diff: { add: ['a', 'd'], manual: [], self: [] }, reason: 'تعطل الرمز', unmarkReason: '' })).toEqual(['يُسجَّل يدويًا حضور مشاركَين، والسبب: تعطل الرمز.']);
    expect(confirmLines({ diff: { add: Array(18).fill('x'), manual: ['c'], self: ['b'] }, reason: '', unmarkReason: 'مسح من الخارج' })).toEqual([
      'يُسجَّل يدويًا حضور 18 مشاركًا، بلا سبب مكتوب.', 'يُلغى حضور واحد سُجّل يدويًا.', 'يُلغى حضور واحد سجّله صاحبه بنفسه، والسبب: مسح من الخارج.',
    ]);
  });
  it('النتيجة: سُجّل وتُخطي ورُفض، ومع كل مرفوض اسمه من الشاشة وسببه من الخادم', () => {
    const nameOf = (id) => ({ d: 'خالد العتيبي' })[id] || '';
    expect(savedAr({ success: true, marked: 17, unmarked: 0, already: 1, refused: [] })).toEqual({ text: 'سُجّل 17 · تُخطي 1 (مسجل أصلًا)', refused: [], tone: 'ok' });
    expect(savedAr({ success: true, marked: 1, unmarked: 2, already: 0, refused: [{ id: 'd', code: 'not_expected', message: 'ليس ممن يُتوقع حضورهم في هذه الجلسة' }, { id: 'zz', code: 'demo', message: 'حساب العرض لا يُسجَّل له حضور' }] }, nameOf)).toEqual({
      text: 'سُجّل 1 · أُلغي 2 · رُفض 2', tone: 'warn',
      refused: [{ id: 'd', name: 'خالد العتيبي', message: 'ليس ممن يُتوقع حضورهم في هذه الجلسة' }, { id: 'zz', name: 'مشارك', message: 'حساب العرض لا يُسجَّل له حضور' }],
    });
    expect(savedAr({ success: true, marked: 0, unmarked: 0, already: 0, refused: [] }).text).toBe('لا تغيير');
  });
  it('حالة الصف: الطريقة والوقت ومن سجّل والسبب، وللمدرب «سجّلته أنت» بلا بريد', () => {
    const when = (iso) => `@${iso.slice(11, 16)}`;
    expect(stateAr(null)).toEqual({ label: 'غائب', detail: '' });
    expect(stateAr(PEOPLE[1].attendance, { when })).toEqual({ label: 'حاضر · رمز QR', detail: '@06:04' });
    expect(stateAr(PEOPLE[2].attendance, { when })).toEqual({ label: 'حاضر · يدوي', detail: '@07:00 · سجّله a@x · السبب: بلا هاتف' });
    expect(stateAr({ method: 'manual', mine: true })).toEqual({ label: 'حاضر · يدوي', detail: 'سجّلته أنت' });
    expect(stateAr({ method: 'code' })).toEqual({ label: 'حاضر · الأرقام الستة', detail: '' });
  });
  it('البحث بالاسم بتوحيد الحروف العربية', () => {
    expect(filterPeople(PEOPLE, 'اسامه').map((p) => p.id)).toEqual(['a']);
    expect(filterPeople(PEOPLE, 'مني').map((p) => p.id)).toEqual(['b']);
    expect(filterPeople(PEOPLE, '  ')).toHaveLength(4);
    expect(filterPeople(PEOPLE, 'لا أحد')).toEqual([]);
  });
});

describe('الورقة واحدة للإدارة وبوابة الخبير، وكل مدخل يفتحها', () => {
  const admin = read('admin-app/src/screens/Activities.jsx');
  const portal = read('leaders-app/src/screens/ExpertPortal.jsx');
  it('الإدارة تحفظ بالأمر الجماعي، والمدرب بأمر بوابته، والمكوّن نفسه', () => {
    expect(admin).toMatch(/L\('admin\.workshop-mark-bulk', body\)/);
    expect(admin).toMatch(/<AttendanceSheet sessionId=\{id\}[^>]* role="admin"/);
    expect(portal).toMatch(/xpCall\('xp\.workshop-mark-bulk', body\)/);
    expect(portal).toMatch(/<AttendanceSheet sessionId=\{sheet\.id\}[^>]* role="trainer"/);
    // لا مسار كتابة فردي باقٍ في الواجهة
    for (const src of [admin, portal, read('admin-app/src/screens/CohortRoster.jsx'), read('admin-app/src/screens/CohortJourney.jsx')]) expect(src).not.toMatch(/admin\.workshop-mark'/);
  });
  it('المداخل الثلاثة للإدارة: «الحضور والجلسات»، ويوم الورشة في بطاقة المرحلة، و«سجّل حضورهم في جلسة» في المتابعة', () => {
    expect(admin).toMatch(/\{att && <Attendance id=\{att\} canWrite=\{canWrite\}/);
    expect(read('admin-app/src/screens/CohortJourney.jsx')).toMatch(/\{att && <Attendance id=\{att\} cohortId=\{c\.id\} canWrite=\{canWrite\}/);
    const roster = read('admin-app/src/screens/CohortRoster.jsx');
    expect(roster).toMatch(/سجّل حضورهم في جلسة/);
    expect(roster).toMatch(/<Attendance id=\{attend\.session\} cohortId=\{c\.id\} canWrite=\{canWrite\} preselect=\{attend\.ids\}/);
  });
  it('ورقتا الأنماط مستوردتان في التطبيقين', () => {
    for (const p of ['admin-app/src/main.jsx', 'leaders-app/src/main.jsx']) expect(read(p)).toContain("import '../../shared/css/attendance-sheet.css';");
  });
});
