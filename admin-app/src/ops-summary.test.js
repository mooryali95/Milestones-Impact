// ملخص البطاقة المطوية (ops-summary.js) ومتى تنفتح (cardOpen)، وسؤال الخادم بعد التنبيه التجريبي (ops-watch.js)
import { vi } from 'vitest';
import { opsVerdict } from '../../supabase/functions/leaders-api/ops-health.js';
import { opsSummary, slackState } from './ops-summary.js';

vi.mock('./leaders.js', () => ({ L: vi.fn() }));
const { L } = await import('./leaders.js');
const W = await import('./ops-watch.js');
const { cardOpen } = await import('./OpsHealth.jsx');

const NOW = Date.parse('2026-11-15T12:00:00Z');
const ago = (m) => new Date(NOW - m * 60e3).toISOString();
const facts = (over = {}) => ({
  success: true, at: ago(0),
  mail: { key: true, cap: 80, sent: 9, codes: { sent: 9, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 0, queue: { waiting: 0, oldest_minutes: 0 }, ...over.mail },
  slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null, ...over.slack },
  alerts: { email: true, webhook: true, ...over.alerts },
});
const sum = (f) => opsSummary(f, opsVerdict(f, NOW), NOW);

describe('opsSummary: سطر البطاقة المطوية', () => {
  it('حلقة البريد من المرسل والسقف، ورموز الدخول الثلاثة، وسلاك، والقنوات', () => {
    const s = sum(facts());
    expect(s.mail).toMatchObject({ sent: 9, cap: 80, pct: 11, tone: 'ok', text: '9 من 80' });
    expect(s.mail.aria).toBe('البريد اليوم: أُرسل 9 من 80 (11٪ من السقف اليومي)');
    expect(s.codes.map((c) => [c.key, c.label, c.n, c.tone])).toEqual([['sent', 'وصل', 9, 'ok'], ['failed', 'تعذّر', 0, 'mute'], ['blocked', 'حُجب', 0, 'mute']]);
    expect(s.slack).toEqual({ state: 'ok', tone: 'ok', text: 'نُشر منذ 4 دقائق' });
    expect(s.alerts).toEqual({ on: 3, of: 3, tone: 'ok', text: '3 من 3' });
  });
  it('لون الحلقة من عتبة الحكم نفسها: اقتراب ثم امتلاء', () => {
    expect(sum(facts({ mail: { sent: 61 } })).mail.tone).toBe('warn');
    expect(sum(facts({ mail: { sent: 80 } })).mail.tone).toBe('bad');
    expect(sum(facts({ mail: { sent: 80 } })).mail.pct).toBe(100);
  });
  it('رموز تعذّرت أو حُجبت تستحق نظرة، وما لم يُقرأ بلا لون', () => {
    const s = sum(facts({ mail: { codes: { sent: 4, failed: 2, blocked: 1 } } }));
    expect(s.codes.map((c) => c.tone)).toEqual(['ok', 'warn', 'warn']);
    const u = sum(facts({ mail: { sent: null, codes: { sent: null, failed: null, blocked: null } } }));
    expect(u.mail).toMatchObject({ pct: null, tone: 'mute', text: 'غير مقروء' });
    expect(u.codes.every((c) => c.n === null && c.tone === 'mute')).toBe(true);
  });
  it('سلاك: لم يُنشر بعد، وخطأ أحدث من النجاح، ونجاح بعد خطأ، وغير مضبوط وغير مقروء', () => {
    expect(slackState(facts({ slack: { ok_at: null } }).slack, NOW)).toEqual({ state: 'never', tone: 'mute', text: 'لم يُنشر بعد' });
    expect(slackState(facts({ slack: { ok_at: ago(50), error_at: ago(6), error: 'not_in_channel' } }).slack, NOW)).toEqual({ state: 'error', tone: 'warn', text: 'تعذّر منذ 6 دقائق' });
    expect(slackState(facts({ slack: { ok_at: ago(2), error_at: ago(6), error: 'not_in_channel' } }).slack, NOW).state).toBe('ok');
    expect(slackState(facts({ slack: { ok_at: ago(0.2) } }).slack, NOW).text).toBe('نُشر الآن');
    expect(slackState(facts({ slack: { ok_at: ago(3000) } }).slack, NOW).text).toBe('نُشر منذ أكثر من يوم');
    expect(slackState(facts({ slack: { configured: false } }).slack, NOW).state).toBe('off');
    expect(slackState(facts({ slack: { readable: false } }).slack, NOW).state).toBe('unread');
  });
  it('قنوات التنبيه المضبوطة من ثلاث، وصفر يستحق نظرة', () => {
    expect(sum(facts({ alerts: { email: false } })).alerts.text).toBe('2 من 3');
    expect(sum(facts({ alerts: { email: false, webhook: false }, slack: { configured: false } })).alerts).toMatchObject({ on: 0, tone: 'warn' });
  });
});

