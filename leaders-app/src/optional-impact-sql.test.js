// فحص أثر قاعدة «الاختياري لا يُحسب» على البيانات القائمة (scripts/db/verify-optional-impact.sql): يُشغَّل هنا على قاعدة محلية
// من البنية المرجعية ببيانات مصنوعة، بالطريقة التي يشغّله بها apply-migration.mjs --verify (فحص لكل «-- n)»، استعلام قراءة
// واحد يعيد ok وdetail). يثبت أن الملف يُنفَّذ قبل ترحيل عمود الوسم وبعده، وأن أرقامه تطابق ما صُنع.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const BASE = readFileSync(join(root, 'supabase/schema/baseline.sql'), 'utf8');
const FILE = readFileSync(join(root, 'scripts/db/verify-optional-impact.sql'), 'utf8');
const SUPABASE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
// كما يقسمها المشغّل (apply-migration.mjs)
const checks = FILE.split(/^(?=-- \d+\) )/m).filter((c) => /^-- \d+\) /.test(c))
  .map((c) => ({ title: c.split('\n')[0].slice(3).trim(), sql: c.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim().replace(/;\s*$/, '') }));

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const req = (n, stage, kind, required, code) => ({ id: U(n), code, stage_key: stage, kind, required, active: true, title_ar: code, sort: n });
// برنامج: «تدريب» (حضور إلزامي، قراءة اختيارية)، «إثراء» تكتمل بأي متطلب (بند إلزامي وبند اختياري)، «لقاء» (ورشة اختيارية واستبانة)
const DATA = {
  stages: [
    { key: 'training', title_ar: 'التدريب', sort: 1, active: true },
    { key: 'enrich', title_ar: 'الإثراء', sort: 2, active: true, rules: { complete: 'any' } },
    { key: 'meet', title_ar: 'اللقاء', sort: 3, active: true },
  ],
  requirements: [
    req(1, 'training', 'workshop', true, 'T-ATTEND'), req(2, 'training', 'manual', false, 'T-OPT'),
    req(3, 'enrich', 'manual', true, 'E-REQ'), req(4, 'enrich', 'manual', false, 'E-OPT'),
    req(5, 'meet', 'workshop', false, 'M-WS'), req(6, 'meet', 'survey', true, 'M-SURVEY'),
    req(7, 'meet', 'manual', false, 'M-HIDDEN'),
  ],
};
const SEED = `
  set session_replication_role = replica;
  insert into leaders.programs (id, name, is_default) values ('${U(900)}', 'برنامج', true);
  insert into leaders.program_versions (id, program_id, number, label, data) values ('${U(901)}', '${U(900)}', 1, 'النسخة 1', '${JSON.stringify(DATA)}'::jsonb);
  insert into leaders.cohorts (id, name, program_id, program_version_id, status, is_default, hidden_requirements) values
    ('${U(910)}', 'دفعة أ', '${U(900)}', '${U(901)}', 'running', false, '{M-HIDDEN}'),
    ('${U(911)}', 'دفعة مغلقة', '${U(900)}', '${U(901)}', 'closed', false, '{}'),
    ('${U(912)}', 'دفعة بلا نسخة', '${U(900)}', null, 'open', false, '{}');
  insert into leaders.participants (id, email, full_name, status, is_demo, is_test) values
    ('${U(1)}', 'p1@x.sa', 'سارة', 'enrolled', false, false), ('${U(2)}', 'p2@x.sa', 'فهد', 'enrolled', false, false),
    ('${U(3)}', 'p3@x.sa', 'نورة', 'enrolled', false, false), ('${U(4)}', 'demo@demo.milestone-impact.org', 'عرض', 'enrolled', true, false),
    ('${U(5)}', 'out@x.sa', 'منسحب', 'withdrawn', false, false), ('${U(6)}', 'closed@x.sa', 'في المغلقة', 'enrolled', false, false);
  insert into leaders.enrollments (participant_id, cohort_id, status) values
    ('${U(1)}', '${U(910)}', 'active'), ('${U(2)}', '${U(910)}', 'active'), ('${U(3)}', '${U(910)}', 'active'),
    ('${U(4)}', '${U(910)}', 'active'), ('${U(5)}', '${U(910)}', 'active'), ('${U(6)}', '${U(911)}', 'active');
  insert into leaders.participant_requirements (participant_id, requirement_id, status, completed_at) values
    ('${U(1)}', '${U(4)}', 'done', now() - interval '2 days'),
    ('${U(2)}', '${U(3)}', 'done', now() - interval '2 days'), ('${U(2)}', '${U(4)}', 'done', now() - interval '40 days'),
    ('${U(3)}', '${U(2)}', 'done', now() - interval '1 day'),
    ('${U(4)}', '${U(4)}', 'done', now() - interval '1 day');
  insert into leaders.workshop_sessions (id, requirement_id, cohort_id, title_ar, secret, active) values
    ('${U(20)}', '${U(1)}', '${U(910)}', 'اليوم 1', 's', true), ('${U(21)}', '${U(5)}', '${U(910)}', 'لقاء مفتوح', 's', true);
  insert into leaders.workshop_attendance (session_id, participant_id, method) values
    ('${U(20)}', '${U(1)}', 'qr'), ('${U(21)}', '${U(1)}', 'qr'), ('${U(21)}', '${U(2)}', 'qr'), ('${U(21)}', '${U(4)}', 'qr');
  insert into leaders.certificates (serial, participant_id, status, snapshot, signature) values ('MI-LDR-2026-ABC123', '${U(1)}', 'valid', '{}'::jsonb, 'x');
`;
const run = async (db) => {
  const out = [];
  for (const c of checks) {
    const { rows } = await db.query(c.sql);
    out.push({ title: c.title, ok: rows[0].ok, detail: rows[0].detail, n: rows.length });
  }
  return out;
};

