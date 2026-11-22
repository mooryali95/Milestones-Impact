// الجلسة الجماعية مع المستشار (تصور تشغيل الدفعة 2026-11-19، المرحلة 5): نموذج العرض في اللوحة، وورقة حضورها المشتركة مع بوابة المستشار
import { describe, expect, it } from 'vitest';
import { addedAr, inviteLineAr, resendable, resendState, resentAr, conflictAr, formBlock, groupCountsAr, groupSections, invited, mailAr, previewBody, previewGroups, previewLine, saveBody, savedAr } from './group-session.js';
import { allAttended, canEdit, countsAr, draftAr, filterPeople, groupCounts, groupMarks, savedAr as sheetSavedAr, stateOf, withState } from '../../shared/ui/group-sheet.js';
import { expertStats, sessionUnits, tallyOnce, coachingStatus, groupMemberState } from '../../supabase/functions/leaders-api/logic.js';
import { INBOX_KINDS, inboxOf } from '../../supabase/functions/leaders-api/inbox.js';

const members = [
  { id: 'a', name: 'سارة', category: 'ok', code: 'ok', used: 0, max: 2 },
  { id: 'b', name: 'خالد', category: 'ok', code: 'ok', used: 1, max: 2, test: true },
  { id: 'c', name: 'منى', category: 'at_max', code: 'at_max', reason: 'استنفد رصيده (2 من 2)', used: 2, max: 2 },
  { id: 'd', name: 'فهد', category: 'locked', code: 'locked', reason: 'الخدمة لم تُفتح له بعد' },
  { id: 'e', name: 'هند', category: 'ineligible', code: 'out', reason: 'خارج البرنامج' },
];
const form = { requirement_id: 'r1', expert_id: 'x1', title_ar: ' جلسة ', starts_at: '2026-12-06T10:00', minutes: 90, mode: 'online', join_url: 'https://meet.example.sa/g', location_ar: '', off: false };

