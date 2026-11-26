import { describe, expect, it } from 'vitest';
import { alertHref, greetingAr, healthProblems, inboxView, riyadhHour, systemIssues, systemNotes, todayNumbers, waitingSub } from './today.js';
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
  it('لا صفر كاذب ولا «لا شيء ينتظر» كاذب: بنود بلا عمر، ورد بلا قائمة، وصندوق متعذر أو ناقص', () => {
    const age = (d) => `${d} يوم`;
    // خادم أقدم: بنود بلا days، فالأقدم من سبعة أيام مجهول لا صفر
    const old = todayNumbers(inbox([{ late: false }, { late: true }, {}]), overview);
    expect(old.stale).toBeNull();
    expect(old.waiting).toEqual({ n: 3, oldest: null });
    expect(waitingSub(old, age)).toBe('');
    // رد ناجح بلا قائمة: العدد من total كما يقرؤه الصندوق
    const bare = todayNumbers({ success: true, total: 2 }, overview);
    expect([bare.waiting, bare.late, bare.stale]).toEqual([{ n: 2, oldest: null }, null, null]);
    expect(todayNumbers({ success: true }, overview).waiting).toEqual({ n: 0, oldest: null });
    expect(waitingSub(todayNumbers({ success: false }, overview), age)).toBe('تعذّرت قراءة الصندوق');
    expect(waitingSub(todayNumbers(inbox([]), overview), age)).toBe('لا شيء ينتظر');
    // نوع متعذر والباقي فارغ: «0+» لا يقال معه «لا شيء ينتظر»
    expect(waitingSub(todayNumbers(inbox([], { skipped: ['sponsor'] }), overview), age)).toBe('');
    expect(waitingSub(todayNumbers(inbox([{ days: 4 }]), overview), age)).toBe('أقدمها 4 يوم');
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
    // المؤجل بقرار سطر للعلم في البطاقة، لا خلل يفتح الشارة
    expect(systemIssues({ ...okHealth, pending_migrations: [{ name: '090_x', gate: 'deferred' }] })).toBe(false);
    expect(systemNotes({ ...okHealth, pending_migrations: [{ name: '090_x', gate: 'deferred' }] })).toBe(true);
    expect(systemNotes(okHealth)).toBe(false);
    expect(systemIssues({ ...okHealth, pending_migrations: [{ name: '090_x', gate: 'deferred' }, { name: '091_y', gate: 'tolerant' }] })).toBe(true);
    // خادم قبل pending_migrations
    expect(systemIssues({ ...okHealth, pending_migrations: undefined, missing_migrations: ['089_y'] })).toBe(true);
  });
  it('كل شيء سليم: لا بند', () => {
    const p = healthProblems({ ops: green, h: okHealth, orgs: [] });
    expect(p).toEqual([]);
  });
  it('الخلل بأسمائه وعدده، وبوابات الكتابة كما في البطاقات', () => {
    const h = { ...okHealth, missing_secrets: ['X'], readiness: [{ key: 'a', ok: false }] };
    const orgs = [{ id: 'o1', status: 'active', name: 'جهة' }];
    const p = healthProblems({ ops: { verdict: { level: 'amber' } }, h, orgs });
    expect(p.map((x) => x.key)).toEqual(['ops-amber', 'system', 'launch', 'orgs']);
    // المراقب: حالة النظام وحدها (البقية لا تُعرض له)
    expect(healthProblems({ ops: { verdict: { level: 'red' } }, h, orgs, canWrite: false }).map((x) => x.key)).toEqual(['system']);
    expect(healthProblems({ ops: { failed: true }, h: okHealth })[0].label).toBe('صحة البريد غير مقروءة');
    expect(healthProblems({ ops: { verdict: { level: 'red' } }, h: okHealth })[0].label).toBe('عطل في البريد');
    // حالة النظام المتعذرة لا تُقرأ «سليمة»، للمراقب أيضًا
    expect(healthProblems({ ops: green, h: null }).map((x) => x.key)).toEqual(['system-unread']);
    expect(healthProblems({ h: { success: false }, canWrite: false })[0].label).toBe('حالة النظام غير مقروءة');
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

describe('رابط التنبيه', () => {
  it('إلى ملف هدفه، ومعه العرض حين يحمله (المتأخرون في «المتابعة»، المرحلة 3 من تشغيل الدفعة)', () => {
    expect(alertHref({ target: { tab: 'programs', id: 'c1' } })).toBe('#/leaders/programs/c1');
    expect(alertHref({ target: { tab: 'programs', id: 'c1', query: 'view=follow&show=late' } })).toBe('#/leaders/programs/c1?view=follow&show=late');
  });
});

// ── المرحلة 8: «ما يحتاج انتباهك» قسم عرض واحد من مصدرين، والروابط العميقة إلى موضع الإصلاح ──
import { attentionRows, exceptionRows, HEALTH_HREF, IN_PROGRAM, phAnchor, PROGRAM_VIEW } from './today.js';
import { anchorOf, parseRoute } from './route.js';

describe('المرحلة 8: ما يحتاج انتباهك', () => {
  const okH = { success: true, readiness: [{ key: 'a', ok: true }, { key: 'b', ok: false }], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 1, cap: 80 } };
  const ph = { success: true, checks: [{ key: 'cron', label: 'المهمة الليلية', level: 'bad', line: 'متوقفة' }] };
  const t = { success: true, alerts: [
    { id: 'seats:o1', kind: 'seats_full', severity: 'bad', text: 'مقاعد ممتلئة', target: { tab: 'orgs', id: 'o1' } },
    { id: 'undated:c1', kind: 'cohort_undated', severity: 'warn', text: 'جلستان بلا موعد', target: { tab: 'programs', id: 'c1' } },
    { id: 'undated:c1', kind: 'cohort_undated', severity: 'warn', text: 'مكرر', target: { tab: 'programs', id: 'c1' } },
  ] };
  it('روابط الاستثناءات ليست كلها HEALTH_HREF: كل بند يشير إلى مرساته', () => {
    const rows = exceptionRows({ ops: null, h: okH, orgs: [], ph, canWrite: true });
    expect(rows.every((r) => r.href !== HEALTH_HREF)).toBe(true);
    expect(rows.find((r) => r.key === 'launch').href).toBe(`${HEALTH_HREF}#ph-launch`);
    expect(rows.find((r) => r.key === 'ph-cron').href).toBe(`${HEALTH_HREF}#ph-check-cron`);
  });
  it('phAnchor ثابت لكل مفتاح', () => {
    expect(['system', 'system-unread', 'launch', 'orgs', 'ph-unread', 'ph-codes'].map(phAnchor)).toEqual(['ph-system', 'ph-system', 'ph-launch', 'ph-orgs', 'ph-checks', 'ph-check-codes']);
    expect(phAnchor('ops-red')).toBe(null);
  });
  it('يدمج المصدرين: bad ثم warn، ويزيل المكرر بالمفتاح، ولكل صف شكل واحد', () => {
    const exc = exceptionRows({ ops: null, h: okH, orgs: [], ph, canWrite: true });
    const rows = attentionRows(exc, t);
    expect(rows.map((r) => r.key)).toEqual(['ph-cron', 'alert:seats:o1', 'launch', 'alert:undated:c1']);
    expect(rows.map((r) => r.source)).toEqual(['health', 'alert', 'health', 'alert']);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['href', 'key', 'kind', 'level', 'source', 'text', 'where']);
    expect(rows[1]).toMatchObject({ href: '#/leaders/orgs/o1', where: 'ملف الجهة' });
    expect(attentionRows(exc, t).filter((r) => r.key === 'alert:undated:c1')[0].text).toBe('جلستان بلا موعد');
  });
  it('تنبيهات متعذرة لا تُرسم بنودًا، والمصدران فارغان قائمة فارغة', () => {
    expect(attentionRows([], { success: false })).toEqual([]);
    expect(attentionRows([], null)).toEqual([]);
  });
  it('المرساة بعد المسار لا تغيّر التبويب، والمرساة غير الصالحة تُهمل', () => {
    expect(parseRoute('#/leaders/health#ph-launch')).toEqual({ ctx: 'leaders', tab: 'health', id: null });
    expect(anchorOf('#/leaders/health#ph-launch')).toBe('ph-launch');
    expect(anchorOf('#/leaders/health')).toBe(null);
    expect(anchorOf('#/leaders/health#<img>')).toBe(null);
    // مفاتيح فحوص بشرطة سفلية (alert_email، sponsor_codes): المعرّف والرابط واحد
    expect(anchorOf(`#/leaders/health#${phAnchor('ph-alert_email')}`)).toBe('ph-check-alert_email');
    expect(anchorOf(`#/leaders/health#${phAnchor('ph-sponsor_codes')}`)).toBe('ph-check-sponsor_codes');
  });
  it('مرشح البطاقة الرابعة بالحالتين نفسيهما', () => {
    expect(IN_PROGRAM).toEqual(['placed', 'enrolled']);
    expect(PROGRAM_VIEW).toBe('inprogram');
  });
});
