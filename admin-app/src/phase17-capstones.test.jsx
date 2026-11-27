// @vitest-environment jsdom
// المرحلة 17 من تصور الشاشات الخمس: المبادرات (الجدول، الأعمدة المطوية، StatusChip، NO_TITLE وMissing، والافتراض غير الفارغ)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reply = {};
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  date: (x) => String(x || ''),
  L: vi.fn((action) => Promise.resolve(reply[action] ?? { success: true })),
}));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('') }) }));

const { default: Capstones } = await import('./screens/Capstones.jsx');
const { foldEmptyColumns } = await import('./ui.jsx');
const { CAPSTONE_STATUS_TONE, NO_TITLE, SPONSOR_STATE_TONE } = await import('../../supabase/functions/leaders-api/labels.js');
const { STATUS_TITLES, SPONSOR_STATE_AR } = await import('../../supabase/functions/leaders-api/capstone.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const mount = async (el) => { await act(async () => root.render(el)); await flush(); };
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');
const heads = () => [...host.querySelectorAll('.cps-table thead th')].map((t) => t.textContent.replace(/[▲▼↑↓⇅↕]/g, '').trim());

const DRAFTS = [
  { participant_id: 'p1', initiative: '', full_name: 'ليلى', organization: '', status: 'draft', readiness: null },
  { participant_id: 'p2', initiative: 'تحول رقمي', full_name: 'عمر', organization: 'وزارة', status: 'draft', readiness: 40 },
];
const SUBMITTED = { participant_id: 'p3', initiative: 'خدمة موحدة', full_name: 'منى', organization: 'هيئة', scope: 'project', status: 'submitted', readiness: 90, score: 77, submitted_at: '2026-11-01' };

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); localStorage.clear(); window.location.hash = '#/leaders/capstones'; });
afterEach(() => { act(() => root.unmount()); host.remove(); reply = {}; });

describe('foldEmptyColumns', () => {
  const cols = [{ key: 'a' }, { key: 'b', fold: true }, { key: 'c', fold: true, get: (r) => r.x }];
  it('يطوي الموسوم fold إن خلا في كل الصفوف، ويبقي غيره', () => {
    expect(foldEmptyColumns(cols, [{ a: 1, b: '', x: null }, { a: 2, b: '  ' }]).map((c) => c.key)).toEqual(['a']);
    expect(foldEmptyColumns(cols, [{ b: 'x', x: 0 }]).map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });
});

describe('جدول المبادرات', () => {
  it('الافتراض الفارغ ينتقل إلى أول عرض فيه وثائق، وتُطوى الأعمدة الفارغة، وتُطوى العروض الصفرية', async () => {
    reply['admin.capstones'] = { success: true, capstones: DRAFTS };
    await mount(<Capstones canWrite onOpen={() => {}} onPerson={() => {}} />);
    expect(host.querySelector('.flt-auto').textContent).toContain('«قيد البناء»');
    expect(host.querySelectorAll('.cps-table tbody tr')).toHaveLength(2);
    expect(heads()).toEqual(['المبادرة', 'القائد', 'الجهة', 'الحالة', 'الجاهزية']);
    expect(host.querySelector('.flt-zero-more')).not.toBeNull();
  });
  it('NO_TITLE خافتًا مع اسم المشارك، وMissing بسببه بدل «·» و«بلا اسم»', async () => {
    reply['admin.capstones'] = { success: true, capstones: DRAFTS };
    await mount(<Capstones canWrite onOpen={() => {}} onPerson={() => {}} />);
    const r1 = host.querySelector('tr[data-row="p1"]');
    expect(r1.querySelector('.cps-untitled').textContent).toBe(`${NO_TITLE} (ليلى)`);
    expect(r1.querySelector('td[data-col="org"] .la-missing').getAttribute('title')).toBe('بلا جهة');
    expect(r1.querySelector('td[data-col="ready"] .la-missing .sr-only').textContent).toContain('غير محدد');
    expect(host.querySelector('.cps-table').textContent).not.toMatch(/·|بلا اسم/);
  });
  it('الأعمدة تعود حين يكون فيها قيمة، والصف كله يفتح الوثيقة بالنقر وبـEnter (la-click مع tabIndex كما في التصور)', async () => {
    reply['admin.capstones'] = { success: true, capstones: [SUBMITTED, ...DRAFTS] };
    const onOpen = vi.fn();
    await mount(<Capstones canWrite onOpen={onOpen} onPerson={() => {}} />);
    expect(heads()).toEqual(['المبادرة', 'القائد', 'الجهة', 'النوع', 'الحالة', 'الجاهزية', 'المعيار', 'سُلّمت']);
    const tr = host.querySelector('tr[data-row="p3"]');
    expect(tr.className).toContain('la-click');
    expect(tr.getAttribute('tabindex')).toBe('0');
    await act(async () => tr.querySelector('td[data-col="lead"]').click());
    expect(tr.querySelector('td[data-col="name"] .la-link').textContent).toBe(SUBMITTED.initiative);
    await act(async () => tr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledWith('p3');
    const chip = tr.querySelector('.st-chip');
    expect(chip.dataset.status).toBe('submitted');
    expect(chip.className).toContain('warn');
  });
});

describe('المصدر الواحد للنبرة', () => {
  it('النبرات تغطي مفاتيح الحالة في capstone.js', () => {
    expect(Object.keys(CAPSTONE_STATUS_TONE).sort()).toEqual(Object.keys(STATUS_TITLES).sort());
    expect(Object.keys(SPONSOR_STATE_TONE).sort()).toEqual(Object.keys(SPONSOR_STATE_AR).sort());
  });
  it('لا CHIP ولا نبرة محلية ولا innerHTML في شاشة المبادرات', () => {
    const s = src('./screens/Capstones.jsx');
    expect(s).not.toMatch(/\bCHIP\s*=\s*\{/);
    expect(s).not.toMatch(/la-chip \$\{/);
    expect(s).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    expect(s).not.toMatch(/'بلا اسم|'·'/);
  });
  it('الاسم في الجدول بوزن 600 بلا تسطير إلا عند hover وfocus-visible', () => {
    const css = src('./leaders-admin.css');
    expect(css).toMatch(/\.la-table \.la-link \{ font-weight: 600; text-decoration: none; \}/);
    expect(css).toMatch(/\.la-table tr\.la-click:focus-visible \.la-link/);
  });
});
