// السحب في الدفعة (D1، تصور 2026-11-18 ب5.3): عكس المقياس (scaleDay لـscalePos) على المقياس المضغوط وخانة الأربعة عشر يومًا،
// وكل حركة إلى تعديل في المسودة نفسها (dropToEdit ثم mergeEdit ثم planDraft)، والرفض بسببه بلا تغيير في المسودة.
import { describe, expect, it } from 'vitest';
import { applyDrop, cohortTimeline, dragGhostAr, dropToEdit, mergeEdit, planDraft } from './cohort-journey.js';
import { scaleDay, scalePos, timelineWeight } from '../../supabase/functions/leaders-api/journey-timeline.js';

const TRACK = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'final' };
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'reading', title_ar: 'القراءة الموجهة', phase: 'qualification', sort: 4, duration_days: 7, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 5, duration_days: 28, active: true, rules: TRACK },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 6, duration_days: 60, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 7, duration_days: 7, active: true },
];
const def = { stages, requirements: [], sessions: [] };
const cohort = { id: 'c1', starts_on: '2026-11-02', ends_on: '2027-02-28', schedule: {} };
const EMPTY = { days: {}, off: {}, with: {}, offset: {}, until: {} };
const title = (k) => stages.find((s) => s.key === k)?.title_ar || k;
const stageOf = (k) => stages.find((s) => s.key === k);

const setup = (c = cohort, edit = EMPTY) => {
  const draft = planDraft({ def, cohort: c, edit });
  const model = cohortTimeline(def, draft.cohort, '2026-11-16');
  return { draft, model, scale: model.scale };
};
// النقاط المئوية التي تنقل يومًا d0 إلى d1 على المقياس (ما يفعله المؤشر)
const pctFor = (scale, d0, d1) => scalePos(scale.slots, d1) - scalePos(scale.slots, d0);
const drop = (o) => {
  const { draft, scale } = o.ctx;
  return dropToEdit({ scale, draft, key: o.key, kind: o.kind, pct: o.pct ?? null, shift: o.shift ?? 0, over: o.over ?? null, snap: o.snap || 'near', stage: stageOf(o.key), title });
};

describe('المقياس: scaleDay عكس scalePos قطعة قطعة', () => {
  const { scale } = setup();
  it('المقياس خاصية غير معدودة: لا يدخل في نسخ النموذج ولا لقطته', () => {
    const { model } = setup();
    expect(model.scale).toBeTruthy();
    expect(Object.keys(model)).not.toContain('scale');
    expect(JSON.stringify(model)).not.toContain('"scale"');
  });
  it('كل يوم داخل الخانات يعود يومه بعد الذهاب والعودة', () => {
    for (const s of scale.slots) {
      for (let d = s.from; d <= s.to; d++) expect(Math.round(scaleDay(scale.slots, scalePos(scale.slots, d)))).toBe(d);
    }
  });
  it('المقياس المضغوط: يوم في الدعم (60 يومًا) أضيق من يوم في التدريب (14)', () => {
    const tr = scale.slots.find((x) => x.key === 'training');
    const sp = scale.slots.find((x) => x.key === 'support');
    expect(timelineWeight(60)).toBeCloseTo(40.8);
    expect(sp.width / sp.days).toBeLessThan(tr.width / tr.days);
    // وفي الخانة المضغوطة يبقى العكس صحيحًا
    for (let d = sp.from; d <= sp.to; d += 5) expect(Math.round(scaleDay(scale.slots, scalePos(scale.slots, d)))).toBe(d);
  });
  it('خانة الأربعة عشر يومًا: اعتماد المستوى (3 أيام) يأخذ عرض 14 يومًا، ويعود كل يوم من أيامها الثلاثة', () => {
    const ap = scale.slots.find((x) => x.key === 'approval');
    expect(ap.days).toBe(3);
    const per = ap.width / ap.days;
    const tr = scale.slots.find((x) => x.key === 'training');
    expect(per).toBeGreaterThan(tr.width / tr.days);
    for (let d = ap.from; d <= ap.to; d++) expect(Math.round(scaleDay(scale.slots, scalePos(scale.slots, d)))).toBe(d);
    // الخانة الآنية (0 يوم) يومها وحده في أي نقطة منها
    const pr = scale.slots.find((x) => x.key === 'profile');
    expect(pr.days).toBe(0);
    expect(scaleDay(scale.slots, pr.at + pr.width / 3)).toBe(pr.from);
  });
  it('رتيبة، وتمتد قبل البداية وبعد النهاية بنسبة أقرب خانة', () => {
    let prev = -Infinity;
    for (let p = -10; p <= 110; p += 0.5) { const d = scaleDay(scale.slots, p); expect(d).toBeGreaterThanOrEqual(prev); prev = d; }
    expect(scaleDay(scale.slots, 105)).toBeGreaterThan(scale.end);
    expect(scaleDay(scale.slots, -2)).toBeLessThan(0);
  });
  it('نهاية الرحلة نهاية الدفعة في ملفها (بعد نهاية السلسلة)، ونهاية كل طور', () => {
    expect(scale.journey_end).toBeGreaterThan(scale.end);
    expect(Object.keys(scale.phase_ends)).toEqual(['admission', 'qualification', 'impact']);
  });
});

