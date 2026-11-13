// حراس الحزمة 9 (D06 وD07 وD17): الإتقان المحكّي افتراضًا، وكاتون بوزن صفر، وإصلاح السقف، وتعذر الحساب معلن،
// وأرضية 50، وقفل الإعداد أثناء الدفعة إلا للمدير الأعلى بتعليل، والقاعة على المنشور، و«كيف يُقيَّم» من الخادم.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, FINAL_DEFAULTS, finalConfig } from '../../supabase/functions/leaders-api/logic.js';
import HowEvaluated from './screens/HowEvaluated.jsx';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('القيم المؤقتة للدفعة الأولى', () => {
  it('تطابق وثيقة الحدود المؤقتة', () => {
    const doc = read('docs/journey/2026-11-07-الحدود-المؤقتة-للدفعة-الأولى-v1.md');
    expect(DEFAULT_MODEL).toMatchObject({ min_intermediate: 55, min_advanced: 80, floor_intermediate: 50, floor_advanced: 60, borderline: 8 });
    expect(FINAL_DEFAULTS.thresholds).toEqual({ pass: 70, pass_notes: 60, extend: 45 });
    expect(FINAL_DEFAULTS.measure).toMatchObject({ mode: 'mastery', mastery_cut: 70 });
    expect(FINAL_DEFAULTS.weights.post).toBe(20);
    expect(FINAL_DEFAULTS.sources.katon).toBe(0);
    for (const s of ['**50** (كانت 40)', 'الإتقان المحكّي', '**0**', 'بانتظار توقيع المالك']) expect(doc).toContain(s);
  });
});

describe('الخادم', () => {
  it('فشل المقارنة لا يُبتلع، ويصل المكوّن موسومًا', () => {
    const f = read('supabase/functions/leaders-api/final.ts');
    expect(f).toMatch(/compareFor\(\[p\.id\]\)\.catch\(\(e\) => \{ console\.error\('final: compareFor', e\); return \{ rows: \{\} as Record<string, any>, failed: true \}; \}\)/);
    expect(f).toMatch(/failed: !!\(cmp as any\)\.failed,/);
  });
  it('إعداد الختامي ومعيار التسكين مقفلان أثناء دفعة جارية إلا للمدير الأعلى بتعليل', () => {
    const f = read('supabase/functions/leaders-api/final.ts');
    expect(f).toMatch(/const running = await runningCohort\(String\(b\.program_id\)\);\n\s+if \(running && \(\(a as any\)\.role !== 'super_admin' \|\| String\(b\.reason \|\| ''\)\.trim\(\)\.length < 10\)\)/);
    const admin = read('supabase/functions/leaders-api/admin.ts');
    expect(admin).toMatch(/if \(b\.entity === 'placement_model' && !isNew\) \{[\s\S]*runningCohort\(null\)[\s\S]*'cohort_running'/);
    expect(admin).toMatch(/'placement_model\.running-change'/);
    expect(read('supabase/functions/leaders-api/programs.ts')).toMatch(/export async function runningCohort\(programId: string \| null\)/);
  });
  it('القاعة: القائمة والفتح والتبديل على المنشور وحده', () => {
    const h = read('supabase/functions/leaders-api/hall.ts');
    expect(h).toMatch(/from\('katon_topics'\)\.select\('id, title_ar, status'\)\.eq\('status', 'published'\)/);
    expect((h.match(/await requirePublished\(String\(b\.topic_id\)\)/g) || []).length).toBe(2);
  });
  it('سياسة التقييم في حمولة المشارك من إعداد برنامجه', () => {
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/final_policy: audience !== 'admin' && !vis\.par_final_policy \? null : \{ weights: fc\.weights, thresholds: fc\.thresholds, measure: \{ mode: fc\.measure\.mode, mastery_cut: fc\.measure\.mastery_cut \}, version: fc\.version, provisional: true \}/);
  });
});

describe('«كيف يُقيَّم عملك»', () => {
  it('يعرض الأوزان والمحك والحدود بإعلانها مؤقتة، وما لا يدخل الدرجة، والتظلم، بلا مفاتيح', () => {
    const fc = finalConfig({});
    const html = renderToStaticMarkup(React.createElement(HowEvaluated, { policy: { weights: fc.weights, thresholds: fc.thresholds, measure: fc.measure, version: fc.version } }));
    for (const s of ['30%', '20%', 'محك 70%', 'هذه الحدود مؤقتة للدفعة الأولى', 'كاتون والقاعة', 'لجنة لم تشارك فيه', 'لا يدخل الدرجة']) expect(html).toContain(s);
    expect(renderToStaticMarkup(React.createElement(HowEvaluated, { policy: null }))).toBe('');
  });
});
