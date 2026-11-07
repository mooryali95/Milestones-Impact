#!/usr/bin/env node
// بيان إصدار محتوى الدفعة (D02): بصمة sha256 لكل باب وسؤال وأداة ونموذج وإعداد مُقاس، من التصدير الحي بعد المصالحة.
//   node scripts/content/release.mjs --from=.content-live/<التاريخ>/live.json --id=2026.11-c1 --cohort=<uuid>[,<uuid>] --signed-by=a@x,b@y
//       يكتب supabase/content/releases/<id>/MANIFEST.json وترحيلًا مؤجلًا يسجل الإصدار ويثبّته على الدفعات المسماة
//   node scripts/content/release.mjs --check   كل بيان مودع يطابق بصمته وترحيله (حارس الوحدات)
// ثم يوسم المالك المستودع: git tag content-<id> <الإيداع>. الإصدار بعد ترحيله لا يُعدَّل، والتصويب بـ patch.mjs.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUBRIC_SCALE } from '../../supabase/functions/leaders-api/labels.js';
import { POLICY_DIGEST } from '../../supabase/functions/leaders-api/policy-digest.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const RELEASES = join(ROOT, 'supabase/content/releases');
export const ID_RE = /^\d{4}\.\d{2}-[a-z0-9]+(\.\d+)?$/;
// ما لا يغيّر المحتوى: الأختام والأوقات
const VOLATILE = new Set(['created_at', 'updated_at', 'updated_by']);

export const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// تسلسل ثابت بمفاتيح مرتبة، فالبصمة لا تتغير بترتيب الأعمدة
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => !VOLATILE.has(k)).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const area = (rows, keyOf, extra = () => ({})) => {
  const items = {};
  for (const r of rows || []) items[keyOf(r)] = { id: r.id ?? null, sha256: sha(canonical(r)), ...extra(r) };
  const sorted = Object.fromEntries(Object.keys(items).sort().map((k) => [k, items[k]]));
  return { n: Object.keys(sorted).length, sha256: sha(canonical(sorted)), items: sorted };
};

export function buildManifest(live, { id, gitRef = null, root = ROOT } = {}) {
  const concepts = readFileSync(join(root, 'supabase/content/concepts/registry.json'), 'utf8');
  const areas = {
    handbook_modules: area(live.handbook_modules, (m) => `${m.dimension}/${m.chapter_key}`, (m) => ({ quiz_sha256: sha(String(m.quiz_md || '')) })),
    questions: area(live.questions, (q) => `${q.instrument_key}/${q.code}`),
    instruments: area(live.instruments, (i) => i.key),
    lab_items: area(live.lab_items, (l) => l.key),
    learning_models: area(live.learning_models, (m) => m.key),
    placement_model: area(live.placement_model, () => 'placement_model'),
    final_eval: area((live.programs || []).map((p) => ({ id: p.id, final_eval: p.final_eval ?? null })), (p) => p.id),
    rubric_scale: area([{ id: null, ...RUBRIC_SCALE }], () => `v${RUBRIC_SCALE.version}`),
    concepts: { n: 1, sha256: sha(concepts), items: {} },
    policy: { n: 1, sha256: POLICY_DIGEST.sha256, items: { [POLICY_DIGEST.version]: { id: null, sha256: POLICY_DIGEST.sha256 } } },
  };
  const body = { id, git_ref: gitRef, areas };
  return { ...body, sha256: sha(canonical(body)) };
}

// علامة دولار فريدة لا تظهر في النص
export function dollar(text) {
  let tag = '$mi$';
  for (let i = 0; String(text).includes(tag); i++) tag = `$mi${i}$`;
  return `${tag}${text}${tag}`;
}
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function releaseSql(m, { cohorts = [], signedBy = [], note = null, baseId = null, migration }) {
  const pin = cohorts.length
    ? `update leaders.cohorts set content_release = ${quote(m.id)} where id in (${cohorts.map(quote).join(', ')}) and content_release is null;\n`
    : '-- لا دفعة مسماة: يُثبَّت لاحقًا بترحيل يسميها\n';
  return `-- ════════════════════════════════════════════════════════════════
-- إصدار محتوى ${m.id} (D02): بيان البصمات وتثبيته على الدفعة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: deferred بقرار D02، يطبّقه المالك عند قطع لقطة الدفعة بعد المصالحة ومراجعة الخبراء وقبل أول قياس مبدئي
-- مولَّد بـ scripts/content/release.mjs من supabase/content/releases/${m.id}/MANIFEST.json، لا يُعدَّل يدويًا.

insert into leaders.content_releases (id, base_id, git_ref, sha256, manifest, signed_by, note)
values (${quote(m.id)}, ${baseId ? quote(baseId) : 'null'}, ${m.git_ref ? quote(m.git_ref) : 'null'}, ${quote(m.sha256)}, ${dollar(JSON.stringify(m))}::jsonb,
  array[${signedBy.map(quote).join(', ')}]::text[], ${note ? quote(note) : 'null'})
on conflict (id) do nothing;
${pin}
insert into leaders.schema_migrations (name) values (${quote(migration)}) on conflict do nothing;
`;
}

