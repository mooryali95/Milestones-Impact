#!/usr/bin/env node
// إصدار الكتاب من المقترحات المعتمدة (المرحلة 4، الخطوة 2 من «الكتاب الأم»، اعتمدها المالك 2026-11-15)
//   node scripts/handbook/release.mjs --live [--to=v3.2]          يقرأ المعتمد من الإنتاج (قراءة فقط) ويبني الإصدار
//   node scripts/handbook/release.mjs --file=approved.json [--to=]   من ملف (للتجربة المحلية)
//   أضف --dry لعرض ما سيُطبَّق دون كتابة شيء.
// ما يفعله، بالمسار نفسه الذي يسلكه المنفذ يدويًا (docs/content/ملكية-المحتوى-ودليل-التحرير-v1.md):
//   1. ينسخ الإصدار الحالي إلى التالي، ويستبدل في كل باب القسم المعتمد بنصه المقترح.
//      يُطبَّق المقترح إن طابق أصله (base_md) القسم في المستودع حرفًا بحرف، وإلا يُتخطى ويُذكر السبب:
//      لا يُكتب مقترح فوق نص تغيّر بعده، ولا مقترحان على القسم نفسه في إصدار واحد.
//   2. يحدّث سجل هويات الأقسام: العنوان المغيّر يبقى بهويته (aliases)، والعنوان الجديد يأخذ هوية، والمزال يُلغى.
//   3. build-version.mjs: الترحيل وVERSION.json وتقرير الأثر IMPACT.md، ويرفض ما يكسر إحالة.
//   4. PROPOSALS.md بجانب الإصدار: ما دخله ولماذا ومن كتبه واعتمده، وما تُخطّي.
//   5. ترحيل صغير يعلّم المقترحات الداخلة released بإصدارها، بحارس status = 'approved'.
// لا يكتب في القاعدة شيئًا: الترحيلان يطبقهما المالك بسير migrate بعد دمج طلب الإصدار.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawSections, REFLECTION, replaceSection, sectionSource, targetLabel } from '../../supabase/functions/leaders-api/book-proposals.js';
import { headingsOf } from '../../supabase/functions/leaders-api/master-book.js';
import { dirOf, loadChapters, REPORTS, ROOT, VERSION } from './content.mjs';
import { LOCK, moduleJs, OUT, readLock, REG, sync } from './sections.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const nextVersion = (v) => { const p = v.slice(1).split('.').map(Number); return `v${p[0]}.${(p[1] || 0) + 1}`; };

/** تطبيق المقترحات على أبواب الإصدار: خالص، يعيد الأبواب الجديدة وما طُبّق وما تُخطّي وتغييرات سجل الهويات
 * @param {any[]} chapters أبواب الإصدار الحالي (loadChapters) @param {any[]} proposals المعتمدة بباب كل منها (dimension, chapter_key)
 * @param {{ sections: any[] }} registry سجل الهويات */
