// ════════════════════════════════════════════════════════════════
// حالة المسارات بعد الترحيلات: لقطة الإنتاج (state-before.json) + تعديلات v2 + ترحيلا المصفوفة والبطاقة في قاعدة محلية (PGlite)
// ════════════════════════════════════════════════════════════════
// يستعمله verify.mjs وmatrix.mjs واختبارات الوحدات، فلا محاكاة ثانية للترحيلات.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/content/tracks/v2');
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
export const state = read('state-before.json');
const M = read('models.json');
const LABS = read('labs.json');

// ── الحالة بعد الترحيل (المحاكاة نفسها التي يكتبها build.mjs في SQL) ──
export function applyContent(st) {
  const models = st.models.map((m) => {
    let fields = m.fields.map((f) => {
      const p = M.patch_fields.find((x) => x.model === m.key && x.field === f.key);
      return p ? { ...f, ...p.patch } : f;
    });
    for (const a of M.add_fields.filter((x) => x.model === m.key)) {
      if (fields.some((f) => f.key === a.field.key)) continue;
      const at = fields.findIndex((f) => f.key === 'track_depth');
      fields = at < 0 ? [...fields, a.field] : [...fields.slice(0, at), a.field, ...fields.slice(at)];
    }
    return {
      ...m, fields,
      min_level: M.min_level[m.key]?.to || m.min_level,
      capstone_sort: m.capstone_sort ?? M.capstone_sort[m.key]?.to ?? null,
    };
  });
  const labs = st.labs.map((l) => ({ ...l, id: l.key, audience: LABS.audience[l.key] || l.audience }));
  return { models, labs };
}
const MATRIX = '20261128140000_leaders_level_matrix';
// ترحيل بطاقة المسار (scripts/tracks/build-cards.mjs) يُطبَّق بعده: متطلبات ومختبرات وحقول جديدة، وأولوية أربعة مسارات
const CARDS = '20261129110000_leaders_track_cards';
const PID = '2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78';
// ما بعد الترحيلين من متطلبات الرحلة والمختبرات (يملؤه applyMatrix إن مُرّرت له)
export const AFTER = { requirements: null, labs: null };
// ترحيلا المصفوفة والبطاقة على نماذج الحالة: يعيد min_level والحقول كما يكتبها في الإنتاج.
// extra: { requirements, labs } من اللقطة، فتُطبَّق عليها إضافات البطاقة أيضًا وتُحفظ في AFTER
export async function applyMatrix(list, extra = null) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema leaders;
    create table leaders.schema_migrations (name text primary key);
    create table leaders.learning_models (key text primary key, dimension text, sort int, title_ar text, icon text, summary_ar text, when_ar text, steps_ar text,
      source_ar text, min_level text not null, points int, capstone_sort int, scopes text[], fields jsonb not null);
    create table leaders.track_profiles (key text primary key, title_ar text, title_en text, summary_ar text, journey_ar text not null);
    create table leaders.tracks (key text primary key, priority_dimension text, profile_key text, journey_ar text, title_en text);
    create table leaders.stage_requirements (id serial primary key, program_id uuid, stage_key text, dimension text, level text, code text, sort int, title_ar text,
      help_ar text, kind text, required boolean, needs_review boolean, active boolean default true, config jsonb);
    create table leaders.lab_items (id uuid primary key default gen_random_uuid(), key text unique, kind text, dimension text, chapter_key text, sort int, min_level text,
      minutes int, points int, title_ar text, summary_ar text, spec jsonb, active boolean default true, audience text);
    create table leaders.lab_attempts (id serial primary key, item_id uuid);`);
  for (const m of list) await db.query('insert into leaders.learning_models (key, dimension, min_level, capstone_sort, fields) values ($1, $2, $3, $4, $5)', [m.key, m.dimension, m.min_level, m.capstone_sort ?? null, JSON.stringify(m.fields)]);
  for (const p of read('profiles.json').profiles) await db.query('insert into leaders.track_profiles (key, title_ar, title_en, summary_ar, journey_ar) values ($1, $2, $3, $4, $5)', [p.key, p.title_ar, p.title_en, p.summary_ar, p.journey_ar.join('\n')]);
  for (const t of state.tracks) await db.query('insert into leaders.tracks (key, priority_dimension) values ($1, $2)', [t.key, t.priority_dimension]);
  for (const r of extra?.requirements || []) await db.query('insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, title_ar, active) values ($1, $2, $3, $4, $5, $6, $7)', [PID, r.stage_key, r.dimension, r.level, r.code, r.title_ar, r.active]);
  for (const l of extra?.labs || []) await db.query('insert into leaders.lab_items (key, dimension, chapter_key, min_level, title_ar, sort, active, audience) values ($1, $2, $3, $4, $5, $6, $7, $8)', [l.key, l.dimension, l.chapter_key, l.min_level, l.title_ar, l.sort, l.active, l.audience]);
  for (const name of [MATRIX, CARDS]) await db.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), `../../supabase/migrations/${name}.sql`), 'utf8'));
  const rows = (await db.query('select key, dimension, min_level, capstone_sort, fields from leaders.learning_models')).rows;
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  if (extra) {
    AFTER.requirements = (await db.query('select code, stage_key, dimension, level, active, title_ar from leaders.stage_requirements order by id')).rows;
    AFTER.labs = (await db.query('select key, dimension, chapter_key, min_level, audience, active, title_ar, sort from leaders.lab_items')).rows.map((l) => ({ ...l, id: l.key }));
    AFTER.tracks = (await db.query('select key, priority_dimension, profile_key from leaders.tracks order by key')).rows;
  }
  await db.close();
  // فصل جديد (لا في اللقطة) يُضاف بحقوله كما يكتبه الترحيل
  const added = rows.filter((r) => !list.some((m) => m.key === r.key)).map((r) => ({ ...r, id: r.key, scopes: [], active: true, title_ar: r.key }));
  return [...list.map((m) => ({ ...m, min_level: by[m.key].min_level, fields: by[m.key].fields })), ...added];
}

/** الحالة كاملة بعد الترحيلات: { models, labs, requirements, tracks } */
export async function afterState() {
  const v2 = applyContent(state);
  const models = await applyMatrix(v2.models, { requirements: state.requirements, labs: v2.labs });
  return { models, labs: AFTER.labs, requirements: AFTER.requirements, tracks: AFTER.tracks };
}
