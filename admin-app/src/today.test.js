import { describe, expect, it } from 'vitest';
import { greetingAr, healthLine, healthOpen, healthProblems, inboxView, problemsSig, riyadhHour, systemIssues, todayNumbers } from './today.js';
import { dayFull } from './dates.js';

const inbox = (items, extra = {}) => ({ success: true, items, total: items.length, late: items.filter((i) => i.late).length, ...extra });
const overview = { success: true, total: 40, by_status: { placed: 5, enrolled: 12, pending_approval: 3 } };
const okHealth = { success: true, readiness: [], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 3, cap: 80 } };
const green = { verdict: { level: 'green' }, failed: false };

describe('مكتب اليوم: الأرقام الأربعة', () => {
  it('المنتظر وعمر أقدمه، والمتجاوز للمهلة، والأقدم من سبعة أيام، وفي البرنامج من أصل المسجلين', () => {
    const n = todayNumbers(inbox([{ days: 9, late: true }, { days: 7, late: false }, { days: 1, late: false }, { days: null }]), overview);
    expect(n).toEqual({ partial: false, waiting: { n: 4, oldest: 9 }, late: 1, stale: 1, program: { n: 17, of: 40 } });
  });
  it('لا صفر كاذب: صندوق متعذر أو نظرة عامة متعذرة تعطي null، والنوع المتعذر يعلّم الأرقام ناقصة', () => {
    const n = todayNumbers({ success: false }, { success: false });
    expect([n.waiting, n.late, n.stale, n.program]).toEqual([null, null, null, null]);
    expect(todayNumbers(inbox([], { skipped: ['sponsor'] }), overview).partial).toBe(true);
    expect(todayNumbers(inbox([]), overview).waiting).toEqual({ n: 0, oldest: null });
  });
  it('عروض الصندوق: المتأخر وحده، والأقدم من سبعة أيام وحده، وبلا عرض كل شيء', () => {
    const items = [{ id: 1, days: 8, late: false }, { id: 2, days: 2, late: true }, { id: 3, days: 0 }];
    expect(inboxView(items, 'late').map((i) => i.id)).toEqual([2]);
    expect(inboxView(items, 'stale').map((i) => i.id)).toEqual([1]);
    expect(inboxView(items, '')).toHaveLength(3);
    expect(inboxView(null, 'late')).toEqual([]);
  });
});

describe('مكتب اليوم: شارة الصحة', () => {
  it('حالة النظام بالحكم الذي كانت بطاقتها تختفي به', () => {
    expect(systemIssues(okHealth)).toBe(false);
    expect(systemIssues(null)).toBe(false);
    expect(systemIssues({ ...okHealth, missing_secrets: ['X'] })).toBe(true);
    expect(systemIssues({ ...okHealth, mail: { today: 64, cap: 80 } })).toBe(true);
    expect(systemIssues({ ...okHealth, migrations_ledger: false })).toBe(true);
    expect(systemIssues({ ...okHealth, pending_migrations: [{ name: '090_x', gate: 'deferred' }] })).toBe(true);
    // خادم قبل pending_migrations
    expect(systemIssues({ ...okHealth, pending_migrations: undefined, missing_migrations: ['089_y'] })).toBe(true);
  });
  it('كل شيء سليم: لا بند، والسطر «كل شيء سليم»', () => {
    const p = healthProblems({ ops: green, h: okHealth, orgs: [] });
    expect(p).toEqual([]);
    expect(healthLine(p)).toBe('كل شيء سليم');
  });
  it('الخلل بأسمائه وعدده، وبوابات الكتابة كما في البطاقات', () => {
    const h = { ...okHealth, missing_secrets: ['X'], readiness: [{ key: 'a', ok: false }] };
    const orgs = [{ id: 'o1', status: 'active', name: 'جهة' }];
    const p = healthProblems({ ops: { verdict: { level: 'amber' } }, h, orgs });
    expect(p.map((x) => x.key)).toEqual(['ops', 'system', 'launch', 'orgs']);
    expect(healthLine(p)).toBe('4 تحتاج انتباهك: البريد والتنبيه، حالة النظام، جاهزية الإطلاق، جاهزية الجهات');
    // المراقب: حالة النظام وحدها (البقية لا تُعرض له)
    expect(healthProblems({ ops: { verdict: { level: 'red' } }, h, orgs, canWrite: false }).map((x) => x.key)).toEqual(['system']);
    expect(healthLine([{ key: 'system', label: 'حالة النظام' }])).toBe('أمر واحد يحتاج انتباهك: حالة النظام');
    expect(healthProblems({ ops: { failed: true }, h: okHealth })[0].label).toBe('صحة البريد غير مقروءة');
    expect(healthProblems({ ops: { verdict: { level: 'red' } }, h: okHealth })[0].label).toBe('عطل في البريد');
  });
  it('مطوية حين يسلم كل شيء، ومفتوحة عند الخلل، واختيار المدير يسري على الحال نفسها وحدها', () => {
    expect(healthOpen('')).toBe(false);
    expect(healthOpen('ops')).toBe(true);
    expect(healthOpen('ops', { sig: 'ops', open: false })).toBe(false);
    expect(healthOpen('', { sig: '', open: true })).toBe(true);
    // خلل جديد بعد الطي يفتحها
    expect(healthOpen('ops,system', { sig: 'ops', open: false })).toBe(true);
    expect(problemsSig([{ key: 'ops' }, { key: 'orgs' }])).toBe('ops,orgs');
  });
});

describe('مكتب اليوم: الرأس بتوقيت الرياض', () => {
  it('التحية بساعة الرياض لا بساعة المتصفح', () => {
    expect(riyadhHour('2026-11-17T05:30:00Z')).toBe(8);
    expect(greetingAr('2026-11-17T05:30:00Z')).toBe('صباح الخير');
    expect(greetingAr('2026-11-17T10:00:00Z')).toBe('مساء الخير');
    expect(greetingAr('2026-11-17T22:30:00Z')).toBe('صباح الخير');
  });
  it('التاريخ الكامل بيوم الرياض وأرقام لاتينية', () => {
    // 22:30 بتوقيت UTC هي 01:30 من اليوم التالي في الرياض
    expect(dayFull('2026-11-17T22:30:00Z')).toMatch(/18/);
    expect(dayFull('2026-11-17T22:30:00Z')).toMatch(/2026/);
    expect(dayFull('x')).toBe('');
  });
});