export function applyProposals(chapters, proposals, registry) {
  const byKey = new Map(chapters.map((c) => [`${c.dimension}/${c.chapter_key}`, { ...c }]));
  const reg = { ...registry, sections: registry.sections.map((s) => ({ ...s, aliases: [...(s.aliases || [])] })) };
  const regById = new Map(reg.sections.map((s) => [s.id, s]));
  const applied = [], skipped = [];
  const touched = new Set();
  const sorted = [...proposals].sort((a, b) => String(a.decided_at || '').localeCompare(String(b.decided_at || '')) || String(a.id).localeCompare(String(b.id)));
  for (const p of sorted) {
    const c = byKey.get(`${p.dimension}/${p.chapter_key}`);
    const skip = (why) => skipped.push({ ...p, why });
    if (!UUID.test(String(p.id))) { skip('معرّف غير صالح'); continue; }
    if (!c) { skip('الباب غير موجود في الإصدار'); continue; }
    // سؤال التأمل: يُستبدل كله بحارس الأصل نفسه
    if (p.section === REFLECTION) {
      if (touched.has(`${p.dimension}/${p.chapter_key}|${REFLECTION}`)) { skip('مقترح آخر على سؤال التأمل دخل هذا الإصدار قبله'); continue; }
      if (String(c.reflection_ar ?? '').trim() !== String(p.base_md ?? '').trim()) { skip('سؤال التأمل في المستودع يختلف عن النص الذي كُتب عليه المقترح (تغيّر بعده)'); continue; }
      c.reflection_ar = String(p.proposed_md).trim();
      touched.add(`${p.dimension}/${p.chapter_key}|${REFLECTION}`);
      applied.push({ ...p, new_section: REFLECTION });
      continue;
    }
    const s = p.section_id ? regById.get(p.section_id) : null;
    const key = s && !s.retired ? s.key : p.section;
    const src = sectionSource(c.body_md, key);
    if (src == null) { skip(`القسم «${key}» غير موجود في الباب`); continue; }
    if (touched.has(`${p.dimension}/${p.chapter_key}|${key}`)) { skip('مقترح آخر على القسم نفسه دخل هذا الإصدار قبله: يُعاد كتابته على النص الجديد'); continue; }
    if (src !== p.base_md) { skip('القسم في المستودع يختلف عن النص الذي كُتب عليه المقترح (تغيّر بعده)'); continue; }
    const idx = rawSections(c.body_md).findIndex((x) => x.key === key);
    const next = replaceSection(c.body_md, key, p.proposed_md);
    // أقسام المقترح في الباب بعده: إن بقي بينها عنوان القسم القديم فهو هو (وما قبله أو بعده قسم جديد)،
    // وإلا فالعنوان تغيّر، والقسم هو أول عناوين المقترح
    const n = Math.max(1, String(p.proposed_md).split('\n').filter((l) => /^##\s+\S/.test(l)).length);
    const got = rawSections(next).slice(idx, idx + n).map((x) => x.key);
    const newKey = got.includes(key) ? key : (got[0] ?? key);
    // عنوان القسم تغيّر بالمقترح: الهوية نفسها بالعنوان الجديد، والقديم في aliases فتتبعه الإحالات
    if (s && !s.retired && newKey && newKey !== s.key) { s.aliases = [...new Set([...s.aliases, s.key])]; s.key = newKey; }
    c.body_md = next;
    touched.add(`${p.dimension}/${p.chapter_key}|${newKey}`);
    touched.add(`${p.dimension}/${p.chapter_key}|${key}`);
    applied.push({ ...p, section: key, new_section: newKey });
  }
  // عناوين أزالها مقترح (### داخل القسم): تُلغى هويتها، والمتحقق يرفض ذلك إن أحالت إليها وثيقة
  for (const c of byKey.values()) {
    const heads = new Set(headingsOf(c.body_md).map((h) => h.key));
    for (const s of reg.sections) if (s.dim === c.dimension && s.chapter === c.chapter_key && !s.retired && !heads.has(s.key) && !(s.aliases || []).some((a) => heads.has(a))) s.retired = true;
  }
  return { chapters: [...byKey.values()], applied, skipped, registry: reg };
}

const md = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
export function renderProposals({ from, to, applied, skipped }) {
  const out = [`# المقترحات المعتمدة في كتاب القائد ${to} (من ${from})`, '',
    '> مولَّد بـ `scripts/handbook/release.mjs` من مقترحات الكتاب الأم المعتمدة. لا يُحرَّر يدويًا. تقرير الأثر في IMPACT.md بجانبه.', '',
    `**دخل الإصدار:** ${applied.length} · **تُخطّي:** ${skipped.length}`, ''];
  if (applied.length) {
    out.push('## ما دخل', '', '| الباب | القسم | السبب | كتبه | اعتمده |', '|---|---|---|---|---|');
    for (const p of applied) out.push(`| ${p.dimension}/${p.chapter_key} | ${md(targetLabel(p.section))}${p.new_section && p.new_section !== p.section ? ` ← ${md(p.new_section)}` : ''} | ${md(p.reason)} | ${md(p.author_name)} | ${md(String(p.decided_by || '').split('@')[0])} |`);
    out.push('');
  }
  if (skipped.length) {
    out.push('## ما تُخطّي (يبقى معتمدًا، ويحدّثه كاتبه ليدخل إصدارًا لاحقًا)', '');
    for (const p of skipped) out.push(`- ${p.dimension || '?'}/${p.chapter_key || '?'} «${targetLabel(p.section)}» (${p.author_name || ''}): ${p.why}`);
    out.push('');
  }
  return `${out.join('\n').trim()}\n`;
}

export const releaseSql = (name, to, ids) => `-- ════════════════════════════════════════════════════════════════
-- مقترحات الكتاب الأم التي دخلت الإصدار ${to}: تُعلَّم released بإصدارها
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant حالة مقترح للعرض وحده، والدوال تعمل قبله وبعده
-- مولّد بـ scripts/handbook/release.mjs مع الإصدار ${to}. لا تحرّره يدويًا.
-- الحارس: يُعلَّم المعتمد وحده، فلا يُمس مقترح سُحب أو رُد بعد بناء الإصدار. آمن لإعادة التشغيل.
update leaders.book_proposals set status = 'released', release_version = '${to}', updated_at = now()
 where status = 'approved' and id in (${ids.map((i) => `'${i}'`).join(', ')});

insert into leaders.schema_migrations (name) values ('${name}') on conflict do nothing;
`;

// إعادة كتابة متن الباب في ملفه مع إبقاء الترويسة والاختبار والتأمل كما هي حرفًا
export function rewriteBody(text, oldBody, newBody) {
  const at = text.indexOf('\n---QUIZ---');
  const head = text.slice(0, at), tail = text.slice(at);
  if (!head.includes(oldBody)) throw new Error('متن الباب لم يوجد في ملفه');
  return head.replace(oldBody, () => newBody) + tail;
}
// وسؤال التأمل (ما بعد ---REFLECTION---) بالطريقة نفسها
export function rewriteReflection(text, oldR, newR) {
  const at = text.indexOf('---REFLECTION---');
  const head = text.slice(0, at), tail = text.slice(at);
  if (!oldR) return `${head}---REFLECTION---\n${newR}\n`;
  if (!tail.includes(oldR)) throw new Error('سؤال التأمل لم يوجد في ملفه');
  return head + tail.replace(oldR, () => newR);
}

const SQL = `select p.id, p.module_id, p.section, p.section_id, p.base_md, p.proposed_md, p.reason, p.author_name, p.decided_by, p.decided_at,
  m.dimension, m.chapter_key from leaders.book_proposals p join leaders.handbook_modules m on m.id = p.module_id
  where p.status = 'approved' order by p.decided_at, p.id`;
async function live() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN مطلوب للقراءة من الإنتاج');
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `set transaction read only; ${SQL}` }),
  });
  if (!r.ok) throw new Error(`تعذّرت القراءة من الإنتاج: ${r.status} ${await r.text()}`);
  return r.json();
}

