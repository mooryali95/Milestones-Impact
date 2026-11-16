// ════════════════════════════════════════════════════════════════
// زر «أصدر الكتاب» للمدير العام (اعتمده المالك 2026-11-16): المعاينة، والتشغيل، والمتابعة، والنشر من الكتاب الأم
// ════════════════════════════════════════════════════════════════
// المسار نفسه الذي يسلكه المنفذ (سير Handbook release ثم الدمج ثم migrate)، يُشغَّل من المنصة بمفتاح GitHub
// محفوظ سرًّا في الدالة (GITHUB_RELEASE_TOKEN: مفتاح دقيق على هذا المستودع وحده بصلاحيات Actions وContents وPull requests).
// بلا المفتاح يعمل الكتاب كما هو، وتعرض اللوحة طريقة الإعداد. لا يصل نص المشاركين إلا بعد ضغط «انشر» من المدير العام.
import { audit, db, Fail } from './core.ts';
import { applyProposals, checksVerdict, isReleaseRef, migrationsOf, releaseStage, versionOfRef } from './book-release.js';
import { SECTION_IDS } from './handbook-section-ids.js';
import { targetLabel } from './book-proposals.js';

const TOKEN = () => Deno.env.get('GITHUB_RELEASE_TOKEN') || '';
const REPO = () => Deno.env.get('GITHUB_RELEASE_REPO') || 'mooryali95/Milestones-Impact';

async function gh(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'leaders-api', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Fail(r.status === 401 || r.status === 403 ? 'مفتاح GitHub غير صالح أو بلا الصلاحيات اللازمة. راجع إعداد المفتاح' : `تعذّر الاتصال بـ GitHub (${r.status})`, 502, 'github', { detail: j?.message || '' });
  return j;
}

// المعاينة من الإنتاج بالمنطق نفسه الذي يبني به السير: ما يدخل وما يُتخطى ولماذا
async function preview() {
  const [{ data: props }, { data: mods }] = await Promise.all([
    db.from('book_proposals').select('id, module_id, section, section_id, base_md, proposed_md, reason, author_name, decided_by, decided_at').eq('status', 'approved'),
    db.from('handbook_modules').select('id, dimension, chapter_key, title_ar, body_md, quiz_md, reflection_ar'),
  ]);
  const byId = new Map((mods || []).map((m: any) => [m.id, m]));
  const rows = (props || []).map((p: any) => ({ ...p, dimension: byId.get(p.module_id)?.dimension, chapter_key: byId.get(p.module_id)?.chapter_key }));
  const chapters = (mods || []).map((m: any) => ({ file: `${m.dimension}/${m.chapter_key}`, dimension: m.dimension, chapter_key: m.chapter_key, body_md: m.body_md || '', quiz_md: m.quiz_md || '', reflection_ar: m.reflection_ar || '' }));
  const r = applyProposals(chapters, rows, { sections: SECTION_IDS as any[] });
  const label = (p: any) => ({ id: p.id, chapter: byId.get(p.module_id)?.title_ar || `${p.dimension}/${p.chapter_key}`, section: targetLabel(p.section), author: p.author_name, reason: p.reason });
  return { applied: r.applied.map(label), skipped: r.skipped.map((p: any) => ({ ...label(p), why: p.why })) };
}

async function latest() {
  const [runs, pulls] = await Promise.all([
    gh('/actions/workflows/handbook-release.yml/runs?per_page=1'),
    gh('/pulls?state=all&per_page=30&sort=created&direction=desc'),
  ]);
  const r = runs?.workflow_runs?.[0];
  const run = r ? { status: r.status, conclusion: r.conclusion, url: r.html_url, created_at: r.created_at } : null;
  const p = (pulls || []).find((x: any) => isReleaseRef(x.head?.ref));
  let pr = null;
  if (p) {
    const [checks, files] = await Promise.all([gh(`/commits/${p.head.sha}/check-runs?per_page=100`), gh(`/pulls/${p.number}/files?per_page=100`)]);
    pr = { number: p.number, url: p.html_url, state: p.state, merged: !!p.merged_at, merged_at: p.merged_at, version: versionOfRef(p.head.ref), sha: p.head.sha, checks: checksVerdict(checks?.check_runs || []), migrations: migrationsOf(files || []) };
  }
  // فرع إصدار دُفع ولم يُفتح طلبه (إعداد Actions يمنع GITHUB_TOKEN من فتحه): يفتحه الزر بالمفتاح
  const refs = await gh(`/git/matching-refs/heads/${encodeURIComponent('handbook/release-')}`).catch(() => []);
  const orphan = (refs || []).map((x: any) => x.ref.replace('refs/heads/', '')).find((ref: string) => !(pulls || []).some((x: any) => x.head?.ref === ref)) || null;
  return { run, pr, orphan };
}

