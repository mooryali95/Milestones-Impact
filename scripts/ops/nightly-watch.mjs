#!/usr/bin/env node
// حارس الفحوص الليلية (ش11، تصور تحديث المنصة، المرحلة 0 البند 3): يحمرّ إن لم ينجح أي فحص ليلي منذ 36 ساعة.
// فشل الفوترة في GitHub أوقف الفحوص الليلية من 2026-11-07 إلى 2026-11-10 («The job was not started because recent
// account payments have failed»)، فضاع وسط إنذار المحتوى الكاذب. يشغّله probe.yml كل ثلاث ساعات بـ GITHUB_TOKEN
// (قراءة سجل Actions وحده، لا الإنتاج). منطق القرار نقي يختبره scripts/ops/release-safety.test.js.
//
//   GH_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/ops/nightly-watch.mjs
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const NIGHTLY = ['schema-check.yml', 'backup.yml', 'restore-drill.yml'];
export const MAX_HOURS = 36;

// last: { ملف: آخر نجاح ISO أو null }. يحمرّ (ok false) إن لم يقع أي نجاح في النافذة
export function watch(last, now = new Date(), maxHours = MAX_HOURS) {
  const rows = Object.entries(last).map(([file, at]) => {
    const hours = at ? (now.getTime() - Date.parse(at)) / 36e5 : Infinity;
    return { file, at, hours, fresh: hours <= maxHours };
  });
  return { ok: rows.some((r) => r.fresh), rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repo || !token) { console.error('GITHUB_REPOSITORY وGH_TOKEN مطلوبان'); process.exit(2); }
  const last = {};
  for (const file of NIGHTLY) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${file}/runs?status=success&per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    // تعذّر قراءة السجل لا يُعدّ توقفًا للفحوص: يُذكر ويُتخطى، والقرار من الباقي
    if (!r.ok) { console.log(`::warning::تعذّرت قراءة تشغيلات ${file}: ${r.status}`); continue; }
    last[file] = (await r.json()).workflow_runs?.[0]?.updated_at || null;
  }
  if (!Object.keys(last).length) { console.log('::warning::لم يُقرأ أي سجل؛ لا حكم'); process.exit(0); }
  const res = watch(last);
  const lines = res.rows.map((x) => `- ${x.file}: ${x.at ? `آخر نجاح ${x.at} (قبل ${Math.round(x.hours)} ساعة)` : 'لا نجاح مسجّل'}`);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### الفحوص الليلية\n\n${lines.join('\n')}\n\n`);
  if (!res.ok) {
    console.log(`::error::لم ينجح أي فحص ليلي منذ ${MAX_HOURS} ساعة. افتح Actions: إن كان السبب «recent account payments have failed» فالحل في Settings، Billing and plans؛ وإلا فافتح آخر تشغيل فاشل لكل فحص.`);
    process.exit(1);
  }
}
