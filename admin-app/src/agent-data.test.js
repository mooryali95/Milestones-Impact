// موحّد ردود شاشة المساعد (agent-data.js) على أشكال الإنتاج التي لا تتوقعها الشاشة، وإعادة تحميل ملف القسم المحذوف بعد النشر
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normConversations, normKeySet, normRun, normRunDetail, normRuns, normState, normStep, normTranscript, normUsage, num, text } from './agent-data.js';
import { _resetReloadFlag, isChunkError, reloadOnce, retryImport } from './lazy-retry.js';
import { gateText, runSummary, spendSummary, stateSummary } from './agent-admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe('agent-data: الفشل يبقى فشلًا بشكل واحد', () => {
  it('null وغير الكائن وبلا success ورد 5xx نصي', () => {
    for (const bad of [null, undefined, 'نص', 42, [], {}, { success: 'true' }]) {
      for (const f of [normState, normUsage, normConversations, normTranscript, normRuns, normRunDetail, normStep, normKeySet]) {
        const r = f(bad);
        expect(r.success).toBe(false);
        expect(typeof r.message).toBe('string');
      }
    }
  });
  it('رمز الفشل ورقم التشغيل يبقيان (eval_running، not_migrated، busy)', () => {
    expect(normState({ success: false, code: 'not_migrated' }).code).toBe('not_migrated');
    expect(normStep({ success: false, code: 'eval_running', run_id: 'r1', message: 'جارٍ' })).toMatchObject({ code: 'eval_running', run_id: 'r1', message: 'جارٍ' });
  });
  it('num وtext: الغائب صفر أو فراغ، والكائن نص لا يُرسم بنفسه', () => {
    expect(num(null)).toBe(0); expect(num('12')).toBe(12); expect(num('x', null)).toBe(null); expect(num(true)).toBe(0);
    expect(text({ a: 1 })).toBe('{"a":1}'); expect(text(null)).toBe(''); expect(text(5)).toBe('5');
  });
});

describe('agent-data: أشكال الإنتاج', () => {
  const state = normState({
    success: true, ready: true, enabled: false, model: { id: 'x' }, cap_cents: null, versions: null, key: null, gate: null, total_cases: '60',
    latest_run: { id: 'r-running', status: 'running', finished_at: null, eval_total: 0, done_cases: 0 }, companion_off: null,
  });
  it('الحالة: النسخ والمفتاح والبوابة كائنات دائمًا، والنموذج نص', () => {
    expect(state.versions.fingerprint).toBe('');
    expect(state.key.source).toBe(null);
    expect(state.gate).toEqual({ ok: false, run_id: null, reason: null, run: null });
    expect(state.model).toBe('{"id":"x"}');
    expect(state.cap_cents).toBe(0);
    expect(state.total_cases).toBe(60);
    expect(state.companion_off).toBe(null);
    expect(() => [stateSummary(state), gateText(state), runSummary(state.latest_run)]).not.toThrow();
    expect(runSummary(state.latest_run).text).toMatch(/جارٍ/);
  });
  it('تشغيل قديم بلا repeats وبلا max_micros، ومتوقف بلا started_at', () => {
    expect(normRun({ id: 'old', status: 'passed' })).toMatchObject({ repeats: 1, max_micros: 0, started_at: null, finished_at: null, stop_reason: null });
    expect(normRun({ id: 's', status: 'stopped', stop_reason: 'cancelled', repeats: 3 }).repeats).toBe(3);
    expect(normRun(null)).toBe(null);
    expect(normRuns({ success: true, runs: [null, { id: 'a' }, 'x'] }).runs.map((r) => r.id)).toEqual(['a']);
    expect(normRuns({ success: true }).runs).toEqual([]);
  });
  it('الإنفاق: سلسلة غائبة وذاكرة غائبة', () => {
    const u = normUsage({ success: true, today: null });
    expect(u.series).toEqual([]);
    expect(u.cache).toEqual({ read_tokens: null, saved_micros: null, hit_ratio: null });
    expect(u.today).toEqual({ day: '', spent_micros: 0, cap_micros: 0, calls: 0 });
    expect(() => spendSummary(u)).not.toThrow();
    expect(normUsage({ success: true, series: [{ day: '2026-11-16', micros: null }, null] }).series).toEqual([{ day: '2026-11-16', micros: 0, calls: 0, eval_micros: 0 }]);
  });
  it('المحادثات: صف بتواصل بلا اسم ولا بريد، وصف بلا معرّف قصير ولا تاريخ', () => {
    const c = normConversations({ success: true, rows: [{ id: 'abcdef1234', contact: true, name: null, email: null, locale: null, product: null, rating: null, created_at: null }], total: null, per_page: 0 });
    expect(c.rows[0]).toMatchObject({ short_id: 'abcdef12', name: 'بلا اسم', email: '', locale: '', product: '', rating: null, created_at: null });
    expect(c.per_page).toBe(1);
    expect(c.total).toBe(1);
    expect(normConversations({ success: true }).rows).toEqual([]);
  });
  it('النص: رسائل غائبة، ورموز غائبة، وجسم null', () => {
    expect(normTranscript({ success: true }).messages).toEqual([]);
    const t = normTranscript({ success: true, messages: [{ role: 'agent', body: null, tokens: null }, { role: 'agent', tokens: { input: '5' } }] });
    expect(t.messages[0]).toMatchObject({ body: '', tokens: null });
    expect(t.messages[1].tokens).toEqual({ input: 5, cache_read: 0, cache_write: 0, output: 0 });
  });
  it('تفاصيل التشغيل: أسباب null، وحالة محذوفة برسالة null، ونتائج غائبة', () => {
    const d = normRunDetail({ success: true, run: null, results: [{ case_id: 'gone', pass: false, reasons: null, message: null, reply: null }, { case_id: 'e01', pass: true, reasons: ['x', null, { k: 1 }] }] });
    expect(d.results[0]).toMatchObject({ reasons: [], message: '', reply: '' });
    expect(d.results[1].reasons).toEqual(['x', '{"k":1}']);
    expect(normRunDetail({ success: true }).results).toEqual([]);
  });
  it('حفظ المفتاح بلا key في الرد', () => {
    expect(normKeySet({ success: true }).key.last4).toBe(null);
  });
});

