// ترحيل 20261115230000 (إدارة المساعد) على قاعدة مؤقتة: Vault محاكى بجدول ودالتين ومنظر كما في Supabase، فالمفتاح
// يُحفظ ويُقرأ ويُحذف ولا يُعاد من دالة الحفظ، والتحقق الإضافي يُستهلك مرة واحدة ولجلسته، وتشغيل واحد جارٍ، والعقد ذري.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/20261115230000_leaders_agent_admin.sql'), 'utf8');
const BEFORE = `create role anon; create role authenticated; create role service_role; create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.organizations (id uuid primary key default gen_random_uuid(), name text);
  create table public.admin_users (id uuid primary key, email text);
  create table public.contact_requests (id uuid primary key default gen_random_uuid(), name text, email text);
  create table public.webauthn_challenges (id uuid primary key default gen_random_uuid(), scope text, purpose text not null constraint webauthn_challenges_purpose_check check (purpose in ('register', 'authenticate')), subject text, challenge text, expires_at timestamptz, consumed_at timestamptz, created_at timestamptz default now());
  create table leaders.conversations (id uuid primary key default gen_random_uuid(), product text, locale text, status text, rating smallint, visitor_messages integer default 0, contact_request_id uuid, handoff_reason text, handoff_at timestamptz, created_at timestamptz default now());
  create table leaders.conversation_messages (id bigserial primary key, conversation_id uuid, role text, body text, model text, input_tokens int, cache_read_tokens int, cache_write_tokens int, output_tokens int, cost_micros bigint, created_at timestamptz default now());
  insert into public.admin_users values ('00000000-0000-0000-0000-000000000001', 'o@x.sa');`;
const VAULT = `create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, description text, secret text);
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (s, n, d) returning id $$;
  create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;`;
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz-WXYZ';

async function db(vault = true) {
  const d = new PGlite();
  await d.exec(BEFORE);
  if (vault) await d.exec(VAULT);
  await d.exec(SQL);
  await d.exec(SQL);
  return d;
}
const one = async (d, q, p = []) => (await d.query(q, p)).rows[0];

