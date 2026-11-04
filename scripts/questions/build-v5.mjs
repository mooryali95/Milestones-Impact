// يبني زوج القياس v5: baseline-v5 وpost-v3 (المرحلة ج من التدقيق)
//   node scripts/questions/build-v5.mjs
// كل أداة = محتوى نظيرتها في v4.2 (baseline-v4 / post-v2) كما هو، بمعرّفات جديدة
// ثابتة، + فقرات scripts/questions/new-v5.mjs. لا يمس الأداتين الحيتين.
// الناتج:
//   supabase/content/questions/v5/items.json
//   supabase/migrations/20261102100000_leaders_instruments_v5.sql   (الأداتان غير مفعّلتين)
//   supabase/migrations/20261102100100_leaders_activate_v5.sql      (التفعيل، يُطبَّق بقرار)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PAIRS, REVERSE, REVERSE_OPTIONS } from './new-v5.mjs';

const ROOT = new URL('../../', import.meta.url);
const V42 = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.2/items.json', ROOT), 'utf8'));
const OUT_JSON = new URL('supabase/content/questions/v5/items.json', ROOT);
const OUT_SQL = new URL('supabase/migrations/20261102100000_leaders_instruments_v5.sql', ROOT);
const OUT_ACT = new URL('supabase/migrations/20261102100100_leaders_activate_v5.sql', ROOT);
const MAP = { 'baseline-v4': 'baseline-v5', 'post-v2': 'post-v3' };
const HELP = {
  'baseline-v5': 'فكّر في الأشهر الثلاثة الأخيرة من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.',
  'post-v3': 'قدّر ممارستك في الأشهر الثلاثة الأخيرة، ثم في الأشهر الثلاثة التي سبقت البرنامج. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.',
};
const SORT0 = { milestone: 0, impact: 20, leadership: 40 };

