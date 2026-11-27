// @vitest-environment jsdom
// المرحلة 22 من تصور «الرحلة والمتطلبات» و«المسار» (2026-11-27): وضع العرض والبناء المقيد بالكتابة، واللوحة الجانبية،
// وقائمة «⋯» (تحرير، أعلى، أسفل، نقل إلى…، إخفاء)، وإضافة مرحلة بأربعة حقول، ونشاط باختيار النوع، والنقل الذري
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reply = {};
const calls = [];
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  L: vi.fn((action, body) => { calls.push({ action, ...body }); return Promise.resolve(typeof reply[action] === 'function' ? reply[action](body) : reply[action] ?? { success: true }); }),
}));
let confirmAnswer = true;
const confirms = [];
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: (m) => { confirms.push(m); return Promise.resolve(confirmAnswer); }, prompt: () => Promise.resolve('') }) }));

const { Journey, ModeSwitch } = await import('./screens/Methodology.jsx');
const { UIProvider } = await import('./ui.jsx');
const M = await import('./methodology.js');
const labels = await import('../../supabase/functions/leaders-api/labels.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
// UIProvider الحقيقي لما يقرؤه Form من داخل ui.jsx (useGuardedClose)، وuseUI المحاكى لما تستدعيه الشاشة
const mount = async (el) => { await act(async () => root.render(<UIProvider>{el}</UIProvider>)); await flush(); };
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const btn = (text, scope = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const items = () => [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
const setVal = async (el, v) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};
const submit = async (form) => { await act(async () => { form.requestSubmit(); }); await flush(); };

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 28, active: true },
  { key: 'ojt', title_ar: 'التطبيق', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'report', title_ar: 'التقرير', phase: 'impact', sort: 4, duration_days: 7, active: true },
];
const XSS = '<img src=x onerror="window.__pwned=1">';
const reqs = [
  { id: 'r1', code: 'P-INFO', stage_key: 'profile', kind: 'auto', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'اقرأ الباب الأول', sort: 1, active: true },
  { id: 'r3', code: 'T-UP', stage_key: 'training', kind: 'upload', required: false, title_ar: XSS, sort: 2, active: true },
  { id: 'r4', code: 'O-1', stage_key: 'ojt', kind: 'check', required: true, title_ar: 'سجل التطبيق', sort: 1, active: true },
];
const catalog = { success: true, program_id: 'p1', assessment_minutes: 20, learning_models: [], lab_links: [], journey_stages: stages, stage_requirements: reqs };

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  calls.length = 0; confirms.length = 0; confirmAnswer = true; reply = {};
  window.history.replaceState(null, '', '#/leaders/journey');
});
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ''; delete window.__pwned; });

