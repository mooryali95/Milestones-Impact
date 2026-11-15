// المرحلة الأولى من تصور لوحة الإدارة (2026-11-15): الأسماء من labels.js وحده في الحضور والكتيب والقياس،
// بلا رموز خام للمالك، وبلا عنوان جانب فارغ في أداة القياس
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTEND_METHOD_AR, COACH_STATUS_ADMIN, DIM_AR, DIM_ROMAN, DIMENSIONS } from '../../supabase/functions/leaders-api/labels.js';
import { chaptersAr, modelsAr } from './screens/Handbook.jsx';
import { tierGroups } from './screens/Methodology.jsx';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('مصدر واحد لأسماء الإطار والحضور', () => {
  it('لكل إطار رقم واحد مميز', () => {
    expect(Object.keys(DIM_ROMAN)).toEqual(DIMENSIONS.map((d) => d.key));
    expect(new Set(Object.values(DIM_ROMAN)).size).toBe(DIMENSIONS.length);
  });

  it('طرق تسجيل الحضور تغطي قيد قاعدة البيانات كله بالعربية', () => {
    const sql = read('supabase/migrations/20261110140000_leaders_hall_attendance.sql');
    const allowed = [...sql.match(/workshop_attendance_method_check check \(method = any \(array\[(.+?)\]\)\)/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(Object.keys(ATTEND_METHOD_AR).sort()).toEqual(allowed.sort());
    for (const v of Object.values(ATTEND_METHOD_AR)) expect(v).toMatch(/[؀-ۿ]/);
  });

  it('حالة الجلسة الفردية في الحضور من COACH_STATUS_ADMIN وحده', () => {
    const a = read('admin-app/src/screens/Activities.jsx');
    expect(a).toMatch(/COACH_STATUS_ADMIN\[k\]/);
    expect(a).not.toMatch(/no_show:\s*'لم يحضر/);
    expect(COACH_STATUS_ADMIN.no_show).toBe('لم يحضر');
  });
});

describe('الحضور والجلسات بلا رموز خام', () => {
  const a = read('admin-app/src/screens/Activities.jsx');
  it('رمز المتطلب في التلميح لا في النص', () => {
    expect(a).not.toMatch(/<code>\{r\.code\}<\/code>/);
    expect(a.match(/<b title=\{r\.code\}>\{reqTitle\(r\)\}<\/b>/g)).toHaveLength(2);
  });
  it('طريقة الحضور من ATTEND_METHOD_AR لا من خريطة في الشاشة', () => {
    expect(a).toMatch(/ATTEND_METHOD_AR\[p\.attendance\.method\] \|\| ATTEND_METHOD_AR\.manual/);
    expect(a).not.toMatch(/hall: 'القاعة'/);
  });
});

describe('الكتيب', () => {
  const h = read('admin-app/src/screens/Handbook.jsx');
  it('لا نص يذكر زر «+ سؤال» المحذوف', () => {
    expect(h).not.toMatch(/\+ سؤال/);
  });
  it('الإطار بالعربية ورقمه من DIM_ROMAN، بلا حرف إنجليزي ولا نسخة محلية', () => {
    expect(h).not.toMatch(/DIM_EN/);
    expect(h).not.toMatch(/const ROM = /);
    expect(h).toMatch(/DIM_ROMAN\[d\]/);
  });
  it('عدّ الأبواب والنماذج بتمييزه', () => {
    expect([0, 1, 2, 3, 11].map(chaptersAr)).toEqual(['لا أبواب', 'باب واحد', 'بابان', '3 أبواب', '11 بابًا']);
    expect([0, 1, 2, 7, 22].map(modelsAr)).toEqual(['لا نماذج', 'نموذج واحد', 'نموذجان', '7 نماذج', '22 نموذجًا']);
  });
});

describe('أداة القياس', () => {
  it('الجانب بلا أسئلة لا يظهر، والترتيب ترتيب الجوانب', () => {
    const qs = [{ id: 1, tier: 'behavior' }, { id: 2, tier: 'knowledge' }, { id: 3, tier: 'knowledge' }];
    const g = tierGroups(qs);
    expect(g.map((x) => x.t)).toEqual(['knowledge', 'behavior']);
    expect(g[0].qs.map((q) => q.id)).toEqual([2, 3]);
    expect(tierGroups([])).toEqual([]);
    expect(tierGroups([{ id: 4, tier: 'transfer' }]).map((x) => x.title)).toEqual(['انتقال التعلم (بعدي، بلا درجة)']);
  });
  it('الأطر بأسمائها العربية في التبويبات والخلايا والمتطلبات', () => {
    const m = read('admin-app/src/screens/Methodology.jsx');
    expect(m).not.toMatch(/DIM_EN/);
    expect(m).toMatch(/onClick=\{\(\) => setDim\(d\)\}>\{DIM\[d\]\}/);
    expect(DIM_AR.milestone).toBe('إدارة المشروعات');
  });
});

describe('حالة الجلسة وحالة الفصل من labels.js لا من الشاشات', () => {
  it('ملف الخبير يأخذ COACH_STATUS_ADMIN ولا يكتب نسخة محلية', () => {
    const s = read('admin-app/src/screens/Experts.jsx');
    expect(s).toMatch(/COACH_STATUS_ADMIN as COACH_AR/);
    expect(s).not.toMatch(/const COACH_AR\s*=/);
    expect(COACH_STATUS_ADMIN.attended).toBe('حضر');
  });
  it('فصول وثيقة المبادرة تأخذ SUBMISSION_STATUS_ADMIN', () => {
    const s = read('admin-app/src/screens/Capstones.jsx');
    expect(s).toMatch(/SUBMISSION_STATUS_ADMIN\[s\.status\]/);
    expect(s).not.toMatch(/'قيّمته'/);
  });
});
