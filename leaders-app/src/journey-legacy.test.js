// الدفعات القائمة بلا مسار مستمر لا يتغير فيها حرف (T1، تصور 2026-11-18 ب5.1، الحراسة): خطة الدفعة ونوافذها ومدتها،
// وحالة كل مرحلة وفتحها، والتقدم والموضع، ومواعيد المعالم وحالاتها، والخط الزمني وبطاقات تبويب «الرحلة» والمسودة،
// وأثر التعديل وسطوره وإشعاره. اللقطة كُتبت من main قبل T1 (journey-legacy.cases.js).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legacyOutputs } from './journey-legacy.cases.js';

const snap = JSON.parse(readFileSync(join(__dirname, 'journey-legacy.snapshot.json'), 'utf8'));
const now = JSON.parse(JSON.stringify(legacyOutputs()));

describe('برنامج بمراحل متتابعة وحدها: المخرجات كما كانت قبل المسار المستمر', () => {
  for (const pn of Object.keys(snap)) {
    for (const part of Object.keys(snap[pn]).filter((k) => k !== 'cohorts')) {
      it(`${pn}: ${part}`, () => expect(now[pn][part]).toEqual(snap[pn][part]));
    }
    for (const cn of Object.keys(snap[pn].cohorts)) {
      for (const part of Object.keys(snap[pn].cohorts[cn])) {
        it(`${pn} / ${cn}: ${part}`, () => expect(now[pn].cohorts[cn][part]).toEqual(snap[pn].cohorts[cn][part]));
      }
    }
  }
  it('اللقطة حرفًا بحرف', () => expect(JSON.stringify(now)).toBe(JSON.stringify(snap)));
});

// والخدمة (T2، ب5.2): برنامج بلا خدمة لا يحمل شيئًا منها في أي مخرج، فلا حقل services ولا lane ولا usage، واللقطة نفسها
// تحرس الحرف. والاستشارة «عند الحاجة» كما هي اليوم تبقى مرحلة بنافذتها حتى تُحوَّل من اللوحة
describe('برنامج بلا خدمة: لا أثر لها في أي مخرج (T2)', () => {
  const text = JSON.stringify(now);
  it('لا services ولا service ولا usage ولا max_sessions', () => {
    for (const k of ['"services"', '"service"', '"lane":"service"', '"usage_ar"', '"max_sessions"', '"at_max"']) expect(text.includes(k)).toBe(false);
  });
  it('الاستشارة عند الحاجة ما زالت مرحلة بنافذة في كل دفعة مؤرخة', () => {
    for (const pn of Object.keys(now)) {
      expect(now[pn].cohorts.dated.plan.windows.consulting).toBeTruthy();
      expect(now[pn].cohorts.dated.timeline.stages.map((x) => x.key)).toContain('consulting');
    }
  });
});
