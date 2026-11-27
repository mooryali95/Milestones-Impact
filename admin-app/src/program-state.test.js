// المرحلة 11: حالة نسخة البرنامج والملخص والمؤرشفة وطي الشرح (program-state.js)، وربطها في Programs.jsx
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canSaveVersion, draftCount, draftSummaryAr, howOpen, HOW_KEY, readHow, splitArchived, versionState, writeHow } from './program-state.js';
import { PROGRAM_VERSION_STATE, PROGRAM_VERSION_STATE_TONE } from '../../supabase/functions/leaders-api/labels.js';
import { StatusChip } from './ui.jsx';

const v = [{ id: 'v1', number: 1 }];
const src = readFileSync(join(__dirname, 'screens/Programs.jsx'), 'utf8');

describe('versionState: شارة نسخة واحدة بالأولوية', () => {
  it('مؤرشف قبل كل شيء، ثم بلا متطلبات، ثم بلا نسخة، ثم مسودة معدلة، ثم محفوظ', () => {
    expect(versionState({ archived_at: 'x', requirements: 0, versions: [], draft_changed: true })).toBe('archived');
    expect(versionState({ requirements: 0, versions: v, draft_changed: true })).toBe('no_reqs');
    expect(versionState({ requirements: 3, versions: [], draft_changed: true })).toBe('no_version');
    expect(versionState({ requirements: 3, versions: v, draft_changed: true })).toBe('draft');
    expect(versionState({ requirements: 3, versions: v })).toBe('saved');
    expect(versionState(null)).toBe('no_reqs');
  });
  it('لكل حالة تسمية ونبرة في labels، والشارة تقرؤها', () => {
    for (const k of ['archived', 'no_reqs', 'no_version', 'draft', 'saved']) {
      expect(PROGRAM_VERSION_STATE[k]).toBeTruthy();
      expect(k in PROGRAM_VERSION_STATE_TONE).toBe(true);
    }
    const html = renderToStaticMarkup(React.createElement(StatusChip, { status: 'draft', labels: PROGRAM_VERSION_STATE, tones: PROGRAM_VERSION_STATE_TONE }));
    expect(html).toContain('مسودة معدلة');
    expect(html).toContain('warn');
  });
  it('زر الحفظ حيث يغيّر الحفظ شيئًا فقط', () => {
    expect(canSaveVersion('draft')).toBe(true);
    expect(canSaveVersion('no_version')).toBe(true);
    for (const s of ['saved', 'archived', 'no_reqs']) expect(canSaveVersion(s)).toBe(false);
  });
});

describe('الملخص والمؤرشفة', () => {
  const ps = [
    { id: 'a', requirements: 2, versions: v, draft_changed: true },
    { id: 'b', requirements: 2, versions: v, draft_changed: true, archived_at: 'x' },
    { id: 'c', requirements: 2, versions: v },
  ];
  it('المسودات تستبعد المؤرشف، والسطر يغيب عند الصفر', () => {
    expect(draftCount(ps)).toBe(1);
    expect(draftSummaryAr(0)).toBe('');
    expect(draftSummaryAr(1)).toBe('برنامج واحد بمسودة غير محفوظة');
    expect(draftSummaryAr(2)).toBe('برنامجان بمسودة غير محفوظة');
    expect(draftSummaryAr(3)).toBe('3 برامج بمسودة غير محفوظة');
    expect(draftSummaryAr(11)).toBe('11 برنامجًا بمسودة غير محفوظة');
  });
  it('الفعّال والمؤرشف قسمان بلا ازدواج', () => {
    const { active, archived } = splitArchived(ps);
    expect(active.map((p) => p.id)).toEqual(['a', 'c']);
    expect(archived.map((p) => p.id)).toEqual(['b']);
  });
});

describe('طي شرح الخطوات', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* */ } });
  it('مفتوح حين لا برامج أيًا كان التفضيل، وإلا التفضيل، والافتراضي مطوي', () => {
    expect(howOpen(0, '0')).toBe(true);
    expect(howOpen(0, null)).toBe(true);
    expect(howOpen(2, null)).toBe(false);
    expect(howOpen(2, '1')).toBe(true);
    expect(howOpen(2, '0')).toBe(false);
  });
  it('التخزين للتفضيل وحده، وتعطله لا يكسر', () => {
    writeHow(true);
    expect(readHow()).toBe('1');
    expect(window.localStorage.getItem(HOW_KEY)).toBe('1');
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      expect(readHow()).toBe(null);
      expect(() => writeHow(false)).not.toThrow();
    } finally { Object.defineProperty(window, 'localStorage', orig); }
  });
});

describe('Programs.jsx يستعمل المصدر الواحد', () => {
  it('لا شارات النسخة القديمة الثلاث، والشارة من StatusChip', () => {
    expect(src).toContain('versionState(p)');
    expect(src).toContain('<StatusChip status={st} labels={PROGRAM_VERSION_STATE}');
    expect(src).not.toContain('في المسودة تعديلات لم تُحفظ نسخة');
    expect(src).not.toContain('بلا نسخة: تُحفظ مع أول دفعة');
    expect(src).toContain('سجل النسخ (');
    expect(src).toContain('<dl className="prog-meta">');
    expect(src).toContain('مؤرشفة ({archived.length})');
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
  });
  it('زر الحفظ خلف canWrite', () => {
    expect(src).toMatch(/canWrite && canSaveVersion\(st\) &&/);
  });
});