describe('مفتاح العرض والبناء', () => {
  it('القارئ بلا صلاحية كتابة لا يرى المفتاح، ولا يفتح الرابط ‎?mode=build‎ البناء له', async () => {
    window.history.replaceState(null, '', '#/leaders/journey?mode=build');
    await mount(<Journey catalog={catalog} reload={() => {}} canWrite={false} />);
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(host.querySelector('.j-build')).toBeNull();
    expect(host.querySelector('.pf-more-btn')).toBeNull();
    expect(btn('+ نشاط', host)).toBeUndefined();
    expect(btn('+ مرحلة', host)).toBeUndefined();
  });
  it('العرض افتراضي بلا أزرار تحرير، والبناء يثبت في الرابط ويظهر «⋯» و«+ مرحلة» و«+ نشاط»', async () => {
    await mount(<Journey catalog={catalog} reload={() => {}} canWrite />);
    const rg = host.querySelector('[role="radiogroup"]');
    expect([...rg.querySelectorAll('[role="radio"]')].map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['عرض', 'true'], ['بناء', 'false']]);
    expect(host.querySelector('.pf-more-btn')).toBeNull();
    expect(btn('تحرير', host)).toBeUndefined();
    await click(btn('بناء', rg));
    expect(window.location.hash).toBe('#/leaders/journey?mode=build');
    expect(host.querySelectorAll('.j-build').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-add-stage]').length).toBe(3);
    expect(host.querySelectorAll('.la-stage-ed .pf-more-btn').length).toBe(stages.length + reqs.length);
    expect([...host.querySelectorAll('button')].filter((b) => b.textContent === '+ نشاط').length).toBe(stages.length);
    // «+ مرحلة» آخر محوره لا في رأسه
    const axis = host.querySelector('#j-axis-qualification').closest('section');
    expect(axis.lastElementChild.matches('[data-add-stage="qualification"]')).toBe(true);
  });
  it('الرابط ‎?mode=build‎ يفتح البناء لصاحب الكتابة، والأسهم تنقل بين الوضعين', async () => {
    window.history.replaceState(null, '', '#/leaders/journey?mode=build');
    await mount(<Journey catalog={catalog} reload={() => {}} canWrite />);
    expect(host.querySelector('.j-build')).toBeTruthy();
    const view = host.querySelector('[data-mode="view"]');
    const build = host.querySelector('[data-mode="build"]');
    expect(build.getAttribute('tabindex')).toBe('0');
    expect(view.getAttribute('tabindex')).toBe('-1');
    await act(async () => { build.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await flush();
    expect(window.location.hash).toBe('#/leaders/journey');
    expect(host.querySelector('.j-build')).toBeNull();
  });
  it('ModeSwitch وحده: مجموعة راديو باسمها', async () => {
    const on = vi.fn();
    await mount(<ModeSwitch mode="view" onMode={on} />);
    expect(host.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('وضع الصفحة');
    await click(host.querySelector('[data-mode="build"]'));
    expect(on).toHaveBeenCalledWith('build');
  });
});

describe('قائمة «⋯» واللوحة الجانبية', () => {
  const openBuild = async (extra = {}) => {
    window.history.replaceState(null, '', '#/leaders/journey?mode=build');
    await mount(<Journey catalog={catalog} reload={extra.reload || (() => {})} onPatch={extra.onPatch} canWrite />);
  };
  const menuOf = async (rowSel) => { await click(document.querySelector(`${rowSel} .pf-more-btn`)); return items(); };

  it('قائمة النشاط: تحرير وأعلى وأسفل ونقل إلى… وإخفاء، بلا «أعلى» لأوله ولا «أسفل» لآخره', async () => {
    await openBuild();
    expect(await menuOf('#jreq-r2')).toEqual(['تحرير', 'أسفل', 'نقل إلى…', 'إخفاء']);
    await act(async () => { document.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(await menuOf('#jreq-r3')).toEqual(['تحرير', 'أعلى', 'نقل إلى…', 'إخفاء']);
  });
  it('اسم زر «⋯» يسمي ما يخصه، وكل aria-label بنص مرئي يبدأ بنصه', async () => {
    await openBuild();
    expect(document.querySelector('#jreq-r2 .pf-more-btn').getAttribute('aria-label')).toBe('إجراءات نشاط «اقرأ الباب الأول»');
    for (const el of host.querySelectorAll('button[aria-label], a[aria-label]')) {
      const text = el.textContent.trim();
      if (!text || text === '⋯' || el.getAttribute('role') === 'radiogroup' || el.tagName === 'DL' || el.tagName === 'DIV' || el.tagName === 'UL' || el.tagName === 'SECTION') continue;
      expect([el.getAttribute('aria-label'), text]).toEqual([expect.stringMatching(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)), text]);
    }
  });
  it('تحرير النشاط يفتح لوحة جانبية لا نافذة وسطى، بأقسامها، والرمز النظامي مقفل بملاحظته', async () => {
    await openBuild();
    await menuOf('#jreq-r1');
    await click(btn('تحرير', document.querySelector('[role="menu"]')));
    const panel = document.querySelector('form.j-panel[role="dialog"]');
    expect(panel).toBeTruthy();
    expect(panel.closest('.j-panel-ov')).toBeTruthy();
    expect([...panel.querySelectorAll('.la-form-group')].map((g) => g.dataset.group)).toEqual(['basics', 'audience', 'kind', 'advanced']);
    expect(panel.querySelector('details[data-group="advanced"]').open).toBe(false);
    expect(panel.textContent).toContain('رمز نظامي لا يُغيَّر');
    expect(panel.querySelector('#f-code').readOnly).toBe(true);
  });
  it('لوحة المرحلة: الأساسيات مفتوحة ثم ما يراه المشارك ثم الشروط المتقدمة مطوية وأعلاها جملة القاعدة', async () => {
    await openBuild();
    await click(document.querySelector('#j-st-training button'));
    const panel = document.querySelector('form.j-panel');
    const groups = [...panel.querySelectorAll('.la-form-group')];
    expect(groups.map((g) => g.dataset.group)).toEqual(['basics', 'participant', 'advanced']);
    expect([...groups[0].querySelectorAll('input,select,textarea')].map((x) => x.id)).toEqual(['f-title_ar', 'f-phase', 'f-rule_mode', 'f-duration_days', 'f-description_ar']);
    expect(groups[2].tagName).toBe('DETAILS');
    expect(groups[2].querySelector('.la-rule').textContent).toMatch(/^أساسية · /);
  });
  it('الإخفاء بدل الحذف: active=false عبر admin.save وإعلان يذكر بقاء التقدم', async () => {
    const reload = vi.fn();
    await openBuild({ reload });
    await menuOf('#jreq-r4');
    await click(btn('إخفاء', document.querySelector('[role="menu"]')));
    expect(calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'stage_requirements', row: { id: 'r4', active: false } });
    expect(calls.some((c) => c.action === 'admin.delete')).toBe(false);
    expect(host.querySelector('[data-testid="j-said"]').textContent).toContain('ويبقى تقدم المشاركين محفوظًا');
    expect(reload).toHaveBeenCalled();
  });
  it('«أسفل» ينقل بالإجراء الذري ويحدّث المرحلتين وحدهما بلا إعادة تحميل، ويعلن الموضع', async () => {
    const reload = vi.fn();
    let patched = null;
    reply['admin.requirement-move'] = () => ({ success: true, from: 'training', to: 'training', position: 2, stage_title: 'التدريب', rows: [{ ...reqs[2], sort: 1 }, { ...reqs[1], sort: 2 }] });
    await openBuild({ reload, onPatch: (fn) => { patched = fn(catalog); } });
    await menuOf('#jreq-r2');
    await click(btn('أسفل', document.querySelector('[role="menu"]')));
    expect(calls.find((c) => c.action === 'admin.requirement-move')).toMatchObject({ id: 'r2', program_id: 'p1', stage_key: 'training', position: 2, expect_stage: 'training', expect_sort: 1, target_ids: ['r3'] });
    expect(reload).not.toHaveBeenCalled();
    expect(patched.stage_requirements.filter((r) => r.stage_key === 'training').map((r) => [r.id, r.sort])).toEqual([['r3', 1], ['r2', 2]]);
    expect(patched.stage_requirements.find((r) => r.id === 'r4')).toBeTruthy();
    expect(host.querySelector('[data-testid="j-said"]').textContent).toBe('نُقل إلى الموضع 2 في مرحلة التدريب');
  });
  it('«نقل إلى…» بتنبيه التقدم: يُسأل المدير، ويُعاد الطلب بالتأكيد، وتعارض الكتابة رسالة لا تُتجاهل', async () => {
    const reload = vi.fn();
    let n = 0;
    reply['admin.requirement-move'] = (b) => (b.confirm ? { success: true, from: 'training', to: 'ojt', position: 1, stage_title: 'التطبيق', rows: [] }
      : (n += 1) === 1 ? { success: false, code: 'confirm', message: 'أكمله 3 مشاركًا أو بدأه في مرحلته الحالية، ويبقى تقدمهم محفوظًا.' } : { success: false });
    await openBuild({ reload, onPatch: () => {} });
    await menuOf('#jreq-r2');
    await click(btn('نقل إلى…', document.querySelector('[role="menu"]')));
    const panel = document.querySelector('form.j-panel');
    await setVal(panel.querySelector('#f-stage_key'), 'ojt');
    await setVal(panel.querySelector('#f-position'), '1');
    await submit(panel);
    const moves = calls.filter((c) => c.action === 'admin.requirement-move');
    expect(moves.map((c) => !!c.confirm)).toEqual([false, true]);
    expect(moves[0]).toMatchObject({ stage_key: 'ojt', position: 1, target_ids: ['r4'] });
    expect(confirms[0]).toContain('أكمله 3');
    expect(document.querySelector('form.j-panel')).toBeNull();
    expect(host.querySelector('[data-testid="j-said"]').textContent).toBe('نُقل إلى الموضع 1 في مرحلة التطبيق');

    reply['admin.requirement-move'] = () => ({ success: false, code: 'conflict', message: 'عدّل مدير آخر هذه المرحلة للتو' });
    await menuOf('#jreq-r4');
    await click(btn('أسفل', document.querySelector('[role="menu"]')) || btn('نقل إلى…', document.querySelector('[role="menu"]')));
    const p2 = document.querySelector('form.j-panel');
    if (p2) await submit(p2);
    expect(confirms.some((m) => m.includes('عدّل مدير آخر'))).toBe(true);
    expect(reload).toHaveBeenCalled();
  });
  it('«+ مرحلة»: أربعة حقول والمحور مملوء، وتصل admin.stage-create بنوعها ومدتها', async () => {
    reply['admin.stage-create'] = { success: true, row: { key: 's-x' }, next: 'report' };
    await openBuild();
    await click(host.querySelector('[data-add-stage="qualification"]'));
    const panel = document.querySelector('form.j-panel');
    expect([...panel.querySelectorAll('input,select,textarea')].map((x) => x.id)).toEqual(['f-title_ar', 'f-phase', 'f-mode', 'f-duration_days']);
    expect(panel.querySelector('#f-phase').value).toBe('qualification');
    expect(panel.querySelector('#f-mode').value).toBe('required');
    await setVal(panel.querySelector('#f-title_ar'), 'مختبر');
    await setVal(panel.querySelector('#f-mode'), 'optional');
    await setVal(panel.querySelector('#f-duration_days'), '10');
    await submit(panel);
    expect(calls.find((c) => c.action === 'admin.stage-create')).toMatchObject({ program_id: 'p1', title_ar: 'مختبر', phase: 'qualification', mode: 'optional', duration_days: 10 });
  });
  it('«+ نشاط»: النوع أولًا بأسماء ACTIVITY_KIND_AR و«مخصص»، ثم اللوحة برمز مقترح قابل للتعديل', async () => {
    await openBuild();
    const add = [...host.querySelectorAll('button')].filter((b) => b.textContent === '+ نشاط')[1];
    await click(add);
    let panel = document.querySelector('form.j-panel');
    const opts = [...panel.querySelectorAll('input[type="radio"]')].map((r) => r.getAttribute('aria-label'));
    expect(opts).toContain(labels.ACTIVITY_KIND_AR.reading);
    expect(opts).toContain(labels.ACTIVITY_CUSTOM_AR);
    expect(opts).not.toContain(labels.ACTIVITY_KIND_AR.check);
    await act(async () => { panel.querySelector('input[value="upload"]').click(); });
    await submit(panel);
    panel = document.querySelector('form.j-panel');
    expect(panel.getAttribute('aria-label')).toBe('نشاط جديد');
    expect(panel.querySelector('#f-kind').value).toBe('upload');
    expect(panel.querySelector('#f-code').value).toBe('U-1');
    expect(panel.querySelector('#f-code').readOnly).toBe(false);
    await setVal(panel.querySelector('#f-title_ar'), 'ارفع التقرير');
    await submit(panel);
    expect(calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'stage_requirements', row: { program_id: 'p1', stage_key: 'training', kind: 'upload', code: 'U-1', title_ar: 'ارفع التقرير', sort: 3 } });
  });
  it('لا innerHTML: عنوان فيه وسم صورة بحدث onerror يُعرض نصًا في البطاقة والقائمة واللوحة', async () => {
    await openBuild();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('#jreq-r3').textContent).toContain(XSS);
    await menuOf('#jreq-r3');
    await click(btn('نقل إلى…', document.querySelector('[role="menu"]')));
    expect(document.querySelector('form.j-panel').getAttribute('aria-label')).toContain(XSS);
    expect(document.querySelector('img')).toBeNull();
    expect(window.__pwned).toBeUndefined();
  });
});

