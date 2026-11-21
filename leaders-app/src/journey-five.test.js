// رحلة المشارك، البنود الخمسة (جولة المشارك 2026-11-19): نصوص التواريخ وسبب التوقف وتفصيل النتيجة، وتذكّر الطي، واسم الملف
// المرفوع ومتى يُستبدل. دوال صرفة يقرؤها الخادم والواجهة، فتُختبر هنا وحدها. والقاعدة «الاختياري لا يُحسب» تحرس سطر المراجعة.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { awaitingReview, daysLeftAr, FINAL_ASK_DETAIL_AR, FINAL_NO_DETAIL_AR, finalDetailView, fmtDate, holdLine, stageDates, stageOffAr } from './journey-copy.js';
import { foldStore, stageFoldId } from './journey-folds.js';
import { canReplaceFile, cleanFileName, FILE_NAME_MAX, fileAnswers, fileKindAr, uploadedFile } from '../../supabase/functions/leaders-api/upload-file.js';
import { computeFinal, finalBreakdown, finalComponents } from '../../supabase/functions/leaders-api/final.js';
import { resolveStages } from '../../supabase/functions/leaders-api/journey.js';
import { buildJourney, cohortDefinition } from '../../supabase/functions/leaders-api/logic.js';

const DASH = /[\u2013\u2014]/;
const TODAY = '2026-11-21T09:00:00Z';
const item = (id, status = 'pending', extra = {}) => ({ id, code: id.toUpperCase(), kind: 'task', title_ar: `بند ${id}`, required: true, status, ...extra });
const st = (key, title_ar, status, items = [], extra = {}) => ({ key, title_ar, status, items, ...extra });

describe('تواريخ المرحلة: من نافذتها في خطة الدفعة', () => {
  it('الميلادي بأرقام لاتينية، والسنة حين تختلف عن سنة اليوم وحدها', () => {
    expect(fmtDate('2026-11-05', TODAY)).toBe('5 نوفمبر');
    expect(fmtDate('2027-01-11', TODAY)).toBe('11 يناير 2027');
    expect(fmtDate('ليس تاريخًا', TODAY)).toBe('');
  });
  it('بلا نافذة لا يُعرض شيء، لا تاريخ ولا بديل عنه', () => {
    expect(stageDates(st('a', 'أ', 'active'), TODAY)).toBeNull();
    expect(stageDates({ ...st('a', 'أ', 'active'), window: { from: '2026-11-01', to: null } }, TODAY)).toBeNull();
    expect(stageDates(null, TODAY)).toBeNull();
  });
  it('المدى لكل مرحلة، ونهاية الجارية وحدها', () => {
    const w = { from: '2026-11-08', to: '2026-11-25' };
    expect(stageDates({ ...st('a', 'أ', 'done'), window: w }, TODAY)).toEqual({ range: 'من 8 إلى 25 نوفمبر', end: null, tone: '' });
    expect(stageDates({ ...st('a', 'أ', 'locked'), window: w }, TODAY).end).toBeNull();
    expect(stageDates({ ...st('a', 'أ', 'active'), window: w }, TODAY)).toEqual({ range: 'من 8 إلى 25 نوفمبر', end: 'تنتهي في 25 نوفمبر، بقي 4 أيام', tone: '' });
  });
  it('قرب النهاية ويومها وما بعدها، والتي لم تبدأ', () => {
    const at = (to, from = '2026-11-08') => stageDates({ ...st('a', 'أ', 'active'), window: { from, to } }, TODAY);
    expect(at('2026-11-23')).toMatchObject({ end: 'تنتهي في 23 نوفمبر، بقي يومان', tone: 'soon' });
    expect(at('2026-11-22')).toMatchObject({ end: 'تنتهي في 22 نوفمبر، بقي يوم واحد', tone: 'soon' });
    expect(at('2026-11-21')).toMatchObject({ end: 'تنتهي اليوم', tone: 'soon' });
    expect(at('2026-11-18')).toMatchObject({ end: 'انتهت مدتها المخططة في 18 نوفمبر', tone: 'over' });
    expect(at('2026-12-20', '2026-12-01')).toMatchObject({ end: 'تبدأ في 1 ديسمبر', tone: '' });
    expect(at('2026-11-21', '2026-11-21').range).toBe('21 نوفمبر');
    // شهران أو سنتان: كل تاريخ بشهره، والسنة حين تختلف عن سنة اليوم
    expect(at('2026-12-05').range).toBe('من 8 نوفمبر إلى 5 ديسمبر');
    expect(at('2027-01-20', '2026-12-24').range).toBe('من 24 ديسمبر إلى 20 يناير 2027');
    expect(at('2027-02-03', '2027-01-21').range).toBe('من 21 يناير 2027 إلى 3 فبراير 2027');
  });
  it('المعدود العربي لما بقي', () => {
    expect([1, 2, 3, 10, 11, 40].map(daysLeftAr)).toEqual(['بقي يوم واحد', 'بقي يومان', 'بقي 3 أيام', 'بقي 10 أيام', 'بقي 11 يومًا', 'بقي 40 يومًا']);
  });
});

