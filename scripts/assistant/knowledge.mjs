#!/usr/bin/env node
// معرفة المساعد الآلي من مصدرها الواحد (supabase/content/assistant/v1) إلى وحدة تقرؤها الدالة agent-chat
// (الدوال تُنشر بما تستورده وحده، فلا تقرأ ملفات المحتوى وقت التشغيل).
//   node scripts/assistant/knowledge.mjs           يكتب supabase/functions/agent-chat/knowledge.js
//   node scripts/assistant/knowledge.mjs --check   يفشل إن لم يطابق المولَّد مصدره
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const KNOWLEDGE_VERSION = 'v1';
const SRC = join(ROOT, `supabase/content/assistant/${KNOWLEDGE_VERSION}`);
export const OUT = join(ROOT, 'supabase/functions/agent-chat/knowledge.js');

export function render() {
  const md = readFileSync(join(SRC, 'knowledge.md'), 'utf8').replace(/\r\n/g, '\n');
  // سطور «حالة الملف» للمراجعة لا للنموذج
  const knowledge = md.split('\n').filter((l) => !l.startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const faq = JSON.parse(readFileSync(join(SRC, 'faq.json'), 'utf8')).entries;
  // حقائق الموضوعات التي يحقنها الموجّه ويضمنها الحارس، وردوده الثابتة بلا نموذج (facts.json)
  const facts = Object.fromEntries(JSON.parse(readFileSync(join(SRC, 'facts.json'), 'utf8')).facts.map((f) => [f.id, { ar: f.ar, en: f.en }]));
  const sha = createHash('sha256').update(knowledge + JSON.stringify(faq) + JSON.stringify(facts)).digest('hex').slice(0, 16);
  return `// مولَّد بـ scripts/assistant/knowledge.mjs من supabase/content/assistant/${KNOWLEDGE_VERSION}، لا يُحرَّر يدويًا.
export const KNOWLEDGE_VERSION = ${JSON.stringify(`${KNOWLEDGE_VERSION}-${sha}`)};
export const KNOWLEDGE = ${JSON.stringify(knowledge)};
export const FAQ = ${JSON.stringify(faq, null, 2)};
export const TOPIC_FACTS = ${JSON.stringify(facts, null, 2)};
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const body = render();
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch { /* غير موجود */ }
    if (cur !== body) { console.error('knowledge.js لا يطابق مصدره: شغّل node scripts/assistant/knowledge.mjs'); process.exit(1); }
    console.log('knowledge.js مطابق');
  } else {
    writeFileSync(OUT, body);
    console.log(`كُتبت المعرفة (${body.length} حرفًا)`);
  }
}
