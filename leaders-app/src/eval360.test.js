// تصور تقييم 360 (اعتمده المالك 2026-11-11): docs/content/2026-11-11-تصور-تقييم-360-v1.md
// كل مرحلة تُختبر وحدها: 0 «جديد»، و0ب من يرى تقييم الخبير، و1 نموذج المقيّم، و2 الدورة والمجموعات، و3 التقرير والاستلام.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';
import { cleanOpenAnswers, CONTACT_FREQ, raterItems, reversedItem } from '../../supabase/functions/leaders-api/feedback360.js';
import { FEEDBACK_OPEN_MAX } from '../../supabase/functions/leaders-api/labels.js';
import { expertOwnRating, MIN_RATINGS, RATING_DROP, RATING_WINDOW_DAYS, ratingDrop } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('المرحلة 0: لا «خبير جديد» مكان التقييم الغائب', () => {
  it('بطاقة الترشيح لا تصف الخبير بأنه جديد', () => {
    expect(read('leaders-app/src/screens/ChooseExpert.jsx')).not.toMatch(/جديد في البرنامج|خبير جديد/);
  });
  it('حد إظهار التقييم للخبير من MIN_RATINGS وحده، لا رقم ثابت', () => {
    const src = read('supabase/functions/leaders-api/experts.ts');
    expect(src).not.toMatch(/min:\s*5\b/);
    // منذ 0ب يأتي الحد من expertOwnRating في logic.js (انظر اختبار «قبل MIN_RATINGS لا ملخص»)
    expect(src).toMatch(/min:\s*MIN_RATINGS|rating: ratings\.own/);
  });
});

describe('المرحلة 0ب: المشارك لا يرى نجوم الخبير، والخبير يرى ملخصه بنافذة دورية', () => {
  const at = (day) => new Date(Date.UTC(2026, 0, 1) + day * 864e5).toISOString();
  const r = (day, overall, s = overall) => ({ created_at: at(day), overall, scores: { useful: s, clear: s, punctual: s } });
  const keys = ['useful', 'clear', 'punctual'];
  const now = (day) => Date.UTC(2026, 0, 1) + day * 864e5;

  it('بطاقة الترشيح للمشارك بلا تقييم أصلًا، والواجهة لا تعرض نجومًا', () => {
    const src = read('supabase/functions/leaders-api/experts.ts');
    const card = src.slice(src.indexOf('const publicCard'), src.indexOf('});', src.indexOf('const publicCard')));
    expect(card).not.toMatch(/rating/);
    expect(read('leaders-app/src/screens/ChooseExpert.jsx')).not.toMatch(/★|e\.rating/);
  });
  it('قبل MIN_RATINGS لا ملخص، ويُعرف العدد والحد وحدهما', () => {
    expect(expertOwnRating([r(1, 5), r(2, 4)], keys, now(3))).toEqual({ visible: false, count: 2, min: MIN_RATINGS });
  });
  it('الملخص الأول عند بلوغ الحد، ثم لا يتحرك مع تقييم جديد قبل اجتماع 5 جديدة ومضي الشهر', () => {
    const five = [1, 2, 3, 4, 5].map((d) => r(d, 5));
    const first = expertOwnRating(five, keys, now(6));
    expect(first).toMatchObject({ visible: true, avg: 5, count: 5, pending: 0 });
    // تقييم سيئ صباح اليوم التالي: الملخص لا يتغير، فلا يُستدل منه على صاحبه
    const next = expertOwnRating([...five, r(6, 1)], keys, now(7));
    expect(next).toMatchObject({ avg: 5, count: 5, pending: 1 });
    // خمسة جديدة في أسبوع: لا تحديث قبل مضي RATING_WINDOW_DAYS
    const ten = [...five, ...[6, 7, 8, 9, 10].map((d) => r(d, 3))];
    expect(expertOwnRating(ten, keys, now(20))).toMatchObject({ count: 5, pending: 5 });
    // بعد الشهر يتحدث بالعشرة كلها
    expect(expertOwnRating(ten, keys, now(5 + RATING_WINDOW_DAYS + 1))).toMatchObject({ count: 10, avg: 4, pending: 0 });
    // مضي الشهر وحده لا يكفي: تقييمان جديدان لا يحدّثان الملخص
    expect(expertOwnRating([...five, r(40, 1), r(41, 1)], keys, now(60))).toMatchObject({ count: 5, pending: 2 });
  });
  it('المعايير مقربة إلى نصف درجة', () => {
    const x = expertOwnRating([r(1, 5, 5), r(2, 4, 4), r(3, 4, 4), r(4, 4, 4), r(5, 4, 4)], keys, now(6));
    expect(x.criteria).toEqual({ useful: 4, clear: 4, punctual: 4 });
    expect(expertOwnRating([5, 5, 4, 4, 4].map((v, i) => r(i, v, v)), keys, now(6)).criteria.useful).toBe(4.5);
  });
  it('تنبيه الإدارة حين يهبط متوسط آخر 5 تحت 3.5', () => {
    const old = [1, 2, 3, 4, 5].map((d) => r(d, 5));
    expect(ratingDrop(old)).toBeNull();
    expect(ratingDrop([...old, ...[6, 7, 8, 9, 10].map((d) => r(d, 3))])).toEqual({ avg: 3, last: RATING_DROP.last });
    expect(ratingDrop([r(1, 1), r(2, 1)])).toBeNull();
  });
  it('لوحة الخبير تقرأ الملخص الدوري، والإدارة ترى التنبيه', () => {
    expect(read('supabase/functions/leaders-api/experts.ts')).toMatch(/rating: ratings\.own/);
    expect(read('admin-app/src/screens/Experts.jsx')).toMatch(/r\.drop/);
  });
});

