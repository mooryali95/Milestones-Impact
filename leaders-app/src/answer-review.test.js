// مراجعة إجابات القياس (تصور بطاقة المستوى وإجابات القياس، المرحلة 2، قرار المالك 2026-11-11):
// ترتيب العرض الواحد، وتصنيف الإجابة، والزمن التقديري وحدوده، والصلاحية والسجل، وأن الزمن لا يدخل أي قرار آلي.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answerClass, estimateTimes, FAST_FLOOR_SECONDS, IDLE_SECONDS, reviewAnswers, reviewCsvRows, secondsAr, servedOrder,
} from '../../supabase/functions/leaders-api/answer-review.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (p) => read(`supabase/functions/leaders-api/${p}`);

const choice = (id, dimension, tier, sort, scores = [0, 1, 4, 0]) => ({ id, code: id.toUpperCase(), dimension, tier, sort, kind: 'choice', text_ar: `سؤال ${id}`, options: scores.map((score, i) => ({ label: `خيار ${i}`, score })) });
const likert = (id, dimension, sort) => ({ id, code: id.toUpperCase(), dimension, tier: 'behavior', sort, kind: 'likert', text_ar: `عبارة ${id}`, options: [0, 1, 2, 3, 4, -1].map((score, i) => ({ label: ['أبدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا', 'لا ينطبق'][i], score })) });

describe('servedOrder: ترتيب العرض من مصدر واحد لشاشة القياس والمراجعة', () => {
  it('الأبعاد بترتيبها، والممارسة ثم المواقف ثم المعرفة، وبنود الانتقال آخرًا', () => {
    const qs = [choice('k1', 'impact', 'knowledge', 1), { id: 't1', dimension: 'milestone', tier: 'transfer', sort: 1 }, likert('b2', 'milestone', 2), choice('s1', 'milestone', 'skill', 1), likert('b1', 'milestone', 1), choice('l1', 'leadership', 'knowledge', 1), likert('ib', 'impact', 1)];
    expect(servedOrder(qs).map((q) => q.id)).toEqual(['b1', 'b2', 's1', 'ib', 'k1', 'l1', 't1']);
    expect(qs[0].id).toBe('k1');   // لا يعدّل المصفوفة الأصلية
  });
  it('شاشة القياس تستعملها بدل ترتيب مكتوب داخلها', () => {
    const src = api('participant.ts');
    expect(src).toMatch(/import \{ servedOrder \} from '\.\/answer-review\.js';/);
    expect(src).toMatch(/qs = servedOrder\(qs\);/);
    expect(src).not.toMatch(/const tierOrder = \['behavior', 'skill', 'knowledge'\]/);
  });
});

describe('answerClass: من درجة الخيار في البنك (scoreFor)', () => {
  const q = choice('q', 'impact', 'skill', 1, [0, 2, 4, 1]);
  it('الاختيار: كاملة وجزئية وخاطئة', () => {
    expect(answerClass(q, 2)).toBe('full');
    expect(answerClass(q, 1)).toBe('partial');
    expect(answerClass(q, 0)).toBe('wrong');
    expect(answerClass(q, 9)).toBeNull();
  });
  it('الممارسة: «لا ينطبق» بدرجة سالبة، وغيرها تقدير ذاتي بلا صواب وخطأ', () => {
    expect(answerClass(likert('b', 'impact', 1), 5)).toBe('na');
    expect(answerClass(likert('b', 'impact', 1), 4)).toBe('likert');
  });
});

describe('estimateTimes: الفاصل بين حفظين متتاليين، ولا رقم حيث لا يصح', () => {
  const T = Date.parse('2026-11-02T10:00:00Z');
  const s = (sec) => T + sec * 1000;
  const q = (id, dimension, tier = 'skill') => ({ id, dimension, tier });
  it('المسار الطبيعي: لكل سؤال فاصله عن سابقه، وتغيّر الجانب داخل البُعد لا يقطعه', () => {
    const r = estimateTimes([{ ...q('a', 'milestone', 'behavior'), at: s(30) }, { ...q('b', 'milestone', 'behavior'), at: s(37) }, { ...q('c', 'milestone', 'skill'), at: s(60) }], T);
    expect(r).toEqual([{ seconds: null, note: 'first', edited: false }, { seconds: 7, note: null, edited: false }, { seconds: 23, note: null, edited: false }]);
  });
  it('أول كل بُعد يشمل الاستراحة، والانقطاع فوق 5 دقائق بلا رقم', () => {
    const r = estimateTimes([{ ...q('a', 'milestone'), at: s(10) }, { ...q('b', 'impact'), at: s(400) }, { ...q('c', 'impact'), at: s(400 + IDLE_SECONDS + 1) }, { ...q('d', 'impact'), at: s(400 + IDLE_SECONDS + 13) }], T);
    expect(r.map((x) => x.note)).toEqual(['first', 'break', 'gap', null]);
    expect(r[3].seconds).toBe(12);
  });
  it('الإجابة المعدّلة بعد ما يليها: ↺ بلا رقم، وما يليها مباشرة بلا رقم كذلك', () => {
    const r = estimateTimes([{ ...q('a', 'milestone'), at: s(10) }, { ...q('b', 'milestone'), at: s(200) }, { ...q('c', 'milestone'), at: s(30) }, { ...q('d', 'milestone'), at: s(41) }], T);
    expect(r.map((x) => [x.note, x.seconds, x.edited])).toEqual([['first', null, false], ['edited', null, true], ['after_edit', null, false], [null, 11, false]]);
  });
});

