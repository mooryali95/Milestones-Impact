// @vitest-environment jsdom
// المرحلة 16 من تصور الشاشات الخمس: الخبراء (صف الأرقام، شريط اللجان، التبويبان في الرابط، أعمدة التصدير، وافتراض ExpertMatch)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let reply = {};
vi.mock('./leaders.js', async (orig) => ({
  ...(await orig()),
  date: (x) => String(x || ''),
  L: vi.fn((action, body) => { calls.push([action, body]); const r = reply[action]; return Promise.resolve(typeof r === 'function' ? r(body) : r ?? { success: true }); }),
}));
vi.mock('./ui.jsx', async (orig) => ({ ...(await orig()), useUI: () => ({ toast: () => {}, confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('') }) }));

const { default: Experts, expertTab } = await import('./screens/Experts.jsx');
const { attentionCount, RequestsBoard } = await import('./screens/ExpertMatch.jsx');
const { chosenColumns } = await import('./exports.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const mount = async (el) => { await act(async () => root.render(el)); await flush(); };
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');
const H = 36e5;
const ago = (h) => new Date(Date.now() - h * H).toISOString();

const EXPERTS = [
  { id: 'e1', full_name: 'سارة', email: 's@x.com', phone: '0500', roles: ['coach'], dimensions: [], levels: [], committees: [], weekly_hours: null, status: 'active', created_at: '2026-10-01' },
  { id: 'e2', full_name: 'خالد', email: 'k@x.com', roles: ['mentor'], dimensions: [], levels: [], committees: [], weekly_hours: null, status: 'applied', created_at: '2026-10-02' },
];
const COMMITTEES = [
  { key: 'content', title: 'لجنة المحتوى', members: [{ id: 'e9', name: 'منى' }], ready: false, gaps: ['ينقصها مراجع للقياس'] },
  { key: 'measurement', title: 'لجنة القياس', members: [], ready: false, gaps: ['لا أعضاء بعد'] },
];
// طلب مقبول حديثًا: قائم لكنه لا يحتاج تدخلًا
const CALM = [{ id: 'r2', participant_id: 'p2', role: 'advisor', status: 'accepted', created_at: ago(30), accepted_at: ago(20), participants: { full_name: 'عمر' } }];
const HOT = [{ id: 'r1', participant_id: 'p1', role: 'coach', status: 'unmatched', created_at: ago(30), participants: { full_name: 'ليلى' } }, ...CALM];

beforeEach(() => {
  calls.length = 0; sessionStorage.clear(); localStorage.clear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  window.location.hash = '#/leaders/experts';
  reply = { 'admin.experts': { success: true, experts: EXPERTS, committees: COMMITTEES }, 'admin.expert-requests': { success: true, requests: HOT } };
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('expertTab: التبويب الظاهر', () => {
  it('الصريح يغلب، ثم رابط «ينتظرني»، ثم الطلبات إن كان فيها ما يحتاج تدخلًا', () => {
    expect(expertTab({ tab: 'network', reqView: 'attention', attention: 3 })).toBe('network');
    expect(expertTab({ reqView: 'attention', attention: 0 })).toBe('requests');
    expect(expertTab({ attention: 2 })).toBe('requests');
    expect(expertTab({ attention: 0 })).toBe('network');
    expect(expertTab({ attention: null })).toBeNull();
    expect(expertTab({ tab: 'bogus', attention: 0 })).toBe('network');
    expect(expertTab({ attention: null, failed: true })).toBe('requests');
    expect(expertTab({ tab: 'network', failed: true })).toBe('network');
  });
  it('attentionCount يعد ما يحتاج تدخلًا وحده', () => {
    expect(attentionCount(HOT)).toBe(1);
    expect(attentionCount(CALM)).toBe(0);
    expect(attentionCount(null)).toBe(0);
  });
});

describe('شاشة الخبراء', () => {
  it('أربع بطاقات أرقام، واللجان في شريطها لا في صف الأرقام', async () => {
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    const stats = host.querySelector('.ex-stats');
    expect(stats.querySelectorAll('.stat-card').length).toBe(4);
    expect(stats.textContent).not.toContain('لجنة');
    const bar = host.querySelector('.ex-committees');
    expect(bar.textContent).toContain('لجنة المحتوى');
    expect(bar.textContent).toContain('عضو واحد');
    expect(bar.textContent).toContain('ينقصها مراجع للقياس');
    expect(bar.querySelectorAll('.st-chip').length).toBe(2);
    // لا «·» علامةً للغياب
    expect([...stats.querySelectorAll('.stat-value')].map((x) => x.textContent.trim())).not.toContain('·');
  });

  it('الساعات المتاحة صفر: «لم تُحدد ساعات متاحة» ورابط يصفّي الشبكة بمن لم تُحدد طاقته', async () => {
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    const card = [...host.querySelectorAll('.stat-card')].find((c) => c.textContent.includes('ساعات مقدّمة'));
    expect(card.textContent).toContain('لم تُحدد ساعات متاحة');
    expect(card.querySelector('[role="meter"]')).toBeNull();
    await act(async () => card.querySelector('button').click());
    expect(window.location.hash).toContain('tab=network');
    expect(window.location.hash).toContain('cap=none');
    expect(host.querySelectorAll('.ex-table tbody tr').length).toBe(2);
  });

  it('ساعات متاحة: Meter بمقام صريح', async () => {
    reply['admin.experts'] = { success: true, experts: [{ ...EXPERTS[0], weekly_hours: 6, stats: { hours: 2, attended: 1, participants: 1 } }], committees: [] };
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    const m = host.querySelector('.ex-stats [role="meter"]');
    expect(m.getAttribute('aria-valuetext')).toBe('2 من 6 ساعة');
  });

  it('التبويب الافتراضي الطلبات حين يحتاج شيء تدخلًا، ولا يُكتب في الرابط؛ والعنوانان بعدديهما', async () => {
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    expect(host.querySelector('[role="tablist"]').className).toContain('la-subtabs');
    expect(tabs.map((t) => t.textContent)).toEqual(['طلبات الإسناد (1 يحتاج تدخلًا)', 'شبكة الخبراء (2)']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(window.location.hash).not.toContain('tab=');
    expect(host.querySelector('.xm-board')).not.toBeNull();
    expect(host.querySelector('.ex-table')).toBeNull();
    await act(async () => tabs[1].click());
    expect(window.location.hash).toContain('tab=network');
    expect(host.querySelector('.ex-table')).not.toBeNull();
  });

  it('لا شيء يحتاج تدخلًا: الشبكة افتراضيًا', async () => {
    reply['admin.expert-requests'] = { success: true, requests: CALM };
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    expect(host.querySelector('[role="tab"][aria-selected="true"]').id).toBe('ex-tab-network');
  });

  it('?tab=network صريح يُحترم، و?view=attention يفتح الطلبات ولو كانت فارغة', async () => {
    window.location.hash = '#/leaders/experts?tab=network';
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    expect(host.querySelector('[role="tab"][aria-selected="true"]').id).toBe('ex-tab-network');
    act(() => root.unmount()); root = createRoot(host);
    reply['admin.expert-requests'] = { success: true, requests: CALM };
    window.location.hash = '#/leaders/experts?view=attention';
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    expect(host.querySelector('[role="tab"][aria-selected="true"]').id).toBe('ex-tab-requests');
    // العرض الصريح فارغ ويبقى: خبر طيب لا قفز
    expect(host.querySelector('.xm-board').textContent).toContain('لا طلب يحتاج تدخلًا الآن');
    expect(host.querySelector('.xm-board [aria-pressed="true"]').textContent).toMatch(/يحتاج تدخلًا/);
  });

  it('لجنة بلا أعضاء: Empty بفعل «أضف عضوًا» يفتح نموذج الخبير واللجنة محددة؛ ومن لا يكتب يرى النص وحده', async () => {
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    const btn = [...host.querySelectorAll('.ex-committees button')].find((b) => b.textContent === 'أضف عضوًا');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBeNull();
    await act(async () => btn.click());
    const form = host.querySelector('.ex-form');
    expect(form).not.toBeNull();
    const on = [...form.querySelectorAll('.ex-tg.on')].map((l) => l.textContent);
    expect(on.some((t) => t.includes('القياس'))).toBe(true);
    act(() => root.unmount()); root = createRoot(host);
    await mount(<Experts canWrite={false} onOpen={() => {}} onPerson={() => {}} />);
    expect(host.querySelector('.ex-committees').textContent).toContain('لا أعضاء بعد');
    expect(host.querySelector('.ex-committees').textContent.match(/لا أعضاء بعد/g).length).toBe(1);
    expect([...host.querySelectorAll('.ex-committees button')].some((b) => b.textContent === 'أضف عضوًا')).toBe(false);
  });

  it('صفوف الشبكة لا تعرض الجوال، والحالة بـStatusChip', async () => {
    window.location.hash = '#/leaders/experts?tab=network';
    await mount(<Experts canWrite onOpen={() => {}} onPerson={() => {}} />);
    const t = host.querySelector('.ex-table');
    expect(t.textContent).not.toContain('0500');
    expect(t.querySelectorAll('.st-chip[data-status]').length).toBe(2);
  });
});

describe('RequestsBoard: الافتراض غير الفارغ (ExpertMatch)', () => {
  it('«يحتاج تدخلًا» فارغ ولا عرض صريح: يُختار أول عرض فيه طلبات ويُعلن بسطر هادئ', async () => {
    reply['admin.expert-requests'] = { success: true, requests: CALM };
    await mount(<RequestsBoard canWrite onPerson={() => {}} />);
    expect(host.querySelector('[aria-pressed="true"]').textContent).toMatch(/^قائمة/);
    expect(host.querySelector('.flt-auto[role="status"]').textContent).toContain('لا شيء يحتاج تدخلك الآن');
    expect(host.querySelectorAll('tbody tr').length).toBe(1);
    expect(JSON.stringify(sessionStorage)).not.toContain('"view":"live"');
  });
  it('فيه ما يحتاج تدخلًا: يبقى الافتراضي بلا سطر', async () => {
    await mount(<RequestsBoard canWrite onPerson={() => {}} />);
    expect(host.querySelector('[aria-pressed="true"]').textContent).toMatch(/يحتاج تدخلًا/);
    expect(host.querySelector('.flt-auto').textContent).toBe('');
  });
  it('عرض من الرابط يُحترم ولو كان فارغًا', async () => {
    reply['admin.expert-requests'] = { success: true, requests: CALM };
    await mount(<RequestsBoard canWrite onPerson={() => {}} view="attention" />);
    expect(host.querySelector('[aria-pressed="true"]').textContent).toMatch(/يحتاج تدخلًا/);
    expect(host.textContent).toContain('لا طلب يحتاج تدخلًا الآن');
  });
  it('اختيار صريح ينهي الآلي', async () => {
    reply['admin.expert-requests'] = { success: true, requests: CALM };
    await mount(<RequestsBoard canWrite onPerson={() => {}} />);
    const att = [...host.querySelectorAll('button[aria-pressed]')].find((b) => /يحتاج تدخلًا/.test(b.textContent));
    await act(async () => att.click());
    await flush();
    expect(att.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.flt-auto').textContent).toBe('');
  });
  it('البيانات المرفوعة من الشاشة لا تُطلب مرة ثانية', async () => {
    await mount(<RequestsBoard canWrite onPerson={() => {}} data={{ success: true, requests: HOT }} onReload={() => {}} />);
    expect(calls.filter(([a]) => a === 'admin.expert-requests').length).toBe(0);
    expect(host.querySelectorAll('tbody tr').length).toBe(1);
  });
});

describe('التصدير والمصدر الواحد للنبرة', () => {
  it('البريد والجوال غير مختارين افتراضيًا', () => {
    const s = src('./screens/Experts.jsx');
    expect(s).toMatch(/key: 'email'[^}]*sensitive: true/);
    expect(s).toMatch(/key: 'phone'[^}]*sensitive: true/);
    const cols = [{ key: 'name' }, { key: 'email', sensitive: true }, { key: 'phone', sensitive: true }];
    expect(chosenColumns(cols, null).map((c) => c.key)).toEqual(['name']);
  });
  it('لا نبرة محلية في الشاشتين: StatusChip وSTATUS_TONE فقط', () => {
    for (const f of ['./screens/Experts.jsx', './screens/ExpertMatch.jsx']) {
      const s = src(f);
      expect(s).not.toMatch(/\bTONE\s*=\s*\{/);
      expect(s).not.toMatch(/la-chip \$\{/);
      expect(s).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    }
  });
});
