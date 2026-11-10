// خصوصية المشارك: ما يدخل نسخة بياناته وما يُحجب، وطلب الحذف
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanReason, ERASE_REPLY_DAYS, eraseDue, eraseView, EXPORT_SKIPPED, EXPORT_TABLES, isSecretColumn, scrubRow } from '../../supabase/functions/leaders-api/privacy.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const schema = read('supabase/schema/baseline.sql');
const tables = [...schema.matchAll(/create table (?:if not exists )?leaders\.(\w+) \(([\s\S]*?)\n\);/g)]
  .map(([, name, body]) => ({ name, cols: body.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean) }));

describe('نسخة بيانات المشارك', () => {
  it('كل جدول فيه participant_id مذكور في التصدير أو في المستثنى بسببه', () => {
    const withParticipant = tables.filter((t) => t.cols.includes('participant_id')).map((t) => t.name);
    expect(withParticipant.length).toBeGreaterThan(25);
    const unknown = withParticipant.filter((t) => !(t in EXPORT_TABLES) && !(t in EXPORT_SKIPPED));
    expect(unknown).toEqual([]);
  });
  it('كل جدول في التصدير موجود في المخطط وفيه participant_id، وكل عمود محجوب فيه حقيقي', () => {
    for (const [name, hidden] of Object.entries(EXPORT_TABLES)) {
      const t = tables.find((x) => x.name === name);
      expect(t, name).toBeTruthy();
      expect(t.cols, name).toContain('participant_id');
      for (const c of hidden) expect(t.cols, `${name}.${c}`).toContain(c);
    }
  });
  it('لا يخرج رمز ولا بصمة ولا مفتاح دخول من أي جدول', () => {
    for (const t of tables.filter((x) => x.name in EXPORT_TABLES || x.name === 'participants')) {
      const row = Object.fromEntries(t.cols.map((c) => [c, 'x']));
      const out = Object.keys(scrubRow(t.name, row));
      expect(out.filter((c) => /token|hash|public_key|credential|signature/.test(c)), t.name).toEqual([]);
    }
    expect(isSecretColumn('token_hash')).toBe(true);
    expect(isSecretColumn('sponsor_token_hash')).toBe(true);
    expect(isSecretColumn('full_name')).toBe(false);
  });
  it('إجابات المقيّمين وأصوات لجنة التقييم لا تخرج، وما أدخله المشارك يخرج', () => {
    const r = scrubRow('raters', { id: 1, email: 'a@b.c', full_name: 'س', relation: 'peer', answers: { q: 5 }, comment: 'سري', token_hash: 'h', status: 'submitted' });
    expect(r).toEqual({ id: 1, email: 'a@b.c', full_name: 'س', relation: 'peer', status: 'submitted' });
    const f = scrubRow('final_evaluations', { score: 80, decision: 'pass', votes: [{ by: 'x' }], submitted_by: 'x' });
    expect(f).toEqual({ score: 80, decision: 'pass' });
  });
});

describe('طلب الحذف', () => {
  it('السبب يُنظَّف ويُحدّ، والفارغ يصير null', () => {
    expect(cleanReason('  لا   أحتاج\nالحساب ')).toBe('لا أحتاج الحساب');
    expect(cleanReason('')).toBeNull();
    expect(cleanReason('أ'.repeat(900))).toHaveLength(500);
  });
  it('المهلة ثلاثون يومًا من تاريخ الطلب', () => {
    expect(ERASE_REPLY_DAYS).toBe(30);
    expect(eraseDue('2026-11-10T00:00:00Z')).toBe('2026-12-10T00:00:00.000Z');
    expect(eraseView(null)).toBeNull();
    expect(eraseView({ id: 'r', status: 'pending', created_at: '2026-11-10T00:00:00Z', reason: null, participant_id: 'p' }))
      .toEqual({ id: 'r', status: 'pending', created_at: '2026-11-10T00:00:00Z', due_at: '2026-12-10T00:00:00.000Z', reason: null });
  });
});

describe('الربط', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  it('الإجراءات الثلاثة مسجلة للمشارك ولا تحتاج دفعًا', () => {
    for (const a of ['me.privacy', 'me.export', 'me.erase-request']) {
      expect(index).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(p`));
      expect(index.match(/const PAY_FREE = new Set\(\[[\s\S]*?\]\)/)[0]).toContain(`'${a}'`);
    }
  });
  it('تنفيذ المدير للحذف يغلق الطلب القائم قبل حذف الصف', () => {
    const admin = read('supabase/functions/leaders-api/admin.ts');
    expect(admin.indexOf('await closeErasure(id, a.email)')).toBeGreaterThan(0);
    expect(admin.indexOf('await closeErasure(id, a.email)')).toBeLessThan(admin.indexOf("db.from('participants').delete().eq('id', id)"));
  });
  it('التطبيق يعرض الخدمة في صفحة الملف', () => {
    expect(read('leaders-app/src/App.jsx')).toMatch(/<MyData /);
    const ui = read('leaders-app/src/screens/MyData.jsx');
    for (const a of ['me.privacy', 'me.export', 'me.erase-request']) expect(ui).toContain(`'${a}'`);
  });
});
