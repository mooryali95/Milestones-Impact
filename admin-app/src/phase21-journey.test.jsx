// @vitest-environment jsdom
// المرحلة 21 من تصور «الرحلة والمتطلبات» و«المسار» (2026-11-27): المصطلحات الواحدة، والعرض الواحد لمحرر الرحلة،
// وطي المعالم المطابقة للافتراض بدالتها
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reply = {};
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  L: vi.fn((action) => Promise.resolve(reply[action] ?? { success: true })),
}));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('') }) }));

const { Journey } = await import('./screens/Methodology.jsx');
const { foldMilestones, isDefaultMilestone, journeyBoard } = await import('./methodology.js');
const labels = await import('../../supabase/functions/leaders-api/labels.js');
const { activityNameAr, journeyCoherence, stageRuleSummary } = await import('../../supabase/functions/leaders-api/journey.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const mount = async (el) => { await act(async () => root.render(el)); await flush(); };
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

const SVC = { mode: 'on_demand', unlock: 'always', complete: 'any', lane: 'service' };
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 28, active: true },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 3, duration_days: 14, active: true, rules: SVC },
  { key: 'support', title_ar: 'الدعم', phase: 'impact', sort: 4, duration_days: 60, active: true, rules: { mode: 'optional' } },
];
const LONG = 'قراءة الباب الأول من كل إطار من أطر القيادة الثلاثة مع اختبار قصير بعد كل باب يُحتسب في رحلتك';
const reqs = [
  { id: 'r1', code: 'P-INFO', stage_key: 'profile', kind: 'auto', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: LONG, sort: 1, active: true },
  { id: 'r3', code: 'T-UP', stage_key: 'training', kind: 'upload', required: false, needs_review: true, title_ar: 'ارفع خطتك', sort: 2, active: true },
  { id: 'r4', code: 'C-MEET', stage_key: 'consult', kind: 'coaching', required: false, title_ar: 'لقاء استشاري', sort: 1, active: true },
];
const catalog = { program_id: 'p1', assessment_minutes: 20, learning_models: [], lab_links: [], journey_stages: stages, stage_requirements: reqs };
// المعالم العشرة كما يولدها «معلم لنهاية كل مرحلة» (Milestones.jsx: seed)
const TEN = Array.from({ length: 10 }, (_, i) => ({ key: `s${i + 1}`, title_ar: `مرحلة ${i + 1}`, phase: 'qualification', sort: i + 1, active: true }));
const tenMs = TEN.map((s, i) => ({ id: `m${i + 1}`, title_ar: `نهاية ${s.title_ar}`, stage_key: s.key, anchor: 'stage_end', complete: 'stage', offset_days: 0, active: true }));

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); reply = {}; });

describe('المصطلحات من مصدر واحد (labels.js)', () => {
  it('نوع المرحلة: أساسية وعند الطلب وإضافية، بالقيم المخزنة نفسها', () => {
    expect(labels.STAGE_MODE_AR).toEqual({ required: 'أساسية', on_demand: 'عند الطلب', optional: 'إضافية' });
  });
  it('ACTIVITY_KIND_AR مصدر واحد: لا يتشارك نوعان اسمًا، ولا خريطة ثانية للإدارة', () => {
    const v = Object.values(labels.ACTIVITY_KIND_AR);
    expect(new Set(v).size).toBe(v.length);
    expect(labels.ACTIVITY_KIND_ADMIN_AR).toBeUndefined();
    expect(labels.ACTIVITY_KIND_AR.workshop).toBe('جلسة جماعية');
    expect(labels.COMPLETION_AR.auto).toBe('يكتمل تلقائيًا');
    expect(labels.PARALLEL_SERVICE_AR).toBe('خدمة موازية');
  });
  it('ملخص القاعدة يقرأ STAGE_MODE_AR، والخدمة «خدمة موازية»، و«نشاط» بدل «متطلب»', () => {
    expect(stageRuleSummary(stages[1], stages)).toBe('أساسية · تُفتح بعد اكتمال الإلزامية قبلها · تكتمل بأنشطتها الإلزامية');
    expect(stageRuleSummary(stages[3], stages)).toMatch(/^إضافية · /);
    expect(stageRuleSummary(stages[2], stages)).toMatch(/^خدمة موازية · /);
    for (const s of stages) expect(stageRuleSummary(s, stages)).not.toMatch(/متطلب|عند الحاجة|اختيارية مقترحة/);
  });
  it('الأسطح الإدارية لا تكتب المصطلحات القديمة ولا الرمز التقني نصًا', () => {
    const m = src('./screens/Methodology.jsx');
    for (const bad of ['عند الحاجة', 'اختيارية مقترحة', 'آلي من حالة المشارك', '<code>{r.code}</code>', "'+ متطلب'", '>+ متطلب<']) expect(m).not.toContain(bad);
    expect(src('../../supabase/functions/leaders-api/labels.js')).not.toContain('آلي من حالة المشارك');
  });
});

