#!/usr/bin/env node
// التصويب الحرج لاختبار باب بعد تثبيت الإصدار (D02): مفتاح خاطئ أو خطأ علمي أو نظامي أو لغوي فادح، بتوقيعين وسبب.
//   node scripts/content/patch.mjs --base=2026.11-c1 --key=milestone/milestone_3 --quiz-file=<اختبار مصوَّب.md>
//        --reason="المفتاح في السؤال الثالث خاطئ" --signed-by=a@x,b@y --regrade=rekey|drop
// يكتب إصدارًا ترقيعيًا (2026.11-c1.1) ببيانه، وترحيلًا يحدّث الاختبار بحارس بصمته في الإصدار الأساس، ويعيد تصحيح
// من حُفظت إجاباته نصًا بالمفتاح الجديد (rekey) أو بإسقاط ما حُذف من الأسئلة (drop) دون أن ينقص أحدًا، ويسجل
// التصويب، وينقل الدفعات المثبتة إلى الإصدار الترقيعي، ويضع إشعارًا للمتأثرين في طابور البريد.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseQuiz } from '../../supabase/functions/leaders-api/logic.js';
import { canonical, dollar, ID_RE, RELEASES, ROOT, sha, stamp } from './release.mjs';

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function nextId(base, exists = (id) => existsSync(join(RELEASES, id))) {
  const root = base.replace(/\.\d+$/, '');
  for (let n = 1; ; n++) if (!exists(`${root}.${n}`)) return `${root}.${n}`;
}

// المفتاح الجديد: كل سؤال في الاختبار كاملًا (بكتل المستويات كلها) وخياره الصحيح نصًا
export const keyPairs = (quizMd) => parseQuiz(quizMd).map((q) => [q.q, q.options[q.answer]]);

