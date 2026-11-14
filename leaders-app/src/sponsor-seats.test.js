// حراس D20: المقعد يُستهلك بفحص ذري لحظة تثبيت الإعفاء، والرعاية المرفوضة مقعدًا تنتظر القرار بلا بوابة دفع،
// والقبول مقعد يُضاف بتعليل، ويُرد المقعد لمن انسحب قبل أول باب، وتنبيه 80% و100%، وحد تخمين رمز الجهة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';
import { seatHold } from './screens/Paywall.jsx';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const SQL = read('supabase/migrations/20261107130000_leaders_sponsor_seats.sql');

async function db() {
  const d = new PGlite();
  await d.exec(`create role anon; create role authenticated; create role service_role; create schema leaders;
    create table leaders.schema_migrations (name text primary key);
    create table leaders.organizations (id uuid primary key, status text not null default 'active', seats int, contract_starts date, contract_ends date);
    create table leaders.entitlements (id uuid primary key default gen_random_uuid(), participant_id uuid not null, item text not null, source text not null,
      granted_by text, note text, created_at timestamptz default now(), revoked_at timestamptz, organization_id uuid, value_cents int, currency text);
    create unique index entitlements_one_live on leaders.entitlements (participant_id, item) where revoked_at is null;
    create table leaders.sponsor_requests (id uuid primary key default gen_random_uuid(), participant_id uuid not null, typed_name text not null, status text not null default 'pending', organization_id uuid);`);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const pin = async (d, p, o) => (await d.query(`select leaders.pin_sponsor_seat($1, $2, 9900, 'USD', 'جهة') r`, [U(p), U(o)])).rows[0].r;

describe('leaders.pin_sponsor_seat', () => {
  it('حاجب في بوابة النشر بعد تطبيقه (لا كود متسامح معه)، ولدور الخدمة وحده، ويقفل صف الجهة', () => {
    expect(gateOf(SQL, '20261107130000_leaders_sponsor_seats').gate).toBe('blocking');   // مطبّق على الإنتاج: الوسم في ملفه منتهٍ ولا يُمس الملف
    expect(SQL).toMatch(/from leaders\.organizations where id = p_org for update;/);
    expect(SQL).toMatch(/revoke all on function leaders\.pin_sponsor_seat\(uuid, uuid, integer, text, text\) from public, anon, authenticated;/);
  });
  it('يمنح حتى تكتمل المقاعد ثم يرفض، والمثبّت سلفًا لا يستهلك مقعدًا ثانيًا', async () => {
    const d = await db();
    await d.exec(`insert into leaders.organizations (id, seats) values ('${U(1)}', 2)`);
    expect(await pin(d, 11, 1)).toBe('granted');
    expect(await pin(d, 11, 1)).toBe('exists');
    expect(await pin(d, 12, 1)).toBe('granted');
    expect(await pin(d, 13, 1)).toBe('full');
    const { rows } = await d.query(`select participant_id, item, value_cents from leaders.entitlements order by participant_id, item`);
    expect(rows.map((r) => [r.participant_id.slice(-2), r.item, r.value_cents])).toEqual([['11', 'assessment', 0], ['11', 'program', 9900], ['12', 'assessment', 0], ['12', 'program', 9900]]);
    // مقعد رُدّ (انسحاب قبل أول باب) يتسع لغيره
    await d.exec(`update leaders.entitlements set revoked_at = now() where participant_id = '${U(12)}'`);
    expect(await pin(d, 13, 1)).toBe('granted');
  });
  it('مدة العقد وحالة الجهة، وبلا حد للمقاعد يمنح دائمًا', async () => {
    const d = await db();
    await d.exec(`insert into leaders.organizations (id, seats, contract_starts, contract_ends, status) values
      ('${U(2)}', 5, current_date + 3, null, 'active'), ('${U(3)}', 5, null, current_date - 1, 'active'), ('${U(4)}', 5, null, null, 'inactive'), ('${U(5)}', null, null, null, 'active')`);
    expect(await pin(d, 21, 2)).toBe('before');
    expect(await pin(d, 21, 3)).toBe('after');
    expect(await pin(d, 21, 4)).toBe('inactive');
    expect(await pin(d, 21, 5)).toBe('granted');
    expect((await d.query(`select count(*)::int n from leaders.entitlements`)).rows[0].n).toBe(2);
  });
  it('من دفع البرنامج قبل ربطه يُعفى من القياس وحده، ويبقى دفعه', async () => {
    const d = await db();
    await d.exec(`insert into leaders.organizations (id, seats) values ('${U(6)}', 10);
      insert into leaders.entitlements (participant_id, item, source) values ('${U(31)}', 'program', 'paid')`);
    expect(await pin(d, 31, 6)).toBe('granted');
    const { rows } = await d.query(`select item, source from leaders.entitlements where participant_id = '${U(31)}' order by item`);
    expect(rows).toEqual([{ item: 'assessment', source: 'sponsor' }, { item: 'program', source: 'paid' }]);
  });
});

describe('الخادم والواجهة', () => {
  const ent = read('supabase/functions/leaders-api/entitlements.ts');
  it('التثبيت بالدالة الذرية وحدها، وتعذّرها لا يمنح شيئًا، والرفض يفتح طلبًا بانتظار القرار ويُخطر المنسق والإدارة', () => {
    expect(ent).toMatch(/db\.rpc\('pin_sponsor_seat'/);
    // لا مسار بلا فحص المقاعد: أي خطأ من الدالة ينبّه ويرمي 503 قبل أي إدراج
    expect(ent).not.toMatch(/PGRST202|42883|'legacy'/);
    expect(ent).not.toMatch(/from\('entitlements'\)\.insert/);
    expect(ent).toMatch(/await alertOps\('seat_check_unavailable'[^\n]+\n\s+throw new Fail\('تعذّر تثبيت إعفاء الراعي', 503, 'seat_check_unavailable'\);/);
    expect(ent).toMatch(/if \(SEAT_BLOCKED\.includes\(r\)\) await holdSponsorship\(p\.id, org, r\);/);
    expect(ent).toMatch(/insert\(\{ participant_id: participantId, typed_name: org\.name, organization_id: org\.id, kind, status: 'pending' \}\)/);
    expect(ent).toMatch(/\.eq\('status', 'rejected'\)\.in\('kind', \['seats', 'contract'\]\)/);   // لا حلقة بعد قرار الدفع الفردي
    expect(ent).toMatch(/export const SEAT_ALERTS = \[0\.8, 1\];/);
  });
  it('من رُفض مقعده ليس مرعيًا في access، وتعذّر الفحص يبقيه بلا تثبيت، وطلبه يصل الواجهة بنوعه', () => {
    const pay = read('supabase/functions/leaders-api/payments.ts');
    expect(pay).toMatch(/const src: any = held \? null :/);
    expect(pay).toMatch(/seat = await pinSponsor\(p, org\)\.catch\(\(e\) => \{ console\.error\('access pin:', e\); return null; \}\);/);
    expect(pay).toMatch(/must\(await lastReq\('typed_name, status, reason, kind'\)\)/);
    expect(pay).not.toMatch(/lastReq\('typed_name, status, reason'\)/);
  });
  it('قبول الإدارة لطلب المقاعد مقعد يُضاف بتعليل وتدقيق، وللعقد يعدّل التاريخان أولًا', () => {
    const sp = read('supabase/functions/leaders-api/sponsor.ts');
    expect(sp).toMatch(/if \(r\.kind === 'seats'\) \{[\s\S]*seat_reason[\s\S]*\.eq\('seats', org\.seats\)[\s\S]*'sponsor\.seat-added'/);
    expect(sp).toContain('مدة العقد لا تشمل اليوم');
  });
  it('الانسحاب قبل أول باب يرد المقعد', () => {
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/if \(b\.status === 'withdrawn'\) \{[\s\S]*handbook_progress[\s\S]*revoked_by: 'seat-return'/);
  });
  it('رمز رابط الجهة محدود المحاولات لكل شبكة، والرموز الجديدة عشرة أحرف عشوائية على الأقل', () => {
    const pt = read('supabase/functions/leaders-api/participant.ts');
    expect(pt).toMatch(/const ORG_LINK_TRIES_PER_HOUR = 30;/);
    expect(pt).toMatch(/resolveOrg\(b, `ip:\$\{ctx\.ip \|\| 'none'\}`\)/);
    expect(read('supabase/functions/leaders-api/index.ts')).toContain("'org.info': (b, ctx) => P.orgInfo(b, ctx),");
    const admin = read('supabase/functions/leaders-api/admin.ts');
    // الشرط في domains.js وحده، يقرؤه الخادم ونموذج الجهة في اللوحة (تدقيق الرحلة 2026-11-14: كان النموذج يقبل 4)
    expect(read('supabase/functions/leaders-api/domains.js')).toMatch(/INVITE_CODE_RE = \/\^\[a-z0-9-\]\{10,40\}\$\//);
    expect(admin).toMatch(/INVITE_CODE_RE\.test\(code\)/);
    expect(read('admin-app/src/screens/OrgForm.jsx')).toMatch(/INVITE_CODE_RE\.test\(v\.invite_code\)/);
    expect(admin).toMatch(/export const inviteCode = \(n = 12\)/);
  });
  it('الواجهة: الطلب المعلّق بالمقاعد أو العقد يعرض شاشة الانتظار بلا بوابة دفع', () => {
    expect(seatHold({ access: { request: { status: 'pending', kind: 'seats' } } })).toBe(true);
    expect(seatHold({ access: { request: { status: 'pending', kind: 'claim' } } })).toBe(false);
    expect(seatHold({ access: { request: { status: 'rejected', kind: 'seats' } } })).toBe(false);
    expect(read('leaders-app/src/App.jsx')).toMatch(/seatHold\(me\) && \(!paidFor\('assessment'\) \|\| !paidFor\('program'\)\)\) screen = <SponsorshipPending \/>/);
    expect(read('leaders-app/src/screens/Paywall.jsx')).not.toMatch(/SponsorshipPending[\s\S]{0,600}(مقاعد|المقاعد|seats)/);
  });
});

describe('صاحب حساب قائم يدخل برابط جهة (تدقيق الرحلة 2026-11-14)', () => {
  it('يُربط بالجهة عند الدخول بالرمز أو Google إن لم يكن مرتبطًا، ولا يتغير المرتبط، وتعثّر الربط لا يمنع الدخول', () => {
    const pt = read('supabase/functions/leaders-api/participant.ts');
    expect(pt).toMatch(/const pending: Body \| null = existing \? orgCode :/);
    expect(pt).toMatch(/p = await linkOrgOnLogin\(p, ch\.pending_profile\?\.org,/);
    expect(pt).toMatch(/p = await linkOrgOnLogin\(p, b\.org,/);
    const fn = pt.slice(pt.indexOf('async function linkOrgOnLogin'), pt.indexOf('// المشارك المسجل يضيف رمز جهته'));
    expect(fn).toContain('if (!p || p.organization_id');
    expect(fn).toContain(".is('organization_id', null)");
    expect(fn).toMatch(/catch \(e\) \{[\s\S]*return p;/);
  });
  it('الرابط الخاطئ أو المتوقف يُعلن في شاشة الدخول ولا يُتجاهل', () => {
    const si = read('leaders-app/src/screens/SignIn.jsx');
    expect(si).toContain("else setOrg({ invalid: true, message: r.message })");
    expect(si).toContain('{org?.invalid && (');
  });
});