describe('dropToEdit: كل حركة إلى تعديل في المسودة', () => {
  it('طرف مرحلة متتابعة: المدة باليوم الصحيح، والمسودة مطابقة للعداد حرفًا بحرف', () => {
    const ctx = setup();
    const [f, e] = ctx.scale.spans.training;
    const r = drop({ ctx, key: 'training', kind: 'end', pct: pctFor(ctx.scale, e, e + 7) + 0.03 });
    expect(r.patch).toEqual({ days: { training: 21 } });
    const a = applyDrop({ def, cohort, edit: EMPTY, patch: r.patch });
    const byCounter = planDraft({ def, cohort, edit: mergeEdit(EMPTY, { days: { training: 21 } }, {}) });
    expect(a.edit).toEqual(mergeEdit(EMPTY, { days: { training: 21 } }, {}));
    expect(a.draft.rows.training.days).toBe(21);
    expect(a.draft.schedule).toEqual(byCounter.schedule);
    expect(a.draft.rows).toEqual(byCounter.rows);
    expect(r.ghost).toEqual([f, f + 21]);
  });
  it('طرف مرحلة: لا تنزل الإلزامية عن يوم، وتلتصق بحد خانة قريب', () => {
    const ctx = setup();
    const [, e] = ctx.scale.spans.final;
    const r = drop({ ctx, key: 'final', kind: 'end', pct: -50 });
    expect(r.patch).toEqual({ days: { final: 1 } });
    // التدريب ينتهي قرب نهاية خانته: يلتصق بها فلا يتغير
    const t = setup();
    const [, te] = t.scale.spans.training;
    expect(drop({ ctx: t, key: 'training', kind: 'end', pct: 0.2 }).none).toBe(true);
    expect(e).toBeGreaterThan(te);
  });
  it('بداية مرحلة متتابعة: تُرفض بتلميح «غيّر مدة ما قبلها»، والصفر لا شيء', () => {
    const ctx = setup();
    const r = drop({ ctx, key: 'support', kind: 'move', pct: 5 });
    expect(r.reject.code).toBe('sequential');
    expect(r.reject.msg).toContain('غيّر مدة ما قبلها');
    expect(drop({ ctx, key: 'support', kind: 'move', pct: 0 }).none).toBe(true);
  });
  it('بداية ممر «تسير مع»: الإزاحة بالأيام، محصورة من 0 إلى مدة مرجعها', () => {
    const ctx = setup();
    const [f] = ctx.scale.spans.reading;
    expect(drop({ ctx, key: 'reading', kind: 'move', pct: pctFor(ctx.scale, f, f + 3) + 0.02 }).patch).toEqual({ offset: { reading: 3 } });
    expect(drop({ ctx, key: 'reading', kind: 'move', pct: 80 }).patch).toEqual({ offset: { reading: 14 } });
    expect(drop({ ctx, key: 'reading', kind: 'move', pct: -20 }).none).toBe(true);
  });
  it('بداية المسار المستمر: إزاحته بلا سقف بمدة مرجعه', () => {
    const ctx = setup();
    const [f] = ctx.scale.spans.ojt;
    const r = drop({ ctx, key: 'ojt', kind: 'move', pct: pctFor(ctx.scale, f, f + 20) + 0.02 });
    expect(r.patch).toEqual({ offset: { ojt: 21 } });
  });
  it('طرف المسار: يلتصق بنهاية الرحلة ونهاية الطور، وإلا مدته بالأيام', () => {
    const ctx = setup();
    const s = ctx.scale;
    const [f, e] = s.spans.ojt;
    // ما زال عند نهاية الرحلة: لا شيء
    expect(drop({ ctx, key: 'ojt', kind: 'end', pct: 0.4 }).none).toBe(true);
    // إلى نهاية طور التأهيل
    const toPhase = drop({ ctx, key: 'ojt', kind: 'end', pct: scalePos(s.slots, s.phase_ends.qualification) - scalePos(s.slots, e) + 0.3 });
    expect(toPhase.patch).toEqual({ until: { ojt: 'phase:qualification' } });
    expect(toPhase.ghost).toEqual([f, s.phase_ends.qualification]);
    // إلى يوم بعيد عن الحدود: مدة بالأيام
    const mid = Math.round((s.phase_ends.qualification + s.slots.find((x) => x.key === 'support').to) / 2);
    const r = drop({ ctx, key: 'ojt', kind: 'end', pct: scalePos(s.slots, mid) - scalePos(s.slots, e) });
    expect(r.patch.until).toEqual({ ojt: 'days' });
    expect(r.patch.days.ojt).toBe(mid - f);
    const a = applyDrop({ def, cohort, edit: EMPTY, patch: r.patch });
    expect(a.draft.rows.ojt.until).toBe('days');
    expect(a.draft.rows.ojt.days).toBe(mid - f);
  });
  it('لوحة المفاتيح: اليوم بالضبط، والالتصاق باليوم المطابق وحده', () => {
    const ctx = setup();
    expect(drop({ ctx, key: 'training', kind: 'end', shift: 1, snap: 'exact' }).patch).toEqual({ days: { training: 15 } });
    expect(drop({ ctx, key: 'training', kind: 'end', shift: 7, snap: 'exact' }).patch).toEqual({ days: { training: 21 } });
    expect(drop({ ctx, key: 'reading', kind: 'move', shift: 2, snap: 'exact' }).patch).toEqual({ offset: { reading: 2 } });
    const t = drop({ ctx, key: 'ojt', kind: 'end', shift: -1, snap: 'exact' });
    expect(t.patch.until).toEqual({ ojt: 'days' });
  });
});

