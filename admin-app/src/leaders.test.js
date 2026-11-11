import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { csvText, filterPeople, inviteUrl, L, trackOf, trackOfPlacements, validCampaign } from './leaders.js';
import { session } from './api.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('trackOf', () => {
  it('يبني رمز المسار من المستويات الثلاثة', () => {
    expect(trackOf({ milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' })).toBe('M1I1L2');
    expect(trackOf({ milestone: 'advanced', impact: 'beginner' })).toBeNull();
  });
  it('يقرأ التسكين من قائمة الأبعاد', () => {
    expect(trackOfPlacements([{ dimension: 'milestone', level: 'advanced' }, { dimension: 'impact', level: 'advanced' }, { dimension: 'leadership', level: 'advanced' }])).toBe('M3I3L3');
  });
});

it('filterPeople يبحث ويصفّي بالمسار', () => {
  const pl = [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'beginner' }];
  const list = [{ full_name: 'سارة', email: 's@x', placements: pl }, { full_name: 'Omar', email: 'o@x', placements: [] }];
  expect(filterPeople(list, { q: 'omar' })).toHaveLength(1);
  expect(filterPeople(list, { track: 'M1I1L1' })[0].full_name).toBe('سارة');
});

it('روابط الدعوة والحملات', () => {
  expect(inviteUrl({ invite_code: 'abc' }, 'whatsapp')).toBe('https://leaders.sunkvalue.com/j/abc/whatsapp');
  expect(validCampaign('email_1')).toBe(true);
  expect(validCampaign('واتساب')).toBe(false);
});

it('csvText يبدأ بعلامة BOM ويهرّب علامات الاقتباس', () => {
  const t = csvText(['a'], [['x"y']]);
  expect(t.charCodeAt(0)).toBe(0xfeff);
  expect(t).toContain('"x""y"');
});

// admin-core-1: فعل المرحلة كان يُرسل في حقل action فيكتب فوق اسم الإجراء، فيرد الخادم «إجراء غير معروف» ولا يصل التدخل
describe('L: اسم الإجراء والتوكن لا يكتب فوقهما جسم الطلب', () => {
  afterEach(() => { vi.unstubAllGlobals(); session.clear(); });
  it('حقلا action وtoken في body لا يغيّران الإجراء ولا الجلسة المرسلة', async () => {
    session.save('admin-token', { email: 'a@x', role_id: 'admin' });
    const fetch = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
    vi.stubGlobal('fetch', fetch);
    await L('admin.stage-override', { participant_id: 'p1', action: 'complete', token: 'غيره' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ participant_id: 'p1', action: 'admin.stage-override', token: 'admin-token' });
  });
  it('العقد بين الطرفين: الواجهة ترسل الفعل في stage_action والخادم يقرؤه منه، لا من action', () => {
    expect(read('admin-app/src/screens/Participants.jsx')).toContain("act('admin.stage-override', { participant_id: p.id, stage_key: s.key, stage_action: action, note }, 'تم');");
    const admin = read('supabase/functions/leaders-api/admin.ts');
    const fn = admin.slice(admin.indexOf('export async function stageOverride'), admin.indexOf('export async function stageCreate'));
    expect(fn).toContain("const action = b.stage_action == null || b.stage_action === '' ? null : String(b.stage_action);");
    expect(fn).toContain("if (!('stage_action' in b)) throw new Fail(");
    expect(fn).not.toMatch(/\bb\.action\b/);
  });
});