async function appliedAll(names: string[]) {
  if (!names.length) return null;
  const { data } = await db.from('schema_migrations').select('name').in('name', names);
  return (data || []).length === names.length;
}

export async function releaseState() {
  const approved = await preview();
  if (!TOKEN()) return { success: true, configured: false, preview: approved, stage: 'idle' };
  const { run, pr, orphan } = await latest();
  const applied = pr?.merged ? await appliedAll(pr.migrations) : null;
  return { success: true, configured: true, preview: approved, run, pr, orphan, applied, stage: releaseStage({ run, pr, applied }) };
}

export async function releaseStart(a: { email: string }) {
  if (!TOKEN()) throw new Fail('أعدّ مفتاح GitHub أولًا', 400, 'not_configured');
  const { run, pr } = await latest();
  if (pr && pr.state === 'open') throw new Fail(`طلب الإصدار ${pr.version} مفتوح: انشره أو أغلقه قبل إصدار جديد`, 409, 'busy');
  if (run && run.status !== 'completed') throw new Fail('إصدار يُبنى الآن', 409, 'busy');
  const p = await preview();
  if (!p.applied.length) throw new Fail(p.skipped.length ? 'لا مقترح معتمد ينطبق على النص الحالي: كلها متخطاة، وأسبابها في المعاينة' : 'لا مقترحات معتمدة تنتظر الإصدار', 400, 'empty');
  await gh('/actions/workflows/handbook-release.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { dry_run: false } }) });
  await audit('admin', a.email, 'book.release-start', 'book_proposals', null, null, { proposals: p.applied.length });
  return { success: true, proposals: p.applied.length };
}

// فتح طلب فرع إصدار دُفع بلا طلب، وتشغيل الفحوص عليه
export async function releaseOpenPr(a: { email: string }) {
  if (!TOKEN()) throw new Fail('أعدّ مفتاح GitHub أولًا', 400, 'not_configured');
  const { orphan } = await latest();
  if (!orphan) throw new Fail('لا فرع إصدار ينتظر طلبًا', 400, 'none');
  const ver = versionOfRef(orphan);
  const pr = await gh('/pulls', { method: 'POST', body: JSON.stringify({ base: 'main', head: orphan, title: `كتاب القائد ${ver}: المقترحات المعتمدة من الكتاب الأم`, body: `مولَّد بسير «Handbook release» وفُتح من زر «أصدر الكتاب». ما دخل الإصدار ولماذا في \`supabase/content/handbook/${ver}/PROPOSALS.md\`، والأثر في \`IMPACT.md\`.` }) });
  await gh('/actions/workflows/ci.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: orphan }) });
  await audit('admin', a.email, 'book.release-pr', 'book_proposals', null, null, { pr: pr?.number, version: ver });
  return { success: true, number: pr?.number };
}

// النشر: دمج طلب الإصدار بعد خضرة فحوصه، ثم تطبيق ترحيليه بسير migrate. قرار المدير العام وحده
export async function releasePublish(a: { email: string }, b: any) {
  if (!TOKEN()) throw new Fail('أعدّ مفتاح GitHub أولًا', 400, 'not_configured');
  const { pr } = await latest();
  if (!pr || pr.number !== Number(b?.number)) throw new Fail('طلب الإصدار تغيّر. أعد فتح لوحة الإصدار', 409, 'changed');
  if (!pr.merged) {
    if (pr.state !== 'open') throw new Fail('طلب الإصدار مغلق', 409, 'closed');
    if (pr.checks !== 'success') throw new Fail(pr.checks === 'failure' ? 'فحوص الطلب فشلت: لا يُنشر حتى تُصلح' : 'فحوص الطلب ما زالت تعمل', 409, 'checks');
    if (String(b?.sha || '') !== pr.sha) throw new Fail('تغيّر الطلب بعد أن راجعته. أعد فتح لوحة الإصدار', 409, 'changed');
    await gh(`/pulls/${pr.number}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'merge', sha: pr.sha, commit_title: `Merge pull request #${pr.number}: كتاب القائد ${pr.version} من مقترحات الكتاب الأم` }) });
  }
  if (!pr.migrations.length) throw new Fail('لا ترحيلات في طلب الإصدار', 409, 'empty');
  await gh('/actions/workflows/migrate.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { mode: 'apply', migrations: pr.migrations.join(' ') } }) });
  await audit('admin', a.email, 'book.release-publish', 'book_proposals', null, null, { pr: pr.number, version: pr.version, migrations: pr.migrations });
  return { success: true, version: pr.version, migrations: pr.migrations };
}
