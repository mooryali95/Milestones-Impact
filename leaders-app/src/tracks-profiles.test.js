// المسارات (المرحلة ب): ملفات التعريف، والمختبرات بالمستوى، والنماذج
// يطبّق الترحيل المولَّد على قاعدة من البنية المرجعية ولقطة الإنتاج المختصرة، مرتين،
// ويتحقق من أنه يكتب ما في supabase/content/tracks/v2 بالضبط ولا يغيّر شيئًا في الثانية.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { profileKey, strengthsLine, trackKey, trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { labVisible } from '../../supabase/functions/leaders-api/lab.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const V2 = (f) => JSON.parse(read(`supabase/content/tracks/v2/${f}`));
const SUPABASE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

describe('سطر أقوى الأطر وملف التعريف', () => {
  const L = (m, i, l) => trackLevels(`M${m}I${i}L${l}`);
  it('يسمّي الأقوى بأسماء القاموس ولا يذكر مستوى', () => {
    expect(strengthsLine(L(3, 1, 3), 'impact')).toBe('أقوى أطرك: إدارة المشروعات وتمكين القائد. تبني عليهما وأنت تعمّق تحويل المشروع إلى أثر.');
    expect(strengthsLine(L(1, 1, 2), 'milestone')).toBe('أقوى أطرك: تمكين القائد. تبني عليه وأنت تعمّق إدارة المشروعات.');
    expect(strengthsLine(L(2, 2, 2), 'milestone')).toBe('مستوياتك متقاربة في الأطر الثلاثة، ويبدأ تعمقك من إدارة المشروعات.');
    expect(strengthsLine({ milestone: 'beginner' }, 'milestone')).toBeNull();
    expect(strengthsLine(L(3, 2, 1), 'leadership')).not.toMatch(/تأسيسي|متوسط|احترافي/);
  });
  it('مفتاح الملف = إطار الأولوية ومستواه فيه', () => {
    expect(profileKey(L(3, 1, 3), 'impact')).toBe('impact-beginner');
    expect(profileKey(L(3, 3, 2), 'leadership')).toBe('leadership-intermediate');
    expect(profileKey(L(3, 3, 2), null)).toBeNull();
  });
});

describe('تحقق المحتوى', () => {
  it('scripts/tracks/verify.mjs سليم: الربط والنصوص والوعود والمختبرات والنماذج', () => {
    const out = execFileSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts/tracks/verify.mjs')], { encoding: 'utf8' });
    expect(out).toContain('كل الفحوص سليمة');
  });
});

describe('المختبرات تصل بالمستوى', () => {
  const { audience } = V2('labs.json');
  const state = V2('state-before.json');
  const labs = state.labs.map((l) => ({ ...l, id: l.key, audience: audience[l.key] }));
  it('المبتدئ في كل إطار يرى مختبرات إطاره التأسيسية دون منحة', () => {
    const lv = trackLevels('M1I1L1');
    const seen = labVisible(labs, { levels: lv, participantId: 'p' }).map((l) => l.key);
    expect(seen).toEqual(expect.arrayContaining(['schedule-critical-path', 'benefits-map', 'hard-week', 'conflict-modes']));
    expect(seen).not.toContain('evm-checkpoint');
    expect(seen).not.toContain('portfolio-review');
  });
  it('الاحترافي يرى مختبره، وموقف المحفظة يبقى بمنحة', () => {
    const seen = labVisible(labs, { levels: trackLevels('M3I3L3'), participantId: 'p' }).map((l) => l.key);
    expect(seen).toEqual(expect.arrayContaining(['evm-checkpoint', 'direct-challenge']));
    expect(seen).not.toContain('portfolio-review');
    const granted = labVisible(labs, { levels: trackLevels('M1I1L1'), participantId: 'p', grants: [{ participant_id: 'p', item_id: 'portfolio-review' }] });
    expect(granted.map((l) => l.key)).toContain('portfolio-review');
  });
});