describe('رسائل الاتساق بلا رموز تقنية', () => {
  it('اسم النشاط لا رمزه، ولا رموز النص', () => {
    expect(activityNameAr({ code: 'O-SESS', title_ar: '{sessions:O-SESS} مع موجهك' })).toBe('«… مع موجهك»');
    const st = [{ key: 'profile', title_ar: 'الملف', phase: 'admission', sort: 1, active: true }, { key: 'ojt', title_ar: 'التوجيه', phase: 'impact', sort: 2, duration_days: 3, active: true, description_ar: 'مدة {assessment_minutes}' }];
    const rq = [
      { id: 'a', code: 'P-INFO', stage_key: 'profile', kind: 'auto', required: true, title_ar: 'الملف', active: true },
      { id: 'b', code: 'P-XTRA', stage_key: 'profile', kind: 'upload', required: true, title_ar: 'ارفع هويتك', active: true },
      { id: 'c', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات {days:NOPE}', active: true, config: { sessions_required: 6, minutes: 300 } },
    ];
    const out = journeyCoherence(st, rq, { assessmentMinutes: null });
    expect(out.length).toBeGreaterThan(2);
    for (const x of out) {
      expect(x.msg).not.toMatch(/P-INFO|P-XTRA|O-SESS|NOPE|\{[a-z_]+(?::[A-Z-]+)?\}/);
      expect(x.msg).not.toContain('متطلب');
    }
    expect(out.find((x) => x.req === 'P-XTRA').msg).toMatch(/^«ارفع هويتك»: نشاط إلزامي في «الملف»/);
  });
});

describe('العرض الواحد', () => {
  it('journeyBoard: ثلاثة محاور بالترتيب، والخدمة الموازية خارجها', () => {
    const b = journeyBoard(stages);
    expect(b.phases.map((p) => p.key)).toEqual(['admission', 'qualification', 'impact']);
    expect(b.phases[1].stages.map((s) => s.key)).toEqual(['training']);
    expect(b.services.map((s) => s.key)).toEqual(['consult']);
  });
  it('بطاقات المحاور بأسماء الأنشطة كاملة، بلا رمز ظاهر، وشريط الخدمة الموازية والمفتاح والشريط القصير', async () => {
    reply = { 'admin.milestones': { success: true, milestones: [] } };
    await mount(<Journey catalog={catalog} reload={() => {}} canWrite onProgram={() => {}} />);
    const axes = [...host.querySelectorAll('.j-board > .j-axis')];
    expect(axes.map((a) => a.querySelector('h3').textContent)).toEqual(['القبول', 'التأهيل', 'الأثر']);
    const row = host.querySelector('#jreq-r2');
    expect(row.querySelector('.j-act-name').textContent).toBe(LONG);
    expect(row.getAttribute('title')).toBe('T-READ');
    expect(row.className).toContain('req-must');
    expect(host.querySelector('#jreq-r3').className).toContain('req-opt');
    expect(host.querySelector('#jreq-r3').textContent).toContain('اختياري');
    expect(host.querySelector('#jreq-r3').textContent).toContain('يحتاج مراجعة');
    expect(host.querySelector('#jreq-r1').textContent).toContain('يكتمل تلقائيًا');
    expect(host.querySelector('.j-board').textContent).not.toMatch(/P-INFO|T-READ|T-UP/);
    expect(host.querySelector('code')).toBeNull();
    const svc = host.querySelector('.j-service');
    expect(svc.querySelector('h3').textContent).toBe('خدمة موازية');
    expect(svc.textContent).toContain('متاحة طوال الرحلة ولا تحجب ما بعدها');
    expect(svc.textContent).toContain('لقاء استشاري');
    expect(host.querySelector('.j-board').textContent).not.toContain('لقاء استشاري');
    const key = host.querySelector('.j-key');
    for (const w of ['إلزامي', 'اختياري', 'يكتمل تلقائيًا', 'يحتاج مراجعة']) expect(key.textContent).toContain(w);
    for (const kind of Object.keys(labels.ACTIVITY_KIND_AR)) {
      const dd = key.querySelector(`.j-key-kind[data-kind="${kind}"]`);
      expect(dd.querySelector('svg.ico-svg')).toBeTruthy();
      expect(dd.textContent).toBe(labels.ACTIVITY_KIND_AR[kind]);
    }
    expect(host.querySelector('#jreq-r2 [data-kind="reading"] svg.ico-svg')).toBeTruthy();
    const bars = [...host.querySelectorAll('.j-strip-bar')];
    expect(bars.map((b) => b.textContent)).toEqual(['الملف الشخصي', 'التدريب', 'الدعم']);
    expect(host.querySelector('.j-strip').textContent).not.toContain('أكمل ملفك');
    // تفصيل الأنشطة الزمني مطوي، والجدول البديل لقارئ الشاشة يبقى داخله
    expect(host.querySelector('details.j-tl-detail').open).toBe(false);
    // المرحلة 22: «+ نشاط» في وضع البناء وحده، ووضع العرض الافتراضي بلا أزرار تحرير
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === '+ نشاط')).toBe(false);
    expect(host.textContent).not.toContain('الترتيب بالأسهم');
  });
  it('كل aria-label في الرحلة يبدأ بنصه المرئي إن كان له نص', async () => {
    reply = { 'admin.milestones': { success: true, milestones: [] } };
    await mount(<Journey catalog={catalog} reload={() => {}} canWrite onProgram={() => {}} />);
    for (const el of host.querySelectorAll('.j-board [aria-label], .j-service [aria-label], .j-strip-wrap [aria-label]')) {
      const vis = el.textContent.trim();
      if (vis) expect(el.getAttribute('aria-label').startsWith(vis.slice(0, 8))).toBe(true);
    }
  });
});