describe('سبب توقف المرحلة: سطر واحد من حالتها الفعلية', () => {
  const journey = [
    st('training', 'التدريب', 'active', [item('t1', 'done'), item('t2', 'pending')]),
    st('ojt', 'التوجيه', 'locked', [], { lock: { unlock: 'previous', waits: ['training'], due: [] }, lock_reason: 'تُفتح بعد اكتمال: التدريب' }),
  ];
  it('تنتظر مرحلة قبلها: تسمّيها', () => {
    expect(holdLine(journey[1], journey, TODAY)).toEqual({ kind: 'locked', text: 'تُفتح بعد أن تكمل «التدريب».' });
    const two = st('z', 'ي', 'locked', [], { lock: { unlock: 'stages', waits: ['training', 'ojt'], due: [] } });
    expect(holdLine(two, journey, TODAY).text).toBe('تُفتح بعد أن تكمل «التدريب» و«التوجيه».');
  });
  it('ما تنتظره عند المستشار: يُقال، فلا يبحث المشارك عن شيء يفعله', () => {
    const j = [st('training', 'التدريب', 'active', [item('t1', 'done'), item('t2', 'submitted', { needs_review: true })]), journey[1]];
    expect(holdLine(j[1], j, TODAY).text).toBe('تُفتح حين يعتمد مستشارك ما سلّمته في «التدريب».');
    expect(holdLine(j[0], j, TODAY)).toEqual({ kind: 'review', text: 'لا شيء مطلوب منك الآن: «بند t2» عند مستشارك للمراجعة، وتكتمل المرحلة باعتماده.' });
  });
  it('موعد لم يحن: بتاريخه الميلادي', () => {
    const s = st('g', 'العرض', 'locked', [], { lock: { unlock: 'day', waits: [], due: [], date: '2026-12-06' }, lock_reason: 'تُفتح في 2026-12-06' });
    expect(holdLine(s, [s], TODAY).text).toBe('لم يحن موعدها: تُفتح في 6 ديسمبر.');
  });
  it('يفتحها الفريق، وتبدأ مع غيرها، وتنتظر بنود المسار المستمر', () => {
    const ref = st('training', 'التدريب', 'locked');
    expect(holdLine(st('a', 'أ', 'locked', [], { lock: { unlock: 'approval', waits: [], due: [] } }), [], TODAY).text).toContain('يفتحها لك فريق البرنامج');
    expect(holdLine(st('a', 'أ', 'locked', [], { lock: { unlock: 'with', with: 'training', waits: [], due: [] } }), [ref], TODAY).text).toBe('تبدأ مع «التدريب»، وهي لم تُفتح بعد.');
    const track = st('ben', 'سجل المنافع', 'active');
    expect(holdLine(st('a', 'أ', 'locked', [], { lock: { unlock: 'previous', waits: [], due: ['ben'] } }), [track], TODAY).text).toBe('تنتظر البنود الإلزامية في مسارك المستمر «سجل المنافع».');
  });
  it('بلا تفصيل (خادم أقدم) يبقى نص الخادم كما هو، وبلا نص لا يُخترع سبب', () => {
    expect(holdLine(st('a', 'أ', 'locked', [], { lock_reason: 'تُفتح بعد اكتمال: التدريب' }), [], TODAY)).toEqual({ kind: 'locked', text: 'تُفتح بعد اكتمال: التدريب' });
    expect(holdLine(st('a', 'أ', 'locked'), [], TODAY)).toBeNull();
    expect(holdLine(st('a', 'أ', 'active', [item('x')]), [], TODAY)).toBeNull();
    expect(holdLine(st('a', 'أ', 'done', [item('x', 'done')]), [], TODAY)).toBeNull();
  });
  it('اكتمالها باعتماد الفريق: أنجز ما عليه', () => {
    const s = st('a', 'أ', 'active', [item('x', 'done')], { rules: { complete: 'approval' } });
    expect(holdLine(s, [s], TODAY)).toEqual({ kind: 'approval', text: 'أنجزت ما عليك فيها، وتكتمل حين يعتمدها فريق البرنامج.' });
  });
  it('الاختياري لا يُحسب: بند اختياري معلّق لا ينفي «عند مستشارك»، وبند اختياري مسلَّم لا يوقف مرحلة', () => {
    const s = st('a', 'أ', 'active', [item('m', 'submitted'), item('o', 'pending', { required: false })]);
    expect(awaitingReview(s).map((i) => i.id)).toEqual(['m']);
    const onlyOpt = st('b', 'ب', 'active', [item('m', 'pending'), item('o', 'submitted', { required: false })]);
    expect(awaitingReview(onlyOpt)).toEqual([]);
    expect(holdLine(onlyOpt, [onlyOpt], TODAY)).toBeNull();
  });
  it('المرحلة الموقوفة للدفعة', () => {
    expect(stageOffAr({ key: 'x', title_ar: 'الإثراء' })).toBe('أُوقفت «الإثراء» لدفعتك، فلا شيء مطلوب منك فيها. ما أنجزته فيها محفوظ.');
  });
  it('لا شرطة طويلة في أي نص', () => {
    const all = [holdLine(journey[1], journey, TODAY).text, stageOffAr({ title_ar: 'أ' }), FINAL_NO_DETAIL_AR, stageDates({ ...st('a', 'أ', 'active'), window: { from: '2026-11-08', to: '2026-11-25' } }, TODAY).end];
    for (const t of all) expect(DASH.test(t)).toBe(false);
  });
});

