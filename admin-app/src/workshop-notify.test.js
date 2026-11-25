// متابعات بريد الورشة في اللوحة (قرار المالك 2026-11-22): سحب موعد جلسة أُعلنت، وإلغاء جلسة غُيّر موعدها بلا إبلاغ، وبريد المدرب
// (دعوته وتحديثه واستبداله)، وكلمة الشاشة في السؤال («اليوم» أو «الموعد»). السلوك على الخادم في workshop_notify_test.ts (Deno).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cancelResultAr, deleteConfirm, leaveAsk, leaveConfirm, leaveKind, mailConfirm, mailResultAr, savedAr, TRAINER_HELP_AR, trainerAr } from './workshop-days.js';

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const day = (extra = {}) => ({ id: 's1', title_ar: 'ورشة التفاوض', cohort_id: 'c1', active: true, invited_at: '2026-11-20T08:00:00Z', starts_at: '2026-11-30T06:00:00Z', ends_at: '2026-11-30T12:00:00Z', ...extra });
const undate = (extra = {}) => ({ kind: 'undate', notify: { members: 12, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0, ...extra });

describe('سحب الموعد خروج يُسأل عنه (يطابق leaveOf في الخادم)', () => {
  it('جلسة مؤرخة يُفرغ موعدها، لا جلسة بلا موعد أصلًا، والإلغاء والنقل يغلبانه', () => {
    expect(leaveKind(day(), { active: true, starts_at: '', ends_at: '' })).toBe('undate');
    expect(leaveKind(day(), { active: true, starts_at: null })).toBe('undate');
    expect(leaveKind(day(), { active: true, starts_at: '2026-12-01T09:00' })).toBeNull();   // تغيير الموعد ليس سحبًا
    expect(leaveKind(day({ starts_at: null, ends_at: null }), { active: true, starts_at: '' })).toBeNull();
    expect(leaveKind(day(), { active: false, starts_at: '' })).toBe('cancel');
    expect(leaveKind(day(), { active: true, cohort_id: 'c2', starts_at: '' })).toBe('move');
    expect(leaveKind(day({ active: false }), { active: true, starts_at: '' })).toBe('restore');
  });
  it('السؤال: العدد والمدرب، ومربع «أبلغ المدعوين بسحب الموعد» معلَّم، وليس خطرًا', () => {
    const a = leaveAsk(undate(), 'ورشة التفاوض');
    expect(a.text).toBe('يُسحب موعد «ورشة التفاوض»: يبقى في رحلة المشاركين بلا موعد، «يُحدد لاحقًا».');
    expect(a.lines).toEqual(['يصل بريد سحب الموعد إلى 12 مشاركًا، وإلى المدرب د. منى القحطاني، ومعه ملف يزيل الموعد من التقويم.']);
    expect(a.check).toMatchObject({ name: 'notify_cancel', label: 'أبلغ المدعوين بسحب الموعد', checked: true });
    expect([a.ok, a.danger]).toEqual(['احفظ بلا موعد', undefined]);
  });
  it('سحب موعد لا يُبلَّغ به أحد حفظ عادي بلا سؤال', () => {
    expect(leaveAsk(undate({ notify: null, skipped: 'unannounced' }), 'ورشة')).toBeNull();
    expect(leaveAsk(undate({ notify: null, skipped: 'ended' }), 'ورشة')).toBeNull();
    expect(leaveAsk(undate({ notify: { members: 0, trainer: null } }), 'ورشة')).toBeNull();
    // والمدرب وحده يُبلَّغ إن لم يكن في الدفعة من يصله بريد
    expect(leaveAsk(undate({ notify: { members: 0, trainer: 'د. منى' } }), 'ورشة').lines[0]).toContain('إلى المدرب د. منى');
  });
  it('المعاينة من الخادم بالحفظ نفسه', async () => {
    const call = vi.fn(async () => ({ success: true, preview: true, changed: false, leave: undate() }));
    const a = await leaveConfirm(call, { row: { id: 's1', starts_at: '' } }, { title: 'ورشة', noun: 'الموعد' });
    expect(call).toHaveBeenCalledWith('admin.workshop-save', { row: { id: 's1', starts_at: '' }, preview: true });
    expect(a.check.name).toBe('notify_cancel');
    expect(await leaveConfirm(async () => ({ success: true, changed: false, leave: undate({ notify: null, skipped: 'unannounced' }) }), {}, {})).toBeNull();
  });
});

describe('جلسة غُيّر موعدها بلا إبلاغ: السؤال يقول أي موعد يعرفه المدعوون', () => {
  it('سطر بالموعد السابق في الإلغاء والحذف وسحب الموعد، وبلاه حين يطابق المخزَّن', () => {
    const base = { kind: 'cancel', notify: { members: 12, trainer: null }, skipped: null, uncomplete: 0 };
    const a = leaveAsk({ ...base, told_at: '2026-11-30T06:00:00Z' }, 'اليوم 3');
    expect(a.lines).toHaveLength(2);
    expect(a.lines[1]).toMatch(/^المدعوون يعرفون موعدًا سابقًا لم يُبلَّغوا بتغييره: .*30 نوفمبر.*\. البريد يقول إنه هو الملغى\.$/);
    expect(leaveAsk({ ...base, kind: 'delete', told_at: '2026-11-30T06:00:00Z' }, 'x').lines[1]).toContain('هو الملغى.');
    expect(leaveAsk(undate({ told_at: '2026-11-30T06:00:00Z' }), 'x').lines[1]).toContain('هو المسحوب.');
    expect(leaveAsk(base, 'x').lines).toHaveLength(1);
    // لا بريد أصلًا: لا سطر عن موعد سابق
    expect(leaveAsk({ ...base, notify: null, skipped: 'ended', told_at: '2026-11-30T06:00:00Z' }, 'x').lines).toHaveLength(1);
  });
});

describe('كلمة الشاشة في السؤال', () => {
  it('«اليوم» في بطاقة المرحلة و«الموعد» في «الحضور والجلسات»', async () => {
    const cancel = { kind: 'cancel', notify: { members: 3, trainer: null }, skipped: null, uncomplete: 0 };
    const back = { kind: 'restore', notify: { members: 3, trainer: null }, skipped: null };
    expect(leaveAsk(cancel, 'x').ok).toBe('ألغِ اليوم');
    expect(leaveAsk(cancel, 'x', { noun: 'الموعد' }).ok).toBe('ألغِ الموعد');
    const r = leaveAsk(back, 'x', { noun: 'الموعد' });
    expect(r.lines[0]).toContain('أُعلن هذا الموعد ثم أُلغي.');
    expect(r.check.help).toBe('بلا العلامة يُعاد الموعد بلا بريد، وتُرسل دعوته لاحقًا من زرها.');
    expect(JSON.stringify(r)).not.toContain('اليوم');
    const call = async () => ({ success: true, preview: true, changed: false, leave: cancel });
    expect((await leaveConfirm(call, {}, { title: 'x', noun: 'الموعد' })).ok).toBe('ألغِ الموعد');
    expect((await deleteConfirm(async () => ({ success: true, leave: { ...cancel, kind: 'delete' } }), 's1', 'x', { noun: 'الموعد' })).ok).toBe('احذف');
  });
  it('شاشة «الحضور والجلسات» تمرر كلمتها، وبعد الحذف تقول «حُذف الموعد» لا «تم الحفظ»', () => {
    const act = read('admin-app/src/screens/Activities.jsx');
    expect(act).toContain("const NOUN = 'الموعد'");
    expect(act).toContain('noun: NOUN })');
    expect(act).toContain("deleteConfirm(L, s.id, s.title_ar, { noun: NOUN })");
    expect(act).toMatch(/saved\.current\?\.deleted \? \['حُذف الموعد', cancelResultAr\(saved\.current\.cancel\)\]/);
  });
});

describe('ما يُقال بعد الحفظ', () => {
  it('سحب الموعد ببريده، واختيار ألا يُبلَّغ أحد', () => {
    expect(savedAr('تم الحفظ', { undate: { sent: 12, failed: 0, total: 12, trainer: 'sent' } })).toBe('تم الحفظ، وأُرسل بريد سحب الموعد إلى 12 مشاركًا، وأُبلغ المدرب');
    expect(savedAr('تم الحفظ', { undate: { skipped: 'opted_out' } })).toBe('تم الحفظ، ولم يُبلَّغ أحد كما اخترت');
    expect(savedAr('تم الحفظ', { undate: { skipped: 'unannounced' } })).toBe('تم الحفظ');
    expect(cancelResultAr({ error: true }, 'بريد سحب الموعد')).toBe('وتعذّر بريد سحب الموعد، فأبلغ المدعوين بطريقتك');
  });
  it('المدرب مع الدعوة والتحديث، والاستبدال: السابق أُبلغ والجديد دُعي', () => {
    expect(mailResultAr({ invite: { sent: 12, failed: 0, total: 12, trainer: 'sent' } })).toBe('وأُرسلت الدعوة إلى 12 مشاركًا، وأُبلغ المدرب');
    expect(mailResultAr({ invite: { sent: 12, failed: 0, total: 12 } })).toBe('وأُرسلت الدعوة إلى 12 مشاركًا');
    expect(mailResultAr({ change: { sent: 5, failed: 0, total: 5, trainer: 'queued' } })).toBe('وأُبلغ بالتغيير إلى 5 مشاركين، وبريد المدرب ينتظر حصة البريد');
    expect(mailResultAr({ released: 'sent', trainer: 'sent' })).toBe('وأُبلغ المدرب السابق، وأُرسلت الدعوة إلى المدرب الجديد');
    expect(mailResultAr({ released: 'sent' })).toBe('وأُبلغ المدرب السابق');
    expect(mailResultAr({ trainer: 'failed' })).toBe('وتعذّرت دعوة المدرب الجديد');
    expect(mailResultAr({ released: 'sent', change: { sent: 5, failed: 0, total: 5, trainer: 'sent' } })).toBe('وأُبلغ المدرب السابق، وأُبلغ بالتغيير إلى 5 مشاركين، وأُبلغ المدرب');
    expect(mailResultAr({})).toBe('');
    expect([trainerAr({ trainer: 'sent' }), trainerAr({}), trainerAr(null)]).toEqual(['، وأُبلغ المدرب', '', '']);
  });
  it('سؤال الحفظ الذي يرسل بريدًا يذكر المدرب إن سُمّي، والحقل يقول ما يجري عند تغييره', () => {
    expect(mailConfirm({ invite: true, title_ar: 'ورشة', expert_id: 'e1' }).text).toContain('إلى أعضاء الدفعة ومدربها الآن');
    expect(mailConfirm({ invite: true, title_ar: 'ورشة' }).text).toContain('إلى أعضاء الدفعة الآن');
    expect(mailConfirm({ notify_change: true, title_ar: 'ورشة', expert_id: 'e1' }).text).toContain('إلى من دُعي إليها وإلى مدربها،');
    expect(TRAINER_HELP_AR).toContain('تغييره في جلسة أُرسلت دعوتها يبلّغ السابق ويدعو الجديد.');
  });
});

describe('ربط اللوحة والخادم', () => {
  it('الخادم: «دُعي من قبل» من سجل العمليات بمعرّفه المتصاعد، وبريد المدرب جماعي ينتهي بموعد الجلسة، وقوالبه في المعرض', () => {
    const src = read('supabase/functions/leaders-api/activities.ts'), core = read('supabase/functions/leaders-api/core.ts');
    const told = src.slice(src.indexOf('async function toldOf'), src.indexOf('const cancelSkip'));
    expect(told).toContain("db.from('audit_log')");
    expect(told).toContain(".order('id', { ascending: false })");
    const trainer = src.slice(src.indexOf('async function trainerMail'), src.indexOf('async function releaseTrainer'));
    expect(trainer).toContain("{ category: 'expert_work', kind: 'bulk', ref: s.id, recipient: { kind: 'expert', id: s.expert_id }, expiresAt: s.starts_at }");
    expect(trainer).toContain('uid: s.id');
    expect(src).toContain("leave === 'undate' ? (q) => q.not('starts_at', 'is', null)");
    for (const key of ['workshop-invite-to-trainer', 'workshop-change-trainer', 'workshop-undate', 'workshop-undate-trainer', 'workshop-release-trainer', 'workshop-cancel-stale']) expect(core).toContain(`key: '${key}'`);
    // المدرب تصله الدعوة، فبريد إلغائه بلا تحوّط
    expect(core).not.toContain('إن كان فيه');
  });
  it('لا شرطة طويلة ولا متوسطة في النصوص الجديدة', () => {
    const texts = [leaveAsk(undate({ told_at: '2026-11-30T06:00:00Z' }), 'ورشة'), leaveAsk({ kind: 'restore', notify: { members: 3, trainer: null }, skipped: null }, 'ورشة', { noun: 'الموعد' }),
      mailResultAr({ released: 'sent', trainer: 'sent' }), mailConfirm({ invite: true, expert_id: 'e1' }), TRAINER_HELP_AR];
    expect(DASH.test(JSON.stringify(texts))).toBe(false);
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(DASH.test(core.slice(core.indexOf('export const WORKSHOP_CANCEL_MAIL'), core.indexOf('export const GROUP_SESSION_MAIL')))).toBe(false);
  });
});
