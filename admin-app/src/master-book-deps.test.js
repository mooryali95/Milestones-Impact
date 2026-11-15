// ما يعتمد على باب أو قسم من الكتاب (المرحلة 3 من «الكتاب الأم»)
import { describe, expect, it } from 'vitest';
import { chapterDeps, initiativeRefs, trackPromises } from '../../shared/master-book/deps.js';
import { SECTION_IDS } from '../../supabase/functions/leaders-api/handbook-section-ids.js';

describe('ما يعتمد على الباب', () => {
  it('المسارات التي تعد بالباب من ملفات التعريف: إطار الأولوية نفسه والوعد بالباب', () => {
    const t = trackPromises('leadership', 'ch2');
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.key.startsWith('leadership-'))).toBe(true);
    expect(trackPromises('milestone', 'no-such-chapter')).toEqual([]);
  });
  it('إحالات وثيقة المبادرة بهوية القسم: للباب كله ولقسم بعينه', () => {
    const anatomy = { meaning: { handbook: { section_id: SECTION_IDS[0].id } }, chapters: { x: { handbook: { section_id: SECTION_IDS[1].id } } } };
    const [a, b] = SECTION_IDS;
    expect(initiativeRefs(a.dim, a.chapter, null, anatomy).map((r) => r.section_id)).toContain(a.id);
    expect(initiativeRefs(a.dim, a.chapter, a.key, anatomy)).toEqual([{ chapter: 'معنى المبادرة', section: a.key, section_id: a.id }]);
    expect(initiativeRefs(b.dim, b.chapter, 'قسم آخر', anatomy)).toEqual([]);
  });
  it('الأسئلة والمختبر والاختبار المقفل والتعليقات تُجمع للباب، والقسم لا يعدّ إلا ما يخصه', () => {
    const chapter = { id: 'm1', dimension: 'milestone', chapter_key: 'ch4' };
    const deps = {
      questions: [{ code: 'M-K1', dimension: 'milestone', chapter_key: 'ch4', competency: 'الاعتماديات', instrument: 'القبلي' }, { code: 'M-K2', dimension: 'milestone', chapter_key: 'ch4', competency: 'الاعتماديات', instrument: 'البعدي' }, { code: 'I-K1', dimension: 'impact', chapter_key: 'ch4', instrument: 'القبلي' }],
      labs: [{ key: 'gantt', dimension: 'milestone', chapter_key: 'ch4', title: 'جدول المعالم' }],
      completions: { m1: 12 },
    };
    const counts = { byModule: { m1: 2 }, bySection: { 'm1|أساسيات': 1 } };
    const d = chapterDeps({ chapter, deps, counts });
    expect(d.questions).toEqual({ total: 2, byInstrument: { القبلي: 1, البعدي: 1 }, competencies: ['الاعتماديات'] });
    expect(d.labs.map((l) => l.key)).toEqual(['gantt']);
    expect(d.quiz).toEqual({ completed: 12, locked: true });
    expect(d.comments).toBe(2);
    expect(d.total).toBe(2 + 1 + d.tracks.length + d.refs.length + 2);
    const s = chapterDeps({ chapter, section: 'أساسيات', deps, counts });
    expect(s.tracks).toEqual([]);
    expect(s.total).toBe(s.refs.length + 1);
  });
  it('بلا قراءة القاعدة: يُعرض ما في المستودع وحده، ويُعلَّم ذلك', () => {
    const d = chapterDeps({ chapter: { id: 'x', dimension: 'leadership', chapter_key: 'ch2' } });
    expect(d.live).toBe(false);
    expect(d.questions.total).toBe(0);
    expect(d.tracks.length).toBeGreaterThan(0);
  });
});
