import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditAr, cleanObservation, flagsOf, timelineOf } from '../../supabase/functions/leaders-api/observations.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const NOW = Date.parse('2026-11-13T12:00:00Z');

describe('ملف المشارك: الملاحظات والأعلام والخط الزمني', () => {
  it('الملاحظة اليدوية: نوعها مضبوط، ونصها مطلوب ومحدود، والمرئية بطلب صريح', () => {
    expect(cleanObservation({ body: ' ' }).error).toBeTruthy();
    expect(cleanObservation({ body: 'x'.repeat(2001) }).error).toContain('2000');
    expect(cleanObservation({ kind: 'hack', body: 'حضر متأخرًا', visible: 'yes' })).toEqual({ kind: 'note', body: 'حضر متأخرًا', title: null, visible: false });
    expect(cleanObservation({ kind: 'commendation', title: '  عرض   ممتاز ', body: 'قدّم عرضًا واضحًا', visible: true })).toMatchObject({ kind: 'commendation', title: 'عرض ممتاز', visible: true });
  });
  it('الأعلام تُشتق من مصادرها: استعجال، إعادة، تأخر، غياب، نماذج معادة، توقف، وتنبيهات السجل', () => {
    const f = flagsOf({
      participant: { status: 'placed', last_login_at: '2026-10-20T00:00:00Z' },
      effort: { level: 'low', note: '46 من 60' }, retake: { requested_at: '2026-11-13' },
      milestone_summary: { late: 2, max_late: 9 }, sessions: [{ status: 'no_show' }, { status: 'attended' }],
      models: [{ status: 'returned' }], observations: [{ kind: 'warning' }, { kind: 'commendation' }],
    }, NOW);
    expect(f.map((x) => x.key)).toEqual(['retake', 'effort', 'late', 'no_show', 'returned', 'idle', 'warnings', 'praise']);
    expect(f.find((x) => x.key === 'late')).toMatchObject({ tone: 'bad', label: '2 معالم متأخرة', detail: 'أقصاها 9 يومًا' });
    expect(f.find((x) => x.key === 'no_show').label).toBe('غاب عن جلسة توجيه');
  });
  it('ملف نظيف بلا أعلام، ومن لم يُعتمد بعد لا يُعدّ متوقفًا', () => {
    expect(flagsOf({ participant: { status: 'placed', last_login_at: '2026-11-12T00:00:00Z' }, effort: { level: 'ok' } }, NOW)).toEqual([]);
    expect(flagsOf({ participant: { status: 'profiled', last_login_at: null } }, NOW)).toEqual([]);
  });
  it('الخط الزمني: السجل والملاحظات معًا، الأحدث أولًا، بتسمية عربية وسبب تغيير الحالة', () => {
    const t = timelineOf({
      history: [{ created_at: '2026-11-10T10:00:00Z', action: 'assessment.submit', actor_type: 'participant' },
        { created_at: '2026-11-12T10:00:00Z', action: 'participant.status', actor_type: 'admin', after: { status: 'suspended', reason: 'طلب الجهة' } }],
      observations: [{ created_at: '2026-11-11T10:00:00Z', kind: 'warning', source: 'system', title: 'غياب عن جلسة توجيه', body: 'سُجّل غيابك.' }],
    });
    expect(t.map((x) => x.text)).toEqual(['تغيّرت حالته', 'تنبيه: غياب عن جلسة توجيه', 'سلّم القياس']);
    expect(t[0].detail).toContain('السبب: طلب الجهة');
    expect(t[1]).toMatchObject({ tone: 'warn', by: 'النظام' });
    expect(auditAr('unknown.action')).toBe('unknown.action');
  });
  it('مصدر واحد: الملف يقرأ الأعلام والخط الزمني من observations.js، ونسخة المشارك تحمل المرئي وحده', () => {
    const file = read('supabase/functions/leaders-api/file.ts');
    expect(file).toContain('flags: flagsOf(file), timeline: timelineOf(');
    const priv = read('supabase/functions/leaders-api/privacy.ts');
    expect(priv).toMatch(/participant_observations'\)\.select\('kind, title, body, created_at, acknowledged_at'\)[^\n]*\.eq\('visible', true\)/);
    // ملاحظات النظام لا تُحذف، والكتابة للإدارة بغلاف writer
    expect(read('supabase/functions/leaders-api/observations.ts')).toContain("if (row.source === 'system') throw new Fail(");
    expect(read('supabase/functions/leaders-api/index.ts')).toContain("'admin.observation-add': (a, b) => A.writer(a, OB.adminAdd, b),");
  });
});
