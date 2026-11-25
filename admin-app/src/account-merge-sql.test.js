// ترحيل 20261128190000 (حساب واحد بأكثر من بريد، ودمج المكرر بالهاتف) على البنية المرجعية كاملة في PGlite، فالدمج يمر على كل
// جدول له مفتاح أجنبي إلى المشارك كما هو في الإنتاج: النقل بأنواعه (عمود عادي، مفتاح مركب، هوية، مفتاح يشير إلى الوثيقة، مفتاح
// يُفرَّغ عند الحذف)، والتعارض وحفظه، والبريد البديل وتفرده عبر الجدولين، وإعادة التشغيل، وسطر الإرجاع، والفهرس بعده.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { EXPORT_SKIPPED, EXPORT_TABLES } from '../../supabase/functions/leaders-api/privacy.js';

const root = join(__dirname, '../..');
const BASELINE = readFileSync(join(root, 'supabase/schema/baseline.sql'), 'utf8');
const read = (n) => readFileSync(join(root, `supabase/migrations/${n}.sql`), 'utf8');
const M3 = read('20261128190000_leaders_account_emails_merge');
const M2 = read('20261128180000_leaders_phone_unique');
const SUPABASE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(1), V1 = U(2), C1 = U(3), C2 = U(4), INS = U(5), Q1 = U(6), Q2 = U(7);
const K1 = U(101), D1 = U(102), K2 = U(103), D2 = U(104), K3 = U(105), D3 = U(106), DEMO = U(107), OTHER = U(108);
const A_SUB = U(201), A_KIP = U(202), A_DIP = U(203);

