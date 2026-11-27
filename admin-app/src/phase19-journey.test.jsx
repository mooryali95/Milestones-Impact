// @vitest-environment jsdom
// المرحلة 19 من تصور الشاشات الخمس: الرحلة (الشريط المتمرر، والبلاطات بأسمائها والتفاصيل الملاصقة، وسطر الحالة)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reply = {};
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  L: vi.fn((action) => Promise.resolve(reply[action] ?? { success: true })),
}));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('') }) }));

const { Journey, JourneyStatus } = await import('./screens/Methodology.jsx');
const { default: JourneyTimeline } = await import('../../shared/ui/JourneyTimeline.jsx');
const { journeyTimeline, tickShortAr, weekShortAr } = await import('../../supabase/functions/leaders-api/journey-timeline.js');
const { JOURNEY_SAFE_AR, journeyIssuesAr } = await import('../../supabase/functions/leaders-api/labels.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const mount = async (el) => { await act(async () => root.render(el)); await flush(); };
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 28, active: true },
  { key: 'support', title_ar: 'الدعم', phase: 'impact', sort: 3, duration_days: 60, active: true },
];
const reqs = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول من كل إطار', sort: 1, active: true },
];
const model = () => journeyTimeline({ stages, requirements: reqs }, { title: 'رحلة البرنامج' });

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); reply = {}; });

describe('محور الأسابيع المختصر', () => {
  it('weekShortAr وtickShortAr: «أ» والرقم بالأرقام المشرقية، والنموذج لا يتغير', () => {
    expect([1, 2, 12].map(weekShortAr)).toEqual(['أ١', 'أ٢', 'أ١٢']);
    expect(tickShortAr('الأسبوع 3')).toBe('أ٣');
    expect(tickShortAr('البداية')).toBeNull();
    expect(tickShortAr('2 نوفمبر')).toBeNull();
    expect(model().ticks.some((t) => t.label.startsWith('الأسبوع'))).toBe(true);
    for (const t of model().ticks) expect(Object.keys(t).sort()).toEqual(['at', 'label']);
  });
  it('المسطرة تكتب المختصر وتضع الكامل في title', async () => {
    await mount(<JourneyTimeline model={model()} pop />);
    const span = [...host.querySelectorAll('.jt-ruler span')].find((x) => x.title);
    expect(span.textContent).toMatch(/^أ[٠-٩]+$/);
    expect(span.title).toMatch(/^الأسبوع /);
  });
});

