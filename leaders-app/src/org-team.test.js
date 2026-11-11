// فريق الدفعة والجهة في نقطة واحدة (تصور ربط الخبراء والمجموعات بالجهة v1، الخيار ج، باعتماد المالك 2026-11-11).
// المرحلة 1: الدفعة نقطة الربط، والفريق يُقرأ من مصادره الثلاثة القائمة بلا ترحيل، والحمل تنبيه لا منع،
// ونموذج «تحرير» الدفعة لم يعد يكتب الفريق ولا المستشار (مصدر واحد للتحرير).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capacityOf, expertAssignments, matchScore, servedBy, teamCoverage, teamRows } from '../../supabase/functions/leaders-api/logic.js';
import { cohortFields, cohortToForm, formToCohort } from '../../admin-app/src/methodology.js';
import { coverageNotes, loadText, rankForAdd, scopeText } from '../../admin-app/src/team.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('فريق الدفعة من مصادره الثلاثة', () => {
  const cohort = { id: 'c1', advisor_expert_id: 'adv' };
  const team = [{ expert_id: 't1', created_at: '2026-11-01', added_by: 'a@x' }, { expert_id: 'g1' }];
  const groups = [{ id: 'G1', name: 'المجموعة 1', advisor_expert_id: 'g1' }, { id: 'G2', name: 'المجموعة 2', advisor_expert_id: null }];
  it('صف واحد لكل خبير بكل ما يحمله، والمستشار أولًا ثم خبراء المجموعات', () => {
    const rows = teamRows(cohort, team, groups);
    expect(rows.map((r) => r.expert_id)).toEqual(['adv', 'g1', 't1']);
    expect(rows[0]).toMatchObject({ advisor: true, member: false, groups: [] });
    expect(rows[1]).toMatchObject({ advisor: false, member: true, groups: [{ id: 'G1', name: 'المجموعة 1' }] });
    expect(rows[2]).toMatchObject({ member: true, added_by: 'a@x' });
    expect(scopeText(rows[0])).toBe('المستشار الأساسي');
    expect(scopeText(rows[1])).toBe('خبير المجموعة 1');
    expect(scopeText(rows[2])).toBe('عضو الفريق');
  });
  it('التغطية والخدمة بقاعدة الصلاحية نفسها (effectiveAdvisorId): خبير المجموعة غير المعتمد يعيد أعضاءها لمستشار الدفعة', () => {
    const members = [{ id: 'p1', group_id: 'G1' }, { id: 'p2', group_id: 'G1' }, { id: 'p3', group_id: 'G2' }, { id: 'p4', group_id: null }];
    expect(servedBy(cohort, members, groups, ['adv', 'g1'])).toEqual({ g1: 2, adv: 2 });
    expect(servedBy(cohort, members, groups, ['adv'])).toEqual({ adv: 4 });
    expect(teamCoverage(cohort, members, groups, ['adv', 'g1'])).toEqual({ members: 4, without_advisor: 0, groups: 2, groups_without_expert: 1, ungrouped: 1 });
    // بلا مستشار معتمد للدفعة: من ليس لمجموعته خبير يبقى بلا مستشار فعلي، فتُنبَّه الإدارة
    const cv = teamCoverage({ advisor_expert_id: null }, members, groups, ['g1']);
    expect(cv.without_advisor).toBe(2);
    expect(coverageNotes(cv)).toEqual(['مشاركان بلا مستشار فعلي (تراجع الإدارة أعمالهم)', 'مجموعة واحدة بلا خبير، فيتبع أعضاؤها مستشار الدفعة', 'مشارك واحد بلا مجموعة']);
  });
  it('تكليفات الخبير: سطر لكل دفعة بكل ما يحمله فيها، وغير المغلقة أولًا', () => {
    const cohorts = [
      { id: 'c1', name: 'دفعة أ', status: 'running', starts_on: '2026-03-01', advisor_expert_id: 'e' },
      { id: 'c2', name: 'دفعة ب', status: 'closed', starts_on: '2026-09-01', advisor_expert_id: null },
      { id: 'c3', name: 'دفعة ج', status: 'open', starts_on: '2026-10-01', advisor_expert_id: null },
    ];
    const list = expertAssignments('e', cohorts, [{ cohort_id: 'c1', expert_id: 'e' }, { cohort_id: 'c2', expert_id: 'e' }, { cohort_id: 'c3', expert_id: 'x' }],
      [{ id: 'G', cohort_id: 'c3', name: 'المجموعة 4', advisor_expert_id: 'e' }]);
    expect(list.map((a) => [a.cohort, a.advisor, a.member, a.groups.map((g) => g.name)])).toEqual([
      ['دفعة ج', false, false, ['المجموعة 4']], ['دفعة أ', true, true, []], ['دفعة ب', false, true, []]]);
  });
});

