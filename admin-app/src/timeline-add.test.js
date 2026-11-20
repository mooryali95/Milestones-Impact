// ورشة من الخط الزمني (تصور تشغيل الدفعة 2026-11-19، المرحلة 4): من موضع المؤشر إلى يوم بتوقيت الرياض وموعد مقترح، وحقول
// المدرب والبريد في نموذج الجلسة، وما يُرسل إلى admin.workshop-save. نقي بلا واجهة.
import { describe, expect, it } from 'vitest';
import { addScale, outsideWindow, riyadhDay, sessionTimes } from './timeline-add.js';
import { extraEffectAr, mailChoice, mailResultAr, saveBody, savedAr, sessionChanged, sessionExtras } from './workshop-days.js';
import { journeyTimeline, timelineAxis } from '../../supabase/functions/leaders-api/journey-timeline.js';

const stages = [
  { key: 'admission', title_ar: 'القبول', sort: 1, active: true, duration_days: 7 },
  { key: 'training', title_ar: 'التدريب', sort: 2, active: true, duration_days: 14 },
  { key: 'impact', title_ar: 'الأثر', sort: 3, active: true, duration_days: 30 },
];
const requirements = [
  { id: 'r-a', stage_key: 'admission', code: 'A-1', kind: 'manual', title_ar: 'ملف', required: true, sort: 1, active: true },
  { id: 'r-w', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', title_ar: 'الأيام التدريبية', required: true, sort: 1, active: true, config: { sessions_required: 4 } },
  { id: 'r-i', stage_key: 'impact', code: 'I-1', kind: 'manual', title_ar: 'مبادرة', required: true, sort: 1, active: true },
];
const cohort = { id: 'c1', name: 'دفعة', starts_on: '2027-01-03', is_default: false, status: 'running' };
const build = (today = '2027-01-12T09:00:00Z') => {
  const model = journeyTimeline({ stages, requirements }, { cohort, sessions: [], today: new Date(today) });
  return { model, axis: timelineAxis(model) };
};

describe('اليوم تحت المؤشر', () => {
  it('المحور خطي: النسبة إلى يوم من أيام الدفعة بتاريخه، والعلامة وسط يومه', () => {
    const { model, axis } = build();
    const s = addScale(model, axis);
    expect(s.dated).toBe(true);
    expect(s.total).toBe(axis.days);
    // أول المحور أول يوم في الدفعة، وآخره آخر يوم، ولا يخرج عنه
    expect(s.axis.dayAt(0).date).toBe('2027-01-03');
    expect(s.axis.dayAt(100).day).toBe(s.total - 1);
    expect(s.axis.dayAt(-5).day).toBe(0);
    // كل يوم بالعرض نفسه: نسبة اليوم 10 ونصف تعيد اليوم 10
    const d10 = s.axis.dayAt(((10 + 0.5) / s.total) * 100);
    expect([d10.day, d10.date]).toEqual([10, '2027-01-13']);
    expect(d10.label).toContain('13 يناير');
    expect(s.axis.day(10).at).toBeCloseTo(((10 + 0.5) / s.total) * 100, 1);
  });

  it('اللوحة: يوم الشريط من مقياسها الهجين، محصورًا في أيام مرحلته', () => {
    const { model, axis } = build();
    const s = addScale(model, axis);
    const [lo, hi] = s.range('training');
    expect([lo, hi]).toEqual([7, 20]);
    // نسبة خارج شريط التدريب لا تقترح يومًا من مرحلة أخرى
    expect(s.board.dayAt(0, 'training').day).toBe(7);
    expect(s.board.dayAt(100, 'training').day).toBe(20);
    const slot = model.scale.slots.find((x) => x.key === 'training' || x.from === 7);
    const mid = s.board.dayAt(slot.at + slot.width / 2, 'training');
    expect(mid.day).toBeGreaterThanOrEqual(13);
    expect(mid.day).toBeLessThanOrEqual(14);
    expect(mid.date).toBe(mid.day === 13 ? '2027-01-16' : '2027-01-17');
  });

  it('لوحة المفاتيح تبدأ من اليوم إن وقع في المرحلة، وإلا من أولها أو آخرها', () => {
    const { model, axis } = build('2027-01-12T09:00:00Z');   // اليوم 9 من الدفعة، في التدريب
    const s = addScale(model, axis);
    expect(s.startDay('training')).toBe(9);
    expect(s.startDay('impact')).toBe(s.range('impact')[0]);
    expect(s.startDay('admission')).toBe(s.range('admission')[1]);
  });

  it('دفعة بلا تاريخ بداية: المرحلة وحدها بلا تاريخ مقترح، وخط فارغ بلا إضافة', () => {
    const model = journeyTimeline({ stages, requirements }, { cohort: { ...cohort, starts_on: null }, sessions: [], today: new Date('2027-01-12T09:00:00Z') });
    const s = addScale(model, timelineAxis(model));
    expect(s.dated).toBe(false);
    expect(s.axis.day(3).date).toBeNull();
    expect(addScale(null, null)).toBeNull();
    expect(addScale({ empty: true, scale: {} }, null)).toBeNull();
  });
});

describe('الموعد المقترح بتوقيت الرياض', () => {
  it('9 صباحًا بتوقيت الرياض أيًّا كانت منطقة المتصفح، ومدته من البند أو ثلاث ساعات', () => {
    expect(sessionTimes('2027-01-13')).toEqual({ starts_at: '2027-01-13T06:00:00.000Z', ends_at: '2027-01-13T09:00:00.000Z' });
    expect(sessionTimes('2027-01-13', 360).ends_at).toBe('2027-01-13T12:00:00.000Z');
    // اليوم بتوقيت الرياض هو اليوم المنقور
    expect(riyadhDay(sessionTimes('2027-01-13').starts_at)).toBe('2027-01-13');
    expect(sessionTimes('')).toEqual({ starts_at: null, ends_at: null });
    expect(sessionTimes('13/01/2027')).toEqual({ starts_at: null, ends_at: null });
  });

  it('يوم الرياض لا ينزاح بجلسة مسائية أو فجرية', () => {
    expect(riyadhDay('2027-01-13T21:30:00Z')).toBe('2027-01-14');   // 00:30 بالرياض
    expect(riyadhDay('2027-01-13T20:59:00Z')).toBe('2027-01-13');
  });

  it('خارج نافذة المرحلة قبل الحفظ بيوم الرياض، كما يعلّمه الخط بعد الحفظ', () => {
    const { model } = build();
    expect(outsideWindow(model, 'training', sessionTimes('2027-01-13').starts_at)).toBe(false);
    for (const date of ['2027-01-05', '2027-01-09', '2027-01-10', '2027-01-23', '2027-01-24', '2027-02-10']) {
      const s = { id: 's', requirement_id: 'r-w', cohort_id: 'c1', active: true, ...sessionTimes(date) };
      const m = journeyTimeline({ stages, requirements }, { cohort, sessions: [s], today: new Date('2027-01-12T09:00:00Z') });
      const dot = m.activities.flatMap((a) => a.dates)[0];
      expect([date, outsideWindow(model, 'training', s.starts_at)]).toEqual([date, dot.outside]);
    }
    expect(outsideWindow(model, 'training', null)).toBe(false);
    expect(outsideWindow(model, 'nope', sessionTimes('2027-01-13').starts_at)).toBe(false);
  });
});

describe('حقول المدرب والبريد في نموذج الجلسة', () => {
  const now = Date.parse('2027-01-10T08:00:00Z');
  const local = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
  const v = (o = {}) => ({ active: true, mode: 'in_person', location_ar: 'القاعة', starts_at: local('2027-01-13T06:00:00Z'), ends_at: local('2027-01-13T09:00:00Z'), ...o });
  const original = { starts_at: '2027-01-13T06:00:00Z', ends_at: '2027-01-13T09:00:00Z', mode: 'in_person', location_ar: 'القاعة', join_url: null };

  it('الدعوة عند الحفظ لجلسة دفعة مؤرخة قائمة لم تنتهِ ولم تُدعَ وحدها', () => {
    expect(mailChoice({ cohortId: 'c1' }, v(), now)).toBe('invite');
    expect(mailChoice({}, v({ cohort_id: 'c1' }), now)).toBe('invite');
    expect(mailChoice({}, v(), now)).toBeNull();   // جلسة عامة
    expect(mailChoice({ cohortId: 'c1' }, v({ starts_at: '', ends_at: '' }), now)).toBeNull();
    expect(mailChoice({ cohortId: 'c1' }, v({ active: false }), now)).toBeNull();
    expect(mailChoice({ cohortId: 'c1' }, v(), Date.parse('2027-02-01T00:00:00Z'))).toBeNull();   // انتهت
    expect(mailChoice({ cohortId: 'c1', original }, v(), now)).toBe('invite');   // تحرير جلسة لم تُدعَ
  });

  it('إشعار التغيير لجلسة دُعيت وتغيّر موعدها أو مكانها، ولا شيء إن لم يتغير', () => {
    const invited = { ...original, invited_at: '2027-01-09T08:00:00Z' };
    expect(mailChoice({ cohortId: 'c1', original: invited }, v(), now)).toBeNull();
    expect(mailChoice({ cohortId: 'c1', original: invited }, v({ title_ar: 'عنوان آخر' }), now)).toBeNull();
    expect(mailChoice({ cohortId: 'c1', original: invited }, v({ location_ar: 'قاعة أخرى' }), now)).toBe('change');
    expect(mailChoice({ cohortId: 'c1', original: invited }, v({ starts_at: local('2027-01-14T06:00:00Z'), ends_at: local('2027-01-14T09:00:00Z') }), now)).toBe('change');
    expect(sessionChanged(invited, v({ mode: 'online', join_url: 'https://x.sa/m' }))).toEqual({ when: false, where: true });
    expect(sessionChanged(invited, v({ ends_at: local('2027-01-13T10:00:00Z') }))).toEqual({ when: true, where: false });
    expect(sessionChanged(null, v())).toEqual({ when: false, where: false });
  });

  it('حقل المدرب من خبراء الدفعة، ويختفي للجلسة العامة وقبل ترحيل عموده', () => {
    expect(sessionExtras({})).toEqual([]);
    const team = [{ id: 'e1', full_name: 'د. منى' }, { id: 'e2', full_name: 'أ. خالد' }];
    const [f] = sessionExtras({ trainersOf: (x) => (x.cohort_id ? team : null) });
    expect(f.name).toBe('expert_id');
    expect(f.options({ cohort_id: 'c1' })).toEqual({ e1: 'د. منى', e2: 'أ. خالد' });
    expect([f.show({ cohort_id: 'c1' }), f.show({})]).toEqual([true, false]);
    expect(sessionExtras({ trainersOf: () => [] })[0].help({})).toContain('لا خبراء في فريق هذه الدفعة');
    const names = sessionExtras({ trainersOf: () => team, mail: { cohortId: 'c1' } }).map((x) => x.name);
    expect(names).toEqual(['expert_id', 'invite', 'notify_change']);
  });

  it('ما يُرسل إلى الحفظ: الصف وحده في row، والاختياران بجانبه حين يُختاران وحدهما', () => {
    expect(saveBody({ title_ar: 'ورشة', invite: true, notify_change: false }, { cohort_id: 'c1' })).toEqual({ row: { title_ar: 'ورشة', cohort_id: 'c1' }, invite: true });
    expect(saveBody({ title_ar: 'ورشة', notify_change: true }, { id: 's1' })).toEqual({ row: { title_ar: 'ورشة', id: 's1' }, notify_change: true });
    // لا اختيار ظاهر (الحقل غير معروض): لا بريد
    expect(saveBody({ title_ar: 'ورشة' })).toEqual({ row: { title_ar: 'ورشة' } });
    expect(saveBody({ title_ar: 'ورشة', invite: false })).toEqual({ row: { title_ar: 'ورشة' } });
  });

  it('رسالة الحفظ تقول ما جرى للبريد وما لم يُحفظ قبل ترحيله', () => {
    expect(savedAr('أُضيفت الورشة', { success: true })).toBe('أُضيفت الورشة');
    expect(savedAr('أُضيفت الورشة', { invite: { sent: 18, failed: 0, total: 18 } })).toBe('أُضيفت الورشة، وأُرسلت الدعوة إلى 18 مشاركًا');
    expect(savedAr('حُفظ اليوم', { change: { sent: 5, failed: 0, total: 5 } })).toBe('حُفظ اليوم، وأُبلغ بالتغيير إلى 5 مشاركين');
    expect(mailResultAr({ invite: { sent: 3, failed: 2, total: 5 } })).toBe('وأُرسلت الدعوة إلى 3، وتعذّرت 2');
    // ما لم تتسع له حصة اليوم ينتظر في الطابور ويُذكر صراحةً (ترحيل 20261120100000)
    expect(mailResultAr({ invite: { sent: 1, failed: 0, total: 2, queued: 1 } })).toContain('و1 تنتظر حصة البريد وتخرج آليًّا');
    expect(mailResultAr({ invite: { sent: 2, failed: 0, total: 2 } })).not.toContain('تنتظر');
    expect(mailResultAr({ invite: { skipped: 'invited' } })).toContain('أُرسلت من قبل');
    expect(mailResultAr({ invite: { sent: 0, failed: 0, total: 0 } })).toContain('لا أعضاء');
    expect(mailResultAr({ mail_error: true })).toContain('تعذّر البريد');
    expect(savedAr('حُفظ اليوم', { trainer_skipped: true })).toBe('حُفظ اليوم، المدرب لم يُحفظ لأن قاعدة البيانات لم تُحدَّث بعد');
    expect(savedAr('حُفظ اليوم', { capacity_skipped: true })).toContain('السعة لم تُحفظ');
    expect(savedAr('حُفظ اليوم', { capacity_skipped: true, trainer_skipped: true })).toContain('السعة والمدرب لم يُحفظا');
  });

  it('سطر الأثر قبل الحفظ (القرار 6): تُحسب لمن ينقصه يوم ولا تزيد المطلوب', () => {
    expect(extraEffectAr({ need: 4 })).toBe('المطلوب حضور 4 أيام. هذه الورشة تُحسب لمن ينقصه يوم، ولا تزيد المطلوب.');
    expect(extraEffectAr({ need: 1 })).toContain('يوم واحد');
  });
});
