#!/usr/bin/env node
// فحص الأسرار في الملفات المودعة (git ls-files): يفشل إن وُجد مفتاح خدمة أو رمز وصول أو مفتاح خاص.
// مفتاح anon العام مسموح لأنه في الواجهات أصلًا: كل JWT يُفك حمله، ولا يُقبل إلا role = anon.
//   node scripts/ops/secrets-scan.mjs
// لا يطبع قيمة ما وجده، بل الملف والسطر ونوع السر فقط.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

export const PATTERNS = [
  ['مفتاح خاص', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['رمز وصول Supabase', /\bsbp_[a-f0-9]{40}\b/],
  ['مفتاح سري Supabase', /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ['مفتاح Resend', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/],
  ['مفتاح AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['رمز GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['مفتاح Stripe أو Creem سري', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b|\bcreem_(?:live_)?[A-Za-z0-9]{24,}\b/],
  ['سر إشعار دفع', /\bwhsec_[A-Za-z0-9+/=]{20,}/],
  ['مفتاح Slack', /\bxox[abprs]-[A-Za-z0-9-]{20,}/],
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(payload) {
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role ?? null; } catch { return null; }
}

export function scanText(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const [kind, re] of PATTERNS) if (re.test(line)) hits.push({ line: i + 1, kind });
    for (const m of line.matchAll(JWT)) {
      const role = jwtRole(m[1]);
      if (role !== 'anon') hits.push({ line: i + 1, kind: `JWT بدور ${role ?? 'غير معروف'}` });
    }
  });
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  let found = 0;
  let scanned = 0;
  for (const f of files) {
    let st;
    try { st = statSync(f); } catch { continue; }
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    const buf = readFileSync(f);
    if (buf.subarray(0, 8000).includes(0)) continue;   // ملف ثنائي
    scanned++;
    for (const h of scanText(buf.toString('utf8'))) { found++; console.error(`✗ ${f}:${h.line}: ${h.kind}`); }
  }
  if (found) { console.error(`\n${found} سر محتمل في الملفات المودعة. أزله، ودوّر السر نفسه فورًا لأنه صار في تاريخ Git.`); process.exit(1); }
  console.log(`✓ لا أسرار في ${scanned} ملفًا مودعًا`);
}