describe('السعة: تنبيه في الفريق، والقاعدة نفسها في الترشيح', () => {
  it('capacityOf مصدر واحد: الترشيح يقرؤه', () => {
    const e = { weekly_hours: 4, load: { requests: 3, upcoming: 1 } };
    expect(capacityOf(e)).toEqual({ hours: 4, used: 4, full: true });
    expect(capacityOf({ weekly_hours: 0, load: { requests: 9 } }).full).toBe(false);
    expect(matchScore(e, { role: 'coach' }).full).toBe(true);
    expect(matchScore({ ...e, weekly_hours: 5 }, { role: 'coach' }).full).toBe(false);
  });
  it('الحمل يُقال بنظرة، والممتلئ يبقى في قائمة الإضافة بعد غيره ولا يُحجب', () => {
    expect(loadText({ hours: 6, used: 7, full: true, cohorts: 2 })).toBe('الحمل 7/6 ساعة أسبوعيًا · مكلّف في دفعتين');
    expect(loadText({ hours: 0, used: 0, cohorts: 0 })).toBe('لم يعلن ساعاته الأسبوعية · بلا تكليف في دفعة قائمة');
    const experts = [
      { id: 'a', full_name: 'أحمد', roles: ['coach'], load: { full: true, used: 9 } },
      { id: 'b', full_name: 'بدر', roles: ['assessor'], load: { used: 0 } },
      { id: 'c', full_name: 'جود', roles: ['coach'], load: { used: 2 } },
    ];
    expect(rankForAdd(experts, { role: 'coach' }).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(rankForAdd(experts, { q: 'بدر' }).map((e) => e.id)).toEqual(['b']);
  });
  it('الخادم لا يرفض الإضافة لامتلاء السعة: يعيد over للتنبيه', () => {
    const src = read('supabase/functions/leaders-api/team.ts');
    const add = src.slice(src.indexOf('export async function teamAdd'), src.indexOf('async function orgName'));
    expect(add).toMatch(/over: !!load\?\.full/);
    expect(add).not.toMatch(/full\)? throw|if \(load\?\.full\)/);
  });
});

describe('نقطة واحدة للتحرير، بلا ترحيل ولا مساس بالصلاحية', () => {
  it('نموذج «تحرير» الدفعة لا يعرض المستشار ولا الفريق ولا يرسلهما', () => {
    const names = cohortFields({ orgs: [], programs: [], experts: [{ id: 'e', full_name: 'س' }], team: true }).map((f) => f.name);
    expect(names).not.toContain('advisor_expert_id');
    expect(names).not.toContain('team_expert_ids');
    // دفعة قائمة بفريقها: حفظ النموذج كان يعيد إرسال الفريق المقروء عند فتحه، فيمحو ما أُضيف من التبويب بعده
    const sent = formToCohort(cohortToForm({ id: 'c1', name: 'د', advisor_expert_id: 'adv', team_expert_ids: ['t1'], team_ready: true, delivery: {} }));
    expect(sent).not.toHaveProperty('advisor_expert_id');
    expect(sent).not.toHaveProperty('team_expert_ids');
  });
  it('الأفعال مسجّلة: القراءة للجميع، والكتابة بغلاف writer', () => {
    const index = read('supabase/functions/leaders-api/index.ts');
    expect(index).toContain("'admin.cohort-team': (_a, b) => TM.cohortTeam(b)");
    expect(index).toContain("'admin.org-team': (_a, b) => TM.orgTeam(b)");
    expect(index).toContain("'admin.team-add': (a, b) => A.writer(a, TM.teamAdd, b)");
    expect(index).toContain("'admin.team-remove': (a, b) => A.writer(a, TM.teamRemove, b)");
  });
  it('team.ts يكتب في المصادر القائمة وحدها، ولا يمس نطاق المستشار (advisor.ts)', () => {
    const src = read('supabase/functions/leaders-api/team.ts');
    const tables = [...src.matchAll(/db\.from\('([a-z_]+)'\)\.(?:insert|upsert|update|delete)/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual(['cohort_experts', 'cohort_groups', 'cohorts']);
    expect(src).not.toMatch(/myParticipantIds\(|groupScoped\(|from '\.\/advisor\.ts'/);
    // المدعو لا يُعيَّن مستشارًا ولا خبير مجموعة قبل اعتماده، والمعتمد يُكلَّف بدور من ملفه
    expect(src).toMatch(/if \(scope !== 'cohort'\) throw new Fail\('المدعو الجديد يُضاف إلى الفريق أولًا/);
    expect(src).toMatch(/if \(!\(e\.roles \|\| \[\]\)\.includes\(role\)\) throw new Fail/);
    expect(src).toMatch(/if \(!APPROVED\.includes\(e\.status\)\) throw new Fail/);
  });
});
