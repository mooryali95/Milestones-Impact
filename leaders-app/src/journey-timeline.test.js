// الرحلة في لمحة (J1b): نموذج العرض النقي journeyTimeline، والنوافذ من الملف المشترك
import { describe, expect, it } from 'vitest';
import { journeyTimeline, timelineWeight, undatedAr } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { stageWindows as shared } from '../../supabase/functions/leaders-api/stage-windows.js';
import { stageWindows } from '../../supabase/functions/leaders-api/journey-map.js';
import { distributeSchedule } from '../../supabase/functions/leaders-api/milestones.js';

const STAGES = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق' },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '{assessment_minutes}' },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3 },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14 },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 5, duration_days: 28, rules: { unlock: 'with', with: 'training' } },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 6, duration_days: 14, rules: { unlock: 'with', with: 'training' } },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 7, duration_days: 90 },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 8, duration_days: 7 },
  { key: 'old', title_ar: 'مرحلة مخفية', phase: 'impact', sort: 9, duration_days: 7, active: false },
];
const REQS = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'auto', required: true, title_ar: 'أكمل ملفك', sort: 1 },
  { id: 'r2', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور {days:T-ATTEND}', sort: 1, config: { sessions_required: 2 } },
  { id: 'r3', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول', sort: 2 },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', sort: 1, config: { mode: 'online' } },
  { id: 'r5', code: 'C-UP', stage_key: 'consult', kind: 'upload', required: false, title_ar: 'ارفع خطتك', sort: 1 },
  { id: 'r6', code: 'S-GATE', stage_key: 'support', kind: 'check', required: true, title_ar: 'بوابة الاحترافي', sort: 1, dimension: 'milestone', level: 'advanced' },
  { id: 'r7', code: 'X-OFF', stage_key: 'final', kind: 'form', required: true, title_ar: 'معطل', sort: 1, active: false },
];
const COHORT = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-02' };
const TODAY = '2026-11-16T09:00:00Z';

describe('النوافذ من مصدر واحد', () => {
  it('خريطة الجهة تستورد stageWindows من الملف المشترك نفسه', () => {
    expect(stageWindows).toBe(shared);
  });
});