describe('reviewAnswers: الأقسام والتصنيف و«سريع» والمجاميع', () => {
  const T = Date.parse('2026-11-02T10:00:00Z');
  const iso = (sec) => new Date(T + sec * 1000).toISOString();
  const qs = [likert('b1', 'impact', 1), likert('b2', 'impact', 2), likert('b3', 'impact', 3), choice('k1', 'impact', 'knowledge', 1), choice('k2', 'impact', 'knowledge', 2), choice('k3', 'impact', 'knowledge', 3), choice('k4', 'impact', 'knowledge', 4), choice('x', 'leadership', 'knowledge', 1)];
  const rows = [
    { question_id: 'b1', value: { k: 4 }, answered_at: iso(20) },
    { question_id: 'b2', value: { k: 5 }, answered_at: iso(21) },          // لا ينطبق، بعد ثانية (دون 1.5)
    { question_id: 'b3', value: { k: 3 }, answered_at: iso(30) },
    { question_id: 'k1', value: { k: 2 }, answered_at: iso(50) },          // كاملة 20ث
    { question_id: 'k2', value: { k: 1 }, answered_at: iso(70) },          // جزئية 20ث
    { question_id: 'k3', value: { k: 0 }, answered_at: iso(74) },          // خاطئة 4ث: فوق 3ث، ودون 30٪ من الوسيط 20
    { question_id: 'k4', value: { k: 2 }, answered_at: iso(94) },          // كاملة 20ث
    { question_id: 'zz', value: { k: 0 }, answered_at: iso(95) },          // سؤال ليس في الأداة: يُهمل
  ];
  const r = reviewAnswers({ questions: qs, rows, startedAt: iso(0), submittedAt: iso(30 * 60), results: { impact: { knowledge: 62.5, skill: null, behavior: 70 } } });
  it('المعروض هو المجاب بترتيب العرض، والخيارات بترتيبها الأصلي مع درجاتها وعلامة أعلاها', () => {
    expect(r.items.map((x) => x.id)).toEqual(['b1', 'b2', 'b3', 'k1', 'k2', 'k3', 'k4']);
    const k2 = r.items.find((x) => x.id === 'k2');
    expect(k2.options.map((o) => [o.label, o.score, o.best])).toEqual([['خيار 0', 0, false], ['خيار 1', 1, false], ['خيار 2', 4, true], ['خيار 3', 0, false]]);
    expect(k2).toMatchObject({ k: 1, score: 1, max_score: 4, class: 'partial', order: 5, section: 'impact:knowledge' });
    expect(r.items.find((x) => x.id === 'b2').options[5]).toMatchObject({ na: true, best: false });
  });
  it('«سريع»: دون الحد الأدنى للقراءة، أو دون 30٪ من وسيط القسم', () => {
    expect(FAST_FLOOR_SECONDS).toEqual({ choice: 3, likert: 1.5 });
    expect(r.items.filter((x) => x.fast).map((x) => x.id)).toEqual(['b2', 'k3']);
  });
  it('الأقسام بنسبها من assessment_results، وعدد الخاطئ والجزئي و«لا ينطبق» والسريع والزمن', () => {
    expect(r.sections.map((s) => s.key)).toEqual(['impact:behavior', 'impact:knowledge']);
    expect(r.sections[1]).toMatchObject({ pct: 62.5, count: 4, full: 2, partial: 1, wrong: 1, fast: 1, seconds: 64, timed: 4, median: 20 });
    expect(r.sections[0]).toMatchObject({ pct: 70, na: 1, fast: 1, timed: 2, seconds: 10 });
    expect(r.totals).toMatchObject({ count: 7, wrong: 1, partial: 1, na: 1, fast: 2, edited: 0, wall_seconds: 1800, active_seconds: 74 });
  });
  it('بلا نتائج مخزّنة تُحسب النسب بـtierPercents نفسها', () => {
    const own = reviewAnswers({ questions: qs, rows });
    expect(own.sections[1].pct).toBe(56.25);   // (4 + 1 + 0 + 4) من 16
  });
  it('CSV بأعمدة القسم والرمز والسؤال والإجابة والدرجة والزمن والعلامات', () => {
    const { head, rows: out } = reviewCsvRows(r, (d) => d.toUpperCase());
    expect(head).toEqual(['الترتيب', 'القسم', 'الرمز', 'السؤال', 'الإجابة', 'قبل البرنامج', 'الدرجة', 'الأعلى', 'التصنيف', 'الزمن بالثواني', 'علامات']);
    expect(out[5]).toEqual([6, 'IMPACT · المعرفة', 'K3', 'سؤال k3', 'خيار 0', '', 0, 4, 'خاطئة', 4, 'سريع']);
    expect(out[0][10]).toBe('أول سؤال في القياس: يشمل قراءة المقدمة');
  });
  it('الزمن بصيغة عربية مختصرة', () => {
    expect([secondsAr(null), secondsAr(4), secondsAr(250), secondsAr(120), secondsAr(3725)]).toEqual(['—', '4ث', '4د 10ث', '2د', '1س 2د']);
  });
});

