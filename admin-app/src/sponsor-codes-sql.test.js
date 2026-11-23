// ترحيل 20261126100000 (رموز الرعاية) على قاعدة مؤقتة حقيقية (PGlite): الاستهلاك الذري redeem_sponsor_code بشروطه كلها،
// والعدّ مرة واحدة لكل مشارك، والجهة الموقوفة توقف رموزها، وقيود الجدول، وإعادة التشغيل بلا أثر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const NAME = '20261126100000_leaders_sponsor_codes';
const SQL = readFileSync(join(__dirname, `../../supabase/migrations/${NAME}.sql`), 'utf8');
const ORG = '00000000-0000-4000-8000-000000000801', OFF = '00000000-0000-4000-8000-000000000802';
const P = (n) => `00000000-0000-4000-8000-00000000090${n}`;
const BEFORE = `create role anon; create role authenticated; create role service_role;
  create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.organizations (id uuid primary key, status text not null default 'active', invite_code text);
  create table leaders.participants (id uuid primary key);
  insert into leaders.organizations (id) values ('${ORG}'), ('${OFF}');
  insert into leaders.participants values ('${P(1)}'), ('${P(2)}'), ('${P(3)}');`;

async function db() { const d = new PGlite(); await d.exec(BEFORE); await d.exec(SQL); return d; }
const redeem = async (d, code, p) => (await d.query('select * from leaders.redeem_sponsor_code($1, $2)', [code, p])).rows[0];
const used = async (d, code) => (await d.query('select used from leaders.sponsor_codes where code = $1', [code])).rows[0].used;
const add = (d, code, extra = '', org = ORG) => d.exec(`insert into leaders.sponsor_codes (organization_id, code${extra ? ', ' + extra.split('=')[0] : ''}) values ('${org}', '${code}'${extra ? ', ' + extra.split('=')[1] : ''})`);

describe(`ترحيل ${NAME}`, { timeout: 60000 }, () => {
  it('يربط ويعدّ مرة واحدة لكل مشارك، ويقف عند الحد', async () => {
    const d = await db();
    await add(d, 'manz-aaaa-bbbb', 'max_uses=2');
    expect(await redeem(d, ' MANZ-AAAA-BBBB ', P(1))).toEqual({ org_id: ORG, reason: 'ok' });
    expect(await redeem(d, 'manz-aaaa-bbbb', P(1))).toEqual({ org_id: ORG, reason: 'ok' });
    expect(await used(d, 'manz-aaaa-bbbb')).toBe(1);
    expect((await redeem(d, 'manz-aaaa-bbbb', P(2))).reason).toBe('ok');
    expect(await redeem(d, 'manz-aaaa-bbbb', P(3))).toEqual({ org_id: null, reason: 'exhausted' });
    expect(await used(d, 'manz-aaaa-bbbb')).toBe(2);
    expect((await d.query('select count(*)::int n from leaders.sponsor_code_uses')).rows[0].n).toBe(2);
  });

  it('الموقوف والمنتهي والمجهول والجهة الموقوفة: لا عدّ ولا صف استخدام', async () => {
    const d = await db();
    await add(d, 'stop-code-01', 'active=false');
    await add(d, 'old-code-001', "expires_at=now() - interval '1 minute'");
    await add(d, 'off-org-code', '', OFF);
    expect((await redeem(d, 'stop-code-01', P(1))).reason).toBe('stopped');
    expect((await redeem(d, 'old-code-001', P(1))).reason).toBe('expired');
    expect((await redeem(d, 'nope-nope-01', P(1))).reason).toBe('unknown');
    await d.exec(`update leaders.organizations set status = 'inactive' where id = '${OFF}'`);
    expect(await redeem(d, 'off-org-code', P(1))).toEqual({ org_id: null, reason: 'unknown' });
    await d.exec(`update leaders.organizations set status = 'active' where id = '${OFF}'`);
    expect((await redeem(d, 'off-org-code', P(1))).reason).toBe('ok');
    expect((await d.query('select count(*)::int n from leaders.sponsor_code_uses')).rows[0].n).toBe(1);
    expect(await used(d, 'stop-code-01')).toBe(0);
  });

  it('القيود: الرمز فريد وبأحرف صغيرة، والحد موجب، وإعادة التشغيل بلا أثر', async () => {
    const d = await db();
    await add(d, 'manz-aaaa-bbbb');
    await expect(add(d, 'manz-aaaa-bbbb')).rejects.toThrow(/sponsor_codes_code_uidx/);
    await expect(add(d, 'MANZ-UPPER-1')).rejects.toThrow(/check/);
    await expect(add(d, 'manz-zero-01', 'max_uses=0')).rejects.toThrow(/check/);
    await d.exec(SQL);
    expect((await d.query(`select count(*)::int n from leaders.schema_migrations where name = '${NAME}'`)).rows[0].n).toBe(1);
    expect((await d.query('select count(*)::int n from leaders.sponsor_codes')).rows[0].n).toBe(1);
  });
});
