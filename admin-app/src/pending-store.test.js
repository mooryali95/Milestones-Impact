import { beforeEach, describe, expect, it, vi } from 'vitest';

const replies = [];
// كل رد يُسلَّم حين يُطلب، أو يُمسك (hold) حتى يُطلق باليد لاختبار ما يقع والطلب جار
const held = [];
let hold = false;
const L = vi.fn(() => {
  const r = replies.shift();
  if (hold) return new Promise((res, rej) => held.push(() => (r instanceof Error ? rej(r) : res(r))));
  return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
});
vi.mock('./leaders.js', () => ({ L: (...a) => L(...a) }));
vi.mock('./api.js', () => ({ call: vi.fn() }));
const { inboxState, loadInbox, resetInbox, subscribeInbox } = await import('./pending.js');
const { changesPending } = await vi.importActual('./leaders.js');
const { INBOX_KINDS } = await import('../../supabase/functions/leaders-api/inbox.js');
const flush = () => new Promise((r) => setTimeout(r, 0));

const ok = { success: true, skipped: [], total: 3, late: 1, counts: { approval: 3 }, by_tab: { participants: { n: 3, late: 1 } }, items: [] };

describe('مخزن الصندوق: طلب واحد يتشاركه العدّاد والشاشة', () => {
  beforeEach(() => { resetInbox(); L.mockClear(); replies.length = 0; held.length = 0; hold = false; });
  it('طالبان في اللحظة نفسها طلب واحد', async () => {
    replies.push(ok);
    await Promise.all([loadInbox(), loadInbox()]);
    expect(L).toHaveBeenCalledTimes(1);
    expect(L).toHaveBeenCalledWith('admin.inbox');
    expect(inboxState().badges.total).toBe(3);
  });
  it('تعذّر الصندوق لا يُظهر صفرًا كاذبًا: يبقى آخر عدد معروف، والشاشة ترى الخطأ', async () => {
    replies.push(ok, { success: false, message: 'تعذّر' }, new Error('شبكة'));
    await loadInbox();
    await loadInbox();
    expect(inboxState().last.success).toBe(false);
    expect(inboxState().badges.tabs.participants).toEqual({ n: 3, late: 1 });
    await loadInbox();
    expect(inboxState().last).toMatchObject({ success: false, message: 'شبكة' });
    expect(inboxState().badges.total).toBe(3);
  });
  it('خادم أقدم بلا أعداد: لا عدّادات', async () => {
    replies.push(ok, { success: true, items: [] });
    await loadInbox();
    await loadInbox();
    expect(inboxState().badges).toBeNull();
  });

  it('تحديث بعد حفظ لا يكتفي بطلب بدأ قبله: يُطلب مرة أخرى حين ينتهي، والتحديثات المتزامنة مرة واحدة', async () => {
    const before = { ...ok, by_tab: { participants: { n: 3, late: 1 } } };
    const after = { ...ok, total: 0, late: 0, counts: {}, by_tab: {} };
    replies.push(before, after);
    hold = true;
    const poll = loadInbox();
    const a = loadInbox(true), b = loadInbox(true);
    expect(a).toBe(b);
    expect(L).toHaveBeenCalledTimes(1);
    hold = false;
    held.shift()();
    await poll;
    const d = await a;
    expect(L).toHaveBeenCalledTimes(2);
    expect(d).toBe(after);
    expect(inboxState().badges.total).toBe(0);
    // بلا طلب جار: التحديث بعد الحفظ طلب واحد عادي
    replies.push(ok);
    await loadInbox(true);
    expect(L).toHaveBeenCalledTimes(3);
  });
  it('الخروج أو تبديل الحساب: رد طلب الجلسة السابقة لا يكتب في المخزن، والمشتركون يُبلَّغون بالمسح', async () => {
    replies.push(ok);
    await loadInbox();
    const seen = [];
    const off = subscribeInbox((s) => seen.push(s.badges));
    hold = true;
    replies.push(ok);
    const old = loadInbox();
    const again = loadInbox(true);
    resetInbox();
    expect(seen).toEqual([null]);
    // طلب الجلسة الجديدة يبدأ ولا يتشارك طلب السابقة
    replies.push({ ...ok, total: 1, by_tab: { handbook: { n: 1, late: 0 } } });
    const fresh = loadInbox();
    expect(L).toHaveBeenCalledTimes(3);
    held.shift()();
    await old;
    await again;
    expect(inboxState().last).toBeNull();
    expect(inboxState().badges).toBeNull();
    expect(inboxState().inflight).toBe(fresh);
    held.shift()();
    await fresh;
    await flush();
    expect(inboxState().badges.tabs).toEqual({ handbook: { n: 1, late: 0 } });
    expect(L).toHaveBeenCalledTimes(3);
    off();
  });
});

describe('أوامر القرار تحدّث العدّادات: لكل نوع في الصندوق أمر قرار، والمعاينة لا تحدّث', () => {
  const byKind = {
    approval: ['admin.approve', 'admin.approve-bulk'],
    requirement: ['admin.review'],
    model: ['admin.review-submission', 'admin.review-bulk'],
    model_gate: ['admin.review-submission'],
    capstone: ['admin.capstone-review'],
    expert_application: ['admin.expert-set-status'],
    expert_unmatched: ['admin.expert-match', 'admin.expert-assign', 'admin.expert-request-cancel', 'admin.expert-request-retry'],
    sponsor: ['admin.sponsor-decide'],
    erasure: ['admin.erasure-execute', 'admin.erasure-decline', 'admin.erasure-withdrawn'],
    coaching_confirm: ['admin.coaching-mark'],
    coaching_group_confirm: ['admin.coaching-group-mark', 'admin.coaching-group-cancel'],
  };
  it('كل نوع مغطى', () => {
    expect(Object.keys(byKind).sort()).toEqual(Object.keys(INBOX_KINDS).sort());
    for (const acts of Object.values(byKind)) for (const a of acts) expect(changesPending(a, {})).toBe(true);
  });
  it('المعاينة والقراءة لا تحدّث', () => {
    expect(changesPending('admin.approve-bulk', { dry_run: true })).toBe(false);
    expect(changesPending('admin.inbox', {})).toBe(false);
    expect(changesPending('admin.sponsor-requests', {})).toBe(false);
  });
});