describe('المعاينة قبل الحفظ', () => {
  it('أقسامها ومن يُدعى: الأهل، ومن اختير استثناءً وحده', () => {
    const g = previewGroups(members);
    expect([g.ok.length, g.at_max.length, g.locked.length, g.ineligible.length]).toEqual([2, 1, 1, 1]);
    expect(invited(members, new Set()).map((m) => m.id)).toEqual(['a', 'b']);
    expect(invited(members, new Set(['c', 'e'])).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('جملتها تقول من يُدعى ومن يُتخطى ومن لا يُضاف', () => {
    expect(previewLine(members, new Set())).toBe('2 سيُدعون. 1 استنفد رصيده ويُتخطى. 1 لم تُفتح له الخدمة ويُتخطى. 1 لا يُضاف.');
    expect(previewLine(members, new Set(['c']))).toBe('3 سيُدعون (منهم 1 استثناءً). 1 لم تُفتح له الخدمة ويُتخطى. 1 لا يُضاف.');
    expect(previewLine([members[4]], new Set())).toBe('لا أحد سيُدعى. 1 لا يُضاف.');
    expect(previewLine([members[0]], new Set())).toBe('واحد سيُدعى.');
  });
  it('ما يمنع الحفظ يُقال قبل الإرسال', () => {
    expect(formBlock(form, members, new Set())).toBe('');
    expect(formBlock({ ...form, expert_id: '' }, members, new Set())).toBe('اختر المستشار');
    expect(formBlock({ ...form, starts_at: '' }, members, new Set())).toBe('حدد موعد الجلسة');
    expect(formBlock({ ...form, minutes: 5 }, members, new Set())).toBe('المدة من 15 إلى 480 دقيقة');
    expect(formBlock({ ...form, mode: 'in_person' }, members, new Set())).toBe('اكتب مكان الجلسة الحضورية');
    expect(formBlock({ ...form, join_url: 'http://x' }, members, new Set())).toBe('رابط الجلسة يبدأ بـhttps://');
    expect(formBlock(form, [members[4]], new Set())).toBe('لا أحد من المختارين يُدعى إلى هذه الجلسة');
  });
  it('جسم الحفظ والمعاينة: الخانة تقلب counts، والحضوري بلا رابط، والاستثناءات كما اختيرت', () => {
    const b = saveBody('c1', ['a', 'c'], form, new Set(['c']), true);
    expect(b).toMatchObject({ cohort_id: 'c1', participant_ids: ['a', 'c'], requirement_id: 'r1', expert_id: 'x1', title_ar: 'جلسة', minutes: 90, mode: 'online', join_url: 'https://meet.example.sa/g', counts: true, exceptions: ['c'], confirm_conflict: true });
    expect(b.starts_at).toBe(new Date('2026-12-06T10:00').toISOString());
    expect(saveBody('c1', ['a'], { ...form, off: true, mode: 'in_person', location_ar: ' القاعة ' }, new Set())).toMatchObject({ counts: false, mode: 'in_person', join_url: '', location_ar: 'القاعة' });
    expect('confirm_conflict' in saveBody('c1', ['a'], form, new Set())).toBe(false);
    expect(previewBody('c1', ['a'], { ...form, expert_id: '', starts_at: '' })).toEqual({ cohort_id: 'c1', participant_ids: ['a'], requirement_id: 'r1', counts: true });
  });
  it('نتيجة الحفظ والبريد والتعارض بجمل', () => {
    expect(savedAr({ success: true, added: 6, exceptions: 1, mail: { sent: 5, queued: 1, failed: 0, skipped: 0 }, expert_mail: 'sent' }))
      .toBe('حُفظت الجلسة ودُعي 6 مشاركين (1 استثناءً). أُرسلت 5 دعوات، 1 تنتظر في صندوق «لم يُرسل» وتخرج حين تتسع حصة اليوم، وأُبلغ المستشار.');
    expect(savedAr({ success: true, added: 1, past: true })).toBe('حُفظت الجلسة ودُعي مشارك واحد. موعدها مضى، فلا بريد. سجّل حضورها من ورقتها.');
    expect(mailAr({ sent: 1, skipped: 1 }, 'failed')).toBe('أُرسلت دعوة واحدة، 1 بلا بريد (حساب اختبار)، وتعذّر بريد المستشار');
    expect(mailAr({}, 'none')).toBe('');
    expect(conflictAr({ kind: 'group', starts_at: 'x' }, () => 'الأحد')).toBe('جلسة جماعية أخرى الأحد');
    expect(conflictAr({ kind: 'workshop', title: 'اليوم 1', starts_at: 'x' }, () => 'الأحد')).toBe('ورشة «اليوم 1» الأحد');
  });
  it('قائمة الجلسات: ما ينتظر التأكيد أولًا، ثم القادمة، ثم المنعقدة، والملغاة وحدها', () => {
    const g = (id, extra) => ({ id, status: 'scheduled', starts_at: '2026-12-01T08:00:00Z', ended: false, awaiting: false, count: 3, attended: 0, no_show: 0, excused: 0, pending: 3, ...extra });
    const s = groupSections([g('u'), g('w', { ended: true, awaiting: true }), g('d', { ended: true, attended: 3, pending: 0 }), g('x', { status: 'cancelled' })]);
    expect([s.awaiting.map((x) => x.id), s.upcoming.map((x) => x.id), s.done.map((x) => x.id), s.cancelled.map((x) => x.id)]).toEqual([['w'], ['u'], ['d'], ['x']]);
    expect(groupCountsAr(g('w', { ended: true, attended: 1, no_show: 1, pending: 1 }))).toBe('3 مدعوين · حضر 1 · لم يحضر 1 · لم يُؤكَّد 1');
    expect(groupCountsAr(g('u', { count: 1 }))).toBe('مدعو واحد');
  });
});

describe('ورقة حضور الجلسة الجماعية', () => {
  const people = [{ id: 'a', full_name: 'سارة الأحمد', state: 'booked' }, { id: 'b', full_name: 'خالد', state: 'no_show', locked: true }, { id: 'c', full_name: 'أسامة', state: 'attended' }];
  it('المسودة تحمل ما تغيّر وحده، وإعادة الحالة المحفوظة تخرجها', () => {
    let d = withState(people, {}, 'a', 'attended');
    expect([stateOf(people[0], d), groupMarks(people, d)]).toEqual(['attended', [{ id: 'a', state: 'attended' }]]);
    d = withState(people, d, 'a', 'booked');
    expect(groupMarks(people, d)).toEqual([]);
    expect(withState(people, {}, 'zz', 'attended')).toEqual({});
  });
  it('«الكل حضر» لمن لم يُؤكَّد وحده، والمستشار لا يغيّر ما أكّده غيره', () => {
    expect(groupMarks(people, allAttended(people, {}, 'admin'))).toEqual([{ id: 'a', state: 'attended' }]);
    expect([canEdit(people[1], 'expert'), canEdit(people[1], 'admin'), canEdit(people[0], 'expert')]).toEqual([false, true, true]);
  });
  it('الأعداد وسطر المسودة ونتيجة الحفظ', () => {
    const d = { a: 'excused', c: 'booked' };
    expect(groupCounts(people, d)).toEqual({ total: 3, attended: 0, no_show: 1, excused: 1, pending: 1 });
    expect(countsAr(groupCounts(people, {}))).toBe('حضر 1 من 3 · لم يحضر 1 · لم يُؤكَّد 1');
    expect(draftAr(groupMarks(people, d))).toBe('اعتذر 1، تراجع 1');
    expect(sheetSavedAr({ marked: 2, already: 1, pending: 0, refused: [{ id: 'b', message: 'أكّده غيرك' }] }, (id) => people.find((p) => p.id === id).full_name))
      .toEqual({ tone: 'warn', text: 'سُجّل 2، كما هو 1، لم يُسجَّل 1', refused: [{ id: 'b', name: 'خالد', message: 'أكّده غيرك' }], left: 0 });
    expect(filterPeople(people, 'اسامه').map((p) => p.id)).toEqual(['c']);
  });
});

describe('الجلسة الجماعية في الحساب: مرة واحدة للمستشار، وصف لكل مشارك في رصيده', () => {
  const row = (i, extra = {}) => ({ id: `r${i}`, group_id: 'g1', expert_id: 'e', participant_id: `p${i}`, status: 'attended', starts_at: '2026-11-01T08:00:00Z', ends_at: '2026-11-01T09:30:00Z', ...extra });
  it('ساعة ونصف لثمانية مدعوين ساعة ونصف، لا اثنتا عشرة', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i));
    expect(expertStats(rows, 400)).toEqual({ sessions: 1, attended: 1, no_show: 0, upcoming: 0, participants: 8, hours: 1.5, cost: 600 });
    expect(sessionUnits(rows)).toHaveLength(1);
    expect(tallyOnce(rows)).toEqual({ e: 1 });
  });
  it('حالة الوحدة: منعقدة إن حضر أحد، محجوزة إن بقي من لم يُؤكَّد، ولم يحضر إن غابوا، وملغاة إن أُلغيت', () => {
    const st = (list) => sessionUnits(list.map((s, i) => row(i, { status: s })))[0].status;
    expect([st(['no_show', 'attended']), st(['booked', 'no_show']), st(['no_show', 'cancelled']), st(['cancelled', 'cancelled'])]).toEqual(['attended', 'booked', 'no_show', 'cancelled']);
  });
  it('حالة المدعو من صفه: اعتذر ملغى مؤكَّد، وأُزيل ملغى بلا تأكيد', () => {
    expect([groupMemberState({ status: 'cancelled', confirmed_at: 'x' }), groupMemberState({ status: 'cancelled' }), groupMemberState({ status: 'requested' }), groupMemberState(null)]).toEqual(['excused', 'removed', 'booked', 'removed']);
  });
  it('رصيد المشارك: الجماعية تأخذ جلسة، وخارج الرصيد لا تأخذ، والملغاة تعيدها', () => {
    const cfg = { sessions_required: 1, max_sessions: 2 };
    const s = (extra) => ({ id: 'x', status: 'booked', group_id: 'g', starts_at: '2026-12-01T08:00:00Z', ends_at: '2026-12-01T09:00:00Z', ...extra });
    expect(coachingStatus(cfg, [s({})])).toMatchObject({ used: 1, at_max: false });
    expect(coachingStatus(cfg, [s({ off_allowance: true })])).toMatchObject({ used: 0, off: 1 });
    expect(coachingStatus(cfg, [s({ status: 'cancelled' })])).toMatchObject({ used: 0, sessions: [] });
    expect(coachingStatus(cfg, [s({ group: { title: 'جلسة', with: 'د. منى', mode: 'online', location: null } })]).sessions[0]).toMatchObject({ group: true, title: 'جلسة', with: 'د. منى' });
    // الجلسة الفردية كما كانت: بلا علامة ولا حقول جديدة
    expect(Object.keys(coachingStatus(cfg, [s({ group_id: undefined })]).sessions[0]).sort()).toEqual(['awaiting', 'ends_at', 'id', 'join_url', 'kind', 'starts_at', 'status']);
  });
  it('صندوق «ينتظرني»: بند الجلسة الجماعية بنوعه ووجهته، متأخر بعد مهلته', () => {
    const now = Date.parse('2026-12-10T08:00:00Z');
    const box = inboxOf({ coaching_group_confirm: [{ id: 'g1', title: 'جلسة جماعية', sub: '3 مدعوين بلا تأكيد', at: '2026-12-07T08:00:00Z' }] }, now);
    expect(box.items[0]).toMatchObject({ kind: 'coaching_group_confirm', kind_ar: INBOX_KINDS.coaching_group_confirm.label, late: true, to: { tab: 'activities', id: null, query: 'sub=groups' } });
    expect(box.by_tab.activities).toEqual({ n: 1, late: 1 });
  });
});