describe('cardOpen: الطي والفتح', () => {
  it('السليم يتبع المحفوظ (والمطوي إن لم يُحفظ شيء)، وغير السليم مفتوح مهما حُفظ', () => {
    // السليمة مطوية سطرًا ما لم يفتحها صاحبها (تدقيق 2026-11-23)
    expect(cardOpen('green', null)).toBe(false);
    expect(cardOpen('green', 'open')).toBe(true);
    expect(cardOpen('green', 'closed')).toBe(false);
    expect(cardOpen('amber', 'closed')).toBe(true);
    expect(cardOpen('red', 'closed')).toBe(true);
    // اختيار الجلسة يغلب في الحال التي اختير فيها
    expect(cardOpen('green', 'closed', { lv: 'green', open: true })).toBe(true);
    expect(cardOpen('red', 'open', { lv: 'red', open: false })).toBe(false);
    // تغيّر الحال إلى غير سليمة يسقطه في الرسم نفسه: لا رسم مطوي قبل الفتح
    expect(cardOpen('red', 'open', { lv: 'green', open: false })).toBe(true);
    expect(cardOpen('amber', 'open', { lv: 'red', open: false })).toBe(true);
    // والعودة إلى السليم تبقيه
    expect(cardOpen('green', 'open', { lv: 'red', open: false })).toBe(false);
  });
});

describe('ops-watch: الأرقام تتبع التنبيه التجريبي', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); W.resetOpsWatch(); L.mockReset(); });
  afterEach(() => { W.resetOpsWatch(); vi.useRealTimers(); });
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('سؤال فوري بعد التجربة ثم آخر بعد ثوانٍ تصل فيه حالة سلاك', async () => {
    let n = 0;
    L.mockImplementation(async () => facts({ mail: { sent: 9 + n }, slack: { ok_at: n++ >= 2 ? ago(0) : null } }));
    const seen = [];
    const off = W.subscribeOpsHealth((d) => seen.push(d));
    await flush();
    expect(L).toHaveBeenCalledTimes(1);
    expect(seen.at(-1).mail.sent).toBe(9);
    W.refreshAfterTest();
    await flush();
    expect(L).toHaveBeenCalledTimes(2);
    expect(seen.at(-1).mail.sent).toBe(10);
    expect(seen.at(-1).slack.ok_at).toBeNull();
    await vi.advanceTimersByTimeAsync(W.AFTER_TEST_MS);
    expect(L).toHaveBeenCalledTimes(3);
    expect(seen.at(-1).slack.ok_at).not.toBeNull();
    // سؤال ثان بعد عشر ثوانٍ لسلاك البطيء (مهلة الأم ثم الفاصل ثم مهلة الرد)
    await vi.advanceTimersByTimeAsync(W.AFTER_TEST_STEPS[1] - W.AFTER_TEST_STEPS[0]);
    expect(L).toHaveBeenCalledTimes(4);
    expect(W.AFTER_TEST_STEPS.at(-1)).toBeGreaterThanOrEqual(4000 + 1100 + 4000);
    off();
  });
  it('طلب قائم بدأ قبل التجربة لا يكفي: يُسأل بعده', async () => {
    let release;
    L.mockImplementationOnce(() => new Promise((r) => { release = () => r(facts()); }));
    L.mockImplementation(async () => facts({ mail: { sent: 10 } }));
    const seen = [];
    const off = W.subscribeOpsHealth((d) => seen.push(d));
    W.refreshAfterTest();
    expect(L).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(L).toHaveBeenCalledTimes(2);
    expect(seen.at(-1).mail.sent).toBe(10);
    off();
  });
  it('السؤال كل دقيقة ما دام أحد يقرأ، ولا سؤال متأخر بعد مغادرة البطاقة', async () => {
    L.mockImplementation(async () => facts());
    const off = W.subscribeOpsHealth(() => {});
    await flush();
    expect(L).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(W.POLL_MS);
    expect(L).toHaveBeenCalledTimes(2);
    W.refreshAfterTest();
    await flush();
    expect(L).toHaveBeenCalledTimes(3);
    off();
    await vi.advanceTimersByTimeAsync(W.POLL_MS * 2);
    expect(L).toHaveBeenCalledTimes(3);
  });
});
