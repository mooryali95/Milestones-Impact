// @vitest-environment jsdom
// المرحلة 18 من تصور الشاشات الخمس: كتاب القائد (الترويسة الموحدة، Move المشترك مع moveKeys، الصف بشارة جاهزية، levelFrom)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reply = {};
const calls = [];
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  L: vi.fn((action, body) => { calls.push([action, body]); return Promise.resolve(reply[action] ?? { success: true }); }),
}));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('') }) }));

const { default: Handbook } = await import('./screens/Handbook.jsx');
const { CHAPTER_READY, CHAPTER_READY_TONE, chapterReady, levelFrom } = await import('../../supabase/functions/leaders-api/labels.js');
const { takeSpot } = await import('./review-queue.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const mount = async (el) => { await act(async () => root.render(el)); await flush(); };
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

const ch = (id, sort, extra = {}) => ({ id, dimension: 'milestone', sort, title_ar: `باب ${id}`, min_level: 'beginner', body_md: 'نص الباب هنا', quiz_md: '', ...extra });
const QUIZ = 'س: ما المعلم؟\n- تاريخ\n* نقطة قرار\nلماذا: لأنه قرار';
const catalog = () => ({
  handbook_modules: [ch('a', 1, { quiz_md: QUIZ }), ch('b', 2, { min_level: 'intermediate' }), ch('c', 3, { body_md: '' })],
  learning_models: [], tracks: [],
  book_stats: { chapters: { a: { done: 4, score: 6, total: 8 } }, models: {}, points: { participants: 5, avg: 40 }, to_review: 2, to_approve: 1 },
});

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); sessionStorage.clear(); calls.length = 0; });
afterEach(() => { act(() => root.unmount()); host.remove(); reply = {}; });

