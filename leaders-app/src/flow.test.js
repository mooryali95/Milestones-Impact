// حراس تدفق المشارك (المرحلة ج): رموز الخادم التجارية لا تضيع، وفاصل القاعة يتبع حالها،
// والإقلاع لا يُسقط الجلسة، وحاجز الأخطاء يلف التطبيق، والمسودات لا تضيع.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from './api.js';
import { POLL_FAST_MS, POLL_SLOW_MS, pollPeriod } from './hallPoll.js';

const read = (p) => readFileSync(join(__dirname, p), 'utf8');
const res = (status, body) => ({ status, json: async () => { if (body === undefined) throw new Error('not json'); return body; } });

describe('قراءة رد الخادم', () => {
  it('503 من الدالة نفسها بجسمها لا تُستبدل بـ«مشغول»', async () => {
    const r = await parse(res(503, { success: false, code: 'no_instrument', message: 'القياس غير متاح' }));
    expect(r.code).toBe('no_instrument');
  });
  it('503 من البوابة بلا جسم أو بجسم غريب = مشغول', async () => {
    expect((await parse(res(503))).code).toBe('busy');
    expect((await parse(res(502, { message: 'Service is temporarily unavailable' }))).code).toBe('busy');
  });
  it('الردود العادية تمر كما هي', async () => {
    expect((await parse(res(200, { success: true, x: 1 }))).x).toBe(1);
    expect((await parse(res(401, { message: 'Invalid JWT' }))).message).toBe('Invalid JWT');
  });
});

describe('فاصل استطلاع القاعة', () => {
  it('سريع أثناء التقسيم والجولة والكشف، وبطيء في الانتظار وقبل الفتح', () => {
    expect(pollPeriod({ session: { stage: 'round' } })).toBe(POLL_FAST_MS);
    expect(pollPeriod({ session: { stage: 'reveal' } })).toBe(POLL_FAST_MS);
    expect(pollPeriod({ session: { stage: 'split' } })).toBe(POLL_FAST_MS);
    expect(pollPeriod({ session: { stage: 'train' } })).toBe(POLL_SLOW_MS);
    expect(pollPeriod({ session: null })).toBe(POLL_SLOW_MS);
    expect(pollPeriod(null)).toBe(POLL_SLOW_MS);
    expect(POLL_FAST_MS).toBeLessThan(POLL_SLOW_MS);
  });
});

describe('حراس المصدر', () => {
  it('الإقلاع يعرض الخطأ بإعادة محاولة ولا يُسقط الجلسة', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/setBootError\(res\.message/);
    expect(app).toMatch(/<ErrorBox message=\{bootError\} onRetry/);
    expect(app).not.toMatch(/stageOpen\(me, 'impact'\)/);
    expect(app).toMatch(/impactOpen\(me\)/);
  });
  it('حاجز الأخطاء يلف التطبيق ويُعاد التحميل عند فشل استيراد قطعة بعد النشر', () => {
    const main = read('main.jsx');
    expect(main).toMatch(/<ErrorBoundary><App \/><\/ErrorBoundary>/);
    expect(main).toMatch(/vite:preloadError/);
  });
  it('القاعة لا تدور بلا نهاية عند فشل أول تحميل', () => {
    const hall = read('screens/Hall.jsx');
    expect(hall).toMatch(/if \(!v\) return[^\n]*ErrorBox/);
    expect(hall).toMatch(/pollPeriod\(v\)/);
  });
  it('النماذج والملخص والمتابعة تحرس مسوداتها', () => {
    expect(read('screens/Models.jsx')).toMatch(/useUnsavedGuard\(dirty && !!auto/);
    expect(read('screens/Capstone.jsx')).toMatch(/useUnsavedGuard\(summaryDirty/);
    expect(read('screens/Tracking.jsx')).toMatch(/useUnsavedGuard\(open\)/);
  });
  it('حالات العمل في الخادم ليست 503', () => {
    const api = join(__dirname, '../../supabase/functions/leaders-api');
    for (const f of ['participant.ts', 'impact.ts', 'payments.ts']) {
      const src = readFileSync(join(api, f), 'utf8');
      expect(src).not.toMatch(/503, '(no_instrument|pay_off)'/);
    }
  });
});
