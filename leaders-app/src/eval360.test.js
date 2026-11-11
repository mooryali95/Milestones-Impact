// تصور تقييم 360 (اعتمده المالك 2026-11-11): docs/content/2026-11-11-تصور-تقييم-360-v1.md
// كل مرحلة تُختبر وحدها: 0 «جديد»، و0ب من يرى تقييم الخبير، و1 نموذج المقيّم، و2 الدورة والمجموعات، و3 التقرير والاستلام.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('المرحلة 0: لا «خبير جديد» مكان التقييم الغائب', () => {
  it('بطاقة الترشيح لا تصف الخبير بأنه جديد', () => {
    expect(read('leaders-app/src/screens/ChooseExpert.jsx')).not.toMatch(/جديد في البرنامج|خبير جديد/);
  });
  it('حد إظهار التقييم للخبير من MIN_RATINGS وحده، لا رقم ثابت', () => {
    const src = read('supabase/functions/leaders-api/experts.ts');
    expect(src).not.toMatch(/min:\s*5\b/);
    expect(src).toMatch(/min:\s*MIN_RATINGS/);
  });
});
