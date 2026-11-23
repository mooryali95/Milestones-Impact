// قرار المالك 2026-11-23: «غيّرت الرحلة فلماذا لم تتغير الدفعة؟». التنبيه في رأس ملف الدفعة يقول ما بينها وبين ما عُدّل
import { describe, expect, it } from 'vitest';
import { versionNotice } from '../../supabase/functions/leaders-api/cohort-readiness.js';

const prog = (o = {}) => ({ id: 'p', name: 'إدارة المشروعات', versions: [{ id: 'v2', number: 2 }, { id: 'v1', number: 1 }], ...o });
describe('تنبيه نسخة الرحلة', () => {
  it('نسخة أحدث: «رقِّ الدفعة» بالرقمين', () => {
    const n = versionNotice({ cohort: { program_id: 'p', program_version_id: 'v1' }, programs: [prog()] });
    expect(n).toMatchObject({ kind: 'newer', action: 'upgrade' });
    expect(n.text).toContain('على النسخة 1');
    expect(n.text).toContain('والأحدث 2');
  });
  it('على أحدث نسخة وفي المسودة تعديلات: احفظها نسخة', () => {
    expect(versionNotice({ cohort: { program_id: 'p', program_version_id: 'v2' }, programs: [prog({ draft_changed: true })] })).toMatchObject({ kind: 'draft', action: 'journey' });
  });
  it('لا تنبيه: على الأحدث بلا مسودة، أو مغلقة، أو برنامج مؤرشف، أو غير مثبتة (لها بند الجاهزية)', () => {
    expect(versionNotice({ cohort: { program_id: 'p', program_version_id: 'v2' }, programs: [prog()] })).toBe(null);
    expect(versionNotice({ cohort: { program_id: 'p', program_version_id: 'v1', status: 'closed' }, programs: [prog()] })).toBe(null);
    expect(versionNotice({ cohort: { program_id: 'p', program_version_id: 'v1' }, programs: [prog({ archived_at: 'x' })] })).toBe(null);
    expect(versionNotice({ cohort: { program_id: 'p', program_version_id: null }, programs: [prog()] })).toBe(null);
  });
});

import { versionSavedAr } from './screens/Programs.jsx';
describe('رسالة حفظ النسخة مع الترقية التلقائية', () => {
  it('تسمي ما رُقّي وما بقي وسببه', () => {
    const t = versionSavedAr({ version: { number: 3 }, upgraded: ['سفراء'], held: [{ name: 'القادة', reason: '2 من أعضائها لهم تقدم فيما يُحذف' }], behind: 1 });
    expect(t).toBe('حُفظت النسخة 3. رُقّيت تلقائيًا: «سفراء». دفعة واحدة باقية على نسخة أقدم لمراجعتك: «القادة» (2 من أعضائها لهم تقدم فيما يُحذف).');
    expect(versionSavedAr({ version: { number: 2 }, upgraded: [], held: [], behind: 0 })).toBe('حُفظت النسخة 2.');
  });
});