describe('journeyTimeline: البرنامج بالأسابيع', () => {
  const m = journeyTimeline({ stages: STAGES, requirements: REQS }, { title: 'برنامج القادة' });

  it('المراحل الظاهرة فقط، بالمحاور الثلاثة، والمدة بالحروف أو نصها للآنية', () => {
    expect(m.context).toBe('program');
    expect(m.dated).toBe(false);
    expect(m.stages.map((s) => s.key)).not.toContain('old');
    expect(m.phases.map((p) => p.key)).toEqual(['admission', 'qualification', 'impact']);
    const by = Object.fromEntries(m.stages.map((s) => [s.key, s]));
    expect(by.profile.label).toBe('دقائق');
    expect(by.training.label).toBe('أسبوعان');
    expect(by.support.label).toBe('3 أشهر');
    expect(by.profile.window).toBeNull();
    expect(by.profile.status).toBeNull();
  });

  it('«تبدأ مع»: المراحل الثلاث خانة واحدة بمسارات مكدسة، والمحور بطول أطولها لا مجموعها', () => {
    const together = m.slots.find((x) => x.together);
    expect(together.stages).toEqual(['training', 'ojt', 'consult']);
    expect(together.days).toBe(28);
    expect(together.note_ar).toContain('التدريب ومرحلتان تبدآن معها');
    const q = m.phases.find((p) => p.key === 'qualification');
    expect(q.days).toBe(28);
    expect(q.label).toBe('4 أسابيع، مراحل تسير معًا');
    expect(m.phases.find((p) => p.key === 'impact').label).toBe('نحو 3 أشهر');
    expect(m.cards[0].value).toBe('128 يومًا، نحو 18 أسبوعًا');
    expect(m.cards.find((c) => c.key === 'phase-qualification').value).toBe('4 أسابيع بدل 8 أسابيع لو كانت متتابعة');
    const ojt = m.stages.find((s) => s.key === 'ojt');
    expect(ojt.with_note).toBe('تبدأ مع «التدريب»');
    expect(ojt.lane_width).toBe(100);
    expect(m.stages.find((s) => s.key === 'consult').lane_width).toBe(50);
  });

  it('المقياس الهجين: أرضية 14 يومًا، وضغط ما زاد على 28، والخانات متجاورة حتى 100%', () => {
    expect(timelineWeight(0)).toBe(14);
    expect(timelineWeight(28)).toBe(28);
    expect(timelineWeight(90)).toBeCloseTo(52.8);
    const last = m.slots.at(-1);
    expect(last.at + last.width).toBeCloseTo(100, 1);
    for (let i = 1; i < m.slots.length; i++) expect(m.slots[i].at).toBeCloseTo(m.slots[i - 1].at + m.slots[i - 1].width, 1);
  });

  it('الأنشطة: الأيقونة من النوع، والإلزام، والطريقة من الإعداد، والجلسة «تُحدد في الدفعة» بلا تحذير', () => {
    expect(m.activities.map((a) => a.code)).toEqual(['P-PROF', 'T-ATTEND', 'T-READ', 'O-SESS', 'C-UP', 'S-GATE']);
    const a = Object.fromEntries(m.activities.map((x) => [x.code, x]));
    expect(a['T-ATTEND'].title).toBe('حضور يومان');
    expect(a['T-ATTEND'].icon).toBe('training');
    expect(a['T-ATTEND'].timing).toBe('undated');
    expect(a['T-ATTEND'].undated).toBe(false);
    expect(a['T-ATTEND'].when_ar).toBe('الموعد والرابط يُحددان في الدفعة');
    expect(a['T-ATTEND'].aria_ar).toBe('حضور يومان، مرحلة التدريب، تدريب، إلزامي، الموعد والرابط يُحددان في الدفعة، يكمله الأدمن بتسجيل الحضور');
    expect(a['P-PROF'].timing).toBe('auto');
    expect(a['O-SESS'].timing).toBe('booked');
    expect(a['O-SESS'].mode_ar).toBe('عن بعد');
    expect(a['C-UP'].required).toBe(false);
    expect(a['S-GATE'].level_ar).toBe('إدارة المشروعات · المستوى احترافي');
    expect(m.counts).toMatchObject({ activities: 6, optional: 1, undated: 0 });
    expect(m.cards.map((c) => c.key)).toEqual(['duration', 'phase-qualification', 'stages', 'activities']);
    expect(m.cards.find((c) => c.key === 'activities').value).toBe('6، منها 1 اختيارية');
  });

  it('المسطرة بالأسابيع من البداية إلى النهاية، ولا خط لليوم', () => {
    expect(m.ticks[0]).toEqual({ at: 0, label: 'البداية' });
    expect(m.ticks.at(-1)).toEqual({ at: 100, label: 'النهاية' });
    expect(m.ticks.some((t) => t.label.startsWith('الأسبوع'))).toBe(true);
    expect(m.today).toBeNull();
  });

  it('المرحلة بلا أنشطة تظهر بعلامتها، والرحلة الفارغة حالة خاصة', () => {
    expect(m.stages.find((s) => s.key === 'final').empty).toBe(true);
    const e = journeyTimeline({ stages: [], requirements: [] });
    expect(e.empty).toBe(true);
    expect(e.empty_ar).toContain('لم تُبنَ الرحلة بعد');
  });
});

