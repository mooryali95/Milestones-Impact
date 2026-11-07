// قراءة أبواب الكتاب من supabase/content/handbook/<الإصدار> (الحالي v3)
// الملف: ترويسة (chapter_key, dimension) ثم المتن، ثم ---QUIZ--- ثم ---REFLECTION---
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
// الإصدار الحالي أحدث مجلد (v2 ثم v3 ثم v3.1...)، فيقرؤه المتحقق وكشف الانحراف دون ثابت يُنسى.
// كل إصدار مجمّد بعد ترحيله: التعديل إصدار جديد بـ scripts/handbook/build-version.mjs (D01 وD02).
export const versions = () => readdirSync(join(ROOT, 'supabase/content/handbook'), { withFileTypes: true }).filter((d) => d.isDirectory() && /^v\d+(\.\d+)*$/.test(d.name))
  .map((d) => d.name).sort((a, b) => a.slice(1).split('.').map(Number).reduce((r, n, i) => r || n - (b.slice(1).split('.').map(Number)[i] ?? -1), 0) || a.length - b.length);
export const VERSION = versions().at(-1);
export const dirOf = (ver = VERSION) => join(ROOT, 'supabase/content/handbook', ver);
export const DIR = dirOf();

export function parseChapter(text, file = '') {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: ترويسة مفقودة`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*/, 2)).filter((x) => x[0]));
  const [body, rest] = m[2].split(/^---QUIZ---$/m);
  if (rest === undefined) throw new Error(`${file}: فاصل ---QUIZ--- مفقود`);
  const [quiz, reflection] = rest.split(/^---REFLECTION---$/m);
  if (reflection === undefined) throw new Error(`${file}: فاصل ---REFLECTION--- مفقود`);
  if (!meta.chapter_key || !meta.dimension) throw new Error(`${file}: chapter_key و dimension مطلوبان`);
  if (meta.min_level && !['beginner', 'intermediate', 'advanced'].includes(meta.min_level)) throw new Error(`${file}: min_level غير صالح`);
  return { file, chapter_key: meta.chapter_key, dimension: meta.dimension, min_level: meta.min_level || null, body_md: body.trim(), quiz_md: quiz.trim(), reflection_ar: reflection.trim() };
}

export const loadChapters = (ver = VERSION) => { const dir = dirOf(ver); return readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  .map((f) => parseChapter(readFileSync(join(dir, f), 'utf8'), f)); };