describe('جاهزية الباب وlevelFrom', () => {
  it('chapterReady: بلا محتوى ثم بلا اختبار ثم جاهز، ونبرتها من labels', () => {
    expect(chapterReady(0, 3)).toBe('no_body');
    expect(chapterReady(10, 0)).toBe('no_quiz');
    expect(chapterReady(10, 2)).toBe('ready');
    expect(CHAPTER_READY_TONE).toEqual({ ready: 'ok', no_quiz: 'warn', no_body: 'bad' });
    expect(Object.keys(CHAPTER_READY)).toEqual(Object.keys(CHAPTER_READY_TONE));
  });
  it('الصيغ الثلاث القديمة للمستوى خرجت من Handbook.jsx، وlevelFrom وحدها', () => {
    const s = src('screens/Handbook.jsx');
    expect(s).not.toMatch(/مطلوب من المستوى/);
    expect(s).not.toMatch(/\(من \$\{LVL/);
    expect(s).not.toMatch(/' فأعلى'/);
    expect(s).not.toMatch(/من \{LVL\[/);
    expect(s).not.toMatch(/LEVEL_AR_COND/);
    expect(s.match(/levelFrom\(/g).length).toBeGreaterThanOrEqual(6);
  });
});

describe('الترويسة والتبويبات', () => {
  it('ترويسة الشاشة الموحدة بدل البطل، وسطر الحالة يعد ما ينتظر، والأرقام بالبطاقة الموحدة', async () => {
    await mount(<Handbook catalog={catalog()} reload={() => {}} canWrite />);
    expect(host.querySelector('.tx-hero')).toBeNull();
    expect(host.querySelector('.screen-head h2').textContent).toBe('كتاب القائد');
    expect(host.querySelector('.screen-head-status .st-chip.warn').textContent).toBe('3 بانتظار القراءة أو الاعتماد');
    expect(host.querySelectorAll('.hb-stats .stat-card')).toHaveLength(4);
  });
  it('تبويبات role=tablist: المختار وحده في ترتيب Tab، والأسهم تنقل', async () => {
    await mount(<Handbook catalog={catalog()} reload={() => {}} canWrite />);
    const list = host.querySelector('[role="tablist"][aria-label="أقسام الكتاب"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[3].textContent).toContain('(3)');
    await act(async () => { tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(host.querySelector('#hb-tab-models').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('hb-tab-models');
  });
});

describe('صف الباب', () => {
  it('شارة جاهزية واحدة بنبرتها، ورقمان بارزان، والمستوى بصيغة levelFrom', async () => {
    await mount(<Handbook catalog={catalog()} reload={() => {}} canWrite />);
    const rows = [...host.querySelectorAll('.hb-ch')];
    const chip = (r) => r.querySelectorAll('.st-chip');
    expect(rows.map((r) => chip(r).length)).toEqual([1, 1, 1]);
    expect(rows.map((r) => chip(r)[0].dataset.status)).toEqual(['ready', 'no_quiz', 'no_body']);
    expect(chip(rows[0])[0].className).toContain('ok');
    expect(chip(rows[2])[0].className).toContain('bad');
    expect(rows[0].querySelectorAll('.hb-nums b')).toHaveLength(2);
    expect(rows[0].querySelector('.hb-nums').textContent).toContain('أتمّه');
    expect(rows[1].querySelector('.hb-meta').textContent).toContain(levelFrom('intermediate'));
    expect(rows[0].querySelector('.hb-meta').textContent).toContain('للمستويات كلها');
    // اسم زر الفتح يبدأ بعنوان الباب
    expect(rows[0].querySelector('.hb-main').textContent.startsWith('باب a')).toBe(true);
  });
  it('«فقرات مخصصة» أيقونة مسماة لا نص', async () => {
    const c = catalog();
    c.handbook_modules[0].body_md = 'عام\n:::min=advanced\nخاص\n:::';
    await mount(<Handbook catalog={c} reload={() => {}} canWrite />);
    const ic = host.querySelector('.hb-tiered');
    expect(ic.getAttribute('role')).toBe('img');
    expect(ic.getAttribute('aria-label')).toBe('فقرات مخصصة لكل مستوى');
  });
});

describe('Move المشترك في كتاب القائد', () => {
  it('لا أزرار نقل بلا canWrite، ولا la-mv في الشاشتين', async () => {
    await mount(<Handbook catalog={catalog()} reload={() => {}} canWrite={false} />);
    expect(host.querySelector('.la-move-btn')).toBeNull();
    expect(src('screens/Handbook.jsx')).not.toMatch(/la-mv/);
    expect(src('screens/Methodology.jsx')).not.toMatch(/la-mv/);
    expect(src('screens/Methodology.jsx')).toMatch(/<Move name=\{name\}/);
  });
  it('title يسمي الباب، والطرف aria-disabled، والنقل عبر admin.reorder ثم إعلان الموضع وkeepSpot', async () => {
    const reload = vi.fn();
    await mount(<Handbook catalog={catalog()} reload={reload} canWrite />);
    const first = host.querySelector('[data-hb-row="a"]');
    const [up, down] = first.querySelectorAll('.la-move-btn');
    expect(up.title).toBe('انقل الباب باب a لأعلى');
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(up.hasAttribute('aria-label')).toBe(false);
    expect(down.querySelector('.sr-only').textContent).toBe(down.title);
    await act(async () => { down.click(); });
    await flush();
    expect(calls.find(([a]) => a === 'admin.reorder')[1]).toEqual({ entity: 'handbook_modules', ids: ['b', 'a', 'c'] });
    expect(reload).toHaveBeenCalled();
    expect(first.querySelector('[aria-live="polite"]').textContent).toBe('الباب باب a صار في الموضع 2 من 3');
    expect(takeSpot('handbook')).toMatchObject({ id: 'a' });
  });
  it('Alt مع السهم على الصف ينقل بالمسار نفسه، والسهم وحده لا', async () => {
    await mount(<Handbook catalog={catalog()} reload={() => {}} canWrite />);
    const row = host.querySelector('[data-hb-row="b"]');
    await act(async () => { row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    expect(calls.some(([a]) => a === 'admin.reorder')).toBe(false);
    await act(async () => { row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })); });
    await flush();
    expect(calls.find(([a]) => a === 'admin.reorder')[1].ids).toEqual(['b', 'a', 'c']);
  });
  it('رفض الخادم لا يعلن موضعًا', async () => {
    reply['admin.reorder'] = { success: false, message: 'لا' };
    await mount(<Handbook catalog={catalog()} reload={() => {}} canWrite />);
    const row = host.querySelector('[data-hb-row="a"]');
    await act(async () => { row.querySelectorAll('.la-move-btn')[1].click(); });
    await flush();
    expect(row.querySelector('[aria-live="polite"]').textContent).toBe('');
    expect(takeSpot('handbook')).toBeNull();
  });
});