export function stableId(instrument, code) {
  const h = createHash('sha1').update(`milestone-impact/leaders/${instrument}/${code}`).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function place(opts, pos) {
  const [k, ...rest] = opts;
  const out = [...rest];
  out.splice(pos, 0, k);
  return out.map(([label, score]) => ({ label, score }));
}

// الفقرات الجديدة مرة واحدة، ثم تُنسخ إلى الأداتين
const NEW = [];
PAIRS.forEach((p, i) => {
  const sort = SORT0[p.dimension] + 17 + (Number(p.code.match(/\d+$/)[0]) - 12);
  for (const [form, pos] of [['A', i % 4], ['B', (i + 2) % 4]]) {
    const v = p[form];
    NEW.push({ code: form === 'A' ? p.code : `${p.code}B`, dimension: p.dimension, tier: p.tier, kind: 'choice', weight: '1.00', sort,
      competency_ar: p.competency_ar, chapter_key: p.chapter_key, form, text_ar: v.text_ar, text_rater_ar: null, options: place(v.opts, pos), reverse: false });
  }
});
for (const r of REVERSE) {
  NEW.push({ code: r.code, dimension: r.dimension, tier: 'behavior', kind: 'likert', weight: '1.00', sort: SORT0[r.dimension] + 17,
    competency_ar: r.competency_ar, chapter_key: r.chapter_key, form: null, text_ar: r.text_ar, text_rater_ar: r.text_rater_ar, options: REVERSE_OPTIONS, reverse: true });
}

const ALL = [];
for (const q of V42.filter((x) => MAP[x.instrument])) {
  const instrument = MAP[q.instrument];
  ALL.push({ ...q, instrument, id: stableId(instrument, q.code) });
}
for (const instrument of ['baseline-v5', 'post-v3']) {
  const post = instrument === 'post-v3';
  for (const n of NEW) {
    const { reverse, ...q } = n;
    ALL.push({
      instrument, id: stableId(instrument, q.code), code: q.code, dimension: q.dimension, tier: q.tier, kind: q.kind, weight: q.weight, sort: q.sort,
      competency_ar: q.competency_ar, chapter_key: q.chapter_key, anchor_code: post ? q.code : null, retro: post && q.tier === 'behavior', form: q.form,
      text_ar: q.text_ar, help_ar: q.tier === 'behavior' ? HELP[instrument] : null, text_rater_ar: q.text_rater_ar, options: q.options, min_level: null,
    });
  }
}
mkdirSync(new URL('supabase/content/questions/v5/', ROOT), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(ALL, null, 2) + '\n');

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const L = [];
L.push('-- ════════════════════════════════════════════════════════════════');
L.push('-- القياس v5 (المرحلة ج): baseline-v5 وpost-v3، غير مفعّلتين');
L.push('-- ════════════════════════════════════════════════════════════════');
L.push('-- مولَّد بـ scripts/questions/build-v5.mjs من supabase/content/questions/v4.2 وscripts/questions/new-v5.mjs');
L.push('-- كل أداة = نظيرتها الحية (baseline-v4 / post-v2) كما هي + لكل بُعد في كل صيغة معرفتان');
L.push('-- ومواقفان جديدة (توائم A/B) + عبارة ممارسة معكوسة مشتركة (الدرجات 4→0، «لا ينطبق» −1).');
L.push(`-- ${NEW.length} فقرة جديدة في كل أداة؛ ${ALL.length} صفًا إجمالًا. لا يمس الأدوات الحية ولا الإجابات.`);
L.push('-- التفعيل في 20261102100100_leaders_activate_v5.sql بقرار منفصل. آمن لإعادة التشغيل.');
L.push('');
L.push('-- 1) الأداتان (العنوان والمقدمة من النظيرة الحية؛ الزمن +4 دقائق لخمس عشرة فقرة إضافية لكل مشارك)');
L.push('insert into leaders.instruments (key, title_ar, kind, active, version, intro_ar, est_minutes, pairs_with)');
L.push("select 'baseline-v5', title_ar, kind, false, 5, intro_ar, est_minutes + 4, null from leaders.instruments where key = 'baseline-v4'");
L.push('on conflict (key) do nothing;');
L.push('insert into leaders.instruments (key, title_ar, kind, active, version, intro_ar, est_minutes, pairs_with)');
L.push("select 'post-v3', title_ar, kind, false, 3, intro_ar, est_minutes + 4, 'baseline-v5' from leaders.instruments where key = 'post-v2'");
L.push('on conflict (key) do nothing;');
L.push('');
L.push('-- 2) الفقرات');
for (const inst of ['baseline-v5', 'post-v3']) {
  const rows = ALL.filter((q) => q.instrument === inst);
  L.push(`-- ${inst}: ${rows.length} فقرة`);
  L.push('insert into leaders.questions (id, instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, weight, sort,');
  L.push('  competency_ar, chapter_key, form, text_rater_ar, anchor_code, retro, min_level)');
  L.push('select v.id::uuid, i.id, v.dimension, v.code, v.tier, v.text_ar, v.help_ar, v.kind, v.options::jsonb, v.weight::numeric, v.sort,');
  L.push('  v.competency_ar, v.chapter_key, v.form, v.text_rater_ar, v.anchor_code, v.retro, v.min_level');
  L.push('from leaders.instruments i');
  L.push('cross join (values');
  L.push(rows.map((q) => `  (${[q.id, q.dimension, q.code, q.tier, q.text_ar, q.help_ar, q.kind].map(lit).join(', ')}, ${lit(JSON.stringify(q.options))}, ${lit(q.weight)}, ${q.sort}, ${[q.competency_ar, q.chapter_key, q.form, q.text_rater_ar, q.anchor_code].map(lit).join(', ')}, ${q.retro}, ${lit(q.min_level)})`).join(',\n'));
  L.push(') as v(id, dimension, code, tier, text_ar, help_ar, kind, options, weight, sort, competency_ar, chapter_key, form, text_rater_ar, anchor_code, retro, min_level)');
  L.push(`where i.key = ${lit(inst)}`);
  L.push('on conflict (instrument_id, code) do nothing;');
  L.push('');
}
writeFileSync(OUT_SQL, L.join('\n'));

const A = [];
A.push('-- ════════════════════════════════════════════════════════════════');
A.push('-- تفعيل القياس v5 (المرحلة ج) — يُطبَّق بقرار، لا مع الترحيل السابق');
A.push('-- ════════════════════════════════════════════════════════════════');
A.push('-- يتطلب 20261102100000_leaders_instruments_v5.sql. القياسات المبدوءة والمسلّمة تبقى بأداتها.');
A.push('-- المبدئي: أداة واحدة مفعّلة (baseline-v5). البعدي: post-v3 لمن بدأ على baseline-v5.');
A.push('-- post-v2 يبقى مفعّلًا عمدًا: postInstrumentFor (participant.ts) يختار من الأدوات البعدية المفعّلة');
A.push('-- ما يقابل مبدئي المشارك (pairs_with)، فإطفاؤه يحرم من سلّم baseline-v4 من قياسه البعدي.');
A.push('-- يُطفأ post-v2 بعد أن يُتم آخر مشاركي baseline-v4 قياسهم البعدي:');
A.push("--   update leaders.instruments set active = false where key = 'post-v2';");
A.push("do $$ begin");
A.push("  if (select count(*) from leaders.questions q join leaders.instruments i on i.id = q.instrument_id where i.key in ('baseline-v5', 'post-v3')) = 0 then");
A.push("    raise exception 'v5: الأداتان بلا فقرات؛ طبّق 20261102100000_leaders_instruments_v5.sql أولًا';");
A.push('  end if;');
// إصلاحات ما قبل التفعيل (v5.1، المرحلة ز) تسبق التفعيل: بعده تصير الفقرات حية ولا تُعدَّل
A.push("  if not exists (select 1 from leaders.schema_migrations where name = '20261105150000_leaders_v5_1_pre_activation') then");
A.push("    raise exception 'v5: طبّق 20261105150000_leaders_v5_1_pre_activation.sql (إصلاحات ما قبل التفعيل) أولًا';");
A.push('  end if;');
A.push('end $$;');
A.push("update leaders.instruments set active = (key = 'baseline-v5') where kind = 'baseline';");
A.push("update leaders.instruments set active = (key in ('post-v3', 'post-v2')) where kind = 'post';");
writeFileSync(OUT_ACT, A.join('\n') + '\n');
console.log(`v5: ${ALL.length} صفًا (${NEW.length} جديدًا لكل أداة) → ${OUT_JSON.pathname}\n${OUT_SQL.pathname}\n${OUT_ACT.pathname}`);