const stamp = (d = new Date()) => d.toISOString().replace(/\D/g, '').slice(0, 14);
const plus = (s, sec) => stamp(new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14) + sec)));
const run = (args) => execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' });

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => (process.argv.find((x) => x.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
  const dry = process.argv.includes('--dry');
  const from = VERSION;
  const to = arg('to') || nextVersion(from);
  const rows = process.argv.includes('--live') ? await live() : arg('file') ? JSON.parse(readFileSync(arg('file'), 'utf8')) : null;
  if (!rows) { console.error('--live أو --file=<json>'); process.exit(2); }
  const summary = (o) => { if (process.env.RELEASE_SUMMARY) writeFileSync(process.env.RELEASE_SUMMARY, JSON.stringify(o, null, 2)); };
  if (!rows.length) { console.log('لا مقترحات معتمدة تنتظر الإصدار.'); summary({ from, to, applied: 0, skipped: 0 }); process.exit(0); }
  if (!/^v\d+(\.\d+)*$/.test(to) || existsSync(dirOf(to))) { console.error(`الإصدار ${to} غير صالح أو موجود`); process.exit(2); }
  const chapters = loadChapters(from);
  const registry = JSON.parse(readFileSync(REG, 'utf8'));
  const r = applyProposals(chapters, rows, registry);
  console.log(renderProposals({ from, to, ...r }));
  if (!r.applied.length) { console.error('لا مقترح ينطبق على الإصدار الحالي، فلم يُبنَ إصدار.'); summary({ from, to, applied: 0, skipped: r.skipped.length }); process.exit(1); }
  if (dry) process.exit(0);

  // 1. الإصدار الجديد: نسخة من الحالي بلا تقاريره، ثم متن كل باب تغيّر
  mkdirSync(dirOf(to));
  for (const f of readdirSync(dirOf(from))) if (f.endsWith('.md') && !REPORTS.includes(f)) cpSync(join(dirOf(from), f), join(dirOf(to), f));
  const before = Object.fromEntries(chapters.map((c) => [c.file, c]));
  for (const c of r.chapters) {
    const o = before[c.file];
    if (o.body_md === c.body_md && o.reflection_ar === c.reflection_ar) continue;
    const p = join(dirOf(to), c.file);
    let text = readFileSync(p, 'utf8');
    if (o.body_md !== c.body_md) text = rewriteBody(text, o.body_md, c.body_md);
    if (o.reflection_ar !== c.reflection_ar) text = rewriteReflection(text, o.reflection_ar, c.reflection_ar);
    writeFileSync(p, text);
  }
  // 2. سجل الهويات: التغييرات أعلاه، ثم هوية لكل عنوان جديد
  const heads = loadChapters(to).flatMap((c) => headingsOf(c.body_md).map((h) => ({ dim: c.dimension, chapter: c.chapter_key, level: h.level, key: h.key })));
  const s = sync(r.registry, heads, readLock());
  s.reg.version = to;
  writeFileSync(REG, `${JSON.stringify(s.reg, null, 2)}\n`);
  writeFileSync(LOCK, `${s.lock.join('\n')}\n`);
  writeFileSync(OUT, moduleJs(s.reg));
  // 3. الترحيل وتقرير الأثر (يرفض ما يكسر إحالة)
  // الطابع بعد آخر ترحيل في المستودع وإن سبقته الساعة، فيبقى ترتيب الترحيلات ترتيب تطبيقها
  const last = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => /^\d{14}_/.test(f)).sort().at(-1)?.slice(0, 14) || '0';
  const t = stamp() > last ? stamp() : plus(last, 60);
  const name = `${t}_leaders_handbook_${to.replace(/\W/g, '_')}`;
  run(['scripts/handbook/build-version.mjs', `--from=${from}`, `--to=${to}`, `--name=${name}`]);
  // 4. سجل المقترحات، و5. ترحيل تعليمها
  writeFileSync(join(dirOf(to), 'PROPOSALS.md'), renderProposals({ from, to, ...r }));
  const rel = `${plus(t, 1)}_leaders_book_proposals_${to.replace(/\W/g, '_')}`;
  writeFileSync(join(ROOT, 'supabase/migrations', `${rel}.sql`), releaseSql(rel, to, r.applied.map((p) => p.id)));
  run(['scripts/db/migrations-list.mjs']);
  run(['scripts/db/snapshot.mjs', '--from-migrations']);
  summary({ from, to, applied: r.applied.length, skipped: r.skipped.length, migrations: [name, rel] });
  console.log(`\nالإصدار ${to}: ${r.applied.length} مقترحًا، وترحيلان ${name} و${rel}. ثم: npm run sections:check إن وُجد، وطلب دمج، وبعد الدمج يطبقهما migrate.`);
}
