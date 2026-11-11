// links-expert-3: الدور في ملف المشارك وقائمة مشاركي الخبير اسمٌ واحد، وحالة طلب الخبير بالعربية
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPERT_REQUEST_STATUS, EXPERT_ROLE_AR, expertRoleAr } from '../../supabase/functions/leaders-api/labels.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('أسماء أدوار الخبراء وحالات طلباتهم', () => {
  it('اسم الدور نص واحد هو الأول من الزوج، والمجهول يعود كما هو', () => {
    for (const k of Object.keys(EXPERT_ROLE_AR)) expect(expertRoleAr(k)).toBe(EXPERT_ROLE_AR[k][0]);
    expect(typeof expertRoleAr('coach')).toBe('string');
    expect(expertRoleAr('x')).toBe('x');
  });
  it('ملف المشارك يأخذ الدور من المصدر الواحد ويرسل حالة الطلب بالعربية، والبوابة تعرضها', () => {
    const file = read('supabase/functions/leaders-api/file.ts');
    expect(file).not.toMatch(/EXPERT_ROLE_AR as Record<string, any>\)\[r\]\?\.title/);
    expect(file).toMatch(/expertRoleAr as roleAr/);
    expect(file).toMatch(/status_ar: \(EXPERT_REQUEST_STATUS/);
    expect(read('leaders-app/src/screens/ExpertFile.jsx')).toMatch(/· \{r\.status_ar\}<\/li>/);
    for (const s of ['accepted', 'completed', 'offered']) expect(EXPERT_REQUEST_STATUS[s]).toMatch(/[؀-ۿ]/);
  });
});