describe('ترحيل 20261101140000 على البنية المرجعية', () => {
  it('يكتب ملفات التعريف والربط والمختبرات والنماذج، وإعادة تشغيله لا تغيّر شيئًا', async () => {
    const db = new PGlite();
    await db.exec(SUPABASE);
    await db.exec(read('supabase/schema/baseline.sql'));
    const st = V2('state-before.json');
    const lv = (k) => trackLevels(k);
    await db.exec(`
      insert into leaders.tracks (key, milestone_level, impact_level, leadership_level, sort, priority_dimension, title_ar, journey_ar) values
      ${st.tracks.map((t, i) => `(${[t.key, lv(t.key).milestone, lv(t.key).impact, lv(t.key).leadership].map(q).join(', ')}, ${i}, ${q(t.priority_dimension)}, ${q(t.title_ar)}, 'التدريب: ورشة تأسيس حضورية. التوجيه: النصيب الأكبر من الجلسات')`).join(',\n')};
      insert into leaders.learning_models (key, dimension, title_ar, min_level, capstone_sort, scopes, fields) values
      ${st.models.map((m) => `(${[m.key, m.dimension, m.title_ar, m.min_level].map(q).join(', ')}, ${m.capstone_sort ?? 'null'}, ${q(`{${(m.scopes || []).join(',')}}`)}, ${q(JSON.stringify(m.fields))}::jsonb)`).join(',\n')};
      insert into leaders.lab_items (key, kind, dimension, chapter_key, min_level, title_ar, spec, audience) values
      ${st.labs.map((l) => `(${[l.key, 'tool', l.dimension, l.chapter_key, l.min_level, l.title_ar].map(q).join(', ')}, '{}'::jsonb, ${q(l.audience)})`).join(',\n')};`);
    const sql = read('supabase/migrations/20261101140000_leaders_tracks_profiles.sql');
    await db.exec(sql);
    const snap = async () => (await db.query(`select
      (select json_agg(t order by key) from (select key, profile_key, title_ar, title_en, journey_ar from leaders.tracks) t) tracks,
      (select json_agg(p order by key) from leaders.track_profiles p) profiles,
      (select json_agg(l order by key) from (select key, audience from leaders.lab_items) l) labs,
      (select json_agg(m order by key) from (select key, min_level, capstone_sort, fields from leaders.learning_models) m) models,
      (select count(*)::int from leaders.backup_20261101_tracks_profiles) backup`)).rows[0];
    const first = await snap();
    await db.exec(sql);
    const second = await snap();
    expect({ ...second, profiles: second.profiles.map(({ updated_at: _u, ...p }) => p) })
      .toEqual({ ...first, profiles: first.profiles.map(({ updated_at: _u, ...p }) => p) });

    const { profiles } = V2('profiles.json');
    const { tracks } = V2('tracks.json');
    expect(first.profiles.map((p) => p.key).sort()).toEqual(profiles.map((p) => p.key).sort());
    for (const p of profiles) {
      const row = first.profiles.find((x) => x.key === p.key);
      expect(row.journey_ar).toBe(p.journey_ar.join('\n'));
      expect(row.title_ar).toBe(p.title_ar);
    }
    for (const t of tracks) {
      const row = first.tracks.find((x) => x.key === t.key);
      expect(row, t.key).toMatchObject({ profile_key: t.profile_key, title_ar: t.title_ar, title_en: t.title_en });
      expect(row.journey_ar).not.toMatch(/ورشة|النصيب الأكبر/);
      expect(profileKey(lv(t.key), st.tracks.find((x) => x.key === t.key).priority_dimension)).toBe(row.profile_key);
      expect(trackKey(lv(t.key))).toBe(t.key);
    }
    const aud = Object.fromEntries(first.labs.map((l) => [l.key, l.audience]));
    expect(aud).toEqual(V2('labs.json').audience);
    const M = Object.fromEntries(first.models.map((m) => [m.key, m]));
    expect(M['theory-of-change'].min_level).toBe('beginner');
    expect(M['conflict-mode'].min_level).toBe('beginner');
    expect(M['impact-report'].capstone_sort).toBe(55);
    expect(M['theory-of-change'].fields.find((f) => f.key === 'weakest').min_level).toBe('intermediate');
    for (const [k, f] of [['initiative-charter', 'trade_off'], ['benefits-register', 'realization_curve'], ['transformation-story', 'system_change'], ['stage-gate', 'sunk_cost'], ['wbs', 'interfaces']]) {
      const keys = M[k].fields.map((x) => x.key);
      expect(keys.filter((x) => x === f), k).toHaveLength(1);
      expect(keys.indexOf(f), k).toBe(keys.indexOf('track_depth') - 1);
      expect(M[k].fields.find((x) => x.key === f).min_level).toBe('advanced');
    }
    // الملفات السبعة مرتبطة، ولا مسار بلا ملف
    expect(first.tracks.every((t) => t.profile_key)).toBe(true);
    expect(first.backup).toBeGreaterThan(27);
    // استعلامات التحقق على القاعدة الحية تعيد 0 صفًا هنا أيضًا
    const checks = read('scripts/db/verify-tracks-profiles.sql').split(/;\s*\n/).map((x) => x.replace(/^--.*$/gm, '').trim()).filter(Boolean);
    expect(checks).toHaveLength(5);
    for (const c of checks) expect((await db.query(c)).rows, c.slice(0, 60)).toEqual([]);
  }, 90000);
});
