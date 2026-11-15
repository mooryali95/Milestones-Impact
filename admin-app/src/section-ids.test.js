// سجل هويات أقسام الكتاب (المرحلة 2 من «الكتاب الأم»): الهوية ثابتة، والإحالة تتبع القسم إن تغيّر عنوانه
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { anatomyRefs, check, currentHeadings, LOCK, moduleJs, OUT, readLock, REG, sync } from '../../scripts/handbook/sections.mjs';
import { headingsOf } from '../../supabase/functions/leaders-api/master-book.js';
import { handbookRef, sectionById, sectionIdOf } from '../../supabase/functions/leaders-api/section-refs.js';

const reg = JSON.parse(readFileSync(REG, 'utf8'));

describe('سجل هويات الأقسام في المستودع', () => {
  it('كل قسم في الإصدار الحالي له هوية واحدة، وكل هوية فاعلة لها قسم، وكل إحالة من وثيقة المبادرة قائمة', () => {
    expect(check(reg, currentHeadings(), readLock(), anatomyRefs())).toEqual([]);
  });
  it('الوحدة المولّدة للخادم والتطبيقات تطابق السجل', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(moduleJs(reg));
    expect(readFileSync(LOCK, 'utf8').trim().split('\n').length).toBe(reg.sections.length);
  });
  it('وثيقة المبادرة تحيل بالهوية وحدها، ويُقرأ منها الباب والعنوان الحاليان', () => {
    const A = JSON.parse(readFileSync(join(process.cwd(), 'supabase/content/initiative-guide/v1/anatomy.json'), 'utf8'));
    const h = A.meaning.handbook;
    expect(Object.keys(h)).toEqual(['section_id']);
    const r = handbookRef(h);
    expect(r).toMatchObject({ section_id: h.section_id, dimension: sectionById(h.section_id).dim, look_for: sectionById(h.section_id).key });
    expect(sectionIdOf(r.dimension, r.chapter_key, r.look_for)).toBe(h.section_id);
  });
});

describe('قواعد السجل', () => {
  const heads = [{ dim: 'milestone', chapter: 'ch4', level: 2, key: 'أ' }, { dim: 'milestone', chapter: 'ch4', level: 2, key: 'ب' }];
  const base = sync({ sections: [] }, heads, []);
  it('المزامنة تعطي كل قسم هوية ببابه وترتيبه، وتحفظها في القفل', () => {
    expect(base.reg.sections.map((s) => s.id)).toEqual(['M-CH4-01', 'M-CH4-02']);
    expect(base.lock).toEqual(['M-CH4-01', 'M-CH4-02']);
    expect(check(base.reg, heads, base.lock)).toEqual([]);
  });
  it('تغيير العنوان: يُرفض حتى يُعدَّل key، ثم تبقى الهوية نفسها ويُقبل العنوان القديم بديلًا', () => {
    const renamed = [heads[0], { ...heads[1], key: 'ب الجديد' }];
    expect(check(base.reg, renamed, base.lock).join('\n')).toMatch(/بلا هوية[\s\S]*M-CH4-02 «ب»: لا قسم/);
    const fixed = { sections: base.reg.sections.map((s) => (s.id === 'M-CH4-02' ? { ...s, key: 'ب الجديد', aliases: ['ب'] } : s)) };
    expect(check(fixed, renamed, base.lock)).toEqual([]);
  });
  it('الحذف إلغاء لا حذف، ورقم الملغى لا يُعاد، وإلغاء قسم تحيل إليه وثيقة يُرفض', () => {
    const retired = { sections: base.reg.sections.map((s) => (s.id === 'M-CH4-02' ? { ...s, retired: true } : s)) };
    expect(check(retired, [heads[0]], base.lock)).toEqual([]);
    expect(check({ sections: [base.reg.sections[0]] }, [heads[0]], base.lock).join()).toMatch(/صدرت ثم حُذفت/);
    expect(check(retired, [heads[0]], base.lock, [{ id: 'M-CH4-02', from: 'anatomy.json · x' }]).join()).toMatch(/أُلغي القسم/);
    const again = sync(retired, [heads[0], { ...heads[0], key: 'ج' }], base.lock);
    expect(again.added.map((s) => s.id)).toEqual(['M-CH4-03']);
  });
  it('مفتاح العنوان: المكرر لكل مستوى بمستواه، والمكرر بعدها برقم ظهوره، و### من العناوين', () => {
    const md = '## تركيز\n:::only=beginner\n## تركيز\n:::\n:::only=advanced\n## تركيز\n:::\n### فرعي\n### فرعي';
    expect(headingsOf(md).map((h) => `${h.level}:${h.key}`)).toEqual(['2:تركيز', '2:تركيز · للتأسيسي فقط', '2:تركيز · للاحترافي فقط', '3:فرعي (1)', '3:فرعي (2)']);
  });
});

describe('تعليقات الكتاب الأم بهوية القسم', () => {
  const ts = readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/master-book.ts'), 'utf8');
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261115200000_leaders_book_comment_section_ids.sql'), 'utf8');
  it('يُحفظ التعليق بهوية قسمه، ويُقرأ تحت عنوانه الحالي، والترحيل لا يحجب النشر', () => {
    expect(ts).toContain('sectionIdOf(mod.dimension, mod.chapter_key, val.section)');
    expect(ts).toContain('section: sec && !sec.retired ? sec.key : r.section');
    expect(sql).toMatch(/^-- deploy-gate: tolerant/m);
  });
});
