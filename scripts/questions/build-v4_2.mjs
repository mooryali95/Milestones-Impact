// يبني بنك الأسئلة v4.2 وترحيله من v4.1 + الفقرات الجديدة في new-v4_2.mjs
//   node scripts/questions/build-v4_2.mjs
// الناتج:
//   supabase/content/questions/v4.2/items.json  (البنك كاملًا: baseline-v4 كما هو، وpost-v2 بفقراته الجديدة)
//   supabase/migrations/20261101130000_leaders_post_v2_levels.sql
// الترحيل: نسخة احتياطية من صفوف post-v2 (مع RLS) ثم إدراج الفقرات الجديدة بمعرّفات
// ثابتة مشتقة من الرمز؛ on conflict (instrument_id, code) do nothing فيصح تكراره.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LEVEL_ITEMS, TWINS } from './new-v4_2.mjs';

const ROOT = new URL('../../', import.meta.url);
const BEFORE = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.1/items.json', ROOT), 'utf8'));
const OUT_JSON = new URL('supabase/content/questions/v4.2/items.json', ROOT);
const OUT_SQL = new URL('supabase/migrations/20261101130000_leaders_post_v2_levels.sql', ROOT);
const BACKUP = 'leaders.questions_backup_20261101_post_v2';

// معرّف ثابت (صيغة UUID v5) من الرمز، فيتطابق الملف والقاعدة وإعادة البناء
export function stableId(code) {
  const h = createHash('sha1').update(`milestone-impact/leaders/post-v2/${code}`).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// المفتاح أول opts، ويُنقل إلى موضعه بالدور A ثم B ثم C ثم D، فيتوزع بالتساوي
// داخل كل بُعد (8 فقرات مستوى لكل بُعد = 2 لكل موضع) وعلى التوائم.
function place(opts, pos) {
  const [key, ...rest] = opts;
  const out = [...rest];
  out.splice(pos, 0, key);
  return out.map(([label, score]) => ({ label, score }));
}

const post = (code) => BEFORE.find((q) => q.instrument === 'post-v2' && q.code === code);
let i = 0;
const NEW = [];
for (const it of LEVEL_ITEMS) {
  NEW.push({
    instrument: 'post-v2', id: stableId(it.code), code: it.code, dimension: it.dimension, tier: it.tier, kind: 'choice', weight: '1.00',
    sort: 200 + i, competency_ar: it.competency_ar, chapter_key: it.chapter_key, anchor_code: null, retro: false, form: it.form,
    min_level: it.min_level, text_ar: it.text_ar, help_ar: null, text_rater_ar: null, options: place(it.opts, i % 4),
  });
  i += 1;
}
for (const t of TWINS) {
  const o = post(t.anchor_code);
  if (!o || o.form) throw new Error(`${t.code}: الأصل ${t.anchor_code} ليس مشتركًا في post-v2`);
  NEW.push({
    instrument: 'post-v2', id: stableId(t.code), code: t.code, dimension: o.dimension, tier: o.tier, kind: 'choice', weight: o.weight,
    sort: o.sort, competency_ar: o.competency_ar, chapter_key: o.chapter_key, anchor_code: t.anchor_code, retro: false, form: null,
    min_level: null, text_ar: t.text_ar, help_ar: null, text_rater_ar: null, options: place(t.opts, i % 4),
  });
  i += 1;
}

const ALL = [...BEFORE.map((q) => ({ ...q, min_level: q.min_level ?? null })), ...NEW];
mkdirSync(new URL('supabase/content/questions/v4.2/', ROOT), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(ALL, null, 2) + '\n');

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const L = [];
L.push('-- ════════════════════════════════════════════════════════════════');
L.push('-- إغلاق الحلقة (المرحلة ب): فقرات المستوى وتوائم المواقف المشتركة في post-v2');
L.push('-- ════════════════════════════════════════════════════════════════');
L.push('-- مولَّد بـ scripts/questions/build-v4_2.mjs من scripts/questions/new-v4_2.mjs');
L.push(`-- ${LEVEL_ITEMS.length} فقرة مستوى (min_level: الباب الخامس متوسط، السادس متقدم) و${TWINS.length} توائم (anchor_code = الأصل).`);
L.push('-- لا يمس baseline-v4 ولا صفوف post-v2 القائمة. آمن لإعادة التشغيل.');
L.push('-- يتطلب 20261101125000_leaders_questions_min_level.sql (العمود min_level).');
L.push('');
L.push('-- 1) نسخة احتياطية من صفوف post-v2 قبل الإضافة');
L.push(`create table if not exists ${BACKUP} as`);
L.push('  select q.* from leaders.questions q');
L.push("  where q.instrument_id in (select id from leaders.instruments where key = 'post-v2');");
L.push(`alter table ${BACKUP} enable row level security;`);
L.push(`comment on table ${BACKUP} is 'نسخة من leaders.questions (post-v2) قبل إضافة فقرات المستوى والتوائم — للرجوع فقط';`);
L.push('');
L.push('-- 2) الفقرات الجديدة');
L.push('insert into leaders.questions (id, instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, weight, sort,');
L.push('  competency_ar, chapter_key, form, text_rater_ar, anchor_code, retro, min_level)');
L.push('select v.id::uuid, i.id, v.dimension, v.code, v.tier, v.text_ar, null, \'choice\', v.options::jsonb, 1, v.sort,');
L.push('  v.competency_ar, v.chapter_key, v.form, null, v.anchor_code, false, v.min_level');
L.push('from leaders.instruments i');
L.push('cross join (values');
L.push(NEW.map((q) => `  (${[q.id, q.dimension, q.code, q.tier, q.text_ar].map(lit).join(', ')}, ${lit(JSON.stringify(q.options))}, ${q.sort}, ${[q.competency_ar, q.chapter_key, q.form, q.anchor_code, q.min_level].map(lit).join(', ')})`).join(',\n'));
L.push(') as v(id, dimension, code, tier, text_ar, options, sort, competency_ar, chapter_key, form, anchor_code, min_level)');
L.push("where i.key = 'post-v2'");
L.push('on conflict (instrument_id, code) do nothing;');
writeFileSync(OUT_SQL, L.join('\n') + '\n');
console.log(`v4.2: ${ALL.length} صفًا (${NEW.length} جديدًا) → ${OUT_JSON.pathname}\n${OUT_SQL.pathname}`);
