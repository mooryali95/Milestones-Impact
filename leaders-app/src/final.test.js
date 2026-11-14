import { describe, expect, it } from 'vitest';
import {
  approvalState, cleanAdjust, cleanFinalConfig, computeFinal, decisionFor, finalComponents, finalConfig, FINAL_DEFAULTS, measureScore, voteBlock,
} from '../../supabase/functions/leaders-api/logic.js';

// المكسب كما كان قبل D06 صريحًا، والافتراضي الآن الإتقان المحكّي
const GAIN = { measure: { mode: 'gain' } };
const src = {
  continuous: { index: 80, components: [{ label: 'اختبارات الكتيب', value: 80, in_index: true }, { label: 'النماذج', value: 60, in_index: true }, { label: 'المختبر', value: 30, in_index: false }], trend: { dir: 'up' } },
  milestones: { total: 4, done: 3, late: 1, max_late: 5, done_late: 1, max_done_late: 10 },
  capstone: { score: 72.4 },
  post: { pct: 66, test_pre: 50, test_post: 62, direction: 'up' },
};

describe('التقييم الختامي', () => {
  it('يحسب كل مكوّن من مصدره ويشرحه؛ المنجز بعد موعده يُخصم كالمتأخر', () => {
    const c = finalComponents(src, GAIN);
    const by = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(by.milestones.value).toBe(50);   // (3 − 0.5 × (1 + 1)) / 4
    expect(by.milestones.reason).toContain('منها 1 بعد موعده');
    expect(by.milestones.reason).toContain('متأخر في 1 لم يُنجز');
    expect(by.continuous.reason).toContain('أضعفها النماذج');
    expect(by.project.value).toBe(72);
    expect(by.post).toMatchObject({ value: 100 });
    expect(by.post.reason).toContain('صاعد');
    // D06: الافتراضي الإتقان المحكّي من الاختبار الموضوعي البعدي وحده (62 مقابل 70)
    expect(finalComponents(src).find((x) => x.key === 'post')).toMatchObject({ value: 89 });
  });

  it('مكوّن القياس النهائي بطريقة البرنامج: مكسب موثوق، أو إتقان محكّي، أو مستوى', () => {
    const g = { ...FINAL_DEFAULTS.measure, mode: 'gain' };
    expect(FINAL_DEFAULTS.measure.mode).toBe('mastery');
    expect(measureScore({ ...src.post, direction: 'flat' }, g).value).toBe(60);
    expect(measureScore({ ...src.post, direction: 'down' }, g).value).toBe(20);
    // أثر السقف: بلغ المحك قبل البرنامج وبقي عليه فيُحسب صاعدًا
    const ceiling = measureScore({ pct: 85, test_pre: 78, test_post: 74, direction: 'flat' }, g);
    expect(ceiling.value).toBe(100);
    expect(ceiling.reason).toContain('أثر السقف');
    // D06: التراجع الموثوق يبقى تراجعًا ولو بقي فوق المحك (كان يُحوَّل إلى 100)
    const fell = measureScore({ pct: 85, test_pre: 90, test_post: 72, direction: 'down' }, g);
    expect(fell.value).toBe(20);
    expect(fell.reason).not.toContain('أثر السقف');
    // بلا زوج مقارن: إتقان محكّي بإعلان
    const noPair = measureScore({ pct: 66, test_post: 56, direction: null }, g);
    expect(noPair).toMatchObject({ value: 80 });
    expect(noPair.reason).toContain('لا قياس مبدئي مقارن');
    expect(measureScore(src.post, { mode: 'mastery', mastery_cut: 70 })).toMatchObject({ value: 89 });
    expect(measureScore({ pct: 66, test_post: 80 }, { mode: 'mastery', mastery_cut: 70 }).value).toBe(100);
    expect(measureScore(src.post, { mode: 'level' })).toMatchObject({ value: 66 });
    expect(measureScore(null, g).value).toBeNull();
  });

  it('يجمع بالأوزان ويقترح القرار', () => {
    const r = computeFinal(finalComponents(src), {});
    // (80*30 + 50*20 + 72*30 + 89*20) / 100 = 73.4، والقياس بالإتقان المحكّي (D06)
    expect(r.auto_score).toBe(73);
    expect(r.coverage).toBe(100);
    expect(r.suggested).toBe('pass');
    expect(r.config_version).toBe(1);
    expect(r.large_adjust).toBe(false);
  });

  it('قبل انتهاء الدفعة: الغائب لا يُحسب صفرًا ويُمنع الاقتراح دون حد التغطية', () => {
    const r = computeFinal(finalComponents({ continuous: src.continuous }), {});
    expect(r.auto_score).toBe(80);
    expect(r.coverage).toBe(30);
    expect(r.suggested).toBeNull();
    expect(r.missing.length).toBe(3);
    expect(r.zeroed).toEqual([]);
  });

  it('بعد انتهاء الدفعة: المشروع والقياس الغائبان صفر بإعلان، و«لم يجتز» لا يُقترح بلا دليل منهما', () => {
    const r = computeFinal(finalComponents({ continuous: src.continuous, milestones: src.milestones }), {}, {}, { ended: true });
    expect(r.zeroed).toEqual(['المشروع (وثيقة المبادرة بمعيارها)', 'القياس النهائي']);
    expect(r.coverage).toBe(100);
    expect(r.auto_score).toBe(34);   // (80*30 + 50*20 + 0 + 0) / 100
    expect(r.suggested).toBe('extend');
    expect(r.fail_blocked).toBe(true);
    expect(r.components.find((x) => x.key === 'post').reason).toContain('انتهت الدفعة فيُحسب صفرًا');
    // بدليل من المشروع وتغطية كافية يُقترح «لم يجتز»
    const f = computeFinal(finalComponents({ ...src, continuous: { index: 20, components: [] }, capstone: { score: 30 }, post: { pct: 40, test_post: 30, direction: 'down' } }), {}, {}, { ended: true });
    expect(f.suggested).toBe('fail');
    expect(f.fail_blocked).toBe(false);
  });

  it('تعديل الخبير يحتاج تعليلًا، ومخالفة المقترح تُعلَن، والتعديل الكبير يحتاج توقيعين', () => {
    const comps = finalComponents(src);
    expect(() => cleanAdjust({ components: { project: { value: 90, reason: '' } } }, comps)).toThrow();
    const adj = cleanAdjust({ components: { project: { value: 40, reason: 'المشروع لم يُطبَّق فعليًا في الجهة' } }, decision: { value: 'pass', reason: 'رأي اللجنة بعد العرض الحي للمبادرة' } }, comps);
    const r = computeFinal(comps, {}, adj);
    expect(r.components.find((x) => x.key === 'project')).toMatchObject({ auto: 72, value: 40, adjusted: true });
    expect(r.suggested).toBe('pass_notes');
    expect(r.decision).toBe('pass');
    expect(r.departs).toBe(true);
    const big = computeFinal(comps, {}, cleanAdjust({ score: { value: 95, reason: 'عرض استثنائي أمام الراعي والجهة' } }, comps));
    expect(big.large_adjust).toBe(true);
    expect(approvalState([{ by: 'a', vote: 'approve' }], {}, { largeAdjust: true })).toMatchObject({ done: false, need: 2 });
    expect(approvalState([{ by: 'a', vote: 'approve' }, { by: 'b', vote: 'approve' }], {}, { largeAdjust: true }).done).toBe(true);
  });

  // التدقيق 2026-11-11 (admin-eval-1): الدرجة «الآلية» كانت تُحسب بعد تعديل المكوّنات، فرفعها كلها
  // من 41 إلى 100 لا يُعد تعديلًا كبيرًا، ويُعتمد «اجتاز» بتوقيع واحد
  it('تعديل المكوّنات الكبير يحتاج توقيعين كتعديل الدرجة، والدرجة الآلية تبقى قبل أي تعديل', () => {
    const comp = (pairs) => pairs.map(([key, value]) => ({ key, value, reason: 'من مصدره', label: key }));
    const why = 'أداؤه في العرض الحي أعلى بكثير مما سُجّل';
    const comps = comp([['continuous', 40], ['milestones', 50], ['project', 35], ['post', 43]]);
    expect(computeFinal(comps, {})).toMatchObject({ auto_score: 41, suggested: 'fail', large_adjust: false });
    const lift = computeFinal(comps, {}, cleanAdjust({ components: Object.fromEntries(comps.map((c) => [c.key, { value: 100, reason: why }])) }, comps));
    expect(lift).toMatchObject({ auto_score: 41, formula_score: 100, score: 100, score_adjusted: true, suggested: 'pass', large_adjust: true });
    expect(approvalState([{ by: 'b@x.sa', vote: 'approve' }], {}, { largeAdjust: lift.large_adjust })).toMatchObject({ done: false, need: 2 });
    // تعديل صغير يبقى بتوقيع واحد: (40×30 + 50×20 + 60×30 + 43×20) / 100 = 48.6
    const small = computeFinal(comps, {}, cleanAdjust({ components: { project: { value: 60, reason: why } }, notes_to_participant: 'استكمل المشروع بمعياره ثم تُعاد المراجعة' }, comps));
    expect(small).toMatchObject({ auto_score: 41, score: 49, large_adjust: false });
    // الصفر المعلن بعد انتهاء الدفعة آلي: تعديله لا يُسقطه من الآلية فيخفي الفرق (56 ← 86)
    const gap = comp([['continuous', 80], ['milestones', 80], ['project', null], ['post', 80]]);
    const ended = { ended: true };
    expect(computeFinal(gap, {}, {}, ended)).toMatchObject({ auto_score: 56, zeroed: ['project'] });
    const filled = computeFinal(gap, {}, cleanAdjust({ components: { project: { value: 100, reason: why } } }, gap, ended), ended);
    expect(filled).toMatchObject({ auto_score: 56, score: 86, large_adjust: true, zeroed: [] });
    expect(filled.components.find((x) => x.key === 'project')).toMatchObject({ auto: 0, value: 100, adjusted: true });
    // لا درجة آلية أصلًا: الدرجة كلها من الخبير فتحتاج توقيعين
    const none = comp([['continuous', null], ['milestones', null], ['project', null], ['post', null]]);
    const manual = computeFinal(none, {}, cleanAdjust({ components: Object.fromEntries(none.map((c) => [c.key, { value: 75, reason: why }])) }, none));
    expect(manual).toMatchObject({ auto_score: null, score: 75, large_adjust: true });
    expect(computeFinal(none, {})).toMatchObject({ score: null, large_adjust: false });
  });

  it('«اجتاز بملاحظات» و«يُمدَّد» و«لم يجتز» تلزمها ملاحظات تصل المشارك', () => {
    const comps = finalComponents(src);
    expect(() => cleanAdjust({ decision: { value: 'extend', reason: 'ينقصه تسليم المبادرة كاملة' } }, comps)).toThrow(/ملاحظات تصل المشارك/);
    const ok = cleanAdjust({ decision: { value: 'extend', reason: 'ينقصه تسليم المبادرة كاملة' }, notes_to_participant: 'سلّم وثيقة المبادرة بمعالمها خلال شهر ثم تُعاد المراجعة' }, comps);
    expect(ok.notes_to_participant).toContain('سلّم وثيقة');
    expect(cleanAdjust({}, comps).notes_to_participant).toBeUndefined();   // المقترح «اجتاز» لا يلزمه
    expect(computeFinal(comps, {}, ok).notes_to_participant).toContain('سلّم');
  });

  it('الحدود والإعداد وإصدار المعادلة', () => {
    expect(decisionFor(45, FINAL_DEFAULTS.thresholds)).toBe('extend');
    expect(decisionFor(44, FINAL_DEFAULTS.thresholds)).toBe('fail');
    expect(() => cleanFinalConfig({ thresholds: { pass: 50, pass_notes: 60, extend: 40 } })).toThrow();
    expect(() => cleanFinalConfig({ weights: { continuous: 0, milestones: 0, project: 0, post: 0 } })).toThrow();
    expect(() => cleanFinalConfig({ measure: { gain_scores: { up: 50, flat: 60, down: 20 } } })).toThrow();
    expect(() => cleanFinalConfig({ approval: 'committee_majority', committee_size: 3, committee: 'a@x.sa, b@x.sa' })).toThrow();
    const c = cleanFinalConfig({ approval: 'committee_majority', committee_size: 3, committee: 'A@x.sa, b@x.sa,c@x.sa', sources: { experts: 1, quizzes: 2 } }, { version: 3 });
    expect(c.version).toBe(4);
    expect(c.effective_from).toMatch(/^\d{4}-/);
    expect(c.committee).toEqual(['a@x.sa', 'b@x.sa', 'c@x.sa']);
    // أسماء بدل البريد لا تُفرغ اللجنة بصمت فتفتح الاعتماد لأي حساب إدارة: يُرفض الحفظ ويُسمّى ما ليس بريدًا
    expect(() => cleanFinalConfig({ approval: 'committee_majority', committee_size: 3, committee: 'أحمد، سارة، خالد' })).toThrow(/ليست بريدًا: أحمد، سارة، خالد/);
    expect(() => cleanFinalConfig({ approval: 'committee_majority', committee_size: 3, committee: ['a@x.sa', 'b@x.sa', 'سارة'] })).toThrow(/ليست بريدًا: سارة/);
    expect(cleanFinalConfig({ approval: 'committee_majority', committee_size: 3, committee: ' , ' }).committee).toEqual([]);
    expect(c.sources.experts).toBeUndefined();   // الانخراط خارج المؤشر
    expect(finalConfig({}).measure).toEqual({ mode: 'mastery', gain_scores: { up: 100, flat: 60, down: 20 }, mastery_cut: 70 });
    // D17: كاتون بوزن صفر صريح في الدفعة الأولى
    expect(finalConfig({}).sources.katon).toBe(0);
    expect(FINAL_DEFAULTS.sources.katon).toBe(0);
    expect(finalConfig({ measure: { mode: 'mastery', mastery_cut: 65 } }).measure.mode).toBe('mastery');
  });

  it('الاعتماد: خبير، أو لجنة بالأغلبية، أو بالإجماع؛ ولا يعتمد المُعدِّل نفسه ولا غير أعضاء اللجنة', () => {
    const v = (...xs) => xs.map((x, i) => ({ by: `a${i}`, vote: x }));
    expect(approvalState(v('approve'), {}).done).toBe(true);
    expect(approvalState(v('approve'), { approval: 'committee_majority', committee_size: 3 }).done).toBe(false);
    expect(approvalState(v('approve', 'approve'), { approval: 'committee_majority', committee_size: 3 }).done).toBe(true);
    expect(approvalState(v('approve', 'approve', 'return'), { approval: 'committee_unanimous', committee_size: 3 })).toMatchObject({ done: false, returned: true });
    const rec = { submitted_by: 'x@x.sa', adjust: { components: { project: { value: 40, reason: 'سبب كافٍ للتعديل' } } } };
    expect(voteBlock('x@x.sa', rec, {})).toMatch(/لا يعتمده بنفسه/);
    expect(voteBlock('y@x.sa', rec, {})).toBeNull();
    expect(voteBlock('x@x.sa', { submitted_by: 'x@x.sa', adjust: {} }, {})).toBeNull();
    expect(voteBlock('y@x.sa', rec, { approval: 'committee_majority', committee_size: 2, committee: ['a@x.sa', 'b@x.sa'] })).toMatch(/أعضاء اللجنة/);
    expect(voteBlock('a@x.sa', rec, { approval: 'committee_majority', committee_size: 2, committee: ['a@x.sa', 'b@x.sa'] })).toBeNull();
  });

  it('D06: تعذر المقارنة يُوسم ولا يُستعاض باختبار خام، ويُحجب اقتراح القرار', () => {
    const c = finalComponents({ ...src, post: { ...src.post, failed: true } });
    const post = c.find((x) => x.key === 'post');
    expect(post).toMatchObject({ value: null, failed: true });
    expect(post.reason).toContain('تعذر حساب');
    const r = computeFinal(c, {});
    expect(r.suggested).toBeNull();
    expect(r.failed).toEqual(['القياس النهائي']);
  });
});

