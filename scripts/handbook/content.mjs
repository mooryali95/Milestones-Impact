// قراءة أبواب الكتاب v2 من supabase/content/handbook/v2
// الملف: ترويسة (chapter_key, dimension) ثم المتن، ثم ---QUIZ--- ثم ---REFLECTION---
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const DIR = join(ROOT, 'supabase/content/handbook/v2');

export function parseChapter(text, file = '') {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: ترويسة مفقودة`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*/, 2)).filter((x) => x[0]));
  const [body, rest] = m[2].split(/^---QUIZ---$/m);
  if (rest === undefined) throw new Error(`${file}: فاصل ---QUIZ--- مفقود`);
  const [quiz, reflection] = rest.split(/^---REFLECTION---$/m);
  if (reflection === undefined) throw new Error(`${file}: فاصل ---REFLECTION--- مفقود`);
  if (!meta.chapter_key || !meta.dimension) throw new Error(`${file}: chapter_key و dimension مطلوبان`);
  return { file, chapter_key: meta.chapter_key, dimension: meta.dimension, body_md: body.trim(), quiz_md: quiz.trim(), reflection_ar: reflection.trim() };
}

export const loadChapters = () => readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()
  .map((f) => parseChapter(readFileSync(join(DIR, f), 'utf8'), f));
