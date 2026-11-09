// حراس الحزمة 11ب (D19 وسطور D18): التحقق من المقيّم بنطاق الجهة، والانتظار قبل الإرسال لما سواه حتى يؤكده
// المستشار أو المنسق، والعلامات من أول دعوة، وإشعار خصوصية المقيّم وسطر موافقته، وسطر الموافقة للخبير والمنسق.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { RATER_FLAG_AR, raterVerification } from '../../supabase/functions/leaders-api/domains.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';
import PortalConsent, { RatersAwaiting } from './PortalConsent.jsx';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);

describe('حكم التحقق', () => {
  const org = { participantEmails: ['sara@moh.gov.sa'], orgDomains: ['moh.gov.sa'], linked: true };
  it('بريد المشارك مرفوض، ونطاق الجهة ونطاقها الفرعي مقبول آليًا', () => {
    expect(raterVerification('Sara@MOH.gov.sa', org)).toEqual({ verdict: 'reject', flags: ['self'] });
    expect(raterVerification('boss@moh.gov.sa', org)).toEqual({ verdict: 'org_domain', flags: [] });
    expect(raterVerification('boss@riyadh.moh.gov.sa', org).verdict).toBe('org_domain');
    expect(raterVerification('boss@xmoh.gov.sa', org).verdict).toBe('pending');
  });
  it('البريد العام والنطاق الآخر والمشارك الفردي بانتظار التأكيد بأسبابها', () => {
    expect(raterVerification('boss@gmail.com', org)).toEqual({ verdict: 'pending', flags: ['public_mail'] });
    expect(raterVerification('boss@other.sa', org)).toEqual({ verdict: 'pending', flags: ['other_domain'] });
    expect(raterVerification('boss@moh.gov.sa', { participantEmails: ['s@x.sa'], orgDomains: ['moh.gov.sa'], linked: false })).toEqual({ verdict: 'pending', flags: ['individual'] });
    expect(raterVerification('boss@gmail.com', { participantEmails: ['s@x.sa'] })).toEqual({ verdict: 'pending', flags: ['public_mail', 'individual'] });
    for (const f of ['self', 'public_mail', 'other_domain', 'individual']) expect(RATER_FLAG_AR[f]).toBeTruthy();
  });
});

