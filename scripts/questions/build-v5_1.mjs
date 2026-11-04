// يبني القياس v5.1 (إصلاحات ما قبل تفعيل v5، المرحلة ز) من v5 + edits-v5_1.mjs
//   node scripts/questions/build-v5_1.mjs
// الناتج:
//   supabase/content/questions/v5.1/items.json   (الأداتان كاملتين بعد التعديل، بالمعرّفات نفسها)
//   supabase/migrations/20261105150000_leaders_v5_1_pre_activation.sql
// الترحيل يحدّث الصفوف المتغيرة فقط (بالأداة والرمز) ويضبط الزمن التقديري، ويرفض التطبيق إن
// كان لأي من الأداتين قياس مبدوء. لا يمس baseline-v4 ولا post-v2 ولا أي إجابة.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EDITS, EST_MINUTES, REPLACE } from './edits-v5_1.mjs';

const ROOT = new URL('../../', import.meta.url);
const V5 = JSON.parse(readFileSync(new URL('supabase/content/questions/v5/items.json', ROOT), 'utf8'));
const OUT_JSON = new URL('supabase/content/questions/v5.1/items.json', ROOT);
export const MIGRATION = '20261105150000_leaders_v5_1_pre_activation';
const OUT_SQL = new URL(`supabase/migrations/${MIGRATION}.sql`, ROOT);
const INSTRUMENTS = ['baseline-v5', 'post-v3'];
const POS = 'ABCD';

const fail = (m) => { throw new Error(m); };
const seen = { edits: new Set(), replace: new Set() };

export function applyEdits(rows) {
  return rows.map((q) => {
    const e = EDITS[q.code], r = REPLACE[q.code];
    if (e && r) fail(`${q.code}: في EDITS وREPLACE معًا`);
    if (!e && !r) return q;
    if (!INSTRUMENTS.includes(q.instrument)) fail(`${q.code}: تعديل خارج أداتي v5`);
    if (q.kind !== 'choice') fail(`${q.code}: التعديل للاختيار فقط`);
    if (e) {
      seen.edits.add(q.code);
      const options = q.options.map((o, i) => {
        const label = e[POS[i]];
        if (label == null) return o;
        if (label === o.label) fail(`${q.code}/${POS[i]}: النص لم يتغير`);
        return { ...o, label };
      });
      for (const k of Object.keys(e)) if (!POS.includes(k)) fail(`${q.code}: موضع ${k}`);
      return { ...q, options };
    }
    seen.replace.add(q.code);
    const k = q.options.findIndex((o) => Number(o.score) === 4);
    if (k < 0 || r.opts.length !== 4 || Number(r.opts[0][1]) !== 4) fail(`${q.code}: بنية الاستبدال`);
    const [key, ...rest] = r.opts;
    const out = [...rest];
    out.splice(k, 0, key);
    return { ...q, text_ar: r.text_ar, competency_ar: r.competency_ar, chapter_key: r.chapter_key, options: out.map(([label, score]) => ({ label, score })) };
  });
}

const ALL = applyEdits(V5);
for (const c of Object.keys(EDITS)) if (!seen.edits.has(c)) fail(`EDITS/${c}: رمز غير موجود في v5`);
for (const c of Object.keys(REPLACE)) if (!seen.replace.has(c)) fail(`REPLACE/${c}: رمز غير موجود في v5`);
const changed = ALL.filter((q, i) => JSON.stringify(q) !== JSON.stringify(V5[i]));

mkdirSync(new URL('supabase/content/questions/v5.1/', ROOT), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(ALL, null, 2) + '\n');

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const L = [];
L.push('-- ════════════════════════════════════════════════════════════════');
L.push('-- القياس v5.1: إصلاحات ما قبل التفعيل (المرحلة ز) على baseline-v5 وpost-v3 غير المفعّلتين');
L.push('-- ════════════════════════════════════════════════════════════════');
L.push('-- مولَّد بـ scripts/questions/build-v5_1.mjs من supabase/content/questions/v5 وscripts/questions/edits-v5_1.mjs');
L.push(`-- 1) أطوال الخيارات في ${seen.edits.size} فقرة: المفتاح لا يكون الأطول ولا يتجاوز وسيط الخيارات بأكثر من 10% (الدرجات والمواضع ثابتة)`);
L.push(`-- 2) استبدال ${seen.replace.size} فقرة معرفية كانت استدعاءً لمسميات أُطر الكتيب بفقرات مفاهيم عامة، بالرمز والمعرّف نفسيهما`);
L.push(`-- 3) الزمن التقديري الواقعي: ${INSTRUMENTS.map((k) => `${k} = ${EST_MINUTES[k]}`).join('، ')} دقيقة`);
L.push(`-- ${changed.length} صفًا يتغير. يتطلب 20261102100000_leaders_instruments_v5.sql، ويسبق 20261102100100_leaders_activate_v5.sql.`);
L.push('-- يرفض التطبيق إن كان لأي من الأداتين قياس مبدوء، لأن الاستبدال يغيّر معنى الفقرة. آمن لإعادة التشغيل.');
L.push('do $$ begin');
L.push("  if exists (select 1 from leaders.assessments a join leaders.instruments i on i.id = a.instrument_id where i.key in ('baseline-v5', 'post-v3')) then");
L.push("    raise exception 'v5.1: لأداتي v5 قياسات مبدوءة؛ لا تُعدَّل فقراتهما بعد ذلك';");
L.push('  end if;');
L.push('end $$;');
L.push('');
for (const inst of INSTRUMENTS) {
  const rows = changed.filter((q) => q.instrument === inst);
  L.push(`-- ${inst}: ${rows.length} فقرة`);
  for (const q of rows) {
    L.push(`update leaders.questions q set text_ar = ${lit(q.text_ar)}, options = ${lit(JSON.stringify(q.options))}::jsonb, competency_ar = ${lit(q.competency_ar)}, chapter_key = ${lit(q.chapter_key)}`);
    L.push(`  from leaders.instruments i where i.id = q.instrument_id and i.key = ${lit(inst)} and q.code = ${lit(q.code)};`);
  }
  L.push(`update leaders.instruments set est_minutes = ${Number(EST_MINUTES[inst])} where key = ${lit(inst)};`);
  L.push('');
}
L.push(`insert into leaders.schema_migrations (name) values (${lit(MIGRATION)}) on conflict do nothing;`);
writeFileSync(OUT_SQL, L.join('\n') + '\n');
console.log(`v5.1: ${ALL.length} صفًا، ${changed.length} متغيرًا (${seen.edits.size} تعديل أطوال، ${seen.replace.size} استبدال) → ${OUT_JSON.pathname}\n${OUT_SQL.pathname}`);
