// ════════════════════════════════════════════════════════════════
// توليد صور أبواب كتاب القائد ضمن الحصة اليومية المجانية (Cloudflare)
// ════════════════════════════════════════════════════════════════
// يمر على plan.json، ويولّد الأبواب المعلّقة بمستوى final (klein 9B) حتى تنفد
// حصة اليوم (≈ 3 صور)، ويحفظ كل صورة webp في src/assets/book/chapters
// ويسجلها في manifest.json. حين تكتمل الأبواب كلها يضبط complete: true
// فيبدأ الكتاب باستعمالها؛ وقبل ذلك تبقى النسخة الحالية كما هي.
//
// التشغيل: node scripts/book-images/run.mjs [--max 3] [--dry]
// يتطلب: مهارة imageforge، واعتماد ~/.config/imageforge/cloudflare.{token,account}،
// و sharp (في ~/.quad/node_modules أو node_modules).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PLAN = join(ROOT, 'scripts/book-images/plan.json');
const BRAND = join(ROOT, 'scripts/book-images/brand.json');
const OUT = join(ROOT, 'src/assets/book/chapters');
const MANIFEST = join(OUT, 'manifest.json');
const args = process.argv.slice(2);
const max = Number(args[args.indexOf('--max') + 1]) || 3;
const dry = args.includes('--dry');

function findImageforge() {
  const base = join(homedir(), '.claude/skills/synced');
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    const p = join(base, d, 'imageforge/scripts/generate.js');
    if (existsSync(p)) return p;
  }
  return null;
}
const req = createRequire(join(homedir(), '.quad/node_modules/'));
const sharp = (() => { try { return req('sharp'); } catch { return createRequire(import.meta.url)('sharp'); } })();

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const pending = plan.chapters.filter((c) => c.status !== 'done');
console.log(`أبواب مكتملة ${plan.chapters.length - pending.length}/${plan.chapters.length}`);
if (!pending.length) {
  if (!manifest.complete) { manifest.complete = true; writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n'); console.log('اكتملت الصور: فُعّلت في الكتاب'); }
  process.exit(0);
}
const gen = findImageforge();
if (!gen) { console.error('مهارة imageforge غير متاحة في هذه الجلسة'); process.exit(2); }
if (dry) { pending.slice(0, max).forEach((c) => console.log('سيولّد:', c.title)); process.exit(0); }

mkdirSync(OUT, { recursive: true });
let made = 0;
for (const c of pending.slice(0, max)) {
  const png = join(tmpdir(), `book-${c.id}.png`);
  try {
    execFileSync('node', [gen, '--brand', BRAND, '--subject', c.subject, '--style', 'abstract', '--ratio', plan.ratio, '--out', png, `--${plan.tier}`],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_PATH: join(homedir(), '.quad/node_modules') }, cwd: join(gen, '..') });
  } catch (e) {
    console.error(`توقف عند «${c.title}»: ${String(e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' ')}`);
    break;
  }
  // المولّد يتراجع إلى «artwork» الهندسي حين تنفد الحصة؛ لا نقبل إلا صورة من Cloudflare
  const log = existsSync(png.replace(/\.png$/, '.gen.json')) ? JSON.parse(readFileSync(png.replace(/\.png$/, '.gen.json'), 'utf8')) : {};
  if (!existsSync(png) || log.provider !== 'cloudflare') {
    console.error(`«${c.title}»: الناتج من المولّد الهندسي لا من Cloudflare (الحصة نفدت غالبًا). يُعاد غدًا.`);
    break;
  }
  await sharp(png).resize(1400).webp({ quality: 70 }).toFile(join(OUT, c.file));
  c.status = 'done';
  c.generated_at = new Date().toISOString();
  manifest.images[c.id] = c.file;
  made += 1;
  console.log(`✓ ${c.title}`);
}
manifest.complete = plan.chapters.every((c) => c.status === 'done');
writeFileSync(PLAN, JSON.stringify(plan, null, 2) + '\n');
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`ولّد اليوم ${made}. المكتمل ${plan.chapters.filter((c) => c.status === 'done').length}/${plan.chapters.length}${manifest.complete ? ' · اكتملت وفُعّلت في الكتاب' : ''}`);
