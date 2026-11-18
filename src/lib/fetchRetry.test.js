// fetchRetry وpostAction (تصور التحديث بلا أثر، المرحلة 3، ش9): مهلة لكل محاولة، وتراجع أسي بعشوائية كاملة داخل ميزانية،
// والقراءة تُعاد والكتابة بلا مفتاح محفوظ لا تُعاد بعد خطأ شبكة، والمفتاح ثابت عبر إعادات الكتابة الواحدة.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { backoffDelay, fetchRetry, idemState, learnIdem, netMessage, postAction, READ_POLICY, WRITE_POLICY, WRITE_UNSURE_POLICY } from './api';

const res = (status, body = {}, headers = {}) => ({ status, headers: { get: (k) => headers[k] ?? null }, json: async () => body, clone() { return this; } });
const gateway = (status) => ({ ...res(status), json: async () => { throw new Error('not json'); } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); idemState.active = false; });
// ساعة وهمية: الانتظار يقدّم الساعة بلا انتظار حقيقي
const clock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; }, tick: (ms) => { t += ms; } }; };
const quick = (extra = {}) => { const c = clock(); return { now: c.now, sleep: c.sleep, ...extra }; };

describe('fetchRetry', () => {
  it('يعيد المحاولة عند 503 من البوابة ثم يعيد الرد الناجح', async () => {
    const f = vi.fn().mockResolvedValueOnce(gateway(503)).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, quick())).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('لا يعيد عند أخطاء التطبيق مثل 400 و401، ولا عند 503 بجسم من الدالة نفسها', async () => {
    const f = vi.fn().mockResolvedValue(res(401));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, quick())).status).toBe(401);
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn().mockResolvedValue(res(503, { success: false, code: 'not_migrated' }));
    vi.stubGlobal('fetch', g);
    expect((await fetchRetry('u', {}, quick())).status).toBe(503);
    expect(g).toHaveBeenCalledTimes(1);
  });
  it('يعيد بعد انقطاع الشبكة، ويرمي إن استمر حتى نهاية الميزانية', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, quick())).status).toBe(200);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')));
    await expect(fetchRetry('u', {}, quick())).rejects.toThrow('net');
  });
  it('ميزانية القراءة 20 ثانية: عطل البوابة 10 ثوانٍ لا يصل المستخدم، والانتظار الكلي لا يتجاوز الميزانية', async () => {
    const c = clock();
    // البوابة تفشل حتى الثانية العاشرة ثم تعود، وكل محاولة تأخذ 200 ملي ثانية
    const f = vi.fn(async () => { c.tick(200); if (c.now() < 10_000) throw new TypeError('Failed to fetch'); return res(200); });
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, { ...READ_POLICY, now: c.now, sleep: c.sleep })).status).toBe(200);
    expect(c.now()).toBeGreaterThanOrEqual(10_000);
    expect(c.now()).toBeLessThan(READ_POLICY.budget);
    // عطل دائم: يتوقف قبل تجاوز الميزانية، بعدد محاولات محدود
    const d = clock();
    const g = vi.fn(async () => { d.tick(100); throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', g);
    await expect(fetchRetry('u', {}, { ...READ_POLICY, now: d.now, sleep: d.sleep })).rejects.toThrow();
    expect(d.now()).toBeLessThanOrEqual(READ_POLICY.budget);
    expect(g.mock.calls.length).toBeGreaterThan(3);
  });
  it('التراجع بعشوائية كاملة بين 0 وسقف يتضاعف حتى 5 ثوانٍ', () => {
    expect(backoffDelay(1, { random: () => 0 })).toBe(0);
    expect(backoffDelay(1, { random: () => 0.999 })).toBe(499);
    expect(backoffDelay(3, { random: () => 0.5 })).toBe(1000);
    expect(backoffDelay(10, { random: () => 0.999 })).toBe(4995);
    const seen = new Set(Array.from({ length: 50 }, () => backoffDelay(4)));
    expect(seen.size).toBeGreaterThan(10);
    for (const v of seen) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(4000); }
  });
  it('مهلة لكل محاولة بـAbortController: الطلب العالق يُقطع ويُعاد', async () => {
    vi.useFakeTimers();
    let n = 0;
    const f = vi.fn((url, init) => {
      n += 1;
      if (n === 1) return new Promise((_, bad) => init.signal.addEventListener('abort', () => bad(new DOMException('aborted', 'AbortError'))));
      return Promise.resolve(res(200));
    });
    vi.stubGlobal('fetch', f);
    const p = fetchRetry('u', {}, { ...READ_POLICY, random: () => 0 });
    await vi.advanceTimersByTimeAsync(READ_POLICY.timeout - 1);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect((await p).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][1].signal).toBeDefined();
  });
  it('المهلة ترمي خطأ يحمل timeout حين تنفد الميزانية', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((_, bad) => init.signal.addEventListener('abort', () => bad(new DOMException('aborted', 'AbortError'))))));
    const p = fetchRetry('u', {}, { timeout: 1000, budget: 1500, network: true, random: () => 0 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const e = await p;
    expect(e.timeout).toBe(true);
  });
  it('الكتابة بلا مفتاح محفوظ: لا إعادة بعد خطأ شبكة ولا بعد 504، وتُعاد عند 503 من البوابة', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    await expect(fetchRetry('u', {}, quick(WRITE_UNSURE_POLICY))).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn().mockResolvedValue(gateway(504));
    vi.stubGlobal('fetch', g);
    expect((await fetchRetry('u', {}, quick(WRITE_UNSURE_POLICY))).status).toBe(504);
    expect(g).toHaveBeenCalledTimes(1);
    const h = vi.fn().mockResolvedValueOnce(gateway(503)).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', h);
    expect((await fetchRetry('u', {}, quick(WRITE_UNSURE_POLICY))).status).toBe(200);
  });
  it('الطلب نفسه ما زال يعمل على الخادم (409 x-idem: pending) يُنتظر ويُعاد في الكتابة بمفتاح', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(409, { success: false, code: 'busy' }, { 'x-idem': 'pending' })).mockResolvedValueOnce(res(200, { success: true }, { 'x-idem': 'replayed' }));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, quick(WRITE_POLICY))).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('بلا اتصال (navigator.onLine false): لا انتظار، يرمي فورًا', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    await expect(fetchRetry('u', {}, quick())).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('postAction: نوع الفعل ومفتاح منع التكرار', () => {
  const bodies = (f) => f.mock.calls.map((c) => JSON.parse(c[1].body));
  it('القراءة بلا مفتاح وتُعاد بعد خطأ شبكة', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('net')).mockResolvedValueOnce(res(200, { success: true }));
    vi.stubGlobal('fetch', f);
    await postAction('leaders-api', { action: 'me', token: 't' }, { sleep: async () => {} });
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodies(f).every((b) => !('idem' in b))).toBe(true);
  });
  it('الكتابة قبل أن يعلن الخادم الحفظ: مفتاح يُرسل، ولا إعادة بعد خطأ شبكة، والخطأ «تعذّر التأكد»', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('net'));
    vi.stubGlobal('fetch', f);
    const e = await postAction('leaders-api', { action: 'profile.save', token: 't', full_name: 'س' }, { sleep: async () => {} }).catch((x) => x);
    expect(f).toHaveBeenCalledTimes(1);
    expect(e.uncertain).toBe(true);
    expect(netMessage(e)).toBe('تعذّر التأكد، تحقّق قبل الإعادة');
    expect(bodies(f)[0].idem).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
  it('بعد أن يعلن الخادم الحفظ: الكتابة تُعاد بالمفتاح نفسه، والإعادة اليدوية بالجسم نفسه تحمله أيضًا', async () => {
    learnIdem(res(200, {}, { 'x-idem': 'on' }));
    expect(idemState.active).toBe(true);
    const f = vi.fn().mockRejectedValueOnce(new TypeError('net')).mockRejectedValueOnce(new TypeError('net')).mockResolvedValueOnce(res(200, { success: true }, { 'x-idem': 'stored' }));
    vi.stubGlobal('fetch', f);
    await postAction('leaders-api', { action: 'models.save', token: 't', x: 1 }, { sleep: async () => {} });
    const keys = bodies(f).map((b) => b.idem);
    expect(new Set(keys).size).toBe(1);
    // كتابة جديدة بجسم آخر: مفتاح جديد
    const g = vi.fn().mockResolvedValue(res(200, { success: true }, { 'x-idem': 'stored' }));
    vi.stubGlobal('fetch', g);
    await postAction('leaders-api', { action: 'models.save', token: 't', x: 2 }, { sleep: async () => {} });
    expect(bodies(g)[0].idem).not.toBe(keys[0]);
    // كتابة لم يُعرف مصيرها ثم أعادها المستخدم بالجسم نفسه: المفتاح نفسه، فيعيد الخادم نتيجتها لا ينفذها ثانية
    const h = vi.fn().mockRejectedValue(new TypeError('net'));
    vi.stubGlobal('fetch', h);
    await postAction('leaders-api', { action: 'models.save', token: 't', x: 3 }, { sleep: async () => {}, budget: 0 }).catch(() => {});
    const k = vi.fn().mockResolvedValue(res(200, { success: true }, { 'x-idem': 'replayed' }));
    vi.stubGlobal('fetch', k);
    await postAction('leaders-api', { action: 'models.save', token: 't', x: 3 }, { sleep: async () => {} });
    expect(bodies(k)[0].idem).toBe(bodies(h)[0].idem);
  });
  it('رد بلا ترويسة x-idem يطفئ الإعادة (خادم قبل الترحيل)', () => {
    learnIdem(res(200, {}, { 'x-idem': 'on' }));
    learnIdem(res(200));
    expect(idemState.active).toBe(false);
  });
  it('ما لا يُحفظ (الدخول وروابط الأسرار) ودوال غير leaders-api بلا مفتاح', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { success: true }));
    vi.stubGlobal('fetch', f);
    await postAction('leaders-api', { action: 'auth.verify', email: 'a', link: 'b' });
    await postAction('admin-api', { action: 'unlock-reg', token: 't' });
    await postAction('user-api', { action: 'save', token: 't' });
    expect(bodies(f).every((b) => !('idem' in b))).toBe(true);
  });
  it('رفض 409 من الفعل نفسه نتيجة معروفة: الإعادة بعد التصحيح بمفتاح جديد لا يعيد الرفض القديم، و409 pending يُبقي المفتاح', async () => {
    const body = { action: 'admin.sponsor-decide', token: 't', id: 'r1', decision: 'approve' };
    const f = vi.fn().mockResolvedValue(res(409, { success: false, code: 'seats_over' }, { 'x-idem': 'stored' }));
    vi.stubGlobal('fetch', f);
    await postAction('leaders-api', body, { sleep: async () => {} });
    const g = vi.fn().mockResolvedValue(res(200, { success: true }, { 'x-idem': 'stored' }));
    vi.stubGlobal('fetch', g);
    await postAction('leaders-api', body, { sleep: async () => {} });
    expect(bodies(g)[0].idem).not.toBe(bodies(f)[0].idem);
    // ما زال يعمل على الخادم: المفتاح يبقى للإعادة اليدوية (WRITE_UNSURE_POLICY لا ينتظر pending)
    const h = vi.fn().mockResolvedValue(res(409, { success: false, code: 'busy' }, { 'x-idem': 'pending' }));
    vi.stubGlobal('fetch', h);
    await postAction('leaders-api', { ...body, id: 'r2' }, { sleep: async () => {}, budget: 0 });
    const k = vi.fn().mockResolvedValue(res(200, { success: true }, { 'x-idem': 'replayed' }));
    vi.stubGlobal('fetch', k);
    await postAction('leaders-api', { ...body, id: 'r2' }, { sleep: async () => {} });
    expect(bodies(k)[0].idem).toBe(bodies(h)[0].idem);
  });
  it('الدخول بلا «تعذّر التأكد»: خطأ الشبكة فيه برسالة الشبكة، وكتابة البيانات تبقى «تعذّر التأكد»', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')));
    for (const [fn, action] of [['leaders-api', 'auth.start'], ['leaders-api', 'auth.verify'], ['leaders-api', 'passkey.auth-options'], ['leaders-api', 'xp.auth-verify'], ['admin-api', 'login-send'], ['admin-api', 'login-verify']]) {
      const e = await postAction(fn, { action }, { sleep: async () => {} }).catch((x) => x);
      expect(e.uncertain, action).toBe(false);
      expect(netMessage(e), action).toBe('تعذّر الاتصال، تحقّق من الشبكة وحاول مرة أخرى');
      expect(netMessage(e, 'خطأ في الاتصال بالخادم'), action).toBe('خطأ في الاتصال بالخادم');
    }
    const e = await postAction('admin-api', { action: 'update-reg', token: 't' }, { sleep: async () => {} }).catch((x) => x);
    expect(e.uncertain).toBe(true);
  });
  it('بلا اتصال: رسالة «لا اتصال بالإنترنت»', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')));
    const e = await postAction('leaders-api', { action: 'me' }).catch((x) => x);
    expect(e.offline).toBe(true);
    expect(netMessage(e)).toBe('لا اتصال بالإنترنت، تحقّق من اتصالك وحاول مرة أخرى');
  });
});
