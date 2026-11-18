// سكربت القراءة قبل البذرة (T1، ب5.1): scripts/db/verify-t1-track-seed.sql على البنية المرجعية في PGlite، فيحسب لكل دفعة ما
// يحسبه cohortPlan نفسه: نافذة التوجيه الآن وبعد أن يصير مسارًا، ونهاية السلسلة، والمراحل والمعالم التي تتحرك. قراءة فقط.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { cohortPlan } from '../../supabase/functions/leaders-api/stage-windows.js';
import { milestoneStatuses } from '../../supabase/functions/leaders-api/milestones.js';
import { COHORTS, MILESTONES, STAGES } from './journey-legacy.cases.js';

const ROOT = join(__dirname, '../..');
const SQL = readFileSync(join(ROOT, 'supabase/schema/baseline.sql'), 'utf8');
const SUPABASE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const CHECKS = readFileSync(join(ROOT, 'scripts/db/verify-t1-track-seed.sql'), 'utf8').split(/^(?=-- \d+\) )/m).filter((c) => /^-- \d+\) /.test(c))
  .map((c) => c.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim().replace(/;\s*$/, ''));
const PID = '00000000-0000-4000-8000-000000000001', CID = '00000000-0000-4000-8000-000000000002';
const C = { ...COHORTS.dated, schedule: { support: { days: 60 } } };
// البذرة كما في ب5.1 (ومثلها في journey-track.test.js)
const SEED = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'report' };
const TRACK = STAGES.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: SEED } : s));

describe('verify-t1-track-seed.sql', () => {
  it('قراءة فقط بصيغة فحوص migrate.yml، وكل فحص صف ok وdetail', () => {
    expect(CHECKS).toHaveLength(5);
    for (const q of CHECKS) {
      expect(q).toMatch(/^(select|with)\b/i);
      expect(q).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i);
    }
  });
  it('يحسب ما يحسبه cohortPlan: نافذة التوجيه بعد البذرة ونهاية السلسلة والمراحل والمعالم التي تتحرك', async () => {
    const db = new PGlite();
    await db.exec(SUPABASE);
    await db.exec(SQL);
    const q = (s, v) => db.query(s, v);
    await q('insert into leaders.programs (id, name) values ($1, $2)', [PID, 'البرنامج']);
    for (const s of STAGES) {
      await q('insert into leaders.journey_stages (program_id, key, sort, title_ar, duration_label, duration_days, phase, rules, active) values ($1,$2,$3,$4,$5,$6,$7,$8,true)',
        [PID, s.key, s.sort, s.title_ar, '-', s.duration_days, s.phase, JSON.stringify(s.rules || {})]);
    }
    for (const m of MILESTONES.filter((x) => x.stage_key)) {
      await q('insert into leaders.program_milestones (program_id, title_ar, stage_key, anchor, offset_days, complete, active) values ($1,$2,$3,$4,$5,$6,true)', [PID, m.id, m.stage_key, m.anchor, m.offset_days, m.complete]);
    }
    await q("insert into leaders.cohorts (id, name, program_id, starts_on, ends_on, schedule, status) values ($1,'دفعة نوفمبر',$2,$3,$4,$5,'running')", [CID, PID, C.starts_on, C.ends_on, JSON.stringify(C.schedule)]);
    const out = [];
    for (const sql of CHECKS) out.push((await q(sql)).rows[0]);
    const now = cohortPlan(STAGES, C), after = cohortPlan(TRACK, C);
    expect(out[0].ok).toBe(true);
    expect(out[0].detail).toContain('التوجيه مدته بالأيام 28');
    const o = after.byKey.ojt_coaching, n = now.byKey.ojt_coaching;
    expect(out[1].detail).toContain(`التوجيه الآن ${n.from} إلى ${n.to}، وبعد البذرة ${o.from} إلى ${o.to}`);
    expect(out[1].detail).toContain(`نهاية المراحل المتتابعة ${now.end} ثم ${after.end}`);
    const moved = STAGES.filter((s) => s.key !== 'ojt_coaching' && now.byKey[s.key].from !== after.byKey[s.key].from).map((s) => `${s.key} ${now.byKey[s.key].from}→${after.byKey[s.key].from}`);
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) expect(out[2].detail).toContain(m);
    const due = (stages) => Object.fromEntries(milestoneStatuses(MILESTONES.filter((x) => x.stage_key), { cohort: C, stages, today: '2026-11-18' }).map((m) => [m.id, m.due]));
    const [d0, d1] = [due(STAGES), due(TRACK)];
    for (const k of Object.keys(d0).filter((k) => d0[k] !== d1[k])) expect(out[3].detail).toContain(`${k} ${d0[k]}→${d1[k]}`);
    expect(out[4].ok).toBe(true);
    if (process.env.T1_SQL_PRINT) console.log(out.map((x) => x.detail).join("\n"));
  }, 60000);
});
