#!/usr/bin/env node
// أثر النشر المؤجل (ش13، تصور تحديث المنصة، المرحلة 2): deploy-deferred-<sha> ترفعه بوابة النشر في ci.yml حين
// يؤجَّل نشر رأس main خارج النافذة أو في يوم تجميد، فتنشره الجدولة حين يُسمح. منطق الثقة نقي يختبره
// scripts/ops/release-safety.test.js.
//
//   node scripts/ops/deferred-deploy.mjs pending <sha>   يطبع true إن وُجد أثر موثوق لهذا الإيداع، وإلا false
//   node scripts/ops/deferred-deploy.mjs clear [<sha>]   يحذف كل أثر deploy-deferred-* (كل الصفحات)، ثم يتحقق
//
// الثقة: المستودع عام، وتشغيل pull_request من مستودع متفرع يشغّل نسخته المعدّلة من ci.yml فيستطيع رفع أداة بأي اسم.
// فلا يُقبل أثر إلا من تشغيل دفع أو تشغيل يدوي لـ ci.yml على main في هذا المستودع نفسه، وللإيداع نفسه. والحذف يشمل
// كل أثر بالبادئة أيًّا كان رافعه: المزوّر لا يضر بعد هذا الشرط، وحذفه لا يضر.
// القائمة كاملة بكل صفحاتها (أدوات المستودع مئات، ci-pass-* وغيرها)، وتعذّر القراءة يُفشل الخطوة ولا يُبقي أثرًا خفيًا.
// رمز الخروج: 0 نجاح، 1 بقي أثر بعد الحذف، 2 خطأ في الاستدعاء أو في واجهة GitHub.
import { fileURLToPath } from 'node:url';

export const PREFIX = 'deploy-deferred-';
export const WORKFLOW = '.github/workflows/ci.yml';
const TRUSTED_EVENTS = ['push', 'workflow_dispatch'];

// artifact: عنصر من قائمة الأدوات (ومعه workflow_run المختصر)، run: التشغيل كاملًا من actions/runs/<id>
export function trustedMarker(artifact, run, sha) {
  const wr = artifact?.workflow_run || {};
  if (!artifact || artifact.expired || artifact.name !== `${PREFIX}${sha}`) return false;
  if (wr.head_branch !== 'main' || wr.head_sha !== sha) return false;
  if (wr.repository_id == null || wr.head_repository_id !== wr.repository_id) return false;
  if (!run || run.id !== wr.id) return false;
  if (!TRUSTED_EVENTS.includes(run.event) || run.head_branch !== 'main' || run.head_sha !== sha) return false;
  if (!String(run.path || '').startsWith(WORKFLOW)) return false;
  return run.head_repository?.id === run.repository?.id && run.repository?.id === wr.repository_id;
}

export function github({ repo, token, fetchImpl = fetch }) {
  const call = async (path, method = 'GET') => {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (method === 'DELETE') {
      // 404: حُذف قبلنا (تشغيل متزامن)، وهو المطلوب
      if (r.status === 204 || r.status === 404) return null;
      throw new Error(`DELETE ${path}: ${r.status}`);
    }
    if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
    return r.json();
  };
  // كل الصفحات، لا الأولى وحدها
  const artifacts = async (query = '') => {
    const all = [];
    for (let page = 1; page <= 200; page++) {
      const j = await call(`actions/artifacts?per_page=100&page=${page}${query}`);
      const got = j.artifacts || [];
      all.push(...got);
      if (got.length < 100) return all;
    }
    throw new Error('actions/artifacts: أكثر من 200 صفحة');
  };
  return { call, artifacts };
}

export async function pending(api, sha) {
  const named = (await api.artifacts(`&name=${encodeURIComponent(PREFIX + sha)}`)).filter((a) => !a.expired);
  for (const a of named) {
    if (!a.workflow_run?.id) continue;
    const run = await api.call(`actions/runs/${a.workflow_run?.id}`);
    if (trustedMarker(a, run, sha)) return true;
  }
  return false;
}

export async function clear(api, sha = '') {
  const all = (await api.artifacts()).filter((a) => a.name.startsWith(PREFIX));
  // ومعه الاسم المطلوب بالضبط، كما تسأله الجدولة، احتياطًا من أداة رُفعت أثناء التصفح
  if (sha) all.push(...(await api.artifacts(`&name=${encodeURIComponent(PREFIX + sha)}`)));
  const ids = [...new Set(all.map((a) => a.id))];
  for (const id of ids) await api.call(`actions/artifacts/${id}`, 'DELETE');
  const left = sha ? (await api.artifacts(`&name=${encodeURIComponent(PREFIX + sha)}`)).length : 0;
  return { deleted: ids.length, left };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, sha = ''] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY || process.env.REPO;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repo || !token) { console.error('GITHUB_REPOSITORY وGH_TOKEN مطلوبان'); process.exit(2); }
  if (!['pending', 'clear'].includes(cmd) || (cmd === 'pending' && !/^[0-9a-f]{40}$/.test(sha)) || (sha && !/^[0-9a-f]{40}$/.test(sha))) {
    console.error('الاستعمال: deferred-deploy.mjs pending <sha> | clear [<sha>]');
    process.exit(2);
  }
  const api = github({ repo, token });
  try {
    if (cmd === 'pending') {
      console.log(String(await pending(api, sha)));
    } else {
      const r = await clear(api, sha);
      console.error(`حُذف ${r.deleted} من آثار النشر المؤجل`);
      if (r.left) { console.log(`::error::بقي ${r.left} أثر باسم ${PREFIX}${sha} بعد الحذف`); process.exit(1); }
    }
  } catch (e) {
    console.log(`::error::تعذّرت قراءة آثار النشر المؤجل أو حذفها: ${e.message}`);
    process.exit(2);
  }
}