// الحالة قبل الترحيل: البنية المرجعية بلا فهرس الهاتف (لم يُطبَّق 20261128180000 على الإنتاج)، وأزواج مكررة لها أثر
const SEED = `
  drop index leaders.participants_phone_key_uniq;
  insert into leaders.programs (id, name, is_default) values ('${PROG}', 'برنامج القادة', true);
  insert into leaders.program_versions (id, program_id, number, label, data) values ('${V1}', '${PROG}', 1, 'v1', '{}');
  insert into leaders.cohorts (id, name, program_id, program_version_id) values ('${C1}', 'دفعة أولى', '${PROG}', '${V1}'), ('${C2}', 'دفعة ثانية', '${PROG}', '${V1}');
  insert into leaders.instruments (id, key, title_ar, kind) values ('${INS}', 'b-test', 'المبدئي', 'baseline');
  insert into leaders.questions (id, instrument_id, dimension, code, text_ar) select '${Q1}', '${INS}', key, 'q1', 'سؤال' from leaders.dimensions limit 1;
  insert into leaders.questions (id, instrument_id, dimension, code, text_ar) select '${Q2}', '${INS}', key, 'q2', 'سؤال' from leaders.dimensions limit 1;
  insert into leaders.participants (id, email, full_name, phone, status, job_title, last_login_at, created_at, email_verified_at) values
    ('${K1}', 'k1@example.test', 'باقٍ أول', '+966501111111', 'registered', null, '2026-11-20', '2026-10-05', now()),
    ('${D1}', 'd1@example.test', 'مكرر أول', '0501111111', 'enrolled', 'مدير', '2026-11-01', '2026-10-01', now()),
    ('${K2}', 'k2@example.test', 'باقٍ ثانٍ', '00966502222222', 'enrolled', null, null, '2026-10-09', null),
    ('${D2}', 'd2@example.test', 'مكرر ثانٍ', '+966502222222', 'registered', null, null, '2026-10-01', null),
    ('${K3}', 'k3@example.test', 'باقٍ ثالث', '+966503333333', 'registered', null, null, now(), null),
    ('${D3}', 'd3@example.test', 'مؤرشف', '+966503333333', 'suspended', null, null, now(), null),
    ('${OTHER}', 'o@example.test', 'غيرهم', '+966504444444', 'registered', null, null, now(), null);
  insert into leaders.participants (id, email, full_name, phone, is_demo) values ('${DEMO}', 'demo@demo.milestone-impact.org', 'تجريبي', '+966501111111', true);
  insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, after)
    values ('system', 'migration:20261128170000', 'participant.duplicate_archived', 'participants', '${D3}', '{"kept_id": "${K3}"}');
  insert into leaders.enrollments (participant_id, cohort_id) values ('${K1}', '${C1}'), ('${D1}', '${C1}'), ('${K2}', '${C1}'), ('${D2}', '${C2}'), ('${K3}', '${C1}');
  insert into leaders.assessments (id, participant_id, instrument_id, status) values ('${A_SUB}', '${D1}', '${INS}', 'submitted'),
    ('${A_KIP}', '${K1}', '${INS}', 'in_progress'), ('${A_DIP}', '${D1}', '${INS}', 'in_progress');
  insert into leaders.assessment_answers (assessment_id, question_id, value) values ('${A_KIP}', '${Q1}', '{"k": "keep"}'),
    ('${A_DIP}', '${Q1}', '{"k": "dup"}'), ('${A_DIP}', '${Q2}', '{"k": "dup2"}'), ('${A_SUB}', '${Q1}', '{"k": "sub"}');
  insert into leaders.capstones (participant_id, sponsor_token_hash) values ('${D1}', 'tok-d1'), ('${K2}', null), ('${D2}', 'tok-d2');
  insert into leaders.capstone_updates (participant_id, period) values ('${D1}', '2026-10'), ('${K2}', '2026-10'), ('${D2}', '2026-10'), ('${D2}', '2026-11');
  insert into leaders.points_ledger (participant_id, source, ref_id, points) values ('${K1}', 'chapter', '${U(301)}', 5), ('${D1}', 'chapter', '${U(301)}', 5), ('${D1}', 'model', '${U(302)}', 7);
  insert into leaders.guidance_messages (participant_id, role, body) values ('${D1}', 'user', 'سؤال من الحساب الثاني');
  insert into leaders.auth_sessions (participant_id, token_hash, method, expires_at) values ('${D1}', 'h1', 'email_code', now() + interval '1 day'), ('${K1}', 'h2', 'email_code', now() + interval '1 day');
  insert into leaders.passkeys (participant_id, credential_id, public_key) values ('${D1}', 'cred-d1', '\\x00');
  insert into leaders.payments (participant_id, email, item, product_id) values ('${D1}', 'd1@example.test', 'assessment', 'p1');
  insert into leaders.participant_emails (participant_id, email, source) values ('${D1}', 'd1-old@example.test', 'admin_link');`;

async function db(extra = '') {
  const d = new PGlite();
  await d.exec(SUPABASE); await d.exec(BASELINE); await d.exec(SEED);
  if (extra) await d.exec(extra);
  return d;
}
const rows = async (d, sql) => (await d.query(sql)).rows;
const one = async (d, sql) => (await d.query(sql)).rows[0];
const n = async (d, sql) => Number((await d.query(sql)).rows[0].n);
// لقطة ما يمسه الدمج، بلا أوقات التحديث
const snap = async (d) => JSON.stringify([
  await rows(d, 'select id, email, status, job_title, phone from leaders.participants order by id'),
  await rows(d, 'select participant_id, cohort_id, status from leaders.enrollments order by participant_id, cohort_id'),
  await rows(d, 'select id, participant_id, status from leaders.assessments order by id'),
  await rows(d, 'select assessment_id, question_id, value from leaders.assessment_answers order by 1, 2'),
  await rows(d, 'select participant_id, sponsor_token_hash from leaders.capstones order by 1'),
  await rows(d, 'select participant_id, period from leaders.capstone_updates order by 1, 2'),
  await rows(d, 'select participant_id, source, ref_id from leaders.points_ledger order by 1, 2'),
  await rows(d, 'select id, participant_id from leaders.guidance_messages order by id'),
  // الجلسة المبطلة لا تُحيا بالإرجاع، فالقائمة بلا حالها (حالها مختبر وحده)
  await rows(d, 'select token_hash, participant_id from leaders.auth_sessions order by 1'),
  await rows(d, 'select serial, participant_id, status from leaders.certificates order by 1'),
  await rows(d, 'select participant_id, status from leaders.final_evaluations order by 1'),
  await rows(d, 'select credential_id, participant_id from leaders.passkeys order by 1'),
  await rows(d, 'select product_id, participant_id from leaders.payments order by 1'),
  await rows(d, 'select participant_id, email from leaders.participant_emails order by email'),
]);

