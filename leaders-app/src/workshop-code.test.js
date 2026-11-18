// الأرقام الستة والماسح داخل التطبيق وعرض الخبير (W2، تصور الحضور 2026-11-18 ب5.5): اشتقاق الأرقام في logic.js، والترحيل
// 20261118120000 على PGlite، والماسح بكاشف المتصفح أو بالبديل المستضاف ذاتيًا حين يغيب (scanner.js)، وإذن الكاميرا في الرؤوس،
// وأماكن الواجهة: «سجّل حضوري» يفتح اللوح، وشاشة الرمز مشتركة بين الإدارة وبوابة الخبير
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { matchQrCode, qrCode, qrToken, qrWindow, QR_CODE_DIGITS, QR_WINDOW } from '../../supabase/functions/leaders-api/logic.js';
import { ATTEND_METHOD_AR } from '../../supabase/functions/leaders-api/labels.js';
import { MIGRATION_GATES, MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';
import { CAMERA_AR, makeDetector, openCamera, stopStream, tokenFromScan } from './scanner.js';
import { codeGroups } from '../../shared/ui/PresenterQr.jsx';
import { encodeQR } from '../vendor/paulmillr-qr/index.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SID = '00000000-0000-4000-8000-000000000001';
const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-11-20T08:00:10Z');

describe('الأرقام الستة (logic.js)', () => {
  it('ستة أرقام من التوقيع نفسه والنافذة نفسها، فتتغير مع الرمز', async () => {
    expect(QR_CODE_DIGITS).toBe(6);
    const w = qrWindow(NOW);
    const a = await qrCode(SID, SECRET, w);
    expect(a).toMatch(/^\d{6}$/);
    expect(await qrCode(SID, SECRET, w)).toBe(a);
    // أرقام عشر نوافذ متتالية: تتغير (لا قيمة ثابتة)، وبسر آخر غيرها
    const seq = await Promise.all(Array.from({ length: 10 }, (_, i) => qrCode(SID, SECRET, w + i)));
    expect(new Set(seq).size).toBeGreaterThan(5);
    expect(await qrCode(SID, 'x'.repeat(32), w)).not.toBe(a);
    // والرمز والأرقام من النافذة نفسها
    expect((await qrToken(SID, SECRET, w)).split('.')[1]).toBe(String(w));
  });
  it('تُقبل في النافذة الحالية والسابقة كالرمز، وتُرد بعدهما وبغير ستة أرقام', async () => {
    const w = qrWindow(NOW);
    expect(await matchQrCode(await qrCode(SID, SECRET, w), SID, SECRET, NOW)).toBe(w);
    const prev = await qrCode(SID, SECRET, w - 1);
    expect(await matchQrCode(prev, SID, SECRET, NOW)).not.toBeNull();
    expect(await matchQrCode(prev, SID, SECRET, NOW + 2 * QR_WINDOW * 1000)).toBeNull();
    for (const bad of ['', '12345', '1234567', 'abcdef', null]) expect(await matchQrCode(bad, SID, SECRET, NOW)).toBeNull();
    expect(await matchQrCode('123456', SID, '', NOW)).toBeNull();
  });
  it('تُعرض مجموعتين من ثلاثة على شاشة القاعة', () => {
    expect(codeGroups('012345')).toBe('012 345');
    expect(codeGroups('12345')).toBe('');
  });
});

const MIG = read('supabase/migrations/20261118120000_leaders_workshop_code_method.sql');
describe('ترحيل طريقة code', () => {
  it('متسامح بوسمه في البوابة، ومسجّل في القائمة، وطريقة code لها اسمها العربي', () => {
    expect(MIG).toMatch(/^-- deploy-gate: tolerant /m);
    expect(MIGRATIONS).toContain('20261118120000_leaders_workshop_code_method');
    expect(MIGRATION_GATES['20261118120000_leaders_workshop_code_method'][0]).toBe('tolerant');
    expect(ATTEND_METHOD_AR.code).toBe('الأرقام الستة');
    expect(read('supabase/schema/baseline.sql')).toMatch(/workshop_attendance_method_check CHECK \(\(method = ANY \(ARRAY\[[^\]]*'code'::text/);
  });
  it('يُطبَّق مرتين، ويقبل code ويبقي القيم القائمة ويرد غيرها', async () => {
    const d = new PGlite();
    await d.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.workshop_attendance (session_id uuid, participant_id uuid, method text,
        constraint workshop_attendance_method_check check (method = any (array['qr', 'manual', 'join', 'hall', 'remote'])));`);
    await expect(d.exec(`insert into leaders.workshop_attendance values (gen_random_uuid(), gen_random_uuid(), 'code')`)).rejects.toThrow();
    await d.exec(MIG);
    await d.exec(MIG);
    for (const m of ['qr', 'manual', 'join', 'hall', 'remote', 'code']) await d.exec(`insert into leaders.workshop_attendance values (gen_random_uuid(), gen_random_uuid(), '${m}')`);
    await expect(d.exec(`insert into leaders.workshop_attendance values (gen_random_uuid(), gen_random_uuid(), 'gps')`)).rejects.toThrow();
    expect((await d.query('select name from leaders.schema_migrations')).rows.map((r) => r.name)).toEqual(['20261118120000_leaders_workshop_code_method']);
  });
});

// صورة رمز QR بالبكسلات كما يرسمها الفيديو، من المولّد المضمّن نفسه
function qrImage(text, scale = 6, border = 4) {
  const m = encodeQR(text, 'raw', { ecc: 'medium' });
  const n = m.length, size = (n + border * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!m[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + border) * scale + dy) * size + (x + border) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { width: size, height: size, data };
}

describe('الماسح داخل التطبيق (scanner.js)', () => {
  it('يقرأ رابط شاشة القاعة أو الرمز نفسه، ويرد ما سواهما', async () => {
    const t = await qrToken(SID, SECRET, qrWindow(NOW));
    expect(tokenFromScan(`https://leaders.sunkvalue.com/?checkin=${encodeURIComponent(t)}`)).toBe(t);
    expect(tokenFromScan(t)).toBe(t);
    for (const bad of ['', 'https://example.com/?x=1', 'https://leaders.sunkvalue.com/?checkin=abc', 'نص عادي']) expect(tokenFromScan(bad)).toBeNull();
  });
  it('كاشف المتصفح أولًا حين يدعم qr_code', async () => {
    const detect = vi.fn(async () => [{ rawValue: 'hello' }]);
    class BarcodeDetector { static async getSupportedFormats() { return ['qr_code', 'ean_13']; } detect(src) { return detect(src); } }
    const det = await makeDetector({ BarcodeDetector, document: globalThis.document });
    expect(det.kind).toBe('native');
    expect(await det.detect({})).toBe('hello');
  });
  it('بلا BarcodeDetector (أو بلا qr_code): البديل المستضاف ذاتيًا بلا WASM، ويفك رمز الحضور فعلًا', async () => {
    const t = await qrToken(SID, SECRET, qrWindow(NOW));
    const url = `https://leaders.sunkvalue.com/?checkin=${encodeURIComponent(t)}`;
    const img = qrImage(url);
    // لوحة رسم مُحاكاة: تعيد صورة الرمز كما لو رُسم إطار الفيديو
    const ctx = { drawImage: vi.fn(), getImageData: () => img };
    const doc = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
    const det = await makeDetector({ document: doc });
    expect(det.kind).toBe('js');
    const text = await det.detect({ videoWidth: img.width, videoHeight: img.height });
    expect(text).toBe(url);
    expect(tokenFromScan(text)).toBe(t);
    class NoQr { static async getSupportedFormats() { return ['ean_13']; } }
    expect((await makeDetector({ BarcodeDetector: NoQr, document: doc })).kind).toBe('js');
    // إطار بلا رمز: لا شيء، بلا خطأ
    const blank = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255) };
    const det2 = await makeDetector({ document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => blank }) }) } });
    expect(await det2.detect({ videoWidth: 64, videoHeight: 64 })).toBeNull();
  });
  it('البديل JavaScript خالص: لا WASM ولا شبكة ولا eval، وترخيصه MIT مذكور', () => {
    for (const f of ['index.js', 'decode.js']) {
      const src = read(`leaders-app/vendor/paulmillr-qr/${f}`);
      expect(src, f).not.toMatch(/WebAssembly|fetch\(|XMLHttpRequest|new Function|\beval\(|importScripts|\bimport\(/);
    }
    expect(read('leaders-app/vendor/paulmillr-qr/LICENSE-MIT')).toMatch(/MIT License/);
    expect(read('leaders-app/vendor/paulmillr-qr/README.md')).toMatch(/MIT/);
    // يُحمَّل عند الطلب وحده: استيراد ديناميكي في الماسح، ولا استيراد ثابت في التطبيق
    expect(read('leaders-app/src/scanner.js')).toMatch(/await import\('\.\.\/vendor\/paulmillr-qr\/decode\.js'\)/);
  });
  it('الكاميرا: الخلفية بلا صوت، والرفض يُقال بالعربية، والمسارات تُطفأ', async () => {
    const getUserMedia = vi.fn(async () => 'stream');
    expect(await openCamera({ mediaDevices: { getUserMedia } })).toBe('stream');
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    await expect(openCamera({})).rejects.toMatchObject({ reason: 'unsupported' });
    const deny = { mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } };
    await expect(openCamera(deny)).rejects.toMatchObject({ reason: 'denied' });
    for (const k of ['unsupported', 'denied', 'missing', 'failed']) expect(CAMERA_AR[k]).toMatch(/[؀-ۿ]/);
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopStream({ getTracks: () => tracks });
    for (const t of tracks) expect(t.stop).toHaveBeenCalled();
    stopStream(null);
  });
  it('إذن الكاميرا للتطبيق نفسه وحده، وبقية الرؤوس كما هي', () => {
    const h = read('leaders-app/public/_headers');
    expect(h).toMatch(/Permissions-Policy: geolocation=\(\), microphone=\(\), camera=\(self\), publickey-credentials-get=\(self\), publickey-credentials-create=\(self\)/);
    expect(h).toMatch(/script-src 'self' /);
    expect(h).not.toMatch(/wasm-unsafe-eval/);
  });
});

