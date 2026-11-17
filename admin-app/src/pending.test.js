import { afterEach, describe, expect, it, vi } from 'vitest';
import { badgeLabel, badgesOf, badgeText, groupBadge, leadersTotal, newContacts, tabBadge, visiblePoll } from './pending.js';
import { INBOX_KINDS, inboxOf } from '../../supabase/functions/leaders-api/inbox.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const old = '2026-11-01T12:00:00Z', fresh = '2026-11-13T10:00:00Z';

describe('ما ينتظر القرار: العدّ الواحد من صندوق «ينتظرني»', () => {
  it('طلبات التواصل الجديدة وحدها', () => {
    expect(newContacts([{ status: 'new' }, { status: 'read' }, {}])).toBe(2);
    expect(newContacts(null)).toBe(0);
  });

  it('عدّاد كل تبويب مجموع أنواعه بتبويبها في INBOX_KINDS، والمتأخر معه', () => {
    const d = { success: true, skipped: [], ...inboxOf({
      approval: [{ id: 'p1', participant_id: 'p1', at: old }, { id: 'p2', participant_id: 'p2', at: fresh }],
      requirement: [{ id: 'r', participant_id: 'p3', at: fresh }],
      erasure: [{ id: 'e', participant_id: 'p4', at: fresh }],
      model: [{ id: 'm', participant_id: 'p5', at: fresh }],
      capstone: [{ id: 'c', at: fresh }],
      expert_application: [{ id: 'x', at: old }], expert_unmatched: [{ id: 'u', participant_id: 'p6', at: fresh }],
      sponsor: [{ id: 's', participant_id: 'p7', at: fresh }], coaching_confirm: [{ id: 'k', participant_id: 'p8', at: fresh }],
    }, NOW) };
    const b = badgesOf(d);
    expect(b.tabs).toEqual({
      participants: { n: 4, late: 1 }, handbook: { n: 1, late: 0 }, capstones: { n: 1, late: 0 },
      experts: { n: 2, late: 1 }, payments: { n: 1, late: 0 }, activities: { n: 1, late: 0 },
    });
    // المجموع هو مجموع الصندوق نفسه، فلا يختلف العدّاد عن «ينتظرني»
    expect(b.total).toBe(d.total);
    expect(b.late).toBe(d.late);
    expect(b.partial).toBe(false);
    // كل تبويب في الجدول من INBOX_KINDS، لا جدول ثانٍ
    expect(new Set(Object.keys(b.tabs))).toEqual(new Set(Object.values(INBOX_KINDS).map((k) => k.tab)));
    const p = { contacts: 0, badges: b };
    expect(leadersTotal(p)).toBe(10);
    expect(tabBadge(p, 'participants')).toEqual({ n: 4, late: 1 });
    expect(tabBadge(p, 'orgs')).toBeNull();
    expect(groupBadge(p, ['overview', 'participants', 'experts'])).toEqual({ n: 6, late: 2, partial: false });
    expect(groupBadge(p, ['orgs', 'tracks'])).toBeNull();
  });

  it('النوع المتعذر يُسقط عدّاد تبويبه كله ولا يُنقصه، والمجموع معلَّم بأنه ناقص', () => {
    const d = { success: true, skipped: ['erasure'], ...inboxOf({ approval: [{ id: 'p1', participant_id: 'p1', at: fresh }], model: [{ id: 'm', at: fresh }] }, NOW) };
    const b = badgesOf(d);
    expect(b.tabs.participants).toBeUndefined();
    expect(b.tabs.handbook).toEqual({ n: 1, late: 0 });
    expect(b.total).toBe(1);
    expect(b.partial).toBe(true);
    expect(badgeText(b.total, b.partial)).toBe('1+');
    expect(b.off).toEqual(['participants']);
    // المجموعة المطوية التي تضم التبويب المتعذر ناقصة مثل المجموع، لا رقم أقل بلا علامة
    const p = { badges: b };
    const g = groupBadge(p, ['participants', 'handbook']);
    expect(g).toEqual({ n: 1, late: 0, partial: true });
    expect(badgeText(g.n, g.partial)).toBe('1+');
    expect(badgeLabel(g.n, g.late, g.partial)).toBe('1 أو أكثر بانتظارك');
    // مجموعة لا تضمه: عددها كامل. ومجموعة ليس فيها إلا المتعذر: لا عدّاد، لا «0+»
    expect(groupBadge(p, ['handbook', 'orgs'])).toEqual({ n: 1, late: 0, partial: false });
    expect(groupBadge(p, ['participants'])).toBeNull();
  });

  it('خادم أقدم: counts بلا by_tab تُجمع بالتبويب، وبلا أعداد أصلًا لا عدّادات ولا عطل', () => {
    const b = badgesOf({ success: true, counts: { approval: 1, requirement: 2, model: 3, unknown: 9 }, items: [{ kind: 'approval', late: true }] });
    expect(b.tabs).toEqual({ participants: { n: 3, late: 1 }, handbook: { n: 3, late: 0 } });
    expect(badgesOf({ success: true })).toBeNull();
    expect(badgesOf({ success: false, message: 'x' })).toBeNull();
    expect(badgesOf(null)).toBeNull();
    expect(leadersTotal(null)).toBe(0);
    expect(tabBadge(null, 'participants')).toBeNull();
  });

  it('النص والوصف المسموع: «99+» فوق التسعة والتسعين، و«منها 2 متأخر»', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(250, true)).toBe('99+');
    expect(badgeLabel(5, 2)).toBe('5 بانتظارك، منها 2 متأخر');
    expect(badgeLabel(5)).toBe('5 بانتظارك');
    expect(badgeLabel(5, 0, true)).toBe('5 أو أكثر بانتظارك');
  });
});

describe('التحديث الدوري ما دامت الصفحة ظاهرة', () => {
  afterEach(() => vi.useRealTimers());
  const fakeDoc = (state) => {
    const ls = new Set();
    return { visibilityState: state, addEventListener: (_e, f) => ls.add(f), removeEventListener: (_e, f) => ls.delete(f), fire() { ls.forEach((f) => f()); }, ls };
  };
  it('يتوقف حين تُخفى، ويعمل فورًا ثم يستأنف حين تظهر', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const doc = fakeDoc('visible');
    const stop = visiblePoll(fn, 1000, doc);
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);
    doc.visibilityState = 'hidden'; doc.fire();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
    doc.visibilityState = 'visible'; doc.fire();
    expect(fn).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(doc.ls.size).toBe(0);
  });
  it('صفحة مخفية من البداية لا تطلب حتى تظهر', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const doc = fakeDoc('hidden');
    visiblePoll(fn, 1000, doc);
    vi.advanceTimersByTime(3000);
    expect(fn).not.toHaveBeenCalled();
    doc.visibilityState = 'visible'; doc.fire();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
