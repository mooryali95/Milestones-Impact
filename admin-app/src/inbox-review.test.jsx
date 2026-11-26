// تصور المرحلة 1، البند 3: صندوق «ينتظرني» للمتطلبات. «أعد مع ملاحظة» لكل متطلب بملاحظة إلزامية تمر بـ admin.review
// بحالة returned، وتعذّر تحميل الأدلة يُقال بسطر وزر إعادة ويعطّل الاعتماد الجماعي حتى تُحمَّل، وبعد الاعتماد الجماعي
// يبقى الفاشل محددًا ويُمسح الناجح وحده.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let reply = {};
vi.mock('./leaders.js', () => ({ L: vi.fn((action, body) => { calls.push([action, body]); const r = reply[action]; return Promise.resolve(typeof r === 'function' ? r(body) : r ?? { success: true }); }) }));
const toast = vi.fn();
vi.mock('./ui.jsx', () => ({ Spinner: () => null, useUI: () => ({ toast, confirm: () => Promise.resolve(true) }) }));
const items = [
  { kind: 'requirement', id: 'p1:r1', title: 'عمر', sub: 'خطة', days: 3, to: { tab: 'participants', id: 'p1' } },
  { kind: 'requirement', id: 'p2:r2', title: 'سارة', sub: 'سجل', days: 2, to: { tab: 'participants', id: 'p2' } },
];
const inbox = [{ success: true, items, counts: { requirement: 2 }, total: 2 }, () => {}];
vi.mock('./pending.js', () => ({ useInbox: () => inbox, refreshPending: vi.fn() }));
vi.mock('./screens/BulkApprove.jsx', () => ({ default: () => null }));
vi.mock('./screens/Erasure.jsx', () => ({ askOpen: () => {} }));

const { default: Inbox } = await import('./screens/Inbox.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mount = async () => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); await act(async () => root.render(<Inbox canWrite />)); await flush(); return host; };
const btn = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const setValue = (input, v) => { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set; set.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); };
beforeEach(() => { calls.length = 0; toast.mockClear(); reply = { 'admin.reviews': { success: true, submitted: [{ participant_id: 'p1', requirement_id: 'r1', evidence_path: 'x/y.pdf' }] } }; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('صندوق المتطلبات', () => {
  it('«أعد مع ملاحظة» يطلب ملاحظة ثم يستدعي admin.review بحالة returned وملاحظته', async () => {
    const el = await mount();
    await act(async () => btn(el.querySelector('.inbox-list li'), 'أعد مع ملاحظة').click());
    const send = btn(el, 'أرسل الإعادة');
    expect(send.disabled).toBe(true);
    await act(async () => setValue(el.querySelector('textarea'), 'أضف دليل الحضور'));
    expect(btn(el, 'أرسل الإعادة').disabled).toBe(false);
    await act(async () => btn(el, 'أرسل الإعادة').click());
    await flush();
    expect(calls.find(([a]) => a === 'admin.review')).toEqual(['admin.review', { participant_id: 'p1', requirement_id: 'r1', status: 'returned', note: 'أضف دليل الحضور' }]);
  });

  it('تعذّر تحميل الأدلة: سطر واضح وزر إعادة، والاعتماد الجماعي معطّل حتى تُحمَّل', async () => {
    reply['admin.reviews'] = { success: false, message: 'busy' };
    const el = await mount();
    expect(el.textContent).toContain('تعذّر تحميل الأدلة');
    await act(async () => el.querySelector('.inbox-req input[type="checkbox"]').click());
    expect(btn(el, 'اعتمد المحدد').disabled).toBe(true);
    reply['admin.reviews'] = { success: true, submitted: [] };
    await act(async () => btn(el, 'أعد المحاولة').click());
    await flush();
    expect(el.textContent).not.toContain('تعذّر تحميل الأدلة');
    expect(btn(el, 'اعتمد المحدد').disabled).toBe(false);
  });

  it('بعد الاعتماد الجماعي يبقى الفاشل محددًا ويُمسح الناجح', async () => {
    reply['admin.review'] = (b) => ({ success: b.participant_id === 'p1' });
    const el = await mount();
    await act(async () => el.querySelector('.inbox-req input[type="checkbox"]').click());
    await act(async () => btn(el, 'اعتمد المحدد').click());
    await flush();
    const boxes = [...el.querySelectorAll('.inbox-list li input[type="checkbox"]')].map((x) => x.checked);
    expect(boxes).toEqual([false, true]);
    expect(btn(el, 'اعتمد المحدد').textContent).toContain('(1)');
  });
});
