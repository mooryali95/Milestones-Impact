// @vitest-environment jsdom
// المرحلة 23 من تصور الرحلة والمسار: تكميل سطر الحالة (البند 19) وصفحة المسار الأولى
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reply = {};
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  L: vi.fn((action) => Promise.resolve(reply[action] ?? { success: true })),
}));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true) }) }));

const { JourneyStatus } = await import('./screens/Methodology.jsx');
const { default: Tracks } = await import('./screens/Tracks.jsx');
const { PUBLISH_DRAFT_AR, publishLine } = await import('./program-state.js');
const { sameJourney, trackJourneyRows, trackRequirements } = await import('./track-page.js');
const { trackManifest } = await import('../../supabase/functions/leaders-api/track-manifest.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const mount = async (el) => { await act(async () => root.render(el)); await flush(); };
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); reply = {}; });

const v2 = { id: 'v2', number: 2, created_at: '2026-11-20T10:00:00Z' };
const v1 = { id: 'v1', number: 1, created_at: '2026-10-01T10:00:00Z' };

describe('publishLine: جملة النشر من versionState وadmin.programs', () => {
  it('المسودة والمحفوظ والدفعات على نسخة أقدم', () => {
    const p = { id: 'pa', requirements: 3, versions: [v2, v1], draft_changed: true };
    const cohorts = [
      { id: 'a', program_id: 'pa', status: 'running', program_version_id: 'v1' },
      { id: 'b', program_id: 'pa', status: 'running', program_version_id: 'v1' },
      { id: 'c', program_id: 'pa', status: 'closed', program_version_id: 'v1' },
      { id: 'd', program_id: 'pa', status: 'running', program_version_id: 'v2' },
      { id: 'e', program_id: 'pb', status: 'running', program_version_id: 'x' },
    ];
    expect(publishLine(p, cohorts)).toMatchObject({ state: 'draft', text: PUBLISH_DRAFT_AR, older: 2, older_ar: 'دفعتان على نسخة أقدم' });
    expect(publishLine({ ...p, draft_changed: false }, [], (d) => d.slice(0, 10)).text).toBe('منشورة، النسخة بتاريخ 2026-11-20');
    expect(publishLine({ id: 'pa', requirements: 3, versions: [] }).text).toBe('');
  });
  it('السطر: الجملة وزر «إلى النشر» للمسودة، ولا زر للمحفوظ', async () => {
    const programs = [{ id: 'pa', name: 'أ', requirements: 3, versions: [v2, v1], draft_changed: true }];
    const cohorts = [{ id: 'c1', name: 'دفعة', program_id: 'pa', status: 'running', program_version_id: 'v1', members: 4 }];
    await mount(<JourneyStatus pid="pa" data={{ success: true, programs, cohorts }} issues={[]} />);
    const line = host.querySelector('.j-status-line');
    expect(line.querySelector('.j-publish').textContent).toBe(PUBLISH_DRAFT_AR);
    const btn = line.querySelector('.j-to-publish');
    expect(btn.textContent).toBe('إلى النشر');
    expect(btn.getAttribute('aria-label').startsWith('إلى النشر')).toBe(true);
    expect(line.querySelector('.j-older').textContent).toBe('دفعة واحدة على نسخة أقدم');
    await act(async () => { btn.click(); });
    expect(window.location.hash).toContain('/leaders/programs');
    await mount(<JourneyStatus pid="pa" data={{ success: true, programs: [{ ...programs[0], draft_changed: false }], cohorts: [] }} issues={[]} />);
    expect(host.querySelector('.j-publish').textContent).toMatch(/^منشورة، النسخة بتاريخ /);
    expect(host.querySelector('.j-to-publish')).toBeNull();
    expect(host.querySelector('.j-older')).toBeNull();
  });
});

const K = 'M2I1L3';
const man = trackManifest(K);
const fw = man.card.journey.by_framework;
const stages = [
  { key: 's1', title_ar: 'التأهيل', phase: 'qualification', sort: 1, duration_days: 28, active: true },
  { key: 's2', title_ar: 'التطبيق', phase: 'impact', sort: 2, duration_days: 30, active: true },
];
const reqs = [
  { id: 'r1', code: fw.milestone.requirements[0], stage_key: 's1', kind: 'reading', required: true, title_ar: 'سجل المعالم', active: true, dimension: 'milestone', level: 'intermediate' },
  { id: 'r2', code: 'X-OTHER', stage_key: 's1', kind: 'reading', required: true, title_ar: 'خاص بمستوى آخر', active: true, dimension: 'milestone', level: 'advanced' },
  { id: 'r3', code: 'C-ALL', stage_key: 's2', kind: 'form', required: true, title_ar: 'للجميع', active: true },
];
const catalog = { success: true, program_id: 'p1', journey_stages: stages, stage_requirements: reqs, lab_links: [{ key: fw.milestone.labs[0], title_ar: 'مختبر أول' }], handbook_modules: [] };

