// @vitest-environment jsdom
// المرحلة 10 من تصور تطبيق القادة: الجهات (شريط مهمة الربط، Meter بمقام صريح، تعميم keepSpot)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UIProvider } from './ui.jsx';
import { Funnel, UnassignedTask } from './screens/Orgs.jsx';
import { keepSpot, takeSpot } from './review-queue.js';
import { trackCounts } from './matrix.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); sessionStorage.clear(); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const render = (el) => act(() => root.render(<UIProvider>{el}</UIProvider>));
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');
const orgs = [{ id: 'o1', name: 'جهة أ' }];

describe('شريط مهمة «بلا جهة»', () => {
  it('يختفي عند الصفر', () => {
    render(<UnassignedTask un={{ total: 0 }} list={orgs} canWrite onOpen={() => {}} />);
    expect(host.querySelector('.org-unassigned')).toBeNull();
  });
  it('من يكتب يرى العدد وزرًا حقيقيًا يفتح onOpen(none)', () => {
    const onOpen = vi.fn();
    render(<UnassignedTask un={{ total: 3, typed: [{ name: 'أرامكو', n: 2 }] }} list={orgs} canWrite onOpen={onOpen} />);
    expect(host.textContent).toContain('3 بلا جهة · اربطهم');
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'اربطهم');
    act(() => btn.click());
    expect(onOpen).toHaveBeenCalledWith('none');
    expect(host.querySelector('select[aria-label="جهة أرامكو"]')).not.toBeNull();
  });
  it('من لا يملك canWrite يرى العدد وحده بلا زر ولا ربط', () => {
    render(<UnassignedTask un={{ total: 3, typed: [{ name: 'أرامكو', n: 2 }] }} list={orgs} canWrite={false} onOpen={() => {}} />);
    expect(host.textContent).toContain('3 بلا جهة');
    expect(host.textContent).not.toContain('اربطهم');
    expect(host.querySelector('button, select')).toBeNull();
  });
  it('لا بطاقة إحصاء «بدون جهة» ولا بطاقة وهمية في الشبكة، والمسار none والشرط !isNone باقيان', () => {
    const o = src('screens/Orgs.jsx');
    expect(o).not.toMatch(/la-org none/);
    expect(o).not.toMatch(/stat-label">بدون جهة/);
    expect(o).toMatch(/const isNone = o\.id === 'none'/);
    expect(o).toMatch(/assignOrgGuarded\(\{ typed_name: t\.name, organization_id: org\.id \}, confirm\)/);
    expect(o).toMatch(/بجهة «\$\{org\.name\}»/);
  });
});

describe('Meter بمقام صريح في الجهات', () => {
  it('القمع: كل مرحلة Meter مقامها المسجلون ومكتوب في التسمية', () => {
    act(() => root.render(<Funnel f={{ registered: 10, started: 4 }} />));
    const ms = [...host.querySelectorAll('[role="meter"]')];
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) { expect(m.getAttribute('aria-label')).toMatch(/من المسجلين/); expect(m.getAttribute('aria-valuemax')).toBe('10'); }
  });
  it('المقاعد بمقام العقد «من N مقعدًا»، ولا نسب مضمنة في السطر', () => {
    const o = src('screens/Orgs.jsx');
    expect(o).toMatch(/<Meter value=\{seatsUsedOf\(org, members\)\} max=\{org\.seats\} unit="مقعدًا"/);
    expect(o).not.toMatch(/\* 100\)\.toFixed/);
  });
  it('مقياس المصفوفة مصلح قبلها: السعة لا أكبر قيمة', () => {
    const [c] = trackCounts([{ dates: { p1: 'x' } }, { dates: {} }], [{ key: 'p1', trackId: 't' }, { key: 'p2', trackId: 't' }], [{ id: 't' }]);
    expect(c.cap).toBe(4); expect(c.pct).toBe(25);
  });
  it('قائمة البطاقة «إجراءات ▾» بنص ظاهر واسم الجهة، والتحرير خلف canWrite', () => {
    const o = src('screens/Orgs.jsx');
    expect(o).toMatch(/<MoreMenu text=\{MENU_TEXT\} label=\{`جهة «\$\{o\.name\}»`\}/);
    expect(o).toMatch(/canWrite && \{ label: 'تحرير'/);
  });
});

describe('keepSpot معمم بنطاق', () => {
  it('موضع الجهات لا تستهلكه قائمة المشاركين، ويُستهلك مرة واحدة', () => {
    keepSpot(420, 'o1', 'orgs');
    expect(takeSpot()).toBeNull();
    expect(takeSpot('orgs')).toEqual({ y: 420, id: 'o1' });
    expect(takeSpot('orgs')).toBeNull();
  });
  it('المشاركون كما كانوا بلا نطاق', () => {
    keepSpot(10, 'p1');
    expect(takeSpot()).toEqual({ y: 10, id: 'p1' });
  });
  it('بطاقة الجهة تحفظ موضعها عند الفتح وتعيده', () => {
    const o = src('screens/Orgs.jsx');
    expect(o).toMatch(/keepSpot\(window\.scrollY, id, 'orgs'\)/);
    expect(o).toMatch(/takeSpot\('orgs'\)/);
    expect(o).toMatch(/data-org=\{o\.id\}/);
  });
});