describe('lazy-retry: ملف القسم بعد النشر', () => {
  const chunkErr = new TypeError('Failed to fetch dynamically imported module: https://admin.sunkvalue.com/assets/Agent-CObvkZXe.js');
  it('يميز خطأ الملف عن غيره', () => {
    expect(isChunkError(chunkErr)).toBe(true);
    expect(isChunkError(new TypeError("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'"))).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new TypeError("Cannot read properties of null (reading 'join')"))).toBe(false);
  });
  it('محاولة ثانية تنجح بلا إعادة تحميل', async () => {
    const load = vi.fn().mockRejectedValueOnce(chunkErr).mockResolvedValueOnce({ default: 'ok' });
    const reloadPage = vi.fn(() => true);
    expect(await retryImport(load, { reloadPage })).toEqual({ default: 'ok' });
    expect(reloadPage).not.toHaveBeenCalled();
  });
  it('فشل المحاولتين يعيد تحميل الصفحة مرة، وإعادة قريبة سابقة لا تعيدها فيُرمى الخطأ', async () => {
    _resetReloadFlag();
    const storage = memStorage();
    const reload = vi.fn();
    const load = () => Promise.reject(chunkErr);
    const pending = retryImport(load, { reloadPage: () => reloadOnce({ storage, reload, now: 1000 }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await Promise.race([pending.then(() => 'resolved'), new Promise((r) => setTimeout(() => r('pending'), 10))])).toBe('pending');
    await expect(retryImport(load, { reloadPage: () => reloadOnce({ storage, reload, now: 20_000 }) })).rejects.toBe(chunkErr);
    expect(reload).toHaveBeenCalledTimes(1);
    _resetReloadFlag(); // صفحة جديدة بعد إعادة التحميل
    expect(reloadOnce({ storage, reload, now: 1000 + 61_000 })).toBe(true);
  });
  it('مخزن الجلسة ممنوع أو ممتلئ: علامة الرابط تمنع الحلقة، ولا إعادة ثانية في الصفحة نفسها', () => {
    const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
    const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
    for (const storage of [null, blocked, full]) {
      _resetReloadFlag();
      const reload = vi.fn();
      const navigate = vi.fn();
      const location = { href: 'https://admin.sunkvalue.com/?x=1#/leaders/agent' };
      expect(reloadOnce({ storage, reload, navigate, location, now: 5000 })).toBe(true);
      expect(reload).not.toHaveBeenCalled();
      const next = new URL(navigate.mock.calls[0][0]);
      expect(next.searchParams.get('mi_reload')).toBe('5000');
      expect(next.searchParams.get('x')).toBe('1');
      expect(next.hash).toBe('#/leaders/agent');
      // في الصفحة نفسها: لا إعادة ثانية
      expect(reloadOnce({ storage, reload, navigate, location, now: 5001 })).toBe(false);
      // بعد التحميل بالعلامة، والفشل نفسه: لا حلقة
      _resetReloadFlag();
      expect(reloadOnce({ storage, reload, navigate, location: { href: next.toString() }, now: 30_000 })).toBe(false);
      expect(navigate).toHaveBeenCalledTimes(1);
      // بعد مرور الدقيقة تُسمح إعادة واحدة أخرى
      expect(reloadOnce({ storage, reload, navigate, location: { href: next.toString() }, now: 70_000 })).toBe(true);
    }
    _resetReloadFlag();
    expect(reloadOnce({ storage: null, reload: vi.fn(), navigate: vi.fn(), location: null, now: 1 })).toBe(false);
  });
  it('خطأ غير خطأ الملف يُرمى بلا محاولة ثانية', async () => {
    const err = new Error('boom');
    const load = vi.fn().mockRejectedValue(err);
    await expect(retryImport(load, { reloadPage: () => true })).rejects.toBe(err);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('كل الأقسام الكسولة في اللوحة تمر بـ lazyRetry، والتحميل المسبق مستعاد في main.jsx', () => {
    for (const f of ['App.jsx', 'screens/Leaders.jsx']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/\blazy\(/);
      expect(src, f).toMatch(/lazyRetry\(\(\) => import\(/);
    }
    expect(readFileSync(join(__dirname, 'main.jsx'), 'utf8')).toMatch(/installPreloadRecovery\(\)/);
  });
  it('شاشة المساعد تقرأ كل رد عبر موحّده', () => {
    const src = readFileSync(join(__dirname, 'screens/Agent.jsx'), 'utf8');
    expect(src.match(/\bL\('admin\./g) || []).toEqual([]);
    for (const n of ['normState', 'normUsage', 'normConversations', 'normTranscript', 'normRuns', 'normRunDetail', 'normStep', 'normKeySet']) expect(src).toContain(n);
  });
  it('لا شرطة طويلة ولا متوسطة', () => {
    for (const f of ['agent-data.js', 'lazy-retry.js', 'ui.jsx', 'agent-data.test.js']) expect(/[\u2013\u2014]/.test(readFileSync(join(__dirname, f), 'utf8')), f).toBe(false);
  });
});
