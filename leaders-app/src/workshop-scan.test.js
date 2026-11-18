// حضور لا يتعثر (W1، تصور الحضور 2026-11-18): إيصال المسح في logic.js، والترحيل 20261118100000 على PGlite، وحفظ الإيصال
// في الجهاز وسطر شاشة الدخول (checkin.js)، وموضع شاشة الحضور قبل تجديد الموافقة (App.jsx)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkinOpen, parseScanReceipt, qrToken, SCAN_RECEIPT_MINUTES, scanReceipt, scanReceiptExpiry, verifyScanReceipt } from '../../supabase/functions/leaders-api/logic.js';
import { checkinKeep, receiptFor, RETRYABLE, sentence, signInNote } from './checkin.js';

const SID = '00000000-0000-4000-8000-000000000001', RID = '00000000-0000-4000-8000-0000000000aa';
const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-11-20T08:00:00Z');
const session = { starts_at: '2026-11-20T07:00:00Z', ends_at: '2026-11-20T09:00:00Z', active: true };

describe('إيصال المسح (logic.js)', () => {
  it('ربع ساعة من المسح، ولا يتجاوز إغلاق نافذة الحضور', () => {
    expect(SCAN_RECEIPT_MINUTES).toBe(15);
    expect(scanReceiptExpiry(session, NOW) * 1000).toBe(NOW + 15 * 6e4);
    // قبل الإغلاق (9:30) بخمس دقائق: الإيصال ينتهي بالإغلاق
    const late = Date.parse('2026-11-20T09:25:00Z');
    expect(scanReceiptExpiry(session, late) * 1000).toBe(Date.parse('2026-11-20T09:30:00Z'));
    expect(checkinOpen(session, scanReceiptExpiry(session, late) * 1000)).toBe(true);
  });
  it('موقّع بسر الجلسة: يُقبل قبل انتهائه، ويُرد منتهيًا بعده، ولا يصح بسر آخر ولا بتعديل حرف', async () => {
    const exp = scanReceiptExpiry(session, NOW);
    const r = await scanReceipt(SID, RID, exp, SECRET);
    expect(parseScanReceipt(r)).toEqual({ sessionId: SID, id: RID, exp, sig: r.split('.').at(-1) });
    expect(await verifyScanReceipt(r, SECRET, NOW + 5 * 6e4)).toEqual({ valid: true, expired: false });
    expect(await verifyScanReceipt(r, SECRET, NOW + 16 * 6e4)).toEqual({ valid: true, expired: true });
    expect((await verifyScanReceipt(r, 'x'.repeat(32), NOW)).valid).toBe(false);
    // انتهاء أطول بلا توقيعه
    expect((await verifyScanReceipt(r.replace(`.${exp}.`, `.${exp + 3600}.`), SECRET, NOW)).valid).toBe(false);
    // إيصال لجلسة أخرى بالتوقيع نفسه
    expect((await verifyScanReceipt(r.replace(SID, RID), SECRET, NOW)).valid).toBe(false);
  });
  it('لا يلتبس برمز QR: الرمز ليس إيصالًا، والإيصال ليس رمزًا، ولا بيانات شخصية فيه', async () => {
    const qr = await qrToken(SID, SECRET);
    expect(parseScanReceipt(qr)).toBeNull();
    const r = await scanReceipt(SID, RID, scanReceiptExpiry(session, NOW), SECRET);
    expect(r).toMatch(/^r1\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d{10}\.[0-9a-f]{32}$/);
  });
});

const dir = join(__dirname, '../../supabase/migrations');
const MIG = readFileSync(join(dir, '20261118100000_leaders_workshop_scan_receipts.sql'), 'utf8');
describe('ترحيل إيصالات المسح', () => {
  it('متسامح بوسم البوابة، ومغلق أمام المتصفح كبقية جداول الحضور', () => {
    expect(MIG).toMatch(/^-- deploy-gate: tolerant /m);
    expect(MIG).toMatch(/enable row level security/);
    expect(MIG).toMatch(/revoke all on leaders\.workshop_scan_receipts from anon, authenticated/);
  });
  it('يُطبَّق مرتين بلا خطأ، والاستهلاك مشارك ووقت معًا، وحذف الجلسة يحذف إيصالاتها', async () => {
    const d = new PGlite();
    await d.exec(`create role anon; create role authenticated; create schema leaders;
      create table leaders.schema_migrations (name text primary key);
      create table leaders.participants (id uuid primary key);
      create table leaders.workshop_sessions (id uuid primary key);
      insert into leaders.participants values ('${RID}'); insert into leaders.workshop_sessions values ('${SID}');`);
    await d.exec(MIG);
    await d.exec(MIG);
    await d.exec(`insert into leaders.workshop_scan_receipts (id, session_id, expires_at) values (gen_random_uuid(), '${SID}', now())`);
    await expect(d.exec(`insert into leaders.workshop_scan_receipts (id, session_id, expires_at, participant_id) values (gen_random_uuid(), '${SID}', now(), '${RID}')`)).rejects.toThrow();
    await expect(d.exec(`insert into leaders.workshop_scan_receipts (id, session_id, expires_at, ip_hash) values (gen_random_uuid(), '${SID}', now(), 'short')`)).rejects.toThrow();
    await d.exec(`delete from leaders.workshop_sessions`);
    expect((await d.query('select count(*)::int n from leaders.workshop_scan_receipts')).rows[0].n).toBe(0);
    expect((await d.query('select name from leaders.schema_migrations')).rows.map((r) => r.name)).toContain('20261118100000_leaders_workshop_scan_receipts');
  });
});

