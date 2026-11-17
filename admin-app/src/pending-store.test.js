import { beforeEach, describe, expect, it, vi } from 'vitest';

const replies = [];
const L = vi.fn(() => { const r = replies.shift(); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); });
vi.mock('./leaders.js', () => ({ L: (...a) => L(...a) }));
vi.mock('./api.js', () => ({ call: vi.fn() }));
const { inboxState, loadInbox, resetInbox } = await import('./pending.js');

const ok = { success: true, skipped: [], total: 3, late: 1, counts: { approval: 3 }, by_tab: { participants: { n: 3, late: 1 } }, items: [] };

describe('مخزن الصندوق: طلب واحد يتشاركه العدّاد والشاشة', () => {
  beforeEach(() => { resetInbox(); L.mockClear(); replies.length = 0; });
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
});
