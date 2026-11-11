// مجموعات رحلات المتصفح بحسب الخوادم التي يفتحها كل ملف، ليشغّل CI ما يمسه التعديل وحده.
// المصدر الواحد: منافذ localhost في كل ملف e2e/*.spec.js، فالملف الجديد يُصنَّف وحده بلا قائمة يدوية.
//
//   node scripts/ops/e2e-groups.mjs --check        كل ملف في مجموعة واحدة بالضبط (يحرسه ci-selective.test.js)
//   node scripts/ops/e2e-groups.mjs list           المجموعات وملفاتها
//   node scripts/ops/e2e-groups.mjs run <group>    يشغّل ملفات المجموعة بخوادمها وحدها (E2E_SERVERS)
//
// التحقق المحلي الكامل (npm run verify) يبقى يشغّل الرحلات كلها بـ npm run e2e.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// المنفذ ← اسم الخادم في playwright.config.js
export const SERVERS = { 4301: 'home', 4302: 'matrix', 4303: 'admin', 4304: 'leaders' };

// المجموعة ← شرط على مجموعة الخوادم. الترتيب مهم: أول شرط يصدق يأخذ الملف.
export const GROUPS = [
  { id: 'cross', title: 'الإدارة ومنصة القادة معًا', test: (s) => s.has('admin') && s.has('leaders') },
  { id: 'admin', title: 'لوحة الإدارة', test: (s) => s.has('admin') },
  { id: 'leaders', title: 'منصة القادة (ومعها الموقع)', test: (s) => s.has('leaders') },
  { id: 'site', title: 'الموقع الرئيسي والمصفوفة', test: (s) => s.size > 0 },
];

export function serversOf(text) {
  return new Set([...text.matchAll(/localhost:(\d{4})/g)].map((m) => SERVERS[m[1]]).filter(Boolean));
}

export function groupOf(servers) {
  return GROUPS.find((g) => g.test(servers))?.id || null;
}

export function specs(dir = `${root}/e2e`) {
  return readdirSync(dir).filter((f) => f.endsWith('.spec.js')).sort().map((f) => {
    const servers = serversOf(readFileSync(`${dir}/${f}`, 'utf8'));
    return { file: `e2e/${f}`, servers: [...servers].sort(), group: groupOf(servers) };
  });
}

export function plan(group) {
  const files = specs().filter((s) => s.group === group);
  const servers = [...new Set(files.flatMap((s) => s.servers))].sort();
  return { files: files.map((s) => s.file), servers };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, group] = process.argv.slice(2);
  const all = specs();
  if (cmd === '--check') {
    const orphans = all.filter((s) => !s.group);
    if (orphans.length) {
      console.error(`ملفات بلا مجموعة (لا منفذ معروف): ${orphans.map((s) => s.file).join('، ')}`);
      process.exit(1);
    }
    console.log(`${all.length} ملفًا في ${GROUPS.length} مجموعات، كل ملف في مجموعة واحدة.`);
  } else if (cmd === 'list') {
    for (const g of GROUPS) {
      const p = plan(g.id);
      console.log(`${g.id} (${g.title}): ${p.files.length} ملفًا، الخوادم: ${p.servers.join('، ')}`);
      for (const f of p.files) console.log(`  ${f}`);
    }
  } else if (cmd === 'run' && GROUPS.some((g) => g.id === group)) {
    const p = plan(group);
    if (!p.files.length) { console.log(`لا ملفات في ${group}.`); process.exit(0); }
    console.log(`رحلات ${group}: ${p.files.length} ملفًا على ${p.servers.join('، ')}`);
    const r = spawnSync('npx', ['playwright', 'test', ...p.files], {
      cwd: root, stdio: 'inherit', env: { ...process.env, E2E_SERVERS: p.servers.join(',') },
    });
    process.exit(r.status ?? 1);
  } else {
    console.error(`الاستعمال: --check | list | run <${GROUPS.map((g) => g.id).join('|')}>`);
    process.exit(2);
  }
}
