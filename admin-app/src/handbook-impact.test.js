// تقرير الأثر بين إصدارين من الكتاب (المرحلة 3، الخطوة 2 من «الكتاب الأم»)
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { impactPath, renderImpact, versionImpact } from '../../scripts/handbook/impact.mjs';

describe('تقرير الأثر', () => {
  it('v3.1 من v3: الباب الرابع للمعالم وحده، يتغير لكل المستويات، ومعه ما يعتمد عليه، ولا شيء ينكسر', async () => {
    const r = await versionImpact('v3', 'v3.1');
    expect(r.errors).toEqual([]);
    expect(r.chapters.map((x) => `${x.c.dimension}/${x.c.chapter_key}`)).toEqual(['milestone/ch4']);
    const [x] = r.chapters;
    expect(x.changed).toEqual({ body: true, quiz: false, reflection: false, level: false });
    expect(x.readers).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(x.questions).toBeGreaterThan(0);
    expect(x.refs.length).toBeGreaterThan(0);
    const md = renderImpact(r);
    expect(md).toContain('لا شيء ينكسر');
    expect(md).toContain('من يتغير عليه ما يقرأ:** تأسيسي، متوسط، احترافي');
  });
  it('إلغاء قسم تحيل إليه وثيقة المبادرة خطأ كاسر يسمي الإحالة والقسم', async () => {
    const reg = JSON.parse(readFileSync('supabase/content/handbook/sections.json', 'utf8'));
    const ref = { id: reg.sections.find((s) => s.dim === 'milestone' && s.chapter === 'ch4' && s.level === 2).id, from: 'anatomy.json · x' };
    const broken = { ...reg, sections: reg.sections.map((s) => (s.id === ref.id ? { ...s, retired: true } : s)) };
    const r = await versionImpact('v3', 'v3.1', { registry: broken, refs: [ref] });
    expect(r.errors.join()).toMatch(/anatomy\.json · x يحيل إلى/);
    expect(renderImpact(r)).toContain('## ما ينكسر (يرفض البناء)');
  });
  it('لكل إصدار بُني بالمولّد تقرير أثر بجانبه', () => {
    expect(existsSync(impactPath('v3.1'))).toBe(true);
    expect(readFileSync(impactPath('v3.1'), 'utf8')).toMatch(/^# تقرير الأثر: كتاب القائد v3\.1 من v3/);
  });
});
