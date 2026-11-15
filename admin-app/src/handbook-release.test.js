import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyProposals, nextVersion, releaseSql, renderProposals, rewriteBody, rewriteReflection } from '../../scripts/handbook/release.mjs';
import { dirOf, loadChapters, REPORTS } from '../../scripts/handbook/content.mjs';
import { REFLECTION, sectionSource } from '../../supabase/functions/leaders-api/book-proposals.js';

const BODY = `## أولًا
نص عام

:::min=intermediate
## ثانيًا
للمتوسط فأعلى
### تفصيل
نص التفصيل
:::

## ثالثًا
خاتمة`;
const CH = [{ file: 'milestone_1_ch1.md', dimension: 'milestone', chapter_key: 'ch1', body_md: BODY, quiz_md: 'q', reflection_ar: 'r' }];
const REG = { version: 'v1', sections: [
  { id: 'M-CH1-01', dim: 'milestone', chapter: 'ch1', level: 2, key: 'أولًا', aliases: [] },
  { id: 'M-CH1-02', dim: 'milestone', chapter: 'ch1', level: 2, key: 'ثانيًا', aliases: [] },
  { id: 'M-CH1-03', dim: 'milestone', chapter: 'ch1', level: 3, key: 'تفصيل', aliases: [] },
  { id: 'M-CH1-04', dim: 'milestone', chapter: 'ch1', level: 2, key: 'ثالثًا', aliases: [] },
] };
const id = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const P = (n, section, proposed, o = {}) => ({ id: id(n), dimension: 'milestone', chapter_key: 'ch1', section, section_id: REG.sections.find((s) => s.key === section)?.id, base_md: sectionSource(BODY, section), proposed_md: proposed, reason: 'سبب', author_name: 'عمر', decided_by: 's@x', decided_at: `2026-11-15T20:0${n}:00Z`, ...o });

