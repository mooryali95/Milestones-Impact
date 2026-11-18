// تصور «تحديث المنصة بلا أثر على المستخدمين»: آخر ملخص رحلة معروف (المرحلة 3 البند 5، last-journey.js)، والرصد من جهة
// العميل (المرحلة 4: telemetry.js، وترويسة x-client-build في postAction، والترحيل 20261118150000 على PGlite)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_JOURNEY_KEY, lastJourney, MAX_BYTES, savedAtAr, sessionTag, summarize } from './last-journey.js';
import { session } from './api.js';
import { _resetTelemetry, BATCH_MAX, failureOf, flush, QUEUE_KEY, QUEUE_MAX, queued, report, scrub } from './telemetry.js';
import { buildState, postAction } from '../../src/lib/api.js';
import { NO_REPLAY, isReadAction } from '../../supabase/functions/_shared/action-kinds.js';
import { CLIENT_EVENT_BODY_CHARS, CLIENT_EVENT_KINDS } from '../../supabase/functions/_shared/client-events.js';
import { POLICY_CHANGES } from '../../supabase/functions/leaders-api/labels.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let store;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
  _resetTelemetry();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); buildState.accepted = false; _resetTelemetry(); });

const me = {
  success: true,
  token: 'tok-should-never-be-stored-000000000000',
  participant: { id: 'p-123', full_name: 'سارة الأحمد', email: 'sara@x.sa' },
  profile: { notes: 'سر' },
  progress: 42.4,
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [{ title_ar: 'بند خاص', answer: 'نص المشارك' }] },
    { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', items: [] },
    { key: 'track-x', title_ar: 'المسار المستمر', phase: 'qualification', status: 'active', lane: 'track' },
    { key: 'impact', title_ar: 'القياس البعدي', phase: 'impact', status: 'locked' },
  ],
  handbook: { chapter: 'نص الكتاب المحمي' },
};
const TOKEN = 'tok-A-0000000000000000000000000000';

describe('آخر ملخص رحلة معروف (last-journey.js)', () => {
  it('يحفظ المراحل وحالها ونسبة الإنجاز وحدها: لا رمز ولا اسم ولا بريد ولا بنود ولا كتيب', () => {
    expect(summarize(me, 1000)).toEqual({ v: 1, at: 1000, progress: 42, stages: [
      { k: 'profile', t: 'الملف الشخصي', p: 'admission', s: 'done' },
      { k: 'training', t: 'التدريب', p: 'qualification', s: 'active' },
      { k: 'impact', t: 'القياس البعدي', p: 'impact', s: 'locked' },
    ] });
    expect(lastJourney.save(me, TOKEN)).toBe(true);
    const raw = store.get(LAST_JOURNEY_KEY);
    for (const s of [TOKEN, me.token, 'سارة', 'sara@x.sa', 'p-123', 'نص المشارك', 'نص الكتاب', 'سر', 'المسار المستمر']) expect(raw).not.toContain(s);
    expect(raw).toContain(sessionTag(TOKEN));
    expect(lastJourney.read(TOKEN).stages).toHaveLength(3);
  });
  it('لجلسته وحدها: رمز آخر لا يقرؤه ويمسحه، وبلا رمز لا شيء', () => {
    lastJourney.save(me, TOKEN);
    expect(lastJourney.read(null)).toBeNull();
    expect(store.has(LAST_JOURNEY_KEY)).toBe(true);
    expect(lastJourney.read('tok-B-other')).toBeNull();
    expect(store.has(LAST_JOURNEY_KEY)).toBe(false);
    expect(sessionTag(TOKEN)).not.toBe(sessionTag('tok-B-other'));
    expect(sessionTag(TOKEN)).toMatch(/^[0-9a-f]{8}$/);
  });
  it('مخطط بنسخة: الأقدم أو التالف يُمسح ولا يُعرض', () => {
    store.set(LAST_JOURNEY_KEY, JSON.stringify({ v: 0, sid: sessionTag(TOKEN), at: 1, progress: 1, stages: [] }));
    expect(lastJourney.read(TOKEN)).toBeNull();
    expect(store.has(LAST_JOURNEY_KEY)).toBe(false);
    store.set(LAST_JOURNEY_KEY, '{not json');
    expect(lastJourney.read(TOKEN)).toBeNull();
    store.set(LAST_JOURNEY_KEY, JSON.stringify({ v: 1, sid: sessionTag(TOKEN), at: 1, progress: 1, stages: [{ k: 'x', t: 'y', p: 'admission', s: 'hacked' }] }));
    expect(lastJourney.read(TOKEN)).toBeNull();
  });
  it('سقف الحجم وعدد المراحل', () => {
    const long = { progress: 5, journey: Array.from({ length: 200 }, (_, i) => ({ key: `s${i}`.repeat(10), title_ar: 'م'.repeat(300), phase: 'qualification', status: 'locked' })) };
    lastJourney.save(long, TOKEN);
    expect(store.get(LAST_JOURNEY_KEY).length).toBeLessThanOrEqual(MAX_BYTES);
    const r = lastJourney.read(TOKEN);
    expect(r.stages.length).toBeGreaterThan(0);
    expect(r.stages.length).toBeLessThanOrEqual(40);
    expect(r.stages[0].t.length).toBe(80);
  });
  it('يُمسح بمسح الجلسة (الخروج وانتهاؤها) وبتغيّر الرمز (دخول بحساب آخر)، ويبقى بإعادة الرمز نفسه', () => {
    session.set(TOKEN);
    lastJourney.save(me, TOKEN);
    session.set(TOKEN);
    expect(lastJourney.read(TOKEN)).not.toBeNull();
    session.set('tok-B-new');
    expect(store.has(LAST_JOURNEY_KEY)).toBe(false);
    lastJourney.save(me, 'tok-B-new');
    session.clear();
    expect(store.has(LAST_JOURNEY_KEY)).toBe(false);
  });
  it('الشاشة: سطر «آخر ما عُرف، للقراءة فقط» ووقته، بلا زر، ويُحفظ بعد إقلاع ناجح وحده', () => {
    const app = read('leaders-app/src/App.jsx');
    expect(app).toContain('آخر ما عُرف، للقراءة فقط · {savedAtAr(summary.at)}');
    const lk = app.slice(app.indexOf('function LastKnown('), app.indexOf('function Reconnecting('));
    expect(lk).not.toMatch(/<button|onClick|href=/);
    expect(app).toMatch(/accept\(res\); lastJourney\.save\(res, session\.get\(\)\); \}/);
    expect(app).toContain('last={lastJourney.read(session.get())}');
    expect(savedAtAr(Date.parse('2026-11-18T07:42:00Z'), Date.parse('2026-11-18T09:00:00Z'))).toBe('اليوم 10:42');
  });
});