describe('المتابعات: إضافة مدعوين إلى جلسة قائمة، وإعادة إرسال الدعوة', () => {
  const NOW = Date.parse('2026-11-20T09:00:00Z');
  const when = (iso) => `[${iso.slice(11, 16)}]`;
  const m = (extra = {}) => ({ id: 'p', full_name: 'سارة', state: 'booked', ...extra });
  it('نتيجة الإضافة جملة: العدد والاستثناء والبريد، وأن السابقين لم يصلهم شيء', () => {
    expect(addedAr({ success: true, added: 2, exceptions: 1, mail: { sent: 1, queued: 0, failed: 0, skipped: 1 } })).toBe('أُضيف مشاركان (1 استثناءً). أُرسلت دعوة واحدة، 1 بلا بريد (حساب اختبار). المدعوون السابقون لم يصلهم شيء.');
    expect(addedAr({ success: true, added: 1, exceptions: 0, past: true, mail: {} })).toBe('أُضيف مشارك واحد. بدأت الجلسة، فلا بريد.');
    expect(addedAr({ success: true, added: 0, already: true })).toBe('كلهم مدعوون أصلًا، فلا إضافة ولا بريد.');
    expect(addedAr({ success: false })).toBe('');
  });
  it('حال إعادة الدعوة: تُعاد، أو ممسوكة بمهلتها، أو تنتظر في الطابور، ولا تُعاد لحساب اختبار ولا لمن سُجّل حضوره', () => {
    expect(resendState(m({ mail: { state: 'sent', at: '2026-11-19T08:00:00Z' } }), NOW)).toBe('ready');
    expect(resendState(m({ mail: { state: 'sent', at: '2026-11-20T08:30:00Z', resend_at: '2026-11-20T09:30:00Z' } }), NOW)).toBe('held');
    // مضت المهلة منذ قُرئت القائمة: تُعاد
    expect(resendState(m({ mail: { state: 'sent', at: '2026-11-20T07:30:00Z', resend_at: '2026-11-20T08:30:00Z' } }), NOW)).toBe('ready');
    expect(resendState(m({ mail: { state: 'waiting', at: '2026-11-20T08:30:00Z' } }), NOW)).toBe('waiting');
    expect(resendState(m({ mail: { state: 'failed', at: '2026-11-20T08:59:00Z' } }), NOW)).toBe('ready');
    expect(resendState(m(), NOW)).toBe('ready');
    expect([resendState(m({ test: true }), NOW), resendState(m({ state: 'attended' }), NOW), resendState(m({ state: 'excused' }), NOW), resendState(null, NOW)]).toEqual(['none', 'none', 'none', 'none']);
    const g = { members: [m({ id: 'a' }), m({ id: 'b', test: true }), m({ id: 'c', mail: { state: 'waiting', at: 'x' } }), m({ id: 'd', mail: { state: 'sent', at: 'x', resend_at: '2026-11-20T09:30:00Z' } }), m({ id: 'e', state: 'no_show' })] };
    expect(resendable(g, NOW).map((x) => x.id)).toEqual(['a']);
  });
  it('سطر بريد الدعوة: متى خرجت، أو أنها تنتظر، أو لم تخرج، ولا سطر حين لا يُقرأ السجل', () => {
    expect(inviteLineAr(m({ mail: { state: 'sent', at: '2026-11-19T08:00:00Z' } }), when)).toBe('آخر دعوة: [08:00]');
    expect(inviteLineAr(m({ mail: { state: 'waiting', at: '2026-11-19T08:00:00Z' } }), when)).toBe('دعوته تنتظر في صندوق «لم يُرسل»');
    expect(inviteLineAr(m({ mail: { state: 'failed', at: '2026-11-19T08:00:00Z' } }), when)).toBe('لم تخرج دعوته ([08:00])');
    expect(inviteLineAr(m(), when)).toBe('لا دعوة له في سجل البريد');
    expect([inviteLineAr(m(), when, false), inviteLineAr(m({ test: true }), when), inviteLineAr(m({ state: 'attended', mail: { state: 'sent', at: 'x' } }), when)]).toEqual(['', '', '']);
  });
  it('نتيجة إعادة الإرسال جملة: ما خرج، وما لم يُعد بمهلته', () => {
    expect(resentAr({ success: true, mail: { sent: 3, queued: 0, failed: 0, skipped: 0 }, throttled: 0, minutes: 60 })).toBe('أُرسلت 3 دعوات');
    expect(resentAr({ success: true, mail: { sent: 1, queued: 1, failed: 0, skipped: 0 }, throttled: 2, minutes: 60 }))
      .toBe('أُرسلت دعوة واحدة، 1 تنتظر في صندوق «لم يُرسل» وتخرج حين تتسع حصة اليوم. 2 لم تُعد دعوتهم: أُرسلت قبل أقل من 60 دقيقة أو تنتظر في الطابور');
    expect(resentAr({ success: true, mail: { sent: 0, queued: 0, failed: 0, skipped: 0 }, throttled: 1, minutes: 60 })).toBe('واحد لم تُعد دعوته: أُرسلت قبل أقل من 60 دقيقة أو تنتظر في الطابور');
    expect(resentAr({ success: true, mail: {}, throttled: 0 })).toBe('لا دعوة تُعاد الآن');
  });
});