describe('مراجعة D1: حدود السحب', () => {
  // ممر عند الطلب أطول من خانته (30 يومًا مع تدريب 14): بين خانة التدريب والتي بعدها أيام، والممر يُرسم محصورًا في خانته
  const gapStages = stages.map((s) => (s.key === 'reading' ? { ...s, duration_days: 30, rules: { mode: 'on_demand', unlock: 'with', with: 'training' } } : s));
  const gdef = { stages: gapStages, requirements: [], sessions: [] };
  const gsetup = () => {
    const draft = planDraft({ def: gdef, cohort, edit: EMPTY });
    const model = cohortTimeline(gdef, draft.cohort, '2026-11-16');
    return { draft, scale: model.scale };
  };
  const gdrop = (ctx, o) => dropToEdit({ scale: ctx.scale, draft: ctx.draft, title, snap: 'near', pct: null, shift: 0, ...o, stage: gapStages.find((s) => s.key === o.key) });
  it('حدان في موضع واحد على المسار لا يقفز إليه الطرف عبر الفجوة: الصفر لا شيء', () => {
    const ctx = gsetup();
    expect(gdrop(ctx, { key: 'training', kind: 'end', pct: 0 }).none).toBe(true);
    expect(gdrop(ctx, { key: 'training', kind: 'end', pct: 0.1 }).none).toBe(true);
  });
  it('الممر الأوسع من خانته: المدة من مدته في المسودة زائد الحركة، لا من الشريط المحصور', () => {
    const ctx = gsetup();
    const [f, e] = ctx.scale.spans.reading;
    expect(ctx.draft.rows.reading.days).toBe(30);
    expect(e - f).toBeLessThan(30);
    expect(gdrop(ctx, { key: 'reading', kind: 'end', shift: 0, snap: 'exact' }).none).toBe(true);
    expect(gdrop(ctx, { key: 'reading', kind: 'end', shift: 1, snap: 'exact' }).patch).toEqual({ days: { reading: 31 } });
    expect(gdrop(ctx, { key: 'reading', kind: 'end', shift: -1, snap: 'exact' }).patch).toEqual({ days: { reading: 29 } });
    expect(gdrop(ctx, { key: 'reading', kind: 'end', pct: 0 }).none).toBe(true);
  });
  it('المرحلة الآنية: لا حركة لا تعديل، والضغط إلى الأقدم لا يجعلها يومًا', () => {
    const ctx = setup();
    expect(ctx.draft.rows.profile.days).toBe(0);
    for (const o of [{ shift: 0, snap: 'exact' }, { shift: -1, snap: 'exact' }, { pct: 0 }]) {
      expect(drop({ ctx, key: 'profile', kind: 'end', ...o }).none).toBe(true);
    }
    expect(drop({ ctx, key: 'profile', kind: 'end', shift: 1, snap: 'exact' }).patch).toEqual({ days: { profile: 1 } });
  });
  it('طرف المسار بعد آخر الخط: الحركة الصغيرة تغير أيامًا قليلة من نهايته الحقيقية، ونهاية الطور الأخير تُبلغ', () => {
    const ctx = setup();
    const s = ctx.scale;
    const [f, e] = s.spans.ojt;
    expect(e).toBe(s.journey_end);
    expect(e).toBeGreaterThan(s.end);
    for (const p of [-1, -1.3, -2]) {
      const r = drop({ ctx, key: 'ojt', kind: 'end', pct: p });
      const end = r.patch?.days ? f + r.patch.days.ojt : r.ghost[1];
      expect(end).toBeGreaterThan(e - 15);
      expect(end).toBeLessThanOrEqual(e);
    }
    // نهاية طور الأثر (نهاية السلسلة) قبل نهاية الرحلة، وكلتاهما عند 100% في الرسم: يُبلغ بالسحب نحوها
    let hit = null;
    for (let p = -0.1; p > -16 && !hit; p -= 0.1) {
      const r = drop({ ctx, key: 'ojt', kind: 'end', pct: p });
      if (r.patch?.until?.ojt === 'phase:impact') hit = r;
    }
    expect(hit?.ghost).toEqual([f, s.phase_ends.impact]);
  });
  it('لوحة المفاتيح: الحركة الفعلية بعد الحدود (applied)، فلا يتراكم الضغط وراء الحد', () => {
    const ctx = setup();
    const r = drop({ ctx, key: 'reading', kind: 'move', shift: 20, snap: 'exact' });
    expect(r.patch).toEqual({ offset: { reading: 14 } });
    expect(r.applied).toBe(14);
    expect(drop({ ctx, key: 'training', kind: 'end', shift: 3, snap: 'exact' }).applied).toBe(3);
  });
  it('المسار بلا مرجع يبدأ مع بداية الرحلة: رسالته عن المسار لا عن «ما قبلها»', () => {
    const noRef = stages.map((s) => (s.key === 'ojt' ? { ...s, rules: { lane: 'track', until: 'journey_end' } } : s));
    const d2 = { stages: noRef, requirements: [], sessions: [] };
    const draft = planDraft({ def: d2, cohort, edit: EMPTY });
    const model = cohortTimeline(d2, draft.cohort, '2026-11-16');
    const r = dropToEdit({ scale: model.scale, draft, key: 'ojt', kind: 'move', pct: 25, title });
    expect(r.reject.code).toBe('sequential');
    expect(r.reject.msg).toContain('يبدأ مع بداية الرحلة');
    expect(r.reject.msg).not.toContain('ما قبلها');
  });
  it('رفض المرجع بصيغة الشرط لا الخبر', () => {
    const ctx = setup();
    const bad = drop({ ctx, key: 'final', kind: 'move', pct: 0, over: { zone: 'stages', key: 'approval' } });
    expect(bad.reject.msg).toContain('المرجع يكون مرحلة متتابعة');
    expect(bad.reject.msg).not.toContain('وليست بوابة');
  });
});

