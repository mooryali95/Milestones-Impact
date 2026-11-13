// فريق الجهة والدفعة، المرحلة 2 (تصور ربط الخبراء والمجموعات بالجهة v1): الخبير يعرف تكليفاته («تكليفاتي»)،
// ويصله بريد واحد بالتكليف (والمدعو الجديد سطر في دعوته نفسها)، والمشارك يرى «مستشارك» بالاسم وحده.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignmentScopeAr, cohortPeriodAr } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, 'supabase/functions/leaders-api', p), 'utf8');
const fnBody = (src, name, len = 2500) => { const i = src.indexOf(`function ${name}`); return i < 0 ? '' : src.slice(i, i + len); };

describe('صياغة التكليف: مصدر واحد للبريد والبوابة واللوحة', () => {
  it('المدة: اليومان، أو أحدهما، أو لم تُحدَّد. والتاريخ يوم بلا ساعة لا يرجع يومًا', () => {
    expect(cohortPeriodAr({ starts_on: '2026-03-01', ends_on: '2026-06-30' })).toBe('1 مارس 2026 إلى 30 يونيو 2026');
    expect(cohortPeriodAr({ starts_on: '2026-09-01', ends_on: null })).toBe('من 1 سبتمبر 2026');
    expect(cohortPeriodAr({ starts_on: null, ends_on: '2026-12-31' })).toBe('حتى 31 ديسمبر 2026');
    expect(cohortPeriodAr({})).toBe('لم تُحدَّد مدة الدفعة بعد');
    expect(cohortPeriodAr(null)).toBe('لم تُحدَّد مدة الدفعة بعد');
  });
  it('ما يحمله في الدفعة', () => {
    expect(assignmentScopeAr({ advisor: true, groups: [] })).toBe('المستشار الأساسي للدفعة');
    expect(assignmentScopeAr({ advisor: false, groups: [{ name: 'المجموعة 4' }] })).toBe('خبير المجموعة 4');
    expect(assignmentScopeAr({ advisor: true, groups: [{ name: 'المجموعة 1' }] })).toBe('المستشار الأساسي للدفعة · خبير المجموعة 1');
    expect(assignmentScopeAr({})).toBe('عضو فريق الدفعة');
  });
});

describe('بريد التكليف', () => {
  const team = read('team.ts');
  const add = fnBody(team, 'teamAdd', 6000);
  it('الخبير القائم يصله بريد التكليف مرة لكل تغيير فعلي، بحصة البريد نفسها، وتعذّره لا يُسقط التكليف', () => {
    expect(add).toMatch(/if \(!invite && isNew\)/);
    expect(add).toMatch(/sendMail\(e\.email, `كُلّفت في فريق \$\{c\.name\}`, teamAssignedMail\(/);
    expect(add).toMatch(/\.then\(\(\) => true, \(err\) => \{ console\.error\('team\.add mail', err\); return false; \}\)/);
    // الإعلام بعد حفظ التكليف وسجله، لا قبله
    expect(add.indexOf('sendMail(')).toBeGreaterThan(add.indexOf("audit('admin', a.email, 'team.add'"));
  });
  it('المدعو الجديد: رسالة واحدة تجمع الدعوة والتكليف', () => {
    expect(add).toMatch(/expertCreate\(a, \{[^}]*send_invite: true \},\s*\{ assignment: await mailOf\(/);
    const experts = read('experts.ts');
    expect(fnBody(experts, 'adminSave')).toMatch(/await invite\(saved, opts\.assignment\)/);
    expect(fnBody(experts, 'invite')).toMatch(/\(assignment \? assignmentNote\(assignment\) : ''\)/);
    // لا بريد ثانٍ للمدعو من team.ts
    expect(add).not.toMatch(/sendMail\(invite/);
  });
  it('القالب في معرض البريد، من الدالة نفسها التي تُرسل', () => {
    const core = read('core.ts');
    expect(core).toMatch(/\{ key: 'team-assigned', family: 'experts',[^\n]*html: \(\) => teamAssignedMail\(/);
    expect(fnBody(core, 'teamAssignedMail', 1200)).toMatch(/shell\('experts'/);
  });
});

describe('ما يُعرض: أعداد لا أسماء، واسم المستشار بلا تواصل', () => {
  it('«تكليفاتي» في لوحة الخبير من المصادر الثلاثة، وتعذّرها لا يُسقط اللوحة', () => {
    const index = read('index.ts');
    expect(index).toMatch(/d\.assignments = await settle\('xp\.assignments', TM\.assignmentsOf\(e\.id, \{ withCounts: true \}\)\);/);
    const of = fnBody(read('team.ts'), 'assignmentsOf', 3000);
    expect(of).toMatch(/participants: st\.members\.length, serves: servedBy\(/);
    expect(of).not.toMatch(/full_name|email|phone/);
  });
  it('«مستشارك» من advisorOf (مصدر الصلاحية نفسه)، بالاسم وحده وللمشارك وحده', () => {
    const p = read('participant.ts');
    expect(p).toMatch(/audience === 'participant' \? advisorOf\(p\)\.catch\(\(\) => null\) : Promise\.resolve\(null\)/);
    expect(p).toMatch(/advisor: adv && \(audience === 'admin' \|\| vis\.par_advisor\) \? \{ full_name: \(adv as any\)\.full_name \} : null,/);
  });
  it('نطاق المستشار لم يتغير', () => {
    const adv = read('advisor.ts');
    expect(adv).toMatch(/export async function myParticipantIds\(expertId: string\)/);
    expect(adv).not.toMatch(/cohort_experts/);
  });
});