describe('الشريط المتمرر', () => {
  it('حاوية tabindex=0 بـaria-label، وزرا تمرير اسمهما المقروء يطابق title بلا aria-label', async () => {
    await mount(<JourneyTimeline model={model()} pop />);
    const sc = host.querySelector('.jt-scroll');
    expect(sc.getAttribute('tabindex')).toBe('0');
    expect(sc.getAttribute('aria-label')).toBeTruthy();
    const nudges = host.querySelectorAll('.jt-nudge');
    expect(nudges.length).toBe(2);
    for (const b of nudges) {
      expect(b.hasAttribute('aria-label')).toBe(false);
      expect(b.querySelector('.jt-sr').textContent).toBe(b.title);
    }
  });
  it('CSS: تدرج على الحافتين بالخصائص المنطقية، وscroll-snap', () => {
    const css = src('../../shared/css/journey-timeline.css');
    expect(css).toMatch(/\.jt-scroll \{ scroll-snap-type: x proximity/);
    expect(css).toMatch(/\.jt-slot \{ scroll-snap-align: start/);
    expect(css).toMatch(/\.jt-scrollbox::before \{ inset-inline-start: 0/);
    expect(css).toMatch(/\.jt-scrollbox::after \{ inset-inline-end: 0/);
  });
});

describe('البلاطات والتفاصيل الملاصقة', () => {
  it('البلاطة زر بـaria-expanded واسمه تحت الأيقونة، وaria-label يبدأ بالنص المرئي', async () => {
    await mount(<JourneyTimeline model={model()} pop onOpen={() => {}} openLabel={() => 'افتحه في القائمة'} />);
    const tiles = host.querySelectorAll('.jt-desk .jt-tile');
    expect(tiles.length).toBe(2);
    for (const t of tiles) {
      expect(t.tagName).toBe('BUTTON');
      expect(t.getAttribute('aria-expanded')).toBe('false');
      const name = t.querySelector('.jt-tile-name').textContent;
      expect(name.length).toBeGreaterThan(0);
      expect(t.getAttribute('aria-label').startsWith(name)).toBe(true);
    }
    expect(host.querySelector('.jt-panel')).toBeNull();
  });
  it('النقر يفتح التفاصيل ويأخذها التركيز، وEsc يغلقها ويعيد التركيز إلى البلاطة', async () => {
    await mount(<JourneyTimeline model={model()} pop />);
    const tile = host.querySelector('[data-act] .jt-tile-name').closest('button');
    await act(async () => { tile.click(); });
    await flush();
    const pop = host.querySelector('.jt-pop');
    expect(pop).not.toBeNull();
    expect(tile.getAttribute('aria-expanded')).toBe('true');
    expect(tile.getAttribute('aria-controls')).toBe(pop.id);
    expect(document.activeElement).toBe(pop);
    await act(async () => { pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush();
    expect(host.querySelector('.jt-pop')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });
  it('بلا pop تبقى لوحة الدفعة كما اعتُمدت', async () => {
    await mount(<JourneyTimeline model={model()} />);
    expect(host.querySelector('.jt-tile')).toBeNull();
    expect(host.querySelector('.jt-foot .jt-panel')).not.toBeNull();
  });
  it('الهاتف: التفاصيل درج سفلي ثابت باستعلام الحاوي نفسه الذي يخفي .jt-desk', () => {
    expect(src('../../shared/css/journey-timeline.css')).toMatch(/@container \(max-width: 640px\) \{\n {2}\.jt-pop \{ position: fixed; inset: auto 0 0 0/);
  });
  it('التفاصيل خارج .jt-desk فتظهر على الهاتف، وزر «التفاصيل» في بطاقة الهاتف يفتحها وEsc يعيد التركيز إليه', async () => {
    await mount(<JourneyTimeline model={model()} pop />);
    const btn = host.querySelector('[data-act-m]');
    expect(btn).not.toBeNull();
    await act(async () => { btn.click(); });
    await flush();
    const pop = host.querySelector('.jt-pop');
    expect(pop).not.toBeNull();
    expect(pop.closest('.jt-desk')).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe(pop.id);
    expect(document.activeElement).toBe(pop);
    await act(async () => { pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush();
    expect(host.querySelector('.jt-pop')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
});

describe('سطر الحالة', () => {
  const programs = [{ id: 'pa', name: 'أ', requirements: 3, versions: [{ id: 'v1', number: 1 }], draft_changed: true }];
  it('شارة النسخة من versionState، ثم «لا تمس الدفعة الجارية»، والتفاصيل مطوية، والاتساق صامت', async () => {
    const cohorts = [{ id: 'c1', name: 'دفعة', program_id: 'pa', status: 'running', program_version_id: 'v1', members: 4 }];
    await mount(<JourneyStatus pid="pa" data={{ success: true, programs, cohorts }} issues={[]} />);
    const line = host.querySelector('.j-status-line');
    expect(line.querySelector('[data-status="draft"]').textContent).toBe('مسودة معدلة');
    expect(line.textContent).toContain(JOURNEY_SAFE_AR);
    expect(host.querySelector('details.j-details').open).toBe(false);
    expect(host.querySelector('details.j-details summary').textContent).toBe('التفاصيل');
    expect(host.textContent).not.toContain('متسقة');
    expect(host.querySelector('.j-issues')).toBeNull();
  });
  it('دفعة غير مثبتة: لا تُقال العبارة، ويظهر تنبيهها خارج الطي', async () => {
    const cohorts = [{ id: 'c2', name: 'المفتوحة', program_id: 'pa', status: 'running', members: 9 }];
    await mount(<JourneyStatus pid="pa" data={{ success: true, programs, cohorts }} issues={[]} />);
    expect(host.querySelector('.j-status-line').textContent).not.toContain(JOURNEY_SAFE_AR);
    const note = host.querySelector('.j-audience > .la-note');
    expect(note.textContent).toContain('يصل ما تحرره هنا فورًا');
  });
  it('قبل وصول الدفعات أو عند تعذرها: لا تُقال العبارة', async () => {
    await mount(<JourneyStatus pid="pa" data={null} issues={[]} />);
    expect(host.querySelector('.j-status-line').textContent).not.toContain(JOURNEY_SAFE_AR);
    await mount(<JourneyStatus pid="pa" data={{ success: false }} issues={[]} />);
    expect(host.querySelector('.j-status-line').textContent).not.toContain(JOURNEY_SAFE_AR);
  });
  it('العدد زر يفتح التفاصيل وينقل التركيز إلى أول ملاحظة', async () => {
    const issues = [{ level: 'error', stage: 'support', msg: 'ملاحظة ب' }];
    await mount(<JourneyStatus pid="pa" data={{ success: true, programs, cohorts: [] }} issues={issues} onIssue={() => {}} />);
    await act(async () => { host.querySelector('.j-issues-btn').click(); });
    expect(host.querySelector('details.j-details').open).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('.j-issues button.la-link'));
  });
  it('مع ملاحظات: عددها في السطر ورابط لكل ملاحظة', async () => {
    const seen = [];
    const issues = [{ level: 'warn', stage: 'training', req: 'T-READ', msg: 'ملاحظة أ' }, { level: 'error', stage: 'support', msg: 'ملاحظة ب' }];
    await mount(<JourneyStatus pid="pa" data={{ success: true, programs, cohorts: [] }} issues={issues} onIssue={(x) => seen.push(x.msg)} />);
    expect(host.querySelector('.j-status-line [data-status="error"]').textContent).toBe(journeyIssuesAr(2));
    const links = host.querySelectorAll('.j-issues button.la-link');
    expect(links.length).toBe(2);
    await act(async () => { links[1].click(); });
    expect(seen).toEqual(['ملاحظة ب']);
  });
  it('المحرر: الترويسة الموحدة وفيها سطر الحالة، والخط بالبلاطات، ولا شارة «الرحلة متسقة» الدائمة', async () => {
    reply = { 'admin.programs': { success: true, programs: [{ ...programs[0], id: 'p1' }], cohorts: [] }, 'admin.program-milestones': { success: true, milestones: [] } };
    await mount(<Journey catalog={{ program_id: 'p1', assessment_minutes: 20, learning_models: [], lab_links: [], journey_stages: stages, stage_requirements: reqs }} reload={() => {}} canWrite onProgram={() => {}} />);
    expect(host.querySelector('.screen-head h2').textContent).toBe('الرحلة والمتطلبات');
    expect(host.querySelector('.screen-head-status .j-status-line [data-status="draft"]')).not.toBeNull();
    expect(host.querySelector('.jt-popmode .jt-tile')).not.toBeNull();
    expect(host.textContent).not.toContain('الرحلة متسقة');
  });
});
