import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ageAr, INBOX_KINDS, inboxOf } from '../../supabase/functions/leaders-api/inbox.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('صندوق «ينتظرني»', () => {
  it('يجمع الأنواع في قائمة واحدة، الأقدم أولًا، بعمر كل بند وتأخره عن مهلة نوعه', () => {
    const r = inboxOf({
      approval: [{ id: 'p1', participant_id: 'p1', title: 'سارة', at: '2026-11-12T12:00:00Z' }, { id: 'p2', participant_id: 'p2', title: 'خالد', at: '2026-11-08T12:00:00Z' }],
      capstone: [{ id: 'p3', title: 'هند', at: '2026-11-10T12:00:00Z' }],
      erasure: [{ id: 'e1', participant_id: 'p4', title: 'ماجد', at: '2026-11-01T12:00:00Z' }],
    }, NOW);
    expect(r.items.map((i) => i.title)).toEqual(['ماجد', 'خالد', 'هند', 'سارة']);
    expect(r.total).toBe(4);
    expect(r.counts).toMatchObject({ approval: 2, capstone: 1, erasure: 1, model: 0 });
    // خالد ينتظر الاعتماد 5 أيام والمهلة يومان؛ طلب الحذف 12 يومًا ومهلته 30
    expect(r.items.find((i) => i.title === 'خالد')).toMatchObject({ days: 5, late: true });
    expect(r.items.find((i) => i.title === 'ماجد').late).toBe(false);
    expect(r.late).toBe(1);
  });
  it('الوجهة: ملف المشارك حين يكون البند عنه، وإلا صفحة نوعه', () => {
    const r = inboxOf({ approval: [{ id: 'p1', participant_id: 'p1', at: null }], capstone: [{ id: 'p3', at: null }], expert_application: [{ id: 'x1', at: null }], sponsor: [{ id: 's1', at: null }] }, NOW);
    const to = Object.fromEntries(r.items.map((i) => [i.kind, i.to]));
    expect(to.approval).toEqual({ tab: 'participants', id: 'p1' });
    expect(to.capstone).toEqual({ tab: 'capstones', id: 'p3' });
    expect(to.expert_application).toEqual({ tab: 'experts', id: 'x1' });
    expect(to.sponsor).toEqual({ tab: 'payments', id: null });
  });
  it('العمر بالعربية، والمصدر الفارغ قائمة فارغة', () => {
    expect([0, 1, 2, 5, 14].map(ageAr)).toEqual(['اليوم', 'منذ يوم', 'منذ يومين', 'منذ 5 أيام', 'منذ 14 يومًا']);
    expect(inboxOf({}, NOW)).toMatchObject({ total: 0, late: 0, items: [] });
  });
  it('الخادم يقرأ كل نوع معرَّف، وتعذّر مصدر يُسمّى ولا يُسقط الصندوق', () => {
    const admin = read('supabase/functions/leaders-api/admin.ts');
    const body = admin.slice(admin.indexOf('export async function inbox('), admin.indexOf('// الملفات الخاصة (السيرة والأدلة)'));
    for (const k of Object.keys(INBOX_KINDS)) expect(body, k).toMatch(new RegExp(`\\b${k}: db\\.from\\(`));
    expect(body).toContain('if (res[i].error) skipped.push(k);');
  });
});
