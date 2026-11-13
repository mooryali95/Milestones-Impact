import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canRequestRetake, openRetake, retakeReason, retakeText, RETAKE_TITLE } from '../../supabase/functions/leaders-api/retake.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('طلب إعادة القياس', () => {
  it('السبب من مؤشر الجهد المحفوظ: استعجال أو مراجعة، وإلا قرار إداري', () => {
    expect(retakeReason({ level: 'low' })).toBe('effort');
    expect(retakeReason({ level: 'watch' })).toBe('effort');
    expect(retakeReason({ level: 'ok' })).toBe('admin');
    expect(retakeReason(null)).toBe('admin');
  });
  it('النص لا يتهم ولا يعد بأن الزمن يدخل التقييم، ويذكر زمن الأداة المعلن', () => {
    const t = retakeText('effort', 35);
    expect(t).toContain('أسرع من الوقت اللازم لقراءة السؤال');
    expect(t).toContain('نحو 35 دقيقة');
    expect(t).not.toMatch(/يدخل في تقييمك|غش|اكتشف/);
    expect(retakeText('admin', null)).toContain('راجعت إدارة البرنامج');
    expect(RETAKE_TITLE).toBeTruthy();
  });
  it('الطلب القائم: آخر قياس ملغى طُلبت إعادته، ويُغلق حين يُسلَّم قياس بعده', () => {
    const asked = { status: 'void', retake_requested_at: '2026-11-13T10:00:00Z', retake_reason: 'effort' };
    expect(openRetake([asked])).toEqual({ requested_at: asked.retake_requested_at, reason: 'effort' });
    expect(openRetake([asked, { status: 'in_progress' }])).not.toBeNull();
    expect(openRetake([asked, { status: 'submitted', submitted_at: '2026-11-14T09:00:00Z' }])).toBeNull();
    // قياس مُسلَّم قبل الطلب لا يغلقه، وإلغاء بلا طلب ليس طلبًا
    expect(openRetake([asked, { status: 'submitted', submitted_at: '2026-11-12T09:00:00Z' }])).not.toBeNull();
    expect(openRetake([{ status: 'void' }])).toBeNull();
  });
  it('الطلب الجماعي لمن سلّم ولم يُعتمد وحده', () => {
    expect(canRequestRetake({ status: 'pending_approval' }, { status: 'submitted' })).toBe(true);
    expect(canRequestRetake({ status: 'placed' }, { status: 'submitted' })).toBe(false);
    expect(canRequestRetake({ status: 'profiled' }, { status: 'in_progress' })).toBe(false);
    expect(canRequestRetake({ status: 'pending_approval', is_demo: true }, { status: 'submitted' })).toBe(false);
  });
  it('مصدر واحد: بطاقة الموقع والبريد من retakeText، والمؤشر يُحفظ بعد احتساب المستوى ولا يدخله', () => {
    const part = read('supabase/functions/leaders-api/participant.ts');
    expect(part).toContain('retakeText(open.reason, minutes)');
    expect(read('supabase/functions/leaders-api/admin.ts')).toContain('retakeMail(p.full_name, retakeText(reason,');
    // الحفظ بعد كتابة النتيجة والحالة، وplacementFromAnswers لا يأخذ المؤشر
    expect(part.indexOf('await saveEffort(')).toBeGreaterThan(part.indexOf("update({ status: 'submitted', submitted_at: now })"));
    expect(read('supabase/functions/leaders-api/logic.js')).not.toMatch(/effort/i);
  });
});