describe('سبب القفل مفصّلًا من resolveStages نفسها', () => {
  const stages = [
    { key: 'a', title_ar: 'أ', sort: 1, items: [item('a1', 'pending')] },
    { key: 'b', title_ar: 'ب', sort: 2, items: [item('b1')] },
    { key: 'c', title_ar: 'ج', sort: 3, items: [item('c1')], rules: { unlock: 'day', day: 10 } },
    { key: 'd', title_ar: 'د', sort: 4, items: [item('d1')], rules: { unlock: 'approval' } },
    { key: 'e', title_ar: 'هـ', sort: 5, items: [item('e1')], rules: { unlock: 'with', with: 'b' } },
  ];
  const ctx = { cohortStart: '2026-11-20', today: TODAY };
  it('بلا detail المخرج كما كان: لا حقل lock', () => {
    for (const s of resolveStages(stages, ctx)) expect('lock' in s).toBe(false);
  });
  it('مع detail: القاعدة وما تنتظره وتاريخ الفتح، ونص الخادم القديم كما هو', () => {
    const by = Object.fromEntries(resolveStages(stages, { ...ctx, detail: true }).map((s) => [s.key, s]));
    expect('lock' in by.a).toBe(false);
    expect(by.b.lock).toEqual({ unlock: 'previous', waits: ['a'], due: [] });
    expect(by.c.lock).toEqual({ unlock: 'day', waits: [], due: [], date: '2026-11-30' });
    expect(by.d.lock).toEqual({ unlock: 'approval', waits: [], due: [] });
    expect(by.e.lock).toEqual({ unlock: 'with', waits: [], due: [], with: 'b' });
    expect(by.b.lock_reason).toBe('تُفتح بعد اكتمال: أ');
    // والحالة نفسها بالخيار وبدونه
    expect(resolveStages(stages, { ...ctx, detail: true }).map((s) => s.status)).toEqual(resolveStages(stages, ctx).map((s) => s.status));
  });
});

