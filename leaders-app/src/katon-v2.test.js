// موضوعات «كاتون» لإطاري الأثر والقيادة (v2): تجتاز قواعد البنك، وترحيلها مولَّد من مصدرها، وتدخل مسودة
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { absoluteCue, cleanSentence, topicIssues } from '../../supabase/functions/leaders-api/logic.js';
import topics from '../../supabase/content/katon/v2/topics.json';
import v1 from '../../supabase/content/katon/v1/topics.json';

const root = join(__dirname, '../..');
const MIGRATION = 'supabase/migrations/20261110170000_leaders_katon_impact_leadership.sql';

describe('موضوعات كاتون للأثر والقيادة', () => {
  it('ثلاثة موضوعات لكل إطار، بمفاتيح لا تتكرر ولا تصادم بنك البداية', () => {
    const by = (d) => topics.filter((t) => t.dimension === d).length;
    expect([by('impact'), by('leadership'), by('milestone')]).toEqual([3, 3, 0]);
    const keys = [...topics, ...v1].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('كل موضوع: الأسئلة الست بترتيبها، وجملتان خاطئتان بشرحهما وبلا قرينة إطلاق، ولا عيب يمنع نشره', () => {
    for (const t of topics) {
      expect(t.sentences.map((s) => s.question), t.key).toEqual(['why', 'what', 'how', 'absent', 'who', 'when']);
      const falses = t.sentences.filter((s) => s.key === 'false');
      expect(falses, t.key).toHaveLength(2);
      for (const s of falses) { expect(s.explain_ar, `${t.key}/${s.question}`).toBeTruthy(); expect(absoluteCue(s.text_ar), `${t.key}/${s.question}`).toBeNull(); }
      for (const s of t.sentences) expect(() => cleanSentence(s), `${t.key}/${s.question}`).not.toThrow();
      expect(topicIssues(t.sentences), t.key).toEqual([]);
    }
  });
  it('مواضع الجملتين الخاطئتين تختلف بين الموضوعات فلا يُحفظ نمطها', () => {
    const patterns = topics.map((t) => t.sentences.map((s) => (s.key === 'false' ? 'F' : 'T')).join(''));
    expect(new Set(patterns).size).toBeGreaterThanOrEqual(4);
  });
  it('لا «مانح» في موضوعات الأثر (تسييق القطاع العام)', () => {
    expect(JSON.stringify(topics.filter((t) => t.dimension === 'impact'))).not.toMatch(/مانح/);
  });
  it('الترحيل المودع مولَّد من المصدر، ويُدخل الموضوعات مسودة لا منشورة', () => {
    const built = execFileSync('node', [join(root, 'scripts/katon/build-v2-migration.mjs')], { encoding: 'utf8' });
    const committed = readFileSync(join(root, MIGRATION), 'utf8');
    expect(committed).toBe(built);
    expect(committed.match(/'draft'/g)).toHaveLength(topics.length);
    expect(committed).not.toMatch(/'published'/);
    expect(committed).toMatch(/deploy-gate: tolerant/);
  });
});