describe('أماكن الواجهة', () => {
  it('«سجّل حضوري» يفتح اللوح بالماسح والأرقام والبديل اليدوي، والكاميرا تُطفأ عند الإغلاق', () => {
    const a = read('leaders-app/src/screens/Activities.jsx');
    expect(a).toMatch(/<CheckinSheet session=\{session\}/);
    const s = read('leaders-app/src/screens/CheckinSheet.jsx');
    expect(s).toMatch(/call\('workshop\.checkin', \{ t \}\)/);
    expect(s).toMatch(/call\('workshop\.checkin', \{ code: clean \}\)/);
    expect(s).toMatch(/stopStream\(stream\)/);
    expect(s).toMatch(/اطلب من المدرب تسجيل حضورك/);
    expect(s).toMatch(/inputMode="numeric"/);
  });
  it('شاشة الرمز واحدة للإدارة وبوابة الخبير، والأرقام فيها LTR داخل bdi', () => {
    const p = read('shared/ui/PresenterQr.jsx');
    expect(p).toMatch(/<bdi dir="ltr" className="pq-digits">/);
    expect(read('admin-app/src/screens/Activities.jsx')).toMatch(/<PresenterQr loadQr=\{loadQr\}/);
    const x = read('leaders-app/src/screens/ExpertPortal.jsx');
    expect(x).toMatch(/xpCall\('xp\.workshop-qr'/);
    expect(x).toMatch(/xpCall\('xp\.workshop-attendance'/);
    // المتوقع ومن لم يحضر من workshopAttendance نفسها، لا قائمة ثانية
    const v = read('supabase/functions/leaders-api/activities.ts');
    expect(v).toMatch(/export async function expertWorkshopAttendance[\s\S]{0,200}await workshopAttendance\(\{ id: b\.id \}\)/);
    expect(v).toMatch(/export async function expertWorkshopQr[\s\S]{0,120}return workshopQr\(\{ id: b\.id \}\)/);
  });
});
