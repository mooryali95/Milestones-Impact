// «فريق البرنامج» في بوابة منسق الجهة (تصور ربط الخبراء والمجموعات بالجهة v1، قرار المالك 2026-11-11):
// أسماء الخبراء وأدوارهم بلا وسائل تواصل، خلف صلاحية «الفريق» في JSON الصلاحيات نفسه بلا ترحيل،
// وافتراضها مفعّلة لقالبي البرنامج والراعي التنفيذي، ومطفأة للموارد البشرية.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coordPermissions, COORD_TEMPLATES, coordTeamView, orgVisibility, teamRows, templateOf } from '../../supabase/functions/leaders-api/logic.js';
import { VIEWER_PERM_AR } from '../../supabase/functions/leaders-api/labels.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('صلاحية «فريق البرنامج» بلا ترحيل', () => {
  it('القوالب: مفعّلة للبرنامج والراعي التنفيذي، ومطفأة للموارد البشرية', () => {
    expect(COORD_TEMPLATES.program.team).toBe(true);
    expect(COORD_TEMPLATES.executive.team).toBe(true);
    expect(COORD_TEMPLATES.hr.team).toBe(false);
  });
  it('حساب قائم قبلها (بلا مفتاح team): افتراضها من قالبه، ولا يصير قالبه «مخصّصًا»', () => {
    const legacyHr = { list: true, scores: false, contact: true, activity: false, export: true };
    const legacyProgram = { list: true, scores: false, contact: false, activity: true, export: true };
    expect(coordPermissions(legacyHr, 'hr').team).toBe(false);
    expect(coordPermissions(legacyProgram, 'program').team).toBe(true);
    expect(templateOf(legacyHr)).toBe('hr');
    expect(templateOf(legacyProgram)).toBe('program');
    // ما حُفظ صراحة يُحترم، وتغييره عن القالب يجعله مخصّصًا
    expect(coordPermissions({ ...legacyHr, team: true }, 'hr').team).toBe(true);
    expect(coordPermissions({ ...legacyProgram, team: false }, 'program').team).toBe(false);
    expect(templateOf({ ...COORD_TEMPLATES.program, team: false })).toBe('custom');
    for (const k of Object.keys(COORD_TEMPLATES)) expect(templateOf(COORD_TEMPLATES[k])).toBe(k);
  });
  it('ليست من بيانات المشاركين: لا تُذكر للمشارك في «ماذا ترى جهتك» ولا تفتح إشعار اتساع الاطلاع', () => {
    expect(VIEWER_PERM_AR).not.toHaveProperty('team');
    expect(orgVisibility([{ status: 'active', permissions: COORD_TEMPLATES.program }])).not.toHaveProperty('team');
  });
});

describe('ما يراه المنسق من الفريق', () => {
  const cohort = { id: 'c1', name: 'دفعة 2026', starts_on: '2026-03-01', ends_on: '2026-06-30', advisor_expert_id: 'adv' };
  const groups = [{ id: 'G1', name: 'المجموعة 1', advisor_expert_id: 'g1' }, { id: 'G2', name: 'المجموعة 2', advisor_expert_id: 'inv' }];
  const rows = teamRows(cohort, [{ expert_id: 't1' }, { expert_id: 'inv' }], groups);
  const experts = [
    { id: 'adv', full_name: 'د. سارة', title: 'مستشارة', status: 'active', roles: ['advisor'], bio: 'خبرة '.repeat(100), email: 'adv@x.sa', phone: '0500', hourly_rate: 500 },
    { id: 'g1', full_name: 'أ. خالد', status: 'active', roles: ['coach'], email: 'g1@x.sa' },
    { id: 't1', full_name: 'د. فهد', status: 'paused', roles: ['specialist'], email: 't1@x.sa' },
    { id: 'inv', full_name: 'مدعو لم يُعتمد', status: 'invited', roles: ['assessor'], email: 'inv@x.sa' },
  ];
  const members = [{ id: 'p1', name: 'منى', group_id: 'G1' }, { id: 'p2', name: 'سعد', group_id: 'G2' }, { id: 'p3', name: 'هند', group_id: null }];
  const view = (perms) => coordTeamView({ cohort, rows, experts, groups, members }, perms);
  it('الاسم والمسمى والأدوار، بلا بريد ولا جوال ولا سعر، والمعتمدون وحدهم', () => {
    const v = view({ team: true, list: true });
    const text = JSON.stringify(v);
    for (const s of ['@x.sa', '0500', '500', 'مدعو لم يُعتمد', 'hourly_rate', 'email', 'phone']) expect(text).not.toContain(s);
    expect(v.advisor).toMatchObject({ full_name: 'د. سارة', title: 'مستشارة', roles: ['advisor'] });
    expect(v.advisor.bio.length).toBeLessThanOrEqual(280);
    expect(v.team.map((x) => [x.full_name, x.groups])).toEqual([['أ. خالد', ['المجموعة 1']], ['د. فهد', []]]);
    // خبير مجموعة لم يُعتمد لا يظهر اسمه، ويُقال إن المجموعة بلا خبير
    expect(v.groups.map((g) => [g.name, g.count, g.expert])).toEqual([['المجموعة 1', 1, 'أ. خالد'], ['المجموعة 2', 1, null]]);
    expect(v.participants).toBe(3);
  });
  it('أسماء أعضاء المجموعات بصلاحية القائمة وحدها، وبلا صلاحية الفريق لا شيء', () => {
    expect(view({ team: true, list: true }).groups[0].members).toEqual(['منى']);
    expect(view({ team: true, list: false }).groups[0]).not.toHaveProperty('members');
    expect(view({ team: false, list: true })).toBeNull();
  });
  it('الخادم: الجهة من جلسة المنسق، والفريق بصلاحيته وحدها، وحفظ منسق قائم لا يفتحه لغير قالبه', () => {
    const coord = read('supabase/functions/leaders-api/coordinator.ts');
    expect(coord).toMatch(/const perms = coordPermissions\(c\.permissions, c\.template\);/);
    expect(coord).toMatch(/program_team: perms\.team \? await coordTeam\(c\.organization_id, perms\)/);
    expect(coord).toMatch(/coordPermissions\(b\.permissions \?\? \(template \? \(COORD_TEMPLATES as any\)\[template\] : before\?\.permissions\), template \|\| before\?\.template\)/);
    const team = read('supabase/functions/leaders-api/team.ts');
    const fn = team.slice(team.indexOf('export async function coordTeam'), team.indexOf('// ── تكليفات خبير'));
    expect(fn).toMatch(/if \(!perms\?\.team \|\| !orgId\) return null;/);
    expect(fn).toMatch(/coordTeamView\(/);
    expect(fn).toMatch(/\.neq\('status', 'closed'\)/);
  });
});
