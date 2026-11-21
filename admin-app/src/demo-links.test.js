// روابط تجربة حساب العرض (تصور 2026-11-19): نص اللوحة (المدد، وتأكيد إعادة الضبط الذي يسمّي الروابط النشطة)، والتقاط الرمز في
// منصة القادة، وأن أفعال الإدارة الثلاثة بغلاف writer وفتح الرابط فعل مفتوح. السلوك على الخادم في demo_links_test.ts (Deno)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { demoDaysAr, linkNamesAr, resetConfirmAr } from './DemoLinks.jsx';
import { captureTryLink, TRY_GONE } from '../../leaders-app/src/TryLink.jsx';
import { DEMO_LINK_DAYS, DEMO_LINK_DEFAULT_DAYS, DEMO_LINK_HASH, demoLinkUrl } from '../../supabase/functions/leaders-api/demo-links.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('نص بطاقة روابط التجربة', () => {
  it('المدد بصيغتها العربية، و7 أيام افتراضًا', () => {
    expect(DEMO_LINK_DAYS.map(demoDaysAr)).toEqual(['يوم واحد', '3 أيام', '7 أيام', '14 يومًا', '30 يومًا']);
    expect(DEMO_LINK_DAYS).toContain(DEMO_LINK_DEFAULT_DAYS);
  });
  it('تأكيد إعادة الضبط يسمّي الروابط النشطة، وبلاها النص كما كان', () => {
    expect(resetConfirmAr([])).toBe('إعادة الحساب التجريبي إلى البداية؟ تُمسح إجاباته وتقدمه وما تُخطي أو فُتح من مراحله، ويبدأ العرض التالي من شاشة الدخول.');
    expect(resetConfirmAr(undefined)).toBe(resetConfirmAr([]));
    expect(linkNamesAr([{ label: 'مدير الدفعة' }, { label: 'مسؤول الجهة' }])).toBe('«مدير الدفعة»، «مسؤول الجهة»');
    const one = resetConfirmAr([{ label: 'مدير الدفعة' }]);
    expect(one).toContain('الحساب واحد مشترك، فتنتهي الآن تجربة من يستعمل الرابط النشط: «مدير الدفعة».');
    expect(one).toContain('يبقى رابطه صالحًا ويبدأ من البداية.');
    const two = resetConfirmAr([{ label: 'مدير الدفعة' }, { label: 'مسؤول الجهة' }]);
    expect(two).toContain('الروابط النشطة: «مدير الدفعة»، «مسؤول الجهة».');
    expect(two).toContain('يبقى روابطهم صالحة ويبدؤون من البداية.');
    // بلا شرطة طويلة ولا قصيرة في أي نص
    for (const t of [one, two, resetConfirmAr([])]) expect(t).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('التقاط رمز الرابط في منصة القادة', () => {
  const at = (hash) => {
    const replaced = [];
    vi.stubGlobal('location', { hash, pathname: '/' });
    vi.stubGlobal('history', { replaceState: (...a) => replaced.push(a) });
    return { token: captureTryLink(), replaced };
  };
  it('الرمز من جزء الرابط، ويُزال من العنوان فور قراءته', () => {
    const t = 'A'.repeat(43);
    const url = demoLinkUrl('https://leaders.test', t);
    expect(url).toBe(`https://leaders.test/#${DEMO_LINK_HASH}=${t}`);
    const r = at(new URL(url).hash);
    expect(r.token).toBe(t);
    expect(r.replaced).toEqual([[null, '', '/']]);
  });
  it('ما ليس رابط تجربة لا يُلتقط ولا يُمس العنوان', () => {
    for (const h of ['', '#demo=' + 'A'.repeat(30), '#try=short', '#try=has space' + 'A'.repeat(30), '#/leaders/overview', `#try=${'A'.repeat(43)}&x=1`]) {
      const r = at(h);
      expect([h, r.token, r.replaced.length]).toEqual([h, null, 0]);
    }
  });
  it('رموز الرد التي لها رسالة رابط بعنوانها', () => {
    expect(TRY_GONE).toEqual(['link_expired', 'link_revoked', 'link_invalid']);
  });
});

describe('ربط الأفعال في الخادم', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  it('القائمة والإنشاء والإلغاء بغلاف writer، وإعادة الضبط بغلاف superWriter كما كانت', () => {
    expect(index).toContain("'admin.demo-links': (a) => A.writer(a, () => D.linkList(), {}),");
    expect(index).toContain("'admin.demo-link-create': (a, b) => A.writer(a, D.linkCreate, b),");
    expect(index).toContain("'admin.demo-link-revoke': (a, b) => A.writer(a, D.linkRevoke, b),");
    expect(index).toContain("'admin.demo-reset': (a, b) => A.superWriter(a, D.reset, b),");
  });
  it('فتح الرابط فعل مفتوح لا يأخذ إلا الرمز، وحارس جلسة الرابط في معالج الطلب لحساب العرض وحده', () => {
    expect(index).toContain("'demo.link-open': (b, ctx) => D.linkOpen(b, ctx),");
    expect(index).toContain('if (p.is_demo && await D.linkSession(sessionId)) (ctx as any).demoShared = true;');
  });
  it('الرمز لا يُحفظ: بصمته فقط في الإدراج، والقراءات بلا عمود البصمة', () => {
    const demo = read('supabase/functions/leaders-api/demo.ts');
    expect(demo).toContain("const LINK_COLS = 'id, label, created_by, created_at, expires_at, revoked_at, last_used_at, uses';");
    expect(demo).toMatch(/from\('demo_links'\)\.insert\(\{\s*token_hash: await hash\(token\), label: input\.label, created_by: a\.email, expires_at:/);
    expect(demo.match(/token_hash/g).length).toBeGreaterThanOrEqual(3);
    expect(demo).not.toMatch(/select\('\*'\)[^;]*demo_links|from\('demo_links'\)\.select\('\*'\)/);
  });
});

const MIG = read('supabase/migrations/20261119100000_leaders_demo_share_links.sql');
describe('ترحيل 20261119100000_leaders_demo_share_links', () => {
  it('متسامح بملاحظته، ومغلق أمام المتصفح، وبلا بريد ولا جوال في الجدول، وبنسخة وأمر إرجاع لما يُفك', () => {
    expect(MIG).toMatch(/^-- deploy-gate: tolerant \S/m);
    expect(MIG).toMatch(/alter table leaders\.demo_links enable row level security/);
    expect(MIG).toMatch(/revoke all on leaders\.demo_links from anon, authenticated/);
    expect(MIG).toMatch(/^-- restore: \S/m);
    const table = MIG.slice(MIG.indexOf('create table if not exists leaders.demo_links'), MIG.indexOf(');', MIG.indexOf('create table if not exists leaders.demo_links')));
    expect(table).not.toMatch(/email|phone|\bip\b|user_agent|participant_id/);
    expect(table).toMatch(/token_hash text not null unique/);
  });
  it('يُطبَّق مرتين، ويفك صفًا مخالفًا بعد حفظه، ثم يرفض ربط حساب العرض بجهة ويقبل ما سواه', async () => {
    const d = new PGlite();
    await d.exec(`create role anon; create role authenticated; create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.participants (id uuid primary key default gen_random_uuid(), is_demo boolean not null default false, organization_id uuid, org_via text);
      create table leaders.auth_sessions (id uuid primary key default gen_random_uuid(), participant_id uuid not null, token_hash text not null);
      insert into leaders.participants (id, is_demo, organization_id, org_via) values
        ('00000000-0000-4000-8000-000000000001', true, '00000000-0000-4000-8000-0000000000aa', 'admin'),
        ('00000000-0000-4000-8000-000000000002', false, '00000000-0000-4000-8000-0000000000aa', 'link');`);
    await d.exec(MIG);
    await d.exec(MIG);
    const rows = (await d.query('select is_demo, organization_id, org_via from leaders.participants order by id')).rows;
    expect(rows).toEqual([{ is_demo: true, organization_id: null, org_via: null }, { is_demo: false, organization_id: '00000000-0000-4000-8000-0000000000aa', org_via: 'link' }]);
    // الصف المخالف محفوظ بجهته قبل الفك، مرة واحدة ولو أُعيد التشغيل
    expect((await d.query('select id, organization_id, org_via from leaders.backup_20261119_demo_org')).rows).toEqual([{ id: '00000000-0000-4000-8000-000000000001', organization_id: '00000000-0000-4000-8000-0000000000aa', org_via: 'admin' }]);
    await expect(d.exec("update leaders.participants set organization_id = '00000000-0000-4000-8000-0000000000aa' where is_demo")).rejects.toThrow(/participants_demo_no_org/);
    await expect(d.exec("insert into leaders.participants (is_demo, organization_id) values (true, '00000000-0000-4000-8000-0000000000aa')")).rejects.toThrow(/participants_demo_no_org/);
    await d.exec("insert into leaders.participants (is_demo, organization_id) values (false, '00000000-0000-4000-8000-0000000000aa'), (false, null)");
    // جدول الروابط: بصمة بطول 64، واسم من 1 إلى 80، وجلسة تُنسب إلى رابطها وتُفك نسبتها بحذفه
    const h = 'a'.repeat(64);
    await d.exec(`insert into leaders.demo_links (id, token_hash, label, created_by, expires_at) values ('00000000-0000-4000-8000-0000000000b1', '${h}', 'مدير الدفعة', 'a@x.com', now() + interval '7 days')`);
    for (const bad of [`('short', 'اسم', 'a@x.com', now())`, `('${'b'.repeat(64)}', '', 'a@x.com', now())`, `('${'c'.repeat(64)}', '${'x'.repeat(81)}', 'a@x.com', now())`, `('${h}', 'مكرر', 'a@x.com', now())`]) {
      await expect(d.exec(`insert into leaders.demo_links (token_hash, label, created_by, expires_at) values ${bad}`)).rejects.toThrow();
    }
    await d.exec("insert into leaders.auth_sessions (participant_id, token_hash, demo_link_id) values ('00000000-0000-4000-8000-000000000001', 's1', '00000000-0000-4000-8000-0000000000b1')");
    await d.exec("delete from leaders.demo_links where id = '00000000-0000-4000-8000-0000000000b1'");
    expect((await d.query('select demo_link_id from leaders.auth_sessions')).rows).toEqual([{ demo_link_id: null }]);
    expect((await d.query('select name from leaders.schema_migrations')).rows.map((r) => r.name)).toContain('20261119100000_leaders_demo_share_links');
  });
});
