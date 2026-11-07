#!/usr/bin/env node
// سجل ما دُمج في main منذ آخر نشر (فرع release)، يراجعه المالك قبل استئناف النشر (D16).
//   git fetch origin main release && node scripts/ops/since-release.mjs
// يصنّف كل إيداع بما يمسه: الدوال، والترحيلات (بوسم البوابة)، والمنصات، والمحتوى، والوثائق.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gateOf } from './pending-migrations.mjs';

const BASE = process.env.SINCE_BASE || 'origin/release';
const HEAD = process.env.SINCE_HEAD || 'origin/main';
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=off', ...a], { encoding: 'utf8' }).trim();

export const AREAS = [
  ['الدوال', /^supabase\/functions\//],
  ['الترحيلات', /^supabase\/migrations\//],
  ['المحتوى', /^supabase\/content\//],
  ['منصة القادة', /^(leaders-app|leaders)\//],
  ['لوحة الإدارة', /^(admin-app|admin)\//],
  ['الموقع الرئيسي', /^home\//],
  ['المصفوفة', /^(src|public|index\.html)/],
  ['مشترك', /^shared\//],
  ['التشغيل', /^(\.github|scripts)\//],
  ['الوثائق', /^(docs\/|[A-Z]+\.md$)/],
];
export const areaOf = (f) => (AREAS.find(([, re]) => re.test(f)) || ['أخرى'])[0];

if (import.meta.url === `file://${process.argv[1]}`) {
  const commits = git('log', '--first-parent', '--format=%H%x09%h%x09%cs%x09%s', `${BASE}..${HEAD}`).split('\n').filter(Boolean);
  console.log(`# ما دُمج منذ آخر نشر\n\n${BASE} = ${git('rev-parse', '--short', BASE)}، و${HEAD} = ${git('rev-parse', '--short', HEAD)}، و${commits.length} إيداعًا.\n`);
  const all = new Map();
  const migrations = new Set();
  console.log('| الإيداع | التاريخ | العنوان | ما يمسه |');
  console.log('|---|---|---|---|');
  for (const line of commits) {
    const [full, short, date, subject] = line.split('\t');
    const files = git('diff', '--name-only', `${full}^1`, full).split('\n').filter(Boolean);
    const areas = [...new Set(files.map(areaOf))];
    areas.forEach((a) => all.set(a, (all.get(a) || 0) + 1));
    files.filter((f) => /^supabase\/migrations\/.*\.sql$/.test(f)).forEach((f) => migrations.add(f));
    console.log(`| ${short} | ${date} | ${subject.replace(/\|/g, '،')} | ${areas.join('، ')} |`);
  }
  console.log(`\n**المجالات:** ${[...all].map(([a, n]) => `${a} (${n})`).join('، ') || 'لا شيء'}`);
  if (migrations.size) {
    console.log('\n**ترحيلات جديدة** (تُطبَّق بسير migrate.yml قبل النشر ما لم توسم):');
    for (const f of [...migrations].sort()) {
      let gate = 'محذوف';
      try { gate = gateOf(readFileSync(f, 'utf8')).gate; } catch { /* حُذف بعد إضافته */ }
      console.log(`- \`${f.split('/').pop()}\` (${gate})`);
    }
  }
  const front = ['منصة القادة', 'لوحة الإدارة', 'الموقع الرئيسي', 'المصفوفة', 'مشترك'].filter((a) => all.has(a));
  if (front.length && all.has('الدوال')) console.log('\nتنبيه: تغييرات في الواجهات والدوال معًا. النشر يدفع الدوال أولًا ثم release، فلا يُدفع release يدويًا قبل نشر الدوال.');
}
