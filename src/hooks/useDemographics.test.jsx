import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useDemographics, { emptyDemoRow, validDemoRows, demoRowHasData } from './useDemographics';
import { UserAPI } from '../lib/api';

vi.mock('../lib/api', () => ({ UserAPI: { get: vi.fn(), save: vi.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('validDemoRows', () => {
  it('يتجاهل الصف الفارغ والصف بلا قوة', () => {
    const named = { ...emptyDemoRow(), name: 'سالم' };
    expect(validDemoRows([emptyDemoRow(), named])).toHaveLength(0);
  });
  it('يقبل صفًا باسم وبُعد قوة واحد', () => {
    const r = emptyDemoRow();
    expect(validDemoRows([{ ...r, name: 'سالم', strength: { ...r.strength, social: 2 } }])).toHaveLength(1);
  });
});

describe('demoRowHasData', () => {
  it('الصف الفارغ لا بيانات فيه، وأي حقل أو قيمة أو هدف يكفي', () => {
    const r = emptyDemoRow();
    expect(demoRowHasData(r)).toBe(false);
    expect(demoRowHasData({ ...r, name: '   ' })).toBe(false);
    expect(demoRowHasData({ ...r, location: 'الرياض' })).toBe(true);
    expect(demoRowHasData({ ...r, myRelation: { ...r.myRelation, social: 10 } })).toBe(true);
    expect(demoRowHasData({ ...r, target: { ...r.target, financial: true } })).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// demoDirty: كان الخروج من التحليل (نقرة خارجه أو «رجوع») يمحو ما كُتب بلا تنبيه،
// لأن الشاشة لا تعرف إن كان فيها ما لم يُحفظ. App.closeDemoScreen يسأل حين يصدق.
// ════════════════════════════════════════════════════════════════
function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const h = {};
  function Harness() {
    Object.assign(h, useDemographics({ sessionToken: 't', showToast: () => {}, onSessionEnd: () => {} }));
    return null;
  }
  act(() => { root.render(<Harness />); });
  return h;
}

describe('useDemographics: تعديلات غير محفوظة', () => {
  beforeEach(() => {
    UserAPI.get.mockReset().mockResolvedValue({ success: true, registration: {} });
    UserAPI.save.mockReset().mockResolvedValue({ success: true });
  });

  it('التحميل نظيف، والتعديل يُعلَّم، والحفظ الناجح يمحو العلامة', async () => {
    const h = mount();
    await act(() => h.loadDemoData());
    expect(h.demoRows).toHaveLength(3);
    expect(h.demoDirty).toBe(false);
    const id = h.demoRows[0].id;
    act(() => h.updateDemoRow(id, 'name', 'سالم'));
    act(() => h.updateDemoRow(id, ['strength', 'social'], 10));
    expect(h.demoDirty).toBe(true);
    await act(() => h.saveDemoData());
    expect(UserAPI.save).toHaveBeenCalledTimes(1);
    expect(h.demoDirty).toBe(false);
  });

  it('الحفظ الفاشل أو المرفوض يبقي العلامة، وكذلك الإضافة والحذف', async () => {
    const h = mount();
    await act(() => h.loadDemoData());
    act(() => h.addDemoRow());
    expect(h.demoDirty).toBe(true);
    await act(() => h.saveDemoData()); // لا صف صالح: لا حفظ
    expect(UserAPI.save).not.toHaveBeenCalled();
    expect(h.demoDirty).toBe(true);

    await act(() => h.loadDemoData());
    expect(h.demoDirty).toBe(false);
    act(() => h.removeDemoRow(h.demoRows[2].id));
    expect(h.demoRows).toHaveLength(2);
    expect(h.demoDirty).toBe(true);
    act(() => h.updateDemoRow(h.demoRows[0].id, 'name', 'سالم'));
    act(() => h.updateDemoRow(h.demoRows[0].id, ['strength', 'social'], 10));
    UserAPI.save.mockResolvedValue({ success: false, message: 'تعذّر الحفظ' });
    await act(() => h.saveDemoData());
    expect(h.demoDirty).toBe(true);
  });

  it('تعديل أثناء الحفظ لا يُعدّ محفوظًا', async () => {
    const h = mount();
    await act(() => h.loadDemoData());
    const id = h.demoRows[0].id;
    act(() => h.updateDemoRow(id, 'name', 'سالم'));
    act(() => h.updateDemoRow(id, ['strength', 'social'], 10));
    let finish;
    UserAPI.save.mockReturnValue(new Promise((r) => { finish = r; }));
    let saving;
    act(() => { saving = h.saveDemoData(); });
    act(() => h.updateDemoRow(id, 'entity', 'جهة'));
    await act(async () => { finish({ success: true }); await saving; });
    expect(h.demoDirty).toBe(true);
  });

  it('نسخة من خارج الشاشة (الجلسة أو الخروج) لا تترك علامة معلقة', async () => {
    const h = mount();
    await act(() => h.loadDemoData());
    act(() => h.addDemoRow());
    expect(h.demoDirty).toBe(true);
    act(() => h.setDemoRows([]));
    expect(h.demoDirty).toBe(false);
  });
});