describe('حفظ المسح في الجهاز (checkin.js)', () => {
  const store = new Map();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('الإيصال يبقى حتى انتهائه، والرمز القديم ربع ساعة', () => {
    const exp = new Date(NOW + 15 * 6e4).toISOString();
    checkinKeep.set({ r: 'r1.x', exp, title: 'اليوم الثالث' }, NOW);
    expect(checkinKeep.get(NOW + 14 * 6e4)).toEqual({ r: 'r1.x', exp, title: 'اليوم الثالث' });
    expect(checkinKeep.get(NOW + 16 * 6e4)).toBeNull();
    store.set('mi_checkin', JSON.stringify({ t: 'a.1.b', at: NOW }));
    expect(checkinKeep.get(NOW + 60e3)).toEqual({ t: 'a.1.b', kept: true });
    expect(checkinKeep.get(NOW + 20 * 6e4)).toBeNull();
    checkinKeep.clear();
    expect(store.size).toBe(0);
  });
  it('receiptFor: إيصال، أو رفض نهائي يُعرض، أو الرمز نفسه احتياطًا قبل الترحيل وعند انقطاع الشبكة', async () => {
    const reply = (r) => async (action, body) => { expect([action, body]).toEqual(['workshop.scan', { t: 'tok' }]); return r; };
    expect(await receiptFor('tok', reply({ success: true, receipt: 'r1.y', expires_at: 'E', session: { title: 'اليوم 3' } }))).toEqual({ r: 'r1.y', exp: 'E', title: 'اليوم 3' });
    for (const code of ['qr_expired', 'closed', 'method', 'rate']) expect(await receiptFor('tok', reply({ success: false, code, message: 'سبب.' }))).toEqual({ error: 'سبب.', code });
    for (const code of ['not_migrated', 'network', 'internal']) expect(await receiptFor('tok', reply({ success: false, code, message: 'x' }))).toEqual({ t: 'tok' });
  });
  it('سطر شاشة الدخول يسمي الجلسة والمهلة، ولا مسح ثانيًا', () => {
    const note = signInNote({ r: 'r1', exp: new Date(NOW + 15 * 6e4).toISOString(), title: 'اليوم الثالث' }, NOW);
    expect(note).toBe('حفظنا مسحك لـ«اليوم الثالث». سجّل دخولك خلال 15 دقيقة، ونسجّل حضورك بعده مباشرة دون مسح الرمز مرة أخرى.');
    expect(signInNote({ r: 'r1', exp: new Date(NOW + 30e3).toISOString() }, NOW)).toContain('خلال دقيقة،');
    expect(signInNote({ error: 'انتهت صلاحية الرمز.' })).toContain('انتهت صلاحية الرمز.');
  });
  it('الرفض لحظة المسح جملة مختومة يليها «ادخل لمتابعة رحلتك.» وحده، بلا نصيحة مسح لا تفيد ولا تكرار', () => {
    expect(signInNote({ error: 'انتهت صلاحية الرمز، امسح الرمز المعروض الآن', code: 'qr_expired' })).toBe('انتهت صلاحية الرمز، امسح الرمز المعروض الآن. ادخل لمتابعة رحلتك.');
    for (const [code, m] of [['closed', 'تسجيل الحضور لهذه الجلسة غير متاح الآن'], ['method', 'حضور هذه الجلسة يُوثَّق بطريقة أخرى'], ['undated', 'موعد هذه الجلسة لم يُحدد بعد، فلا يُسجل حضورها الآن']]) {
      const note = signInNote({ error: m, code });
      expect(note).toBe(`${m}. ادخل لمتابعة رحلتك.`);
      expect(note).not.toContain('امسح');
    }
    expect(sentence('سبب')).toBe('سبب.');
    expect(sentence('سبب.')).toBe('سبب.');
    expect(sentence('لماذا؟')).toBe('لماذا؟');
    expect(sentence('')).toBe('');
  });
  it('الإيصال يبقى في الجهاز بعد إخفاق مؤقت فقط، ويُزال بعد الرفض النهائي', () => {
    for (const code of ['network', 'busy', 'internal', 'db_error']) expect(RETRYABLE.has(code)).toBe(true);
    for (const code of ['receipt_invalid', 'receipt_expired', 'receipt_used', 'cohort', 'closed', 'method', 'undated', 'qr_expired']) expect(RETRYABLE.has(code)).toBe(false);
    expect(signInNote(null)).toBe('');
  });
});

describe('موضع الحضور في التطبيق (App.jsx)', () => {
  const app = readFileSync(join(__dirname, 'App.jsx'), 'utf8');
  it('بعد الموافقة الأولى وقبل تجديد الموافقة القابل للتأجيل وقبل بوابات الملف والدفع', () => {
    const at = (re) => app.search(re);
    const first = at(/consentNeed === 'first'/), check = at(/else if \(pendingCheckin\) screen = <CheckIn/), renew = at(/consentNeed === 'renew'/), pay = at(/<Paywall item="assessment"/);
    expect([first < check, check < renew, renew < pay]).toEqual([true, true, true]);
  });
  it('الرمز لا يبقى في الرابط ولا في الجهاز قبل الإيصال، والإيصال وحده يُحفظ', () => {
    expect(app).toMatch(/history\.replaceState\(null, '', '\/'\); return \{ t \};/);
    expect(app).not.toMatch(/checkinKeep\.set\(t\)/);
  });
});