describe('دوال وضع البناء (methodology.js)', () => {
  it('journeyModeOf: البناء لصاحب الكتابة وحده', () => {
    expect(M.journeyModeOf('mode=build', true)).toBe('build');
    expect(M.journeyModeOf('mode=build', false)).toBe('view');
    expect(M.journeyModeOf('', true)).toBe('view');
    expect(M.withMode('req=1', 'build')).toBe('req=1&mode=build');
    expect(M.withMode('mode=build', 'view')).toBe('');
  });
  it('suggestCode لا يكرر رمزًا قائمًا، والرمز النظامي من AUTO_CHECKS', () => {
    expect(M.suggestCode('upload', [{ code: 'U-1' }, { code: 'U-2' }])).toBe('U-3');
    expect(M.isSystemCode('P-INFO')).toBe(true);
    expect(M.isSystemCode('U-1')).toBe(false);
  });
  it('durationNote: ملاحظة اتساق حين يتعارض نص المدة مع أيامها', () => {
    expect(M.durationNote({ duration_days: 28, duration_label: '4 أسابيع' })).toEqual([]);
    expect(M.durationNote({ duration_days: 7, duration_label: 'شهران' })).toEqual([]);
    expect(M.durationNote({ duration_days: 7, duration_label: '3 أسابيع' })[0].tone).toBe('warn');
  });
});