export const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);
export const migrationName = (id, ts) => `${ts}_leaders_content_release_${id.replace(/[^a-z0-9]/g, '_')}`;

export function checkReleases(root = ROOT) {
  const dir = join(root, 'supabase/content/releases');
  if (!existsSync(dir)) return [];
  const errs = [];
  const migs = readdirSync(join(root, 'supabase/migrations'));
  for (const id of readdirSync(dir)) {
    const m = JSON.parse(readFileSync(join(dir, id, 'MANIFEST.json'), 'utf8'));
    const { sha256, ...body } = m;
    if (m.id !== id || !ID_RE.test(id)) errs.push(`${id}: المعرّف لا يطابق مجلده أو صيغته`);
    if (sha(canonical(body)) !== sha256) errs.push(`${id}: البصمة الكلية لا تطابق البيان`);
    const mig = migs.find((f) => f.endsWith(`_leaders_content_release_${id.replace(/[^a-z0-9]/g, '_')}.sql`) || f.endsWith(`_leaders_content_patch_${id.replace(/[^a-z0-9]/g, '_')}.sql`));
    if (!mig) errs.push(`${id}: لا ترحيل له`);
    else if (!readFileSync(join(root, 'supabase/migrations', mig), 'utf8').includes(sha256)) errs.push(`${id}: ترحيله لا يحمل بصمته`);
  }
  return errs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
  if (process.argv.includes('--check')) {
    const errs = checkReleases();
    console.log(errs.length ? errs.join('\n') : 'بيانات الإصدارات مطابقة');
    process.exit(errs.length ? 1 : 0);
  }
  const id = arg('id');
  if (!ID_RE.test(id)) { console.error('--id=<السنة.الشهر-الدفعة> مثل 2026.11-c1'); process.exit(2); }
  if (existsSync(join(RELEASES, id))) { console.error(`الإصدار ${id} موجود ومجمّد؛ التصويب بـ scripts/content/patch.mjs`); process.exit(2); }
  if (!arg('from')) { console.error('--from=<live.json من scripts/content/export-live.mjs بعد المصالحة>'); process.exit(2); }
  const live = JSON.parse(readFileSync(arg('from'), 'utf8'));
  for (const k of ['handbook_modules', 'questions', 'lab_items', 'learning_models', 'placement_model', 'programs']) {
    if (!live[k]?.length) { console.error(`التصدير بلا ${k}: أعد التصدير بالنسخة الحالية من export-live.mjs`); process.exit(2); }
  }
  const signedBy = arg('signed-by').split(',').map((s) => s.trim()).filter(Boolean);
  if (signedBy.length < 2) { console.error('--signed-by يحتاج توقيعين (المالك ورئيس لجنة المحتوى)'); process.exit(2); }
  const cohorts = arg('cohort').split(',').map((s) => s.trim()).filter(Boolean);
  const m = buildManifest(live, { id, gitRef: arg('git') || null });
  mkdirSync(join(RELEASES, id), { recursive: true });
  writeFileSync(join(RELEASES, id, 'MANIFEST.json'), JSON.stringify(m, null, 1) + '\n');
  const name = migrationName(id, stamp());
  writeFileSync(join(ROOT, 'supabase/migrations', `${name}.sql`), releaseSql(m, { cohorts, signedBy, note: arg('note') || null, migration: name }));
  console.log(`كُتب البيان ${id} (${m.sha256.slice(0, 12)}) وترحيله ${name}.sql. بعد الدمج: git tag content-${id}`);
}
