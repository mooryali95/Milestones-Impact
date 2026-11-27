// @vitest-environment jsdom
// المرحلة 20: الكتاب الأم في القارئ المشترك (ترويسة مضغوطة في اللوحة، فعل واحد و«إجراءات ▾»، «لم يصدر بعد»، العلامة المائية)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MasterBook, { NO_VERSION, WM_TILE, watermarkUrl } from '../../shared/master-book/MasterBook.jsx';
import { ScreenHead } from './PageHeader.jsx';
import { MENU_TEXT, MoreMenu } from './screens/PersonShell.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const UI = { Head: ScreenHead, Menu: MoreMenu, menuText: MENU_TEXT };
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const book = (viewer = {}, extra = {}) => ({
  success: true, version: null, proposals_ready: true, comments_ready: true, proposals: [], proposal_counts: { review: 0, approved: 2 },
  counts: { total: 0, byModule: {} }, comments: [],
  chapters: [{ id: 'm1', title: 'الباب الأول', dimension: 'personal', sections: [], body: '' }],
  viewer: { id: 'u1', kind: 'admin', name: 'سارة', role: 'مدير', watermark: 'سارة · s@x.sa', decide: false, ...viewer },
  ...extra,
});
const api = (data, release = true) => ({ get: async () => data, add: async () => ({}), del: async () => ({}), status: async () => ({}), ...(release ? { release: async () => ({}) } : {}) });
const mount = async (el) => { await act(async () => { root.render(el); }); await act(async () => {}); };
const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent.trim());

describe('الكتاب الأم في اللوحة', () => {
  it('ترويسة مضغوطة بلا بطل، وفعل أساسي واحد، والبقية في «إجراءات ▾»، و«لم يصدر بعد» بدل «·»', async () => {
    await mount(<MasterBook api={api(book())} place="admin" ui={UI} />);
    expect(host.querySelector('.mb-hero')).toBeNull();
    expect(host.querySelector('.screen-head h2').textContent).toBe('الكتاب الأم');
    const acts = host.querySelector('.screen-head-acts');
    expect(acts.querySelectorAll('.mb-btn')).toHaveLength(1);
    expect(acts.querySelector('.mb-btn').textContent).toBe('افتح الكتاب');
    const menu = acts.querySelector('[aria-haspopup="menu"]');
    expect(menu.getAttribute('aria-label').startsWith(menu.textContent.replace(/\s*▾\s*$/, '').trim())).toBe(true);
    expect(host.querySelector('.mb-status').textContent).toContain(`الإصدار: ${NO_VERSION}`);
    expect(host.querySelector('.mb-status').textContent).toContain('تقرأ بصفتك: سارة (مدير)');
    expect(host.textContent).not.toMatch(/الإصدار\s*·/);
    await act(async () => { menu.click(); });
    const items = [...host.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items).toContain('نسخة PDF');
    // الإصدار بالصلاحية: لا يُبنى لغير من يحسم
    expect(items.some((t) => t.startsWith('أصدر الكتاب'))).toBe(false);
  });

  it('المدير العام: «أصدر الكتاب» في القائمة، وأمامه مقترح للمراجعة فالمقترحات فعله الأول', async () => {
    await mount(<MasterBook api={api(book({ decide: true }, { proposals: [{ id: 'p' }], proposal_counts: { review: 3, approved: 2 } }))} place="admin" ui={UI} />);
    expect(host.querySelector('.screen-head-acts .mb-btn').textContent).toBe('المقترحات (3)');
    await act(async () => { host.querySelector('[aria-haspopup="menu"]').click(); });
    const items = [...host.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items).toContain('أصدر الكتاب (2 معتمد)');
    expect(items).toContain('افتح الكتاب');
  });

  it('بلا api.release لا يظهر الإصدار ولو كان القارئ يحسم', async () => {
    await mount(<MasterBook api={api(book({ decide: true }), false)} place="admin" ui={UI} />);
    await act(async () => { host.querySelector('[aria-haspopup="menu"]').click(); });
    expect(buttons().some((t) => t.startsWith('أصدر الكتاب'))).toBe(false);
  });

  it('البوابة كما هي (البطل وأفعاله) إلا الإصدار: «لم يصدر بعد»', async () => {
    await mount(<MasterBook api={api(book({ kind: 'expert' }), false)} place="expert" />);
    expect(host.querySelector('.mb-hero')).not.toBeNull();
    expect(host.querySelector('.screen-head')).toBeNull();
    expect(host.querySelector('.mb-facts').textContent).toContain(NO_VERSION);
    expect(buttons()).toContain('نسخة PDF');
  });

  it('العلامة المائية حاضرة لكل قارئ، aria-hidden، والنص مُهرَّب، والبلاطة 520×220 بلا شفافية مكتوبة فيها', async () => {
    for (const [place, ui] of [['admin', UI], ['expert', null]]) {
      await mount(<MasterBook api={api(book({ watermark: `قارئ ${place}` }))} place={place} ui={ui} />);
      const wm = host.querySelectorAll('.mb-wm');
      expect(wm).toHaveLength(1);
      expect(wm[0].getAttribute('aria-hidden')).toBe('true');
    }
    const svg = decodeURIComponent(watermarkUrl('<b>"x"</b>'));
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&#60;b&#62;');
    expect(WM_TILE).toEqual({ w: 520, h: 220 });
    expect(svg).toContain('width="520" height="220"');
    expect(svg).not.toContain('fill-opacity');
  });

  it('الشفافية من متغير الإطار محصورة بين 0.07 و0.09، وpointer-events:none باقية', () => {
    const css = src('../../shared/master-book/master-book.css');
    expect(css).toMatch(/\.mb-wm \{[^}]*pointer-events: none;[^}]*opacity: clamp\(\.07, var\(--mb-wm-opacity, \.09\), \.09\)/);
    expect(src('./leaders-admin.css')).toMatch(/\.mbs-frame \{ --mb-wm-opacity: \.0[789];/);
  });

  it('الشاشة: لا مسار، والرجوع في ملء الشاشة وحده، ومكونات المرحلتين 6 و18 لا نسخ منها', () => {
    const s = src('./screens/MasterBookScreen.jsx');
    expect(s).not.toMatch(/mbs-crumbs/);
    expect(s).toMatch(/\{full && <button[^>]*onClick=\{onClose\}/);
    expect(s).toMatch(/Head: ScreenHead, Menu: MoreMenu, menuText: MENU_TEXT/);
    const mb = src('../../shared/master-book/MasterBook.jsx');
    expect(mb).not.toMatch(/admin-app/);
    expect(mb).not.toContain("data.version || '·'");
  });
});
