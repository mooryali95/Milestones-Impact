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
