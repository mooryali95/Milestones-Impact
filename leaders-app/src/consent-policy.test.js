// حراس الحزمة 11أ (D18): نسخة جوهرية واحدة تُعاد عندها الموافقة بما تغيّر، وسجل موافقات لا يُكتب فوقه بالنسخة
// وبصمة النص، وحجب ما يعتمد على الجديد وحده، وإخطار لمرة واحدة عبر الطابور، ونص سياسة يجمع حقائق القرارات.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { CONSENT_GATED, consentState, LEGAL_PATH, POLICY_CHANGES, POLICY_MATERIAL_VERSION, POLICY_VERSION } from '../../supabase/functions/leaders-api/labels.js';
import { POLICY_DIGEST } from '../../supabase/functions/leaders-api/policy-digest.js';
import { policyDigest } from '../../scripts/legal/policy-digest.mjs';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';
import Consent, { PolicyBanner } from './Consent.jsx';
import { Changes } from './screens/Legal.jsx';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);

describe('سجل النسخ', () => {
  it('النسخ تواريخ فريدة بالأحدث أولًا، والنافذة أولها، والجوهرية آخر ما عُلّم جوهريًا', () => {
    const v = POLICY_CHANGES.map((c) => c.version);
    // تاريخ وحده: يطابق قيد consent_events.version في القاعدة
    for (const x of v) expect(x).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...v].sort().reverse()).toEqual(v);
    expect(new Set(v).size).toBe(v.length);
    expect(POLICY_VERSION).toBe(v[0]);
    expect(POLICY_MATERIAL_VERSION).toBe(POLICY_CHANGES.find((c) => c.material).version);
    for (const c of POLICY_CHANGES) expect(c.items.length).toBeGreaterThan(0);
  });
  it('بصمة النص المودعة تطابق الوثائق وسجلها للنسخة النافذة', () => {
    expect(POLICY_DIGEST.version).toBe(POLICY_VERSION);
    expect(POLICY_DIGEST.sha256).toBe(policyDigest());
  });
});

describe('حالة الموافقة', () => {
  it('لم يوافق قط، ووافق قبل الجوهرية، ووافق على النافذة', () => {
    expect(consentState(null, null).needed).toBe('first');
    const old = consentState('2026-11-06', '2026-11-06T10:00:00Z');
    expect(old.needed).toBe('renew');
    expect(old.changes.map((c) => c.version)).toEqual(POLICY_CHANGES.filter((c) => c.version > '2026-11-06').map((c) => c.version));
    expect(consentState(null, '2026-11-01T10:00:00Z').needed).toBe('renew');
    expect(consentState(POLICY_VERSION, '2026-11-07T10:00:00Z')).toMatchObject({ needed: null, notice: false, changes: [] });
  });
  it('النسخة غير الجوهرية بعد الجوهرية شريط بلا حجب', () => {
    const later = [{ version: '2099-01-01', material: false, items: ['تصحيح لغوي'] }, ...POLICY_CHANGES];
    const v = later[0].version;
    const state = (cv) => { const changes = later.filter((c) => c.version > cv); return { needed: cv < POLICY_MATERIAL_VERSION ? 'renew' : null, notice: cv >= POLICY_MATERIAL_VERSION && cv < v, changes }; };
    expect(state(POLICY_MATERIAL_VERSION)).toMatchObject({ needed: null, notice: true });
  });
});

