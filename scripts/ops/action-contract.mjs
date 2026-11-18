#!/usr/bin/env node
// اختبار العقد مع الإصدار السابق (تصور تحديث المنصة بلا أثر، المرحلة 6، البند 7، وش4): كل إجراء في جداول توزيع
// leaders-api (open وparticipant وexpert وcoordinator وadmin في index.ts) عند آخر إيداع وصل الإنتاج (فرع release) يبقى في
// جدوله نفسه الآن، فتبويب فُتح قبل النشر لا يرى «إجراء غير معروف». الإصدار السابق يُقرأ من فرع release نفسه (يتحرك مع كل ترقية،
// فلا لقطة مودعة تُنسى)، والحذف المقصود بعد 14 يومًا من نشر بديله يُكتب في action-contract-retired.json.
//   node scripts/ops/action-contract.mjs --fetch --against=origin/release
// --fetch يحدّث origin/release قبل القراءة: إيداعه موجود محليًا فيُنقل المرجع وحده، وإلا جُلب بعمق 1. الجلب بعمق 1 لإيداع موجود
// يعلّمه حدًا سطحيًا فيقطع تاريخ الفرع الحالي في المستودع المشترك (حدث عند كتابة هذا)، فلا يُجلب ما هو موجود.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const INDEX = 'supabase/functions/leaders-api/index.ts';
export const TABLES = ['open', 'participant', 'expert', 'coordinator', 'admin'];
export const RETIRED_FILE = join(ROOT, 'scripts/ops/action-contract-retired.json');
export const MIN_DAYS = 14;

// مفاتيح جدول توزيع في نص index.ts: من «const <اسم>: Record» إلى أول «};» في أول السطر، والمفتاح على عمق سطرين وحده
// (المفاتيح الأعمق داخل أجسام الدوال)، مقتبسًا ('auth.start') أو معرّفًا (me)
export function dispatchTables(src) {
  const out = {};
  for (const t of TABLES) {
    const start = src.search(new RegExp(`^const ${t}: Record<`, 'm'));
    if (start < 0) throw new Error(`جدول التوزيع ${t} غير موجود في ${INDEX}`);
    const end = src.indexOf('\n};', start);
    out[t] = [...src.slice(start, end).matchAll(/^ {2}(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/gm)].map((m) => m[1] || m[2]);
    if (!out[t].length) throw new Error(`جدول التوزيع ${t} بلا مفاتيح`);
  }
  return out;
}

// الإجراءات التي غابت عن جدولها: [{ table, action, movedTo? }]. retired: [{ action, table, replacement_released, reason }]
export function contractGaps(prev, now, retired = [], today = new Date()) {
  const gaps = [];
  for (const t of TABLES) {
    for (const a of prev[t] || []) {
      if ((now[t] || []).includes(a)) continue;
      const r = retired.find((x) => x.action === a && x.table === t);
      const days = r ? (today - new Date(`${r.replacement_released}T00:00:00Z`)) / 864e5 : -1;
      if (r && r.reason && days >= MIN_DAYS) continue;
      const movedTo = TABLES.find((x) => x !== t && (now[x] || []).includes(a));
      gaps.push({ table: t, action: a, ...(movedTo && { movedTo }), ...(r && { early: days < MIN_DAYS }) });
    }
  }
  return gaps;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ref = process.argv.find((a) => a.startsWith('--against='))?.slice('--against='.length) || 'origin/release';
  if (process.argv.includes('--fetch')) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const sha = git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0];
    if (!/^[0-9a-f]{40}$/.test(sha)) { console.error('لا فرع release في origin'); process.exit(2); }
    let have = true;
    try { git('cat-file', '-e', `${sha}^{commit}`); } catch { have = false; }
    if (have) git('update-ref', 'refs/remotes/origin/release', sha);
    else git('fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/release:refs/remotes/origin/release');
  }
  let prevSrc;
  try { prevSrc = execFileSync('git', ['show', `${ref}:${INDEX}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { console.error(`تعذرت قراءة ${INDEX} من ${ref}: ${String(e.stderr || e.message).trim()}. اجلبه: git fetch --no-tags --depth=1 origin release:refs/remotes/origin/release`); process.exit(2); }
  const prev = dispatchTables(prevSrc);
  const now = dispatchTables(readFileSync(join(ROOT, INDEX), 'utf8'));
  const retired = JSON.parse(readFileSync(RETIRED_FILE, 'utf8')).retired || [];
  const gaps = contractGaps(prev, now, retired);
  const count = (x) => TABLES.reduce((s, t) => s + x[t].length, 0);
  for (const g of gaps) {
    console.error(`✗ ${g.table}: ${g.action} في الإصدار السابق وغائب الآن${g.movedTo ? ` (نُقل إلى ${g.movedTo}، فتتغير جلسته)` : ''}${g.early ? `، وبديله نُشر قبل أقل من ${MIN_DAYS} يومًا` : ''}`);
  }
  if (gaps.length) {
    console.error(`\n${gaps.length} إجراء يكسر تبويبًا مفتوحًا على الإصدار السابق. أبقه بجانب بديله ${MIN_DAYS} يومًا على الأقل، ثم احذفه بسطر في scripts/ops/action-contract-retired.json (action وtable وreplacement_released وreason).`);
    process.exit(1);
  }
  console.log(`عقد الإجراءات: ${count(prev)} إجراء في ${ref} كلها في جداولها الآن (${count(now)} اليوم)`);
}