describe('journeyTimeline: الدفعة بالتواريخ', () => {
  const sessions = [
    { id: 's1', requirement_id: 'r2', cohort_id: 'c1', starts_at: '2026-11-08T06:00:00Z', ends_at: '2026-11-08T10:00:00Z', mode: 'online' },
    { id: 's2', requirement_id: 'r2', cohort_id: null, starts_at: null, ends_at: null, mode: 'in_person' },
    { id: 's3', requirement_id: 'r2', cohort_id: 'other', starts_at: '2026-11-09T06:00:00Z', ends_at: '2026-11-09T08:00:00Z' },
    { id: 's4', requirement_id: 'r2', cohort_id: 'c1', starts_at: '2026-11-10T06:00:00Z', ends_at: '2026-11-10T08:00:00Z', active: false },
  ];
  const m = journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort: COHORT, sessions, today: TODAY });

  it('النوافذ الحقيقية وحالة كل مرحلة، والمتوازية جارية معًا', () => {
    expect(m.dated).toBe(true);
    const by = Object.fromEntries(m.stages.map((s) => [s.key, s]));
    expect(by.approval.status).toBe('done');
    // النهاية شاملة (القرار 18، R2a): 14 يومًا من 5 نوفمبر تنتهي 18 نوفمبر
    expect(by.training.window).toEqual({ from: '2026-11-05', to: '2026-11-18' });
    expect(by.training.window_ar).toBe('5 نوفمبر إلى 18 نوفمبر');
    expect(['training', 'ojt', 'consult'].map((k) => by[k].status_ar)).toEqual(['جارية', 'جارية', 'جارية']);
    expect(by.support.status).toBe('upcoming');
    expect(by.training.today_ar).toBe('اليوم 16 نوفمبر، بقي على نهاية المرحلة يومان');
  });

  it('الجلسات: جلسة الدفعة وجلسة كل الدفعات فقط، والمؤرخة نقطة، وغير المؤرخة «يُحدد لاحقًا» لا 1970', () => {
    const w = m.activities.find((a) => a.code === 'T-ATTEND');
    expect(w.dates.map((d) => d.date)).toEqual(['2026-11-08']);
    expect(w.dates[0].label).toBe('8 نوفمبر');
    expect(w.undated).toBe(true);
    expect(w.mode).toBe('hybrid');
    expect(w.when_ar).toBe('8 نوفمبر، وموعد واحد يُحدد لاحقًا');
    expect(JSON.stringify(m)).not.toContain('1970');
    expect(m.counts.undated).toBe(1);
    expect(m.cards.find((c) => c.key === 'undated')).toMatchObject({ value: 'موعد واحد يُحدد لاحقًا', tone: 'warn' });
    expect(m.stages.find((s) => s.key === 'training').undated).toBe(true);
    expect(m.selected).toBe('r2');
  });

  it('البطاقات: النافذة والموقع الآن، وخط اليوم داخل المسار، والمسطرة بالأشهر', () => {
    expect(m.cards.find((c) => c.key === 'window').value).toBe('2 نوفمبر 2026 إلى 9 مارس 2027');
    expect(m.cards.find((c) => c.key === 'now').value).toBe('الأسبوع 3، 3 مراحل تسير معًا');
    expect(m.today.label).toBe('اليوم 16 نوفمبر');
    expect(m.today.at).toBeGreaterThan(m.slots.find((x) => x.together).at);
    expect(m.ticks[0].label).toBe('2 نوفمبر');
    expect(m.ticks.map((t) => t.label)).toContain('ديسمبر');
    expect(m.activities.find((a) => a.code === 'T-READ').when_ar).toBe('خلال المرحلة حتى 18 نوفمبر');
  });

  it('قبل البداية «تبدأ بعد»، وبعد النهاية «انتهت الدفعة»، وبلا خط لليوم', () => {
    const before = journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort: COHORT, today: '2026-10-21T09:00:00Z' });
    expect(before.cards.find((c) => c.key === 'now').value).toBe('تبدأ بعد 12 يومًا');
    expect(before.today).toBeNull();
    const after = journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort: COHORT, today: '2027-06-01T09:00:00Z' });
    expect(after.cards.find((c) => c.key === 'now').value).toBe('انتهت الدفعة');
    expect(after.stages.every((s) => s.status === 'done')).toBe(true);
  });

  it('البند المخفي في الدفعة لا يظهر في سياقها', () => {
    const hidden = REQS.map((r) => (r.code === 'C-UP' ? { ...r, hidden: true } : r));
    const h = journeyTimeline({ stages: STAGES, requirements: hidden }, { cohort: COHORT, today: TODAY });
    expect(h.activities.map((a) => a.code)).not.toContain('C-UP');
    expect(h.stages.find((s) => s.key === 'consult').empty).toBe(true);
  });

  it('الجلسة خارج نافذة مرحلتها تُرسم في تاريخها بعلامة', () => {
    const out = journeyTimeline({ stages: STAGES, requirements: REQS }, {
      cohort: COHORT, today: TODAY,
      sessions: [{ id: 'x', requirement_id: 'r2', cohort_id: 'c1', starts_at: '2026-12-20T06:00:00Z', ends_at: '2026-12-20T08:00:00Z' }],
    });
    const w = out.activities.find((a) => a.code === 'T-ATTEND');
    expect(w.timing).toBe('dated');
    expect(w.outside).toBe(true);
    expect(w.dates[0].outside).toBe(true);
    expect(out.counts.undated).toBe(0);
  });

  it('الجلسة الجماعية بلا أي موعد تُعد «يُحدد لاحقًا»، والعداد بصيغته', () => {
    const none = journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort: COHORT, today: TODAY });
    expect(none.activities.find((a) => a.code === 'T-ATTEND').when_ar).toBe('يُحدد لاحقًا');
    expect(undatedAr(2)).toBe('موعدان يُحددان لاحقًا');
    expect(undatedAr(6)).toBe('6 مواعيد تُحدد لاحقًا');
    expect(undatedAr(12)).toBe('12 موعدًا يُحدد لاحقًا');
  });

  it('دفعة بلا تاريخ بداية ولا جدول: أسابيع نسبية وتنبيه، لا تاريخ مخترع', () => {
    const n = journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort: { id: 'c2' }, today: TODAY });
    expect(n.dated).toBe(false);
    expect(n.notice).toBe('حدد تاريخ البداية لترى التواريخ');
    expect(n.stages.every((s) => s.window === null)).toBe(true);
    expect(n.ticks[0].label).toBe('البداية');
    expect(n.today).toBeNull();
  });

  it('جدول الدفعة المكتوب يبقى المرجع الأول للنوافذ', () => {
    const s = journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort: { ...COHORT, schedule: { support: { start: '2026-12-10', end: '2027-02-10' } } }, today: TODAY });
    expect(s.stages.find((x) => x.key === 'support').window).toEqual({ from: '2026-12-10', to: '2027-02-10' });
  });
});