describe('رحلة المسار: من بطاقة المسار ومراحل البرنامج', () => {
  it('المتطلبات المنطبقة على مستويات المسار وحدها', () => {
    expect(trackRequirements(catalog, K).map((r) => r.id)).toEqual(['r1', 'r3']);
  });
  it('صف لكل إطار بمستواه، والبند باسمه ومرحلته ورابطه، والنجمة على إطار الأولوية', () => {
    const { rows, hours } = trackJourneyRows(catalog, K);
    expect(rows.map((r) => r.dimension)).toEqual(['milestone', 'impact', 'leadership']);
    expect(rows.map((r) => r.level)).toEqual(['intermediate', 'beginner', 'advanced']);
    expect(rows.filter((r) => r.deep).map((r) => r.dimension)).toEqual([man.priority]);
    const it0 = rows[0].items[0];
    expect(it0).toMatchObject({ title: 'سجل المعالم', stage: 'التأهيل', stage_key: 's1', href: '#/leaders/journey/p1?req=r1' });
    expect(rows[0].items[1]).toMatchObject({ stage: null, href: null });
    expect(rows[0].labs[0].title).toBe('مختبر أول');
    expect(hours).toEqual(man.card.support.estimate_hours);
  });
  it('sameJourney: يطابق نص الملف بعد التقليم', () => {
    expect(sameJourney({ journey_ar: ' أ\nب ' }, { journey_ar: 'أ\nب' })).toBe(true);
    expect(sameJourney({ journey_ar: 'أ' }, { journey_ar: 'ب' })).toBe(false);
    expect(sameJourney({ journey_ar: 'أ' }, null)).toBe(false);
  });
});

describe('صفحة المسار', () => {
  const track = {
    success: true, track: { key: K, title_ar: 'مسار داخلي', summary_ar: 'وصف داخلي', focus_ar: '1. أولى\n2. ثانية', journey_ar: 'الكتاب\nالمختبر' },
    levels: man.levels, participants: [], handbook: [], project: { text: 'مشروع' }, strengths: 'أقوى أطرك: القيادة.',
    profile: { title_ar: 'ملف المسار', title_en: 'Profile', summary_ar: 'أولويتك الآن إدارة المشروعات', journey_ar: 'الكتاب\nالمختبر' },
  };
  const media = (wide) => { window.matchMedia = () => ({ matches: wide, addEventListener() {}, removeEventListener() {} }); };
  afterEach(() => { delete window.matchMedia; });
  it('على الهاتف: تبويبان «ما يراه المشارك» و«إعدادات الإدارة»', async () => {
    media(false);
    reply = { 'admin.track': track };
    await mount(<Tracks catalog={catalog} reload={() => {}} canWrite trackKey={K} onOpen={() => {}} onPerson={() => {}} />);
    const tabs = [...host.querySelectorAll('.tr-tabs [role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['ما يراه المشارك', 'إعدادات الإدارة']);
    expect(host.querySelector('#tr-pane-admin').hidden).toBe(true);
    await act(async () => { tabs[1].click(); });
    expect(host.querySelector('#tr-pane-admin').hidden).toBe(false);
    expect(host.querySelector('#tr-pane-participant').hidden).toBe(true);
  });
  it('الترتيب: البطل الخفيف، ثم الإطار والحقول، ثم الرحلة، ثم الكتاب، ثم المشاركون؛ ونص الملف مرة واحدة', async () => {
    media(true);
    reply = { 'admin.track': track };
    await mount(<Tracks catalog={catalog} reload={() => {}} canWrite trackKey={K} onOpen={() => {}} onPerson={() => {}} />);
    const hero = host.querySelector('.la-track-hero');
    expect(hero.querySelector('h2').textContent).toBe('ملف المسار');
    expect(hero.querySelector('.tr-why').textContent).toContain('لماذا هذا المسار');
    const heads = [...host.querySelectorAll('section.la-card h3, .tr-pane h3')].map((h) => h.textContent).filter((x) => !x.startsWith('باب'));
    expect(heads).toEqual(['ما يراه المشارك', 'إعدادات الإدارة', 'رحلة المسار', 'كتاب المسار كما يقرؤه المشارك', 'المشاركون في هذا المسار']);
    expect(host.textContent.split('أولويتك الآن').length - 1).toBe(1);
    expect(host.querySelectorAll('.tr-seen li').length).toBe(4);
    expect(host.querySelector('.tr-admin [role="note"]').textContent).toContain('هذه الحقول داخلية؛ المشارك يرى نص الملف');
    expect(host.querySelector('details.tr-custom summary').textContent).toBe('تخصيص');
    expect(host.querySelectorAll('.tr-where').length).toBeGreaterThanOrEqual(5);
    expect(host.querySelector('#jt-track-h').textContent).toBe('رحلة المسار');
    expect(host.querySelectorAll('.tr-journey .jt-act').length).toBeGreaterThan(0);
    const link = host.querySelector('.tr-fw a.la-link');
    expect(link.getAttribute('href')).toBe('#/leaders/journey/p1?req=r1');
    expect(link.getAttribute('aria-label').startsWith(link.textContent)).toBe(true);
  });
  it('القارئ بلا صلاحية كتابة: لا «إعدادات الإدارة»', async () => {
    reply = { 'admin.track': { ...track, profile: null } };
    await mount(<Tracks catalog={catalog} reload={() => {}} canWrite={false} trackKey={K} onOpen={() => {}} onPerson={() => {}} />);
    expect(host.querySelector('.tr-admin')).toBeNull();
    expect(host.querySelector('.la-track-hero h2').textContent).toBe('مسار داخلي');
  });
});
