// صمود الإقلاع (reconnect.js، ش9): ما يُعد عابرًا، والتراجع المتصاعد، والنص، وإعادة الإقلاع عند المؤقت وonline والرجوع
// إلى التبويب، ولا مؤقت بلا اتصال، والتنظيف عند النجاح. وApp.jsx لا يمسح الجلسة بخطأ شبكة ولا ببدء الدخول بحساب آخر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoReboot, isTransient, rebootDelay, reconnectCopy, REBOOT_CAP_MS } from './reconnect.js';

afterEach(() => vi.useRealTimers());
const target = () => {
  const ls = {};
  return {
    ls,
    addEventListener: (k, f) => { (ls[k] ||= new Set()).add(f); },
    removeEventListener: (k, f) => { ls[k]?.delete(f); },
    fire: (k) => { for (const f of ls[k] || []) f(); },
  };
};

describe('صمود الإقلاع', () => {
  it('العابر: الشبكة والخادم المشغول والخطأ الداخلي، لا الجلسة ولا الرفض', () => {
    for (const code of ['network', 'busy', 'internal', 'db_error']) expect(isTransient({ success: false, code })).toBe(true);
    for (const code of ['session', 'suspended', 'forbidden', undefined]) expect(isTransient({ success: false, code })).toBe(false);
    expect(isTransient({ success: true, code: 'network' })).toBe(false);
  });
  it('التراجع يتضاعف من 3 ثوانٍ حتى دقيقة، ولا ينزل عن نصف سقفه', () => {
    expect(rebootDelay(0, () => 0)).toBe(1500);
    expect(rebootDelay(0, () => 1)).toBe(3000);
    expect(rebootDelay(2, () => 0)).toBe(6000);
    expect(rebootDelay(20, () => 1)).toBe(REBOOT_CAP_MS);
    expect(rebootDelay(20, () => 0)).toBe(REBOOT_CAP_MS / 2);
  });
  it('النص: «لا اتصال بالإنترنت» بلا اتصال، و«الخدمة غير متاحة لحظيًا» غير ذلك', () => {
    expect(reconnectCopy(false).title).toBe('لا اتصال بالإنترنت');
    expect(reconnectCopy(true)).toEqual({ title: 'جارٍ إعادة الاتصال…', line: 'الخدمة غير متاحة لحظيًا، نعيد المحاولة تلقائيًا.' });
    // خطأ شبكة والجهاز يقول إنه متصل (واي فاي بلا إنترنت): لا يُلام الخادم
    expect(reconnectCopy(true, 'network')).toEqual({ title: 'جارٍ إعادة الاتصال…', line: 'تعذّر الوصول إلى الخدمة، تحقّق من الشبكة. نعيد المحاولة تلقائيًا.' });
    for (const code of ['busy', 'internal', 'db_error']) expect(reconnectCopy(true, code).line).toBe('الخدمة غير متاحة لحظيًا، نعيد المحاولة تلقائيًا.');
    expect(reconnectCopy(false, 'network').title).toBe('لا اتصال بالإنترنت');
  });
  it('يعيد الإقلاع بعد التراجع، وفورًا عند online وعند الرجوع إلى التبويب، ومرة واحدة في وقت واحد', async () => {
    vi.useFakeTimers();
    const win = { ...target(), navigator: { onLine: true } };
    const doc = { ...target(), visibilityState: 'visible' };
    let release;
    const reboot = vi.fn(() => new Promise((ok) => { release = ok; }));
    const stop = autoReboot({ active: true, tries: 0, reboot, win, doc, random: () => 0 });
    await vi.advanceTimersByTimeAsync(1499);
    expect(reboot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reboot).toHaveBeenCalledTimes(1);
    // أثناء الإقلاع الجاري: online لا يبدأ إقلاعًا ثانيًا
    win.fire('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(reboot).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    win.fire('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(reboot).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    doc.fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(reboot).toHaveBeenCalledTimes(3);
    stop();
    expect(win.ls.online.size).toBe(0);
    expect(doc.ls.visibilitychange.size).toBe(0);
  });
  it('بلا اتصال: لا مؤقت، ينتظر online. وغير النشط لا يفعل شيئًا', async () => {
    vi.useFakeTimers();
    const win = { ...target(), navigator: { onLine: false } };
    const reboot = vi.fn(async () => {});
    const stop = autoReboot({ active: true, tries: 3, reboot, win, doc: target() });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reboot).not.toHaveBeenCalled();
    win.navigator.onLine = true;
    win.fire('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(reboot).toHaveBeenCalledTimes(1);
    stop();
    const none = vi.fn();
    autoReboot({ active: false, tries: 0, reboot: none, win })();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(none).not.toHaveBeenCalled();
  });
  it('App.jsx: «ادخل بحساب آخر» لا يمسح الجلسة، والإخفاق العابر يذهب إلى إعادة الاتصال لا إلى شاشة الخطأ', () => {
    const app = readFileSync(join(__dirname, 'App.jsx'), 'utf8');
    expect(app).not.toMatch(/session\.clear\(\); setBootError/);
    expect(app).toContain("else if (isTransient(res)) { setReconnectCode(res.code); setReconnect(true);");
    expect(app).toContain('onOther={startSwitch}');
    // جيل الإقلاع: ما بدأ قبل الدخول بحساب آخر لا يطبّق نتيجته (e2e leaders-boot-resilience يثبت السباق نفسه)
    expect(app).toContain('const startSwitch = () => { bootGen.current += 1; setSwitching(true); };');
    expect(app.match(/if \(stale\(\)\) return;/g)?.length).toBe(3);
  });
});
