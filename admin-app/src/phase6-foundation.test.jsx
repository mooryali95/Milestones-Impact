// @vitest-environment jsdom
// المرحلة 6 من تصور تطبيق القادة: الأساس المشترك (--la-head-h، StatusChip، Meter وbarPct، طي العروض الصفرية، «امسح الكل»، «إجراءات ▾»)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { barPct, Meter, StatusChip, statusTone } from './ui.jsx';
import { PARTICIPANT_STATUS, PARTICIPANT_STATUS_TONE } from '../../supabase/functions/leaders-api/labels.js';
import { splitPresets } from './filters.js';
import FilterBar from './FilterBar.jsx';
import { MENU_TEXT, MoreMenu } from './screens/PersonShell.jsx';
import { HEAD_VAR, setHeadHeight } from './head-height.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (el) => act(() => root.render(el));
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

describe('STATUS_TONE وStatusChip', () => {
  it('لكل حالة نبرة معرّفة، ولا نبرة خارج المجموعة المعتمدة', () => {
    expect(Object.keys(PARTICIPANT_STATUS_TONE).sort()).toEqual(Object.keys(PARTICIPANT_STATUS).sort());
    for (const t of Object.values(PARTICIPANT_STATUS_TONE)) expect(['', 'ok', 'warn', 'bad']).toContain(t);
    expect(statusTone('pending_approval')).toBe('warn');
    expect(statusTone('completed')).toBe('ok');
    expect(statusTone('غير معروف')).toBe('');
    expect(statusTone('x', { x: 'neon' })).toBe('');
  });
  it('الشارة تأخذ التسمية والنبرة من labels، والفارغ لا يرسم شيئًا', () => {
    render(<StatusChip status="pending_approval" />);
    const c = host.querySelector('.la-chip');
    expect(c.textContent).toBe(PARTICIPANT_STATUS.pending_approval);
    expect(c.className).toContain('warn');
    expect(c.className).toContain('st-chip');
    render(<StatusChip status="legacy_x" />);
    expect(host.querySelector('.la-chip').textContent).toBe('legacy_x');
    render(<StatusChip status="" />);
    expect(host.querySelector('.la-chip')).toBeNull();
  });
  it('شاشتا المشاركين والجهات لا تختاران نبرة حالة المشارك في السطر', () => {
    for (const f of ['screens/Participants.jsx', 'screens/Orgs.jsx']) {
      expect(src(f)).not.toMatch(/la-chip \$\{p\.status ===/);
      expect(src(f)).toContain('<StatusChip status={p.status} />');
    }
  });
});

describe('barPct وMeter', () => {
  it('النسبة محصورة وصحيحة، والمقام الصفري لا يقسم', () => {
    expect(barPct(0, 10)).toBe(0);
    expect(barPct(5, 10)).toBe(50);
    expect(barPct(15, 10)).toBe(100);
    expect(barPct(3, 0)).toBe(0);
    expect(barPct(-2, 10)).toBe(0);
    expect(barPct(NaN, 10)).toBe(0);
    expect(barPct(1, 1000)).toBe(1);
    expect(barPct(2, 3)).toBe(67);
  });
  it('المقياس يعرض المقام صريحًا ويعلن القيمة لقارئ الشاشة', () => {
    render(<Meter value={3} max={12} label="المرتبطون" />);
    const m = host.querySelector('[role="meter"]');
    expect(m.getAttribute('aria-label')).toBe('المرتبطون: 3 من 12');
    expect(m.getAttribute('aria-valuemax')).toBe('12');
    expect(m.getAttribute('aria-valuenow')).toBe('3');
    expect(host.querySelector('.la-meter-num').textContent).toBe('3 من 12');
    expect(host.querySelector('.la-meter-bar i').style.width).toBe('25%');
  });
});

describe('FilterBar: طي الصفري و«امسح الكل»', () => {
  const presets = [{ key: 'a', label: 'أ' }, { key: 'b', label: 'ب' }, { key: 'c', label: 'ج' }, { key: 'd', label: 'د' }];
  it('splitPresets يطوي الصفري غير المختار فقط', () => {
    expect(splitPresets(presets, { a: 2, b: 0, c: 0 }, '', false).folded).toEqual([]);
    const r = splitPresets(presets, { a: 2, b: 0, c: 0 }, 'c', true);
    expect(r.folded.map((p) => p.key)).toEqual(['b']);
    expect(r.shown.map((p) => p.key)).toEqual(['a', 'c', 'd']);   // d بلا عداد معروف لا يُطوى
  });
  it('الصفري تحت «المزيد (n)»، ورقاقة «امسح الكل» مع الفلتر', () => {
    const state = { q: '', view: '' };
    const noop = () => {};
    render(<FilterBar scope="t6" state={state} set={noop} clear={noop} replace={noop} presets={presets} counts={{ a: 1, b: 0, c: 0, d: 4 }} shown={5} total={5} noun="عنصر" collapseZero />);
    const labels = () => [...host.querySelectorAll('.flt-preset')].map((b) => b.firstChild.textContent);
    expect(labels()).toEqual(['أ', 'د']);
    const more = host.querySelector('.flt-zero-more');
    expect(more.textContent).toBe('المزيد (2)');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    act(() => more.click());
    expect(labels()).toEqual(['أ', 'د', 'ب', 'ج']);
    expect(host.querySelector('.flt-chip-clear')).toBeNull();
    render(<FilterBar scope="t6" state={{ q: 'سارة', view: '' }} set={noop} clear={noop} replace={noop} presets={presets} counts={{}} shown={1} total={5} noun="عنصر" />);
    expect(host.querySelector('.flt-chip-clear').textContent).toBe('امسح الكل');
  });
});

describe('MoreMenu: «إجراءات ▾»', () => {
  it('النص الظاهر بداية الاسم المسموع، والسهم لا يُقرأ، و«⋯» يبقى افتراضيًا', () => {
    render(<MoreMenu text={MENU_TEXT} label="المزيد من إجراءات المشاركين" items={[{ label: 'استيراد', run: () => {} }]} />);
    const b = host.querySelector('.pf-more-btn');
    expect(b.textContent).toBe('إجراءات ▾');
    expect(b.getAttribute('aria-label')).toBe('إجراءات: المزيد من إجراءات المشاركين');
    expect(b.querySelector('[aria-hidden="true"]').textContent.trim()).toBe('▾');
    render(<MoreMenu items={[{ label: 'س', run: () => {} }]} />);
    expect(host.querySelector('.pf-more-btn').textContent).toBe('⋯');
  });
});

describe('--la-head-h', () => {
  it('يُكتب من ارتفاع الترويسة، وصفر الارتفاع لا يكتب شيئًا', () => {
    const el = document.createElement('header');
    el.getBoundingClientRect = () => ({ height: 91.6 });
    const r = document.createElement('div');
    expect(setHeadHeight(el, r)).toBe(92);
    expect(r.style.getPropertyValue(HEAD_VAR)).toBe('92px');
    el.getBoundingClientRect = () => ({ height: 0 });
    expect(setHeadHeight(el, r)).toBeNull();
  });
  it('الملتصقات تقرأ المتغير لا أرقامًا ثابتة، وhtml له scroll-padding-top منه، والترويسة مقيسة في App', () => {
    const css = src('leaders-admin.css');
    for (const sel of ['.pf-head', '.org-tabs', '.st-index', '.ct-pane']) {
      const line = css.split('\n').find((l) => l.startsWith(`${sel} {`) && l.includes('sticky'));
      expect(line, sel).toContain('var(--la-head-h)');
    }
    expect(css).toMatch(/\.la-tabs-grouped \{ position: sticky; top: calc\(var\(--la-head-h\)/);
    expect(src('admin.css')).toMatch(/html \{[^}]*scroll-padding-top: calc\(var\(--la-head-h\)/);
    expect(src('App.jsx')).toMatch(/<header className="dash-header" ref=\{headRef\}>/);
    expect(src('App.jsx')).toContain('useHeadHeight(headRef)');
  });
});