export function patchSql({ base, id, key, quizMd, reason, signedBy, regrade, manifest, migration }) {
  const [dimension, chapter] = key.split('/');
  const prev = base.areas.handbook_modules.items[key];
  const pairs = keyPairs(quizMd);
  const where = `dimension = ${quote(dimension)} and chapter_key = ${quote(chapter)}`;
  const regradeSql = regrade === 'none' ? '-- بلا إعادة تصحيح\n' : `-- إعادة التصحيح: من حُفظت إجاباته نصًا، بالمفتاح الجديد، وما حُذف من الأسئلة يسقط من الاحتساب.
-- تُرفع النتيجة إن علت نسبتها وحدها، فلا ينقص أحد بأثر رجعي. ومن لم تُحفظ إجاباته تبقى نتيجته كما هي.
with k(q, a) as (values
${pairs.map(([q, a]) => `  (${quote(q)}, ${quote(a)})`).join(',\n')}
), n as (
  select hp.participant_id, hp.module_id,
    count(k.q)::int as total,
    count(*) filter (where k.a = x->>'a')::int as score
  from leaders.handbook_progress hp
  cross join lateral jsonb_array_elements(hp.quiz_answers) x
  left join k on k.q = x->>'q'
  where hp.module_id = (select id from leaders.handbook_modules where ${where}) and jsonb_typeof(hp.quiz_answers) = 'array'
  group by hp.participant_id, hp.module_id
)
update leaders.handbook_progress hp set quiz_score = n.score, quiz_total = n.total, content_release = ${quote(id)}
from n
where hp.participant_id = n.participant_id and hp.module_id = n.module_id and n.total > 0
  and n.score::numeric / n.total > hp.quiz_score::numeric / nullif(hp.quiz_total, 0);
`;
  const subject = 'صوّبنا سؤالًا في اختبار من كتيبك';
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;font-size:15px">
<p>صوّبنا اختبار باب في كتيب القائد تصويبًا حرجًا: ${esc(reason)}.</p>
<p>طُبّق التصويب على الجميع بالتساوي، ولا تنقص درجة أحد بأثر رجعي، ومن تأثر رُفعت نتيجته.</p></div>`;
  return `-- ════════════════════════════════════════════════════════════════
-- تصويب حرج ${id} على ${base.id} (D02): اختبار ${key}
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: deferred بقرار D02، تصويب بتوقيعين يطبّقه المالك
-- مولَّد بـ scripts/content/patch.mjs، لا يُعدَّل يدويًا. السبب: ${reason.replace(/\n/g, ' ')}
select set_config('leaders.content_patch', 'on', false);

do $$ begin
  if not exists (select 1 from leaders.handbook_modules where ${where} and encode(sha256(convert_to(coalesce(quiz_md, ''), 'UTF8')), 'hex') = ${quote(prev.quiz_sha256)}) then
    raise exception 'اختبار ${key} لا يطابق بصمته في ${base.id}: راجع قبل التصويب';
  end if;
end $$;

update leaders.handbook_modules set quiz_md = ${dollar(quizMd)} where ${where};

${regradeSql}
insert into leaders.content_releases (id, base_id, git_ref, sha256, manifest, signed_by, note)
values (${quote(id)}, ${quote(base.id)}, null, ${quote(manifest.sha256)}, ${dollar(JSON.stringify(manifest))}::jsonb, array[${signedBy.map(quote).join(', ')}]::text[], ${quote(reason)})
on conflict (id) do nothing;
insert into leaders.content_patches (release_id, base_release_id, entity, entity_key, reason, signed_by, regrade)
values (${quote(id)}, ${quote(base.id)}, 'handbook_modules', ${quote(key)}, ${quote(reason)}, array[${signedBy.map(quote).join(', ')}]::text[], ${quote(regrade)});
update leaders.cohorts set content_release = ${quote(id)} where content_release = ${quote(base.id)};

-- إشعار من أجاب الاختبار، في طابور البريد الجماعي (D15)
insert into leaders.mail_queue (to_email, subject, html, ref, kind)
select p.email, ${quote(subject)}, ${dollar(html)}, 'participant:' || p.id, 'bulk'
from leaders.participants p
where not p.is_demo and p.email is not null and exists (select 1 from leaders.handbook_progress hp join leaders.handbook_modules m on m.id = hp.module_id where hp.participant_id = p.id and m.${where.replace(' and ', ' and m.')});

select set_config('leaders.content_patch', '', false);
insert into leaders.schema_migrations (name) values (${quote(migration)}) on conflict do nothing;
`;
}

export function patchedManifest(base, id, key, quizMd) {
  const items = { ...base.areas.handbook_modules.items, [key]: { ...base.areas.handbook_modules.items[key], quiz_sha256: sha(quizMd), patched_from: base.id } };
  const hb = { n: Object.keys(items).length, sha256: sha(canonical(items)), items };
  const body = { id, git_ref: null, base_id: base.id, areas: { ...base.areas, handbook_modules: hb } };
  return { ...body, sha256: sha(canonical(body)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
  const baseId = arg('base');
  if (!ID_RE.test(baseId) || !existsSync(join(RELEASES, baseId, 'MANIFEST.json'))) { console.error('--base=<إصدار مودع>'); process.exit(2); }
  const base = JSON.parse(readFileSync(join(RELEASES, baseId, 'MANIFEST.json'), 'utf8'));
  const key = arg('key');
  if (!base.areas.handbook_modules.items[key]) { console.error(`--key=<البعد/مفتاح الباب> غير موجود في ${baseId}`); process.exit(2); }
  const quizMd = readFileSync(arg('quiz-file'), 'utf8');
  if (!parseQuiz(quizMd).length) { console.error('الاختبار المصوَّب بلا أسئلة صالحة'); process.exit(2); }
  const reason = arg('reason').trim();
  if (reason.length < 10) { console.error('--reason بسبب مكتوب (10 أحرف فأكثر)'); process.exit(2); }
  const signedBy = [...new Set(arg('signed-by').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (signedBy.length < 2) { console.error('--signed-by يحتاج توقيعين مختلفين'); process.exit(2); }
  const regrade = arg('regrade') || 'rekey';
  if (!['rekey', 'drop', 'none'].includes(regrade)) { console.error('--regrade=rekey|drop|none'); process.exit(2); }
  const id = nextId(baseId);
  const manifest = patchedManifest(base, id, key, quizMd);
  mkdirSync(join(RELEASES, id), { recursive: true });
  writeFileSync(join(RELEASES, id, 'MANIFEST.json'), JSON.stringify(manifest, null, 1) + '\n');
  const migration = `${stamp()}_leaders_content_patch_${id.replace(/[^a-z0-9]/g, '_')}`;
  writeFileSync(join(ROOT, 'supabase/migrations', `${migration}.sql`), patchSql({ base, id, key, quizMd, reason, signedBy, regrade, manifest, migration }));
  console.log(`كُتب التصويب ${id} وترحيله ${migration}.sql. حدّث أصل الباب في إصدار الكتاب التالي بالنص نفسه.`);
}