describe('journeyTimeline: المرحلة عند الطلب الممتدة على الدفعة كلها', () => {
  const OD = { mode: 'on_demand' };
  const base = [
    { key: 'adm', title_ar: 'القبول', phase: 'admission', sort: 1, duration_days: 14 },
    { key: 'tr', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 14 },
    { key: 'ojt', title_ar: 'التوجيه', phase: 'qualification', sort: 3, duration_days: 28, rules: { unlock: 'with', with: 'tr' } },
    { key: 'cons', title_ar: 'الاستشارة', phase: 'qualification', sort: 4, duration_days: 14, rules: { ...OD, unlock: 'with', with: 'tr' } },
    { key: 'imp', title_ar: 'الأثر', phase: 'impact', sort: 5, duration_days: 60 },
  ];
  const cohortOf = (stages) => ({ id: 'c', starts_on: '2026-01-01', ends_on: '2026-06-30', schedule: distributeSchedule(stages, '2026-01-01', '2026-06-30') });
  const slotAt = (m, key) => m.slots.find((x) => x.stages.includes(key));

  it('اليوم والمسطرة في خانة الأثر لا في خانة التأهيل، والنهاية عند 100%', () => {
    const m = journeyTimeline({ stages: base, requirements: [] }, { cohort: cohortOf(base), today: '2026-05-15T09:00:00Z' });
    const imp = slotAt(m, 'imp');
    expect(m.today.at).toBeGreaterThan(imp.at);
    expect(m.today.at).toBeLessThanOrEqual(imp.at + imp.width);
    expect(m.ticks.at(-1).at).toBe(100);
    expect(m.ticks.map((t) => t.at)).toEqual([...m.ticks.map((t) => t.at)].sort((a, b) => a - b));
    // المحور بطول مراحله الإلزامية لا الدفعة كلها
    // نهاية المحور آخر أيامه شاملًا (القرار 18): اليوم السابق لبداية المحور التالي، لا يومها
    const qi = m.phases.find((p) => p.key === 'qualification'), im = m.phases.find((p) => p.key === 'impact');
    if (qi.to && im?.from && qi.days) expect(qi.to < im.from).toBe(true);
    expect(m.phases.find((p) => p.key === 'qualification').to < '2026-04-01').toBe(true);
  });

  it('بلا «تبدأ مع»: خانة المرحلة عند الطلب محصورة بين جارتيها', () => {
    const seq = base.map((s) => (s.key === 'cons' ? { ...s, rules: OD } : s.key === 'ojt' ? { ...s, rules: undefined } : s));
    const m = journeyTimeline({ stages: seq, requirements: [] }, { cohort: cohortOf(seq), today: '2026-05-15T09:00:00Z' });
    const imp = slotAt(m, 'imp');
    expect(m.today.at).toBeGreaterThan(imp.at);
    const order = m.slots.map((x) => x.at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