describe('تنقية النص وتصنيف الإخفاق (telemetry.js)', () => {
  it('لا بريد ولا رابط باستعلامه ولا سلسلة أرقام ولا معرّف طويل، ويُقص', () => {
    const m = scrub('Failed for sara.x@corp.sa at https://leaders.sunkvalue.com/verify?e=sara%40x.sa&t=abcdef token 0661234567 id eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9xyz');
    expect(m).not.toMatch(/sara|corp\.sa|\?e=|0661234567|eyJhbG/);
    expect(m).toContain('[email]');
    expect(m).toContain('https://leaders.sunkvalue.com/verify');
    expect(m).toContain('#');
    expect(m).toContain('[id]');
    expect(scrub('ab '.repeat(200))).toHaveLength(160);
    expect(scrub('Cannot read properties of undefined (reading \'map\')')).toBe('Cannot read properties of undefined (reading \'map\')');
  });
  it('نوع الإخفاق من الرد: البوابة المشغولة و5xx الدالة وحدهما', () => {
    expect(failureOf(503, { success: false, code: 'busy' })).toBe('busy');
    expect(failureOf(500, { success: false, code: 'internal' })).toBe('5xx');
    expect(failureOf(503, { success: false, code: 'not_migrated' })).toBeNull();
    expect(failureOf(401, { success: false, code: 'session' })).toBeNull();
    expect(failureOf(200, { success: true })).toBeNull();
  });
});

