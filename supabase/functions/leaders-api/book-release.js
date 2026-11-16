// ════════════════════════════════════════════════════════════════
// إصدار الكتاب من المقترحات المعتمدة: المنطق الخالص (المرحلة 4، الخطوة 2، وزر «أصدر الكتاب»)
// ════════════════════════════════════════════════════════════════
// مصدر واحد يقرؤه سكربت الإصدار (scripts/handbook/release.mjs) ومعاينة «أصدر الكتاب» في الخادم (book-release.ts)،
// فما يعرضه الزر قبل التشغيل هو ما يبنيه السير. لا ملفات ولا قاعدة هنا.
import { rawSections, REFLECTION, replaceSection, sectionSource, targetLabel } from './book-proposals.js';
import { headingsOf } from './master-book.js';

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

// ── زر «أصدر الكتاب» (اعتمده المالك 2026-11-16): قراءة حالة الإصدار من GitHub، منطق خالص ──
export const RELEASE_BRANCH = 'handbook/release-';
export const isReleaseRef = (ref) => typeof ref === 'string' && ref.startsWith(RELEASE_BRANCH);
export const versionOfRef = (ref) => (isReleaseRef(ref) ? ref.slice(RELEASE_BRANCH.length) : null);
/** حكم فحوص الطلب من check-runs: pending ما دام شيء يعمل، وfailure إن فشل شيء، وsuccess حين ينجح ci-ok والنشر المسبق */
export function checksVerdict(runs = []) {
  if (!runs.length) return 'pending';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  const bad = runs.filter((r) => ['failure', 'timed_out', 'action_required'].includes(r.conclusion));
  if (bad.length) return 'failure';
  return runs.some((r) => r.name === 'ci-ok' && r.conclusion === 'success') ? 'success' : 'pending';
}
/** ترحيلات طلب الإصدار بترتيبها، من ملفاته */
export const migrationsOf = (files = []) => files.map((f) => f.filename || f).filter((f) => /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(f))
  .map((f) => f.slice('supabase/migrations/'.length, -4)).sort();
/** مرحلة الإصدار للعرض: idle | building | failed | review | merging | published
 * @param {{ run?: any, pr?: any, applied?: boolean|null }} [x] */
export function releaseStage({ run = null, pr = null, applied = null } = {}) {
  if (pr?.merged) return applied === true ? 'published' : 'merging';
  if (pr && pr.state === 'open') return 'review';
  if (run && run.status !== 'completed') return 'building';
  if (run && run.conclusion === 'failure' && (!pr || pr.state !== 'open')) return 'failed';
  return 'idle';
}