describe('scripts/db/verify-optional-impact.sql', () => {
  it('سبعة فحوص، كل منها استعلام قراءة واحد يقبله المشغّل', () => {
    expect(checks.map((c) => c.title.replace(/\).*$/, ''))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    for (const c of checks) {
      expect(/^(select|with)\b/i.test(c.sql), c.title).toBe(true);
      expect(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(c.sql), c.title).toBe(false);
      expect(c.sql.includes(';'), c.title).toBe(false);
    }
    expect(FILE).not.toMatch(/[–—]/);
  });

  it('على قاعدة فارغة: يعمل ويقول صفرًا', async () => {
    const db = new PGlite();
    await db.exec(SUPABASE);
    await db.exec(BASE);
    const r = await run(db);
    expect(r.map((x) => [x.ok, x.n])).toEqual(Array(7).fill([true, 1]));
    expect(r[0].detail).toMatch(/^0 نشاطًا اختياريًا في 0 دفعة/);
  }, 90000);

  it('ببيانات مصنوعة: الأرقام كما صُنعت، وحساب العرض والمنسحب والدفعة المغلقة والبند المخفي خارجها', async () => {
    const db = new PGlite();
    await db.exec(SUPABASE);
    await db.exec(BASE);
    await db.exec(SEED);
    const r = await run(db);
    // 1) ثلاثة أنشطة اختيارية ظاهرة في دفعة واحدة (المخفي خارجها)، ودفعة بلا نسخة تُذكر
    expect(r[0].detail).toMatch(/^3 نشاطًا اختياريًا في 1 دفعة غير مغلقة \(بالنوع: manual 2، workshop 1\)\. ودفعات غير مغلقة بلا نسخة مثبتة \(خارج هذه الفحوص\): 1$/);
    // 2) ثلاث مراحل فيها اختياري، وأعضاء الدفعة ثلاثة
    expect(r[1].detail).toMatch(/^3 مرحلة فيها نشاط اختياري، في دفعات فيها 3 مشاركًا/);
    expect(r[1].detail).toContain('دفعة أ ← enrich (1 إلزامي و1 اختياري)');
    expect(r[1].detail).toContain('دفعة أ ← meet (1 إلزامي و1 اختياري)');
    // 3) سارة اكتملت مرحلتها بالاختياري وحده: تعود غير مكتملة. فهد أنجز الإلزامي فلا يتأثر. حساب العرض لا يُعد
    expect(r[2].ok).toBe(false);
    expect(r[2].detail).toMatch(/^1 مرحلة تكتمل «بأي متطلب» وفيها نشاط اختياري\. 1 مشاركًا اكتملت مرحلته ببند اختياري وحده/);
    expect(r[2].detail).toContain('1 في دفعة أ ← الإثراء');
    expect(r[2].detail).toMatch(/\(يُراجع باليد\): 0$/);
    // 4) استبانة «اللقاء» كانت تنتظر ورشة اختيارية وحدها
    expect(r[3].detail).toMatch(/^1 مرحلة استبانتها كانت تنتظر حضور ورشة اختيارية وحدها.*: دفعة أ ← meet$/);
    // 5) إنجازان لنشاط اختياري في 30 يومًا من مشاركين اثنين (ما قبل 30 يومًا وحساب العرض خارجه)
    expect(r[4].detail).toMatch(/^2 إنجازًا لنشاط اختياري من 2 مشاركًا في 30 يومًا/);
    // 6) جلسة واحدة في نشاط حضور اختياري، وحضوران فيها (بلا حساب العرض)، ولا ورشة موسومة اختيارية
    expect(r[5].ok).toBe(true);
    expect(r[5].detail).toMatch(/^1 جلسة قائمة في أنشطة حضور اختيارية، و0 ورشة موسومة اختيارية.*2 حضورًا من 2 مشاركًا/);
    // 7) الشهادات لا تُمس
    expect(r[6].detail).toMatch(/^1 شهادة سارية: لا تُسحب/);

    // وبعد أول استعمال للوسم: الورشة الموسومة تُعد وحضورها، والفحص ينبه
    await db.exec(`set session_replication_role = replica; update leaders.workshop_sessions set optional = true where id = '${U(20)}';`);
    const after = await run(db);
    expect([after[5].ok, /و1 ورشة موسومة اختيارية/.test(after[5].detail), /3 حضورًا من 2 مشاركًا/.test(after[5].detail)]).toEqual([false, true, true]);
    // وقبل ترحيل العمود: الفحص نفسه يعمل (to_jsonb)، فالملف يُشغَّل على الإنتاج قبل أي ترحيل
    await db.exec('alter table leaders.workshop_sessions drop column optional;');
    const before = await run(db);
    expect([before[5].ok, before[5].n]).toEqual([true, 1]);
  }, 90000);
});