describe('المرحلة 1: نموذج المقيّم', () => {
  const LIK = (rev = false) => [0, 1, 2, 3, 4].map((s) => ({ label: `x${s}`, score: rev ? 4 - s : s })).concat([{ label: 'لا ينطبق', score: -1 }]);
  const qs = [
    { id: 'a', code: 'M-B1', options: LIK() },
    { id: 'b', code: 'M-B5', options: LIK(true) },
    { id: 'c', code: 'I-B3', options: LIK(), observable_by: ['self', 'manager'] },
    { id: 'd', code: 'L-B5', options: LIK(true), observable_by: ['self'] },
    { id: 'e', code: 'X', options: LIK(true), observable_by: ['peer'] },
  ];
  it('المعكوسة تُعرف بترتيب درجاتها ولا تُعرض على المقيّم ولو لم يُطبَّق العمود', () => {
    expect(reversedItem(qs[0])).toBe(false);
    expect(reversedItem(qs[1])).toBe(true);
    expect(raterItems(qs, 'peer').map((q) => q.id)).toEqual(['a', 'e']);
    expect(raterItems(qs, 'manager').map((q) => q.id)).toEqual(['a', 'c']);
  });
  it('الأسئلة المفتوحة مقصوصة بحدها، وخلوّها null', () => {
    expect(cleanOpenAnswers({ continue: '  يلخص  ', start: '', hack: 'x', stop: 'ت'.repeat(900) })).toEqual({ continue: 'يلخص', stop: 'ت'.repeat(FEEDBACK_OPEN_MAX) });
    expect(cleanOpenAnswers({ continue: '  ' })).toBeNull();
    expect(cleanOpenAnswers(null)).toBeNull();
    expect(CONTACT_FREQ).toEqual(['weekly', 'monthly', 'less']);
  });
  it('الخادم يعرض عبارات مجموعة المقيّم ويلزم سؤال الصلة، ويكتب كتابة متسامحة قبل الترحيل', () => {
    const src = read('supabase/functions/leaders-api/impact.ts');
    expect(src).toMatch(/return raterItems\(qs, relation\)/);
    expect((src.match(/raterQuestions\(r\.instrument_id, r\.relation\)/g) || []).length).toBe(2);
    expect(src).toMatch(/if \(!contact_freq\) throw new Fail/);
    expect(src).toMatch(/missingColumn\(saved\.error\)/);
  });
  it('نموذج المقيّم: دليل قبل البدء، وسؤال الصلة، والأسئلة الثلاثة', () => {
    const ui = read('leaders-app/src/screens/Rater.jsx');
    expect(ui).toContain('قبل أن تبدأ');
    expect(ui).toContain('كم مرة ترى عمله؟');
    expect(ui).toMatch(/FEEDBACK_OPEN_AR/);
    expect(ui).toMatch(/contact_freq: contact, open/);
  });
  it('الترحيل متسامح، ويعلّم المعكوسة والمشهودة، ولا يمس ما حرّرته الإدارة، وإعادته آمنة', async () => {
    const NAME = '20261111130000_leaders_feedback360_rater_form';
    const SQL = read(`supabase/migrations/${NAME}.sql`);
    expect(gateOf(SQL, NAME).gate).toBe('tolerant');
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.questions (id text primary key, code text, tier text);
      create table leaders.raters (id text primary key);
      insert into leaders.questions values ('1','M-B5','behavior'),('2','I-B3','behavior'),('3','M-B3','behavior'),('4','M-B1','behavior'),('5','L-B5','knowledge');`);
    await db.exec(SQL);
    await db.exec(`update leaders.questions set observable_by = array['self','peer'] where id = '2';`);
    await db.exec(SQL);
    const { rows } = await db.query('select id, observable_by from leaders.questions order by id');
    expect(rows.map((r) => r.observable_by)).toEqual([['self'], ['self', 'peer'], ['self', 'manager', 'stakeholder'], null, null]);
    await expect(db.exec(`insert into leaders.raters (id, contact_freq) values ('r', 'daily')`)).rejects.toThrow();
    await expect(db.exec(`update leaders.questions set observable_by = array['boss'] where id = '4'`)).rejects.toThrow();
    expect((await db.query(`select 1 from leaders.schema_migrations where name = '${NAME}'`)).rows).toHaveLength(1);
  });
});

describe('المرحلة 2: الدورة والمجموعات', async () => {
  const F = await import('../../supabase/functions/leaders-api/feedback360.js');
  const { DEFAULTS } = await import('../../supabase/functions/leaders-api/settings.js');
  const S = DEFAULTS.feedback360;
  const nom = (relation, status = 'nominated') => ({ relation, status });
  it('السقوف من الإعدادات، والمدير واحد', () => {
    expect(F.groupCaps(S)).toEqual({ manager: 1, peer: S.max_peer, report: S.max_report, stakeholder: S.max_stakeholder });
    expect(F.groupCaps({ ...S, max_peer: 9 }).peer).toBe(9);
  });
  it('القائمة تحتاج min_others من غير المدير وتقديرًا ذاتيًا، ولا تتجاوز سقفًا', () => {
    expect(F.nominationCheck([nom('manager'), nom('peer'), nom('peer')], S)).toMatchObject({ ok: false, reason: 'too_few', need: 1 });
    expect(F.nominationCheck([nom('peer'), nom('report'), nom('stakeholder')], S).ok).toBe(true);
    expect(F.nominationCheck([nom('peer'), nom('report'), nom('stakeholder')], S, { selfDone: false }).reason).toBe('self');
    expect(F.nominationCheck([nom('manager'), nom('manager'), nom('peer'), nom('peer'), nom('peer')], S).reason).toBe('over_cap');
    expect(F.nominationCheck([nom('peer'), nom('peer'), nom('peer')], { ...S, min_others: 4, min_group: 3 }).need).toBe(1);
  });
  it('الأعداد لكل مجموعة بلا أسماء، والملغى لا يُعد', () => {
    const c = F.groupCounts([nom('peer', 'invited'), nom('peer', 'submitted'), nom('peer', 'revoked'), nom('manager', 'submitted')]);
    expect(c.peer).toEqual({ invited: 2, submitted: 1 });
    expect(c.manager).toEqual({ invited: 1, submitted: 1 });
    expect(Object.keys(c.peer)).toEqual(['invited', 'submitted']);
  });
  it('الموجة الثانية بعد إغلاق الأولى بالفاصل المضبوط', () => {
    const now = Date.parse('2026-11-12T00:00:00Z');
    expect(F.nextWave([], S, now)).toEqual({ ok: true, wave: 't1' });
    expect(F.nextWave([{ wave: 't1', status: 'open' }], S, now).reason).toBe('t1_running');
    const t1 = { wave: 't1', status: 'released', closed_at: '2026-10-01T00:00:00Z' };
    expect(F.nextWave([t1], S, now)).toMatchObject({ ok: false, reason: 'gap' });
    expect(F.nextWave([t1], { ...S, round_gap_days: 30 }, now)).toEqual({ ok: true, wave: 't2' });
    expect(F.nextWave([t1, { wave: 't2', status: 'open' }], S, now).reason).toBe('done');
    expect(F.nextWave([{ wave: 't1', status: 'cancelled' }], S, now).wave).toBe('t1');
  });
  it('التذكير في أيامه المضبوطة مرة واحدة لكل يوم', () => {
    const c = { status: 'open', opens_at: '2026-11-01T00:00:00Z', reminded_days: [] };
    const at = (d) => Date.parse('2026-11-01T00:00:00Z') + d * 864e5;
    expect(F.remindersDue(c, S, at(4))).toEqual([]);
    expect(F.remindersDue(c, S, at(5))).toEqual([5]);
    expect(F.remindersDue({ ...c, reminded_days: [5] }, S, at(11))).toEqual([10]);
    expect(F.remindersDue(c, { ...S, remind_days: [2] }, at(3))).toEqual([2]);
    expect(F.remindersDue({ ...c, status: 'closed' }, S, at(11))).toEqual([]);
  });
  it('وعد الإخفاء: المدير باسم دوره، وغيره مجمّعًا بحد الإعدادات', () => {
    expect(F.feedbackPromiseAr('manager', S)).toMatch(/باسم دورك/);
    expect(F.feedbackPromiseAr('peer', S)).toMatch(/مقيّمَين آخرين/);
    expect(F.feedbackPromiseAr('peer', { ...S, min_group: 5 })).toMatch(/4 مقيّمين آخرين/);
  });

  const srv = read('supabase/functions/leaders-api/feedback360.ts');
  const imp = read('supabase/functions/leaders-api/impact.ts');
  it('الخادم يعيد استعمال بنية المقيّمين: التحقق من النطاق والبريد بمرجع المقيّم وحصته والسجل', () => {
    expect(srv).toMatch(/import \{ raterCheck, RELATION_AR \} from '\.\/impact\.ts';/);
    expect(srv).toMatch(/await raterCheck\(p, email\)/);
    expect(srv).toMatch(/raterMail\(r\.full_name, p\.full_name \|\| 'زميلك', link, 'f360'/);
    expect(srv.match(/\{ kind: 'bulk', ref: `rater:\$\{r\.id\}` \}/g)).toHaveLength(2);
    expect(srv).toMatch(/const s = \(await appSettings\(\)\)\.feedback360;/);
    // لا رقم من الحدود في الخادم: كلها من الإعدادات
    expect(srv).not.toMatch(/min_group: \d|window_days: \d|\* 14|\[5, 10\]/);
  });
  it('المستشار الفعلي وحده يعتمد القائمة، واعتماده تأكيد D19 لكل بريد', () => {
    expect(srv).toMatch(/async function requireEffectiveAdvisor[\s\S]{0,400}const adv = p \? await advisorOf\(p as any\) : null;\s*if \(!p \|\| adv\?\.id !== e\.id\) throw new Fail\('أنت لست مستشار هذا المشارك', 403/);
    expect(srv).toMatch(/verification: 'confirmed', verified_by: who/);
    expect(srv).toMatch(/if \(\(await advisorOf\(c\.participants\)\)\?\.id !== e\.id\) continue;/);
  });
  it('المشارك يرى قائمته قبل الفتح وأعدادًا بعده', () => {
    expect(srv).toMatch(/const before = \['nominating', 'approval'\]\.includes\(c\.status\);[\s\S]{0,400}nominees: before \?/);
  });
  it('قياس الأثر لا يقرأ مقيّمي 360، والمرشح بلا رابط، وE-MGR للبعدي وحده', () => {
    expect(imp).toMatch(/export const IMPACT_PHASES = \['pre', 'post'\];/);
    expect(imp.match(/\.in\('phase', IMPACT_PHASES\)/g)).toHaveLength(4);
    expect(imp).toMatch(/r\.status === 'nominated'\) throw new Fail\('الرابط غير صالح أو أُلغي'/);
    expect(imp).toMatch(/if \(r\.relation === 'manager' && r\.phase === 'post'\)/);
    expect(imp).toMatch(/const pre = r\.phase !== 'post';/);
  });
  it('مراسي السلم ووعد الإخفاء للمقيّم من الإعدادات', () => {
    expect(imp).toMatch(/const f360 = r\.phase === 'f360' \? \(await appSettings\(\)\)\.feedback360 : null;/);
    expect(imp).toMatch(/f360\.scale_labels\[Number\(o\.score\)\]/);
    expect(imp).toMatch(/promise: feedbackPromiseAr\(r\.relation, f360\)/);
  });
  it('360 للتطوير وحده: لا يقرؤه التقييم الختامي ولا الشهادة ولا التقييم المستمر ولا تقرير الأثر', () => {
    for (const f of ['final.js', 'final.ts', 'certificates.ts', 'continuous.js', 'logic.js']) {
      expect(read(`supabase/functions/leaders-api/${f}`), f).not.toMatch(/feedback_cycles|feedback360|'f360'/);
    }
  });
  it('الأفعال موصولة، والمهمة الساعية تذكّر وتغلق', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    for (const a of ['f360.mine', 'f360.start', 'f360.self', 'f360.nominate', 'f360.remove', 'f360.submit', 'xp.f360', 'xp.f360-decide', 'admin.f360']) expect(idx).toContain(`'${a}':`);
    expect(idx).toMatch(/'admin\.f360-close': \(a, b\) => A\.writer\(a, FB\.adminClose, b\)/);
    expect(idx).toMatch(/feedback360: await FB\.sweep\(\)/);
  });
  it('الترحيل: الدورة والقيود وتفرد المقيّم بدورته، وإعادته آمنة', async () => {
    const NAME = '20261111130200_leaders_feedback_cycles';
    const SQL = read(`supabase/migrations/${NAME}.sql`);
    expect(gateOf(SQL, NAME).gate).toBe('tolerant');
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create role anon; create role authenticated;
      create table leaders.participants (id uuid primary key); create table leaders.instruments (id uuid primary key); create table leaders.coaching_sessions (id uuid primary key);
      create table leaders.raters (id uuid primary key default gen_random_uuid(), participant_id uuid, email text, phase text default 'post', relation text default 'manager', status text default 'invited',
        constraint raters_participant_email_phase_key unique (participant_id, email, phase));
      insert into leaders.participants values ('00000000-0000-4000-8000-000000000001'); insert into leaders.instruments values ('00000000-0000-4000-8000-0000000000aa');`);
    await db.exec(SQL);
    await db.exec(SQL);
    const P = "'00000000-0000-4000-8000-000000000001'", I = "'00000000-0000-4000-8000-0000000000aa'";
    const { rows: [c1] } = await db.query(`insert into leaders.feedback_cycles (participant_id, wave, instrument_id) values (${P}, 't1', ${I}) returning id`);
    const { rows: [c2] } = await db.query(`insert into leaders.feedback_cycles (participant_id, wave, instrument_id) values (${P}, 't2', ${I}) returning id`);
    await expect(db.exec(`insert into leaders.feedback_cycles (participant_id, wave, instrument_id) values (${P}, 't1', ${I})`)).rejects.toThrow();
    // المقيّم نفسه في الموجتين، ومقيّم الأثر كما كان
    await db.exec(`insert into leaders.raters (participant_id, email, phase, relation, status, cycle_id) values (${P}, 'a@x.sa', 'f360', 'stakeholder', 'nominated', '${c1.id}'), (${P}, 'a@x.sa', 'f360', 'peer', 'nominated', '${c2.id}')`);
    await db.exec(`insert into leaders.raters (participant_id, email, phase) values (${P}, 'a@x.sa', 'post')`);
    await expect(db.exec(`insert into leaders.raters (participant_id, email, phase, cycle_id) values (${P}, 'a@x.sa', 'f360', '${c1.id}')`)).rejects.toThrow();
    await expect(db.exec(`insert into leaders.raters (participant_id, email, phase) values (${P}, 'a@x.sa', 'post')`)).rejects.toThrow();
    // f360 بلا دورة، أو دورة لغير f360: مرفوض
    await expect(db.exec(`insert into leaders.raters (participant_id, email, phase) values (${P}, 'b@x.sa', 'f360')`)).rejects.toThrow();
    await expect(db.exec(`update leaders.feedback_cycles set status = 'done'`)).rejects.toThrow();
    expect((await db.query(`select 1 from leaders.schema_migrations where name = '${NAME}'`)).rows).toHaveLength(1);
  });
});

