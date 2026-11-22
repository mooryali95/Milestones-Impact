// إلغاء الورشة في اللوحة (قرار المالك 2026-11-22): أي حفظ يُخرج الجلسة من جمهورها أو يعيدها، وسؤال التأكيد بعدد من يُبلَّغ
// من معاينة الخادم واختيار ألا يُبلَّغ أحد، وسطر تحذير سحب الاكتمال، وسؤال الإعادة، وما يُقال بعد الحفظ.
// السلوك على الخادم (من يُبلَّغ، وملف الإلغاء وأرقام تسلسله، وألا يتكرر) في workshop_cancel_test.ts (Deno).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cancelResultAr, deleteConfirm, leaveAsk, leaveConfirm, leaveKind, mailChoice, mailResultAr, saveBody, savedAr } from './workshop-days.js';

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const day = (extra = {}) => ({ id: 's1', title_ar: 'ورشة التفاوض', cohort_id: 'c1', active: true, invited_at: '2026-11-20T08:00:00Z', ...extra });

describe('أي حفظ يُخرج الجلسة من جمهورها أو يعيدها (يطابق leaveOf في الخادم)', () => {
  it('الإلغاء والإعادة من مربع «مفعّلة»، والنقل حين يحمل النموذج الدفعة وحده', () => {
    expect(leaveKind(null, { active: false })).toBeNull();   // جلسة جديدة
    expect(leaveKind(day(), { active: true })).toBeNull();
    expect(leaveKind(day(), { active: false })).toBe('cancel');
    expect(leaveKind(day({ active: false }), { active: false })).toBeNull();   // ملغاة تُحرَّر وتبقى ملغاة
    expect(leaveKind(day({ active: false }), { active: true })).toBe('restore');
    expect(leaveKind(day(), { active: true, cohort_id: 'c2' })).toBe('move');
    expect(leaveKind(day(), { active: true, cohort_id: null })).toBe('move');   // صارت لكل الدفعات
    expect(leaveKind(day(), { active: true, cohort_id: 'c1' })).toBeNull();
    expect(leaveKind(day({ cohort_id: null }), { active: true, cohort_id: 'c1' })).toBeNull();   // عامة تُحدد دفعتها: لا مدعوين قبلها
    // الإلغاء مع نقل في الحفظ نفسه إلغاء لدفعتها الأولى
    expect(leaveKind(day(), { active: false, cohort_id: 'c2' })).toBe('cancel');
    // تغيير الوسم وحده ليس خروجًا
    expect(leaveKind(day(), { active: true, counting: 'optional' })).toBeNull();
  });
  it('جسم الحفظ: «لا تبلّغ» و«ادعُهم من جديد» بجانب الصف لا فيه، ولا يُرسلان بقيمتهما الافتراضية', () => {
    expect(saveBody({ title_ar: 'ورشة', active: false, notify_cancel: false }, { id: 's1' })).toEqual({ row: { title_ar: 'ورشة', active: false, id: 's1' }, notify_cancel: false });
    expect(saveBody({ title_ar: 'ورشة', active: false, notify_cancel: true }, { id: 's1' })).toEqual({ row: { title_ar: 'ورشة', active: false, id: 's1' } });
    expect(saveBody({ title_ar: 'ورشة', active: true, reinvite: true }, { id: 's1' })).toEqual({ row: { title_ar: 'ورشة', active: true, id: 's1' }, reinvite: true });
    expect(saveBody({ title_ar: 'ورشة', active: true, reinvite: false }, { id: 's1' })).toEqual({ row: { title_ar: 'ورشة', active: true, id: 's1' } });
  });
  it('مربع الدعوة في النموذج: للجلسة المنقولة إلى دفعة أخرى، لا للملغاة المعلنة التي تُسأل عند إعادتها', () => {
    const now = Date.parse('2027-01-01T00:00:00Z');
    const v = (extra = {}) => ({ cohort_id: 'c1', active: true, starts_at: '2027-01-12T09:00', ends_at: '2027-01-12T12:00', mode: 'in_person', location_ar: '', ...extra });
    const original = day({ starts_at: '2027-01-12T06:00:00Z', ends_at: '2027-01-12T09:00:00Z' });
    expect(mailChoice({ original }, v({ cohort_id: 'c2' }), now)).toBe('invite');
    expect(mailChoice({ original: { ...original, active: false } }, v(), now)).toBeNull();
    expect(mailChoice({ original: { ...original, active: false, invited_at: null } }, v(), now)).toBe('invite');
  });
});

