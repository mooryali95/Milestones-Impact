// @vitest-environment jsdom
// إغلاق البنود الجزئية من نقطة التحقق (2026-11-27): تحصين الرحلة والكتاب الأم ضد رد ناجح ناقص الحقول،
// وهيكل التحميل الأول في الزيارات، وعنوان الترويسة بقسم تطبيق القادة، وMissing بدل «·» في الخبراء
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./leaders.js', async (orig) => ({ ...(await orig()), L: vi.fn(() => new Promise(() => {})) }));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('') }) }));

const { Journey } = await import('./screens/Methodology.jsx');
const { default: MasterBook } = await import('../../shared/master-book/MasterBook.jsx');
const { bookShape } = await import('../../shared/master-book/reader.js');
const { VisitsSkeleton } = await import('./screens/Visits.jsx');
const { sectionTitle } = await import('./screens/Leaders.jsx');
const { ScreenHead } = await import('./PageHeader.jsx');
const { MENU_TEXT, MoreMenu } = await import('./screens/PersonShell.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const mount = async (el) => { await act(async () => { root.render(el); }); for (let i = 0; i < 4; i += 1) await act(async () => {}); };

describe('الرحلة: رد ناجح بلا journey_stages', () => {
  it('تُعرض رحلة فارغة بلا انهيار', async () => {
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(<Journey catalog={{ success: true, program_id: 'p1' }} reload={() => {}} canWrite onProgram={() => {}} />);
    expect(host.textContent.length).toBeGreaterThan(0);
    expect(host.querySelector('[data-mt-row]')).toBeNull();
    errs.mockRestore();
  });
});

describe('الكتاب الأم: رد ناجح ناقص الحقول', () => {
  it('bookShape يملأ الغائب ولا يمس الحاضر ولا الرد الفاشل', () => {
    const fail = { success: false, message: 'x' };
    expect(bookShape(fail)).toBe(fail);
    const s = bookShape({ success: true });
    expect(s.chapters).toEqual([]);
    expect(s.comments).toEqual([]);
    expect(s.counts).toEqual({ total: 0, byModule: {}, bySection: {} });
    expect(s.share).toBeUndefined();
    const ch = [{ id: 'm1' }];
    expect(bookShape({ success: true, chapters: ch, share: {} }).chapters).toBe(ch);
    expect(bookShape({ success: true, share: {} }).share.readers).toEqual([]);
  });
  it('القارئ يعرض الرف بلا انهيار', async () => {
    const UI = { Head: ScreenHead, Menu: MoreMenu, menuText: MENU_TEXT };
    await mount(<MasterBook api={{ get: async () => ({ success: true }) }} place="admin" ui={UI} />);
    expect(host.querySelector('.screen-head h2').textContent).toBe('الكتاب الأم');
  });
});

describe('الزيارات: هيكل التحميل الأول', () => {
  it('بطاقات بهيكل التقرير لا Spinner، ويعلن التحميل مرة واحدة', async () => {
    await mount(<VisitsSkeleton />);
    expect(host.querySelectorAll('.stat-card')).toHaveLength(4);
    expect(host.querySelector('.vs-chart-card')).not.toBeNull();
    expect(host.querySelectorAll('.sr-only')).toHaveLength(1);
    expect(src('screens/Visits.jsx')).not.toMatch(/<Spinner/);
  });
});

describe('عنوان الترويسة يتبع القسم (المرحلة 7)', () => {
  it('اسم القسم، و«تطبيق القادة» لغير المعروف', () => {
    expect(sectionTitle('participants')).toBe('المشاركون');
    expect(sectionTitle('orgs')).toBe('الجهات');
    expect(sectionTitle('zzz')).toBe('تطبيق القادة');
    expect(src('screens/Leaders.jsx')).toContain('title={sectionTitle(tab)}');
  });
});

describe('Missing بدل «·» علامةً للغياب', () => {
  it('لا «·» وحدها في الخبراء والمطابقة', () => {
    for (const f of ['screens/Experts.jsx', 'screens/ExpertMatch.jsx']) {
      expect(src(f)).not.toMatch(/'·'|>·</);
    }
    expect(src('screens/ExpertMatch.jsx')).toContain('<Missing reason="لم يُسنَد خبير" />');
  });
});
