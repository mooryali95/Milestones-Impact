// مجموعة التقييم مستوردة بصيغة JSON فتُحزم مع الدالة (لا قراءة ملفات على الخادم): مصدر واحد لـ run.ts والتقييم
// من اللوحة (leaders-api) والبصمة (version.ts).
import data from './cases.json' with { type: 'json' };
import type { Case } from './grade.ts';

export const CASES: Case[] = (data as { cases: Case[] }).cases;
// للبصمة: النص المرتب نفسه لكل نسخة من الملف
export const CASES_SOURCE = JSON.stringify(data);