describe('طي المعالم المطابقة', () => {
  it('المعالم العشرة كما تولَّد تُطوى كلها', () => {
    expect(tenMs.every((m) => isDefaultMilestone(m, TEN))).toBe(true);
    expect(foldMilestones(tenMs, TEN).folded).toHaveLength(10);
    expect(labels.milestonesFoldedAr(10)).toBe('10 معالم تتبع نهايات المراحل تلقائيًا');
  });
  it('لا يُطوى معلم مخالف: إزاحة، أو بداية مرحلة، أو اكتمال يدوي، أو مرحلة مفقودة، أو تاريخ', () => {
    const odd = [
      { ...tenMs[0], offset_days: 3 }, { ...tenMs[1], anchor: 'stage_start' }, { ...tenMs[2], complete: 'manual' },
      { ...tenMs[3], stage_key: 'gone' }, { ...tenMs[4], anchor: 'date', stage_key: null }, { ...tenMs[5], stage_key: null },
    ];
    for (const m of odd) expect(isDefaultMilestone(m, TEN)).toBe(false);
    const { folded, shown } = foldMilestones([...odd, tenMs[9]], TEN);
    expect(folded.map((m) => m.id)).toEqual(['m10']);
    expect(shown).toHaveLength(6);
  });
  it('في المحرر: سطر واحد ورابط «عرضها»، وشارة على بطاقة مرحلة المعلم المخالف', async () => {
    const ms = [
      { id: 'a', title_ar: 'نهاية التدريب', stage_key: 'training', anchor: 'stage_end', complete: 'stage', offset_days: 0, active: true },
      { id: 'b', title_ar: 'نهاية الدعم', stage_key: 'support', anchor: 'stage_end', complete: 'stage', offset_days: 0, active: true },
      { id: 'c', title_ar: 'تسليم الهيكل', stage_key: 'support', anchor: 'stage_end', complete: 'manual', offset_days: -5, active: true },
    ];
    reply = { 'admin.milestones': { success: true, milestones: ms } };
    await mount(<Journey catalog={catalog} reload={() => {}} canWrite onProgram={() => {}} />);
    const sec = host.querySelector('[aria-label="معالم البرنامج"]');
    expect(sec.querySelector('.j-ms-fold').textContent).toContain('معلمان يتبعان نهايتي مرحلتيهما تلقائيًا');
    expect([...sec.querySelectorAll('.la-reqs li')].map((li) => li.querySelector('b').textContent)).toEqual(['تسليم الهيكل']);
    const support = [...host.querySelectorAll('[data-mt-row]')].find((e) => e.dataset.mtRow === 'support');
    expect(support.textContent).toContain('معلم مخصص');
    const training = [...host.querySelectorAll('[data-mt-row]')].find((e) => e.dataset.mtRow === 'training');
    expect(training.textContent).not.toContain('معلم مخصص');
    const more = [...sec.querySelectorAll('button')].find((b) => b.textContent === 'عرضها');
    await act(async () => more.click());
    expect(sec.querySelectorAll('.la-reqs li')).toHaveLength(3);
  });
});

