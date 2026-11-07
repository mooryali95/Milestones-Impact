// يبني طبقة الموازنة v5.2 (D03) من v5.1 + edits-v5_2.mjs
//   node scripts/questions/build-v5_2.mjs
// الناتج:
//   supabase/content/questions/v5.2/items.json   (الأداتان كاملتين بعد الموازنة، بالمعرّفات نفسها)
//   supabase/migrations/20261107190000_leaders_v5_2_balance.sql
// الترحيل يحدّث الصفوف المتغيرة وحدها (بالأداة والرمز) بحارس أن نصها الحالي نص v5.1، ويرفض التطبيق إن كان لأي
// من الأداتين قياس مبدوء. يسبق ترحيل التفعيل 20261102100100 الذي يشترطه. لا يمس baseline-v4 ولا post-v2.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EDITS } from './edits-v5_2.mjs';
import { INSTRUMENTS } from './lengths.mjs';

const ROOT = new URL('../../', import.meta.url);
export const V51 = JSON.parse(readFileSync(new URL('supabase/content/questions/v5.1/items.json', ROOT), 'utf8'));
const OUT_JSON = new URL('supabase/content/questions/v5.2/items.json', ROOT);
export const MIGRATION = '20261107190000_leaders_v5_2_balance';
const OUT_SQL = new URL(`supabase/migrations/${MIGRATION}.sql`, ROOT);
const POS = 'ABCD';
const FIELDS = new Set([...POS, 'text_ar', 'chapter_key']);
const fail = (m) => { throw new Error(m); };

export function applyBalance(rows, edits = EDITS) {
  const seen = new Set();
  const out = rows.map((q) => {
    const e = edits[q.code];
    if (!e) return q;
    if (!INSTRUMENTS.includes(q.instrument)) fail(`${q.code}: تعديل خارج أداتي v5`);
    for (const k of Object.keys(e)) if (!FIELDS.has(k)) fail(`${q.code}: حقل ${k}`);
    if (q.kind !== 'choice' && POS.split('').some((k) => e[k] != null)) fail(`${q.code}: تعديل الخيارات للاختيار فقط`);
    seen.add(q.code);
    const options = q.options.map((o, i) => (e[POS[i]] == null ? o : { ...o, label: e[POS[i]] }));
    return { ...q, options, ...(e.text_ar ? { text_ar: e.text_ar } : {}), ...(e.chapter_key ? { chapter_key: e.chapter_key } : {}) };
  });
  for (const c of Object.keys(edits)) if (!seen.has(c)) fail(`EDITS/${c}: رمز غير موجود في v5.1`);
  return out;
}

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

export function balanceSql(before, after) {
  const changed = after.filter((q, i) => JSON.stringify(q) !== JSON.stringify(before[i]));
  const L = [];
  L.push('-- ════════════════════════════════════════════════════════════════');
  L.push('-- طبقة الموازنة v5.2 (D03): قرينة طول الخيار ووسم الأبواب وسياق القطاع العام في baseline-v5 وpost-v3');
  L.push('-- ════════════════════════════════════════════════════════════════');
  L.push('-- deploy-gate: deferred بقرار D03، يُطبَّق بعد توقيع لجنة المحتوى ومراجع قياسي، بعد 20261105150000 وقبل التفعيل');
  L.push('-- مولَّد بـ scripts/questions/build-v5_2.mjs من supabase/content/questions/v5.1 وscripts/questions/edits-v5_2.mjs');
  L.push(`-- ${changed.length} صفًا يتغير، والدرجات ومواضع المفاتيح ثابتة. الحارس: لا قياس مبدوء على الأداتين، ونص كل صف`);
  L.push('-- المتغير هو نص v5.1 (بصمة md5 للجذع والخيارات)، وإلا يُرفض الترحيل كله. آمن لإعادة التشغيل.');
  L.push('do $$ begin');
  L.push("  if exists (select 1 from leaders.assessments a join leaders.instruments i on i.id = a.instrument_id where i.key in ('baseline-v5', 'post-v3')) then");
  L.push("    raise exception 'v5.2: لأداتي v5 قياسات مبدوءة؛ لا تُعدَّل فقراتهما بعد ذلك';");
  L.push('  end if;');
  L.push("  if not exists (select 1 from leaders.schema_migrations where name = '20261105150000_leaders_v5_1_pre_activation') then");
  L.push("    raise exception 'v5.2: طبّق 20261105150000_leaders_v5_1_pre_activation.sql أولًا';");
  L.push('  end if;');
  L.push('end $$;');
  L.push('');
  // الحارس بالمساواة الدلالية (نص الجذع وjsonb الخيارات): يُحدَّث الصف إن كان نص v5.1 أو نص v5.2 نفسه
  const now = (q) => `(q.text_ar = ${lit(q.text_ar)} and q.options = ${lit(JSON.stringify(q.options))}::jsonb and q.chapter_key is not distinct from ${lit(q.chapter_key)})`;
  for (const q of changed) {
    const prev = before.find((x) => x.instrument === q.instrument && x.code === q.code);
    L.push(`-- ${q.instrument}/${q.code}`);
    L.push(`update leaders.questions q set text_ar = ${lit(q.text_ar)}, options = ${lit(JSON.stringify(q.options))}::jsonb, chapter_key = ${lit(q.chapter_key)}`);
    L.push(`  from leaders.instruments i where i.id = q.instrument_id and i.key = ${lit(q.instrument)} and q.code = ${lit(q.code)}`);
    L.push(`  and (${now(prev)} or ${now(q)});`);
  }
  L.push('');
  L.push('do $$ declare n int; begin');
  L.push('  select count(*) into n from leaders.questions q join leaders.instruments i on i.id = q.instrument_id where false');
  for (const q of changed) L.push(`    or (i.key = ${lit(q.instrument)} and q.code = ${lit(q.code)} and ${now(q)})`);
  L.push('  ;');
  L.push(`  if n <> ${changed.length} then`);
  L.push("    raise exception 'v5.2: % من % صفًا طابق نص v5.2 بعد التحديث؛ صف لم يطابق نص v5.1، راجع قبل التفعيل', n, " + changed.length + ';');
  L.push('  end if;');
  L.push('end $$;');
  L.push(`insert into leaders.schema_migrations (name) values (${lit(MIGRATION)}) on conflict do nothing;`);
  return { sql: L.join('\n') + '\n', changed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const after = applyBalance(V51);
  const { sql, changed } = balanceSql(V51, after);
  mkdirSync(new URL('supabase/content/questions/v5.2/', ROOT), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(after, null, 2) + '\n');
  writeFileSync(OUT_SQL, sql);
  console.log(`v5.2: ${after.length} صفًا، ${changed.length} متغيرًا → ${OUT_JSON.pathname}\n${OUT_SQL.pathname}`);
}