describe('الرفض: بسببه، ولا تتغير المسودة', () => {
  it('مرحلة في «مسارات مستمرة» أو «الخدمات»: طبيعتها للبرنامج، برابط «غيّرها في البرنامج»', () => {
    const ctx = setup();
    for (const zone of ['tracks', 'services']) {
      const r = drop({ ctx, key: 'support', kind: 'move', pct: 0, over: { zone, key: null } });
      expect(r.reject.code).toBe('lane');
      expect(r.reject.program).toBe(true);
      expect(r.reject.msg).toContain('يقررها البرنامج');
    }
    // والمسار في صف المراحل بلا مرحلة تحته
    expect(drop({ ctx, key: 'ojt', kind: 'move', pct: 0, over: { zone: 'stages', key: null } }).reject.code).toBe('lane');
  });
  it('الإفلات على مرحلة: «تسير مع» من المرشحين وحدهم، والبوابة مرفوضة بسببها', () => {
    const ctx = setup();
    expect(drop({ ctx, key: 'final', kind: 'move', pct: 0, over: { zone: 'stages', key: 'support' } }).patch).toEqual({ with: { final: 'support' } });
    const bad = drop({ ctx, key: 'final', kind: 'move', pct: 0, over: { zone: 'stages', key: 'approval' } });
    expect(bad.reject.code).toBe('with_target');
    // المسار على مرحلة سابقة: «يبدأ مع» من مرشحيه
    expect(drop({ ctx, key: 'ojt', kind: 'move', pct: 0, over: { zone: 'stages', key: 'reading' } }).patch).toEqual({ with: { ojt: 'reading' } });
  });
  it('المرحلة المحمية ومرجع «تبدأ مع» (R2b) لا يُوقفان: applyDrop يرفض ولا يعيد مسودة جديدة', () => {
    const gate = applyDrop({ def, cohort, edit: EMPTY, patch: { off: { approval: true } } });
    expect(gate.reject.code).toBe('protected');
    expect(gate.edit).toBeUndefined();
    const ref = applyDrop({ def, cohort, edit: EMPTY, patch: { off: { training: true } } });
    expect(ref.reject.code).toBe('with_target');
  });
  it('مرجع ممنوع يُكتب مباشرة (R3a): الحارس نفسه يرفضه', () => {
    const r = applyDrop({ def, cohort, edit: EMPTY, patch: { with: { final: 'approval' } } });
    expect(r.reject).toBeTruthy();
    expect(r.edit).toBeUndefined();
  });
  it('المثبتة بتاريخ لا يُسحب طرفها، والموقوفة لا تُسحب', () => {
    const pinned = { ...cohort, schedule: { support: { start: '2026-11-25', end: '2027-01-20' } } };
    const ctx = setup(pinned);
    expect(drop({ ctx, key: 'support', kind: 'end', pct: 3 }).reject.code).toBe('pinned');
    const off = setup(cohort, { ...EMPTY, off: { final: true } });
    expect(dropToEdit({ scale: off.scale, draft: off.draft, key: 'final', kind: 'end', pct: 1, title }).reject.code).toBe('off');
  });
});