describe('طابور الأحداث وإرساله (telemetry.js)', () => {
  it('الحدث بالحقول المسموحة وحدها، ونص لأخطاء الصفحة وحدها، والمتكرر في دقيقة لا يُضاف', () => {
    const ev = report('TypeError', { act: 'me', tries: 4, message: 'لا يُحفظ' }, Date.parse('2026-11-18T10:00:00Z'));
    expect(Object.keys(ev).sort()).toEqual(['act', 'at', 'build', 'kind', 'tries']);
    expect(ev).toMatchObject({ kind: 'TypeError', act: 'me', tries: 4, build: 'dev' });
    expect(report('TypeError', { act: 'me' }, Date.parse('2026-11-18T10:00:30Z'))).toBeNull();
    expect(report('TypeError', { act: 'me' }, Date.parse('2026-11-18T10:01:30Z'))).not.toBeNull();
    const js = report('error', { message: 'boom for a@b.co' });
    expect(js.message).toBe('boom for [email]');
    // اسم فعل بغير شكل الأفعال يُفرغ، ونوع غير معروف لا يُسجَّل
    expect(report('busy', { act: 'Me?token=x' }).act).toBe('');
    expect(report('weird', {})).toBeNull();
    expect(queued()).toHaveLength(4);
  });
  it('الطابور محدود: الأقدم يسقط', () => {
    for (let i = 0; i < QUEUE_MAX + 15; i += 1) report('busy', { act: `a${i}` }, 1_000_000 + i);
    const q = queued();
    expect(q).toHaveLength(QUEUE_MAX);
    expect(q[0].act).toBe('a15');
  });
  it('الإرسال fetch بـkeepalive إلى client.event بلا رمز، ويُحذف المرسل ويبقى ما تعذّر إرساله', async () => {
    for (let i = 0; i < 25; i += 1) report('timeout', { act: `x${i}` }, 2_000_000 + i);
    const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await flush({ fetchImpl: down })).toBe('kept');
    expect(queued()).toHaveLength(25);
    const calls = [];
    const up = vi.fn(async (url, init) => { calls.push({ url, init }); return { status: 200, json: async () => ({ success: true, stored: 20 }) }; });
    expect(await flush({ fetchImpl: up })).toBe('sent');
    expect(calls[0].url).toContain('/functions/v1/leaders-api');
    expect(calls[0].init.keepalive).toBe(true);
    const body = JSON.parse(calls[0].init.body);
    expect(body.action).toBe('client.event');
    expect(body.events).toHaveLength(BATCH_MAX);
    expect(body).not.toHaveProperty('token');
    expect(queued()).toHaveLength(5);
  });
  it('الدفعة تُقص تحت سقف الجسم: نص بعلامات تنصيص يتضاعف في JSON، وما زاد يبقى في الطابور لا يُسقط', async () => {
    // أسوأ حال واقعي: 160 حرفًا كلها علامات تنصيص وشرطات مائلة (تتضاعف في JSON) واسم فعل بطوله الأقصى
    const msg = `Unexpected token '<', "<!DOCTYPE "...${'"\\'.repeat(80)}`;
    for (let i = 0; i < BATCH_MAX; i += 1) report('error', { act: `page-${String.fromCharCode(97 + i)}${'x'.repeat(54)}`, message: msg }, 3_000_000 + i);
    expect(queued()).toHaveLength(BATCH_MAX);
    const all = JSON.stringify({ action: 'client.event', events: queued() });
    expect(all.length).toBeGreaterThan(CLIENT_EVENT_BODY_CHARS);
    const bodies = [];
    const up = vi.fn(async (url, init) => { bodies.push(init.body); return { status: 200, json: async () => ({ success: true }) }; });
    expect(await flush({ fetchImpl: up })).toBe('sent');
    expect(bodies[0].length).toBeLessThanOrEqual(CLIENT_EVENT_BODY_CHARS);
    const sent = JSON.parse(bodies[0]).events.length;
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThan(BATCH_MAX);
    expect(queued()).toHaveLength(BATCH_MAX - sent);
  });
  it('قبل الترحيل (not_migrated): يُسقط الطابور بصمت ولا يُرسل ولا يُسجَّل شيء بعده في الصفحة', async () => {
    report('busy', { act: 'me' });
    const f = vi.fn(async () => ({ status: 503, json: async () => ({ success: false, code: 'not_migrated' }) }));
    expect(await flush({ fetchImpl: f })).toBe('off');
    expect(queued()).toEqual([]);
    expect(report('busy', { act: 'me' })).toBeNull();
    expect(await flush({ fetchImpl: f })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('تجاوز الحد (429) يبقي الطابور وينتظر، وبلا اتصال لا محاولة', async () => {
    report('busy', { act: 'me' });
    const f = vi.fn(async () => ({ status: 429, json: async () => ({ success: false, code: 'rate' }) }));
    expect(await flush({ fetchImpl: f, now: 1000 })).toBe('paused');
    expect(await flush({ fetchImpl: f, now: 2000 })).toBeNull();
    expect(queued()).toHaveLength(1);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await flush({ fetchImpl: f, now: 10 ** 13 })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('x-client-build في postAction (المرحلة 4، البند 4)', () => {
  const res = (headers = {}) => ({ status: 200, headers: { get: (k) => headers[k] ?? null }, json: async () => ({ success: true }), clone() { return this; } });
  it('لا تُرسل حتى يعلن الخادم قبولها، ثم تُرسل لـleaders-api وحدها، وتسقط بعد خطأ شبكة', async () => {
    const seen = [];
    let fail = false;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => { seen.push({ url, h: init.headers }); if (fail) throw new TypeError('Failed to fetch'); return res({ 'x-client-build': 'on' }); }));
    await postAction('leaders-api', { action: 'me' });
    expect(seen[0].h['x-client-build']).toBeUndefined();
    expect(buildState.accepted).toBe(true);
    await postAction('leaders-api', { action: 'me' });
    expect(seen[1].h['x-client-build']).toBe('dev');
    await postAction('admin-api', { action: 'ping' });
    expect(seen[2].h['x-client-build']).toBeUndefined();
    fail = true;
    await expect(postAction('leaders-api', { action: 'me' }, { budget: 2000, sleep: async () => {}, random: () => 0 })).rejects.toThrow();
    // الإعادة بعد خطأ الشبكة الأول بلا ترويسة: خادم أقدم لا يأذن بها لا يُسقط الطلب كله
    expect(seen[3].h['x-client-build']).toBe('dev');
    expect(seen[4].h['x-client-build']).toBeUndefined();
    expect(buildState.accepted).toBe(false);
  });
  it('الخادم يأذن بها في CORS ويعلنها ويسجّلها', () => {
    const core = read('supabase/functions/leaders-api/core.ts');
    expect(core).toMatch(/'Access-Control-Allow-Headers': '[^']*x-client-build'/);
    expect(core).toMatch(/'Access-Control-Expose-Headers': 'x-idem, x-client-build'/);
    const index = read('supabase/functions/leaders-api/index.ts');
    expect(index).toContain("res.headers.set('x-client-build', 'on')");
    expect(index).toContain("cleanBuild(req.headers.get('x-client-build'))");
  });
});

describe('الفعل والتصنيف والسياسة', () => {
  it('client.event مفتوح، كتابة لا تُعاد ولا يُحفظ ردها', () => {
    expect(read('supabase/functions/leaders-api/index.ts')).toMatch(/'client\.event': \(b, ctx\) => CE\.record\(b, ctx\)/);
    expect(NO_REPLAY.has('client.event')).toBe(true);
    expect(isReadAction('leaders-api', 'client.event')).toBe(false);
  });
  it('الإرسال keepalive لا sendBeacon (البوابة ترفضه بلا ترويستي apikey وAuthorization)', () => {
    const t = read('leaders-app/src/telemetry.js');
    expect(t).toContain('keepalive: true');
    expect(t).not.toMatch(/navigator\.sendBeacon\(/);
  });
  it('نسخة سياسة غير جوهرية في سجل التغييرات وحده، بتاريخ لم يُستعمل', () => {
    const c = POLICY_CHANGES.find((x) => x.version === '2026-11-24');
    expect(c.material).toBe(false);
    expect(c.items.join(' ')).toContain('30 يومًا');
    expect(new Set(POLICY_CHANGES.map((x) => x.version)).size).toBe(POLICY_CHANGES.length);
  });
});

const MIG = read('supabase/migrations/20261118150000_leaders_client_events.sql');
describe('ترحيل 20261118150000_leaders_client_events', () => {
  it('متسامح، ومغلق أمام المتصفح، وقيد الأنواع من المصدر نفسه', () => {
    expect(MIG).toMatch(/^-- deploy-gate: tolerant /m);
    expect(MIG).toMatch(/enable row level security/);
    expect(MIG).toMatch(/revoke all on leaders\.client_events from anon, authenticated/);
    expect(MIG).toContain(`kind in (${CLIENT_EVENT_KINDS.map((k) => `'${k}'`).join(', ')})`);
    expect(MIG).not.toMatch(/participant_id|email|token|\bip text|user_id/);
  });
  it('يُطبَّق مرتين، ويرفض ما يخالف الشكل', async () => {
    const d = new PGlite();
    await d.exec('create role anon; create role authenticated; create schema leaders; create table leaders.schema_migrations (name text primary key);');
    await d.exec(MIG);
    await d.exec(MIG);
    await d.exec("insert into leaders.client_events (kind, act, tries, build, at) values ('TypeError', 'me', 3, 'Abc_12-x', now())");
    for (const bad of [
      "('nope', 'me', 1, null, now())", "('busy', 'Me?t=1', 1, null, now())", "('busy', 'me', 0, null, now())", "('busy', 'me', 1, 'a/b', now())",
    ]) await expect(d.exec(`insert into leaders.client_events (kind, act, tries, build, at) values ${bad}`)).rejects.toThrow();
    await expect(d.exec(`insert into leaders.client_events (kind, at, message) values ('error', now(), '${'x'.repeat(161)}')`)).rejects.toThrow();
    await expect(d.exec("insert into leaders.client_events (kind, at, ip_hash) values ('error', now(), '1.2.3.4')")).rejects.toThrow();
    expect((await d.query('select name from leaders.schema_migrations')).rows.map((r) => r.name)).toContain('20261118150000_leaders_client_events');
  });
});