describe('ترحيل 20261115230000_leaders_agent_admin', () => {
  it('صف إعداد واحد مطفأ افتراضيًا، والجهة تسمح بالمرافق افتراضيًا، والترحيل مسجل ويُعاد بأمان', async () => {
    const d = await db();
    expect((await d.query('select enabled from leaders.agent_settings')).rows).toEqual([{ enabled: false }]);
    await d.exec(`insert into leaders.organizations (name) values ('جهة')`);
    expect((await one(d, 'select companion_allowed from leaders.organizations')).companion_allowed).toBe(true);
    expect((await one(d, `select count(*)::int n from leaders.schema_migrations where name = '20261115230000_leaders_agent_admin'`)).n).toBe(1);
    await expect(d.exec('insert into leaders.agent_settings (id) values (false)')).rejects.toThrow();
  });

  it('المفتاح في Vault: الحفظ يعيد آخر أربعة وحدها، والتحديث يبقي السر نفسه، والقراءة لـ agent_runtime، والرجوع يحذفه', async () => {
    const d = await db();
    const r = await one(d, 'select * from leaders.agent_key_set($1, $2)', [KEY, 'o@x.sa']);
    expect(r.key_last4).toBe('WXYZ');
    expect(JSON.stringify(r)).not.toContain('abcdefgh');
    const sid = (await one(d, 'select key_secret_id from leaders.agent_settings')).key_secret_id;
    await one(d, 'select * from leaders.agent_key_set($1, $2)', [`${KEY.slice(0, -4)}ABCD`, 'o@x.sa']);
    expect((await one(d, 'select key_secret_id, key_last4 from leaders.agent_settings'))).toEqual({ key_secret_id: sid, key_last4: 'ABCD' });
    expect((await one(d, 'select count(*)::int n from vault.secrets')).n).toBe(1);
    expect((await one(d, 'select api_key from leaders.agent_runtime()')).api_key).toBe(`${KEY.slice(0, -4)}ABCD`);
    await d.query(`select leaders.agent_key_clear('runbook')`);
    expect((await one(d, 'select count(*)::int n from vault.secrets')).n).toBe(0);
    expect((await one(d, 'select api_key from leaders.agent_runtime()')).api_key).toBe(null);
  });

  it('صيغة خاطئة ترفض برسالة ثابتة لا تقتبس المعامل، وبلا Vault يرد vault_unavailable والقراءة بلا مفتاح', async () => {
    const d = await db();
    await expect(d.query('select * from leaders.agent_key_set($1, $2)', ['not-a-key-secret', 'x'])).rejects.toThrow(/^invalid_key$/);
    const nv = await db(false);
    await expect(nv.query('select * from leaders.agent_key_set($1, $2)', [KEY, 'x'])).rejects.toThrow(/vault_unavailable/);
    expect(await one(nv, 'select enabled, api_key from leaders.agent_runtime()')).toEqual({ enabled: false, api_key: null });
  });

  it('حالة المفتاح مرة في الدقيقة لكل نتيجة، والخطأ المختلف يُكتب، والرمز مقيد', async () => {
    const d = await db();
    await d.query(`select leaders.agent_key_status(false, 'http_401', 'db')`);
    const first = await one(d, 'select key_error, key_error_at from leaders.agent_settings');
    await d.query(`select leaders.agent_key_status(false, 'http_401', 'db')`);
    expect((await one(d, 'select key_error_at from leaders.agent_settings')).key_error_at).toEqual(first.key_error_at);
    await d.query(`select leaders.agent_key_status(false, 'http_429', 'db')`);
    expect((await one(d, 'select key_error from leaders.agent_settings')).key_error).toBe('http_429');
    await d.query(`select leaders.agent_key_status(false, 'free text with secret', 'db')`);
    expect((await one(d, 'select key_error from leaders.agent_settings')).key_error).toBe('network');
  });

  it('التحقق الإضافي يُستهلك مرة واحدة لجلسته ومديره وحدهما، والمنتهي لا يُستهلك', async () => {
    const d = await db();
    const h = 'a'.repeat(64);
    const admin = '00000000-0000-0000-0000-000000000001';
    await d.query(`insert into public.admin_step_ups (admin_id, session_hash, purpose, method, expires_at) values ($1, $2, 'agent_key', 'totp', now() + interval '5 minutes')`, [admin, h]);
    await d.query(`insert into public.admin_step_ups (admin_id, session_hash, purpose, method, expires_at) values ($1, $2, 'agent_key', 'passkey', now() - interval '1 second')`, [admin, 'b'.repeat(64)]);
    expect((await one(d, `select public.admin_step_up_consume($1, $2, 'agent_key') m`, ['c'.repeat(64), admin])).m).toBe(null);
    expect((await one(d, `select public.admin_step_up_consume($1, $2, 'agent_key') m`, ['b'.repeat(64), admin])).m).toBe(null);
    expect((await one(d, `select public.admin_step_up_consume($1, $2, 'agent_key') m`, [h, admin])).m).toBe('totp');
    expect((await one(d, `select public.admin_step_up_consume($1, $2, 'agent_key') m`, [h, admin])).m).toBe(null);
    await d.query(`insert into public.webauthn_challenges (purpose) values ('step_up')`);    // الخطوة الزمنية نفسها لا تُقبل مرتين للمدير نفسه (طلبان معًا)
    const ins = (step) => d.query(`insert into public.admin_step_ups (admin_id, session_hash, purpose, method, totp_step, expires_at) values ($1, $2, 'agent_key', 'totp', $3, now() + interval '5 minutes')`, [admin, h, step]);
    await ins(1000);
    await expect(ins(1000)).rejects.toThrow(/admin_step_ups_totp_once|duplicate/);
    await ins(1001);
  });

  it('تشغيل واحد جارٍ، والعقد ذري لا يُؤخذ مرتين، والتكلفة تُجمع', async () => {
    const d = await db();
    const ins = `insert into leaders.agent_eval_runs (model, knowledge_version, prompt_version, cases_version, fingerprint, total_cases, started_by) values ('m', 'k', 'p', 'c', 'f', 63, 'o@x.sa') returning id`;
    const id = (await one(d, ins)).id;
    await expect(d.query(ins)).rejects.toThrow();
    expect((await d.query('select id from leaders.agent_eval_lease($1, 120)', [id])).rows.length).toBe(1);
    expect((await d.query('select id from leaders.agent_eval_lease($1, 120)', [id])).rows.length).toBe(0);
    await d.query('select leaders.agent_eval_add_cost($1, 500)', [id]);
    await d.query('select leaders.agent_eval_add_cost($1, 700)', [id]);
    expect(Number((await one(d, 'select cost_micros from leaders.agent_eval_runs')).cost_micros)).toBe(1200);
  });

  it('قائمة المحادثات: الاسم والبريد من طلب التواصل وحده، والعدد الكلي، والملخص', async () => {
    const d = await db();
    const cr = (await one(d, `insert into public.contact_requests (name, email) values ('سارة', 's@x.sa') returning id`)).id;
    const c1 = (await one(d, `insert into leaders.conversations (product, status) values ('MI-HOME', 'bot') returning id`)).id;
    await one(d, `insert into leaders.conversations (product, status, contact_request_id, handoff_at) values ('MI-LEADERS', 'waiting', $1, now()) returning id`, [cr]);
    await d.query(`insert into leaders.conversation_messages (conversation_id, role, body, model, cost_micros, input_tokens, cache_read_tokens) values ($1, 'agent', 'رد', 'claude-haiku-5-5', 900, 10, 6000), ($1, 'canned', 'جاهز', 'faq:x', null, null, null)`, [c1]);
    const rows = (await d.query(`select * from leaders.agent_admin_conversations(now() - interval '1 day', now() + interval '1 day', 25, 0, 'all')`)).rows;
    expect(rows.length).toBe(2);
    expect(Number(rows[0].total)).toBe(2);
    const visitor = rows.find((r) => !r.contact_request_id);
    expect([visitor.contact_name, visitor.model_calls, Number(visitor.cost_micros)]).toEqual([null, 1, 900]);
    expect(rows.find((r) => r.contact_request_id).contact_email).toBe('s@x.sa');
    expect((await d.query(`select * from leaders.agent_admin_conversations(now() - interval '1 day', now() + interval '1 day', 25, 0, 'visitor')`)).rows.length).toBe(1);
    const c = await one(d, `select * from leaders.agent_admin_counts(now() - interval '1 day')`);
    expect([c.conversations, c.handoffs, c.with_calls, c.canned, c.agent].map(Number)).toEqual([2, 1, 1, 1, 1]);
    const u = await one(d, `select * from leaders.agent_admin_usage(now() - interval '1 day')`);
    expect(Number(u.cache_read_tokens)).toBe(6000);
  });

  it('لا يصل anon ولا authenticated إلى الجداول ولا الدوال', async () => {
    const d = await db();
    for (const role of ['anon', 'authenticated']) {
      await d.exec(`set role ${role}`);
      try {
        await expect(d.query('select * from leaders.agent_settings')).rejects.toThrow();
        await expect(d.query('select * from public.admin_step_ups')).rejects.toThrow();
        await expect(d.query('select * from leaders.agent_runtime()')).rejects.toThrow();
      } finally { await d.exec('reset role'); }
    }
  });
});