describe('ملاحظات المراجعة على المرحلة 21', () => {
  it('الخط الزمني للمشارك يقرأ ACTIVITY_KIND_AR نفسه بعد إصلاحه', async () => {
    const { journeyTimeline } = await import('../../supabase/functions/leaders-api/journey-timeline.js');
    expect(labels.ACTIVITY_KIND_AR.check).toBe('تدريب');
    expect(labels.ACTIVITY_KIND_AR.auto).toBe('آلي');
    const tl = JSON.stringify(journeyTimeline({ stages, requirements: [...reqs, { id: 'r5', code: 'T-WS', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'ورشة', sort: 3, active: true }] }, { title: 'رحلتك' }));
    expect(tl).toContain('جلسة جماعية');
  });
  it('مرحلة lane=track تظهر عمودًا في الشريط القصير بشارتها، وتنقل إلى بطاقتها، وارتفاع العمود 24px على الأقل', async () => {
    const withTrack = [...stages, { key: 'ojt', title_ar: 'التطبيق المستمر', phase: 'qualification', sort: 5, duration_days: 30, active: true, rules: { lane: 'track', unlock: 'with', with: 'training', until: 'journey_end' } }];
    reply = { 'admin.milestones': { success: true, milestones: [] } };
    await mount(<Journey catalog={{ ...catalog, journey_stages: withTrack }} reload={() => {}} canWrite onProgram={() => {}} />);
    const bar = [...host.querySelectorAll('.j-strip-bar')].find((b) => b.textContent.includes('التطبيق المستمر'));
    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain(labels.TRACK_ONLY_AR);
    for (const b of host.querySelectorAll('.j-strip-bar')) expect(parseFloat(b.style.blockSize)).toBeGreaterThanOrEqual(24);
    const card = host.querySelector('[data-mt-row="ojt"]');
    expect(card.getAttribute('aria-labelledby')).toBe('j-st-ojt');
    expect(host.querySelector('#j-st-ojt').textContent).toContain('التطبيق المستمر');
  });
  it('مرحلة بمحور غير معروف تظهر في «بلا محور» لا داخل التأهيل', () => {
    const b = journeyBoard([...stages, { key: 'x', title_ar: 'س', phase: 'legacy', sort: 9, active: true }]);
    expect(b.phases.find((p) => p.key === 'qualification').stages.map((s) => s.key)).not.toContain('x');
    const none = b.phases.at(-1);
    expect(none.orphan).toBe(true);
    expect(none.title).toBe('بلا محور');
    expect(none.stages.map((s) => s.key)).toEqual(['x']);
    expect(journeyBoard(stages).phases).toHaveLength(3);
  });
  it('رسالة الرمز المكسور تسمي الحقل وتحمل الرمز في token لا في النص', () => {
    const out = journeyCoherence([{ ...stages[1], description_ar: 'أنجز {sessions:X-OLD}' }], reqs);
    const e = out.find((x) => x.token === 'X-OLD');
    expect(e).toBeTruthy();
    expect(e.field).toBe('description_ar');
    expect(e.msg).toContain('الوصف');
    expect(e.msg).not.toContain('X-OLD');
  });
});