import { PASSING, statusAfterFinal, statusAfterReopen } from '../../supabase/functions/leaders-api/final.js';
import { readFileSync as readSrc } from 'node:fs';
import { join as joinPath } from 'node:path';
const apiSrc = (f) => readSrc(joinPath(__dirname, '../../supabase/functions/leaders-api', f), 'utf8');
describe('حالة المشارك تتبع قرار التقييم الختامي (تدقيق الرحلة 2026-11-14)', () => {
  it('الاجتياز يجعله «أنهى البرنامج»، وغيره لا يغيّر الحالة', () => {
    expect(statusAfterFinal('enrolled', 'pass')).toBe('completed');
    expect(statusAfterFinal('placed', 'pass_notes')).toBe('completed');
    expect(statusAfterFinal('enrolled', 'extend')).toBeNull();
    expect(statusAfterFinal('enrolled', 'fail')).toBeNull();
  });
  it('الموقوف والمنسحب لا تُغيَّر حالتهما بقرار، ومن أنهى لا يُعاد ضبطه', () => {
    expect(statusAfterFinal('suspended', 'pass')).toBeNull();
    expect(statusAfterFinal('withdrawn', 'pass')).toBeNull();
    expect(statusAfterFinal('completed', 'pass')).toBeNull();
  });
  it('إعادة الفتح تعيد من أنهى إلى «في البرنامج» حتى يُعتمد من جديد', () => {
    expect(statusAfterReopen('completed')).toBe('enrolled');
    expect(statusAfterReopen('suspended')).toBeNull();
  });
  it('قائمة الاجتياز واحدة: الشهادة والحالة تقرآنها من final.js', () => {
    expect(PASSING).toEqual(['pass', 'pass_notes']);
    const cert = apiSrc('certificates.ts');
    expect(cert).not.toMatch(/PASSING = \[/);
    const fin = apiSrc('final.ts');
    expect(fin).toMatch(/statusAfterFinal\(p\.status, decision\)/);
    expect(fin).toMatch(/statusAfterReopen\(p\.status\)/);
  });
});
