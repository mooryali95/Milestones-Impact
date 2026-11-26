// تصور المرحلة 2، المرحلة 2.5: الانتظار بعد القياس. بطاقة «ابدأ بالفصل الأول» تقرأ الفصل المشترك قراءة فقط (handbook.preview)
// بلا قراءة محتسبة ولا اختبار، وبطاقة دعوة المدير بزر «لاحقًا» يؤجلها أسبوعًا بدل الإخفاء النهائي (القرار 5)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let reply = {};
vi.mock('./api.js', () => ({ call: vi.fn((action, body) => { calls.push([action, body]); return Promise.resolve(reply[action] ?? { success: true }); }), lastRead: { get: () => null } }));

const { default: FirstChapter } = await import('./screens/FirstChapter.jsx');
const { preSnoozed, PRE_SNOOZE_DAYS } = await import('./screens/Journey.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
let root, host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const btn = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text));
beforeEach(() => { calls.length = 0; reply = { 'handbook.preview': { success: true, preview: true, chapter: { id: 'hm-1', title: 'المقدمة', md: '## لماذا المعالم\nنص مشترك' } } }; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('ابدأ بالفصل الأول', () => {
  it('يفتح الفصل المشترك قراءة فقط، ولا يطلب قراءة محتسبة ولا إتمامًا', async () => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => root.render(<FirstChapter />));
    expect(host.textContent).toContain('ابدأ بالفصل الأول');
    expect(calls).toEqual([]);
    await act(async () => btn(host, 'اقرأ الفصل الأول').click());
    await flush();
    expect(calls.map(([a]) => a)).toEqual(['handbook.preview']);
    expect(host.querySelector('h2').textContent).toBe('لماذا المعالم');
    expect(host.textContent).toContain('نص مشترك');
    expect(host.textContent).toContain('قراءة فقط');
    expect(calls.some(([a]) => a === 'handbook.ping' || a === 'handbook.complete')).toBe(false);
  });
});

describe('دعوة المدير: «لاحقًا» بدل الإخفاء النهائي', () => {
  const DAY = 864e5, NOW = Date.parse('2026-11-26T08:00:00Z');
  it('تؤجل أسبوعًا ثم تعود، والقيمة القديمة لا تخفيها نهائيًا', () => {
    expect(PRE_SNOOZE_DAYS).toBe(7);
    expect(preSnoozed(String(NOW - DAY), NOW)).toBe(true);
    expect(preSnoozed(String(NOW - 8 * DAY), NOW)).toBe(false);
    expect(preSnoozed('1', NOW)).toBe(false);
    expect(preSnoozed(null, NOW)).toBe(false);
  });
  it('الزر «لاحقًا» في الرحلة، وبطاقتا الانتظار لمن لم يُعتمد مساره', () => {
    const src = read('leaders-app/src/screens/Journey.jsx');
    expect(src).toMatch(/>لاحقًا · تجدها في «ملفي»<\/button>/);
    expect(src).not.toMatch(/إخفاء · تجدها في «ملفي»/);
    expect(src).toMatch(/\{!approved && profile && participant\.status !== 'completed' && <FirstChapter \/>\}/);
  });
});
