#!/usr/bin/env node
// لا يرجع release إلى الخلف خفية (تصور تحديث المنصة، المرحلة 6، مراجعة التحقق المستقل).
// النشر ينقل الدوال وفرع release إلى إيداع. إن كان الهدف أقدم من release (سلفًا له لا مساويًا) فالنشر تراجع:
// مثاله «طبّق ثم انشر» في migrate.yml ينتظر موافقة المالك، ويُدمج B فيُنشر أولًا، ثم ينشر migrate.yml الإيداع A الأقدم
// فوقه. التراجع المقصود يمر بسير التراجع الموحد يدويًا بالمدخل rollback = true وحده، وكل ما سواه يُرفض.
//
//   GH_TOKEN=... GITHUB_REPOSITORY=o/r ROLLBACK=true|false node scripts/ops/release-direction.mjs <sha>
//   رمز 0: الهدف يساوي release أو بعده، أو لا release بعد، أو تراجع مقصود. رمز 1: رجوع غير مقصود. رمز 2: تعذّر الحكم.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// status من GitHub لمقارنة <الهدف>...release: ahead = release بعد الهدف (الهدف أقدم)، behind = الهدف بعد release
export function direction(status) {
  if (status === null) return 'none';
  return { identical: 'same', behind: 'forward', ahead: 'backward', diverged: 'diverged' }[status] || 'unknown';
}

export function decide(status, rollback) {
  const dir = direction(status);
  if (dir === 'same') return { ok: true, dir, reason: 'الهدف هو ما في release: يُعاد نشره' };
  if (dir === 'forward') return { ok: true, dir, reason: 'الهدف بعد release: نشر إلى الأمام' };
  if (dir === 'none') return { ok: true, dir, reason: 'لا فرع release بعد: لا شيء يُرجع عنه' };
  if (rollback && (dir === 'backward' || dir === 'diverged')) return { ok: true, dir, reason: 'تراجع مقصود (rollback = true): release يرجع إلى الهدف' };
  if (dir === 'backward') return { ok: false, dir, reason: 'الهدف أقدم من release: النشر يرجع الإنتاج إلى الخلف. نُشر بعده إيداع أحدث، فلا شيء يلزم. للتراجع المقصود: سير التراجع الموحد يدويًا بالمدخل rollback = true' };
  if (dir === 'diverged') return { ok: false, dir, reason: 'الهدف وrelease متباعدان (ليس أحدهما سلفًا للآخر): لا نشر إلا تراجعًا مقصودًا (rollback = true)' };
  return { ok: false, dir, reason: `حالة مقارنة غير معروفة (${status}): لا نشر` };
}

export async function compareStatus({ repo, token, sha, fetchImpl = fetch }) {
  const r = await fetchImpl(`https://api.github.com/repos/${repo}/compare/${sha}...release`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  // 404: لا فرع release (أول نشر). أي رد آخر غير 200 يوقف الحكم
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`compare ${sha}...release: ${r.status}`);
  return (await r.json()).status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sha = process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!sha || !repo || !token) { console.error('::error::الاستدعاء: <sha> مع GITHUB_REPOSITORY وGH_TOKEN'); process.exit(2); }
  let status;
  try { status = await compareStatus({ repo, token, sha }); } catch (e) { console.error(`::error::تعذّر الحكم على اتجاه النشر: ${e.message}`); process.exit(2); }
  const res = decide(status, process.env.ROLLBACK === 'true');
  console.log(`${res.ok ? '::notice::' : '::error::'}${res.reason} (${sha})`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `direction=${res.dir}\n`);
  process.exit(res.ok ? 0 : 1);
}