describe('mergeEdit: العدادات والسحب يدمجان بالدالة نفسها', () => {
  it('تغيير المرجع يعيد إزاحته، والنهاية والإيقاف المطابقان للمحفوظ لا يبقيان', () => {
    const e1 = mergeEdit(EMPTY, { offset: { reading: 3 } }, {});
    expect(mergeEdit(e1, { with: { reading: 'approval' } }, {}).offset).toEqual({});
    expect(mergeEdit(EMPTY, { until: { ojt: 'journey_end' } }, { ojt: { until: 'journey_end' } }).until).toEqual({});
    expect(mergeEdit(EMPTY, { until: { ojt: 'days' } }, {}).until).toEqual({ ojt: 'days' });
    expect(mergeEdit(EMPTY, { off: { final: false } }, {}).off).toEqual({});
    expect(mergeEdit(EMPTY, { off: { final: true } }, {}).off).toEqual({ final: true });
    expect(mergeEdit(null, { days: { training: 20 } }).days).toEqual({ training: 20 });
  });
  it('سطر الشبح: التواريخ الناتجة والمدة', () => {
    const a = applyDrop({ def, cohort, edit: EMPTY, patch: { days: { training: 21 } } });
    const t = dragGhostAr(a.draft.rows.training, 'التدريب');
    expect(t).toContain('«التدريب»');
    expect(t).toContain('إلى');
    expect(t).toContain('3 أسابيع');
    expect(t).not.toMatch(/[–—]/);
  });
});