describe('تفصيل النتيجة الختامية', () => {
  const comps = finalComponents({ continuous: { index: 80, components: [] }, milestones: { total: 5, done: 4, late: 1, max_late: 3 }, capstone: { score: 70 }, post: null });
  it('كل مكوّن بوزنه ودرجته، ولا يخرج تعليل تعديل ولا درجة آلية ولا سبب حساب', () => {
    const snap = computeFinal(comps, null, { components: { project: { value: 75, reason: 'تعليل داخلي لا يصل المشارك' } } }, { ended: true });
    const d = finalBreakdown(snap);
    expect(d.components).toEqual([
      { key: 'continuous', label: 'التقييم المستمر طوال التأهيل', weight: 30, value: 80, state: 'scored' },
      { key: 'milestones', label: 'إنجاز المعالم في مواعيدها', weight: 20, value: 70, state: 'scored' },
      { key: 'project', label: 'المشروع (وثيقة المبادرة بمعيارها)', weight: 30, value: 75, state: 'scored' },
      { key: 'post', label: 'القياس النهائي', weight: 20, value: 0, state: 'zeroed' },
    ]);
    expect(JSON.stringify(d)).not.toMatch(/تعليل داخلي|reason|"auto|adjust_reason|"adjusted"|أنجز 4/);
    // حاصل المكوّنات بأوزانها هو الدرجة: لا تعديل على الدرجة النهائية
    expect(d.score_adjusted).toBe(false);
    expect(snap.score).toBe(Math.round((80 * 30 + 70 * 20 + 75 * 30 + 0 * 20) / 100));
  });
  it('ما تعرضه الشاشة: الوزن والدرجة وحال المكوّن، وسطر صادق عن الدرجة النهائية', () => {
    const v = finalDetailView({ detail: finalBreakdown(computeFinal(comps, null, {}, {})) });
    expect(v.rows.map((r) => [r.weight, r.score, r.note])).toEqual([
      ['وزنه 30٪', '80٪', null], ['وزنه 20٪', '70٪', null], ['وزنه 30٪', '70٪', null], ['وزنه 20٪', 'لم يُحتسب', 'لم يدخل الحساب، ووُزّع وزنه على بقية المكوّنات'],
    ]);
    expect(v.notes[0]).toBe('درجتك النهائية حاصل درجات المكوّنات بأوزانها.');
    expect(v.notes[1]).toBe('حدود القرار: الاجتياز من 70٪، والاجتياز بملاحظات من 60٪، والتمديد من 45٪.');
    const adj = finalDetailView({ detail: finalBreakdown(computeFinal(comps, null, { score: { value: 90, reason: 'رفع بعد مراجعة اللجنة' } }, {})) });
    expect(adj.notes[0]).toBe('عُدّلت درجتك النهائية عند اعتماد التقييم، فقد تختلف عن حاصل المكوّنات بأوزانها.');
    for (const t of [...v.notes, ...adj.notes, ...v.rows.map((r) => r.note || '')]) expect(DASH.test(t)).toBe(false);
  });
  it('بلا تفصيل (تقييم قديم أو محجوب): null فيُعرض البديل الصادق', () => {
    expect(finalDetailView({ decision: 'pass', score: 80, detail: null })).toBeNull();
    expect(finalDetailView({ decision: 'pass', score: 80 })).toBeNull();
    expect(finalDetailView(null)).toBeNull();
    expect(FINAL_NO_DETAIL_AR).toContain('غير متاح');
    expect(FINAL_ASK_DETAIL_AR).toBe('لطلبه راسل');
  });
});

describe('الملف المرفوع: اسمه ووقته ومتى يُستبدل', () => {
  it('الاسم بلا مسار ولا محارف تحكم ولا اتجاه خفي، وبطول محدود يحفظ الامتداد', () => {
    expect(cleanFileName('C:\\Users\\me\\خطة التطبيق.docx')).toBe('خطة التطبيق.docx');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('a\u202Efdp.exe')).toBe('afdp.exe');
    expect(cleanFileName(null)).toBe('');
    const long = cleanFileName(`${'خ'.repeat(300)}.pdf`);
    expect(long.length).toBe(FILE_NAME_MAX);
    expect(long.endsWith('….pdf')).toBe(true);
  });
  it('ما يُحفظ وما يُقرأ: الاسم والوقت من الصف، ولما رُفع قبل حفظ الأسماء نوعه ووقت تسليمه', () => {
    expect(fileAnswers('خطة.pdf', '2026-11-21T10:00:00Z')).toEqual({ file: { name: 'خطة.pdf', at: '2026-11-21T10:00:00Z' } });
    expect(uploadedFile({ evidence_path: 'p/evidence/x.pdf', answers: fileAnswers('خطة.pdf', '2026-11-21T10:00:00Z') })).toEqual({ name: 'خطة.pdf', at: '2026-11-21T10:00:00Z', kind: 'ملف PDF' });
    expect(uploadedFile({ evidence_path: 'p/evidence/x.png', submitted_at: '2026-11-01T08:00:00Z' })).toEqual({ name: null, at: '2026-11-01T08:00:00Z', kind: 'صورة' });
    expect(uploadedFile({ evidence_path: null, answers: fileAnswers('x.pdf', 'now') })).toBeNull();
    expect(fileKindAr('a/b.zzz')).toBe('ملف');
  });
  it('يُستبدل ما لم يُعتمد: بانتظار المراجعة، أو أُعيد، أو بند بلا مراجعة. والمعتمد لا', () => {
    expect(canReplaceFile({ status: 'submitted', needs_review: true })).toBe(true);
    expect(canReplaceFile({ status: 'returned', needs_review: true })).toBe(true);
    expect(canReplaceFile({ status: 'done', needs_review: false })).toBe(true);
    expect(canReplaceFile({ status: 'done', needs_review: true })).toBe(false);
    expect(canReplaceFile({ status: 'pending' })).toBe(false);
  });
  it('buildJourney: بند الرفع يحمل ملفه، وغيره لا', () => {
    const j = buildJourney({
      stages: [{ key: 's', sort: 1, title_ar: 'م' }],
      requirements: [{ id: 'u', stage_key: 's', code: 'U', kind: 'upload', sort: 1, needs_review: true }, { id: 't', stage_key: 's', code: 'T', kind: 'task', sort: 2 }, { id: 'n', stage_key: 's', code: 'N', kind: 'upload', sort: 3 }],
      progress: { u: { status: 'submitted', evidence_path: 'p/evidence/x.docx', answers: fileAnswers('خطة.docx', '2026-11-21T10:00:00Z') }, t: { status: 'done', evidence_path: 'p/evidence/y.pdf' } },
      levels: {}, state: {},
    });
    const by = Object.fromEntries(j[0].items.map((i) => [i.id, i]));
    expect(by.u.file).toEqual({ name: 'خطة.docx', at: '2026-11-21T10:00:00Z', kind: 'ملف Word' });
    expect('file' in by.t).toBe(false);
    expect('file' in by.n).toBe(false);
    // إجابات الاستبانة لا تختلط بوصف الملف
    expect('answers' in by.u).toBe(false);
  });
});

