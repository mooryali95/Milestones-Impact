// @vitest-environment jsdom
// المرحلة 7 من تصور تطبيق القادة (2026-11-26): شريط واحد من NAV_GROUPS بشكلين بالأنماط، طي غير النشط، aria-current،
// التركيز إلى h1 عند التبديل، ومجموعة «تجريبي» أخيرة مطوية بشارة باهتة
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_TABS, groupOpen, navGroups, NAV_GROUPS, SETUP_GROUP, TRIAL_GROUP } from './leaders-tabs.js';

// الخلفية: الميزات كلها مطفأة، وكل نداء آخر رد فارغ
vi.mock('./leaders.js', () => ({ L: vi.fn(async (a) => (a === 'admin.settings' ? { success: true, values: {} } : { success: true, orgs: [], unassigned: {} })) }));
vi.mock('../../supabase/functions/leaders-api/features.js', () => ({ featureFlags: () => ({ hall: false, katon: false, f360: false }) }));
vi.mock('./lazy-retry.js', () => ({ lazyRetry: () => () => null, lazyNamed: () => () => null }));

describe('navGroups', () => {
  it('بلا ميزات مخفية هي NAV_GROUPS نفسها', () => {
    expect(navGroups()).toEqual(NAV_GROUPS);
  });
  it('المخفي من FEATURE_TABS وحده ينتقل إلى مجموعة «تجريبي» أخيرة، ولا يتكرر قسم', () => {
    const g = navGroups((k) => k in FEATURE_TABS || k === 'overview');
    expect(g.at(-1)).toEqual([TRIAL_GROUP, ['hall', 'katon', 'f360']]);
    const all = g.flatMap(([, k]) => k);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('overview');
    expect(g.slice(0, -1).flatMap(([, k]) => k).some((k) => k in FEATURE_TABS)).toBe(false);
  });
  it('«تجريبي» والإعداد مطويان افتراضيًا، وتنفتح «تجريبي» حين يكون القسم المفتوح فيها', () => {
    expect(groupOpen(TRIAL_GROUP, ['hall'], 'overview', {})).toBe(false);
    expect(groupOpen(TRIAL_GROUP, ['hall'], 'hall', { [TRIAL_GROUP]: false })).toBe(true);
    expect(groupOpen(SETUP_GROUP, ['mail'], 'overview', {})).toBe(false);
  });
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, Leaders, reset;
beforeEach(async () => {
  ({ default: Leaders } = await import('./screens/Leaders.jsx'));
  ({ __resetPageHeaderFocus: reset } = await import('./PageHeader.jsx'));
  try { localStorage.clear(); } catch { /* */ }
  window.location.hash = '#/leaders/overview';
  reset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('شريط تطبيق القادة', () => {
  it('شريط واحد (لا يُرسم الشكلان معًا)، والقسم الحالي aria-current=page، وغير النشط مطوي', async () => {
    await act(async () => root.render(<Leaders canWrite pending={null} isSuper />));
    await flush();
    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(host.querySelector('[aria-current="page"]').textContent).toContain('نظرة عامة');
    const grp = (g) => host.querySelector(`[role="group"][aria-label="${g}"]`);
    expect(grp(SETUP_GROUP).className).toContain('shut');
    expect(grp(TRIAL_GROUP).className).toContain('shut');
    expect(host.querySelectorAll('[role="group"]')[host.querySelectorAll('[role="group"]').length - 1].getAttribute('aria-label')).toBe(TRIAL_GROUP);
    const chip = grp(TRIAL_GROUP).querySelector('.la-tab-group-label .la-chip.la-trial-chip');
    expect(chip.textContent).toBe('تجريبي');
    expect(chip.className).not.toMatch(/\b(ok|warn|bad)\b/);
    expect(grp(TRIAL_GROUP).querySelectorAll('.ft-hidden-dot')).toHaveLength(3);
    expect(grp('العمل').textContent).not.toContain('القاعة الحية');
  });
  it('التبديل بين الأقسام ينقل التركيز إلى h1، والتحميل الأول لا يسحبه', async () => {
    await act(async () => root.render(<Leaders canWrite pending={null} isSuper />));
    await flush();
    expect(document.activeElement).not.toBe(host.querySelector('h1'));
    const btn = [...host.querySelectorAll('nav button')].find((b) => b.textContent.includes('المشاركون'));
    await act(async () => { btn.click(); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await flush();
    expect(window.location.hash).toContain('participants');
    expect(host.querySelector('[aria-current="page"]').textContent).toContain('المشاركون');
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });
});