describe('الخادم', () => {
  const imp = api('impact.ts');
  const inv = imp.slice(imp.indexOf('export async function invite('), imp.indexOf('export async function revoke('));
  it('الدعوة تحمل الحكم والعلامات، والمنتظرة لا تُرسل بل تُخطر من يؤكدها', () => {
    expect(inv).toMatch(/const check = await raterCheck\(p, email\);\n\s+if \(check\.verdict === 'reject'\) throw new Fail/);
    expect(inv).toMatch(/status: awaiting \? 'awaiting' : 'invited'/);
    expect(inv).toMatch(/verification: check\.verdict, verification_flags: check\.flags/);
    expect(inv).toMatch(/if \(awaiting\) \{\n\s+const told = await notifyConfirmers\(p, check\.flags\);[\s\S]*?return mine\(p\);\n\s+\}/);
    expect(inv.indexOf('notifyConfirmers(')).toBeLessThan(inv.indexOf('await sendMail(email'));
  });
  it('تعذّر حفظ الدعوة يفشلها، ولا إرسال بلا علامات ولا تحقق، وقائمة المنتظرين لا تفرغ بصمت', () => {
    expect(inv).not.toMatch(/legacy/);
    expect(inv).not.toMatch(/23514|missingColumn/);
    expect(inv).toMatch(/const saved = must\(await write\(row\)\) as \{ id: string \};/);
    const aw = imp.slice(imp.indexOf('export async function awaitingFor('), imp.indexOf('export async function confirmRater('));
    expect(aw).not.toMatch(/if \(error\) return \[\]/);
    expect(aw).toMatch(/const data = must\(await db\.from\('raters'\)/);
  });
  it('التأكيد في نطاق المؤكِّد، برابط جديد، والرفض بسبب يصل المشارك، وكلاهما في السجل', () => {
    const c = imp.slice(imp.indexOf('export async function confirmRater('));
    expect(c).toMatch(/if \(!\(await allowed\(r\.participant_id\)\)\) throw new Fail\([^)]+403/);
    expect(c).toMatch(/if \(reason\.length < 5\) throw new Fail/);
    expect(c).toMatch(/verification: 'rejected', verified_by: who/);
    expect(c).toMatch(/raterRejectedMail\(/);
    expect(c).toMatch(/verification: 'confirmed', verified_by: who, verified_at: now, token_hash: await hash\(token\)/);
    expect(c).toMatch(/'rater\.confirm'/);
    expect(c).toMatch(/'rater\.reject'/);
  });
  it('المستشار لمشاركي دفعاته، والمنسق لمشاركي جهته بصلاحية القائمة', () => {
    expect(api('file.ts')).toMatch(/confirmRater\(\{ kind: 'expert', email: e\.email \}, b, async \(pid\) => \(await expertScope\(e\)\)\.advisor\.has\(pid\)\)/);
    expect(api('file.ts')).toMatch(/raters_pending: await awaitingFor\(\[\.\.\.scope\.advisor\]\)/);
    const k = api('coordinator.ts');
    expect(k).toMatch(/if \(!coordPermissions\(c\.permissions\)\.list\) throw new Fail/);
    expect(k).toMatch(/\.eq\('organization_id', c\.organization_id\)\.maybeSingle\(\);\n\s+return !!data;/);
    expect(k).toMatch(/r\.raters_pending = list \? await awaitingFor/);
    const idx = api('index.ts');
    expect(idx).toContain("'xp.rater-confirm': (e, b) => FL.raterConfirm(e, b),");
    expect(idx).toContain("'coord.rater-confirm': (c, b) => C.raterConfirm(c, b),");
  });
  it('المشارك يرى حالة مقيّمه وسببها بلا بصمة الرمز ولا التقديرات، ويلغي المنتظر', () => {
    expect(imp).toMatch(/db\.from\('raters'\)\.select\('\*'\)\.eq\('participant_id', p\.id\)\.neq\('status', 'revoked'\)/);
    const view = imp.slice(imp.indexOf('const raterView'), imp.indexOf('// D19: حكم التحقق'));
    expect(view).not.toMatch(/token_hash|answers/);
    expect(imp).toMatch(/\.eq\('participant_id', p\.id\)\.in\('status', \['invited', 'awaiting'\]\)/);
  });
  it('المقيّم يوافق بإرسال تقديره، وبريد دعوته يحمل إشعار الخصوصية', () => {
    expect(imp).toMatch(/await logConsent\('rater', r\.id, 'accept'\);/);
    expect(api('core.ts')).toMatch(/نحفظ اسمك وبريدك وصلتك به وتقديرك لقياس أثر البرنامج وحده/);
    expect(read('leaders-app/src/screens/Rater.jsx')).toMatch(/بإرسالك التقدير توافق على ذلك وفق/);
  });
  it('سطر الموافقة للخبير والمنسق عند أول دخول، مسموح قبل اعتماد الخبير', () => {
    const core = api('core.ts');
    expect(core).toMatch(/export async function consentNeeded\(subject: ConsentSubject, subjectId: string\) \{\n\s+const \{ data, error \} = await db\.from\('consent_events'\)[^\n]+\.gte\('version', POLICY_MATERIAL_VERSION\)/);
    // تعذّر القراءة لا يُعفي من الموافقة (D18): يرمي 503
    expect(core).not.toMatch(/if \(error\) return false;/);
    expect(core).toMatch(/throw new Fail\('تعذّر التحقق من الموافقة الآن، حاول بعد قليل', 503, 'consent_unavailable'\);/);
    const ex = api('experts.ts');
    expect(ex).toMatch(/const consent_needed = await consentNeeded\('expert', e\.id\);/);
    expect((ex.match(/consent_needed/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(ex).toMatch(/await logConsent\('expert', e\.id, 'accept'\);/);
    const k = api('coordinator.ts');
    expect((k.match(/consent_needed: await consentNeeded\('coordinator', c\.id\)/g) || []).length).toBe(2);
    expect(k).toMatch(/await logConsent\('coordinator', c\.id, 'accept'\);/);
    expect(api('index.ts')).toMatch(/\['xp\.dashboard', 'xp\.consent', 'xp\.profile-save', 'xp\.logout', 'xp\.switch'\]\.includes\(action\)/);
  });
});

describe('الواجهة', () => {
  it('سطر الموافقة للخبير والمنسق بنصه ورابط السياسة', () => {
    for (const role of ['expert', 'coordinator']) {
      const h = renderToStaticMarkup(React.createElement(PortalConsent, { role, onAccept: async () => ({ success: true }) }));
      expect(h).toContain('بيانات المشاركين أمانة');
      expect(h).toContain('/legal/privacy');
      expect(h).toContain('أوافق وأتابع');
    }
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).toMatch(/if \(d\.consent_needed\) return <PortalConsent role="expert"/);
    expect(read('leaders-app/src/screens/OrgPortal.jsx')).toMatch(/if \(me\?\.consent_needed\) return <PortalConsent role="coordinator"/);
  });
  it('قائمة المنتظرين بالمشارك والبريد والسبب، وفي البوابتين', () => {
    const h = renderToStaticMarkup(React.createElement(RatersAwaiting, { items: [{ id: 'r1', participant: 'سارة', email: 'b@gmail.com', full_name: 'خالد', relation_ar: 'المدير المباشر', phase: 'pre', flags_ar: ['بريد عام'] }], onDecide: async () => ({ success: true }) }));
    for (const s of ['مقيّمون بانتظار تأكيدك', 'سارة', 'b@gmail.com', 'بريد عام', 'قبل البرنامج', 'أكّد وأرسل الدعوة', 'لا أعتمده']) expect(h).toContain(s);
    expect(renderToStaticMarkup(React.createElement(RatersAwaiting, { items: [], onDecide: async () => ({}) }))).toBe('');
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).toMatch(/<RatersAwaiting items=\{d\?\.raters_pending\} onDecide=\{decide\} \/>/);
    expect(read('leaders-app/src/screens/OrgPortal.jsx')).toMatch(/<RatersAwaiting items=\{d\.raters_pending\}/);
  });
  it('المشارك يرى الانتظار وسببه في الدعوتين', () => {
    expect(read('leaders-app/src/screens/Impact.jsx')).toMatch(/awaiting: 'بانتظار تأكيد المستشار'/);
    expect(read('leaders-app/src/screens/Journey.jsx')).toMatch(/pre\?\.status === 'awaiting'/);
  });
});

describe('ترحيل 20261107170000_leaders_rater_verification', () => {
  const SQL = read('supabase/migrations/20261107170000_leaders_rater_verification.sql');
  it('حاجب بعد تطبيقه، ويقبل الانتظار والعلامات، ويرفض حكمًا مجهولًا، وإعادته آمنة', async () => {
    expect(gateOf(SQL).gate).toBe('blocking');
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.raters (id serial primary key, participant_id int not null, email text not null, status text not null default 'invited',
        constraint raters_status_check check (status = any (array['invited', 'submitted', 'revoked'])));`);
    await db.exec(SQL);
    await db.exec(SQL);
    await db.exec("insert into leaders.raters (participant_id, email, status, verification, verification_flags) values (1, 'a@gmail.com', 'awaiting', 'pending', '{public_mail}')");
    await db.exec("insert into leaders.raters (participant_id, email) values (1, 'b@x.sa')");
    expect((await db.query("select verification, verification_flags from leaders.raters where email = 'b@x.sa'")).rows[0]).toEqual({ verification: null, verification_flags: [] });
    await expect(db.exec("insert into leaders.raters (participant_id, email, verification) values (1, 'c@x.sa', 'maybe')")).rejects.toThrow();
    await expect(db.exec("insert into leaders.raters (participant_id, email, status) values (1, 'd@x.sa', 'lost')")).rejects.toThrow();
  });
});
