import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deleteFollowUp } from './erase-follow.js';

describe('ما بقي على المدير بعد حذف مشارك (participantDelete)', () => {
  it('لا شيء بقي: لا نافذة', () => {
    expect(deleteFollowUp({ success: true, mailed: true, files: 2 })).toBe(null);
    expect(deleteFollowUp({ success: false, message: 'x' })).toBe(null);
  });
  it('تأكيد لم يصل: العنوان المعاد في النص، لأنه لا يبقى في المنصة بعدها', () => {
    const t = deleteFollowUp({ success: true, mailed: false, email: 'sara@x.sa' });
    expect(t).toContain('sara@x.sa');
    expect(t).toContain('نُفّذ طلب حذف بياناتك');
  });
  it('ملفات باقية: مجلدها، وأن التأكيد بعد حذفها', () => {
    const t = deleteFollowUp({ success: true, mailed: false, email: 'sara@x.sa', files_failed: true, folder: 'abc/' });
    expect(t).toContain('abc/');
    expect(t).toContain('sara@x.sa');
  });
  it('طلب لم يُغلق وسجل لم يُكتب يُذكران', () => {
    expect(deleteFollowUp({ success: true, mailed: true, request_open: true })).toContain('لم يُغلق');
    expect(deleteFollowUp({ success: true, mailed: true, audit_failed: true })).toContain('سجل التدقيق');
  });
  it('الشاشة تعرضه في نافذة لا تختفي وحدها، ولا تكتفي بـ«حُذف المشارك»', () => {
    const ui = readFileSync(join(__dirname, 'screens/Participants.jsx'), 'utf8');
    expect(ui).toMatch(/const follow = deleteFollowUp\(r\);\s*if \(follow\) await confirm\(follow, \{ ok: 'فهمت' \}\); else toast\('حُذف المشارك'\);/);
  });
});
