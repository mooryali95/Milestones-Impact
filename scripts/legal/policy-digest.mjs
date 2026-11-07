#!/usr/bin/env node
// بصمة نص وثائق برنامج القادة (D18): sha256 لصفحة الوثائق وسجل تغييراتها، تُسجَّل مع كل موافقة في consent_events.
//   node scripts/legal/policy-digest.mjs           يكتب supabase/functions/leaders-api/policy-digest.js
//   node scripts/legal/policy-digest.mjs --check   يفشل إن لم تطابق البصمة المودعة النص الحالي (حارس الوحدات)
// تغيير النص بلا نسخة جديدة في POLICY_CHANGES مرفوض: كل نص وافق عليه أحد له نسخة واحدة وبصمة واحدة.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIAL_CHANGE_AR, POLICY_CHANGES, POLICY_VERSION } from '../../supabase/functions/leaders-api/labels.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'supabase/functions/leaders-api/policy-digest.js');

export function policyDigest() {
  const page = readFileSync(join(ROOT, 'leaders-app/src/screens/Legal.jsx'), 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(page + '\n' + JSON.stringify({ MATERIAL_CHANGE_AR, POLICY_CHANGES }), 'utf8').digest('hex');
}

export function recorded() {
  if (!existsSync(OUT)) return null;
  const m = readFileSync(OUT, 'utf8').match(/version: '([^']+)', sha256: '([0-9a-f]{64})'/);
  return m ? { version: m[1], sha256: m[2] } : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sha256 = policyDigest();
  const rec = recorded();
  if (process.argv.includes('--check')) {
    const ok = rec && rec.version === POLICY_VERSION && rec.sha256 === sha256;
    console.log(ok ? 'بصمة الوثائق مطابقة' : 'بصمة الوثائق لا تطابق نصها: أضف نسخة في POLICY_CHANGES ثم شغّل node scripts/legal/policy-digest.mjs');
    process.exit(ok ? 0 : 1);
  }
  if (rec && rec.version === POLICY_VERSION && rec.sha256 !== sha256) {
    console.error(`تغيّر نص الوثائق والنسخة ما زالت ${POLICY_VERSION}: أضف نسخة جديدة في POLICY_CHANGES (labels.js)، جوهرية أو غير جوهرية، ثم أعد التشغيل`);
    process.exit(1);
  }
  writeFileSync(OUT, `// مولَّد بـ scripts/legal/policy-digest.mjs، لا يُعدَّل يدويًا: بصمة نص الوثائق للنسخة النافذة،\n// تُسجَّل مع كل موافقة في consent_events (D18).\nexport const POLICY_DIGEST = Object.freeze({ version: '${POLICY_VERSION}', sha256: '${sha256}' });\n`);
  console.log(`كُتبت البصمة للنسخة ${POLICY_VERSION}`);
}