describe('سؤال التأكيد من معاينة الخادم', () => {
  const cancel = (extra = {}) => ({ kind: 'cancel', notify: { members: 12, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0, ...extra });
  it('الإلغاء: العدد والمدرب في سطر، ومربع «أبلغ المدعوين» معلَّم افتراضًا', () => {
    const a = leaveAsk(cancel(), 'ورشة التفاوض');
    expect(a.text).toContain('يُلغى «ورشة التفاوض»');
    expect(a.lines).toEqual(['يصل بريد الإلغاء إلى 12 مشاركًا، وإلى المدرب د. منى القحطاني، ومعه ملف يزيل الموعد من التقويم.']);
    expect(a.check).toMatchObject({ name: 'notify_cancel', label: 'أبلغ المدعوين بالإلغاء', checked: true });
    expect([a.ok, a.danger]).toEqual(['ألغِ اليوم', true]);
    // صيغ العدد
    expect(leaveAsk(cancel({ notify: { members: 1, trainer: null } }), 'x').lines[0]).toContain('إلى مشارك واحد، ومعه');
    expect(leaveAsk(cancel({ notify: { members: 2, trainer: null } }), 'x').lines[0]).toContain('إلى مشاركَين');
    expect(leaveAsk(cancel({ notify: { members: 5, trainer: null } }), 'x').lines[0]).toContain('إلى 5 مشاركين');
    // لا أعضاء والمدرب وحده
    expect(leaveAsk(cancel({ notify: { members: 0, trainer: 'د. منى' } }), 'x').lines[0]).toContain('إلى المدرب د. منى');
  });
  it('لا بريد: السبب في سطره ولا مربع اختيار', () => {
    for (const [skipped, has] of [['unannounced', 'لم تُرسل دعوة'], ['ended', 'انتهت'], ['undated', 'بلا موعد'], ['general', 'لكل الدفعات'], ['inactive', 'ملغاة من قبل']]) {
      const a = leaveAsk(cancel({ notify: null, skipped }), 'ورشة');
      expect(a.lines[0]).toContain('لا يُرسل بريد');
      expect(a.lines[0]).toContain(has);
      expect(a.check).toBeUndefined();
    }
    const none = leaveAsk(cancel({ notify: { members: 0, trainer: null } }), 'ورشة');
    expect([none.lines[0], none.check]).toEqual(['لا يُرسل بريد: لا أعضاء في الدفعة يصلهم بريد الآن.', undefined]);
  });
  it('سطر تحذير بعدد من يُسحب اكتماله، وبلاه إن كان صفرًا أو تعذّر حسابه', () => {
    const a = leaveAsk(cancel({ notify: null, skipped: 'ended', uncomplete: 4 }), 'اليوم 2');
    expect(a.lines[1]).toEqual({ tone: 'warn', text: '4 مشاركين أتموا نشاط الحضور أو مرحلته بهذه الجلسة، وبإلغائه يعود غير مكتمل لهم.' });
    expect(leaveAsk(cancel({ uncomplete: 1 }), 'x').lines[1].text).toBe('مشارك واحد أتم نشاط الحضور أو مرحلته بهذه الجلسة، وبإلغائه يعود غير مكتمل له.');
    expect(leaveAsk(cancel({ uncomplete: 0 }), 'x').lines).toHaveLength(1);
    expect(leaveAsk(cancel({ uncomplete: null }), 'x').lines).toHaveLength(1);
  });
  it('الحذف والنقل بنصيهما، والإعادة تسأل عن الدعوة من جديد أو تمر بلا سؤال', () => {
    expect(leaveAsk({ ...cancel(), kind: 'delete' }, 'ورشة')).toMatchObject({ text: 'يُحذف «ورشة» نهائيًا ولا يُستعاد.', ok: 'احذف' });
    expect(leaveAsk({ ...cancel(), kind: 'move' }, 'ورشة')).toMatchObject({ text: 'يُنقل «ورشة» عن دفعته، فيختفي من رحلة أعضائها.', ok: 'احفظ وانقله' });
    const back = leaveAsk({ kind: 'restore', notify: { members: 12, trainer: 'د. منى' }, skipped: null }, 'ورشة');
    expect(back.lines[0]).toBe('أُعلن هذا اليوم ثم أُلغي. تُرسل دعوته من جديد إلى 12 مشاركًا، وإلى المدرب د. منى، ومعها ملف يعيد الموعد إلى التقويم.');
    expect(back.check).toMatchObject({ name: 'reinvite', label: 'ادعُهم من جديد', checked: true });
    expect(back.danger).toBeUndefined();
    expect(leaveAsk({ kind: 'restore', notify: null, skipped: 'unannounced' }, 'ورشة')).toBeNull();
    expect(leaveAsk(null, 'ورشة')).toBeNull();
  });
  it('المعاينة من الخادم بالحفظ نفسه، وتعذّرها يوقف الحفظ، وتغيير الوسم معها يُلحق بأثره وتأكيده', async () => {
    const call = vi.fn(async () => ({ success: true, preview: true, changed: false, leave: cancel() }));
    const a = await leaveConfirm(call, { row: { id: 's1', active: false } }, { title: 'ورشة' });
    expect(call).toHaveBeenCalledWith('admin.workshop-save', { row: { id: 's1', active: false }, preview: true });
    expect(a.check.name).toBe('notify_cancel');
    expect(await leaveConfirm(async () => ({ success: false, message: 'تعذّر' }), {}, {})).toEqual({ error: 'تعذّر' });
    const flip = await leaveConfirm(async () => ({ success: true, changed: true, impact: { members: 3, preserved: 1, required_of: 0, completes: 0, progress_up: 0, progress_down: 0 }, leave: cancel() }), {}, { title: 'ورشة', counting: 'optional' });
    expect(flip.patch).toEqual({ counting_confirm: true });
    expect(flip.lines.length).toBeGreaterThan(2);
    expect(flip.check.name).toBe('notify_cancel');
    const del = vi.fn(async () => ({ success: true, preview: true, leave: { ...cancel(), kind: 'delete' } }));
    expect((await deleteConfirm(del, 's1', 'ورشة')).ok).toBe('احذف');
    expect(del).toHaveBeenCalledWith('admin.workshop-delete', { id: 's1', preview: true });
    expect(await deleteConfirm(async () => ({ success: false }), 's1')).toEqual({ error: 'تعذّرت معاينة الحذف، فلم يُحذف شيء' });
  });
});

describe('ما يُقال بعد الحفظ', () => {
  it('بريد الإلغاء بعدده والمدرب، والمنتظر في الطابور، واختيار ألا يُبلَّغ أحد، وصمت حين لا بريد أصلًا', () => {
    expect(cancelResultAr({ sent: 12, failed: 0, total: 12, trainer: 'sent' })).toBe('وأُرسل بريد الإلغاء إلى 12 مشاركًا، وأُبلغ المدرب');
    expect(cancelResultAr({ sent: 3, failed: 0, total: 3 })).toBe('وأُرسل بريد الإلغاء إلى 3 مشاركين');
    expect(cancelResultAr({ sent: 1, failed: 0, total: 3, queued: 2 })).toContain('و2 تنتظر حصة البريد وتخرج آليًّا');
    expect(cancelResultAr({ sent: 2, failed: 1, total: 3 })).toBe('وأُرسل بريد الإلغاء إلى 2، وتعذّرت 1');
    expect(cancelResultAr({ skipped: 'opted_out' })).toBe('ولم يُبلَّغ أحد كما اخترت');
    for (const skipped of ['unannounced', 'ended', 'undated', 'general', 'inactive', 'already']) expect(cancelResultAr({ skipped })).toBe('');
    expect(cancelResultAr({ error: true })).toContain('تعذّر بريد الإلغاء');
    expect(cancelResultAr({ sent: 0, failed: 0, total: 0, trainer: 'sent' })).toBe('وأُبلغ المدرب');
    expect(cancelResultAr(null)).toBe('');
    expect(savedAr('أُلغي اليوم', { cancel: { sent: 12, failed: 0, total: 12 } })).toBe('أُلغي اليوم، وأُرسل بريد الإلغاء إلى 12 مشاركًا');
    expect(savedAr('أُلغي اليوم', { cancel: { skipped: 'ended' } })).toBe('أُلغي اليوم');
    // النقل مع دعوة الدفعة الجديدة في الحفظ نفسه، والإعادة بدعوتها
    expect(mailResultAr({ cancel: { sent: 3, failed: 0, total: 3 }, invite: { sent: 4, failed: 0, total: 4 } })).toBe('وأُرسل بريد الإلغاء إلى 3 مشاركين، وأُرسلت الدعوة إلى 4 مشاركين');
    expect(mailResultAr({ invite: { sent: 12, failed: 0, total: 12, restored: true, trainer: 'sent' } })).toBe('وأُرسلت الدعوة إلى 12 مشاركًا، وأُبلغ المدرب');
  });
});

describe('ربط اللوحة والخادم', () => {
  it('نافذة التأكيد تحمل مربع الاختيار وسطر التحذير، والنموذج يمرر قيمته إلى الحفظ والحذف', () => {
    const ui = read('admin-app/src/ui.jsx'), form = read('admin-app/src/Form.jsx');
    expect(ui).toContain('data-testid="confirm-check"');
    expect(ui).toMatch(/onDone\(d\.input \? value : d\.check \? \{ checked \} : true\)/);
    expect(form).toContain('[ask.check.name]: yes.checked');
    expect(form).toContain('confirmDelete');
  });
  it('الشاشتان تسألان الخادم قبل الإلغاء والحذف والإعادة، والدعوة لا تُعرض لجلسة ملغاة', () => {
    const cj = read('admin-app/src/screens/CohortJourney.jsx'), act = read('admin-app/src/screens/Activities.jsx');
    expect(cj).toMatch(/cancel: async \(r\) => \{[\s\S]*?preview: true[\s\S]*?leaveAsk\(/);
    expect(cj).toMatch(/restore: async \(r\) => \{[\s\S]*?preview: true[\s\S]*?reinvite: true/);
    for (const src of [cj, act]) { expect(src).toContain('deleteConfirm(L,'); expect(src).toContain('leaveConfirm(L,'); }
    expect(act).toContain('canWrite && s.active && s.cohort_id');
  });
  it('الخادم: بريد الإلغاء من مصدر الدعوة نفسه، جماعي بموعد انتهاء، وله سجل، وقوالبه في المعرض', () => {
    const src = read('supabase/functions/leaders-api/activities.ts'), core = read('supabase/functions/leaders-api/core.ts');
    const notice = src.slice(src.indexOf('async function cancelNotice'), src.indexOf('export async function workshopDelete'));
    expect(notice).toContain('await workshopRecipients(s, true)');
    expect(notice).toContain("{ kind: 'bulk', ref: s.id, expiresAt: s.starts_at }");
    expect(notice).toContain("method: 'CANCEL'");
    expect(notice).toContain("'workshop.cancel-notice'");
    for (const key of ['workshop-cancel', 'workshop-cancel-trainer', 'workshop-restore-trainer']) expect(core).toContain(`key: '${key}'`);
  });
  it('لا شرطة طويلة ولا متوسطة في نصوص الإلغاء', () => {
    const texts = [leaveAsk({ kind: 'cancel', notify: { members: 3, trainer: 'م' }, skipped: null, uncomplete: 2 }, 'ورشة'), leaveAsk({ kind: 'restore', notify: { members: 3, trainer: null }, skipped: null }, 'ورشة')];
    expect(DASH.test(JSON.stringify(texts))).toBe(false);
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(DASH.test(core.slice(core.indexOf('export const WORKSHOP_CANCEL_MAIL'), core.indexOf('export const GROUP_SESSION_MAIL')))).toBe(false);
  });
});
