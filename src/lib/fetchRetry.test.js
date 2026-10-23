import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRetry } from './api';

const res = (status) => ({ status, json: async () => ({}) });
afterEach(() => vi.unstubAllGlobals());

describe('fetchRetry', () => {
  it('يعيد المحاولة عند 503 ثم يعيد الرد الناجح', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, { delay: 1 })).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('لا يعيد عند أخطاء التطبيق مثل 400 و401', async () => {
    const f = vi.fn().mockResolvedValue(res(401));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, { delay: 1 })).status).toBe(401);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('يتوقف بعد آخر محاولة ويعيد الرد المشغول', async () => {
    const f = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, { tries: 3, delay: 1 })).status).toBe(503);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('يعيد بعد انقطاع الشبكة، ويرمي إن استمر', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', f);
    expect((await fetchRetry('u', {}, { delay: 1 })).status).toBe(200);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    await expect(fetchRetry('u', {}, { tries: 2, delay: 1 })).rejects.toThrow('net');
  });
});