describe('الخادم', () => {
  const p = api('participant.ts');
  it('كل موافقة في جدول المشارك وفي السجل التاريخي، والتجديد بنوعه، ومشاركة الجهة كذلك', () => {
    // السطر التاريخي أولًا: إن تعذّر لم تُكتب الموافقة في جدول المشارك
    expect(p).toMatch(/async function recordConsent\(participantId: string, kind: 'accept' \| 'renew' = 'accept'\) \{\n\s+await logConsent\('participant', participantId, kind\);\n\s+await setConsent\([^\n]+consent_version: POLICY_VERSION \}\);/);
    expect(p).toMatch(/await recordConsent\(p\.id, before\.needed === 'renew' \? 'renew' : 'accept'\);/);
    expect(p).toMatch(/await logConsent\('participant', p\.id, share \? 'org_share_on' : 'org_share_off'\);/);
    expect(p).toMatch(/consent: 'consented_at' in p \? consentState\(p\.consent_version, p\.consented_at\) : undefined,/);
    const core = api('core.ts');
    expect(core).toMatch(/from\('consent_events'\)\.insert\(\{ subject, subject_id: subjectId, kind, version: POLICY_DIGEST\.version, text_digest: POLICY_DIGEST\.sha256 \}\)/);
    // تعذّر السطر يرمي فيفشل الطلب قبل أثره في السجل، ولا استثناء لجدول غائب
    expect(core).not.toMatch(/42P01|PGRST205/);
    expect(core).toMatch(/throw new Fail\('تعذّر تسجيل موافقتك الآن، حاول بعد قليل', 503, 'consent_unavailable'\);/);
    const consent = (f) => api(f).slice(api(f).indexOf('logConsent('));
    expect(consent('coordinator.ts')).toMatch(/^logConsent\('coordinator', c\.id, 'accept'\);\n\s+await audit\(/);
    expect(consent('experts.ts')).toMatch(/^logConsent\('expert', e\.id, 'accept'\);\n\s+await audit\(/);
  });
  it('ما يعتمد على الجديد وحده يُحجب حتى التجديد، والرحلة لا', () => {
    expect(CONSENT_GATED).toEqual(['rater.invite', 'sponsor.request', 'me.sponsor-code']);
    expect(api('index.ts')).toMatch(/if \(CONSENT_GATED\.includes\(action\) && 'consented_at' in p && consentState\(p\.consent_version, p\.consented_at\)\.needed\) \{\n\s+throw new Fail\([^)]+428, 'consent_renew'\);/);
  });
  it('لا بريد بتحديث الوثائق ولا تفاصيل في الرحلة (قرار المالك 2026-11-16): التفاصيل في سجل التغييرات وحده', () => {
    expect(p).not.toMatch(/policyNotify|policyChangeMail|POLICY_CHANGES/);
    expect(api('core.ts')).not.toMatch(/policyChangeMail/);
    expect(api('index.ts')).not.toMatch(/policy_notice|policyNotify/);
    const ui = read('leaders-app/src/Consent.jsx');
    expect(ui).not.toMatch(/consent\.changes|\.items\.map|POLICY_VERSION|غير جوهري|ما الذي تغيّر/);
  });
});

describe('الواجهة', () => {
  it('أول مرة بلا تأجيل، والتجديد سطر واحد بلا تفاصيل وزر «لاحقًا»', () => {
    const first = renderToStaticMarkup(React.createElement(Consent, { consent: consentState(null, null), onAccepted: () => {} }));
    // الشكل المختصر (قرار المالك 2026-11-23): ثلاث نقاط ورابط واحد داخل جملة الموافقة
    for (const s of ['قبل أن نتابع', 'ولدى مزودينا', 'بالمتابعة توافق على', 'الشروط وسياسة الخصوصية']) expect(first).toContain(s);
    expect((first.match(/<li>/g) || []).length).toBe(3);
    expect((first.match(/<a /g) || []).length).toBe(1);
    for (const s of ['باختصار', 'الاسترداد', 'سجل التغييرات']) expect(first).not.toContain(s);
    expect(first).not.toContain('مومباي');
    expect(first).not.toContain('لاحقًا');
    const renew = renderToStaticMarkup(React.createElement(Consent, { consent: consentState('2026-11-06', '2026-11-06T10:00:00Z'), onAccepted: () => {}, onLater: () => {} }));
    for (const s of ['حدّثنا سياسة الخصوصية والشروط', 'وافق لنتابع', 'أوافق وأتابع', 'لاحقًا', 'الشروط وسياسة الخصوصية']) expect(renew).toContain(s);
    for (const s of ['وافقت على النسخة', 'النسخة 2026', 'جوهرية', POLICY_CHANGES[0].items[0], POLICY_CHANGES.find((c) => c.material).items[0]]) expect(renew).not.toContain(s);
  });
  it('الشريط لمن أجّل التجديد وحده، بسطر وزر «موافق»، ولا شيء للنسخة غير الجوهرية', () => {
    const r = (props) => renderToStaticMarkup(React.createElement(PolicyBanner, { onAccepted: () => {}, ...props }));
    expect(r({ consent: { needed: 'renew' }, deferred: true })).toContain('موافق');
    expect(r({ consent: { needed: 'renew' }, deferred: true })).not.toMatch(/جوهري|النسخة/);
    expect(r({ consent: { needed: 'renew' }, deferred: false })).toBe('');
    expect(r({ consent: { needed: null, notice: true } })).toBe('');
    expect(r({ consent: { needed: null, notice: false } })).toBe('');
  });
  it('البوابة في التطبيق من حالة الخادم وحدها', () => {
    const app = read('leaders-app/src/App.jsx');
    expect(app).toMatch(/const consentNeed = me\?\.participant\?\.consent\?\.needed \?\? null;/);
    expect(app).not.toMatch(/الخادم الأقدم/);
    expect(app).toMatch(/consentNeed === 'renew' && !me\.participant\.is_demo && !consentLater\) screen = <Consent/);
    expect(app).toMatch(/<PolicyBanner consent=\{me\.participant\.consent\} deferred=\{consentLater\} onAccepted=/);
  });
});

describe('نص الوثائق', () => {
  it('السياسة تجمع حقائق القرارات بمكان كل معالج', () => {
    const legal = read('leaders-app/src/screens/Legal.jsx');
    for (const s of ['في الهند', 'Cloudflare R2', '180 يومًا', 'الشهرية سنة', 'خارج المملكة العربية السعودية', 'اتفاقية معالجة بيانات',
      'حالة التحقق منه', 'إشعار خصوصية خاص به', 'بلا اسمك', 'لا تدخل تقييمك الختامي', 'شهادة إتمام بنجاح', 'تُعلَّق', 'بعد اعتماد مستشارك مسارك', 'سجل موافقاتك']) expect(legal).toContain(s);
    expect(legal).not.toMatch(/AWS|مومباي|مهشّرة|لا يملكه Cloudflare/);
  });
  it('سجل التغييرات صفحة من المصدر نفسه', () => {
    const html = renderToStaticMarkup(React.createElement(Changes));
    for (const c of POLICY_CHANGES) expect(html).toContain(`النسخة ${c.version}`);
    expect(read('leaders-app/src/screens/Legal.jsx')).toContain('[LEGAL_PATH.changes, \'سجل التغييرات\']');
    expect(LEGAL_PATH.changes).toBe('/legal/changes');
  });
});

describe('ترحيل 20261107160000_leaders_consent_events', () => {
  const SQL = read('supabase/migrations/20261107160000_leaders_consent_events.sql');
  it('حاجب بعد تطبيقه، ويُكتب ولا يُعدَّل ولا يُحذف ولا يُفرَّغ، وإعادته آمنة', async () => {
    expect(gateOf(SQL, '20261107160000_leaders_consent_events').gate).toBe('blocking');   // مطبّق على الإنتاج: الوسم في ملفه منتهٍ ولا يُمس الملف
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create role anon; create role authenticated;`);
    await db.exec(SQL);
    await db.exec(SQL);
    await db.exec(`insert into leaders.consent_events (subject, subject_id, kind, version, text_digest) values ('participant', 'p1', 'accept', '2026-11-07', '${POLICY_DIGEST.sha256}')`);
    await expect(db.exec("update leaders.consent_events set kind = 'renew'")).rejects.toThrow(/لا يُعدَّل/);
    await expect(db.exec('delete from leaders.consent_events')).rejects.toThrow(/لا يُعدَّل/);
    await expect(db.exec('truncate leaders.consent_events')).rejects.toThrow(/لا يُعدَّل/);
    await expect(db.exec("insert into leaders.consent_events (subject, subject_id, kind, version) values ('admin', 'x', 'accept', '2026-11-07')")).rejects.toThrow();
    await expect(db.exec("insert into leaders.consent_events (subject, subject_id, kind, version) values ('rater', 'x', 'accept', 'v2')")).rejects.toThrow();
    expect((await db.query('select count(*)::int as n from leaders.consent_events')).rows[0].n).toBe(1);
  });
});