describe('المرحلة 3: التقرير والاستلام', async () => {
  const F = await import('../../supabase/functions/leaders-api/feedback360.js');
  const { DEFAULTS } = await import('../../supabase/functions/leaders-api/settings.js');
  const S = DEFAULTS.feedback360;
  const opts = [0, 1, 2, 3, 4].map((score) => ({ score })).concat([{ score: -1 }]);
  const q = (id, dimension, extra = {}) => ({ id, dimension, text_rater_ar: `عبارة ${id}`, options: opts, ...extra });
  const items = [q('m1', 'milestone'), q('m2', 'milestone'), q('i1', 'impact'), q('l1', 'leadership'), q('l2', 'leadership')];
  // k = الدرجة المخزنة (0..4) فالقيمة على السلم k + 1، و5 = لا أستطيع الحكم
  const rater = (relation, ks, extra = {}) => ({ relation, status: 'submitted', answers: Object.fromEntries(Object.entries(ks).map(([id, k]) => [id, { now: k }])), ...extra });
  const all = (k) => Object.fromEntries(items.map((x) => [x.id, k]));
  const self = { m1: 4, m2: 1, i1: 2, l1: 2, l2: 2 };

  it('لا تقرير بأقل من min_others من غير المدير، ويُقال كم ينقص', () => {
    const r = F.feedbackReport({ items, selfAnswers: self, raters: [rater('manager', all(3)), rater('peer', all(3)), rater('peer', all(3))], s: S });
    expect(r).toMatchObject({ releasable: false, need: 1 });
    expect(r.items).toBeUndefined();
  });
  it('المدير باسم دوره، والمجموعة دون الحد تُجمع في «آخرون» إن بلغته', () => {
    const raters = [rater('manager', all(2)), rater('peer', all(3)), rater('peer', all(3)), rater('peer', all(3)), rater('report', all(1)), rater('stakeholder', all(2)), rater('stakeholder', all(2))];
    const r = F.feedbackReport({ items, selfAnswers: self, raters, s: S, seed: 'c' });
    expect(r.columns.map((c) => c.key)).toEqual(['manager', 'peer', 'others', 'all']);
    expect(r.columns.find((c) => c.key === 'others')).toMatchObject({ n: 3, merged: ['أعضاء الفريق', 'أصحاب المصلحة'] });
    expect(r.dims.find((d) => d.dimension === 'milestone').cells).toMatchObject({ manager: { avg: 3 }, peer: { avg: 4 }, others: { avg: 2.7 } });
  });
  it('ما دون الحد ولا يبلغه مجموعًا يُضم إلى أكبر مجموعة ظاهرة، فلا يُستنتج بالطرح', () => {
    const raters = [rater('peer', all(3)), rater('peer', all(3)), rater('peer', all(3)), rater('report', all(0))];
    const r = F.feedbackReport({ items, selfAnswers: self, raters, s: S });
    expect(r.columns.map((c) => c.key)).toEqual(['peer', 'all']);
    expect(r.columns[0]).toMatchObject({ n: 4, merged: ['أعضاء الفريق'] });
    expect(r.columns[0].label_ar).toMatch(/ومن ضُمّ إليهم/);
  });
  it('خلية العبارة تُحجب إن قلّ من قدّرها عن الحد، و«كل المقيّمين» يحتاج الحد من غير المدير', () => {
    const na = { ...all(3), l2: 5 };
    const raters = [rater('manager', all(4)), rater('peer', all(3)), rater('peer', all(3)), rater('peer', na)];
    const r = F.feedbackReport({ items, selfAnswers: self, raters, s: S });
    const l2 = r.items.find((x) => x.id === 'l2');
    expect(l2.cells.peer).toBeNull();
    expect(l2.cells.all).toBeNull();
    expect(l2.cells.manager).toMatchObject({ avg: 5 });
    expect(l2.na).toBe(1);
  });
  it('القوة الخفية والنقطة العمياء بفرق الإعدادات، والأعلى والأدنى بلا تداخل', () => {
    const raters = [rater('peer', all(2)), rater('peer', all(2)), rater('peer', all(2))];
    const r = F.feedbackReport({ items, selfAnswers: self, raters, s: S });
    expect(r.blind.map((x) => x.id)).toEqual(['m1']);
    expect(r.strengths.map((x) => x.id)).toEqual(['m2']);
    expect(r.blind[0]).toMatchObject({ self: 5, others: 3, diff: -2 });
    const wide = F.feedbackReport({ items, selfAnswers: self, raters, s: { ...S, gap_points: 2 } });
    expect(wide.strengths).toEqual([]);
    expect(wide.blind.map((x) => x.id)).toEqual(['m1']);
    expect(new Set([...r.top, ...r.bottom].map((x) => x.id)).size).toBe(r.top.length + r.bottom.length);
  });
  it('الملاحظات حرفية بلا نسبة، بترتيب ثابت لا يتبع الإرسال، والمحجوبة لا تظهر', () => {
    const raters = ['أ', 'ب', 'ج', 'د'].map((t, i) => rater('peer', all(2), { open_answers: { continue: `ملاحظة ${t}` }, comment_hidden: i === 3 }));
    const r1 = F.feedbackReport({ items, selfAnswers: self, raters, s: S, seed: 'c1' });
    const r2 = F.feedbackReport({ items, selfAnswers: self, raters: [...raters].reverse(), s: S, seed: 'c1' });
    expect(r1.comments.continue).toHaveLength(3);
    expect(r1.comments.continue).not.toContain('ملاحظة د');
    expect(r1.comments.continue).toEqual(r2.comments.continue);
    expect(JSON.stringify(r1.comments)).not.toMatch(/peer|relation|email/);
  });
  it('الموجة الثانية تحمل أرقام الأولى لكل إطار', () => {
    const raters = [rater('peer', all(1)), rater('peer', all(1)), rater('peer', all(1))];
    const previous = F.feedbackReport({ items, selfAnswers: self, raters, s: S });
    const r = F.feedbackReport({ items, selfAnswers: self, raters: raters.map((x) => ({ ...x, answers: Object.fromEntries(items.map((y) => [y.id, { now: 3 }])) })), s: S, previous });
    expect(r.dims.find((d) => d.dimension === 'impact')).toMatchObject({ prev: { all: 2 }, cells: { all: { avg: 4 } } });
  });
  it('المعكوسة لا تدخل التقرير', () => {
    const rev = q('m5', 'milestone', { options: [4, 3, 2, 1, 0].map((score) => ({ score })) });
    expect(F.reportItems([...items, rev, q('x', 'impact', { observable_by: ['self'] })]).map((x) => x.id)).toEqual(items.map((x) => x.id));
  });
  it('الجهة: أعداد ونسبة استجابة، والمتوسطات فوق org_min وحده', () => {
    const one = F.feedbackReport({ items, selfAnswers: self, raters: [rater('peer', all(2)), rater('peer', all(2)), rater('peer', all(2))], s: S });
    expect(F.orgTotals([one, one], S)).toMatchObject({ reports: 2, dims: null, invited: 6, submitted: 6, response_pct: 100 });
    const t = F.orgTotals(Array(S.org_min).fill(one), S);
    expect(t.dims.find((d) => d.dimension === 'impact')).toEqual({ dimension: 'impact', self: 3, all: 3 });
    expect(JSON.stringify(t)).not.toMatch(/items|comments/);
  });

  const srv = read('supabase/functions/leaders-api/feedback360.ts');
  it('المشارك لا يرى تقريره قبل أن يسلّمه المستشار، والمستشار الفعلي وحده يسلّم ويُسجَّل اطلاعه', () => {
    expect(srv).toMatch(/if \(c\.status !== 'released'\) throw new Fail\('يسلّمك مستشارك تقريرك في جلسة التوجيه/);
    expect(srv.match(/const c = await cycleById\(b\.cycle_id\);\n  const p = await requireEffectiveAdvisor\(e, c\.participant_id\);/g)).toHaveLength(2);
    expect(srv).toMatch(/audit\('system', `expert:\$\{e\.email\}`, 'expert\.f360-report-view'/);
    expect(srv).toMatch(/status: 'released', released_by: `expert:\$\{e\.email\}`/);
  });
  it('اطلاع الإدارة على تقرير فرد للمدير ذي الكتابة ويُسجَّل، والجهة مجموع لا فرد', () => {
    expect(srv).toMatch(/export async function adminReport\(a: Admin, b: Body\) \{\n  requireWrite\(a\);/);
    expect(srv).toMatch(/audit\('admin', a\.email, 'admin\.f360-report-view'/);
    const coord = read('supabase/functions/leaders-api/coordinator.ts');
    expect(coord).toMatch(/r\.feedback360 = coordPermissions\(c\.permissions\)\.scores \? await orgFeedback\(/);
    expect(srv).toMatch(/return orgTotals\(reports, s\);/);
  });
  it('مصدر واحد للتقرير: الشاشات الثلاث تعرض ناتج feedbackReport بمكوّن واحد', () => {
    expect(srv.match(/feedbackReport\(/g).length).toBe(2);
    for (const f of ['leaders-app/src/screens/Feedback360.jsx', 'leaders-app/src/screens/Advisor360.jsx', 'admin-app/src/screens/Feedback360.jsx']) {
      expect(read(f), f).toMatch(/from '\.\.\/\.\.\/\.\.\/src\/lib\/Report360\.jsx';/);
    }
    expect(read('src/lib/Report360.jsx')).not.toMatch(/avg\s*[=:]\s*[^>]*reduce|min_group/);
  });
});
