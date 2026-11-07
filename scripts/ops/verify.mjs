#!/usr/bin/env node
// التحقق المحلي الكامل قبل أي طلب دمج (D16 في سجل قرارات لجنة الخبراء):
//   npm run verify                 كل الخطوات بترتيب build-and-test في ci.yml
//   npm run verify -- --skip=e2e   تخطي خطوات بعينها للتطوير؛ الناتج يُعلَن عندها «غير صالح للدمج»
// يطبع في آخره ملخصًا برقم الإيداع وحالة الشجرة يُلصق في طلب الدمج. السجل الكامل لكل خطوة في مجلد مؤقت.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STEPS } from './verify-steps.mjs';

const skip = new Set((process.argv.find((a) => a.startsWith('--skip=')) || '--skip=').slice(7).split(',').filter(Boolean));
const unknown = [...skip].filter((s) => !STEPS.some((x) => x.id === s));
if (unknown.length) { console.error(`خطوات غير معروفة: ${unknown.join('، ')}. المتاح: ${STEPS.map((s) => s.id).join('، ')}`); process.exit(2); }

const sh = (cmd) => spawnSync('bash', ['-o', 'pipefail', '-c', cmd], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
const git = (args) => sh(`git ${args}`).stdout.trim();
const logs = mkdtempSync(join(tmpdir(), 'mi-verify-'));
const sha = git('rev-parse --short HEAD');
const results = [];

for (const step of STEPS) {
  if (skip.has(step.id)) { results.push({ step, status: 'skipped', why: 'بطلب --skip' }); continue; }
  if (step.needsToken && !process.env.SUPABASE_ACCESS_TOKEN) { results.push({ step, status: 'skipped', why: 'يحتاج SUPABASE_ACCESS_TOKEN، ويُجرى في وظيفة deploy' }); continue; }
  const t0 = Date.now();
  let out = '';
  let ok = true;
  for (const cmd of step.cmds) {
    process.stdout.write(`… ${step.title}: ${cmd.slice(0, 90)}\n`);
    const r = sh(cmd);
    out += `$ ${cmd}\n${r.stdout}${r.stderr}\n`;
    if (r.status !== 0) { ok = false; out += `(رمز الخروج ${r.status})\n`; break; }
  }
  const log = join(logs, `${step.id}.log`);
  writeFileSync(log, out);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  results.push({ step, status: ok ? 'passed' : 'failed', secs, log });
  if (!ok) console.error(`✗ ${step.title} (${secs}ث). آخر الناتج:\n${out.split('\n').slice(-40).join('\n')}`);
}

const dirty = git('status --porcelain');
const failed = results.filter((r) => r.status === 'failed');
const skipped = results.filter((r) => r.status === 'skipped' && !r.step.needsToken);
const icon = { passed: '✓', failed: '✗', skipped: '–' };
console.log(`\n## التحقق المحلي (npm run verify) على ${sha}${dirty ? ' مع تعديلات غير مودعة' : ''}\n`);
console.log('| الخطوة | النتيجة | الزمن |');
console.log('|---|---|---|');
for (const r of results) console.log(`| ${r.step.title} | ${icon[r.status]} ${r.status === 'skipped' ? r.why : r.status === 'passed' ? 'نجح' : 'فشل'} | ${r.secs ? `${r.secs}ث` : ''} |`);
console.log(`\nالسجلات: ${logs}`);
if (failed.length || skipped.length || dirty) {
  console.log(`\nغير صالح للدمج: ${[failed.length && `${failed.length} خطوة فشلت`, skipped.length && `${skipped.length} خطوة تُخطّيت`, dirty && 'الشجرة غير نظيفة'].filter(Boolean).join('، ')}.`);
}
process.exit(failed.length ? 1 : 0);
