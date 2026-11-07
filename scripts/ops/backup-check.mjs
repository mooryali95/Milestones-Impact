#!/usr/bin/env node
// فحص النسخة في R2 بلا فك تشفير (D09): يقرأ latest.json، ويفشل إن تجاوز عمرها الحد، أو غاب ملف من البيان
// أو اختلف حجمه، أو خلا البيان من عدد الصفوف. يشغله restore-drill.yml والمالك؛ والتمرين الكامل بفك
// التشفير والاستعادة في scripts/ops/restore-drill.sh على جهاز المالك (المفتاح الخاص خارج GitHub).
//   R2_...=... node scripts/ops/backup-check.mjs [--max-hours=36]
import { client } from './r2.mjs';

export function checkManifest(m, heads, now = Date.now(), maxHours = 36) {
  const issues = [];
  const age = (now - Date.parse(m?.at)) / 36e5;
  if (!Number.isFinite(age)) issues.push('البيان بلا وقت صالح');
  else if (age > maxHours) issues.push(`آخر نسخة عمرها ${Math.floor(age)} ساعة، فوق ${maxHours}`);
  if (!m?.rows || !Object.keys(m.rows).length) issues.push('البيان بلا عدد صفوف');
  if (m?.encryption !== 'public-key') issues.push(`التشفير ${m?.encryption || 'غير معروف'}، والمعتمد public-key (D09)`);
  if (!m?.files?.length) issues.push('البيان بلا ملفات');
  for (const f of m?.files || []) {
    const h = heads[f.key];
    if (!h) issues.push(`${f.key} غائب من الدلو`);
    else if (h.bytes !== f.bytes) issues.push(`${f.key}: ${h.bytes} بايت في الدلو و${f.bytes} في البيان`);
  }
  return { age_hours: Number.isFinite(age) ? Math.floor(age) : null, issues };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const max = Number((process.argv.find((a) => a.startsWith('--max-hours=')) || '=36').split('=')[1]);
  const r2 = client();
  const m = JSON.parse((await r2.get('latest.json')).toString('utf8'));
  const heads = Object.fromEntries(await Promise.all((m.files || []).map(async (f) => [f.key, await r2.head(f.key)])));
  const { age_hours, issues } = checkManifest(m, heads, Date.now(), max);
  issues.forEach((x) => console.error(`✗ ${x}`));
  if (issues.length) process.exit(1);
  console.log(`✓ نسخة ${m.at} (عمرها ${age_hours} ساعة)، و${m.files.length} ملفًا بأحجام البيان`);
}
