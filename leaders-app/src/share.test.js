// مشاركة وثيقة المبادرة برابط خاص، وملاحظات القراء (share.js منطق خالص، وshare.ts الخادم)
// التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanNote, cleanShareInput, MAX_ACTIVE_SHARES, ownerView, publicDoc, SHARE_DAYS, shareState } from '../../supabase/functions/leaders-api/share.js';

const read = (p) => readFileSync(p, 'utf8');
const NOW = Date.parse('2026-11-15T12:00:00Z');

describe('حالة الرابط ومدخلاته', () => {
  it('نشط حتى ينتهي أو يُلغى، والإلغاء يسبق الانتهاء', () => {
    expect(shareState({ expires_at: '2026-11-20T00:00:00Z' }, NOW)).toBe('active');
    expect(shareState({ expires_at: '2026-11-10T00:00:00Z' }, NOW)).toBe('expired');
    expect(shareState({ expires_at: '2026-11-20T00:00:00Z', revoked_at: '2026-11-14T00:00:00Z' }, NOW)).toBe('revoked');
  });
  it('رابط جديد: تسمية لازمة، ومدة من الثلاث، والتحميل مسموح افتراضًا والملاحظات والمستوى بإذن', () => {
    expect(SHARE_DAYS).toEqual([7, 30, 90]);
    expect(cleanShareInput({ label: '  مديري  ', days: 30 })).toEqual({ label: 'مديري', days: 30, allow_notes: false, allow_download: true, show_levels: false, show_readiness: false });
    expect(() => cleanShareInput({ label: '', days: 30 })).toThrow(/سمِّ الرابط/);
    expect(() => cleanShareInput({ label: 'س', days: 365 })).toThrow(/مدة الرابط/);
  });
  it('التعديل يغيّر ما أُرسل وحده', () => {
    expect(cleanShareInput({ allow_notes: true }, { create: false })).toEqual({ allow_notes: true });
  });
  it('الملاحظة: اسم ونص، والفصل يُقبل من فصول الوثيقة وحدها', () => {
    expect(cleanNote({ name: 'خالد', role: '', body: ' سؤال عن التكلفة ', section: 'cost-plan' }, ['cost-plan'])).toEqual({ author_name: 'خالد', author_role: null, body: 'سؤال عن التكلفة', section_key: 'cost-plan' });
    expect(cleanNote({ name: 'خالد', body: 'نص', section: 'x' }, ['cost-plan']).section_key).toBeNull();
    expect(() => cleanNote({ name: 'خ', body: 'نص' })).toThrow(/اسمك/);
    expect(() => cleanNote({ name: 'خالد', body: '' })).toThrow(/ملاحظتك/);
  });
  it('صف الرابط لصاحبه: عدد ملاحظاته غير المؤرشفة وغير المقروءة', () => {
    const v = ownerView({ id: 's1', label: 'مديري', expires_at: '2026-11-20T00:00:00Z', views: 3 }, [
      { share_id: 's1' }, { share_id: 's1', read_at: 'x' }, { share_id: 's1', archived_at: 'x' }, { share_id: 's2' }], NOW);
    expect(v).toMatchObject({ state: 'active', views: 3, notes: 2, unread: 1 });
  });
});

describe('ما يصل القارئ: الخادم يحسمه', () => {
  const doc = {
    meta: { level: 'advanced', profile: 'impact-advanced', track: { title: 'مسار' }, initiative: 'م' },
    sections: [{ key: 'initiative-charter', fields: [{ key: 'sponsor', value: 'المدير' }, { key: 'sponsor_email', value: 'boss@x.sa' }] }],
    review: { score: 80 }, checks: [{ ok: false }], sponsor: { note: 'خاص' }, rubric: [{ key: 'a' }],
  };
  it('بلا تقييم المستشار ولا فحوصه ولا نص الراعي ولا أي بريد', () => {
    const d = publicDoc(doc, { show_levels: false });
    expect(d.review).toBeNull();
    expect(d.checks).toEqual([]);
    expect(d.sponsor).toBeNull();
    expect(JSON.stringify(d)).not.toContain('boss@x.sa');
  });
  it('المستوى والمسار بإذن صاحب الوثيقة في هذا الرابط وحده (D18)', () => {
    expect(publicDoc(doc, { show_levels: false }).meta).toMatchObject({ level: null, profile: null, track: null });
    expect(publicDoc(doc, { show_levels: true }).meta.profile).toBe('impact-advanced');
  });
});

describe('الخادم والبوابات', () => {
  const ts = read('supabase/functions/leaders-api/share.ts');
  it('الرمز لا يُحفظ إلا بصمةً، ويُعرض مرة واحدة في ?t= كرابط الراعي', () => {
    expect(ts).toContain('token_hash: await hash(token)');
    expect(ts).toContain('/i?t=${encodeURIComponent(token)}');
    expect(ts).not.toMatch(/token:\s*token[,\s]/);
  });
  it('حد الروابط النشطة، وحد الإغراق، والتنبيه بالبريد مرة في الساعة', () => {
    expect(MAX_ACTIVE_SHARES).toBe(10);
    expect(ts).toContain('NOTE_LIMITS.perIpHour');
    expect(ts).toContain('now - new Date(row.notified_at).getTime() > NOTIFY_EVERY_MS');
  });
  it('الملاحظات لصاحبها وحده: كل قراءة وتعليم مقيدان بمعرّفه', () => {
    expect(ts).toMatch(/capstone_share_notes'\)\.select\([^)]*\)\.eq\('participant_id', p\.id\)/);
    expect(ts).toMatch(/update\(patch\)\.in\('id', ids\)\.eq\('participant_id', p\.id\)/);
  });
  it('كل فعل مصنّف: الإنشاء في البرنامج ومغلق على حساب العرض، والمنسحب يرى ويلغي ولا ينشئ', () => {
    // index.ts لا يُستورد هنا (يستورد حزم Deno)، فتُقرأ مجموعاته من نصه كما يقرؤها program_gate_test.ts
    const src = read('supabase/functions/leaders-api/index.ts');
    const set = (name) => new Set((src.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))[1].match(/'[^']+'/g) || []).map((x) => x.slice(1, -1)));
    const [program, kept, demoBlocked, demoOpen] = ['GATE_PROGRAM', 'GATE_KEPT', 'DEMO_BLOCKED', 'DEMO_OPEN'].map(set);
    const actions = [...src.matchAll(/^ {2}'(capstone\.[a-z-]+)': \(p/gm)].map((m) => m[1]);
    for (const a of ['capstone.shares', 'capstone.share-create', 'capstone.share-update', 'capstone.share-revoke', 'capstone.note-mark']) {
      expect(actions).toContain(a);
      expect(program.has(a), a).toBe(true);
      expect(demoBlocked.has(a) || demoOpen.has(a), a).toBe(true);
    }
    expect(demoBlocked.has('capstone.share-create')).toBe(true);
    expect(kept.has('capstone.share-revoke') && kept.has('capstone.shares')).toBe(true);
    expect(kept.has('capstone.share-create')).toBe(false);
  });
});