describe('إصدار الكتاب من المقترحات المعتمدة', () => {
  it('يستبدل القسم وحده، ويبقي الأسطر الفارغة ووسوم المستوى كما هي', () => {
    const r = applyProposals(CH, [P(1, 'أولًا', '## أولًا\nنص أوضح')], REG);
    expect(r.applied).toHaveLength(1);
    expect(r.chapters[0].body_md).toBe(BODY.replace('نص عام', 'نص أوضح'));
  });
  it('تغيير العنوان يبقي هوية القسم بالعنوان الجديد، والقديم في aliases', () => {
    const r = applyProposals(CH, [P(1, 'ثالثًا', '## ثالثًا وأخيرًا\nخاتمة')], REG);
    const s = r.registry.sections.find((x) => x.id === 'M-CH1-04');
    expect(s).toMatchObject({ key: 'ثالثًا وأخيرًا', aliases: ['ثالثًا'] });
    expect(r.applied[0].new_section).toBe('ثالثًا وأخيرًا');
    expect(REG.sections[3].key).toBe('ثالثًا');
  });
  it('قسم جديد قبل القسم يبقي هويته عليه، ولا يأخذها الجديد', () => {
    const r = applyProposals(CH, [P(1, 'أولًا', '## تمهيد جديد\nنص\n\n## أولًا\nنص عام')], REG);
    expect(r.registry.sections.find((x) => x.id === 'M-CH1-01')).toMatchObject({ key: 'أولًا', aliases: [] });
    expect(r.applied[0].new_section).toBe('أولًا');
    expect(r.chapters[0].body_md.startsWith('## تمهيد جديد\nنص\n\n## أولًا\nنص عام')).toBe(true);
  });
  it('العنوان الفرعي المزال يُلغى ولا يُحذف من السجل', () => {
    const r = applyProposals(CH, [P(1, 'ثانيًا', ':::min=intermediate\n## ثانيًا\nللمتوسط فأعلى بلا تفصيل\n:::')], REG);
    expect(r.registry.sections.find((x) => x.id === 'M-CH1-03').retired).toBe(true);
    expect(r.chapters[0].body_md).toContain(':::min=intermediate\n## ثانيًا\nللمتوسط فأعلى بلا تفصيل\n:::');
  });
  it('يُتخطى: أصل تغيّر، ومقترح ثانٍ على القسم نفسه، وباب غير موجود، ومعرّف غير صالح', () => {
    const r = applyProposals(CH, [
      P(1, 'أولًا', '## أولًا\nأ'), P(2, 'أولًا', '## أولًا\nب'),
      P(3, 'ثالثًا', '## ثالثًا\nج', { base_md: '## ثالثًا\nنص قديم' }),
      P(4, 'أولًا', 'x', { chapter_key: 'ch9' }), P(5, 'أولًا', 'x', { id: 'bad' }),
    ], REG);
    expect(r.applied.map((p) => p.id)).toEqual([id(1)]);
    expect(r.skipped.map((p) => p.why)).toEqual([
      expect.stringMatching(/مقترح آخر/), expect.stringMatching(/يختلف/), expect.stringMatching(/الباب غير موجود/), expect.stringMatching(/معرّف/),
    ]);
  });
  it('سؤال التأمل: يُستبدل بحارس أصله، ويُكتب في ملفه بعد ---REFLECTION--- وحده', () => {
    const ch = [{ ...CH[0], reflection_ar: 'ما معلمك؟' }];
    const r = applyProposals(ch, [P(1, REFLECTION, 'ما المعلم الذي تقرر عنده؟', { section_id: null, base_md: 'ما معلمك؟' }), P(2, REFLECTION, 'آخر', { section_id: null, base_md: 'ما معلمك؟' })], REG);
    expect(r.chapters[0].reflection_ar).toBe('ما المعلم الذي تقرر عنده؟');
    expect(r.applied).toHaveLength(1);
    expect(r.skipped[0].why).toMatch(/سؤال التأمل/);
    expect(r.chapters[0].body_md).toBe(BODY);
    const file = `---\nchapter_key: ch1\ndimension: milestone\n---\n${BODY}\n\n---QUIZ---\nس: ما معلمك؟\n---REFLECTION---\nما معلمك؟\n`;
    const out = rewriteReflection(file, 'ما معلمك؟', 'ما المعلم الذي تقرر عنده؟');
    expect(out).toBe(file.replace(/ما معلمك؟\n$/, 'ما المعلم الذي تقرر عنده؟\n'));
    expect(rewriteReflection(file.replace(/ما معلمك؟\n$/, ''), '', 'جديد')).toMatch(/---REFLECTION---\nجديد\n$/);
  });
  it('الأقدم اعتمادًا يدخل أولًا', () => {
    const r = applyProposals(CH, [P(2, 'أولًا', '## أولًا\nالثاني'), P(1, 'أولًا', '## أولًا\nالأول')], REG);
    expect(r.applied[0].id).toBe(id(1));
  });
  it('إعادة كتابة الملف تمس المتن وحده', () => {
    const file = `---\nchapter_key: ch1\ndimension: milestone\n---\n${BODY}\n\n---QUIZ---\n${BODY}\n---REFLECTION---\nr\n`;
    const out = rewriteBody(file, BODY, BODY.replace('خاتمة', 'خاتمة جديدة'));
    expect(out.split('---QUIZ---')[1]).toBe(file.split('---QUIZ---')[1]);
    expect(out).toContain('خاتمة جديدة\n\n---QUIZ---');
  });
  it('الإصدار التالي، وترحيل التعليم بحارس المعتمد، وسجل المقترحات', () => {
    expect(nextVersion('v3.1')).toBe('v3.2');
    expect(nextVersion('v4')).toBe('v4.1');
    const sql = releaseSql('20990101000000_x', 'v3.2', [id(1)]);
    expect(sql).toMatch(/^-- deploy-gate: tolerant/m);
    expect(sql).toContain(`where status = 'approved' and id in ('${id(1)}')`);
    const r = applyProposals(CH, [P(1, 'أولًا', '## أولًا\nأ'), P(2, 'أولًا', '## أولًا\nب')], REG);
    const doc = renderProposals({ from: 'v3.1', to: 'v3.2', ...r });
    expect(doc).toMatch(/\*\*دخل الإصدار:\*\* 1 · \*\*تُخطّي:\*\* 1/);
  });
  it('تقارير الإصدار ليست أبوابًا، وكل باب في الإصدار الحالي يُعاد كتابة متنه فيبقى ملفه حرفًا بحرف', () => {
    expect(REPORTS).toEqual(['IMPACT.md', 'PROPOSALS.md']);
    for (const c of loadChapters()) {
      const text = readFileSync(join(dirOf(), c.file), 'utf8');
      expect(rewriteBody(text, c.body_md, c.body_md), c.file).toBe(text);
    }
  });
  it('السير يقرأ الإنتاج للقراءة فقط، ويشغّل CI على طلبه، وci-ok يعمل على التشغيل اليدوي', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/handbook-release.yml'), 'utf8');
    const ci = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const rel = readFileSync(join(process.cwd(), 'scripts/handbook/release.mjs'), 'utf8');
    expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(wf).toContain('gh workflow run ci.yml --ref "$branch"');
    expect(rel).toContain('set transaction read only;');
    expect(ci).toMatch(/github\.event_name == 'workflow_dispatch'\) && needs\.changes\.result != 'skipped'/);
  });
});