describe('ترحيل 20261128190000 (الربط والدمج)', { timeout: 120000 }, () => {
  it('يدمج كل زوج في الأحدث دخولًا: البريد بديل، والمكرر موقوف بعنوان مقفل، وسجل participant.merged', async () => {
    const d = await db();
    await d.exec(M3);
    const p = await rows(d, `select id, email, status from leaders.participants where id in ('${K1}', '${D1}', '${K2}', '${D2}', '${K3}', '${D3}') order by id`);
    expect(p.map((x) => [x.id, x.status])).toEqual([[K1, 'enrolled'], [D1, 'suspended'], [K2, 'enrolled'], [D2, 'suspended'], [K3, 'registered'], [D3, 'suspended']]);
    expect(p.find((x) => x.id === D1).email).toBe(`merged-${D1}@merged.invalid`);
    const aliases = await rows(d, 'select participant_id, email, source from leaders.participant_emails order by email');
    expect(aliases).toEqual([
      { participant_id: K1, email: 'd1-old@example.test', source: 'admin_link' }, { participant_id: K1, email: 'd1@example.test', source: 'migration' },
      { participant_id: K2, email: 'd2@example.test', source: 'migration' }, { participant_id: K3, email: 'd3@example.test', source: 'migration' }]);
    const log = await rows(d, `select entity_id, after from leaders.audit_log where action = 'participant.merged' order by entity_id`);
    expect(log.map((r) => [r.entity_id, r.after.kept_id])).toEqual([[D1, K1], [D2, K2], [D3, K3]]);
    expect(JSON.stringify(log)).not.toMatch(/@example\.test/);
    // التجريبي بالهاتف نفسه لا يُمس
    expect((await one(d, `select status from leaders.participants where id = '${DEMO}'`)).status).toBe('registered');
    // الحقل الفارغ في الباقي أخذ قيمة المكرر، والحال الأبعد
    expect((await one(d, `select job_title from leaders.participants where id = '${K1}'`)).job_title).toBe('مدير');
  });

  it('النقل بأنواعه، والتعارض يبقي صف الباقي ويحفظ صف المكرر', async () => {
    const d = await db();
    await d.exec(M3);
    // إلحاقان بالدفعة نفسها يصيران واحدًا، وبدفعتين: إلحاق المكرر يُسحب
    expect(await rows(d, `select participant_id, cohort_id, status from leaders.enrollments where participant_id in ('${K1}', '${K2}') order by participant_id, cohort_id`))
      .toEqual([{ participant_id: K1, cohort_id: C1, status: 'nominated' }, { participant_id: K2, cohort_id: C1, status: 'nominated' }, { participant_id: K2, cohort_id: C2, status: 'withdrawn' }]);
    // القياس: المُرسَل ينتقل، والجاري يتعارض مع جاري الباقي فتنتقل إجابته غير المتعارضة إلى نظيره
    expect(await rows(d, `select id, status from leaders.assessments where participant_id = '${K1}' order by id`)).toEqual([{ id: A_SUB, status: 'submitted' }, { id: A_KIP, status: 'in_progress' }]);
    expect(await rows(d, `select question_id, value from leaders.assessment_answers where assessment_id = '${A_KIP}' order by question_id`))
      .toEqual([{ question_id: Q1, value: { k: 'keep' } }, { question_id: Q2, value: { k: 'dup2' } }]);
    // الوثيقة: لا وثيقة للباقي فتنتقل برمز راعيها وتحديثها. وللباقي وثيقة: تبقى، وتحديث الشهر نفسه يتعارض والآخر ينتقل
    expect(await rows(d, `select participant_id, sponsor_token_hash from leaders.capstones order by 1`)).toEqual([{ participant_id: K1, sponsor_token_hash: 'tok-d1' }, { participant_id: K2, sponsor_token_hash: null }]);
    expect(await rows(d, `select participant_id, period from leaders.capstone_updates order by 1, 2`)).toEqual([{ participant_id: K1, period: '2026-10' }, { participant_id: K2, period: '2026-10' }, { participant_id: K2, period: '2026-11' }]);
    // مفتاح فريد مركب في النقاط، وجدول بهوية، ومفتاح يُفرَّغ عند الحذف، ومفتاح الدخول
    expect(await rows(d, `select source, ref_id from leaders.points_ledger where participant_id = '${K1}' order by 1`)).toEqual([{ source: 'chapter', ref_id: U(301) }, { source: 'model', ref_id: U(302) }]);
    expect(await n(d, `select count(*) n from leaders.guidance_messages where participant_id = '${K1}'`)).toBe(1);
    expect(await n(d, `select count(*) n from leaders.payments where participant_id = '${K1}'`)).toBe(1);
    expect(await n(d, `select count(*) n from leaders.passkeys where participant_id = '${K1}'`)).toBe(1);
    // جلسات المكرر أُبطلت وبقيت له، وجلسة الباقي قائمة
    expect(await rows(d, `select token_hash, participant_id, revoked_at is null live from leaders.auth_sessions order by 1`))
      .toEqual([{ token_hash: 'h1', participant_id: D1, live: false }, { token_hash: 'h2', participant_id: K1, live: true }]);
    // المتعارض محفوظ كاملًا
    const del = await rows(d, `select tbl, ref from leaders.participant_merge_rows where kind = 'deleted' order by tbl, id`);
    expect(del.map((r) => r.tbl).sort()).toEqual(['leaders.assessment_answers', 'leaders.assessments', 'leaders.capstone_updates', 'leaders.capstones', 'leaders.capstones', 'leaders.enrollments', 'leaders.points_ledger']);
    expect(del.find((r) => r.tbl === 'leaders.assessment_answers').ref.row.value).toEqual({ k: 'dup' });
  });

  it('لا يبقى صف يشير إلى المكرر في أي جدول له مفتاح أجنبي إلى المشارك، عدا الجلسات وسجل الدمج', async () => {
    const d = await db();
    await d.exec(M3);
    const fks = await rows(d, `select format('%I.%I', n.nspname, c.relname) t, a.attname col from pg_constraint k join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f' and k.confrelid = 'leaders.participants'::regclass`);
    expect(fks.length).toBeGreaterThan(45);
    const left = [];
    for (const f of fks) {
      if (['leaders.auth_sessions', 'leaders.participant_merges'].includes(f.t)) continue;
      if (await n(d, `select count(*) n from ${f.t} where ${f.col} in ('${D1}', '${D2}', '${D3}')`)) left.push(`${f.t}.${f.col}`);
    }
    expect(left).toEqual([]);
  });

  it('كل جدول في نسخة البيانات (privacy.js) له مفتاح أجنبي إلى المشارك في البنية المرجعية، فيدخل في الدمج', () => {
    // مباشرة إلى المشارك، أو إلى الوثيقة بعمود participant_id (تحديثاتها تنتقل مع الوثيقة في merge_resolve)
    const fk = new Set([...BASELINE.matchAll(/alter table leaders\.(\w+) add constraint \w+ FOREIGN KEY \(participant_id\) REFERENCES leaders\.(participants\(id\)|capstones\(participant_id\))/g)].map((m) => m[1]));
    expect([...Object.keys(EXPORT_TABLES), ...Object.keys(EXPORT_SKIPPED)].filter((t) => !fk.has(t))).toEqual([]);
    expect(EXPORT_TABLES.participant_emails).toBeDefined();
    // الصفوف التي تشير إلى جدول تابع بعمود participant_id لا بالمعرّف: الوثيقة وحدها، ولها معالجة صريحة في الدمج
    const indirect = [...BASELINE.matchAll(/alter table leaders\.(\w+) add constraint \w+ FOREIGN KEY \((\w+)\) REFERENCES leaders\.(\w+)\(participant_id\)/g)].map((m) => `${m[1]}->${m[3]}`);
    expect(indirect).toEqual(['capstone_updates->capstones']);
  });

  it('إعادة التشغيل لا تغيّر شيئًا، والفهرس الفريد على الهاتف يُطبَّق بعده', async () => {
    const d = await db();
    await d.exec(M3);
    const before = await snap(d);
    const logs = await n(d, 'select count(*) n from leaders.audit_log');
    await d.exec(M3);
    expect(await snap(d)).toBe(before);
    expect(await n(d, 'select count(*) n from leaders.audit_log')).toBe(logs);
    await d.exec(M2);
    expect(await n(d, `select count(*) n from pg_indexes where indexname = 'participants_phone_key_uniq'`)).toBe(1);
    await expect(d.exec(`insert into leaders.participants (email, full_name, phone) values ('new@example.test', 'جديد', '0504444444')`)).rejects.toThrow(/participants_phone_key_uniq/);
  });

  it('سطر restore يعيد الحال كما كانت قبل الدمج', async () => {
    const d = await db();
    const before = await snap(d);
    await d.exec(M3);
    expect(await snap(d)).not.toBe(before);
    await d.exec(M3.match(/^-- restore: (.*)$/m)[1]);
    expect(await snap(d)).toBe(before);
    expect(await n(d, `select count(*) n from leaders.audit_log where action = 'participant.unmerged'`)).toBe(3);
    expect(await rows(d, `select after->'skipped' s from leaders.audit_log where action = 'participant.unmerged'`)).toEqual([{ s: 0 }, { s: 0 }, { s: 0 }]);
    // جلسة المكرر تبقى مبطلة
    expect((await one(d, `select revoked_at is null live from leaders.auth_sessions where token_hash = 'h1'`)).live).toBe(false);
    // والإرجاع مرة ثانية لا يفعل شيئًا
    await d.exec(M3.match(/^-- restore: (.*)$/m)[1]);
    expect(await snap(d)).toBe(before);
  });

  it('حساب الاختبار في النطاق نفسه: يُدمج كغيره، فالأزواج والتحقق الذاتي وفهرس 20261128180000 قاعدة واحدة', async () => {
    const d = await db(`insert into leaders.participants (email, full_name, phone, is_test, last_login_at) values ('t@example.test', 'اختبار', '+966504444444', true, '2026-11-01')`);
    await d.exec(M3);
    expect((await one(d, `select status from leaders.participants where id = '${OTHER}'`)).status).toBe('suspended');
    await d.exec(M2);
  });

  it('التحقق الذاتي يرمي ويُرجع الترحيل كله إن بقي هاتف مشترك', async () => {
    const d = await db();
    const before = await snap(d);
    // الدمج معطّل في نسخة الاختبار فيبقى التكرار
    const broken = M3.replace('for r in select * from pg_temp.merge_pairs() order by kept_id, dup_id loop', 'for r in select * from pg_temp.merge_pairs() where false loop');
    expect(broken).not.toBe(M3);
    await expect(d.exec(`begin; ${broken}; commit;`)).rejects.toThrow(/account_merge: 2 phone number\(s\) still shared/);
    await d.exec('rollback').catch(() => {});
    expect(await snap(d)).toBe(before);
  });

  it('البريد الواحد لا يكون لحسابين عبر الجدولين', async () => {
    const d = await db();
    await d.exec(M3);
    await expect(d.exec(`insert into leaders.participant_emails (participant_id, email) values ('${OTHER}', 'k1@example.test')`)).rejects.toThrow(/email_taken/);
    await expect(d.exec(`update leaders.participants set email = 'd1@example.test' where id = '${OTHER}'`)).rejects.toThrow(/email_taken/);
    await expect(d.exec(`insert into leaders.participants (email, full_name) values ('d2@example.test', 'جديد')`)).rejects.toThrow(/email_taken/);
    await expect(d.exec(`insert into leaders.participant_emails (participant_id, email) values ('${OTHER}', 'D1@example.test')`)).rejects.toThrow();
    await expect(d.exec(`insert into leaders.participant_emails (participant_id, email, is_primary) values ('${OTHER}', 'x@example.test', true)`)).rejects.toThrow(/alternate_only/);
  });

  it('«اجعله أساسيًا» يبادل البريدين، والمعاينة تعيد ما سينتقل ولا تكتب شيئًا، والدمج الإداري يُرجَع', async () => {
    const d = await db();
    await d.exec(M3);
    await d.exec(`select leaders.participant_email_make_primary('${K1}', 'd1@example.test')`);
    expect((await one(d, `select email from leaders.participants where id = '${K1}'`)).email).toBe('d1@example.test');
    expect((await rows(d, `select email from leaders.participant_emails where participant_id = '${K1}' order by email`)).map((r) => r.email)).toEqual(['d1-old@example.test', 'k1@example.test']);
    await expect(d.exec(`select leaders.participant_email_make_primary('${K1}', 'o@example.test')`)).rejects.toThrow(/email_primary_not_alias/);

    await d.exec(`insert into leaders.points_ledger (participant_id, source, ref_id, points) values ('${K3}', 'chapter', '${U(301)}', 5), ('${OTHER}', 'chapter', '${U(301)}', 5), ('${OTHER}', 'lab', '${U(303)}', 1)`);
    const before = await snap(d);
    const prev = (await one(d, `select leaders.merge_preview('${K3}', '${OTHER}') s`)).s;
    expect(prev.summary.points_ledger).toEqual({ moved: 1, deleted: 1 });
    expect(prev.summary.participant_emails).toEqual({ inserted: 1 });
    // البصمة ثابتة لما لم يتغير، وتتغير بتغيّر صف سيُمس
    const prev2 = (await one(d, `select leaders.merge_preview('${K3}', '${OTHER}') s`)).s;
    expect(prev2.fingerprint).toBe(prev.fingerprint);
    await d.exec(`update leaders.points_ledger set points = 9 where participant_id = '${OTHER}' and source = 'lab'`);
    expect((await one(d, `select leaders.merge_preview('${K3}', '${OTHER}') s`)).s.fingerprint).not.toBe(prev.fingerprint);
    await d.exec(`update leaders.points_ledger set points = 1 where participant_id = '${OTHER}' and source = 'lab'`);
    expect(await snap(d)).toBe(before);
    expect(await n(d, `select count(*) n from leaders.participant_merges where actor = 'preview'`)).toBe(0);
    const mid = (await one(d, `select leaders.merge_participants('${K3}', '${OTHER}', 'admin@example.test', 'admin', 'admin_link') m`)).m;
    expect((await one(d, `select participant_id from leaders.participant_emails where email = 'o@example.test'`)).participant_id).toBe(K3);
    await d.exec(`select leaders.unmerge_participants('${mid}', 'admin', 'admin@example.test')`);
    expect(await snap(d)).toBe(before);
    await expect(d.exec(`select leaders.merge_participants('${K3}', '${DEMO}', 'a', 'admin')`)).rejects.toThrow(/merge_demo/);
    await expect(d.exec(`select leaders.merge_participants('${K1}', '${D1}', 'a', 'admin')`)).rejects.toThrow(/merge_already/);
  });

  it('الشهادة لا تُحذف: للحسابين شهادتان ساريتان، فسارية المكرر تصير replaced وتنتقل كما هي، والإرجاع يعيدها', async () => {
    const seed = `insert into leaders.certificates (serial, participant_id, snapshot, signature, status) values ('MI-LDR-2026-KKKKK1', '${K1}', '{}', 'sig', 'valid'), ('MI-LDR-2026-DDDDD1', '${D1}', '{}', 'sig', 'valid')`;
    const d = await db(seed);
    const before = await snap(d);
    await d.exec(M3);
    expect(await rows(d, 'select serial, participant_id, status from leaders.certificates order by 1')).toEqual([
      { serial: 'MI-LDR-2026-DDDDD1', participant_id: K1, status: 'replaced' }, { serial: 'MI-LDR-2026-KKKKK1', participant_id: K1, status: 'valid' }]);
    expect(await n(d, `select count(*) n from leaders.participant_merge_rows where kind = 'deleted' and tbl = 'leaders.certificates'`)).toBe(0);
    await d.exec(M3.match(/^-- restore: (.*)$/m)[1]);
    expect(await snap(d)).toBe(before);
  });

  it('الأبعد تقدمًا يبقى: تقييم ختامي معتمد في المكرر يغلب مسودة الباقي، ويُحفظ صف الباقي ويعود بالإرجاع', async () => {
    const d = await db(`insert into leaders.final_evaluations (participant_id, program_id, status, score) values ('${K1}', '${PROG}', 'draft', null), ('${D1}', '${PROG}', 'approved', 88)`);
    const before = await snap(d);
    await d.exec(M3);
    expect(await rows(d, `select participant_id, status, score from leaders.final_evaluations`)).toEqual([{ participant_id: K1, status: 'approved', score: 88 }]);
    const lost = await one(d, `select ref from leaders.participant_merge_rows where kind = 'deleted' and tbl = 'leaders.final_evaluations'`);
    expect([lost.ref.row.status, lost.ref.won]).toEqual(['draft', 'merged']);
    await d.exec(M3.match(/^-- restore: (.*)$/m)[1]);
    expect(await snap(d)).toBe(before);
  });

  it('الإرجاع: سطر لم يجد صفه يُعد في skipped، وصف أُضيف في الدمج ويشير إليه جديد يمنع الإرجاع', async () => {
    const d = await db();
    await d.exec(M3);
    const mid = (await one(d, `select id from leaders.participant_merges where merged_id = '${D1}'`)).id;
    // تحديث جديد على الوثيقة المنسوخة إلى الباقي بعد الدمج: لا تُحذف النسخة
    await d.exec(`insert into leaders.capstone_updates (participant_id, period) values ('${K1}', '2026-12')`);
    await expect(d.exec(`select leaders.unmerge_participants('${mid}', 'admin', 'a')`)).rejects.toThrow(/unmerge_blocked/);
    await d.exec(`delete from leaders.capstone_updates where period = '2026-12'`);
    // صف منقول تغيّر بعد الدمج (نُقل إلى حساب آخر): لا يجده الإرجاع فيُعد
    await d.exec(`update leaders.guidance_messages set participant_id = '${OTHER}' where participant_id = '${K1}'`);
    const res = (await one(d, `select leaders.unmerge_participants('${mid}', 'admin', 'a') r`)).r;
    expect(res.skipped).toBe(1);
    expect(res.skipped_rows[0].tbl).toBe('leaders.guidance_messages');
  });

  it('المحو: حذف الحساب الباقي يحذف الحساب المدموج فيه وصفوفهما في النسخة الاحتياطية وسجل الدمج', async () => {
    const d = await db();
    await d.exec(M3);
    expect(await n(d, `select count(*) n from leaders.backup_20261128_account_merge where id in ('${K1}', '${D1}')`)).toBe(2);
    await d.exec(`delete from leaders.certificates where participant_id = '${K1}'`);
    await d.exec(`delete from leaders.participants where id = '${K1}'`);
    expect(await n(d, `select count(*) n from leaders.participants where id in ('${K1}', '${D1}')`)).toBe(0);
    expect(await n(d, `select count(*) n from leaders.backup_20261128_account_merge where id in ('${K1}', '${D1}') or merge_kept_id = '${K1}'`)).toBe(0);
    expect(await n(d, `select count(*) n from leaders.participant_merges where kept_id = '${K1}' or merged_id = '${D1}'`)).toBe(0);
  });
});
