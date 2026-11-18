// سكربت القراءة قبل تحويل الاستشارة إلى خدمة (T2، ب5.2): scripts/db/verify-t2-service-seed.sql على البنية المرجعية في PGlite.
// يقرأ C-MEET كما هو (نوعه وإعداده وإلزاميته)، ويحسب لكل دفعة ما يحسبه cohortPlan: المراحل التي تتقدم حين تخرج الاستشارة من
// السلسلة، ومعالمها، ومن في منتصفها. قراءة فقط.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { cohortPlan } from '../../supabase/functions/leaders-api/stage-windows.js';
import { COHORTS, MILESTONES, STAGES } from './journey-legacy.cases.js';

const ROOT = join(__dirname, '../..');
const SQL = readFileSync(join(ROOT, 'supabase/schema/baseline.sql'), 'utf8');
const SUPABASE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const CHECKS = readFileSync(join(ROOT, 'scripts/db/verify-t2-service-seed.sql'), 'utf8').split(/^(?=-- \d+\) )/m).filter((c) => /^-- \d+\) /.test(c))
  .map((c) => c.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim().replace(/;\s*$/, ''));
const PID = '00000000-0000-4000-8000-000000000001', CID = '00000000-0000-4000-8000-000000000002', RID = '00000000-0000-4000-8000-000000000003';
const P = (n) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const C = { ...COHORTS.dated, schedule: { support: { days: 60 } } };
const SEED = { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] };
const SVC = STAGES.map((s) => (s.key === 'consulting' ? { ...s, rules: SEED } : s));

describe('verify-t2-service-seed.sql', () => {
  it('قراءة فقط بصيغة فحوص migrate.yml، وكل فحص صف ok وdetail', () => {
    expect(CHECKS).toHaveLength(4);
    for (const q of CHECKS) {
      expect(q).toMatch(/^(select|with)\b/i);
      expect(q).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i);
    }
  });
  it('يقرأ C-MEET ويحسب ما يحسبه cohortPlan: المراحل التي تتقدم، والمعالم، ومن في منتصف الاستشارة', async () => {
    const db = new PGlite();
    await db.exec(SUPABASE);
    await db.exec(SQL);
    const q = (s, v) => db.query(s, v);
    await q('insert into leaders.programs (id, name) values ($1, $2)', [PID, 'البرنامج']);
    for (const s of STAGES) {
      await q('insert into leaders.journey_stages (program_id, key, sort, title_ar, duration_label, duration_days, phase, rules, active) values ($1,$2,$3,$4,$5,$6,$7,$8,true)',
        [PID, s.key, s.sort, s.title_ar, '-', s.duration_days, s.phase, JSON.stringify(s.rules || {})]);
    }
    await q("insert into leaders.stage_requirements (id, program_id, stage_key, code, title_ar, kind, required, active, config, sort) values ($1,$2,'consulting','C-MEET','لقاء استشاري','coaching',true,true,$3,1)",
      [RID, PID, JSON.stringify({ sessions_required: 1, minutes: 90 })]);
    for (const m of [...MILESTONES.filter((x) => x.stage_key), { id: 'm-cons', stage_key: 'consulting', anchor: 'stage_end', offset_days: 0, complete: 'manual' }]) {
      await q('insert into leaders.program_milestones (program_id, title_ar, stage_key, anchor, offset_days, complete, active) values ($1,$2,$3,$4,$5,$6,true)', [PID, m.id, m.stage_key, m.anchor, m.offset_days, m.complete]);
    }
    await q("insert into leaders.cohorts (id, name, program_id, starts_on, ends_on, schedule, status) values ($1,'دفعة نوفمبر',$2,$3,$4,$5,'running')", [CID, PID, C.starts_on, C.ends_on, JSON.stringify(C.schedule)]);
    // ثلاثة أعضاء: واحد في منتصفها (جلسة محجوزة)، وواحد حضر، وواحد لم يحجز
    for (const n of [1, 2, 3]) {
      await q("insert into leaders.participants (id, email, full_name, status) values ($1,$2,$3,'enrolled')", [P(n), `p${n}@x.sa`, `مشارك ${n}`]);
      await q("insert into leaders.enrollments (participant_id, cohort_id, status) values ($1,$2,'active')", [P(n), CID]);
    }
    await q("insert into leaders.coaching_sessions (participant_id, requirement_id, kind, provider, status, starts_at, ends_at) values ($1,$2,'booked','calcom','booked',now() + interval '2 days',now() + interval '2 days 1 hour')", [P(1), RID]);
    await q("insert into leaders.coaching_sessions (participant_id, requirement_id, kind, provider, status, starts_at, ends_at) values ($1,$2,'booked','calcom','attended',now() - interval '2 days',now() - interval '2 days' + interval '1 hour')", [P(2), RID]);
    const out = [];
    for (const sql of CHECKS) out.push((await q(sql)).rows[0]);
    expect(out[0].ok).toBe(true);
    expect(out[0].detail).toContain('C-MEET نوعه coaching، إلزامي');
    expect(out[0].detail).toContain('"sessions_required": 1');
    expect(out[0].detail).toContain('مرحلته consulting');
    const now = cohortPlan(STAGES, C), after = cohortPlan(SVC, C);
    expect(out[1].detail).toContain(`الاستشارة الآن ${now.byKey.consulting.from} إلى ${now.byKey.consulting.to}، وبعد التحويل بلا نافذة`);
    expect(out[1].detail).toContain(`نهاية المراحل ${now.end} ثم ${after.end}`);
    const moved = STAGES.filter((s) => s.key !== 'consulting' && now.byKey[s.key].from !== after.byKey[s.key].from).map((s) => `${s.key} ${now.byKey[s.key].from}→${after.byKey[s.key].from}`);
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) expect(out[1].detail).toContain(m);
    expect(out[2].detail).toContain(`m-sup ${now.byKey.support.to}→${after.byKey.support.to}`);
    expect(out[2].detail).toContain(`معالم الاستشارة تصير بلا موعد (1): m-cons ${now.byKey.consulting.to}`);
    expect(out[3].detail).toContain('دفعة نوفمبر: الأعضاء 3. في منتصف الاستشارة (جلسة محجوزة لم تنعقد) 1، استفاد منها 1، لم يحجزها 1 (اليوم ينتظرها ما بعدها');
    // والبرنامج الذي تشير فيه مرحلة إلى الاستشارة («بعد مراحل») يُعلَّم ok=false مع اسمها
    await q("update leaders.journey_stages set rules = '{\"unlock\":\"stages\",\"after\":[\"consulting\"]}' where key = 'support'");
    const r0 = (await q(CHECKS[0])).rows[0];
    expect(r0.ok).toBe(false);
    expect(r0.detail).toContain('تشير إليها: support');
    if (process.env.T2_SQL_PRINT) console.log(out.map((x) => x.detail).join('\n'));
  }, 60000);
});