describe('المرحلة الموقوفة للدفعة: بنودها معروفة ليُسمّى لمن عمل فيها', () => {
  it('requirements_off بمراحلها، والمراحل والبنود السارية كما كانت', () => {
    const live = { stages: [{ key: 'a', sort: 1, title_ar: 'أ' }, { key: 'b', sort: 2, title_ar: 'ب' }], requirements: [{ id: 'r1', stage_key: 'a', code: 'A' }, { id: 'r2', stage_key: 'b', code: 'B' }, { id: 'r3', stage_key: 'b', code: 'B2', active: false }] };
    const d = cohortDefinition({ live, version: null, cohort: { schedule: { b: { off: true } } } });
    expect(d.requirements_off).toEqual([{ id: 'r2', stage_key: 'b' }]);
    expect(d.stages.map((s) => s.key)).toEqual(['a']);
    expect(d.requirements.map((r) => r.id)).toEqual(['r1']);
    expect(cohortDefinition({ live, version: null, cohort: { schedule: {} } }).requirements_off).toEqual([]);
  });
});

describe('تذكّر الطي والفتح على الجهاز', () => {
  let saved;
  beforeEach(() => { saved = globalThis.localStorage; });
  afterEach(() => { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; });
  const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m }; };

  it('يُحفظ الاختيار لكل مشارك بمفتاحه، ويُقرأ في زيارة تالية', () => {
    globalThis.localStorage = memory();
    const a = foldStore('p1');
    expect(a.get('stage:training@active')).toBeUndefined();
    a.set('stage:training@active', false);
    a.set('fold:milestones', true);
    expect(foldStore('p1').get('stage:training@active')).toBe(false);
    expect(foldStore('p1').get('fold:milestones')).toBe(true);
    expect(foldStore('p2').get('fold:milestones')).toBeUndefined();
  });
  it('بلا تخزين أو بتخزين يرمي أو بقيمة تالفة: يعمل بالافتراضي ولا يرمي', () => {
    delete globalThis.localStorage;
    const none = foldStore('p1');
    expect(none.get('x')).toBeUndefined();
    expect(() => none.set('x', true)).not.toThrow();
    expect(none.get('x')).toBe(true);   // يبقى لهذه الزيارة
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    const blocked = foldStore('p1');
    expect(() => blocked.set('y', false)).not.toThrow();
    expect(blocked.get('y')).toBe(false);
    const bad = memory(); bad.setItem('mi_leaders_folds_p1', '[1,2');
    globalThis.localStorage = bad;
    expect(foldStore('p1').get('x')).toBeUndefined();
    bad.setItem('mi_leaders_folds_p1', '"نص"');
    expect(foldStore('p1').get('x')).toBeUndefined();
  });
  it('مفتاح المرحلة يحمل حالتها: ما طُوي وهي مقفلة لا يبقيها مطوية حين تصير الحالية، والسجل محدود', () => {
    expect(stageFoldId({ key: 'training', status: 'locked' })).not.toBe(stageFoldId({ key: 'training', status: 'active' }));
    const mem = memory();
    globalThis.localStorage = mem;
    const s = foldStore('p1');
    for (let i = 0; i < 200; i++) s.set(`k${i}`, true);
    const kept = Object.keys(JSON.parse(mem.getItem('mi_leaders_folds_p1')));
    expect(kept.length).toBe(80);
    expect(kept.at(-1)).toBe('k199');
  });
});