describe('الصلاحية والسجل: المفتاح للمدير ذي الكتابة ولمستشار الدفعة فيمن يشرف عليهم، وكل اطلاع مسجَّل', () => {
  const admin = api('admin.ts');
  const body = (src, name) => src.slice(src.indexOf(`export async function ${name}`), src.indexOf('\n}\n', src.indexOf(`export async function ${name}`)));
  it('admin.assessment-answers يرفض دور العرض، ويمر بالدالة المشتركة', () => {
    expect(api('index.ts')).toMatch(/'admin\.assessment-answers': \(a, b\) => A\.assessmentAnswers\(a, b\)/);
    expect(body(admin, 'assessmentAnswers')).toMatch(/if \(!canWrite\(a\)\) throw new Fail\('إجابات القياس للمدير وحده، لا لدور العرض', 403/);
    expect(body(admin, 'assessmentAnswers')).toMatch(/answersReview\(/);
  });
  it('xp.assessment-answers لمستشار الدفعة وحده (requireAdvisorOf)، بالدالة نفسها', () => {
    expect(api('index.ts')).toMatch(/'xp\.assessment-answers': \(e, b\) => FL\.assessmentAnswers\(e, b\)/);
    const fb = body(api('file.ts'), 'assessmentAnswers');
    expect(fb).toMatch(/await requireAdvisorOf\(e, pid\);[\s\S]*answersReview\(pid, b\.assessment_id/);
  });
  it('كل اطلاع يُكتب في السجل قبل الرد، بقياس المشارك وحده', () => {
    const core = body(admin, 'answersReview');
    expect(core).toMatch(/\.eq\('participant_id', participantId\)\.eq\('status', 'submitted'\)/);
    expect(core).toMatch(/await audit\(viewer\.type, viewer\.email, viewer\.action, 'participants', participantId, null, \{ assessment_id: a\.id \}\)/);
    expect(core.indexOf('await audit(')).toBeLessThan(core.indexOf('return {'));
  });
  it('التصدير CSV للمدير وحده: لا تصدير في نافذة المستشار', () => {
    expect(read('admin-app/src/screens/AssessmentAnswers.jsx')).toMatch(/reviewCsvRows/);
    expect(read('leaders-app/src/screens/ExpertAnswers.jsx')).not.toMatch(/reviewCsvRows|csv|CSV|download/);
  });
});

describe('الزمن لا يدخل أي قرار آلي (قرار المالك 2026-11-11)', () => {
  const logic = api('logic.js');
  const fnBody = (src, name) => { const i = src.indexOf(`export function ${name}`); return src.slice(i, src.indexOf('\n}\n', i)); };
  it('منطق التسكين لا يستورد المراجعة ولا يقرأ وقت الحفظ', () => {
    expect(logic).not.toMatch(/answer-review|answered_at/);
    for (const f of ['evaluatePlacement', 'placementFromAnswers', 'itemsToFlip', 'acquiescenceFor', 'tierPercents']) {
      expect(fnBody(logic, f), f).not.toMatch(/answered_at|seconds|fast|timing/);
    }
  });
  it('إرسال القياس واعتماد المستوى لا يقرآن الزمن', () => {
    const p = api('participant.ts');
    const submit = p.slice(p.indexOf('export async function assessmentSubmit'), p.indexOf('\n}\n', p.indexOf('export async function assessmentSubmit')));
    expect(submit).not.toMatch(/answered_at|answer-review|reviewAnswers|estimateTimes/);
    const admin = api('admin.ts');
    const approve = admin.slice(admin.indexOf('export async function approve'), admin.indexOf('\n}\n', admin.indexOf('export async function approve')));
    expect(approve).not.toMatch(/answered_at|reviewAnswers|estimateTimes/);
    // participant.ts لا يأخذ من المراجعة إلا ترتيب العرض
    expect(p.match(/from '\.\/answer-review\.js'/g)).toHaveLength(1);
    expect(p).toMatch(/import \{ servedOrder \} from '\.\/answer-review\.js'/);
  });
});
