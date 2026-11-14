// مرافق بناء المبادرة، المرحلة 4أ: دليل الحقل بمستوى المشارك
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';
import { guideFor, GUIDE_MODES } from './guide.js';

const root = process.cwd();
const sql = [resolve(root, 'server/leaders-011-book-and-models.sql'),
  ...readdirSync(resolve(root, 'supabase/migrations')).sort().map((f) => resolve(root, 'supabase/migrations', f))].map((p) => readFileSync(p, 'utf8')).join('\n');

// مفاتيح حقول كل نموذج كما تُزرع: إدراج النموذج، ثم الحقول المضافة بعده
const known = {};
for (const m of sql.matchAll(/\('\w+', '([a-z-]+)', \d+, \$q\$[\s\S]*?\$q\$(\[[\s\S]*?\])\$q\$::jsonb\)/g)) {
  try { known[m[1]] ||= new Set(JSON.parse(m[2]).map((f) => f.key)); } catch { /* ليس جدول حقول */ }
}
for (const m of sql.matchAll(/add_field\('([a-z-]+)', (?:\$j\$|')(\{[^\n]*?\})(?:\$j\$|')::jsonb/g)) {
  try { known[m[1]]?.add(JSON.parse(m[2]).key); } catch { /* حقل مسار يُبنى بالدالة */ }
}

const entries = Object.entries(FIELDS).filter(([k]) => !k.startsWith('_'));

describe('محتوى دليل الحقل', () => {
  it('كل نموذج وحقل في الدليل موجود فعلًا في النماذج المزروعة', () => {
    for (const [model, fields] of entries) {
      expect(known[model], model).toBeTruthy();
      for (const key of Object.keys(fields)) expect(known[model].has(key), `${model}.${key}`).toBe(true);
    }
  });
  it('لكل حقل المعنى والخطأ الشائع وسؤال الخبير، بجمل قصيرة بلا حروف لاتينية', () => {
    for (const [model, fields] of entries) {
      for (const [key, g] of Object.entries(fields)) {
        for (const part of ['meaning', 'mistake', 'challenge']) {
          const t = g[part];
          expect(typeof t === 'string' && t.length >= 15 && t.length <= 200, `${model}.${key}.${part}`).toBe(true);
          expect(/[A-Za-z]/.test(t), `${model}.${key}.${part}`).toBe(false);
        }
        expect(g.challenge.trim().endsWith('؟'), `${model}.${key}: سؤال الخبير سؤال`).toBe(true);
      }
    }
  });
  it('فصول الوثيقة الأساسية للتأسيسي كلها مغطاة', () => {
    for (const k of ['initiative-charter', 'options-analysis', 'theory-of-change', 'benefits-register', 'stakeholder-map', 'milestone-register', 'cost-plan', 'procurement', 'governance', 'raid', 'change-sustain', 'development-plan', 'transformation-story']) {
      expect(Object.keys(FIELDS[k] || {}).length, k).toBeGreaterThan(0);
    }
  });
  it('لا يعود معيار «لا على مثال افتراضي»: المبادرة قد تكون افتراضية واقعية (قرار المالك)', () => {
    const models = readFileSync(resolve(root, 'leaders-app/src/screens/Models.jsx'), 'utf8');
    expect(models).not.toContain('لا على مثال افتراضي');
    expect(models).toContain('حقيقية كانت أو افتراضية واقعية');
  });
});

describe('العون يتلاشى بالمستوى', () => {
  it('التأسيسي مفتوح، والمتوسط مطوي، والمتقدم سؤال الخبير، وبلا مستوى مطوي', () => {
    expect(GUIDE_MODES).toEqual({ beginner: 'open', intermediate: 'collapsed', advanced: 'expert' });
    expect(guideFor('cost-plan', 'items', 'beginner').mode).toBe('open');
    expect(guideFor('cost-plan', 'items', 'intermediate').mode).toBe('collapsed');
    expect(guideFor('cost-plan', 'items', 'advanced').mode).toBe('expert');
    expect(guideFor('cost-plan', 'items', null).mode).toBe('collapsed');
  });
  it('الحقل بلا دليل أو النموذج خارج الوثيقة: لا شيء', () => {
    expect(guideFor('initiative-charter', 'title', 'beginner')).toBeNull();
    expect(guideFor('conflict-mode', 'x', 'beginner')).toBeNull();
    expect(guideFor('_about', 'x', 'beginner')).toBeNull();
  });
  it('الخادم يرسل مستوى المشارك في بُعد النموذج من مصدر حقوله نفسه', () => {
    const p = readFileSync(resolve(root, 'supabase/functions/leaders-api/participant.ts'), 'utf8');
    expect(p).toContain('return { ...m, level: levels[m.dimension] || null, fields: fieldsFor(m.fields, levels[m.dimension]');
  });
});
