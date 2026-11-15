// المرحلة الخامسة: سجل قرارات البوابات من سجل التدقيق، وتقرير الإغلاق المولّد من الوثيقة والمتابعة
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closureData, GATE_ACTIONS, gateDecisions } from '../../supabase/functions/leaders-api/closure.js';
import { capstoneReport } from '../../src/lib/brand/capstone.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('سجل قرارات البوابات: من سجل التدقيق كما وقع', () => {
  it('كل فعل يقرؤه السجل يكتبه الخادم فعلًا في سجل التدقيق باسمه نفسه', () => {
    const server = ['capstone.ts', 'admin.ts', 'tracking.ts'].map((f) => read(`supabase/functions/leaders-api/${f}`)).join('\n');
    for (const a of GATE_ACTIONS) {
      const literal = server.includes(`'${a}'`);
      const templated = (a.startsWith('capstone.sponsor-') && server.includes('`capstone.sponsor-${b.decision}`')) || (a.startsWith('tracking.verify-') && server.includes('`tracking.verify-${status}`'));
      expect(literal || templated, a).toBe(true);
    }
  });
  it('ترتيب زمني، بالأدوار لا الأسماء، ويُهمل ما ليس قرار بوابة، ولحظة الاعتماد من الوثيقة نفسها', () => {
    const log = gateDecisions([
      { action: 'capstone.accept', created_at: '2026-05-03T10:00:00Z', after: { score: 84 } },
      { action: 'submission.review', created_at: '2026-02-10T10:00:00Z', after: { status: 'reviewed' } },
      { action: 'participant.login', created_at: '2026-02-11T10:00:00Z' },
      { action: 'capstone.submit', created_at: '2026-04-20T10:00:00Z' },
      { action: 'capstone.return', created_at: '2026-04-25T10:00:00Z', after: { revisions: 1 } },
      { action: 'capstone.sponsor-endorse', created_at: '2026-05-05T10:00:00Z' },
      { action: 'tracking.verify-confirmed', created_at: '2026-11-01T10:00:00Z' },
    ], { approved_at: '2026-05-05T10:00:01Z' });
    expect(log.map((x) => x.decision)).toEqual([
      'اعتمد اختيار المبادرة', 'سلّم الوثيقة للمراجعة', 'أعاد الوثيقة للتحسين (التحسين 1)', 'قبل الوثيقة بمعيار 84 من 100',
      'أيّد المبادرة', 'اعتُمدت الوثيقة', 'أكّد أرقام المراجعة',
    ]);
    expect(new Set(log.map((x) => x.by))).toEqual(new Set(['المستشار', 'القائد', 'الراعي', 'المنصة']));
    expect(JSON.stringify(log)).not.toMatch(/@/);
  });
  it('الخادم يقرؤه لحظة العرض فوق اللقطة المعتمدة، ولا يجمّده فيها', () => {
    const c = read('supabase/functions/leaders-api/capstone.ts');
    expect(c).toContain("db.from('audit_log').select('action, created_at, after').in('entity_id', ids).in('action', GATE_ACTIONS)");
    expect(c).toContain('return { ...doc, decisions: await decisionsFor(p.id, c.approved_at || null) };');
    // لقطة الاعتماد من docFor لا من recordFor، فلا يُجمَّد السجل فيها
    expect(c).toContain("const snapshot = await docFor(p, 'admin');");
  });
});

const approved = (tracking, extra = []) => ({
  meta: { status: 'approved', initiative: 'موعد أول أقرب' },
  sections: [
    { key: 'initiative-charter', title: 'بطاقة المبادرة', dimension: 'milestone', fields: [{ key: 'operator', label: 'من سيشغّل', type: 'text', value: 'إدارة العيادات الخارجية' }] },
    { key: 'impact-report', title: 'تقرير الأثر', dimension: 'impact', fields: [
      { key: 'not_achieved', label: 'ما لم يتحقق', type: 'textarea', value: 'لم يبلغ الانتظار 14 يومًا بعد' },
      { key: 'lessons', label: 'الدروس', type: 'textarea', value: 'التشخيص قبل البناء' }] },
    { key: 'change-sustain', title: 'التغيير', dimension: 'leadership', fields: [{ key: 'handover', label: 'التسليم', type: 'textarea', value: 'محضر تسلم موقع' }] },
    ...extra,
  ],
  tracking,
});
const tracking = (d180 = 'verified', health = 'green') => ({
  summary: { health, milestones: { done: 7, total: 8, on_time: 86 }, benefits: { realization: 74 }, checkpoints: [{ key: 'd90', status: 'verified' }, { key: 'd180', status: d180 }] },
  state: {
    milestones: [{ title: 'تشغيل التذكير', status: 'done' }, { title: 'التعميم على العيادات الخمس', status: 'late' }, { title: 'تطبيق ثانوي', status: 'dropped' }],
    benefits: [{ title: 'انتظار أقصر', baseline: '34', target: '14', value: '19', realization: 0.75 }],
  },
  statuses: {}, updates: [],
});

describe('تقرير الإغلاق: من الوثيقة المعتمدة والمتابعة وفصلي الأثر والتحول', () => {
  it('لا تقرير لوثيقة غير معتمدة أو بلا متابعة', () => {
    expect(closureData({ meta: { status: 'draft' }, tracking: tracking() })).toBeNull();
    expect(closureData({ meta: { status: 'approved' } })).toBeNull();
  });
  it('نهائي حين يؤكد الراعي مراجعة اليوم 180 أو تنتهي المتابعة، ومؤقت قبله', () => {
    expect(closureData(approved(tracking('verified'))).final).toBe(true);
    expect(closureData(approved(tracking('due', 'closed'))).final).toBe(true);
    const tmp = closureData(approved(tracking('upcoming')));
    expect(tmp.final).toBe(false);
    expect(tmp.status).toBe('مؤقت حتى مراجعة اليوم 180');
  });
  it('ما سُلّم وما لم يتحقق ولماذا ومن يشغّل والدروس، كلها من مصادرها', () => {
    const c = closureData(approved(tracking()));
    expect(c.delivered).toEqual({ done: 7, total: 8, on_time: 86 });
    expect(c.benefits).toEqual([{ title: 'انتظار أقصر', baseline: '34', target: '14', value: '19', pct: 75 }]);
    expect(c.open).toEqual(['التعميم على العيادات الخمس']);
    expect(c.dropped).toEqual(['تطبيق ثانوي']);
    expect(c.not_achieved).toBe('لم يبلغ الانتظار 14 يومًا بعد');
    expect(c.operator).toBe('إدارة العيادات الخارجية');
    expect(c.handover).toBe('محضر تسلم موقع');
    expect(c.lessons).toEqual(['التشخيص قبل البناء']);
    expect(c.sponsor).toBe('أكّدها الراعي');
  });
  it('الوثيقة الاحترافية تحمل تقرير الإغلاق وسجل القرارات', () => {
    const doc = { ...approved(tracking()), decisions: gateDecisions([{ action: 'capstone.submit', created_at: '2026-04-20T10:00:00Z' }]) };
    const { body } = capstoneReport(doc);
    expect(body).toContain('تقرير إغلاق المبادرة (نهائي)');
    expect(body).toContain('سجل قرارات البوابات');
    expect(body).toContain('سلّم الوثيقة للمراجعة');
    expect(body).toContain('معلم لم يكتمل:');
  });
});
